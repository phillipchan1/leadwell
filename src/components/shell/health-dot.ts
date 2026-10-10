import type { Health } from "@/types";
import { HEALTH_COLOR } from "@/lib/health";

/** The health dot color for a subject, or null when they haven't been read. */
export function healthColorOf(health?: Health): string | null {
  return health ? HEALTH_COLOR[health.level] : null;
}
