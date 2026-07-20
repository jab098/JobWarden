import type { Metadata } from "next";
import Link from "next/link";

import { NotificationSettings } from "@/components/notifications/notification-settings";
import { PrivacyControls } from "@/components/settings/privacy-controls";
import { getNotificationsRepository } from "@/lib/notifications/get-repository";
import { getProfileRepository } from "@/lib/profile/get-repository";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [snapshot, notifications] = await Promise.all([
    (await getProfileRepository()).getSnapshot(),
    (await getNotificationsRepository()).getSettings(),
  ]);
  const notifyingProfileNames = snapshot.searches
    .filter((search) => search.enabled && search.notificationsEnabled)
    .map((search) => search.name);

  return (
    <div className="mx-auto max-w-list px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">
          Email digests, your data, and the controls that delete it. Matching
          preferences live in your career profile.
        </p>
      </header>

      <NotificationSettings
        result={{ ...notifications, notifyingProfileNames }}
      />

      <section
        aria-labelledby="data-export-heading"
        className="mt-3 card-surface p-5"
      >
        <h2
          id="data-export-heading"
          className="text-base font-semibold tracking-[-0.01em]"
        >
          Your data
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
          Download everything JobWarden stores about you as one JSON bundle. CV
          files are listed as metadata; the private documents themselves never
          travel through this export.
        </p>
        <Link
          href="/profile/export"
          className="mt-3 inline-flex rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Export my data
        </Link>
      </section>

      <PrivacyControls
        readOnly={snapshot.dataMode === "fixtures"}
        hasCv={snapshot.currentCv !== null}
        blocked={false}
      />
    </div>
  );
}
