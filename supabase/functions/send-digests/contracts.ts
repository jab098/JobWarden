import type {
  CareerEvidenceItem,
  DigestMessage,
  NotificationAnnouncement,
  NotificationSearchProfile,
  TargetFeedJobInput,
} from "@jobwarden/domain";

/**
 * Bounds for one invocation. Candidate jobs are read once and scored for every
 * owner, so the digest path never scales source cost with user count — it makes
 * no source request at all.
 */
export const MAX_OWNERS_PER_INVOCATION = 25;
export const MAX_CANDIDATE_JOBS = 200;
export const MAX_SEARCHES_PER_OWNER = 25;
export const MAX_EVIDENCE_PER_OWNER = 250;
export const MAX_LISTED_JOBS_PER_DIGEST = 5;

export type DigestRecipient = {
  ownerId: string;
  email: string;
  unsubscribeToken: string;
  searches: readonly NotificationSearchProfile[];
  confirmedEvidence: readonly CareerEvidenceItem[];
};

export type SlotClaim =
  | { outcome: "claimed"; deliveryId: string }
  | {
      outcome:
        | "already_recorded"
        | "suppressed_no_matches"
        | "suppressed_daily_cap"
        | "suppressed_monthly_cap";
    };

export interface NotificationRepository {
  listRecipients(
    slotKey: string,
    maxOwners: number,
  ): Promise<DigestRecipient[]>;
  listCandidateJobs(limit: number): Promise<TargetFeedJobInput[]>;
  /** Scoped to the candidate window already in hand, so it stays bounded. */
  listAnnouncedKeys(
    ownerId: string,
    jobIds: readonly string[],
  ): Promise<Set<string>>;
  beginDigest(input: {
    ownerId: string;
    slotKey: string;
    matchCount: number;
    dailyLimit: number;
    monthlyLimit: number;
  }): Promise<SlotClaim>;
  finishDigest(input: {
    deliveryId: string;
    status: "sent" | "failed";
    providerMessageId: string | null;
    errorCode: string | null;
    announcements: readonly NotificationAnnouncement[];
  }): Promise<void>;
}

export type SendOutcome =
  | { status: "sent"; providerMessageId: string | null }
  | { status: "failed"; errorCode: string };

export interface DigestSender {
  send(input: {
    to: string;
    from: string;
    message: DigestMessage;
    signal: AbortSignal;
  }): Promise<SendOutcome>;
}

export type NotificationEnvironment = {
  supabaseUrl: string;
  serviceRoleKey: string;
  cronSecret: string;
  siteUrl: string;
  senderAddress: string;
  dailyLimit: number;
  monthlyLimit: number;
};

export type RuntimeLog = Readonly<{
  event: string;
  invocationCorrelationId: string;
  slotKey?: string;
  status?: string;
  recipientCount?: number;
  sentCount?: number;
  suppressedCount?: number;
  failedCount?: number;
  matchCount?: number;
  errorCode?: string;
}>;

export type NotificationHandlerDependencies = {
  readEnvironment(): NotificationEnvironment;
  createRepository(
    environment: NotificationEnvironment,
  ): NotificationRepository;
  createSender(environment: NotificationEnvironment): DigestSender | null;
  now(): Date;
  randomUuid(): string;
  log(record: RuntimeLog): void;
};
