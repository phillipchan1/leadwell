import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import type { Person } from "../types";
import {
  coachPresets,
  hasApiKey,
  orgSystemPrompt,
  personSystemPrompt,
  streamChat,
} from "../lib/ai";
import { inputCls } from "./ui";

/**
 * Chat panel. Scoped to a person when `person` is given, otherwise org-level
 * (the header "Ask AI" button). History persists per person in the store.
 */
export function AICoach({ person }: { person?: Person }) {
  const chatKey = person?.id ?? "org";
  const { chats, appendChat, clearChat } = useStore();
  const history = chats[chatKey] ?? [];
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      const system = person ? personSystemPrompt(person.id) : orgSystemPrompt();
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

  if (!hasApiKey) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700">
        <p className="font-medium text-stone-600 dark:text-stone-300">
          Add your API key to enable the AI coach
        </p>
        <p className="mt-1 text-xs leading-relaxed">
          Create a <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">.env.local</code>{" "}
          file in the project root with{" "}
          <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
            VITE_ANTHROPIC_API_KEY=sk-ant-...
          </code>{" "}
          and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Presets */}
      {person && (
        <div className="flex flex-wrap gap-1.5">
          {coachPresets(person).map((p) => (
            <button
              key={p.label}
              onClick={() => send(p.prompt)}
              disabled={streaming !== null}
              className="rounded-full border border-stone-300 px-2.5 py-1 text-xs text-stone-600 hover:border-teal-500 hover:text-teal-600 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {(history.length > 0 || streaming !== null) && (
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60">
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
            person ? `Ask about leading ${person.name.split(" ")[0]}…` : "Ask about your org…"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming !== null}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {streaming !== null ? "…" : "Send"}
        </button>
      </form>
      {history.length > 0 && (
        <button
          className="self-start text-[11px] text-stone-400 hover:underline"
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
            ? "bg-teal-600 text-white"
            : "border border-stone-200 bg-white text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
