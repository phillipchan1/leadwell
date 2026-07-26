import { useState, type ReactNode } from "react";
import { useStore } from "../store/useStore";
import {
  DOMAIN_COLOR,
  DOMAINS,
  MBTI,
  parseEnneagram,
  THEME_DOMAIN,
} from "../data/frameworks";
import { derivedRead, hasLeadershipRead } from "../lib/derive";
import { Avatar } from "./Avatar";
import { Chip, SectionTitle } from "./ui";
import { AssessmentEditor } from "./AssessmentEditor";
import { MeModal } from "./forms";
import { ProfileFillModal } from "./ProfileFillModal";

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
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 transition-colors ${
        danger
          ? "border-stone-200 text-stone-400 hover:border-red-300 hover:text-red-600 dark:border-stone-700"
          : "border-stone-200 text-stone-600 hover:border-teal-400 hover:text-teal-700 dark:border-stone-700 dark:text-stone-300"
      }`}
    >
      {children}
    </button>
  );
}

/** Side panel for the signed-in leader — identity + self-assessment. */
export function MeProfile() {
  const { me, selectMe, teams, people } = useStore();
  const read = derivedRead(me);
  const enn = parseEnneagram(me.assessments.enneagram);
  const top5 = me.assessments.cliftonTop5 ?? [];
  const mbtiKey = me.assessments.mbti?.toUpperCase();
  const customMods = me.customModalities ?? [];
  const hasRead = hasLeadershipRead(me);
  const withRead = people.filter(hasLeadershipRead).length;

  const [editingIdentity, setEditingIdentity] = useState(false);
  const [editingAssessments, setEditingAssessments] = useState(false);
  const [fillingProfile, setFillingProfile] = useState(false);

  return (
    <div className="flex h-full flex-col border-l border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <div className="shrink-0 border-b border-stone-200 p-4 dark:border-stone-800">
        <div className="flex items-start gap-3">
          <Avatar name={me.name} photo={me.photo} size={48} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{me.name}</div>
            <div className="text-xs text-stone-500">
              {me.title ?? "Leader"} · you
            </div>
            <div className="mt-1 text-[11px] text-stone-400">
              {teams.length} teams · {withRead}/{people.length} with a read
            </div>
          </div>
          <button
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
            aria-label="Close profile"
            onClick={() => selectMe(false)}
          >
            ✕
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <QuickAction onClick={() => setFillingProfile(true)}>
            ✨ AI fill
          </QuickAction>
          <QuickAction onClick={() => setEditingAssessments(true)}>
            Assessments
          </QuickAction>
          <QuickAction onClick={() => setEditingIdentity(true)}>
            Edit
          </QuickAction>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="space-y-3">
          <SectionTitle>My profile</SectionTitle>
          <p className="text-xs text-stone-500">
            Self-assess so coaching and team reads know how you&apos;re wired —
            not only the people you lead.
          </p>

          {!hasRead ? (
            <div className="space-y-2">
              <button
                onClick={() => setFillingProfile(true)}
                className="w-full rounded-xl border border-dashed border-stone-300 py-6 text-sm text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
              >
                ✨ Map my profile
                <div className="mt-1 text-xs">
                  Brain dump or guided mapping
                </div>
              </button>
              <button
                onClick={() => setEditingAssessments(true)}
                className="w-full rounded-xl border border-dashed border-stone-300 py-3 text-xs text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
              >
                Or enter assessments manually
              </button>
            </div>
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
                        className="flex items-center gap-1 text-[10px] text-stone-400"
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
                    <div className="text-[10px] tracking-wider text-stone-400 uppercase">
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
                    <div className="text-[10px] tracking-wider text-stone-400 uppercase">
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
                      <div className="text-[10px] tracking-wider text-stone-400 uppercase">
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
                        <Chip key={s} tone="positive">
                          {s}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {read.watchOuts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {read.watchOuts.map((s) => (
                        <Chip key={s} tone="warning">
                          ⚠ {s}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {me.howToLead && (
                <div className="rounded-xl border-l-2 border-teal-500 bg-teal-50/50 p-3 text-xs leading-relaxed text-stone-600 dark:bg-teal-950/20 dark:text-stone-300">
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
      {fillingProfile && (
        <ProfileFillModal self onClose={() => setFillingProfile(false)} />
      )}
    </div>
  );
}
