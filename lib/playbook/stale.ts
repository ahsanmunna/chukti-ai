/**
 * Pure functions for evaluating whether a document's risk analysis findings
 * are stale relative to the currently active playbook preferences.
 */

/**
 * Deeply normalizes a preferences object by sorting object keys alphabetically.
 * Primitives, null, and arrays are preserved; keys order becomes irrelevant.
 */
export function normalizePreferences<T>(val: T): T {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(normalizePreferences) as unknown as T;
  }
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = normalizePreferences(obj[key]);
  }
  return result as T;
}

export interface IsPlaybookStaleOptions {
  snapshotPreferences?: unknown;
  currentPlaybook?: unknown;
  isPlaybookLoading?: boolean;
}

/**
 * Returns true if the active playbook preferences differ from the snapshot
 * recorded at analysis time. Returns false until the playbook has finished loading.
 *
 * Supports positional arguments (snapshot, current, isLoading) or an options object.
 */
export function isPlaybookStale(
  snapshotOrOptions?: unknown,
  currentPreferences?: unknown,
  isPlaybookLoading?: boolean,
): boolean {
  let snapshot: unknown;
  let current: unknown;
  let loading = false;

  if (
    snapshotOrOptions !== null &&
    typeof snapshotOrOptions === "object" &&
    ("snapshotPreferences" in snapshotOrOptions ||
      "currentPlaybook" in snapshotOrOptions ||
      "isPlaybookLoading" in snapshotOrOptions)
  ) {
    const opts = snapshotOrOptions as IsPlaybookStaleOptions;
    snapshot = opts.snapshotPreferences;
    current = opts.currentPlaybook;
    loading = Boolean(opts.isPlaybookLoading);
  } else {
    snapshot = snapshotOrOptions;
    current = currentPreferences;
    loading = Boolean(isPlaybookLoading);
  }

  // Return false until the playbook has finished loading
  if (loading) {
    return false;
  }

  if (!snapshot || !current) {
    return false;
  }

  // Unwrap { preferences: ... } if wrapped
  const rawSnap =
    typeof snapshot === "object" && snapshot !== null && "preferences" in snapshot
      ? (snapshot as { preferences: unknown }).preferences
      : snapshot;

  const rawCurr =
    typeof current === "object" && current !== null && "preferences" in current
      ? (current as { preferences: unknown }).preferences
      : current;

  if (!rawSnap || !rawCurr) {
    return false;
  }

  const normalizedSnap = normalizePreferences(rawSnap);
  const normalizedCurr = normalizePreferences(rawCurr);

  return JSON.stringify(normalizedSnap) !== JSON.stringify(normalizedCurr);
}
