import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/app/auth/sign-in/actions";
import { AccessStateView } from "@/components/auth/access-state-view";
import { createSupabaseAccessRepository } from "@/lib/auth/supabase-access-repository";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access status" };

export default async function AccessPendingPage() {
  const repository = createSupabaseAccessRepository(await createClient());
  const user = await repository.getAuthenticatedUser();

  if (!user) redirect("/auth/sign-in");

  const [record, isAdmin] = await Promise.all([
    repository.getOwnAccessRecord(user.id),
    repository.hasAdminRole(user.id),
  ]);

  if (record?.status === "approved" || isAdmin) redirect("/matches");

  return (
    <AccessStateView
      status={record?.status ?? "closed"}
      reason={record?.reason}
      signOutAction={signOut}
    />
  );
}
