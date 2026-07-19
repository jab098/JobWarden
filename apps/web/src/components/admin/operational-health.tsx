import type { OperationalHealth } from "@/lib/admin/types";

function Figure({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <span className="block text-2xl font-semibold tracking-[-0.02em] text-[#172033]">
        {value}
      </span>
      <span className="mt-1 block text-xs text-[#697181]">{label}</span>
    </div>
  );
}

export function OperationalHealthPanel({
  health,
}: {
  health: OperationalHealth;
}) {
  const { deliveries, ai } = health;
  const daysLow = deliveries.dailyHeadroom === 0;

  return (
    <div className="mt-4 space-y-8">
      <section aria-labelledby="delivery-health">
        <h2
          id="delivery-health"
          className="text-sm font-semibold text-[#263248]"
        >
          Digest delivery
        </h2>
        <p className="mt-1 max-w-prose text-sm text-[#596173]">
          Counted from the delivery records the runtime writes, including
          in-flight rows — so this is the headroom the send path will actually
          apply, not an estimate.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure value={deliveries.sentToday} label="sent today" />
          <Figure
            value={deliveries.dailyHeadroom}
            label={`left today of ${deliveries.dailyLimit}`}
          />
          <Figure value={deliveries.sentThisMonth} label="sent this month" />
          <Figure
            value={deliveries.monthlyHeadroom}
            label={`left this month of ${deliveries.monthlyLimit}`}
          />
        </div>
        {daysLow ? (
          <p role="status" className="mt-3 text-sm text-[#8a6d2f]">
            <span
              aria-hidden="true"
              className="mr-2 inline-block size-2 rounded-full bg-[#8a6d2f] align-middle"
            />
            Today&rsquo;s allowance is used up. Further slots are suppressed and
            recorded; nothing is sent and nothing is charged.
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <Figure
            value={deliveries.suppressedNoMatches}
            label="slots with no new matches"
          />
          <Figure
            value={deliveries.suppressedByCap}
            label="held back by a limit"
          />
          <Figure value={deliveries.failed} label="failed and retried" />
        </div>
      </section>

      <section aria-labelledby="ai-health">
        <h2 id="ai-health" className="text-sm font-semibold text-[#263248]">
          Optional AI allowance
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Figure value={ai.usedToday} label="used today" />
          <Figure value={ai.dailyAllowance} label="daily allowance" />
        </div>
        {ai.dailyAllowance === 0 ? (
          <p className="mt-3 max-w-prose text-sm text-[#596173]">
            The allowance is zero, which is the default. Optional AI is off and
            extraction runs deterministically; raise it deliberately if you want
            machine-proposed suggestions.
          </p>
        ) : null}
      </section>
    </div>
  );
}
