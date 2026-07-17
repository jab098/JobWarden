import type { AccessRepository } from "./access";

type AccessStatus = "pending" | "approved" | "rejected" | "suspended";

type AccessRecord = {
  status: AccessStatus;
  reason: string | null;
};

type ClientShape = {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: { status: unknown; decision_reason: string | null } | null;
          error: unknown;
        }>;
      };
    };
  };
  rpc(functionName: string): Promise<{ data: unknown; error: unknown }>;
};

const accessStatuses = new Set<AccessStatus>([
  "pending",
  "approved",
  "rejected",
  "suspended",
]);

export type SupabaseAccessRepository = AccessRepository & {
  getOwnAccessRecord(userId: string): Promise<AccessRecord | null>;
};

export function createSupabaseAccessRepository(
  client: object,
): SupabaseAccessRepository {
  const typedClient = client as ClientShape;

  async function getOwnAccessRecord(
    userId: string,
  ): Promise<AccessRecord | null> {
    const { data, error } = await typedClient
      .from("access_requests")
      .select("status, decision_reason")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error("Unable to resolve access state");
    }

    if (!data || !accessStatuses.has(data.status as AccessStatus)) {
      return null;
    }

    return {
      status: data.status as AccessStatus,
      reason: data.decision_reason,
    };
  }

  return {
    async getAuthenticatedUser() {
      const { data, error } = await typedClient.auth.getUser();
      return error || !data.user ? null : { id: data.user.id };
    },
    async getOwnAccessStatus(userId) {
      return (await getOwnAccessRecord(userId))?.status ?? null;
    },
    async hasAdminRole() {
      const { data, error } = await typedClient.rpc("is_admin");

      if (error) {
        throw new Error("Unable to resolve administrator access");
      }

      return data === true;
    },
    getOwnAccessRecord,
  };
}
