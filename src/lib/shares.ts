import type { MeetingShare } from "../types";
import { apiDelete, apiFetch, apiGet, readApiError } from "./api";

/**
 * Sharing a meeting, from the owner's side.
 *
 * Deliberately outside the synced document: a share is a capability the
 * server hands out, and the client never gets to write one by upserting a row.
 */

/** A meeting someone else shared with me, matched by my sign-in email. */
export type SharedWithMe = {
  token: string;
  meetingName: string;
  ownerName: string;
};

export async function listShares(): Promise<MeetingShare[]> {
  const res = await apiGet("/api/shares");
  if (!res.ok) await readApiError(res, "shares");
  const body = (await res.json()) as { shares?: MeetingShare[] };
  return body.shares ?? [];
}

export async function listSharedWithMe(): Promise<SharedWithMe[]> {
  const res = await apiGet("/api/shared-with-me");
  if (!res.ok) await readApiError(res, "shared with me");
  const body = (await res.json()) as { meetings?: SharedWithMe[] };
  return body.meetings ?? [];
}

export async function createShare(input: {
  meetingId: string;
  email: string;
  name?: string;
  personId?: string;
}): Promise<MeetingShare> {
  const res = await apiFetch("/api/shares", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) await readApiError(res, "share");
  const body = (await res.json()) as { share: MeetingShare };
  return body.share;
}

export async function revokeShare(id: string): Promise<void> {
  const res = await apiDelete(`/api/shares/${encodeURIComponent(id)}`);
  if (!res.ok) await readApiError(res, "revoke");
}

/** The link the other chair opens. No account needed — the token is the key. */
export function shareUrl(share: Pick<MeetingShare, "token">): string {
  return `${window.location.origin}/with/${share.token}`;
}

/** Their first name, or what's before the @, for "Visible to Meghan". */
export function shareFirstName(share: Pick<MeetingShare, "name" | "email">): string {
  const name = share.name?.trim();
  if (name) return name.split(/\s+/)[0];
  return share.email.split("@")[0];
}

export function sharesFor(shares: MeetingShare[], meetingId: string): MeetingShare[] {
  return shares.filter((s) => s.meetingId === meetingId);
}

/** "Meghan", "Meghan and Dana", "Meghan, Dana and 3 others". */
export function sharedWithLabel(shares: MeetingShare[]): string {
  const names = shares.map(shareFirstName);
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} other${names.length === 3 ? "" : "s"}`;
}
