#!/usr/bin/env node
/**
 * Force a CHECK violation whose failing row contains a runtime sentinel
 * in the value, then assert that sentinel is absent from docker logs
 * and from the sanitized error this job would print. current_setting
 * must be panic,panic,terse (any one missing fails). A leaky server
 * must show the sentinel; keeping only error_statement or only
 * verbosity must still leak. Never prints the sentinel, container
 * logs, or raw psql output.
 */
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { formatSafeCommandError } from "./safe-cmd.mjs";
import { SCRATCH_POSTGRES_CONTAINER } from "./scratch-postgres.mjs";
import { TARGET_PANIC_LOGGING_SQL } from "./migrate-users.lib.mjs";

/** CHECK so DETAIL is `Failing row contains (…, <sentinel>)`. */
export const QA2_GUARD_SETUP_SQL =
  "DROP TABLE IF EXISTS qa2_guard; " +
  "CREATE TABLE qa2_guard (" +
  "id int PRIMARY KEY, " +
  "note text NOT NULL, " +
  "CONSTRAINT qa2_guard_note_ok CHECK (note !~ '^QA2_')" +
  ")";

export const QA2_LOG_SETTINGS = Object.freeze([
  { name: "log_min_messages", panic: "panic", leaky: "warning" },
  { name: "log_min_error_statement", panic: "panic", leaky: "error" },
  { name: "log_error_verbosity", panic: "terse", leaky: "default" },
]);

export function qa2GuardInsertSql(sentinel) {
  const s = String(sentinel ?? "");
  if (!/^QA2_[0-9a-f]+$/.test(s)) throw new Error("container-log-guard: bad sentinel");
  return `INSERT INTO qa2_guard (id, note) VALUES (1, '${s}')`;
}

/** All three leaky, except `keepName` left at its panic/terse value. */
export function qa2SettingsSql(keepName = null) {
  const stmts = QA2_LOG_SETTINGS.map((s) => {
    const value = s.name === keepName ? s.panic : s.leaky;
    return `ALTER SYSTEM SET ${s.name} = ${value}`;
  });
  return `${stmts.join("; ")}; SELECT pg_reload_conf()`;
}

function done(code, message) {
  if (code === 0) console.log(message);
  else console.error(message);
  process.exit(code);
}

function docker(args, input) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input,
    stdio: input == null ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
}

function psql(sql) {
  return docker(
    [
      "exec",
      "-e",
      "PGPASSWORD=postgres",
      "-i",
      SCRATCH_POSTGRES_CONTAINER,
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    sql.endsWith(";") ? `${sql}\n` : `${sql};\n`,
  );
}

function newSentinel() {
  return `QA2_${randomBytes(16).toString("hex")}`;
}

function containerLog(logFile) {
  const logs = docker(["logs", SCRATCH_POSTGRES_CONTAINER]);
  writeFileSync(logFile, `${logs.stdout || ""}\n${logs.stderr || ""}`);
  return readFileSync(logFile, "utf8");
}

function fireCheck(sentinel, logFile) {
  const insert = psql(qa2GuardInsertSql(sentinel));
  if (insert.status === 0) done(1, "container-log-guard: constraint error did not fire");
  const visible = formatSafeCommandError(
    "psql",
    insert.status ?? 1,
    insert.stderr || "",
    insert.stdout || "",
  );
  return { insert, visible, log: containerLog(logFile) };
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), "polarch-pglog-"));
  const logFile = join(dir, "container.log");
  const finish = (code, message) => {
    rmSync(dir, { recursive: true, force: true });
    done(code, message);
  };

  const setup = psql(QA2_GUARD_SETUP_SQL);
  if (setup.status !== 0) finish(1, "container-log-guard: setup failed");

  const shown = psql(
    "SELECT current_setting('log_min_messages') || ',' || " +
      "current_setting('log_min_error_statement') || ',' || " +
      "current_setting('log_error_verbosity')",
  );
  if (shown.status !== 0 || String(shown.stdout || "").trim() !== "panic,panic,terse") {
    finish(1, "container-log-guard: panic settings missing");
  }

  const sentinel = newSentinel();
  const first = fireCheck(sentinel, logFile);
  if (first.log.includes(sentinel) || first.visible.includes(sentinel)) {
    finish(1, "container-log-guard: leak");
  }

  const observable = newSentinel();
  const opened = psql(qa2SettingsSql(null));
  if (opened.status !== 0) finish(1, "container-log-guard: could not drop log settings");
  const openedProbe = fireCheck(observable, logFile);
  const restored = psql(TARGET_PANIC_LOGGING_SQL);
  if (restored.status !== 0) finish(1, "container-log-guard: could not restore panic settings");
  if (!openedProbe.log.includes(observable)) {
    finish(1, "container-log-guard: sentinel not observable");
  }

  // log_min_messages=panic hides ERROR/DETAIL/STATEMENT, so it is
  // sufficient alone. The other two are not: keeping only one of them
  // must still leak the CHECK value (the QA2 unique-on-id miss).
  for (const setting of QA2_LOG_SETTINGS.filter((s) => s.name !== "log_min_messages")) {
    const leak = newSentinel();
    const drop = psql(qa2SettingsSql(setting.name));
    if (drop.status !== 0) finish(1, "container-log-guard: could not drop a log setting");
    const probe = fireCheck(leak, logFile);
    const restore = psql(TARGET_PANIC_LOGGING_SQL);
    if (restore.status !== 0) finish(1, "container-log-guard: could not restore panic settings");
    if (!probe.log.includes(leak)) {
      finish(1, `container-log-guard: ${setting.name} not enforced`);
    }
  }

  const digest = createHash("sha256").update(sentinel).digest("hex").slice(0, 12);
  finish(0, `container-log-guard: ok ${digest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
