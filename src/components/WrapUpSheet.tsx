import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Stars02 } from "@untitledui/icons";
import { useStore } from "../store/useStore";
import { Modal } from "./ui";
import { CADENCE_LABEL, KIND_LABEL } from "../lib/knowledge";
import {
  draftWrapUp,
  markWrapped,
  rememberDismissed,
  wrapUpContext,
  type WrapUp,
  type WrapUpContext,
} from "../lib/wrapUp";
import { cx } from "@/utils/cx";

/**
 * After the meeting: what it leaves behind, as suggestions with checkboxes.
 *
 * Drafted by the model from the transcript and your notes (src/lib/wrapUp.ts),
 * then nothing is written until Apply. Commitments, decisions and what was
 * covered start ticked — they're what the meeting was. New fixtures and
 * glossary words start unticked: they change what Polarch believes from now
 * on, so they're yours to opt into, and the ones left unticked aren't offered
 * again.
 */
export function WrapUpSheet({
  sessionId,
  onDone,
  onSkip,
}: {
  sessionId: string;
  /** Applied (or nothing to apply). */
  onDone: () => void;
  /** Closed without applying anything. */
  onSkip: () => void;
}) {
  const [ctx] = useState<WrapUpContext | null>(() => wrapUpContext(useStore.getState(), sessionId));
  const [draft, setDraft] = useState<WrapUp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ctx) return;
    let live = true;
    setError(null);
    setDraft(null);
    draftWrapUp(ctx)
      .then((d) => {
        if (!live) return;
        setDraft(d);
        // Suggestions that change what Polarch believes start unticked.
        const start = new Set<string>([
          ...d.newFixtures.map((_, i) => `newfx:${i}`),
          ...d.glossary.map((_, i) => `gl:${i}`),
        ]);
        if (ctx.notes.trim()) start.add("writeUp");
        setOff(start);
      })
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : "The wrap-up failed."));
    return () => {
      live = false;
    };
  }, [ctx, attempt]);

  const on = (key: string) => !off.has(key);
  const toggle = (key: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const count = useMemo(() => {
    if (!draft) return 0;
    const keys = [
      draft.writeUp ? "writeUp" : null,
      draft.point ? "point" : null,
      ...draft.covered.map((id) => `cov:${id}`),
      draft.arcStepDone ? "arc" : null,
      ...draft.followUps.map((_, i) => `fu:${i}`),
      ...draft.closedFollowUps.map((id) => `close:${id}`),
      ...draft.decisions.map((_, i) => `decision:${i}`),
      ...draft.themes.map((_, i) => `theme:${i}`),
      ...draft.facts.map((_, i) => `fact:${i}`),
      ...draft.fixturesTouched.map((id) => `fx:${id}`),
      ...draft.newFixtures.map((_, i) => `newfx:${i}`),
      ...draft.glossary.map((_, i) => `gl:${i}`),
    ];
    return keys.filter((k): k is string => Boolean(k) && on(k!)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, off]);

  if (!ctx) return null;

  const apply = () => {
    if (!draft) return;
    const s = useStore.getState();
    const session = s.sessions.find((o) => o.id === sessionId);
    if (!session) return;
    const date = session.date;
    const subject = [ctx.subjectKind, ctx.subjectId] as const;

    if (draft.writeUp && on("writeUp")) {
      const notes = session.notes?.trim();
      s.updateSession(sessionId, { notes: notes ? `${notes}\n\n${draft.writeUp}` : draft.writeUp });
    }
    if (draft.point && on("point") && !session.point?.trim()) s.updateSession(sessionId, { point: draft.point });
    for (const id of draft.covered) if (on(`cov:${id}`)) s.coverTopic(id, true);
    if (draft.arcStepDone && ctx.arcStep && on("arc")) {
      s.markArcStep(ctx.arcStep.arcId, ctx.arcStep.stepId, sessionId, "done");
    }
    const shares = s.shares.filter((x) => x.meetingId === ctx.meetingId);
    draft.followUps.forEach((f, i) => {
      if (!on(`fu:${i}`)) return;
      const id = s.addFollowUp(...subject, f.text, { meetingId: ctx.meetingId, sourceSessionId: sessionId });
      // Who owes it only means something on a shared meeting.
      if (id && shares.length && f.owner !== "me") {
        s.updateFollowUp(id, { owner: f.owner === "both" ? "both" : shares[0].id });
      }
    });
    for (const id of draft.closedFollowUps) {
      const f = s.followUps.find((x) => x.id === id);
      if (on(`close:${id}`) && f?.status === "open") s.toggleFollowUp(id);
    }
    const file = (kind: "decision" | "theme" | "fact", list: string[]) =>
      list.forEach((text, i) => on(`${kind}:${i}`) && s.addKnowledge(...subject, kind, text, { sessionId, notedOn: date }));
    file("decision", draft.decisions);
    file("theme", draft.themes);
    file("fact", draft.facts);
    for (const id of draft.fixturesTouched) {
      const f = s.fixtures.find((x) => x.id === id);
      if (on(`fx:${id}`) && f && (!f.lastTouchedOn || f.lastTouchedOn < date)) s.updateFixture(id, { lastTouchedOn: date });
    }
    draft.newFixtures.forEach((f, i) => {
      if (on(`newfx:${i}`)) s.addFixture(...subject, f.title, { owner: f.owner, cadence: f.cadence, lastTouchedOn: date });
    });
    draft.glossary.forEach((g, i) => on(`gl:${i}`) && s.addGlossaryTerm(g.meant, g.heard));

    rememberDismissed({
      fixtures: draft.newFixtures.filter((_, i) => !on(`newfx:${i}`)).map((f) => f.title),
      glossary: draft.glossary.filter((_, i) => !on(`gl:${i}`)).map((g) => `${g.heard}→${g.meant}`),
    });
    markWrapped(sessionId);
    onDone();
  };

  const edit = (key: "followUps" | "decisions" | "themes" | "facts", i: number, text: string) =>
    setDraft((d) => {
      if (!d) return d;
      if (key === "followUps") return { ...d, followUps: d.followUps.map((f, j) => (j === i ? { ...f, text } : f)) };
      return { ...d, [key]: d[key].map((x, j) => (j === i ? text : x)) };
    });

  const topicText = (id: string) => ctx.topics.find((t) => t.id === id)?.text ?? "";
  const followText = (id: string) => ctx.followUps.find((f) => f.id === id)?.text ?? "";
  const fixtureText = (id: string) => ctx.fixtures.find((f) => f.id === id)?.title ?? "";
  const empty =
    draft &&
    !draft.writeUp &&
    ![
      draft.covered,
      draft.followUps,
      draft.closedFollowUps,
      draft.decisions,
      draft.themes,
      draft.facts,
      draft.fixturesTouched,
      draft.newFixtures,
      draft.glossary,
    ].some((l) => l.length);

  return (
    <Modal
      title="Wrap up"
      subtitle={`${ctx.meetingTitle} · nothing is saved until you apply it`}
      onClose={onSkip}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onSkip}
            className="h-10 rounded-[10px] px-4 text-[14px] font-semibold text-tertiary hover:text-secondary"
          >
            {draft ? "Skip" : "Finish without it"}
          </button>
          <button
            type="button"
            onClick={draft ? apply : onDone}
            disabled={!draft && !error}
            className="h-10 rounded-[10px] bg-teal-600 px-4 text-[14px] font-semibold text-white disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950"
          >
            {draft && !empty ? `Apply ${count}` : "Done"}
          </button>
        </>
      }
    >
      {!draft && !error && (
        <div className="flex items-center gap-3 py-10 text-[14px] text-secondary" role="status">
          <Stars02 aria-hidden className="size-5 animate-pulse text-teal-600" />
          Reading the transcript and your notes…
        </div>
      )}

      {error && (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-[14px] text-secondary">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="h-9 rounded-[9px] border border-primary px-3.5 text-[13px] font-semibold"
          >
            Try again
          </button>
        </div>
      )}

      {draft && empty && (
        <p className="py-6 text-[14px] text-secondary">Nothing to file from this one — no decisions, commitments or new names.</p>
      )}

      {draft && !empty && (
        <div className="flex flex-col gap-6">
          {draft.writeUp && (
            <Group title="Write-up">
              <Item
                checked={on("writeUp")}
                onToggle={() => toggle("writeUp")}
                label={ctx.notes.trim() ? "Add below your notes" : "Use as the write-up"}
              >
                <pre className="mt-1.5 max-h-56 overflow-y-auto rounded-[10px] bg-secondary px-3 py-2.5 font-sans text-[13px] leading-[19px] whitespace-pre-wrap text-secondary">
                  {draft.writeUp}
                </pre>
              </Item>
              {draft.point && (
                <Item checked={on("point")} onToggle={() => toggle("point")} label={`Why we met: ${draft.point}`} />
              )}
            </Group>
          )}

          {(draft.covered.length > 0 || draft.arcStepDone || draft.closedFollowUps.length > 0) && (
            <Group title="Covered">
              {draft.covered.map((id) => (
                <Item key={id} checked={on(`cov:${id}`)} onToggle={() => toggle(`cov:${id}`)} label={topicText(id)} />
              ))}
              {draft.arcStepDone && ctx.arcStep && (
                <Item
                  checked={on("arc")}
                  onToggle={() => toggle("arc")}
                  label={`${ctx.arcStep.title} · ${ctx.arcStep.label} — done`}
                />
              )}
              {draft.closedFollowUps.map((id) => (
                <Item
                  key={id}
                  checked={on(`close:${id}`)}
                  onToggle={() => toggle(`close:${id}`)}
                  label={`Done: ${followText(id)}`}
                />
              ))}
            </Group>
          )}

          {draft.followUps.length > 0 && (
            <Group title="New follow-ups">
              {draft.followUps.map((f, i) => (
                <Item key={i} checked={on(`fu:${i}`)} onToggle={() => toggle(`fu:${i}`)}>
                  <EditLine value={f.text} onChange={(t) => edit("followUps", i, t)} />
                </Item>
              ))}
            </Group>
          )}

          {(draft.decisions.length > 0 || draft.themes.length > 0 || draft.facts.length > 0) && (
            <Group title={`What we know about ${ctx.subjectName || "them"}`}>
              {(["decision", "theme", "fact"] as const).flatMap((kind) => {
                const key = kind === "decision" ? "decisions" : kind === "theme" ? "themes" : "facts";
                return draft[key].map((text, i) => (
                  <Item key={`${kind}:${i}`} checked={on(`${kind}:${i}`)} onToggle={() => toggle(`${kind}:${i}`)}>
                    <span className="font-mono text-[10.5px] text-quaternary uppercase">{KIND_LABEL[kind]}</span>
                    <EditLine value={text} onChange={(t) => edit(key, i, t)} />
                  </Item>
                ));
              })}
            </Group>
          )}

          {(draft.fixturesTouched.length > 0 || draft.newFixtures.length > 0) && (
            <Group title="Fixtures">
              {draft.fixturesTouched.map((id) => (
                <Item
                  key={id}
                  checked={on(`fx:${id}`)}
                  onToggle={() => toggle(`fx:${id}`)}
                  label={`${fixtureText(id)} came up`}
                />
              ))}
              {draft.newFixtures.map((f, i) => (
                <Item
                  key={i}
                  checked={on(`newfx:${i}`)}
                  onToggle={() => toggle(`newfx:${i}`)}
                  label={`New: ${f.title}`}
                  hint={[f.owner, CADENCE_LABEL[f.cadence]].filter(Boolean).join(" · ")}
                  suggested
                />
              ))}
            </Group>
          )}

          {draft.glossary.length > 0 && (
            <Group title="Glossary">
              {draft.glossary.map((g, i) => (
                <Item
                  key={i}
                  checked={on(`gl:${i}`)}
                  onToggle={() => toggle(`gl:${i}`)}
                  label={`Always write “${g.meant}” for “${g.heard}”`}
                  suggested
                />
              ))}
            </Group>
          )}
        </div>
      )}
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="eyebrow">{title}</h3>
      <ul className="flex flex-col gap-1">{children}</ul>
    </section>
  );
}

function Item({
  checked,
  onToggle,
  label,
  hint,
  suggested,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  label?: string;
  hint?: string;
  /** Changes what Polarch believes from now on — opt in. */
  suggested?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className={cx("flex items-start gap-2.5 rounded-[10px] px-2 py-1.5", !checked && "opacity-60")}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={label ?? "Include"}
        className="mt-1 size-4 shrink-0 accent-teal-600"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        {label && (
          <span className="text-[14px] leading-[20px] text-primary">
            {label}
            {suggested && <span className="ml-2 font-mono text-[10.5px] text-quaternary uppercase">Suggested</span>}
          </span>
        )}
        {hint && <span className="text-[12px] text-tertiary">{hint}</span>}
        {children}
      </span>
    </li>
  );
}

function EditLine({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="-mx-1 w-full rounded-[6px] border border-transparent bg-transparent px-1 py-0.5 text-[14px] leading-[20px] text-primary outline-none hover:border-secondary focus:border-teal-400"
    />
  );
}
