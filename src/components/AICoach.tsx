import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import type { Person, Team } from "../types";
import {
  coachPresets,
  hasApiKey,
  orgSystemPrompt,
  personSystemPrompt,
  streamChat,
  teamCoachPresets,
  teamSystemPrompt,
} from "../lib/ai";
import { inputCls } from "./ui";

/**
 * Chat panel. Scoped to a person or a team when given, otherwise org-level
 * (the header "Ask AI" button). History persists per subject in the store.
 */
export function AICoach({ person, team }: { person?: Person; team?: Team }) {
  const chatKey = person?.id ?? (team ? `team:${team.id}` : "org");
  const { chats, appendChat, clearChat, anthropicApiKey, setSettingsOpen } =
    useStore();
  const presets = person
    ? coachPresets(person)
    : team
      ? teamCoachPresets(team)
      : [];
  const history = chats[chatKey] ?? [];
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const keyed = hasApiKey();
  // Re-check when stored key changes
  void anthropicApiKey;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length, streaming]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming !== null) return;
    setError(null);
    setInput("");
    appendChat(chatKey, { role: "user", content: trimmed });
    setStreaming("");
    try {
      const system = person
        ? personSystemPrompt(person.id)
        : team
          ? teamSystemPrompt(team.id)
          : orgSystemPrompt();
      const messages = [
        ...(useStore.getState().chats[chatKey] ?? []),
      ];
      let acc = "";
      const full = await streamChat(system, messages, (delta) => {
        acc += delta;
        setStreaming(acc);
      });
      appendChat(chatKey, { role: "assistant", content: full });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStreaming(null);
    }
  };

  if (!keyed) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-2">
        <p className="font-medium text-ink">
          Add your API key to enable the AI coach
        </p>
        <p className="mt-1 text-xs leading-relaxed">
          Open Settings (⚙) and paste your Anthropic key, or add{" "}
          <code className="rounded bg-surface-2 px-1">
            VITE_ANTHROPIC_API_KEY
          </code>{" "}
          to <code className="rounded bg-surface-2 px-1">.env.local</code>.
        </p>
        <button
          type="button"
          className="btn-primary mt-3 text-xs"
          onClick={() => setSettingsOpen(true)}
        >
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => send(p.prompt)}
              disabled={streaming !== null}
              className="cursor-pointer rounded-full border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-accent/50 hover:text-accent-ink disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {(history.length > 0 || streaming !== null) && (
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-surface-2/60 p-3 ring-1 ring-line ring-inset">
          {history.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {streaming !== null && (
            <MessageBubble
              role="assistant"
              content={streaming || "…"}
            />
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500">
          {error}
        </p>
      )}

      {/* Input */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className={inputCls}
          placeholder={
            person
              ? `Ask about leading ${person.name.split(" ")[0]}…`
              : team
                ? `Ask about leading ${team.name}…`
                : "Ask about your org…"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming !== null}
          className="btn-primary"
        >
          {streaming !== null ? "…" : "Send"}
        </button>
      </form>
      {history.length > 0 && (
        <button
          className="self-start text-[11px] text-ink-3 hover:underline"
          onClick={() => clearChat(chatKey)}
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}

function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  return (
    <div className={role === "user" ? "flex justify-end" : "flex"}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
          role === "user"
            ? "bg-accent text-white"
            : "border border-line bg-surface text-ink-2 shadow-[0_1px_2px_rgb(35_32_28/0.05)]"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
