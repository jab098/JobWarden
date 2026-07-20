import { AccessDecisionForm } from "./access-decision-form";
import { AccessSettingForm } from "./access-setting-form";
import { AdminStatus } from "./admin-status";
import { formatAdminDate, shortId } from "./admin-format";
import { Button } from "@/components/ui/button";
import type { AccessRequestView, AdminFormAction } from "@/lib/admin/types";

export function AccessRequestList({
  requests,
  requestsEnabled,
  decisionAction,
  settingAction,
  readOnly = false,
}: {
  requests: AccessRequestView[];
  requestsEnabled: boolean;
  decisionAction?: AdminFormAction;
  settingAction?: AdminFormAction;
  readOnly?: boolean;
}) {
  return (
    <section aria-labelledby="access-requests-heading" className="space-y-5">
      <div className="grid min-w-0 gap-4 border-b border-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <h2
            id="access-requests-heading"
            className="text-base font-semibold tracking-[-0.01em]"
          >
            Access requests
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {requestsEnabled
              ? "New requests are open."
              : "New requests are paused."}{" "}
            {requests.length} records.
          </p>
        </div>
        {readOnly ? (
          <div className="min-w-0 sm:justify-self-end">
            <ButtonState
              disabled
              label={
                requestsEnabled ? "Pause new requests" : "Accept new requests"
              }
            />
          </div>
        ) : settingAction ? (
          <AccessSettingForm enabled={requestsEnabled} action={settingAction} />
        ) : null}
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          No access requests have been recorded.
        </p>
      ) : (
        <div className="divide-y divide-[#dedad1] border-y border-[#dedad1]">
          {requests.map((request) => (
            <article
              key={request.userId}
              className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{request.displayName}</h3>
                  <AdminStatus state={request.status} />
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <dt className="text-xs text-ink-secondary">Requested</dt>
                    <dd className="mt-0.5 font-mono text-xs">
                      {formatAdminDate(request.requestedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-secondary">
                      Member reference
                    </dt>
                    <dd className="mt-0.5 font-mono text-xs">
                      {shortId(request.userId)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-secondary">
                      Last decision
                    </dt>
                    <dd className="mt-0.5 text-sm">
                      {request.decisionReason ?? "Awaiting review"}
                    </dd>
                  </div>
                </dl>
              </div>
              <AccessDecisionForm
                request={request}
                action={readOnly ? undefined : decisionAction}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ButtonState({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  return (
    <Button type="button" disabled={disabled} variant="outline">
      {label}
    </Button>
  );
}
