// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDevelopmentAdminSnapshot } from "./development-admin";

describe("fictional administrator preview data", () => {
  it("contains useful edge states without personal or live provider data", () => {
    const snapshot = getDevelopmentAdminSnapshot();
    const serialised = JSON.stringify(snapshot);

    expect(snapshot.accessRequests.map((item) => item.status)).toEqual(
      expect.arrayContaining(["pending", "approved", "suspended"]),
    );
    expect(snapshot.sources.map((item) => item.termsReviewState)).toEqual(
      expect.arrayContaining(["current", "overdue"]),
    );
    expect(snapshot.runs.map((item) => item.status)).toEqual(
      expect.arrayContaining(["succeeded", "failed", "running"]),
    );
    expect(snapshot.ingestionRequests[0]).toMatchObject({ status: "pending" });
    expect(
      snapshot.accessRequests.every((item) =>
        item.displayName.startsWith("Fictional "),
      ),
    ).toBe(true);
    expect(
      snapshot.sources.every(
        (source) =>
          source.employerName.startsWith("Fictional ") &&
          source.boardToken.startsWith("fictional-") &&
          source.allowedHosts.every((host) => host.endsWith(".example.test")),
      ),
    ).toBe(true);
    expect(
      snapshot.runs
        .filter((run) => run.errorCode)
        .every((run) => run.errorCode?.startsWith("fictional_")),
    ).toBe(true);
    expect(serialised).toMatch(/fictional|example\.test/i);
    expect(serialised).not.toMatch(/@|curriculum|resume|cv text|phone/i);
    expect(snapshot).not.toHaveProperty("decideAccess");
  });

  it("returns deeply immutable data", () => {
    const snapshot = getDevelopmentAdminSnapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.accessRequests)).toBe(true);
    expect(Object.isFrozen(snapshot.accessRequests[0])).toBe(true);
    expect(() => {
      (snapshot.accessRequests as unknown[]).push({});
    }).toThrow();
  });
});
