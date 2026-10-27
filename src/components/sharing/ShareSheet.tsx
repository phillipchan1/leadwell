import { useMemo, useState } from "react";
import type { MeetingShare, Person, TrackedMeeting } from "../../types";
import { useStore } from "../../store/useStore";
import { Modal } from "../ui";
import { Avatar } from "../Avatar";
import { liveArcs } from "../../lib/arcs";
import { meetingSubjectName, meetingTitle, todayISO } from "../../lib/readiness";
import { shareFirstName, shareUrl, sharesFor } from "../../lib/shares";
import { DEMO } from "../../lib/demo";
import { toast } from "../../lib/toasts";
import { Check, Copy01, Lock01, Mail01, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const field =
  "h-9 min-w-0 rounded-[9px] border border-primary bg-primary px-2.5 text-[13.5px] text-primary outline-none placeholder:text-placeholder focus:border-teal-400 dark:focus:border-teal-600";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Share one meeting. Not a team, not the workspace: the meeting is the unit
 * Polarch was built around — topics, follow-ups and occurrences already belong
 * to it — so sharing it shares exactly the room and none of your read on the
 * people in it.
 */
export function ShareSheet({ meeting, onClose }: { meeting: TrackedMeeting; onClose: () => void }) {
  const shares = useStore((s) => s.shares);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const topics = useStore((s) => s.topics);
  const sessions = useStore((s) => s.sessions);
  const followUps = useStore((s) => s.followUps);
  const arcs = useStore((s) => s.arcs);
  const createShare = useStore((s) => s.createShare);
  const revokeShare = useStore((s) => s.revokeShare);
  const updatePerson = useStore((s) => s.updatePerson);
  const updateTopic = useStore((s) => s.updateTopic);
  const updateFollowUp = useStore((s) => s.updateFollowUp);

  const mine = sharesFor(shares, meeting.id);
  const title = meetingTitle(meeting, meetingSubjectName(meeting, { people, teams, managers }));

  // Who it would naturally be shared with: the person, or the team's roster.
  const candidates: Person[] = useMemo(() => {
    if (meeting.subjectKind === "person") return people.filter((p) => p.id === meeting.subjectId);
    if (meeting.subjectKind === "team") return people.filter((p) => p.teamId === meeting.subjectId);
    return [];
  }, [meeting, people]);
  const invitedPeople = new Set(mine.map((s) => s.personId).filter(Boolean));
  const invitedEmails = new Set(mine.map((s) => s.email.toLowerCase()));
  const open = candidates.filter((p) => !invitedPeople.has(p.id) && !(p.email && invitedEmails.has(p.email.toLowerCase())));

  // What sharing would show, so nothing is a surprise.
  const today = todayISO();
  const upcomingIds = new Set(
    sessions.filter((s) => s.meetingId === meeting.id && s.date >= today).map((s) => s.id)
  );
  const placed = topics.filter(
    (t) => t.meetingId === meeting.id && t.sessionId && upcomingIds.has(t.sessionId) && t.status === "open"
  );
  const visibleTopics = placed.filter((t) => !t.private);
  const openFollowUps = followUps.filter((f) => f.meetingId === meeting.id && f.status === "open");
  const visibleFollowUps = openFollowUps.filter((f) => !f.private);
  const arcCount = liveArcs(arcs, meeting.id).length;
  const [reviewing, setReviewing] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const invite = async (input: { email: string; name?: string; personId?: string }) => {
    setBusy(input.personId ?? input.email);
    try {
      const share = await createShare({ meetingId: meeting.id, ...input });
      if (input.personId) {
        const p = people.find((x) => x.id === input.personId);
        if (p && p.email !== input.email) updatePerson(p.id, { email: input.email });
      }
      await copy(share);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message.replace(/^share: /, "") : "Couldn't share.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={`Share ${title}`} subtitle="They see the agenda and can add to it. Your read on people stays yours." onClose={onClose}>
      {DEMO ? (
        <p className="text-[14px] text-secondary">Sharing needs the cloud version of Polarch — the demo has nobody to share with.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {mine.length > 0 && (
            <ul className="flex flex-col gap-2">
              {mine.map((share) => (
                <ShareRow key={share.id} share={share} title={title} onRevoke={() => void revokeShare(share.id)} />
              ))}
            </ul>
          )}

          {open.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">{mine.length ? "Also share with" : "Share with"}</span>
              {open.map((p) => (
                <InviteRow
                  key={p.id}
                  name={p.name}
                  photo={p.photo}
                  defaultEmail={p.email ?? ""}
                  busy={busy === p.id}
                  onInvite={(email) => void invite({ email, name: p.name, personId: p.id })}
                />
              ))}
            </div>
          )}

          <OtherInvite busy={Boolean(busy)} onInvite={(email, name) => void invite({ email, name })} />

          <div className="flex flex-col gap-2.5 rounded-[12px] bg-secondary p-3.5">
            <span className="eyebrow">What they'll see</span>
            <ul className="flex flex-col gap-1 text-[13px] text-secondary">
              <li>The next meetings and what's on them — {visibleTopics.length} item{visibleTopics.length === 1 ? "" : "s"} placed so far</li>
              <li>
                {visibleFollowUps.length} open follow-up{visibleFollowUps.length === 1 ? "" : "s"}
                {arcCount ? `, and ${arcCount === 1 ? "the arc" : `${arcCount} arcs`} you're working through` : ""}
              </li>
              <li>Notes you both write under <i>Our notes</i></li>
            </ul>
            <p className="flex items-start gap-1.5 text-[12.5px] text-tertiary">
              <Lock01 aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Never: health, prayer, assessments, how to lead them, your Ideas tray, <i>My notes</i>, any other
              meeting, or anything you lock.
            </p>
            {(placed.length > 0 || openFollowUps.length > 0) && (
              <button
                type="button"
                onClick={() => setReviewing((v) => !v)}
                className="self-start text-[12.5px] font-semibold text-teal-700 hover:underline dark:text-teal-400"
              >
                {reviewing ? "Done reviewing" : "Review and lock items"}
              </button>
            )}
            {reviewing && (
              <ul className="flex flex-col gap-1">
                {placed.map((t) => (
                  <LockRow key={t.id} text={t.text} locked={Boolean(t.private)} onToggle={() => updateTopic(t.id, { private: !t.private })} />
                ))}
                {openFollowUps.map((f) => (
                  <LockRow
                    key={f.id}
                    text={f.text}
                    hint="follow-up"
                    locked={Boolean(f.private)}
                    onToggle={() => updateFollowUp(f.id, { private: !f.private })}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

async function copy(share: MeetingShare) {
  try {
    await navigator.clipboard.writeText(shareUrl(share));
    toast({ message: `Link for ${shareFirstName(share)} copied` });
  } catch {
    toast({ message: shareUrl(share) });
  }
}

function ShareRow({ share, title, onRevoke }: { share: MeetingShare; title: string; onRevoke: () => void }) {
  const first = shareFirstName(share);
  const seen = share.lastSeenOn
    ? `Opened ${new Date(share.lastSeenOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "Not opened yet";
  const mail = `mailto:${encodeURIComponent(share.email)}?subject=${encodeURIComponent(`Our agenda — ${title}`)}&body=${encodeURIComponent(
    `Hi ${first},\n\nHere's our shared agenda. You can see what's coming up and add anything you want to talk about:\n\n${shareUrl(share)}\n`
  )}`;
  return (
    <li className="flex items-center gap-3 rounded-[12px] border border-secondary px-3 py-2.5">
      <Avatar name={share.name ?? share.email} size={32} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold text-primary">{share.name ?? share.email}</span>
        <span className="truncate text-[12px] text-tertiary">
          {share.name ? `${share.email} · ` : ""}
          {seen}
        </span>
      </div>
      <IconAction label={`Copy ${first}'s link`} onClick={() => void copy(share)}>
        <Copy01 className="size-4" />
      </IconAction>
      <a
        href={mail}
        aria-label={`Email ${first} the link`}
        className="flex size-8 items-center justify-center rounded-lg text-tertiary hover:bg-secondary hover:text-secondary"
      >
        <Mail01 className="size-4" />
      </a>
      <IconAction label={`Stop sharing with ${first}`} onClick={onRevoke}>
        <X className="size-4" />
      </IconAction>
    </li>
  );
}

function InviteRow({
  name,
  photo,
  defaultEmail,
  busy,
  onInvite,
}: {
  name: string;
  photo?: string;
  defaultEmail: string;
  busy: boolean;
  onInvite: (email: string) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const valid = EMAIL_RE.test(email.trim());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onInvite(email.trim());
      }}
      className="flex items-center gap-2.5"
    >
      <Avatar name={name} photo={photo} size={28} />
      <span className="w-28 shrink-0 truncate text-[13.5px] text-primary">{name}</span>
      <input
        className={cx(field, "flex-1")}
        type="email"
        value={email}
        placeholder="Their email"
        aria-label={`${name}'s email`}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        type="submit"
        disabled={!valid || busy}
        className="h-9 shrink-0 rounded-[9px] bg-teal-600 px-3 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
      >
        {busy ? "Sharing…" : "Share"}
      </button>
    </form>
  );
}

function OtherInvite({ busy, onInvite }: { busy: boolean; onInvite: (email: string, name?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const valid = EMAIL_RE.test(email.trim());
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-[13px] font-semibold text-tertiary hover:text-secondary"
      >
        + Someone else
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onInvite(email.trim(), name.trim() || undefined);
        setName("");
        setEmail("");
        setOpen(false);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input className={cx(field, "w-36")} value={name} placeholder="Name" autoFocus onChange={(e) => setName(e.target.value)} />
      <input className={cx(field, "flex-1")} type="email" value={email} placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <button
        type="submit"
        disabled={!valid || busy}
        className="h-9 rounded-[9px] bg-teal-600 px-3 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
      >
        Share
      </button>
    </form>
  );
}

function LockRow({ text, hint, locked, onToggle }: { text: string; hint?: string; locked: boolean; onToggle: () => void }) {
  return (
    <li className="flex items-center gap-2 text-[13px]">
      <button
        type="button"
        role="switch"
        aria-checked={locked}
        aria-label={locked ? `Share “${text}”` : `Keep “${text}” to yourself`}
        onClick={onToggle}
        className={cx(
          "flex size-6 shrink-0 items-center justify-center rounded-md",
          locked ? "bg-primary text-secondary shadow-xs" : "text-quaternary hover:text-secondary"
        )}
      >
        {locked ? <Lock01 className="size-3.5" /> : <Check className="size-3.5" />}
      </button>
      <span className={cx("min-w-0 flex-1 truncate", locked ? "text-tertiary" : "text-primary")}>{text}</span>
      {hint && <span className="shrink-0 font-mono text-[10.5px] text-quaternary uppercase">{hint}</span>}
      <span className="shrink-0 text-[11.5px] text-quaternary">{locked ? "Only you" : "Shared"}</span>
    </li>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-tertiary hover:bg-secondary hover:text-secondary"
    >
      {children}
    </button>
  );
}
