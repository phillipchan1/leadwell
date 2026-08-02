import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import type { Manager, Person, Team } from "../types";
import {
  coachPresets,
  hasApiKey,
  managerCoachPresets,
  managerSystemPrompt,
  orgSystemPrompt,
  personSystemPrompt,
  streamChat,
  teamCoachPresets,
  teamSystemPrompt,
} from "../lib/ai";
import { inputCls } from "./ui";
import { Button } from "@/components/base/buttons/button";

/**
 * Chat panel. Scoped to a person, a manager, or a team when given, otherwise
 * org-level (the header "Ask AI" button). History persists per subject.
 */
export function AICoach({
  person,
  manager,
  team,
}: {
  person?: Person;
  manager?: Manager;
  team?: Team;
}) {
  const chatKey =
    person?.id ??
    (manager ? `mgr:${manager.id}` : team ? `team:${team.id}` : "org");
  const { chats, appendChat, clearChat } = useStore();
  const presets = person
    ? coachPresets(person)
    : manager
      ? managerCoachPresets(manager)
      : team
        ? teamCoachPresets(team)
        : [];
  const history = chats[chatKey] ?? [];
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const keyed = hasApiKey();

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
        : manager
          ? managerSystemPrompt(manager.id)
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
      <div className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700">
        <p className="font-medium text-stone-600 dark:text-stone-300">
          AI coach unavailable
        </p>
        <p className="mt-1 text-xs leading-relaxed">
          Sign in and make sure the server AI function is deployed. There is no
          API key to paste in the browser.
        </p>
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
            person
              ? `Ask about leading ${person.name.split(" ")[0]}…`
              : team
                ? `Ask about leading ${team.name}…`
                : "Ask about your org…"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button
          type="submit"
          size="md"
          isDisabled={!input.trim() || streaming !== null}
          isLoading={streaming !== null}
          showTextWhileLoading
        >
          {streaming !== null ? "…" : "Send"}
        </Button>
      </form>
      {history.length > 0 && (
        <Button
          size="sm"
          color="link-gray"
          className="self-start"
          onClick={() => clearChat(chatKey)}
        >
          Clear conversation
        </Button>
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
