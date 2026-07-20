import type { Metadata } from "next";

import { OperationalHealthPanel } from "@/components/admin/operational-health";
import { getAdminRepository } from "@/lib/admin/get-repository";

export const metadata: Metadata = {
  title: "Health | JobWarden administration",
};

export default async function HealthPage() {
  const health = await (await getAdminRepository()).getOperationalHealth();

  return (
    <main className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Health</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          Free-tier headroom for the metered paths. Nothing here upgrades
          itself: reaching a ceiling suppresses work and records why, rather
          than spending money.
        </p>
      </header>
      <OperationalHealthPanel health={health} />
    </main>
  );
}
