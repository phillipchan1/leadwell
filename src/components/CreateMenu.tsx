import { useState } from "react";
import { Plus, UserPlus01, Users01, UserUp01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { useStore } from "../store/useStore";
import { Modal } from "./ui";

/**
 * The one place you can add a person, a team or a manager from.
 *
 * Every create affordance used to live inside the React Flow `<Panel>`, which
 * is inside the canvas's `hidden … lg:flex` branch — so on a phone you could
 * not add anyone at all. Not "it was awkward": a new user installing the PWA on
 * their phone could not create their first team.
 *
 * It sits in the header rather than being a floating action button, because a
 * FAB on this app collides with two things it can't share space with: the
 * bottom nav, and the swipe-to-dismiss sheets.
 *
 * The forms themselves are untouched — `forms.tsx` already handled all three
 * kinds and already worked on mobile. This only had to be able to reach them.
 */
const KINDS = [
  {
    label: "Add person",
    hint: "Someone you lead",
    icon: UserPlus01,
    // `teamId: null` = a direct report, with no team. The form can move them.
    open: (openModal: OpenModal) => openModal({ kind: "person", teamId: null }),
  },
  {
    label: "Add team",
    hint: "A group you're responsible for",
    icon: Users01,
    open: (openModal: OpenModal) => openModal({ kind: "team" }),
  },
  {
    label: "Add manager",
    hint: "Someone you report to",
    icon: UserUp01,
    open: (openModal: OpenModal) => openModal({ kind: "manager" }),
  },
] as const;

type OpenModal = ReturnType<typeof useStore.getState>["openModal"];

export function CreateMenu() {
  const openModal = useStore((s) => s.openModal);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        color="secondary"
        aria-label="Add"
        iconLeading={Plus}
        onClick={() => setOpen(true)}
      />
      {open && (
        <Modal
          title="Add"
          subtitle="Who or what are you adding?"
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col gap-2">
            {KINDS.map(({ label, hint, icon: Icon, open: openKind }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  openKind(openModal);
                }}
                className="outline-focus-ring flex min-h-14 items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 active:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-800/50 dark:active:bg-stone-800"
              >
                <Icon
                  className="size-5 shrink-0 text-stone-500 dark:text-stone-400"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                    {hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
