import { Badge } from "@/components/ui/badge";
import type { CareerEvidenceItem } from "@jobwarden/domain";

function evidenceState(item: CareerEvidenceItem): string {
  if (item.confirmationState === "confirmed") return "Confirmed";
  if (item.confirmationState === "rejected") return "Excluded";
  return "Needs review";
}

export function ProfileEvidenceList({
  evidence,
}: {
  evidence: readonly CareerEvidenceItem[];
}) {
  return (
    <section
      aria-labelledby="profile-evidence-heading"
      className="border-t border-[#dedbd2] py-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
            Evidence, not inference
          </p>
          <h2
            id="profile-evidence-heading"
            className="mt-2 text-xl font-semibold tracking-[-0.02em]"
          >
            Evidence to review
          </h2>
        </div>
        <span className="text-sm text-[#596173]">
          {evidence.length} {evidence.length === 1 ? "item" : "items"}
        </span>
      </div>
      {evidence.length === 0 ? (
        <p className="mt-5 max-w-2xl text-sm leading-6 text-[#596173]">
          Add a skill or career direction to begin. Extracted CV evidence will
          appear here only after the private upload path is activated and you
          review it.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[#ece9e2] border-y border-[#ece9e2]">
          {evidence.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
            >
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#263248]">
                    {item.label}
                  </span>
                  <Badge variant="outline" className="rounded-sm font-normal">
                    {item.category.replaceAll("_", " ")}
                  </Badge>
                </div>
                {item.evidenceExcerpt ? (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#596173]">
                    {item.evidenceExcerpt}
                  </p>
                ) : null}
                <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[#697181]">
                  {item.origin === "cv" ? "CV evidence" : "Added by you"} ·{" "}
                  {item.proficiencySignal}
                </p>
              </div>
              <Badge
                variant={
                  item.confirmationState === "rejected"
                    ? "destructive"
                    : "secondary"
                }
                className="rounded-sm"
              >
                {evidenceState(item)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
