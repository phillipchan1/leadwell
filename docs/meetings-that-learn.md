# Meetings that learn

Starting a meeting from anywhere, transcribing it well, and keeping what it
taught: the names the transcriber got wrong, the standing work a team does,
and what was decided. Three parts, built in order.

## Status

| Part | What | Where |
|---|---|---|
| 1 | Start or resume from anywhere: Start / Notes on the planner's weeks, Today, ⌘K; a live meeting that outlives Run, shown in a pill | [`liveMeeting.ts`](../src/lib/liveMeeting.ts), [`LivePill`](../src/components/LivePill.tsx) |
| 2 | Server transcription in segments cut at pauses, primed with the meeting's vocabulary; Dictate (⌘⇧D) into the write-up | [`transcribe.ts`](../worker/src/transcribe.ts), [`transcriber.ts`](../src/lib/transcriber.ts), [`vocabulary.ts`](../src/lib/vocabulary.ts), [`dictation.ts`](../src/lib/dictation.ts) |
| 3 | The glossary, fixtures, what we know, and the wrap-up | below |

## Part 3: the loop

Each kind of knowledge comes from something you already do, and each feeds
the next meeting.

| Learns from | Becomes | Used by |
|---|---|---|
| Fixing a word in a transcript ("Alayna" → "Elena") | A **glossary** term, offered once: Remember or Not this | Every stretch transcribed after (the fix is applied), and the transcriber's vocabulary |
| The wrap-up, or by hand | **What we know** about a person or team: decisions, themes, facts, each linked to its meeting | Run's right column (pinned first), their Notes tab, the next wrap-up (not repeated) |
| The wrap-up ("came up"), or by hand | **Fixtures**: the standing things a team does, who carries them, how often, when last talked about | Run's right column (one gone quiet past its cadence is flagged), the team's Profile tab, the vocabulary |
| Done, after a meeting with a transcript or notes | The **wrap-up**: a drafted write-up, topics covered, the arc step, follow-ups, closed follow-ups, knowledge, fixtures touched, new fixtures and glossary words | All of the above, only what's ticked |

Code: [`glossary.ts`](../src/lib/glossary.ts) (checked by `npm run test:glossary`),
[`knowledge.ts`](../src/lib/knowledge.ts), [`wrapUp.ts`](../src/lib/wrapUp.ts),
[`TranscriptField`](../src/components/TranscriptField.tsx),
[`WrapUpSheet`](../src/components/WrapUpSheet.tsx),
[`FixturesList` / `KnownList`](../src/components/knowledge/).

**Suggestions that change what Polarch believes start unticked.** A new
fixture or glossary word from the wrap-up is opt-in; one left unticked is
remembered (on this device) and not offered again. Commitments, decisions and
what was covered start ticked: they're what the meeting was.

**A short single word only matches in its own case.** Having learned
"Web" → "Webb", "web page" is left alone.

## Privacy

Glossary, fixtures and knowledge are owner-only. They aren't in a shared
meeting's page and aren't mapped for a connected assistant (MCP), like the
transcript. The wrap-up sends the transcript and notes to the Worker's OpenAI
proxy, the same path the AI coach and arc drafts use. Audio is never stored.

## Deploying

**Apply `worker/schema/009_knowledge.sql` before deploying a Worker that
includes part 3.** The Worker reads every allowlisted table on load, and a
missing table fails the whole load, so sign-in would break until it's
applied. The migration only creates tables; rollback is
`worker/schema/rollback/009_knowledge.sql`.
