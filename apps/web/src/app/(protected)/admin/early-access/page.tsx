import type { Metadata } from "next";

import { EarlyAccessList } from "@/components/admin/early-access-list";
import { getAdminRepository } from "@/lib/admin/get-repository";
import { markEarlyAccessInvitedAction } from "./actions";

export const metadata: Metadata = {
  title: "Early access | JobWarden administration",
};

const pageSize = 50;

export default async function EarlyAccessPage() {
  const { signups, pending } = await (
    await getAdminRepository()
  ).listEarlyAccessSignups({ limit: pageSize });

  return (
    <main className="mx-auto max-w-page px-5 py-7 sm:px-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">
          Early access
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          People who asked to be told when JobWarden opens, oldest first. They
          have no account yet, so nothing here is product data — only what they
          typed into the dialog. Marking somebody invited records the decision
          in the audit log and takes them off this queue.
        </p>
      </header>
      <EarlyAccessList
        signups={signups}
        pending={pending}
        inviteAction={markEarlyAccessInvitedAction}
      />
    </main>
  );
}
