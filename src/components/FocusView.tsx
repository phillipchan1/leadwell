import { useStore } from "../store/useStore";
import { EntityChrome } from "./EntityChrome";
import { EntityBody, useSelectedEntity } from "./EntitySurface";

/** Sections that are really tables or boards and want the wider column. */
const WIDE_SECTIONS = new Set(["sessions", "topics", "members"]);

/**
 * The full page for one entity. It replaces the canvas rather than covering it
 * — the point of promoting out of the peek is room to work, so nothing here
 * competes for width or asks to be dismissed before you can use the app again.
 */
export function FocusView() {
  const { section } = useStore();
  const selected = useSelectedEntity();
  if (!selected) return null;

  const wide = section ? WIDE_SECTIONS.has(section) : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-stone-100/60 dark:bg-stone-950">
      <EntityChrome mode="focus" />
      <div className="flex min-h-0 flex-1 justify-center">
        <div
          className={`flex min-h-0 w-full flex-col border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:border-x ${
            wide ? "max-w-5xl" : "max-w-3xl"
          }`}
        >
          <EntityBody density="focus" />
        </div>
      </div>
    </div>
  );
}
