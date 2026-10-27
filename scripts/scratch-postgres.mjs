#!/usr/bin/env node
/**
 * Start/stop the public-CI scratch Postgres. Logs are never printed.
 * Image is SHA-pinned. Removal is docker rm with stdout/stderr discarded.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** postgres:17 linux/amd64 (library/postgres tag 17, 2026-10). */
export const SCRATCH_POSTGRES_IMAGE =
  "postgres@sha256:3518071376d0b6156b02e1db2747a78511b5b9dc3763cc79c506ebe2dc2ee71c";
export const SCRATCH_POSTGRES_CONTAINER = "leadwell-pg";

function docker(args) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function start() {
  docker(["rm", "-f", SCRATCH_POSTGRES_CONTAINER]);
  const pull = docker(["pull", SCRATCH_POSTGRES_IMAGE]);
  if (pull.status !== 0) fail("scratch postgres: pull failed");
  const run = docker([
    "run",
    "-d",
    "--name",
    SCRATCH_POSTGRES_CONTAINER,
    "-e",
    "POSTGRES_PASSWORD=postgres",
    "-p",
    "127.0.0.1:5432:5432",
    SCRATCH_POSTGRES_IMAGE,
  ]);
  if (run.status !== 0) fail("scratch postgres: run failed");
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const ping = docker(["exec", SCRATCH_POSTGRES_CONTAINER, "pg_isready", "-U", "postgres"]);
    if (ping.status === 0) {
      ready = true;
      break;
    }
    spawnSync("sleep", ["1"], { stdio: "ignore" });
  }
  if (!ready) fail("scratch postgres: not ready");
  const panic = docker([
    "exec",
    "-e",
    "PGPASSWORD=postgres",
    SCRATCH_POSTGRES_CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "ALTER SYSTEM SET log_min_messages=panic",
    "-c",
    "ALTER SYSTEM SET log_min_error_statement=panic",
    "-c",
    "ALTER SYSTEM SET log_error_verbosity=terse",
    "-c",
    "SELECT pg_reload_conf()",
  ]);
  if (panic.status !== 0) fail("scratch postgres: panic logging failed");
  console.log("scratch postgres: ready");
}

function stop() {
  docker(["rm", "-f", SCRATCH_POSTGRES_CONTAINER]);
  console.log("scratch postgres: removed");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const cmd = process.argv[2];
  if (cmd === "start") start();
  else if (cmd === "stop") stop();
  else fail("usage: scratch-postgres.mjs start|stop");
}
