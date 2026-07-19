import { isOnboardingComplete, parseOnboardingState } from "@jobwarden/domain";

export type AccessRepository = {
  getAuthenticatedUser(): Promise<{ id: string } | null>;
  getOwnAccessStatus(
    userId: string,
  ): Promise<"pending" | "approved" | "rejected" | "suspended" | null>;
  hasAdminRole(userId: string): Promise<boolean>;
  /** Raw stored state; anything unparseable must gate rather than admit. */
  getOwnOnboardingState(userId: string): Promise<unknown>;
};

export type AllowedAccess = {
  kind: "allowed";
  userId: string;
  isAdmin: boolean;
};

export type AccessResolution =
  | AllowedAccess
  | {
      kind: "redirect";
      destination: "/auth/sign-in" | "/access/pending" | "/onboarding";
    }
  | { kind: "not-found" };

export async function resolveProtectedAccess(
  repository: AccessRepository,
): Promise<AccessResolution> {
  const user = await repository.getAuthenticatedUser();

  if (!user) {
    return { kind: "redirect", destination: "/auth/sign-in" };
  }

  const [status, isAdmin] = await Promise.all([
    repository.getOwnAccessStatus(user.id),
    repository.hasAdminRole(user.id),
  ]);

  if (status !== "approved" && !isAdmin) {
    return { kind: "redirect", destination: "/access/pending" };
  }

  // Mandatory initialisation: the hub needs a profile to be useful, so an
  // approved user is held at onboarding until they have built one. A read that
  // throws, or a row that does not parse, counts as not onboarded — the gate
  // fails closed rather than admitting on doubt.
  let onboarding: unknown;
  try {
    onboarding = await repository.getOwnOnboardingState(user.id);
  } catch {
    return { kind: "redirect", destination: "/onboarding" };
  }
  if (!isOnboardingComplete(parseOnboardingState(onboarding))) {
    return { kind: "redirect", destination: "/onboarding" };
  }

  return { kind: "allowed", userId: user.id, isAdmin };
}

/**
 * Approved access without the onboarding requirement. Onboarding itself runs
 * here — it cannot sit behind the gate it satisfies — and so does /admin,
 * deliberately: an operational surface must never be lockable by a product
 * gate, or a broken onboarding flow would cost the owner the ability to
 * administer their way out of it.
 */
export async function resolveApprovedAccess(
  repository: AccessRepository,
): Promise<AccessResolution> {
  const user = await repository.getAuthenticatedUser();

  if (!user) {
    return { kind: "redirect", destination: "/auth/sign-in" };
  }

  const [status, isAdmin] = await Promise.all([
    repository.getOwnAccessStatus(user.id),
    repository.hasAdminRole(user.id),
  ]);

  if (status !== "approved" && !isAdmin) {
    return { kind: "redirect", destination: "/access/pending" };
  }

  return { kind: "allowed", userId: user.id, isAdmin };
}

export async function resolveAdminAccess(
  repository: AccessRepository,
): Promise<AccessResolution> {
  const user = await repository.getAuthenticatedUser();

  if (!user) {
    return { kind: "redirect", destination: "/auth/sign-in" };
  }

  if (!(await repository.hasAdminRole(user.id))) {
    return { kind: "not-found" };
  }

  return { kind: "allowed", userId: user.id, isAdmin: true };
}
