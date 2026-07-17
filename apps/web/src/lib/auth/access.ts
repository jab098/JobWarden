export type AccessRepository = {
  getAuthenticatedUser(): Promise<{ id: string } | null>;
  getOwnAccessStatus(
    userId: string,
  ): Promise<"pending" | "approved" | "rejected" | "suspended" | null>;
  hasAdminRole(userId: string): Promise<boolean>;
};

export type AllowedAccess = {
  kind: "allowed";
  userId: string;
  isAdmin: boolean;
};

export type AccessResolution =
  | AllowedAccess
  | { kind: "redirect"; destination: "/auth/sign-in" | "/access/pending" }
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
