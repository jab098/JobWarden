import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[#f4f1ea] px-5 py-6 text-[#172033] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-[#d8d2c7] pb-5">
          <Link href="/admin" className="text-sm font-semibold">
            JobWarden administration
          </Link>
          <SignOutButton />
        </header>
        <section className="max-w-2xl py-20">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[#2458a6]">
            Administrator
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
            Administration workspace
          </h1>
          <p className="mt-5 text-base leading-7 text-[#626b7a]">
            Your server-controlled administrator role is active. Access, source,
            and ingestion controls are being prepared separately.
          </p>
        </section>
      </div>
    </main>
  );
}
