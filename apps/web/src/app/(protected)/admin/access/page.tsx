import type { Metadata } from "next";

import { AccessRequestList } from "@/components/admin/access-request-list";
import { getAdminRepository } from "@/lib/admin/get-repository";
import { decideAccessAction, setAccessRequestsEnabledAction } from "./actions";

export const metadata: Metadata = {
  title: "Access | JobWarden administration",
};

export default async function AccessPage() {
  const repository = await getAdminRepository();
  const [requests, requestsEnabled] = await Promise.all([
    repository.listAccessRequests(),
    repository.getAccessRequestsEnabled(),
  ]);

  return (
    <main className="mx-auto max-w-page px-5 py-7 sm:px-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Access</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          Review private-beta membership decisions and control whether new
          requests are accepted.
        </p>
      </header>
      <AccessRequestList
        requests={requests}
        requestsEnabled={requestsEnabled}
        decisionAction={decideAccessAction}
        settingAction={setAccessRequestsEnabledAction}
      />
    </main>
  );
}
