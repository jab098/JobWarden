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
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <header className="mb-10 max-w-2xl">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#2458a6]">
          Administrator
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">
          Sources
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#596173]">
          Maintain lawful, reviewed source boundaries and their minimum
          collection cadence.
        </p>
      </header>
      <SourceList sources={sources} saveAction={saveSourceAction} />
    </main>
  );
}
