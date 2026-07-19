import type { Metadata } from "next";

import { AuditLogTable } from "@/components/admin/audit-log-table";
import { getAdminRepository } from "@/lib/admin/get-repository";

export const metadata: Metadata = {
  title: "Audit | JobWarden administration",
};

const pageSize = 50;

export default async function AuditPage() {
  const entries = await (
    await getAdminRepository()
  ).listAuditLog({ limit: pageSize, before: null });

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <header className="mb-8 max-w-2xl">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#2458a6]">
          Administrator
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">
          Audit
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#596173]">
          Every audited action, most recent first. This is the record you would
          use to reconstruct what happened after the fact, so it is read-only
          and holds no CV text or user content.
        </p>
      </header>
      <AuditLogTable entries={entries} />
      <p className="mt-6 text-xs text-[#697181]">
        Showing the {pageSize} most recent entries.
      </p>
    </main>
  );
}
