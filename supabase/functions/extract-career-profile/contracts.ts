export const careerExtractionLimits = {
  requestBytes: 2_048,
  aiInputCharacters: 60_000,
  aiOutputTokens: 4_000,
  aiTimeoutMilliseconds: 30_000,
  requestTimeoutMilliseconds: 55_000,
  maximumAiDailyAllowance: 25,
} as const;

export type CareerRuntimeEnvironment = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  aiDailyAllowance: number;
  aiModel: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
};

export type ExtractionClaim = {
  disposition: "claimed" | "existing";
  runId: string;
  userId: string;
  cvDocumentId: string;
  storagePath: string;
  originalFileName: string;
  mediaType: string;
  byteSize: number;
  aiAllowed: boolean;
  status: "running" | "succeeded" | "failed";
  proposal: unknown | null;
  errorCode: string | null;
  claimToken: string | null;
  leaseExpiresAt: string | null;
  sha256Hex: string;
};

export interface CareerExtractionRepository {
  verifyUser(): Promise<string>;
  claim(
    userId: string,
    cvDocumentId: string,
    idempotencyKey: string,
  ): Promise<ExtractionClaim>;
  download(claim: ExtractionClaim): Promise<Uint8Array>;
  renew(runId: string, claimToken: string): Promise<Date>;
  succeed(
    runId: string,
    claimToken: string,
    proposal: unknown,
    inputCharacterCount: number,
    evidenceCount: number,
    suggestionCount: number,
  ): Promise<void>;
  fail(runId: string, claimToken: string, errorCode: string): Promise<void>;
}

export type CareerRuntimeLog = Readonly<{
  event: "career_extraction.completed" | "career_extraction.failed";
  correlationId: string;
  status: "succeeded" | "failed";
  inputCharacterCount?: number;
  evidenceCount?: number;
  suggestionCount?: number;
  aiSuggestionCount?: number;
  durationMs: number;
  modelIdentifier: string;
  errorCode?: string;
}>;

export type CareerExtractionDependencies = {
  readEnvironment(): CareerRuntimeEnvironment;
  createRepository(
    environment: CareerRuntimeEnvironment,
    accessToken: string,
  ): CareerExtractionRepository;
  generateSuggestions(
    text: string,
    evidence: readonly Record<string, unknown>[],
    options: {
      environment: CareerRuntimeEnvironment;
      signal: AbortSignal;
      maximumOutputTokens: number;
    },
  ): Promise<unknown>;
  now(): Date;
  randomUuid(): string;
  log(record: CareerRuntimeLog): void;
};

type RpcClient = {
  rpc(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
};

export type CareerRpcClient = RpcClient & {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
};

export type CareerServiceClient = RpcClient & {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
};
