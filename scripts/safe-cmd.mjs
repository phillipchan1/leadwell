/**
 * Safe subprocess + error logging for public-repo cutover.
 * Never echo raw stdout/stderr. Failure text is the command name, exit
 * code, SQLSTATE if present, and either the ERROR line cut before the
 * first quoted value or a fixed message for the SQLSTATE class.
 */
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { basename } from "node:path";
import { libpqCleanEnv, redactSecrets } from "./loopback.mjs";
import { assertSafeMigrateLog, logLooksLikeRowData } from "./guard-public-ci.mjs";
import { CHECKSUM_TABLES, DEFAULT_SUPABASE_ROLES, TARGET_COPY_ROLE } from "./migrate-users.lib.mjs";

export const GENERIC_SAFE_ERROR = "command failed (details omitted; log looked like row data)";

/** Fixed text per SQLSTATE class — used when the ERROR line has no safe cut. */
export const SQLSTATE_CLASS_MESSAGES = Object.freeze({
  "08": "connection exception",
  22: "data exception",
  23: "integrity constraint violation",
  28: "invalid authorization",
  40: "transaction rollback",
  42: "syntax error or access rule violation",
  53: "insufficient resources",
  57: "operator intervention",
  P0: "plpgsql error",
  XX: "internal error",
});

/** Postgres NAMEDATALEN-1. Longer tokens are never printed as names. */
export const SAFE_ERROR_IDENT_MAX = 63;

/**
 * Names that may appear after a known-safe error phrase. Dump/public
 * tables, stub auth objects, the copy role, and the three Supabase stubs.
 */
export const SAFE_ERROR_NAME_ALLOWLIST = Object.freeze(
  new Set([
    ...CHECKSUM_TABLES,
    ...DEFAULT_SUPABASE_ROLES,
    TARGET_COPY_ROLE,
    "auth",
    "users",
    "identities",
    "public",
  ]),
);

export function sqlstateClassMessage(sqlstate) {
  if (!sqlstate) return "query failed";
  const cls = String(sqlstate).slice(0, 2).toUpperCase();
  return SQLSTATE_CLASS_MESSAGES[cls] ?? "query failed";
}

export function extractSqlstate(text) {
  const s = String(text);
  return (
    s.match(/\bSQLSTATE[:\s]+([0-9A-Z]{5})\b/i)?.[1] ??
    s.match(/\bERROR:\s+([0-9A-Z]{5})\b/)?.[1] ??
    null
  );
}

/** Line-anchored ERROR / pg_dump|pg_restore error. Ignores mid-line "error:". */
export const PG_ERROR_LINE_RE = /^(?:psql:[^:\n]*:\d+: )?ERROR:|^pg_(?:dump|restore): error:/im;

/** Only this pg_restore shape is eligible for phrase matching. */
export const PG_RESTORE_QUERY_ERROR_RE = /^pg_restore: error: could not execute query: ERROR:/i;

export const PSQL_SQLSTATE_VERBOSITY_ARGS = Object.freeze(["-v", "VERBOSITY=sqlstate"]);

/**
 * Always force `-v VERBOSITY=sqlstate` for psql. Caller overrides are
 * stripped so a terse/default setting cannot hide SQLSTATE or keep
 * DETAIL/CONTEXT on the wire.
 */
export function withPsqlSqlstateVerbosity(cmd, args = []) {
  const name = basename(String(cmd || "").split(/\s+/)[0] || "");
  const list = Array.isArray(args) ? [...args] : [];
  if (name !== "psql") return list;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const t = String(list[i]);
    if (t === "-v" && /^VERBOSITY=/i.test(String(list[i + 1] || ""))) {
      i += 1;
      continue;
    }
    if (/^--set=VERBOSITY=/i.test(t) || /^-vVERBOSITY=/i.test(t)) continue;
    out.push(list[i]);
  }
  return [...PSQL_SQLSTATE_VERBOSITY_ARGS, ...out];
}

/**
 * ERROR: prefix plus text up to the first `: "` or `: '` after ERROR:.
 * Returns null when there is no such cut (caller uses the SQLSTATE class).
 */
export function cutErrorLineAtQuotedValue(text) {
  const s = String(text ?? "");
  const m = s.match(PG_ERROR_LINE_RE);
  if (!m || m.index == null) return null;
  const fromError = s.slice(m.index).split(/\r?\n/, 1)[0];
  const standalone = fromError.match(/(?:^psql:[^:\n]*:\d+: )?(ERROR:)/);
  let head;
  let headAt;
  if (standalone && standalone.index != null) {
    head = standalone[1];
    headAt = standalone.index + standalone[0].length - standalone[1].length;
  } else {
    const pg = fromError.match(/^pg_(?:dump|restore): error:/i);
    if (!pg) return null;
    head = pg[0];
    headAt = 0;
  }
  const rest = fromError.slice(headAt + head.length);
  const cutDq = rest.indexOf(': "');
  const cutSq = rest.indexOf(": '");
  const cuts = [cutDq, cutSq].filter((i) => i >= 0);
  if (!cuts.length) return null;
  const cut = Math.min(...cuts);
  return `${head}${rest.slice(0, cut)}`.replace(/\r?\n[\s\S]*$/, "").trimEnd();
}

/** Identifier in a known-safe Postgres phrase: word or dotted, optional quotes. */
const SAFE_IDENT = String.raw`(?:"[^"]+"|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)`;

const SAFE_ERROR_PHRASE_RES = Object.freeze([
  {
    re: new RegExp(`permission denied for (table|schema|sequence|function) (${SAFE_IDENT})\\s*$`, "i"),
    format: (m, ident) =>
      ident ? `permission denied for ${m[1].toLowerCase()} ${ident}` : `permission denied for ${m[1].toLowerCase()}`,
  },
  {
    re: new RegExp(`role (${SAFE_IDENT}) does not exist\\s*$`, "i"),
    format: (_m, ident) => (ident ? `role "${ident}" does not exist` : "role does not exist"),
  },
  {
    re: new RegExp(`schema (${SAFE_IDENT}) does not exist\\s*$`, "i"),
    format: (_m, ident) => (ident ? `schema ${ident} does not exist` : "schema does not exist"),
  },
  {
    re: new RegExp(
      `must be owner of(?: (?:table|schema|sequence|function|relation))? (${SAFE_IDENT})\\s*$`,
      "i",
    ),
    format: (_m, ident) => (ident ? `must be owner of ${ident}` : "must be owner of"),
  },
  {
    re: new RegExp(`relation (${SAFE_IDENT}) does not exist\\s*$`, "i"),
    format: (_m, ident) => (ident ? `relation "${ident}" does not exist` : "relation does not exist"),
  },
]);

function phraseLineBody(line) {
  const s = String(line ?? "");
  if (PG_RESTORE_QUERY_ERROR_RE.test(s)) {
    return s.replace(PG_RESTORE_QUERY_ERROR_RE, "").replace(/^\s+/, "");
  }
  const psql = s.match(/^(?:psql:[^:\n]*:\d+: )?ERROR:\s*(.*)$/);
  return psql ? psql[1] : null;
}

/**
 * First ERROR line that may carry a known-safe phrase.
 * pg_restore: only `could not execute query: ERROR:`. Other pg_restore
 * / pg_dump error lines are not scanned for phrases.
 */
export function firstPhraseErrorLine(text) {
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (PG_RESTORE_QUERY_ERROR_RE.test(line)) return line;
    if (/^pg_restore: error:/i.test(line)) return null;
    if (/^(?:psql:[^:\n]*:\d+: )?ERROR:/.test(line)) return line;
  }
  return null;
}

function allowlistedIdent(raw) {
  const name = String(raw ?? "").replaceAll('"', "");
  if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(name)) return null;
  const parts = name.split(".");
  if (parts.some((p) => p.length === 0 || p.length > SAFE_ERROR_IDENT_MAX)) return null;
  if (parts.every((p) => SAFE_ERROR_NAME_ALLOWLIST.has(p))) return name;
  return "";
}

/**
 * Phrase + optional allowlisted identifier, from the first ERROR line
 * only, anchored at the end of that line. Returns null when the line is
 * not one of those shapes.
 */
export function extractSafeErrorPhrase(text) {
  const line = firstPhraseErrorLine(text);
  if (!line) return null;
  const body = phraseLineBody(line);
  if (body == null) return null;
  for (const { re, format } of SAFE_ERROR_PHRASE_RES) {
    const m = body.match(re);
    if (!m) continue;
    const ident = allowlistedIdent(m[2] ?? m[1]);
    if (ident == null) continue;
    return format(m, ident);
  }
  return null;
}

/**
 * SQLSTATE plus a safe ERROR prefix (cut at the first quoted value) or a
 * fixed message for the SQLSTATE class. Never regex-strips values.
 * P0001 (plpgsql RAISE) always uses the class message — the RAISE text
 * can put a value before `: "` and still leak if we cut.
 * Known-safe phrases (permission denied, missing role/schema/relation)
 * log the phrase and an allowlisted identifier only.
 */
export function sanitizePgFailureText(text) {
  const raw = String(text ?? "");
  const sqlstate = extractSqlstate(raw);
  if (sqlstate && String(sqlstate).toUpperCase() === "P0001") {
    return { sqlstate, firstError: sqlstateClassMessage(sqlstate) };
  }
  const phrase = extractSafeErrorPhrase(raw);
  const cut = cutErrorLineAtQuotedValue(raw);
  const firstError = phrase ?? cut ?? (sqlstate ? sqlstateClassMessage(sqlstate) : "query failed");
  return { sqlstate, firstError };
}

/** If the text looks like row data, replace it with a generic message. */
export function safeLoggedMessage(text, label = "error") {
  const s = redactSecrets(String(text ?? ""));
  if (!s) return s;
  if (logLooksLikeRowData(s)) return GENERIC_SAFE_ERROR;
  try {
    assertSafeMigrateLog(s, label);
  } catch {
    return GENERIC_SAFE_ERROR;
  }
  return s;
}

export function safeErrorMessage(err) {
  if (err == null) return GENERIC_SAFE_ERROR;
  const msg = err instanceof Error ? err.message : String(err);
  return safeLoggedMessage(msg);
}

export function throwSafe(message) {
  throw new Error(safeLoggedMessage(message));
}

export function formatSafeCommandError(cmd, status, stderr, _stdout, redact = (s) => s) {
  const name = basename(String(cmd || "command").split(/\s+/)[0] || "command");
  const { sqlstate, firstError } = sanitizePgFailureText(stderr || "");
  const parts = [`${name} failed (${status})`];
  if (sqlstate) parts.push(`SQLSTATE ${sqlstate}`);
  if (firstError) parts.push(firstError);
  return safeLoggedMessage(redact(parts.join(": ")));
}

export function run(cmd, args = [], opts = {}) {
  const { env, redact = (s) => s, ...rest } = opts;
  const res = spawnSync(cmd, withPsqlSqlstateVerbosity(cmd, args), {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...rest,
    env: libpqCleanEnv(env ?? process.env),
  });
  if (res.status !== 0) {
    throw new Error(formatSafeCommandError(cmd, res.status, res.stderr, res.stdout, redact));
  }
  return res.stdout;
}

export function runToFile(cmd, args, file, opts = {}) {
  const { env, redact = (s) => s } = opts;
  const fd = openSync(file, "w");
  try {
    const res = spawnSync(cmd, withPsqlSqlstateVerbosity(cmd, args), {
      encoding: "utf8",
      stdio: ["ignore", fd, "pipe"],
      env: libpqCleanEnv(env ?? process.env),
    });
    if (res.status !== 0) {
      throw new Error(formatSafeCommandError(cmd, res.status, res.stderr, "", redact));
    }
  } finally {
    closeSync(fd);
  }
}

export function installSafeErrorHandlers({ exit = true } = {}) {
  const fail = (err) => {
    console.error(safeErrorMessage(err));
    if (exit) process.exit(1);
  };
  process.on("uncaughtException", fail);
  process.on("unhandledRejection", fail);
  return fail;
}
