import { EntityChrome } from "./EntityChrome";
import { EntityBody, useSelectedEntity } from "./EntitySurface";

/**
 * The full page for one entity. It replaces the canvas rather than covering it
 * — the point of promoting out of the peek is room to work, so nothing here
 * competes for width or asks to be dismissed before you can use the app again.
 */
export function FocusView() {
  const selected = useSelectedEntity();
  if (!selected) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-stone-100/60 dark:bg-stone-950">
      <EntityChrome mode="focus" />
      <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-stone-900">
        <EntityBody density="focus" />
      </div>
    </div>
  );
}
