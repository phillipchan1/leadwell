/**
 * External trackers — the 1:1 notes that already live somewhere else.
 *
 * ── Why this is an "and", not an "or" ─────────────────────────────────────
 * Plenty of relationships arrive with a system already: a Notion page for one
 * report, a Word doc in OneDrive for another, a shared Google Doc for a third.
 * Asking someone to abandon a tracker they and their report both trust is how
 * you lose the report, not how you win the tracker — so LeadWell doesn't ask.
 *
 * What it keeps is the part the doc can't do: the rhythm, the readiness clock,
 * the topic board, the health read. What it gives up is exactly one thing —
 * the write-up. When `trackerUrl` is set, LeadWell stops claiming to know
 * whether the last one was written up, because it genuinely can't see it (see
 * `meetingReadiness`). Logging sessions here as well still works; the link
 * declares where the source of truth is, it doesn't lock anything.
 *
 * ── Why not just store a string ───────────────────────────────────────────
 * Two things have to be true of a pasted link: it can't be a `javascript:` URL
 * dressed as a tracker, and a plain OneDrive path or `.docx` filename — which
 * is what "it's in Word" often actually means — has to survive being pasted
 * rather than being rejected as invalid. Hence: store what they typed, linkify
 * only known-safe schemes, and render the rest as text.
 */

/**
 * Schemes we'll turn into a real anchor. Everything else is shown as text —
 * `javascript:`, `data:` and `vbscript:` are the reason this is an allowlist
 * and not a denylist.
 */
const LINKABLE_SCHEMES = new Set([
  "http:",
  "https:",
  "notion:",
  "obsidian:",
  "onenote:",
  "evernote:",
  "craftdocs:",
  "bear:",
  "things:",
  "ms-word:",
  "ms-excel:",
  "ms-powerpoint:",
]);

/** Anything that already declares a scheme, e.g. `https:`, `obsidian:`. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** `notion.so/…`, `docs.google.com` — a bare host, so https:// is implied. */
const BARE_HOST = /^[\w-]+(\.[\w-]+)+([/?#]|$)/;

/**
 * What to store for what they typed. A bare host gets the scheme it obviously
 * meant; anything else — a file path, a `.docx` name — is kept verbatim, since
 * a tracker you can't click is still worth recording.
 */
export function normalizeTrackerUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (HAS_SCHEME.test(value)) return value;
  if (BARE_HOST.test(value)) return `https://${value}`;
  return value;
}

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * The href to hang on an anchor, or null when this can't safely be one —
 * either it isn't a URL at all (a file path) or its scheme isn't allowlisted.
 */
export function trackerHref(value: string): string | null {
  const url = parse(value.trim());
  if (!url) return null;
  return LINKABLE_SCHEMES.has(url.protocol.toLowerCase()) ? url.href : null;
}

/**
 * Microsoft 365 encodes the app in the path (`/:w:/` is Word, `/:x:/` Excel),
 * which is the difference between "it's in OneDrive" and "it's in Word" —
 * and "it's in Word" is what the person actually said.
 */
const M365_APP: Record<string, string> = {
  w: "Word",
  x: "Excel",
  p: "PowerPoint",
  o: "OneNote",
  f: "OneDrive",
};

/** Host suffix → what a human calls it. Longest match wins. */
const SERVICES: [suffix: string, name: string][] = [
  ["notion.so", "Notion"],
  ["notion.site", "Notion"],
  ["notion.com", "Notion"],
  ["docs.google.com", "Google Docs"],
  ["drive.google.com", "Google Drive"],
  ["keep.google.com", "Google Keep"],
  ["paper.dropbox.com", "Dropbox Paper"],
  ["dropbox.com", "Dropbox"],
  ["sharepoint.com", "SharePoint"],
  ["onedrive.live.com", "OneDrive"],
  ["1drv.ms", "OneDrive"],
  ["onenote.com", "OneNote"],
  ["office.com", "Microsoft 365"],
  ["officeapps.live.com", "Microsoft 365"],
  ["icloud.com", "iCloud"],
  ["atlassian.net", "Confluence"],
  ["evernote.com", "Evernote"],
  ["coda.io", "Coda"],
  ["airtable.com", "Airtable"],
  ["quip.com", "Quip"],
  ["craft.do", "Craft"],
  ["linear.app", "Linear"],
  ["slack.com", "Slack"],
  ["github.com", "GitHub"],
];

/** Scheme → app, for the note-takers that hand out custom-scheme links. */
const SCHEME_SERVICE: Record<string, string> = {
  "notion:": "Notion",
  "obsidian:": "Obsidian",
  "onenote:": "OneNote",
  "evernote:": "Evernote",
  "craftdocs:": "Craft",
  "bear:": "Bear",
  "things:": "Things",
  "ms-word:": "Word",
  "ms-excel:": "Excel",
  "ms-powerpoint:": "PowerPoint",
};

/** File extension → app, for "it's a Word doc on my machine". */
const EXTENSION_SERVICE: Record<string, string> = {
  doc: "Word",
  docx: "Word",
  rtf: "Word",
  pages: "Pages",
  xlsx: "Excel",
  one: "OneNote",
  md: "Markdown",
  txt: "a text file",
  pdf: "a PDF",
};

/**
 * What to call the tracker in copy — "Notion", "Word", "Google Docs". Falls
 * back to the host, then to a generic, so this always returns something
 * printable.
 */
export function trackerName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "the tracker";

  const url = parse(trimmed);
  if (url) {
    const scheme = SCHEME_SERVICE[url.protocol.toLowerCase()];
    if (scheme) return scheme;

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const match = SERVICES.filter(
      ([suffix]) => host === suffix || host.endsWith(`.${suffix}`)
    ).sort((a, b) => b[0].length - a[0].length)[0];

    if (match) {
      // SharePoint and OneDrive both serve Word, Excel and OneNote — the app
      // in the path is the answer to "where do you keep it", not the host.
      const app = url.pathname.match(/\/:([a-z]):\//i)?.[1]?.toLowerCase();
      if (app && M365_APP[app]) return M365_APP[app];
      return match[1];
    }
    if (host) return host;
  }

  const ext = trimmed.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  if (ext && EXTENSION_SERVICE[ext]) return EXTENSION_SERVICE[ext];

  return "the tracker";
}

/**
 * The link as a human should read it: host plus a hint of the path, or the
 * bare filename for a path. Long enough to recognize, short enough for a
 * phone-width row.
 */
export function trackerLocation(value: string): string {
  const trimmed = value.trim();
  const url = parse(trimmed);
  if (!url) return trimmed;
  if (!LINKABLE_SCHEMES.has(url.protocol.toLowerCase())) return trimmed;
  if (url.protocol !== "http:" && url.protocol !== "https:") return trimmed;

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/$/, "");
  return path && path !== "/" ? `${host}${path}` : host;
}
