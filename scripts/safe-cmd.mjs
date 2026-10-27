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

/**
 * ERROR: prefix plus text up to the first `: "` or `: '` after ERROR:.
 * Returns null when there is no such cut (caller uses the SQLSTATE class).
 */
export function cutErrorLineAtQuotedValue(text) {
  const s = String(text ?? "");
  const errorAt = s.search(/ERROR:/i);
  if (errorAt < 0) return null;
  const fromError = s.slice(errorAt).split(/\r?\n/, 1)[0];
  const head = fromError.match(/^ERROR:/i)?.[0] ?? "ERROR:";
  const rest = fromError.slice(head.length);
  const cutDq = rest.indexOf(': "');
  const cutSq = rest.indexOf(": '");
  const cuts = [cutDq, cutSq].filter((i) => i >= 0);
  if (!cuts.length) return null;
  const cut = Math.min(...cuts);
  return `${head}${rest.slice(0, cut)}`.replace(/\r?\n[\s\S]*$/, "").trimEnd();
}

/**
 * SQLSTATE plus a safe ERROR prefix (cut at the first quoted value) or a
 * fixed message for the SQLSTATE class. Never regex-strips values.
 */
export function sanitizePgFailureText(text) {
  const raw = String(text ?? "");
  const sqlstate = extractSqlstate(raw);
  const cut = cutErrorLineAtQuotedValue(raw);
  const firstError = cut ?? (sqlstate ? sqlstateClassMessage(sqlstate) : "query failed");
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

export function formatSafeCommandError(cmd, status, stderr, stdout, redact = (s) => s) {
  const name = basename(String(cmd || "command").split(/\s+/)[0] || "command");
  const { sqlstate, firstError } = sanitizePgFailureText(`${stderr || ""}\n${stdout || ""}`);
  const parts = [`${name} failed (${status})`];
  if (sqlstate) parts.push(`SQLSTATE ${sqlstate}`);
  if (firstError) parts.push(firstError);
  return safeLoggedMessage(redact(parts.join(": ")));
}

export function run(cmd, args = [], opts = {}) {
  const { env, redact = (s) => s, ...rest } = opts;
  const res = spawnSync(cmd, args, {
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
    const res = spawnSync(cmd, args, {
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
