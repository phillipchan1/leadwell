import { useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { cx } from "@/utils/cx";
import { InlineComposer } from "./InlineComposer";
import type { LabApi } from "./store";
import { nextSlotAfter, parseSlotKey, plannedSlots, slotLabel } from "./slots";
import { TagChip, tagDotClass } from "./TagChip";
import { UNSORTED } from "./types";
import type { LabTopic } from "./types";

export function Run({ api }: { api: LabApi }) {
  const { state } = api;
  const meeting = state.meetings.find((m) => m.id === state.activeMeetingId);
  const parsed = state.activeSlotKey ? parseSlotKey(state.activeSlotKey) : null;

  const session = useMemo(() => {
    if (!parsed?.sessionId) return null;
    return state.sessions.find((s) => s.id === parsed.sessionId) ?? null;
  }, [parsed, state.sessions]);

  const [followDraft, setFollowDraft] = useState("");
  const [closing, setClosing] = useState(false);

  const agenda = useMemo(() => {
    if (!session || !meeting) return [];
    return state.topics
      .filter(
        (t) =>
          t.sessionId === session.id &&
          t.meetingId === meeting.id &&
          t.status !== "dropped"
      )
      .sort((a, b) => a.order - b.order);
  }, [session, meeting, state.topics]);

  const followUps = useMemo(() => {
    if (!meeting) return [];
    return state.followUps.filter(
      (f) =>
        f.meetingId === meeting.id ||
        (f.subjectId === meeting.subjectId && f.status === "open")
    );
  }, [meeting, state.followUps]);

  const openFollowUps = followUps.filter((f) => f.status === "open");

  const nextDest = useMemo(() => {
    if (!meeting || !session) return null;
    const slots = plannedSlots(
      meeting,
      state.sessions,
      state.topics,
      state.today
    );
    return nextSlotAfter(slots, session.id);
  }, [meeting, session, state.sessions, state.topics, state.today]);

  if (!meeting || !session) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-quaternary">
          Open a week from the Planner to run a meeting.
        </p>
        <Button
          size="sm"
          color="secondary"
          className="mt-3"
          onClick={() => api.setSurface("planner")}
        >
          Back to Planner
        </Button>
      </div>
    );
  }

  const covered = agenda.filter((t) => t.status === "covered").length;
  const open = agenda.filter((t) => t.status === "open");
  const tagById = new Map(state.tags.map((t) => [t.id, t]));

  // Same running order as the Planner column — the meeting reads top to bottom.
  const bands: { id: string; label: string; tagId?: string; minutes?: number; topics: LabTopic[] }[] =
    [
      ...meeting.template.map((s) => ({
        ...s,
        topics: agenda.filter((t) => t.sectionId === s.id),
      })),
      {
        id: UNSORTED,
        label: meeting.template.length ? "Unsorted" : "Agenda",
        topics: agenda.filter(
          (t) => !t.sectionId || !meeting.template.some((s) => s.id === t.sectionId)
        ),
      },
    ].filter((b) => b.topics.length > 0 || b.id !== UNSORTED);

  const closeOut = () => {
    setClosing(true);
    if (!open.length) return;
    if (state.carryMode === "inbox") {
      for (const t of open) api.returnTopic(t.id);
    } else if (nextDest) {
      for (const t of open) {
        api.carryTopic(t.id, {
          meetingId: meeting.id,
          sessionId: nextDest.sessionId ?? undefined,
          date: nextDest.sessionId ? undefined : nextDest.date,
          fromSessionId: session.id,
        });
      }
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-caption font-semibold tracking-wide text-quaternary uppercase">
            Running
          </p>
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">
            {meeting.name}
          </h2>
          <p className="text-sm text-quaternary">
            {new Date(`${session.date}T00:00:00Z`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            color="secondary"
            onClick={() => api.setSurface("planner")}
          >
            Planner
          </Button>
          <Button size="sm" color="primary" onClick={closeOut}>
            Close out
          </Button>
        </div>
      </div>

      {/* Since last time */}
      {openFollowUps.length > 0 && (
        <section className="rounded-xl border border-secondary bg-stone-50/50 p-3 dark:bg-stone-950/30">
          <h3 className="text-xs font-semibold text-stone-700 dark:text-stone-200">
            Since last time
          </h3>
          <ul className="mt-2 space-y-1.5">
            {openFollowUps.map((f) => (
              <li
                key={f.id}
                className="flex items-start gap-2 rounded-lg border border-secondary bg-primary px-2 py-1.5"
              >
                <Checkbox
                  size="sm"
                  aria-label={`Done: ${f.text}`}
                  isSelected={f.status === "done"}
                  onChange={() => api.toggleFollowUp(f.id)}
                  className="mt-0.5"
                />
                <span
                  className={cx(
                    "text-sm",
                    f.status === "done" && "text-quaternary line-through"
                  )}
                >
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Agenda, in template order */}
      <section className="rounded-xl border border-secondary p-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold text-stone-700 dark:text-stone-200">
            Agenda
          </h3>
          <span className="text-caption tabular-nums text-quaternary">
            {covered} of {agenda.length} covered
          </span>
        </div>

        {agenda.length === 0 && (
          <p className="py-4 text-center text-sm text-quaternary">
            Nothing slotted — add topics below, or drag some in from the Planner.
          </p>
        )}

        <div className="mt-2 space-y-3">
          {bands.map((band) => {
            const tag = band.tagId ? tagById.get(band.tagId) : undefined;
            return (
              <div key={band.id}>
                <div className="flex items-center gap-1.5 pb-1">
                  <span
                    className={cx("size-2 shrink-0 rounded-full", tagDotClass(tag))}
                    aria-hidden
                  />
                  <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
                    {band.label}
                  </span>
                  {band.minutes ? (
                    <span className="text-caption text-quaternary">
                      {band.minutes} min
                    </span>
                  ) : null}
                </div>
                <ul className="space-y-1.5">
                  {band.topics.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start gap-2 rounded-lg border border-secondary px-2 py-1.5"
                    >
                      <Checkbox
                        size="sm"
                        aria-label={`Covered “${t.text}”`}
                        isSelected={t.status === "covered"}
                        onChange={(c) => api.coverTopic(t.id, c)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={cx(
                            "text-sm",
                            t.status === "covered" && "text-quaternary line-through"
                          )}
                        >
                          {t.text}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {t.tagIds.map((id) => {
                            const tg = tagById.get(id);
                            return tg ? <TagChip key={id} tag={tg} /> : null;
                          })}
                          {t.carried > 0 && (
                            <span className="text-caption text-amber-700 dark:text-amber-500">
                              pushed {t.carried}×
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Things get raised mid-meeting — capture them where they land. */}
                <InlineComposer
                  compact={false}
                  placeholder={`Add to ${band.label}…`}
                  onAdd={(raw) =>
                    api.addTopic(raw, {
                      kind: "session",
                      meetingId: meeting.id,
                      sessionId: session.id,
                      sectionId: band.id === UNSORTED ? undefined : band.id,
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Notes + transcript */}
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-secondary p-3">
          <h3 className="mb-2 text-xs font-semibold">Notes</h3>
          <TextArea
            aria-label="Meeting notes"
            placeholder="What did you cover?"
            rows={8}
            value={session.notes ?? ""}
            onChange={(v) => api.updateSession(session.id, { notes: v })}
          />
          {session.uncovered && session.uncovered.length > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-caption text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
              Not covered: {session.uncovered.join(", ")}
            </p>
          )}
        </section>
        <section className="rounded-xl border border-secondary p-3">
          <h3 className="mb-2 text-xs font-semibold">Transcript</h3>
          <TextArea
            aria-label="Transcript"
            placeholder="Paste or dictate (live app uses Web Speech)."
            rows={8}
            value={session.transcript ?? ""}
            onChange={(v) => api.updateSession(session.id, { transcript: v })}
          />
        </section>
      </div>

      {/* New action item */}
      <section className="rounded-xl border border-secondary p-3">
        <h3 className="mb-2 text-xs font-semibold">Action item</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            api.addFollowUp(followDraft, meeting.id, session.id);
            setFollowDraft("");
          }}
        >
          <Input
            size="sm"
            className="flex-1"
            placeholder="Something to follow up on…"
            value={followDraft}
            onChange={setFollowDraft}
            aria-label="New action item"
          />
          <Button
            size="sm"
            color="secondary"
            type="submit"
            isDisabled={!followDraft.trim()}
          >
            Add
          </Button>
        </form>
      </section>

      {/* Close-out summary */}
      {closing && (
        <div className="rounded-xl border border-teal-300 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/40">
          <p className="text-sm font-medium text-teal-900 dark:text-teal-300">
            {covered} of {agenda.length} covered.
            {open.length === 0 && " All clear."}
            {open.length > 0 && state.carryMode === "inbox" && (
              <>
                {" "}
                {open.length === 1
                  ? "One topic goes"
                  : `${open.length} topics go`}{" "}
                back to Ideas, noted against this date.
              </>
            )}
            {open.length > 0 && state.carryMode === "forward" && nextDest && (
              <>
                {" "}
                {open.length === 1
                  ? "The remaining topic"
                  : `The remaining ${open.length} topics`}{" "}
                carry to {slotLabel(nextDest)}.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              color="primary"
              onClick={() => {
                setClosing(false);
                api.setSurface(state.carryMode === "inbox" ? "ideas" : "planner");
              }}
            >
              {state.carryMode === "inbox" ? "Go to Ideas" : "Back to Planner"}
            </Button>
            <Button size="sm" color="secondary" onClick={() => setClosing(false)}>
              Keep editing
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
