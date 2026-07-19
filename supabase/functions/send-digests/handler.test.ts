import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DigestRecipient,
  DigestSender,
  NotificationEnvironment,
  NotificationHandlerDependencies,
  NotificationRepository,
  RuntimeLog,
  SlotClaim,
} from "./contracts.ts";
import { createNotificationHandler } from "./handler.ts";

const cronSecret = "cron-fixture-".repeat(3);

const environment: NotificationEnvironment = {
  supabaseUrl: "https://project.supabase.co",
  serviceRoleKey: "service-role-key-000000000000",
  cronSecret,
  siteUrl: "https://jobwarden.example",
  senderAddress: "JobWarden <digests@jobwarden.example>",
  dailyLimit: 80,
  monthlyLimit: 2_500,
};

// A Monday 09:10 Europe/London slot.
const slotInstant = new Date("2026-07-20T08:10:00.000Z");
const slotKey = "2026-07-20T09";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Senior Analytics Engineer",
    employer: "Fictionex Ltd",
    descriptionText: "A senior analytics engineer role using python daily.",
    location: "Manchester, UK",
    employmentType: "permanent" as const,
    workingTime: "full_time" as const,
    workplaceType: "hybrid" as const,
    ir35Status: "not_applicable" as const,
    compensationMinimum: null,
    compensationMaximum: null,
    compensationPeriod: "unknown" as const,
    compensationProvenance: "unknown" as const,
    postedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function recipient(overrides: Partial<DigestRecipient> = {}): DigestRecipient {
  return {
    ownerId: "30000000-0000-4000-8000-000000000001",
    email: "person@example.invalid",
    unsubscribeToken: "40000000-0000-4000-8000-000000000001",
    searches: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        draft: {
          name: "Analytics implementation",
          enabled: true,
          roleFamilies: [],
          includeTerms: [],
          excludeTerms: [],
          industries: [],
          domains: [],
          skillConcepts: ["python"],
          responsibilityConcepts: [],
          currentSeniority: "senior",
          targetSeniority: "senior",
          employmentTypes: [],
          workingTimes: [],
          workplaceTypes: [],
          ukLocations: [],
          ir35Statuses: [],
          compensation: {
            minimum: null,
            maximum: null,
            period: "unknown",
            allowUnknown: true,
          },
          recencyDays: 30,
          notificationsEnabled: true,
        },
      },
    ],
    confirmedEvidence: [],
    ...overrides,
  };
}

type Harness = {
  handler: (request: Request) => Promise<Response>;
  repository: NotificationRepository & {
    beginDigest: ReturnType<typeof vi.fn>;
    finishDigest: ReturnType<typeof vi.fn>;
    listCandidateJobs: ReturnType<typeof vi.fn>;
    listAnnouncedKeys: ReturnType<typeof vi.fn>;
  };
  send: ReturnType<typeof vi.fn>;
  logs: RuntimeLog[];
  createSender: ReturnType<typeof vi.fn>;
};

function harness(
  options: {
    recipients?: DigestRecipient[];
    claim?: SlotClaim;
    announced?: string[];
    sendOutcome?: Awaited<ReturnType<DigestSender["send"]>>;
    now?: Date;
    sender?: DigestSender | null;
    readEnvironment?: () => NotificationEnvironment;
  } = {},
): Harness {
  const logs: RuntimeLog[] = [];
  const send = vi
    .fn()
    .mockResolvedValue(
      options.sendOutcome ?? { status: "sent", providerMessageId: "message-1" },
    );

  const repository = {
    listRecipients: vi
      .fn()
      .mockResolvedValue(options.recipients ?? [recipient()]),
    listCandidateJobs: vi.fn().mockResolvedValue([candidate()]),
    listAnnouncedKeys: vi
      .fn()
      .mockResolvedValue(new Set(options.announced ?? [])),
    beginDigest: vi.fn().mockResolvedValue(
      options.claim ?? {
        outcome: "claimed",
        deliveryId: "50000000-0000-4000-8000-000000000001",
      },
    ),
    finishDigest: vi.fn().mockResolvedValue(undefined),
  } as unknown as Harness["repository"];

  const createSender = vi
    .fn()
    .mockReturnValue(options.sender === undefined ? { send } : options.sender);

  const dependencies: NotificationHandlerDependencies = {
    readEnvironment: options.readEnvironment ?? (() => environment),
    createRepository: () => repository,
    createSender,
    now: () => options.now ?? slotInstant,
    randomUuid: () => "60000000-0000-4000-8000-000000000001",
    log: (record) => logs.push(record),
  };

  return {
    handler: createNotificationHandler(dependencies),
    repository,
    send,
    logs,
    createSender,
  };
}

function request(init: RequestInit = {}): Request {
  return new Request("https://functions.example/send-digests", {
    method: "POST",
    headers: { authorization: `Bearer ${cronSecret}` },
    ...init,
  });
}

describe("createNotificationHandler", () => {
  let subject: Harness;

  beforeEach(() => {
    subject = harness();
  });

  it("rejects a non-POST request", async () => {
    const response = await subject.handler(
      new Request("https://functions.example/send-digests"),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("rejects a missing bearer secret", async () => {
    const response = await subject.handler(
      request({ headers: {} as HeadersInit }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a wrong bearer secret", async () => {
    const response = await subject.handler(
      request({ headers: { authorization: "Bearer wrong-secret-value" } }),
    );
    expect(response.status).toBe(401);
    expect(subject.repository.listRecipients).not.toHaveBeenCalled();
  });

  it("rejects an oversized request body", async () => {
    const response = await subject.handler(
      request({
        headers: {
          authorization: `Bearer ${cronSecret}`,
          "content-length": "9999",
        },
      }),
    );
    expect(response.status).toBe(413);
  });

  it("reports an unavailable runtime when configuration is invalid", async () => {
    const invalid = harness({
      readEnvironment: () => {
        throw new Error("Invalid notification runtime configuration.");
      },
    });
    const response = await invalid.handler(request());
    expect(response.status).toBe(503);
  });

  it("sends one digest and records its announcements", async () => {
    const response = await subject.handler(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      slotKey,
      status: "succeeded",
      recipientCount: 1,
      sentCount: 1,
      suppressedCount: 0,
      failedCount: 0,
    });
    expect(subject.send).toHaveBeenCalledTimes(1);
    expect(subject.repository.finishDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        providerMessageId: "message-1",
        errorCode: null,
        announcements: [
          {
            searchProfileId: "20000000-0000-4000-8000-000000000001",
            jobId: "10000000-0000-4000-8000-000000000001",
          },
        ],
      }),
    );
  });

  it("addresses the digest to the recipient from the configured sender", async () => {
    await subject.handler(request());

    expect(subject.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "person@example.invalid",
        from: "JobWarden <digests@jobwarden.example>",
      }),
    );
  });

  it("includes a token unsubscribe link in the digest", async () => {
    await subject.handler(request());

    const [{ message }] = subject.send.mock.calls[0];
    expect(message.text).toContain(
      "https://jobwarden.example/unsubscribe?token=40000000-0000-4000-8000-000000000001",
    );
  });

  it("sends no email when the slot produced no new matches", async () => {
    const quiet = harness({
      announced: [
        "20000000-0000-4000-8000-000000000001:10000000-0000-4000-8000-000000000001",
      ],
      claim: { outcome: "suppressed_no_matches" },
    });

    const response = await quiet.handler(request());

    expect(quiet.send).not.toHaveBeenCalled();
    expect(quiet.repository.beginDigest).toHaveBeenCalledWith(
      expect.objectContaining({ matchCount: 0 }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "succeeded",
      sentCount: 0,
      suppressedCount: 1,
    });
  });

  it.each([
    "suppressed_daily_cap",
    "suppressed_monthly_cap",
    "already_recorded",
  ] as const)(
    "sends no email when the slot resolves to %s",
    async (outcome) => {
      const capped = harness({ claim: { outcome } });

      await capped.handler(request());

      expect(capped.send).not.toHaveBeenCalled();
      expect(capped.repository.finishDigest).not.toHaveBeenCalled();
      expect(capped.logs).toContainEqual(
        expect.objectContaining({
          event: "notifications.slot_suppressed",
          status: outcome,
        }),
      );
    },
  );

  it("records a failed send without announcing its matches", async () => {
    const failing = harness({
      sendOutcome: { status: "failed", errorCode: "provider_rate_limited" },
    });

    const response = await failing.handler(request());

    expect(failing.repository.finishDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "provider_rate_limited",
        providerMessageId: null,
        announcements: [],
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "partial_failure",
      sentCount: 0,
      failedCount: 1,
    });
  });

  it("continues to the next recipient after one fails", async () => {
    const many = harness({
      recipients: [
        recipient(),
        recipient({
          ownerId: "30000000-0000-4000-8000-000000000002",
          email: "second@example.invalid",
        }),
      ],
    });
    many.repository.beginDigest
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue({
        outcome: "claimed",
        deliveryId: "50000000-0000-4000-8000-000000000002",
      });

    const response = await many.handler(request());

    await expect(response.json()).resolves.toMatchObject({
      recipientCount: 2,
      sentCount: 1,
      failedCount: 1,
    });
    expect(many.send).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside the scheduled weekday slots", async () => {
    const offSchedule = harness({
      now: new Date("2026-07-20T09:30:00.000Z"),
    });

    const response = await offSchedule.handler(request());

    await expect(response.json()).resolves.toMatchObject({
      status: "outside_schedule",
    });
    expect(offSchedule.repository.listRecipients).not.toHaveBeenCalled();
    expect(offSchedule.createSender).not.toHaveBeenCalled();
  });

  it("stays inert and claims no slot when delivery is unconfigured", async () => {
    const unconfigured = harness({ sender: null });

    const response = await unconfigured.handler(request());

    await expect(response.json()).resolves.toMatchObject({
      status: "delivery_unconfigured",
      slotKey,
    });
    expect(unconfigured.repository.listRecipients).not.toHaveBeenCalled();
    expect(unconfigured.repository.beginDigest).not.toHaveBeenCalled();
  });

  it("reads the shared candidate window once for every recipient", async () => {
    const many = harness({
      recipients: [
        recipient(),
        recipient({ ownerId: "30000000-0000-4000-8000-000000000002" }),
        recipient({ ownerId: "30000000-0000-4000-8000-000000000003" }),
      ],
    });

    await many.handler(request());

    expect(many.repository.listCandidateJobs).toHaveBeenCalledTimes(1);
    expect(many.send).toHaveBeenCalledTimes(3);
  });

  it("reads no candidate jobs when nobody is due a digest", async () => {
    const empty = harness({ recipients: [] });

    const response = await empty.handler(request());

    expect(empty.repository.listCandidateJobs).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ status: "idle" });
  });

  it("scopes the deduplication read to the candidate window", async () => {
    await subject.handler(request());

    expect(subject.repository.listAnnouncedKeys).toHaveBeenCalledWith(
      "30000000-0000-4000-8000-000000000001",
      ["10000000-0000-4000-8000-000000000001"],
    );
  });

  it("reports an unavailable source read without sending", async () => {
    const broken = harness();
    broken.repository.listCandidateJobs.mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await broken.handler(request());

    expect(response.status).toBe(503);
    expect(broken.send).not.toHaveBeenCalled();
  });

  it("passes the configured ceilings to every claim", async () => {
    await subject.handler(request());

    expect(subject.repository.beginDigest).toHaveBeenCalledWith(
      expect.objectContaining({ dailyLimit: 80, monthlyLimit: 2_500 }),
    );
  });

  it("keeps career evidence out of the delivered payload", async () => {
    const withEvidence = harness({
      recipients: [
        recipient({
          confirmedEvidence: [
            {
              id: "71000000-0000-4000-8000-000000000001",
              normalizedConcept: "python",
              label: "Python",
              category: "skill",
              origin: "user",
              confidence: 1,
              evidenceReference: null,
              evidenceExcerpt: null,
              proficiencySignal: "demonstrated",
              lastUsedAt: null,
              confirmationState: "confirmed",
            },
          ],
        }),
      ],
    });

    await withEvidence.handler(request());

    const [{ message }] = withEvidence.send.mock.calls[0];
    const payload = `${message.subject}${message.text}${message.html}`;
    expect(payload).not.toContain("Python");
    expect(payload).not.toContain("python");
  });

  it("never logs a recipient address", async () => {
    const failing = harness({
      sendOutcome: { status: "failed", errorCode: "provider_rejected_payload" },
    });

    await failing.handler(request());

    expect(JSON.stringify(failing.logs)).not.toContain("example.invalid");
  });
});
