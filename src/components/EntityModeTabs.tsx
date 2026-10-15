import {
  Tab as TabItem,
  TabList,
  Tabs,
} from "@/components/application/tabs/tabs";
import { PrayerIcon } from "./Prayer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { modeTabs, type EntityMode, type ModeSubject } from "../lib/entityModes";

/**
 * The mode strip every entity panel wears. One component so the five modes are
 * in the same order, at the same size, in the same place — whichever kind of
 * thing you have open.
 *
 * Prayer keeps the hand it wears everywhere else in the app; the rest are
 * words, because an icon per tab would flatten that distinction.
 */
export function EntityModeTabs({
  subject,
  mode,
  onMode,
  counts,
}: {
  subject: ModeSubject;
  mode: EntityMode;
  onMode: (mode: EntityMode) => void;
  /** Optional badge per mode — omit or pass 0 for none. */
  counts?: Partial<Record<EntityMode, number>>;
}) {
  const tabs = modeTabs(subject);
  /*
   * Five labels and their counts need ~460px; a phone has 330. The strip
   * scrolled, and the last tab sat sliced at the edge. On a phone the counts
   * go and the tabs share the width out, which fits every kind's labels down
   * to a 360px screen. Scrolling stays as the fallback below that.
   */
  const phone = useMediaQuery("(max-width: 639px)");

  return (
    <Tabs
      selectedKey={mode}
      onSelectionChange={(key) => onMode(key as EntityMode)}
      /* `px-4 sm:px-6` matches the entity header above and every body section
         below it — the strip was on `px-4` alone, so from `sm` up it sat 8px
         left of everything it labels. */
      className="scroll-contain scrollbar-hide shrink-0 overflow-x-auto border-b border-secondary px-4 sm:px-6"
    >
      {/* The strip's own border runs edge to edge; the list's underline drew
          a second line over it that stopped short at both ends. */}
      <TabList type="underline" size="sm" items={tabs} className="before:hidden max-sm:mx-0! max-sm:gap-0!">
        {(t) => {
          const id = t.id as EntityMode;
          const count = counts?.[id];
          return (
            <TabItem
              id={id}
              label={t.label}
              icon={id === "prayer" ? PrayerIcon : undefined}
              badge={count && !phone ? count : undefined}
              className="max-sm:flex-1 max-sm:px-1!"
            />
          );
        }}
      </TabList>
    </Tabs>
  );
}
