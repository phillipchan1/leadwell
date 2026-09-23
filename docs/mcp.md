# LeadWell MCP

A remote MCP server that gives Claude, Cursor or any other agent the same
reach into LeadWell that you have in the app: read and plan every meeting,
edit agendas on the fly, work the Ideas board, manage tags and rows, and move
occurrences around the calendar.

It runs as a Vercel function next to the app (`/mcp`), talks to the same
Supabase project, and writes through the same code the app uses — the
planner's rules live in [`src/lib/ops.ts`](../src/lib/ops.ts) and the row
mapping in [`src/lib/persist.ts`](../src/lib/persist.ts), shared by both. So an
agent filing `#prayer` into next Monday's staff meeting lands the card in the
Prayer row and books the week exactly as dragging it there would.

## What agents can do

Every tool takes names as well as ids — "staff meeting", "Sarah", `#prayer`,
"Discussion" — and occurrences as `next`, `last`, a date or a weekday.

| Area | Tools |
|---|---|
| Orientation | `get_overview` (start here), `list_meetings`, `get_schedule`, `search` |
| A meeting's plan | `get_meeting` — cadence, rows, coverage, the next weeks row by row, its ideas, loose topics, follow-ups, recent write-ups |
| One occurrence | `get_agenda` — agenda by row with notes and points, "since last time", the write-up |
| Topics & agendas | `capture` (`#tag @meeting !` grammar, straight onto a week and row), `update_topic` (text, notes, points, tags, urgency, due, status), `place_topic`, `cover_topics`, `move_topic`, `return_topic`, `carry_forward`, `promote_topic`, `delete_topics` |
| Ideas board | `get_ideas` (by meeting or by tag, refine untriaged / came back / aging), `assign_topics`, `park_topics`, `tag_topics` |
| Tags | `list_tags`, `create_tag`, `update_tag`, `delete_tag` |
| Cadence & templates | `create_meeting`, `update_meeting` (rhythm, weekday, booking, role, tracker link), `set_meeting_rows`, `add_meeting_row`, `set_coverage_targets`, `set_no_meeting`, `delete_meeting` |
| Occurrences | `skip_occurrence`, `restore_occurrence`, `move_occurrence` (one, or the whole series), `add_extra_occurrence`, `write_up` (point, notes, transcript, uncovered, next booking), `delete_occurrence` |
| Follow-ups | `list_follow_ups`, `add_follow_up`, `update_follow_up`, `delete_follow_up` |
| People | `get_org`, `get_subject`, `add_note`, `add_win`, `add_prayer`, `answer_prayer`, `set_prayer`, `set_health`, `update_profile`, `add_person`, `add_team` |

Not exposed: deleting people, teams or managers. Do those in the app.

## Deploy (once, ~5 minutes)

1. **Mint a token.** Any long random string; hex keeps it URL-safe:

   ```sh
   openssl rand -hex 32
   ```

2. **Find your user id.** Supabase dashboard → Authentication → Users → the
   row for your Google account → copy the **UID**.

3. **Set the Vercel environment variables** (Project → Settings → Environment
   Variables). Never prefix these with `VITE_` — that would ship them to the
   browser.

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` |
   | `LEADWELL_USER_ID` | the UID from step 2 |
   | `LEADWELL_MCP_TOKEN` | the token from step 1 |
   | `LEADWELL_TZ` | optional, default `America/Los_Angeles` — what "today" means |

4. **Redeploy.** Check it: `https://<your-app>/mcp/<token>` answers a POST;
   without the token it's a 401.

## Connect

**Claude (web, desktop, mobile)** — Settings → Connectors → *Add custom
connector*. Name it LeadWell and paste the URL with the token as the last
segment:

```
https://<your-app>/mcp/<LEADWELL_MCP_TOKEN>
```

Leave the OAuth fields empty. That URL is the password: don't paste it
anywhere you wouldn't paste the service key, and rotate the token (change it in
Vercel, redeploy, re-add the connector) if it leaks.

**Claude Code**

```sh
claude mcp add --transport http leadwell https://<your-app>/mcp \
  --header "Authorization: Bearer <LEADWELL_MCP_TOKEN>"
```

**Cursor and other agents** — a remote (streamable HTTP) server:

```json
{
  "leadwell": {
    "url": "https://<your-app>/mcp",
    "headers": { "Authorization": "Bearer <LEADWELL_MCP_TOKEN>" }
  }
}
```

Clients that can't send headers can use the `/mcp/<token>` URL too.

## Run locally

Put the MCP variables in `.env.local` (see `.env.example`), then:

```sh
npm run mcp     # http://localhost:3847/mcp
npm test        # end-to-end tool tests against an in-memory Supabase
```

## How edits reach the app

Each tool call loads the workspace, applies the change, and writes only the
rows it touched — the same row diff the app syncs with. An open tab picks the
change up on its next refresh (focus, or the periodic revalidate); it can only
overwrite a row it edits itself afterwards, never one it merely has stale.

## Notes for maintainers

- **Imports in the MCP graph carry `.js`.** Vercel runs `api/mcp.ts` as Node
  ESM compiled file by file, without bundling, so every relative value import
  reachable from it — `mcp/src/**` and the `src/lib` files they use — needs
  the extension. Vite and `tsc` resolve `./x.js` to `x.ts`. Type-only imports
  are erased and don't matter.
- **Change planner behaviour in `ops.ts`, not in the store.** The store's
  meeting actions are thin wrappers over it; that's what keeps the MCP and the
  app from drifting apart.
