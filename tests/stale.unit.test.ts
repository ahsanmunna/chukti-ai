import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYBOOK, type PlaybookPreferences } from "@/lib/playbook/schema";
import { isPlaybookStale, normalizePreferences } from "@/lib/playbook/stale";

describe("Playbook Stale Check (lib/playbook/stale.ts)", () => {
  it("equal with different key order -> false", () => {
    // Objects with exact same data but deliberately reversed/different key order
    const snapshot = {
      scope_changes: { require_written_change_order: true },
      termination: { pay_for_work_done: true, min_notice_days: 14 },
      ip_ownership: "transfer_after_full_payment",
      payment_terms: { max_days_to_pay: 30 },
      liability_cap: { max_multiple_of_fees: 1, require_cap: true },
    };

    const current = {
      liability_cap: { require_cap: true, max_multiple_of_fees: 1 },
      payment_terms: { max_days_to_pay: 30 },
      ip_ownership: "transfer_after_full_payment",
      termination: { min_notice_days: 14, pay_for_work_done: true },
      scope_changes: { require_written_change_order: true },
    };

    expect(isPlaybookStale(snapshot, current)).toBe(false);
    expect(
      isPlaybookStale({
        snapshotPreferences: snapshot,
        currentPlaybook: current,
        isPlaybookLoading: false,
      }),
    ).toBe(false);
  });

  it("defaults vs identical saved -> false", () => {
    // Postgres JSONB serialization/deserialization of defaults
    const postgresJsonbSnapshot = JSON.parse(JSON.stringify(DEFAULT_PLAYBOOK));

    // Wrapped in { preferences: ... }
    const wrappedSnapshot = {
      preferences: postgresJsonbSnapshot,
      is_default: true,
    };

    expect(isPlaybookStale(DEFAULT_PLAYBOOK, DEFAULT_PLAYBOOK)).toBe(false);
    expect(isPlaybookStale(postgresJsonbSnapshot, DEFAULT_PLAYBOOK)).toBe(false);
    expect(isPlaybookStale(wrappedSnapshot, DEFAULT_PLAYBOOK)).toBe(false);
    expect(isPlaybookStale(DEFAULT_PLAYBOOK, postgresJsonbSnapshot)).toBe(false);
  });

  it("one preference changed -> true", () => {
    const snapshot = DEFAULT_PLAYBOOK;
    const changedPlaybook: PlaybookPreferences = {
      ...DEFAULT_PLAYBOOK,
      payment_terms: {
        max_days_to_pay: 45, // Changed from 30 to 45
      },
    };

    expect(isPlaybookStale(snapshot, changedPlaybook)).toBe(true);
    expect(isPlaybookStale(changedPlaybook, snapshot)).toBe(true);

    // Another preference change: ip_ownership
    const changedIp: PlaybookPreferences = {
      ...DEFAULT_PLAYBOOK,
      ip_ownership: "license_only",
    };
    expect(isPlaybookStale(snapshot, changedIp)).toBe(true);
  });

  it("playbook not loaded -> false", () => {
    const snapshot = DEFAULT_PLAYBOOK;
    const changedPlaybook: PlaybookPreferences = {
      ...DEFAULT_PLAYBOOK,
      payment_terms: {
        max_days_to_pay: 60,
      },
    };

    // Even if preferences clearly differ, return false while playbook is still loading
    expect(isPlaybookStale(snapshot, changedPlaybook, true)).toBe(false);
    expect(
      isPlaybookStale({
        snapshotPreferences: snapshot,
        currentPlaybook: changedPlaybook,
        isPlaybookLoading: true,
      }),
    ).toBe(false);

    // When loading finishes, it correctly detects difference
    expect(isPlaybookStale(snapshot, changedPlaybook, false)).toBe(true);
  });
});
