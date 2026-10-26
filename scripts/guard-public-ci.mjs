/**
 * Public-repo CI guards. LeadWell is public: dumps, CSVs, and row data
 * must never become Actions artifacts, and migrate/verify logs must stay
 * counts + md5 (plus ids). Run from checks.yml so a new workflow cannot
 * sneak in an upload-artifact of anything else.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ALLOWED_UPLOAD_ARTIFACT_PATHS = Object.freeze(["artifacts/cutover-report.md"]);

const ALLOWED = new Set(ALLOWED_UPLOAD_ARTIFACT_PATHS);

export function extractUploadArtifactSteps(workflowText) {
  const steps = [];
  const re = /uses:\s*actions\/upload-artifact[^\n]*\n((?:[ \t]+[^\n]*\n)*)/g;
  for (const match of String(workflowText).matchAll(re)) {
    const block = match[0];
    const pathMatch = block.match(/^[ \t]+path:[ \t]*(\|[^\n]*\n(?:[ \t]+[^\n]+\n)*|.+)$/m);
    let path = "";
    if (pathMatch) {
      const raw = pathMatch[1].trim();
      if (raw.startsWith("|") || raw.startsWith(">")) {
        path = raw
          .split("\n")
          .slice(1)
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n");
      } else {
        path = raw.replace(/^['"]|['"]$/g, "");
      }
    }
    const nameMatch = block.match(/^[ \t]+name:[ \t]*(.+)$/m);
    steps.push({
      block,
      path,
      name: (nameMatch?.[1] ?? "").trim().replace(/^['"]|['"]$/g, ""),
    });
  }
  return steps;
}

export function assertWorkflowUploadAllowlist(workflowText, filename = "workflow") {
  const problems = [];
  const steps = extractUploadArtifactSteps(workflowText);
  for (const step of steps) {
    const paths = String(step.path)
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (!paths.length) {
      problems.push(`${filename}: upload-artifact has no path`);
      continue;
    }
    for (const p of paths) {
      if (!ALLOWED.has(p)) {
        problems.push(
          `${filename}: upload-artifact path "${p}" is not allowlisted (only ${[...ALLOWED].join(", ")})`,
        );
      }
    }
  }
  if (problems.length) {
    throw new Error(
      `public-repo artifact allowlist failed:\n${problems.map((p) => `  ${p}`).join("\n")}`,
    );
  }
  return steps;
}

export function assertWorkflowsUploadAllowlist(workflowsDir) {
  const names = readdirSync(workflowsDir).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"));
  if (!names.length) throw new Error(`no workflows in ${workflowsDir}`);
  const all = [];
  for (const name of names) {
    const text = readFileSync(join(workflowsDir, name), "utf8");
    all.push(...assertWorkflowUploadAllowlist(text, name).map((step) => ({ ...step, file: name })));
  }
  return all;
}

/** True when log text looks like emails, CSV rows, or dumped secrets. */
export function logLooksLikeRowData(text) {
  const s = String(text);
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s)) return true;
  if (/\bencrypted_password\b|\brecovery_token\b|\bconfirmation_token\b/.test(s)) return true;
  return false;
}

export function assertSafeMigrateLog(text, label = "log") {
  if (logLooksLikeRowData(text)) {
    throw new Error(`${label} looks like row data; only counts and md5s may be logged`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = join(here, "..", ".github", "workflows");
  const steps = assertWorkflowsUploadAllowlist(dir);
  console.log(`public-ci-guard: ${steps.length} upload-artifact path(s) allowlisted`);
}
