import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, subprocessors } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="19 July 2026">
      <p>
        JobWarden is a UK-only job-search tool, operated as a private beta and
        available only to people an administrator has approved.
      </p>

      <h2>What JobWarden stores about you</h2>
      <ul>
        <li>Your email address and sign-in identity.</li>
        <li>
          Your CV file, the text extracted from it, and the skills,
          responsibilities, tools, industries, and role history derived from it
          — together with your own corrections and confirmations.
        </li>
        <li>
          Your named searches, seniority, locations, work patterns, compensation
          preferences, exclusions, and notification settings.
        </li>
        <li>
          The roles you save, dismiss, or consider; the applications you track
          and their stage history; your explore choices; and your tailored CV
          variants, stored as a list of edits rather than as extra files.
        </li>
        <li>
          One record per scheduled digest slot, showing whether an email was
          sent, suppressed, or failed.
        </li>
      </ul>
      <p>
        Your CV text and job description text are never written to logs, error
        reports, analytics, URLs, or emails.
      </p>

      <h2>What JobWarden does not do</h2>
      <ul>
        <li>
          It never submits applications for you or contacts employers and
          recruiters. Every application happens on the employer&rsquo;s own
          site.
        </li>
        <li>It does not sell or share your data with advertisers.</li>
        <li>
          It does not use your CV to train a model, and does not send CV content
          to any provider whose terms permit training on submitted content.
        </li>
        <li>
          It runs no browser analytics and sets no non-essential cookies. If
          that ever changes, your affirmative consent will be required first.
        </li>
      </ul>

      <h2>Who else processes your data</h2>
      <p>
        These providers process personal data on JobWarden&rsquo;s behalf. Some
        are hosted outside the UK; those transfers rely on the UK International
        Data Transfer Addendum to the EU Standard Contractual Clauses.
      </p>
      <ul>
        {subprocessors.map((entry) => (
          <li key={entry.name}>
            <strong>{entry.name}</strong> — {entry.purpose}
          </li>
        ))}
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Export</strong> everything JobWarden holds about you as a JSON
          file, from your career profile.
        </li>
        <li>
          <strong>Delete</strong> your CV and all derived data from your career
          profile.
        </li>
        <li>
          <strong>Turn off</strong> digest emails from your career profile or
          any digest&rsquo;s unsubscribe link.
        </li>
        <li>
          <strong>Complain</strong> to the UK Information Commissioner&rsquo;s
          Office.
        </li>
      </ul>

      <h2>How long data is kept</h2>
      <ul>
        <li>Your CV, until you replace or delete it.</li>
        <li>
          Unsaved tailored variants, 24 hours after they were last saved. Saved
          variants, until you delete them.
        </li>
        <li>Raw AI proposals, 24 hours.</li>
        <li>
          Delivery records, until you delete your profile data, so you can see
          what was sent.
        </li>
      </ul>

      <p>
        <Link href="/terms">Terms of use</Link>
      </p>
    </LegalPage>
  );
}
