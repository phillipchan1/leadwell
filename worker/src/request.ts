import type { Context } from "hono";
import { closeAuth, createAuth, type AuthInstance } from "./auth.ts";
import { closeSql, createSql, type Sql } from "./db.ts";
import type { Env } from "./env.ts";
import { logMagicLinkSendFailure } from "./mail.ts";

export type WorkerVars = {
  sql?: Sql;
  auth?: AuthInstance;
};

export type WorkerContext = Context<{ Bindings: Env; Variables: WorkerVars }>;

export function sqlOf(c: WorkerContext): Sql {
  const existing = c.get("sql");
  if (existing) return existing;
  const sql = createSql(c.env);
  c.set("sql", sql);
  return sql;
}

/** Swallow a background task when executionCtx is missing (Node tests). */
export function catchBackgroundTask(task: Promise<unknown>): void {
  void task.catch((err) => {
    logMagicLinkSendFailure(err);
  });
}

export function authOf(c: WorkerContext): AuthInstance {
  const existing = c.get("auth");
  if (existing) return existing;
  const auth = createAuth(c.env, undefined, {
    waitUntil: (task) => {
      try {
        c.executionCtx.waitUntil(task);
      } catch {
        catchBackgroundTask(task);
      }
    },
  });
  c.set("auth", auth);
  return auth;
}

export async function closeRequestResources(c: WorkerContext): Promise<void> {
  const sql = c.get("sql");
  const auth = c.get("auth");
  await Promise.all([
    sql ? closeSql(sql) : Promise.resolve(),
    auth ? closeAuth(auth) : Promise.resolve(),
  ]);
}

/** Close per-request I/O after the response. Workers: waitUntil; Node tests: await. */
export async function finishRequest(c: WorkerContext): Promise<void> {
  const closing = closeRequestResources(c);
  try {
    c.executionCtx.waitUntil(closing);
  } catch {
    await closing;
  }
}
