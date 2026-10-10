import { useStore } from "@/store/useStore";
import { cx } from "@/utils/cx";

/**
 * Meetings and Ideas, side by side, on a phone.
 *
 * The phone's tab bar has room for four places and the capture button, and
 * Ideas is the one that gives way — but it's the pile every meeting is planned
 * from, so it can't be a long way off. It sits one tap from Meetings instead.
 */
export function MeetingsSwitch({ current }: { current: "meetings" | "ideas" }) {
  const setTab = useStore((s) => s.setTab);
  const topics = useStore((s) => s.topics);
  const ideas = topics.filter((t) => t.status === "open" && !t.sessionId && t.lane !== "parked").length;
  const item = (id: "meetings" | "ideas", label: string, count?: number) => {
    const on = current === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => !on && setTab(id)}
        className={cx(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] touch:min-h-11",
          on
            ? "bg-primary font-semibold text-primary shadow-[0_1px_2px_rgba(10,34,37,0.12)]"
            : "font-medium text-tertiary"
        )}
      >
        {label}
        {count !== undefined && <span className="font-mono text-[10.5px] text-quaternary">{count}</span>}
      </button>
    );
  };
  return (
    <div
      role="tablist"
      aria-label="Meetings and ideas"
      className="inline-flex gap-0.5 self-start rounded-[11px] bg-tertiary p-[3px] md:hidden"
    >
      {item("meetings", "Meetings")}
      {item("ideas", "Ideas", ideas)}
    </div>
  );
}
