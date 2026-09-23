/**
 * Just enough of the Supabase client for `persist.ts`: select / eq /
 * maybeSingle / upsert / delete / in, over in-memory tables.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

const KEY: Record<string, string> = {
  profiles: "user_id",
  chats: "chat_key",
  node_positions: "node_id",
};

export function fakeSupabase(tables: Record<string, Row[]> = {}) {
  const table = (name: string) => (tables[name] ??= []);

  function query(name: string, mode: "select" | "delete") {
    const filters: ((r: Row) => boolean)[] = [];
    const run = () => {
      const rows = table(name).filter((r) => filters.every((f) => f(r)));
      if (mode === "delete") {
        tables[name] = table(name).filter((r) => !rows.includes(r));
        return { data: null, error: null };
      }
      return { data: rows.map((r) => structuredClone(r)), error: null };
    };
    const q = {
      select: () => q,
      eq(col: string, value: unknown) {
        filters.push((r) => r[col] === value);
        return q;
      },
      in(col: string, values: unknown[]) {
        filters.push((r) => values.includes(r[col]));
        return q;
      },
      maybeSingle: async () => {
        const { data } = run();
        return { data: (data as Row[])[0] ?? null, error: null };
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          resolve(run());
        } catch (err) {
          reject(err);
        }
      },
    };
    return q;
  }

  const client = {
    from(name: string) {
      return {
        select: () => query(name, "select"),
        delete: () => query(name, "delete"),
        async upsert(rows: Row | Row[]) {
          const key = KEY[name] ?? "id";
          for (const row of Array.isArray(rows) ? rows : [rows]) {
            const list = table(name);
            const i = list.findIndex((r) => r[key] === row[key] && r.user_id === row.user_id);
            if (i >= 0) list[i] = { ...list[i], ...structuredClone(row) };
            else list.push(structuredClone(row));
          }
          return { error: null };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, tables };
}
