import {
  Tab as TabItem,
  TabList,
  Tabs,
} from "@/components/application/tabs/tabs";
import { PrayerIcon } from "./Prayer";
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

  return (
    <Tabs
      selectedKey={mode}
      onSelectionChange={(key) => onMode(key as EntityMode)}
      className="scroll-contain scrollbar-hide shrink-0 overflow-x-auto border-b border-secondary px-4"
    >
      <TabList type="underline" size="sm" items={tabs}>
        {(t) => {
          const id = t.id as EntityMode;
          const count = counts?.[id];
          return (
            <TabItem
              id={id}
              label={t.label}
              icon={id === "prayer" ? PrayerIcon : undefined}
              badge={count ? count : undefined}
            />
          );
        }}
      </TabList>
    </Tabs>
  );
}
