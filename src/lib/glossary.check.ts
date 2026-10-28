/**
 * The glossary's two jobs, proven:
 * - noticing a correction in an edited transcript, and only a correction
 * - applying what was learned to new text, as whole words, any case
 */
import { applyGlossary, countPhrase, findCorrections, looksLikeCorrection } from "./glossary";
import type { GlossaryTerm } from "../types";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Noticing ───────────────────────────────────────────────────────────────
ok(
  same(findCorrections("We talked to Alayna about setup.", "We talked to Elena about setup."), [
    { heard: "Alayna", meant: "Elena" },
  ]),
  "a misheard name is a correction"
);
ok(
  same(findCorrections("we read cruel conversations chapter four", "we read Crucial Conversations chapter four"), [
    { heard: "cruel conversations", meant: "Crucial Conversations" },
  ]),
  "a misheard title, two words"
);
ok(
  same(findCorrections("ask elena first", "ask Elena first"), [{ heard: "elena", meant: "Elena" }]),
  "capitalising a name counts"
);
ok(findCorrections("Meet on Tuesday.", "Meet on Thursday.").length === 0, "changing a fact is not a correction");
ok(findCorrections("One. Two. Three.", "One. Three.").length === 0, "deleting is not a correction");
ok(findCorrections("One. Three.", "One. Two. Three.").length === 0, "adding is not a correction");
ok(
  findCorrections("the plan is fine", "honestly I think we should rethink the whole plan").length === 0,
  "rewriting is not a correction"
);
ok(
  same(
    findCorrections("Alayna and Grenny met, then Alayna left", "Elena and Granny met, then Elena left"),
    [
      { heard: "Alayna", meant: "Elena" },
      { heard: "Grenny", meant: "Granny" },
    ]
  ),
  "several corrections at once, each once"
);
ok(!looksLikeCorrection("a", "an"), "too short to learn");
ok(findCorrections("", "Elena").length === 0, "nothing before, nothing learned");

// ── Applying ───────────────────────────────────────────────────────────────
const terms: GlossaryTerm[] = [
  { id: "1", heard: "Alayna", meant: "Elena", createdOn: "" },
  { id: "2", heard: "cruel conversations", meant: "Crucial Conversations", createdOn: "" },
  { id: "3", meant: "Frontier", createdOn: "" },
];
ok(
  applyGlossary("alayna said cruel Conversations was good. ALAYNA agreed.", terms) ===
    "Elena said Crucial Conversations was good. Elena agreed.",
  "applied in any case, phrases too"
);
ok(applyGlossary("Alaynas", terms) === "Alaynas", "only whole words");
ok(
  applyGlossary("Marcus Web built the web page", [{ id: "w", heard: "Web", meant: "Webb", createdOn: "" }]) ===
    "Marcus Webb built the web page",
  "a short single word only matches its own case"
);
ok(applyGlossary("Frontier staff", terms) === "Frontier staff", "a term with nothing misheard changes nothing");
ok(countPhrase("Alayna, then alayna again", "Alayna") === 2, "count whole-word occurrences");

if (fails.length) {
  console.error(`glossary.check: ${fails.length} of ${checks} failed`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`glossary.check: ${checks} checks passed`);
