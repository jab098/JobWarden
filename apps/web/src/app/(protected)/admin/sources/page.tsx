import type { Metadata } from "next";

import { SourceList } from "@/components/admin/source-list";
import { getAdminRepository } from "@/lib/admin/get-repository";
import { saveSourceAction } from "./actions";

export const metadata: Metadata = {
  title: "Sources | JobWarden administration",
};

export default async function SourcesPage() {
  const repository = await getAdminRepository();
  const sources = await repository.listSources();

  return (
    <main className="mx-auto max-w-page px-5 py-7 sm:px-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Sources</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          Maintain lawful, reviewed source boundaries and their minimum
          collection cadence.
        </p>
      </header>
      <SourceList sources={sources} saveAction={saveSourceAction} />
    </main>
  );
}
