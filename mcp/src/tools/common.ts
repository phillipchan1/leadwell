import type { McpServer } from "@modelcontextprotocol/server";
import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { PersistedData } from "../../../src/lib/persist";
import type { Patch } from "../../../src/lib/ops";
import { commitWorkspace, loadWorkspace } from "../workspace.js";

export type Doc = PersistedData;
export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function fail(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Load, run a read, format. */
export async function read(run: (d: Doc) => string): Promise<ToolResult> {
  return ok(run(await loadWorkspace()));
}

/**
 * Load, apply a change, write back only the rows it touched.
 *
 * `run` works on a scratch copy through `edit`: each `edit(patch)` folds an
 * ops patch in, so a tool can chain several steps and see its own writes.
 */
export async function write(
  run: (d: Doc, edit: (patch: Patch) => Doc) => string
): Promise<ToolResult> {
  const before = await loadWorkspace();
  let doc = before;
  const edit = (patch: Patch) => {
    doc = { ...doc, ...patch };
    return doc;
  };
  const text = run(before, edit);
  if (doc !== before) await commitWorkspace(before, doc);
  return ok(text);
}

type Annotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
};

/** registerTool with the error handling every tool wants. */
export function tool<S extends StandardSchemaWithJSON>(
  server: McpServer,
  name: string,
  config: { title: string; description: string; inputSchema: S; annotations?: Annotations },
  handler: (args: StandardSchemaWithJSON.InferOutput<S>) => Promise<ToolResult>
): void {
  server.registerTool(
    name,
    { ...config, annotations: { openWorldHint: false, ...config.annotations } },
    (async (args: StandardSchemaWithJSON.InferOutput<S>) => {
      try {
        return await handler(args);
      } catch (err) {
        return fail(err);
      }
    }) as never
  );
}
