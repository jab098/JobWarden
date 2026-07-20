import type { Metadata } from "next";
import Link from "next/link";

import { getSourcesRepository } from "@/lib/sources/get-repository";

export const metadata: Metadata = { title: "Job sources" };

/**
 * Every provider JobWarden can lawfully read, and its connection state.
 * Sources are configured by the administrator: adding one means reviewing
 * its terms and, for credentialed APIs, holding the key server-side. This
 * page tells a member what is connected and exactly where setup happens.
 */
const providerRegistry = [
  {
    name: "Greenhouse boards",
    body: "Any employer's public Greenhouse job board can be connected, one employer at a time, after its terms are reviewed. No credential is needed.",
    setup:
      "The administrator adds the employer's board in Administration, Sources.",
  },
  {
    name: "Reed",
    body: "The Reed Jobseeker API covers a wide slice of UK listings. It stays disconnected until its terms review, a server-held API key, and the live-database checks all pass.",
    setup:
      "The administrator configures the key server-side; it is never entered in the browser.",
  },
] as const;

export default async function SourcesPage() {
  const { sources } = await (await getSourcesRepository()).listEnabled();

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Job sources
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">
          Where your search results come from. Connected sources are searched on
          every listing update; anything else here can be connected by the
          administrator.
        </p>
      </header>

      <section
        aria-labelledby="connected-sources-heading"
        className="mt-4 rounded-lg border border-border bg-card p-4"
      >
        <h2
          id="connected-sources-heading"
          className="text-base font-semibold tracking-[-0.01em]"
        >
          Connected now
        </h2>
        {sources.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm leading-6 text-ink-secondary">
            No sources are visible to this account yet. Listings still appear in
            search as soon as the administrator connects one.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {sources.map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-success"
                />
                <span className="text-sm font-medium text-foreground">
                  {source.label}
                </span>
                <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[0.7rem] text-ink-secondary">
                  {source.provider}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="available-sources-heading"
        className="mt-3 rounded-lg border border-border bg-card p-4"
      >
        <h2
          id="available-sources-heading"
          className="text-base font-semibold tracking-[-0.01em]"
        >
          Available to connect
        </h2>
        <ul className="mt-3 flex flex-col gap-4">
          {providerRegistry.map((provider) => (
            <li key={provider.name}>
              <p className="text-sm font-medium text-foreground">
                {provider.name}
              </p>
              <p className="mt-1 max-w-prose text-sm leading-6 text-ink-secondary">
                {provider.body}
              </p>
              <p className="mt-1 text-xs text-ink-faint">{provider.setup}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-ink-faint">
          Administrators manage connections from{" "}
          <Link
            href="/admin/sources"
            className="rounded-sm text-link underline decoration-border underline-offset-4 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Administration, Sources
          </Link>
          . Everyone else can ask the owner who invited them.
        </p>
      </section>
    </div>
  );
}
