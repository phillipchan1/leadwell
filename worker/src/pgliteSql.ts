import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

/** Wrap PGlite so postgres.js-style `sql.unsafe` works in Node checks. */
export function pgliteAsSql(db: PGlite): postgres.Sql {
  const unsafe = async (text: string, params: unknown[] = []) => {
    const result = await db.query(text, params as never[]);
    return result.rows as never;
  };
  const sql = Object.assign(
    async () => {
      throw new Error("tagged postgres.js templates are not wired in PGlite checks — use sql.unsafe");
    },
    {
      unsafe,
      end: async () => {
        await db.close();
      },
      json: (value: unknown) => value,
      array: (value: unknown) => value,
    },
  );
  return sql as unknown as postgres.Sql;
}
