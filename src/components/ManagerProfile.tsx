import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { Manager } from "../types";
import { Avatar } from "./Avatar";
import { Badge, SectionTitle } from "./ui";
import { ManagerModal } from "./forms";
import { AICoach } from "./AICoach";
import { LeadUpManual } from "./LeadUpManual";
import { WinsLedger } from "./WinsLedger";

/**
 * Side panel for a leader I report to. Managers have no assessments, goals, or
 * 1:1 history — leading up is the operating manual, the wins banked in their
 * currency, and a coach that reasons off both.
 */
export function ManagerProfile({ manager }: { manager: Manager }) {
  const {
    domains,
    selectManager,
    updateManagerLeadUp,
    deleteManager,
    modal,
    askAIOpen,
    settingsOpen,
  } = useStore();

  const domain = domains.find((d) => d.id === manager.domainId);
  const [editing, setEditing] = useState(false);

  useEffect(() => setEditing(false), [manager.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal || askAIOpen || settingsOpen || editing) return;
      e.preventDefault();
      selectManager(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, askAIOpen, settingsOpen, editing, selectManager]);

  return (
    <aside className="relative flex h-full flex-col overflow-hidden border-l border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      {/* Header */}
      <div className="shrink-0 border-b border-stone-200 bg-white/90 p-4 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <div className="flex items-start gap-3">
          <Avatar name={manager.name} photo={manager.photo} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{manager.name}</h2>
            <div className="text-xs text-stone-500">
              {manager.role ?? "Leader I report to"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge color="#3B82F6">Leading up</Badge>
              {domain && <Badge color={domain.color}>{domain.name}</Badge>}
            </div>
          </div>
          <button
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
            aria-label="Close profile"
            onClick={() => selectManager(null)}
          >
            ✕
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <QuickAction onClick={() => setEditing(true)}>Edit</QuickAction>
          <QuickAction
            danger
            onClick={() => {
              if (confirm(`Remove ${manager.name}?`)) deleteManager(manager.id);
            }}
          >
            Remove
          </QuickAction>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 p-4">
          <LeadUpManual
            key={manager.id}
            subject={manager}
            onChange={(patch) => updateManagerLeadUp(manager.id, patch)}
          />
          <WinsLedger subjectId={manager.id} />
          <section className="space-y-2">
            <SectionTitle>AI coach</SectionTitle>
            <AICoach manager={manager} />
          </section>
        </div>
      </div>

      {editing && (
        <ManagerModal manager={manager} onClose={() => setEditing(false)} />
      )}
    </aside>
  );
}

function QuickAction({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 transition-colors ${
        danger
          ? "border-stone-200 text-stone-400 hover:border-red-300 hover:text-red-500 dark:border-stone-700"
          : "border-stone-200 text-stone-600 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:text-stone-300"
      }`}
    >
      {children}
    </button>
  );
}
