#!/usr/bin/env node
/**
 * Force a constraint error whose failing row contains a runtime sentinel,
 * then assert that sentinel is absent from docker logs and from the
 * sanitized error this job would print. Never prints the sentinel,
 * container logs, or raw psql output.
 */
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSafeCommandError } from "./safe-cmd.mjs";
import { SCRATCH_POSTGRES_CONTAINER } from "./scratch-postgres.mjs";

const sentinel = `QA2_${randomBytes(16).toString("hex")}`;
const dir = mkdtempSync(join(tmpdir(), "leadwell-pglog-"));
const logFile = join(dir, "container.log");

function done(code, message) {
  rmSync(dir, { recursive: true, force: true });
  if (code === 0) console.log(message);
  else console.error(message);
  process.exit(code);
}

function docker(args) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const setup = spawnSync(
  "docker",
  [
    "exec",
    "-e",
    "PGPASSWORD=postgres",
    SCRATCH_POSTGRES_CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "DROP TABLE IF EXISTS qa2_guard; CREATE TABLE qa2_guard (id int PRIMARY KEY, note text)",
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
if (setup.status !== 0) done(1, "container-log-guard: setup failed");

const insert = spawnSync(
  "docker",
  [
    "exec",
    "-e",
    "PGPASSWORD=postgres",
    "-i",
    SCRATCH_POSTGRES_CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  {
    encoding: "utf8",
    input: `INSERT INTO qa2_guard (id, note) VALUES (1, '${sentinel}');\nINSERT INTO qa2_guard (id, note) VALUES (1, '${sentinel}');\n`,
    stdio: ["pipe", "pipe", "pipe"],
  },
);
if (insert.status === 0) done(1, "container-log-guard: constraint error did not fire");

const logs = docker(["logs", SCRATCH_POSTGRES_CONTAINER]);
writeFileSync(logFile, `${logs.stdout || ""}\n${logs.stderr || ""}`);
const containerLog = readFileSync(logFile, "utf8");
const visible = formatSafeCommandError(
  "psql",
  insert.status ?? 1,
  insert.stderr || "",
  insert.stdout || "",
);

if (containerLog.includes(sentinel) || visible.includes(sentinel)) {
  done(1, "container-log-guard: leak");
}

const digest = createHash("sha256").update(sentinel).digest("hex").slice(0, 12);
done(0, `container-log-guard: ok ${digest}`);
