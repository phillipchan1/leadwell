import { useState, type ReactNode } from "react";
import { AlertTriangle } from "@untitledui/icons";
import { useStore } from "../store/useStore";
import { useDismiss } from "@/hooks/use-dismiss";
import {
  DOMAIN_COLOR,
  DOMAINS,
  MBTI,
  parseEnneagram,
  THEME_DOMAIN,
} from "../data/frameworks";
import { derivedRead, hasLeadershipRead } from "../lib/derive";
import { Avatar } from "./Avatar";
import { SectionTitle } from "./ui";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { AssessmentEditor } from "./AssessmentEditor";
import { MeModal } from "./forms";
import type { Density } from "./EntitySurface";

function QuickAction({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <Button
      size="sm"
      color={danger ? "secondary-destructive" : "secondary"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * The signed-in leader's own profile — identity + self-assessment.
 *
 * On the five-mode contract as `profile` alone (see lib/entityModes). That is
 * the whole of it: there are no meetings with yourself, no running record about
 * yourself distinct from this page, and no sibling pager. A one-tab strip would
 * be a worse answer than no strip, so this renders the mode directly — but it
 * is now *named* by the contract instead of sitting outside it, which is what
 * made it the third sub-navigation vocabulary.
 */
export function MeProfile({ density: _density = "peek" }: { density?: Density }) {
  const me = useStore((s) => s.me);
  const selectMe = useStore((s) => s.selectMe);
  // Escape closed every other entity panel and not this one.
  useDismiss(() => selectMe(false));
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const read = derivedRead(me);
  const enn = parseEnneagram(me.assessments.enneagram);
  const top5 = me.assessments.cliftonTop5 ?? [];
  const mbtiKey = me.assessments.mbti?.toUpperCase();
  const customMods = me.customModalities ?? [];
  const hasRead = hasLeadershipRead(me);
  const withRead = people.filter(hasLeadershipRead).length;

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [editingAssessments, setEditingAssessments] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col bg-primary">
      <div className="entity-header shrink-0 border-b border-secondary p-6">
        <div className="flex items-start gap-3">
          <Avatar name={me.name} photo={me.photo} size={48} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold">{me.name}</div>
            <div className="text-xs text-stone-500">
              {me.title ?? "Leader"} · you
            </div>
            <div className="mt-1 text-caption text-quaternary">
              {teams.length} teams · {withRead}/{people.length} with a read
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <QuickAction onClick={() => setEditingAssessments(true)}>
            Assessments
          </QuickAction>
          <QuickAction onClick={() => setEditingIdentity(true)}>
            Edit
          </QuickAction>
        </div>
      </div>

      <div className="scroll-contain min-h-0 flex-1 overflow-y-auto p-6">
        <section className="space-y-3">
          <SectionTitle>My profile</SectionTitle>
          <p className="text-xs text-stone-500">
            Self-assess so team reads know how you&apos;re wired — not only the
            people you lead.
          </p>

          {!hasRead ? (
            <button
              onClick={() => setEditingAssessments(true)}
              className="w-full rounded-xl border border-dashed border-primary py-6 text-sm text-quaternary hover:border-teal-500 hover:text-teal-600"
            >
              Enter assessments
              <div className="mt-1 text-xs">
                CliftonStrengths, Enneagram, MBTI, or other modalities
              </div>
            </button>
          ) : (
            <>
              {top5.length > 0 && (
                <div>
                  <ol className="flex flex-wrap gap-1.5">
                    {top5.map((t, i) => (
                      <li
                        key={t}
                        className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                        style={{
                          backgroundColor: DOMAIN_COLOR[THEME_DOMAIN[t]],
                        }}
                      >
                        {i + 1}. {t}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {DOMAINS.map((d) => (
                      <span
                        key={d}
                        className="flex items-center gap-1 text-caption text-quaternary"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: DOMAIN_COLOR[d] }}
                        />
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {enn && (
                  <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60">
                    <div className="text-caption tracking-wider text-quaternary uppercase">
                      Enneagram
                    </div>
                    <div className="text-sm font-semibold">
                      {me.assessments.enneagram}
                    </div>
                    <div className="text-xs text-stone-500">{enn.name}</div>
                  </div>
                )}
                {mbtiKey && MBTI[mbtiKey] && (
                  <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60">
                    <div className="text-caption tracking-wider text-quaternary uppercase">
                      MBTI
                    </div>
                    <div className="text-sm font-semibold">{mbtiKey}</div>
                    <div className="text-xs text-stone-500">
                      {MBTI[mbtiKey].split("—")[0].trim()}
                    </div>
                  </div>
                )}
              </div>
              {customMods.length > 0 && (
                <div className="space-y-2">
                  {customMods.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60"
                    >
                      <div className="text-caption tracking-wider text-quaternary uppercase">
                        {m.name}
                      </div>
                      <div className="text-sm font-semibold">{m.result}</div>
                      {m.notes && (
                        <div className="mt-0.5 text-xs text-stone-500">
                          {m.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(read.strengths.length > 0 || read.watchOuts.length > 0) && (
                <div className="space-y-2">
                  {read.strengths.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {read.strengths.map((s) => (
                        <Badge key={s} size="sm" color="success">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {read.watchOuts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {read.watchOuts.map((s) => (
                        <Badge key={s} size="sm" color="warning">
                          <AlertTriangle className="mr-1 inline size-3 shrink-0 align-[-0.1em]" aria-hidden="true" />
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {me.howToLead && (
                <div className="rounded-xl border-l-2 border-teal-500 bg-teal-50/50 p-3 text-xs leading-relaxed text-tertiary dark:bg-teal-950/20">
                  <span className="font-medium text-teal-700 dark:text-teal-400">
                    How I work best:{" "}
                  </span>
                  {me.howToLead}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {editingIdentity && <MeModal onClose={() => setEditingIdentity(false)} />}
      {editingAssessments && (
        <AssessmentEditor self onClose={() => setEditingAssessments(false)} />
      )}
    </div>
  );
}
