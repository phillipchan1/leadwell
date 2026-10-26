import type { Sql } from "./db.ts";
import {
  ALL_TABLES,
  DATA_TABLES,
  JSON_COLUMNS,
  TABLE_COLUMNS,
  TABLE_KEY,
  TEXT_ARRAY_COLUMNS,
  isTableName,
  type TableName,
} from "./tables.ts";

export type Row = Record<string, unknown>;

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

function serialize(column: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (JSON_COLUMNS.has(column)) {
    if (value == null) return column === "messages" ? JSON.stringify([]) : null;
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (TEXT_ARRAY_COLUMNS.has(column)) {
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  }
  return value;
}

function scopedRow(userId: string, table: TableName, row: Row): Row {
  const allowed = TABLE_COLUMNS[table];
  const out: Row = {};
  for (const col of allowed) {
    if (col === "user_id") {
      out.user_id = userId;
      continue;
    }
    if (col in row) out[col] = row[col];
  }
  return out;
}


export async function loadTables(
  sql: Sql,
  userId: string,
): Promise<{ profile: Row | null; tables: Record<string, Row[]> }> {
  const profileRows = await sql.unsafe(
    `SELECT * FROM ${quoteIdent("profiles")} WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const profile = (profileRows[0] as Row | undefined) ?? null;
  const tables: Record<string, Row[]> = {};
  await Promise.all(
    DATA_TABLES.map(async (table) => {
      const rows = await sql.unsafe(
        `SELECT * FROM ${quoteIdent(table)} WHERE user_id = $1`,
        [userId],
      );
      tables[table] = rows as unknown as Row[];
    }),
  );
  return { profile, tables };
}

export async function upsertRows(
  sql: Sql,
  userId: string,
  table: TableName,
  rows: Row[],
): Promise<void> {
  if (!rows.length) return;
  const cols = TABLE_COLUMNS[table];
  const key = TABLE_KEY[table];
  const colList = cols.map(quoteIdent).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const conflict =
    table === "profiles" ? quoteIdent("user_id") : `${quoteIdent("user_id")}, ${quoteIdent(key)}`;
  const updates = cols
    .filter((col) => col !== "user_id" && col !== key)
    .map((col) => `${quoteIdent(col)} = EXCLUDED.${quoteIdent(col)}`);
  const setClause = updates.length ? updates.join(", ") : `${quoteIdent("user_id")} = EXCLUDED.${quoteIdent("user_id")}`;

  for (const raw of rows) {
    const row = scopedRow(userId, table, raw);
    if (table !== "profiles" && (row[key] == null || row[key] === "")) {
      throw new Error(`${table}: missing ${key}`);
    }
    const values = cols.map((col) => serialize(col, row[col]));
    await sql.unsafe(
      `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})
       ON CONFLICT (${conflict}) DO UPDATE SET ${setClause}`,
      values,
    );
  }
}

export async function deleteKeys(
  sql: Sql,
  userId: string,
  table: TableName,
  keys: string[],
): Promise<void> {
  if (!keys.length) return;
  if (table === "profiles") {
    await sql.unsafe(`DELETE FROM ${quoteIdent("profiles")} WHERE user_id = $1`, [userId]);
    return;
  }
  const key = TABLE_KEY[table];
  await sql.unsafe(
    `DELETE FROM ${quoteIdent(table)} WHERE user_id = $1 AND ${quoteIdent(key)} = ANY($2::text[])`,
    [userId, keys],
  );
}

export async function wipeUser(sql: Sql, userId: string): Promise<void> {
  for (const table of ALL_TABLES) {
    await sql.unsafe(`DELETE FROM ${quoteIdent(table)} WHERE user_id = $1`, [userId]);
  }
}

export async function applySync(
  sql: Sql,
  userId: string,
  body: {
    profile?: Row | null;
    upserts?: Record<string, Row[]>;
    deletes?: Record<string, string[]>;
    replace?: boolean;
  },
): Promise<void> {
  if (body.replace) {
    await wipeUser(sql, userId);
  }
  if (body.profile) {
    await upsertRows(sql, userId, "profiles", [body.profile]);
  }
  const upserts = body.upserts ?? {};
  for (const [table, rows] of Object.entries(upserts)) {
    if (!isTableName(table)) throw new Error(`unknown table: ${table}`);
    if (!Array.isArray(rows)) throw new Error(`${table}: rows must be an array`);
    await upsertRows(sql, userId, table, rows);
  }
  const deletes = body.deletes ?? {};
  for (const [table, keys] of Object.entries(deletes)) {
    if (!isTableName(table)) throw new Error(`unknown table: ${table}`);
    if (!Array.isArray(keys)) throw new Error(`${table}: keys must be an array`);
    await deleteKeys(sql, userId, table, keys.map(String));
  }
}
