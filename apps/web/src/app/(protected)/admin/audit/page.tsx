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
    <main className="mx-auto max-w-page px-5 py-7 sm:px-8">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Audit</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          Every audited action, most recent first. This is the record you would
          use to reconstruct what happened after the fact, so it is read-only
          and holds no CV text or user content.
        </p>
      </header>
      <AuditLogTable entries={entries} />
      <p className="mt-6 text-xs text-ink-faint">
        Showing the {pageSize} most recent entries.
      </p>
    </main>
  );
}
