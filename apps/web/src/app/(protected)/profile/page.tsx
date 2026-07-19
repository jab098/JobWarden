import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { ProfileOnboarding } from "@/components/profile/profile-onboarding";
import { getNotificationsRepository } from "@/lib/notifications/get-repository";
import { getProfileRepository } from "@/lib/profile/get-repository";

export const metadata: Metadata = { title: "Career profile" };

export default async function ProfilePage() {
  const [snapshot, notifications] = await Promise.all([
    (await getProfileRepository()).getSnapshot(),
    (await getNotificationsRepository()).getSettings(),
  ]);
  const notifyingProfileNames = snapshot.searches
    .filter((search) => search.enabled && search.notificationsEnabled)
    .map((search) => search.name);
  const snapshotIdentity = snapshot.draft
    ? `profile:${snapshot.currentCv?.id ?? "without-cv"}`
    : "profile:empty";
  return (
    <AppShell dataMode={snapshot.dataMode} activePath="profile">
      <ProfileOnboarding key={snapshotIdentity} snapshot={snapshot} />
      <NotificationSettings
        result={{ ...notifications, notifyingProfileNames }}
      />
    </AppShell>
  );
}
