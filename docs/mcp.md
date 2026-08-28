# LeadWell MCP

A remote, token-authenticated MCP so Cursor (Grokbot), Claude, and later OpenClaw can read Phil's leadership purview and **fully capture** meeting work against the same Supabase document the web app uses.

v1 is LeadWell-only. Notion tracker pages stay on Notion MCP. Health ratings, prayer marks, and org-chart edits are still human-only.

## What agents can do

**Read** — start with `get_purview`. Then `get_org`, `get_person`, `get_team`, `get_manager`, `list_meetings`, `get_meeting`, `search`, `list_topics`, `list_follow_ups`.

**Full capture** — the same surface as the Ideas bar and the meeting board:

| Tool | What it does |
|---|---|
| `capture` | One topic per line. `#tag` `@meeting` `!` urgent. Unknown tags are created. |
| `update_topic` | Text, detail, tags, urgency, status, lane, due date |
| `place_topic` | Meeting, session, projected date (books the week), slot, or lane |
| `cover_topic` | Mark covered or reopen |
| `park_topics` / `assign_topics` | Defer, or file onto a meeting / back to Ideas |
| `add_follow_up` / `complete_follow_up` / `promote_topic` | Commitments that outlive one occurrence |
| `log_session` / `update_session` | Full write-up: point, notes, transcript, next date, uncovered ledger |
| `add_note` / `add_team_note` / `add_win` | Dated notes and leading-up wins |

## Run locally

```sh
# .env.local needs the four MCP vars from .env.example
npm run mcp
```

Listens on `http://localhost:3847` (override with `LEADWELL_MCP_PORT`). Any path works; `/mcp` is the conventional one.

## Deploy

The Vite app already deploys to Vercel. `/api/mcp` is a serverless function; `/mcp` rewrites there.

Set these on the Vercel project (never `VITE_`-prefixed):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — dashboard → Settings → API → `service_role`
- `LEADWELL_USER_ID` — Phil's `auth.users` id
- `LEADWELL_MCP_TOKEN` — a long random bearer token you mint

## Connect agents

Same URL and header everywhere: `Authorization: Bearer $LEADWELL_MCP_TOKEN`.

**Cursor (Grokbot / cloud agents)** — Settings → MCP → add a remote server:

```json
{
  "leadwell": {
    "url": "https://<your-leadwell-host>/api/mcp",
    "headers": {
      "Authorization": "Bearer <LEADWELL_MCP_TOKEN>"
    }
  }
}
```

**Claude** — custom remote MCP / connector, same URL and bearer token.

**OpenClaw** — add the URL to Arvis/Nadia `TOOLS.md`. Nadia is the church-ops consumer of Frontier meetings.

## Sync safety

The web app used to delete every cloud row missing from the open tab. That would erase an agent capture the next time the app saved. Sync now only deletes **tombstones** — ids the app already knew about and the user removed. Agent inserts survive; they show up in the app on the next reload.
