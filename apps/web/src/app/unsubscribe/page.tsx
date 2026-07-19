import type { Metadata } from "next";
import Link from "next/link";

import { UnsubscribeForm } from "./unsubscribe-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Unsubscribe",
  // An unsubscribe link is private to one recipient and must never be indexed.
  robots: { index: false, follow: false },
};

function tokenFrom(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const token = tokenFrom((await searchParams).token);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
        JobWarden
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[#172033]">
        Turn off digest emails
      </h1>

      {token === "" ? (
        <p className="mt-4 max-w-prose text-sm leading-6 text-[#596173]">
          This link is missing its unsubscribe code. Open the link from your
          digest email again, or turn digest emails off from your career profile
          after signing in.
        </p>
      ) : (
        <>
          <p className="mt-4 max-w-prose text-sm leading-6 text-[#596173]">
            Confirm below and JobWarden will stop sending scheduled digest
            emails to this account. Your career profile, saved searches, and
            tracked applications are not changed.
          </p>
          <UnsubscribeForm token={token} />
        </>
      )}

      <p className="mt-8 text-sm text-[#596173]">
        <Link
          href="/"
          className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
        >
          Back to JobWarden
        </Link>
      </p>
    </main>
  );
}
