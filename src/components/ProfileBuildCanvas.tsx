import { useEffect, useState, type ReactNode } from "react";
import { DOMAINS, DOMAIN_COLOR } from "../data/frameworks";
import type { LiveProfileRead, ProfileSignal } from "../lib/profileSignals";

/** Animated ring + live signal canvas — Fantastical-style build-as-you-type. */
export function ProfileBuildCanvas({
  read,
  parsing,
  emptyHint,
}: {
  read: LiveProfileRead;
  /** True while AI is drafting — soft pulse on meters */
  parsing?: boolean;
  emptyHint?: string;
}) {
  const [tick, setTick] = useState(0);
  const signalKey = read.signals.map((s) => s.id).join("|");
  useEffect(() => {
    setTick((t) => t + 1);
  }, [signalKey]);

  const clifton = read.signals.filter((s) => s.kind === "clifton");
  const traits = read.signals.filter((s) => s.kind === "strength");
  const watches = read.signals.filter((s) => s.kind === "watchOut");
  const frameworks = read.signals.filter(
    (s) => s.kind === "enneagram" || s.kind === "mbti" || s.kind === "modality"
  );
  const leadUp = read.signals.filter((s) => s.kind === "leadUp");
  const howTo = read.signals.find((s) => s.kind === "howToLead");

  const domainMax = Math.max(1, ...DOMAINS.map((d) => read.domains[d]));

  return (
    <div
      className={`profile-build relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl ${
        parsing ? "profile-build--parsing" : ""
      }`}
    >
      <div className="profile-build__glow" aria-hidden />

      <div className="relative z-[1] flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-4">
          <MeterRing
            value={read.completeness}
            label="Complete"
            parsing={parsing}
          />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-medium tracking-wider text-stone-500 dark:text-stone-400 uppercase">
                  Confidence
                </span>
                <span className="font-mono text-xs tabular-nums text-teal-700 dark:text-teal-300">
                  {read.confidence}%
                </span>
              </div>
              <div className="profile-build__bar">
                <div
                  className="profile-build__bar-fill"
                  style={{ width: `${read.confidence}%` }}
                />
              </div>
            </div>
            <p className="profile-build__headline line-clamp-2 text-sm leading-snug text-stone-600 dark:text-stone-400">
              {read.headline || emptyHint || "Listening…"}
            </p>
          </div>
        </div>

        <section>
          <SectionLabel>Strength domains</SectionLabel>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {DOMAINS.map((d) => {
              const n = read.domains[d];
              const h = n ? Math.max(18, Math.round((n / domainMax) * 56)) : 6;
              return (
                <div key={d} className="flex flex-col items-center gap-1">
                  <div className="flex h-14 w-full items-end justify-center rounded-lg bg-stone-100/80 dark:bg-stone-950/50">
                    <div
                      className="profile-build__domain-bar w-[55%] rounded-t-md"
                      style={{
                        height: h,
                        backgroundColor: DOMAIN_COLOR[d],
                        opacity: n ? 1 : 0.2,
                      }}
                      title={`${d}: ${n}`}
                    />
                  </div>
                  <span className="text-[9px] leading-tight text-stone-500 dark:text-stone-400">
                    {d === "Relationship Building"
                      ? "Rel"
                      : d === "Strategic Thinking"
                        ? "Strat"
                        : d.slice(0, 4)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {clifton.length > 0 && (
          <SignalRow key={`c-${tick}`} label="Clifton themes" signals={clifton} />
        )}

        {frameworks.length > 0 && (
          <SignalRow
            key={`f-${tick}`}
            label="Frameworks"
            signals={frameworks}
          />
        )}

        {(traits.length > 0 || watches.length > 0) && (
          <div className="space-y-2" key={`t-${tick}`}>
            {traits.length > 0 && (
              <SignalRow
                label="Strengths forming"
                signals={traits}
                tone="positive"
              />
            )}
            {watches.length > 0 && (
              <SignalRow label="Watch-outs" signals={watches} tone="warning" />
            )}
          </div>
        )}

        {leadUp.length > 0 && (
          <SignalRow key={`l-${tick}`} label="Operating manual" signals={leadUp} />
        )}

        {howTo && (
          <div
            key={`h-${tick}`}
            className="profile-build__chip profile-build__chip--enter rounded-xl border-l-2 border-teal-500 bg-teal-50/40 px-3 py-2 text-xs text-stone-600 dark:bg-teal-950/25 dark:text-stone-400"
          >
            <span className="font-medium text-teal-700 dark:text-teal-400">
              {howTo.label}:{" "}
            </span>
            {howTo.detail || "signal detected"}
          </div>
        )}

        {read.signals.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="profile-build__pulse-dot" />
            <p className="max-w-[14rem] text-xs text-stone-500 dark:text-stone-400">
              {emptyHint ??
                "Names, themes, and traits will light up here as you type."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-medium tracking-wider text-stone-500 dark:text-stone-400 uppercase">
      {children}
    </div>
  );
}

function SignalRow({
  label,
  signals,
  tone = "neutral",
}: {
  label: string;
  signals: ProfileSignal[];
  tone?: "positive" | "warning" | "neutral";
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {signals.map((s, i) => (
          <span
            key={s.id}
            className={`profile-build__chip profile-build__chip--enter inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ${
              tone === "positive"
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                : tone === "warning"
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : s.color
                    ? ""
                    : "bg-white/80 text-stone-700 shadow-sm ring-1 ring-stone-200/80 dark:bg-stone-900/80 dark:text-stone-200 dark:ring-stone-700"
            }`}
            style={{
              animationDelay: `${Math.min(i, 8) * 45}ms`,
              ...(s.color
                ? {
                    backgroundColor: `${s.color}18`,
                    color: s.color,
                    boxShadow: `inset 0 0 0 1px ${s.color}40`,
                  }
                : {}),
            }}
            title={s.detail ? `${s.detail} · ${s.confidence}` : s.confidence}
          >
            {s.color && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
            )}
            {s.label}
            <span className="opacity-50">{confGlyph(s.confidence)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function confGlyph(c: ProfileSignal["confidence"]) {
  if (c === "high") return "●";
  if (c === "medium") return "◐";
  return "○";
}

function MeterRing({
  value,
  label,
  parsing,
}: {
  value: number;
  label: string;
  parsing?: boolean;
}) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div
      className={`relative h-[76px] w-[76px] shrink-0 ${parsing ? "animate-pulse" : ""}`}
    >
      <svg viewBox="0 0 72 72" className="-rotate-90 h-full w-full">
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-stone-200 dark:text-stone-800"
        />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="profile-build__ring text-teal-600 transition-[stroke-dashoffset] duration-500 ease-out dark:text-teal-400"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-100">
          {Math.round(value)}%
        </span>
        <span className="text-[8px] tracking-wide text-stone-500 dark:text-stone-400 uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}
