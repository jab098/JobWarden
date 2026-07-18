export const careerExtractionLimits = {
  requestBytes: 2_048,
  aiInputCharacters: 60_000,
  aiOutputTokens: 4_000,
  aiTimeoutMilliseconds: 30_000,
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
};

export interface CareerExtractionRepository {
  claim(
    cvDocumentId: string,
    idempotencyKey: string,
    aiDailyAllowance: number,
  ): Promise<ExtractionClaim>;
  download(claim: ExtractionClaim): Promise<Uint8Array>;
  succeed(
    runId: string,
    proposal: unknown,
    inputCharacterCount: number,
    evidenceCount: number,
    suggestionCount: number,
  ): Promise<void>;
  fail(runId: string, errorCode: string): Promise<void>;
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

export type CareerRpcClient = {
  rpc(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
};

export type CareerServiceClient = CareerRpcClient & {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
};
