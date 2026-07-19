import { ExploreItem } from "@/components/explore/explore-item";
import { ExploreToggle } from "@/components/explore/explore-toggle";
import type { ExploreResult } from "@/lib/explore/types";

export function ExploreView({ result }: { result: ExploreResult }) {
  const count = result.items.length;

  return (
    <div className="mx-auto min-h-screen max-w-[92rem] bg-white">
      <header className="border-b border-[#dedbd2] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[#697181]">
          United Kingdom only
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#172033] sm:text-4xl">
          Explore adjacent careers
        </h1>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#ece9e2] pt-4 text-sm text-[#596173]">
          {result.enabled ? (
            <span className="font-medium text-[#263248]">
              {count} {count === 1 ? "credible pathway" : "credible pathways"}
            </span>
          ) : (
            <span className="font-medium text-[#263248]">Explore is off</span>
          )}
          {result.dataMode === "fixtures" ? (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[#7a5a20]">
              Development data
            </span>
          ) : null}
          <ExploreToggle enabled={result.enabled} />
        </div>
      </header>

      {!result.enabled ? (
        <section aria-label="About Explore" className="px-5 py-16 sm:px-8">
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">
            An opt-in feed for credible adjacent careers
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#596173]">
            Explore is opt-in and off by default. When you turn it on, JobWarden
            deterministically compares your confirmed evidence with a curated UK
            pathway taxonomy. A pathway is suggested only when it reaches at
            least 70% weighted overlap with your demonstrated core skills, has
            no more than two significant trainable gaps, and sits outside your
            active target role families. Keyword coincidence is never enough,
            and nothing here changes your selected targets.
          </p>
        </section>
      ) : (
        <>
          <section aria-label="Suggested pathways" className="min-w-0">
            {count === 0 ? (
              <div className="px-5 py-16 sm:px-8">
                <h2 className="text-2xl font-semibold tracking-[-0.025em]">
                  No pathway clears the bar right now
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#596173]">
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
            <section
              aria-label="Dismissed pathways"
              className="border-t border-[#dedbd2] px-0 pb-10"
            >
              <h2 className="px-5 pt-8 text-sm font-semibold uppercase tracking-[0.1em] text-[#697181] sm:px-7">
                Dismissed pathways
              </h2>
              <ul>
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
