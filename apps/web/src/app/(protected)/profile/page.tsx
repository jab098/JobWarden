import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ProfileOnboarding } from "@/components/profile/profile-onboarding";
import { getProfileRepository } from "@/lib/profile/get-repository";

export const metadata: Metadata = { title: "Career profile" };

export default async function ProfilePage() {
  const snapshot = await (await getProfileRepository()).getSnapshot();
  const snapshotIdentity = snapshot.draft
    ? `profile:${snapshot.currentCv?.id ?? "without-cv"}`
    : "profile:empty";
  return (
    <AppShell dataMode={snapshot.dataMode} activePath="profile">
      <ProfileOnboarding key={snapshotIdentity} snapshot={snapshot} />
    </AppShell>
  );
}
