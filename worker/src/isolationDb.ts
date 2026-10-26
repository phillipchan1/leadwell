import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_DIR = join(here, "../schema");

export function schemaFileVersion(name: string): number | null {
  const m = name.match(/^(\d+)_/);
  return m ? Number(m[1]) : null;
}

export function nextMigrationVersions(files: string[]): number[] {
  return files
    .map(schemaFileVersion)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
}

export async function applySchema(db: PGlite): Promise<void> {
  const files = readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(SCHEMA_DIR, file), "utf8");
    await db.exec(sql);
  }
}
