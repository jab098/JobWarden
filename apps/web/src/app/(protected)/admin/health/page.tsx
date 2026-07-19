import type { Metadata } from "next";

import { OperationalHealthPanel } from "@/components/admin/operational-health";
import { getAdminRepository } from "@/lib/admin/get-repository";

export const metadata: Metadata = {
  title: "Health | JobWarden administration",
};

export default async function HealthPage() {
  const health = await (await getAdminRepository()).getOperationalHealth();

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <header className="mb-8 max-w-2xl">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#2458a6]">
          Administrator
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">
          Health
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#596173]">
          Free-tier headroom for the metered paths. Nothing here upgrades
          itself: reaching a ceiling suppresses work and records why, rather
          than spending money.
        </p>
      </header>
      <OperationalHealthPanel health={health} />
    </main>
  );
}
