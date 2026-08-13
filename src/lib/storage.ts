/**
 * Persistence seam. Everything the app saves goes through this module so the
 * localStorage backend can be swapped for a real API later without touching
 * the store or components.
 */
export interface Storage {
  load<T>(key: string): T | null;
  /**
   * Returns false when the write didn't land — almost always quota, and the
   * document cache is large enough that it has to be able to react (drop
   * itself) rather than assume it's there. Callers persisting a preference can
   * keep ignoring the result.
   */
  save<T>(key: string, value: T): boolean;
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
  save<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Most likely quota (large photos). Surface loudly in dev.
      console.error("LeadWell: failed to persist", key, e);
      return false;
    }
  },
  remove(key: string): void {
    localStorage.removeItem(PREFIX + key);
  },
};

export const storage: Storage = localStorageBackend;
