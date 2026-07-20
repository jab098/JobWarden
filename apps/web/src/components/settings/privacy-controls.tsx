"use client";

import { useActionState, useEffect } from "react";
import { Trash2 } from "lucide-react";

import {
  deleteCvAction,
  deleteProfileDataAction,
} from "@/app/(protected)/profile/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ProfileActionState } from "@/lib/profile/types";

const initialState: ProfileActionState = { kind: "idle" };

async function deleteProfileFormAction(
  previousState: ProfileActionState,
  formData: FormData,
) {
  void previousState;
  void formData;
  return deleteProfileDataAction();
}

async function deleteCvFormAction(
  previousState: ProfileActionState,
  formData: FormData,
) {
  void previousState;
  void formData;
  return deleteCvAction();
}

export function PrivacyControls({
  readOnly,
  hasCv,
  blocked,
  onPendingChange = () => {},
}: {
  readOnly: boolean;
  hasCv: boolean;
  blocked: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [cvState, cvAction, cvPending] = useActionState(
    deleteCvFormAction,
    initialState,
  );
  const [profileState, profileAction, profilePending] = useActionState(
    deleteProfileFormAction,
    initialState,
  );
  useEffect(
    () => onPendingChange(cvPending || profilePending),
    [cvPending, onPendingChange, profilePending],
  );
  return (
    <section
      aria-labelledby="profile-privacy-heading"
      className="mt-3 rounded-lg border border-border bg-card p-5"
    >
      <h2
        id="profile-privacy-heading"
        className="text-base font-semibold tracking-[-0.01em]"
      >
        Privacy controls
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
        Delete private source documents separately, or remove the full career
        profile and every derived record. These controls never affect your beta
        access.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="outline"
                disabled={readOnly || !hasCv || cvPending || blocked}
              />
            }
          >
            <Trash2 aria-hidden="true" /> Delete CV data
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete the current CV and extracted evidence?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The private Storage object is removed before its metadata and
                all evidence derived from it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <form action={cvAction} onSubmit={() => onPendingChange(true)}>
                <AlertDialogAction
                  type="submit"
                  variant="destructive"
                  disabled={cvPending}
                >
                  Delete CV data
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="destructive"
                disabled={readOnly || profilePending || blocked}
              />
            }
          >
            Delete full profile
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete the full career profile?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This removes CV objects, evidence, suggestions, and named
                searches. It cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <form
                action={profileAction}
                onSubmit={() => onPendingChange(true)}
              >
                <AlertDialogAction
                  type="submit"
                  variant="destructive"
                  disabled={profilePending}
                >
                  Delete full profile
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {[cvState, profileState].map((state, index) =>
        state.kind !== "idle" ? (
          <p
            key={index}
            role={state.kind === "success" ? "status" : "alert"}
            className="mt-3 text-sm text-ink-secondary"
          >
            {state.message}
          </p>
        ) : null,
      )}
    </section>
  );
}
