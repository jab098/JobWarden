import type {
  CareerEvidenceItem,
  NamedSearchProfileDraft,
} from "./career-profile.ts";
import {
  applyEligibilityGate,
  scoreJobForProfile,
  type TargetFeedJobInput,
} from "./target-feed.ts";

const LONDON_TIME_ZONE = "Europe/London";

/**
 * The approved weekday cadence from the personalised search design. The shared
 * ingestion runtime keeps its own copy of this calendar because it answers a
 * different question — "should a scheduled run be enqueued" rather than "which
 * digest slot is this" — and the two must be able to move independently.
 */
export const notificationSlotHours = [9, 12, 15, 18] as const;

const DEFAULT_MAX_LISTED = 5;

/**
 * Identifies the digest slot an instant belongs to, or null when the instant is
 * outside the weekday cadence. The key is hour-resolution in London, so a cron
 * entry that fires a few minutes after the ingestion slot still lands on the
 * same slot.
 */
export function londonSlotKey(now: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);

  if (weekday === undefined || weekday === "Sat" || weekday === "Sun") {
    return null;
  }
  if (!notificationSlotHours.some((slotHour) => slotHour === hour)) return null;

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return `${date}T${String(hour).padStart(2, "0")}`;
}

export interface NotificationSearchProfile {
  id: string;
  draft: NamedSearchProfileDraft;
}

/**
 * Everything a digest is allowed to say about a match. Career evidence,
 * excerpts, and fit scores are structurally absent, so no CV-derived text can
 * reach an email payload through this type.
 */
export interface DigestJobSummary {
  jobId: string;
  title: string;
  employer: string;
  location: string;
  profileName: string;
}

export interface NotificationAnnouncement {
  searchProfileId: string;
  jobId: string;
}

export interface NewMatchSelection {
  jobs: readonly DigestJobSummary[];
  announcements: readonly NotificationAnnouncement[];
}

export function announcementKey(
  searchProfileId: string,
  jobId: string,
): string {
  return `${searchProfileId}:${jobId}`;
}

type RankedJob = {
  score: number;
  postedAt: string | null;
  summary: DigestJobSummary;
};

function compareRanked(left: RankedJob, right: RankedJob): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.postedAt !== right.postedAt) {
    if (left.postedAt === null) return 1;
    if (right.postedAt === null) return -1;
    const postedAtOrder = right.postedAt.localeCompare(left.postedAt);
    if (postedAtOrder !== 0) return postedAtOrder;
  }
  return right.summary.jobId.localeCompare(left.summary.jobId);
}

/**
 * Deterministically selects the matches an owner has not been told about yet.
 * Eligibility and scoring come from the Target Feed module, so a digest can
 * never disagree with the product surface it links to. A job that matches two
 * profiles is announced once per profile — the ledger is pair-scoped — but is
 * listed once, under its highest-scoring new profile.
 */
export function selectNewMatches(input: {
  candidates: readonly TargetFeedJobInput[];
  searches: readonly NotificationSearchProfile[];
  confirmedEvidence: readonly CareerEvidenceItem[];
  announced: ReadonlySet<string>;
  now: Date;
}): NewMatchSelection {
  const notifying = input.searches.filter(
    (search) => search.draft.enabled && search.draft.notificationsEnabled,
  );
  const announcements: NotificationAnnouncement[] = [];
  const bestByJob = new Map<string, RankedJob>();

  for (const job of input.candidates) {
    for (const search of notifying) {
      if (input.announced.has(announcementKey(search.id, job.id))) continue;

      const gate = applyEligibilityGate(job, search.draft, input.now);
      if (!gate.eligible) continue;

      const explanation = scoreJobForProfile(
        job,
        search.draft,
        input.confirmedEvidence,
        input.now,
      );
      announcements.push({ searchProfileId: search.id, jobId: job.id });

      const existing = bestByJob.get(job.id);
      if (existing === undefined || explanation.score > existing.score) {
        bestByJob.set(job.id, {
          score: explanation.score,
          postedAt: job.postedAt,
          summary: {
            jobId: job.id,
            title: job.title,
            employer: job.employer,
            location: job.location,
            profileName: search.draft.name,
          },
        });
      }
    }
  }

  return {
    jobs: [...bestByJob.values()]
      .sort(compareRanked)
      .map((ranked) => ranked.summary),
    announcements,
  };
}

export interface DigestMessage {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders the digest. Provider-supplied job text is escaped before it reaches
 * the HTML body, because an advert is untrusted content in an email exactly as
 * it is on a page.
 */
export function buildDigestMessage(input: {
  jobs: readonly DigestJobSummary[];
  siteUrl: string;
  unsubscribeUrl: string;
  maxListed?: number;
}): DigestMessage {
  const total = input.jobs.length;
  const listed = input.jobs.slice(0, input.maxListed ?? DEFAULT_MAX_LISTED);
  const remaining = total - listed.length;
  const feedUrl = `${input.siteUrl.replace(/\/+$/, "")}/jobs`;

  const subject = `${total} new UK ${total === 1 ? "match" : "matches"} in JobWarden`;

  const textLines = [
    subject,
    "",
    ...listed.flatMap((job) => [
      `${job.title} — ${job.employer} (${job.location})`,
      `  Search profile: ${job.profileName}`,
    ]),
  ];
  if (remaining > 0) {
    textLines.push("", `And ${remaining} more waiting in your target feed.`);
  }
  textLines.push(
    "",
    `See them in your target feed: ${feedUrl}`,
    `Stop these emails: ${input.unsubscribeUrl}`,
  );

  const htmlItems = listed
    .map(
      (job) =>
        `<li><strong>${escapeHtml(job.title)}</strong> — ${escapeHtml(
          job.employer,
        )} (${escapeHtml(job.location)})<br /><span>Search profile: ${escapeHtml(
          job.profileName,
        )}</span></li>`,
    )
    .join("");
  const htmlRemaining =
    remaining > 0
      ? `<p>And ${remaining} more waiting in your target feed.</p>`
      : "";

  const html = [
    `<h1>${escapeHtml(subject)}</h1>`,
    `<ul>${htmlItems}</ul>`,
    htmlRemaining,
    `<p><a href="${escapeHtml(feedUrl)}">See them in your target feed</a></p>`,
    `<p><a href="${escapeHtml(input.unsubscribeUrl)}">Stop these emails</a></p>`,
  ].join("");

  return { subject, text: textLines.join("\n"), html };
}
