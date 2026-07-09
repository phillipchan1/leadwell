/**
 * Persistence seam. Everything the app saves goes through this module so the
 * localStorage backend can be swapped for a real API later without touching
 * the store or components.
 */
export interface Storage {
  load<T>(key: string): T | null;
  save<T>(key: string, value: T): void;
  remove(key: string): void;
}

const PREFIX = "leadwell:v1:";

export const localStorageBackend: Storage = {
  load<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      // Most likely quota (large photos). Surface loudly in dev.
      console.error("LeadWell: failed to persist", key, e);
    }
  },
  remove(key: string): void {
    localStorage.removeItem(PREFIX + key);
  },
};

export const storage: Storage = localStorageBackend;
