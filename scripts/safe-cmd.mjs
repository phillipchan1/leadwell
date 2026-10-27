/**
 * Safe subprocess + error logging for public-repo cutover.
 * Never echo raw stdout/stderr. Failure text is the command name, exit
 * code, SQLSTATE if present, and the first ERROR line with values stripped.
 */
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { basename } from "node:path";
import { libpqCleanEnv, redactSecrets } from "./loopback.mjs";
import { assertSafeMigrateLog, logLooksLikeRowData } from "./guard-public-ci.mjs";

export const GENERIC_SAFE_ERROR = "command failed (details omitted; log looked like row data)";

/** Replace quoted literals, Key (...)=(...), and parenthesised value lists. */
export function stripPgErrorValues(line) {
  let s = String(line);
  s = s.replace(/\bKey\s*\([^)]*\)\s*=\s*\([^)]*\)/gi, "Key (...)");
  s = s.replace(/'(?:[^']|'')*'/g, "'…'");
  s = s.replace(/\$[A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z0-9_]*\$/g, "$$…$$");
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, '"…"');
  s = s.replace(/\([^)]*\)/g, "(…)");
  return s;
}

function isDroppedPgLine(line) {
  const s = String(line);
  if (/^\s*(DETAIL|CONTEXT|LINE|HINT|WHERE)\s*:/i.test(s)) return true;
  if (/Failing row contains/i.test(s)) return true;
  if (/^\s*Command was:/i.test(s)) return true;
  return false;
}

export function extractSqlstate(text) {
  const s = String(text);
  return (
    s.match(/\bSQLSTATE[:\s]+([0-9A-Z]{5})\b/i)?.[1] ??
    s.match(/\bERROR:\s+([0-9A-Z]{5})\b/)?.[1] ??
    null
  );
}

/** First ERROR / pg_restore error line, values stripped. Drop DETAIL and friends. */
export function sanitizePgFailureText(text) {
  const raw = String(text ?? "");
  const sqlstate = extractSqlstate(raw);
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() && !isDroppedPgLine(line));
  const errorLine =
    lines.find((line) => /^\s*(?:ERROR|pg_restore:\s*error):/i.test(line)) ??
    lines.find((line) => /ERROR:/i.test(line)) ??
    "";
  return { sqlstate, firstError: errorLine ? stripPgErrorValues(errorLine) : "" };
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
