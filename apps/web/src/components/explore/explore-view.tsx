import { ExploreItem } from "@/components/explore/explore-item";
import { ExploreToggle } from "@/components/explore/explore-toggle";
import type { ExploreResult } from "@/lib/explore/types";

export function ExploreView({ result }: { result: ExploreResult }) {
  const count = result.items.length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-7 lg:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Career pathways
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-secondary">
          {result.enabled ? (
            <span className="tnum font-medium text-foreground">
              {count} {count === 1 ? "credible pathway" : "credible pathways"}
            </span>
          ) : (
            <span className="font-medium text-foreground">
              Pathways are off
            </span>
          )}
          {result.dataMode === "fixtures" ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-ink-faint">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-warning"
              />
              Development data
            </span>
          ) : null}
          <div className="ml-auto">
            <ExploreToggle enabled={result.enabled} />
          </div>
        </div>
      </header>

      {!result.enabled ? (
        <section
          aria-label="About pathways"
          className="mt-5 rounded-lg border border-border bg-card px-6 py-14 text-center"
        >
          <h2 className="text-base font-semibold tracking-[-0.01em]">
            Adjacent careers your confirmed skills already cover
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-secondary">
            Pathways is opt-in and off by default. When you turn it on,
            JobWarden deterministically compares your confirmed evidence with a
            curated UK pathway taxonomy. A pathway is suggested only when it
            reaches at least 70% weighted overlap with your demonstrated core
            skills, has no more than two significant trainable gaps, and sits
            outside your active target role families. Keyword coincidence is
            never enough, and nothing here changes your selected targets.
          </p>
        </section>
      ) : (
        <>
          <section aria-label="Suggested pathways" className="mt-5 min-w-0">
            {count === 0 ? (
              <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
                <h2 className="text-base font-semibold tracking-[-0.01em]">
                  No pathway clears the bar right now
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-secondary">
                  A pathway is suggested only when it reaches at least 70%
                  weighted overlap with your confirmed core skills and carries
                  no more than two significant gaps, outside your active target
                  role families. That bar keeps suggestions credible; it is not
                  a judgement of your evidence. Confirm more evidence in your
                  career profile to widen what can qualify.
                </p>
              </div>
            ) : (
              <ul>
                {result.items.map((item) => (
                  <ExploreItem
                    key={item.suggestion.pathway.normalizedConcept}
                    item={item}
                  />
                ))}
              </ul>
            )}
          </section>

          {result.dismissed.length > 0 ? (
            <section aria-label="Dismissed pathways" className="mt-8">
              <h2 className="text-sm font-semibold text-foreground">
                Dismissed pathways
              </h2>
              <ul className="mt-3">
                {result.dismissed.map((item) => (
                  <ExploreItem
                    key={item.suggestion.pathway.normalizedConcept}
                    item={item}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
