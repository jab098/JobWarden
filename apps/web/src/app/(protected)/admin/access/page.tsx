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
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <header className="mb-10 max-w-2xl">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#2458a6]">
          Administrator
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">
          Access
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#596173]">
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
