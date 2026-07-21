import { createClient } from "@supabase/supabase-js";

import { withCors } from "../_shared/cors.ts";

import type { CareerRpcClient, CareerServiceClient } from "./contracts.ts";
import { readCareerRuntimeEnvironment } from "./environment.ts";
import { createCareerExtractionHandler } from "./handler.ts";
import { createSupabaseCareerExtractionRepository } from "./repository.ts";

const handler = createCareerExtractionHandler({
  readEnvironment: () => readCareerRuntimeEnvironment(Deno.env.toObject()),
  createRepository: (environment, accessToken) => {
    const common = {
      auth: {
        autoRefreshToken: false as const,
        detectSessionInUrl: false as const,
        persistSession: false as const,
      },
    };
    const caller = createClient(environment.supabaseUrl, environment.anonKey, {
      ...common,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }) as unknown as CareerRpcClient;
    const service = createClient(
      environment.supabaseUrl,
      environment.serviceRoleKey,
      common,
    ) as unknown as CareerServiceClient;
    return createSupabaseCareerExtractionRepository(caller, service);
  },
  generateSuggestions: async (text, evidence, options) => {
    const { environment } = options;
    if (
      environment.cloudflareAccountId === undefined ||
      environment.cloudflareApiToken === undefined ||
      environment.aiModel === "disabled"
    ) {
      return [];
    }
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(environment.cloudflareAccountId)}/ai/run/${encodeURIComponent(environment.aiModel)}`;
    const result = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${environment.cloudflareApiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "Return only a JSON array of strict JobWarden profile suggestions. Every suggestion must reference only supplied evidence UUIDs. Do not infer unsupported facts.",
          },
          {
            role: "user",
            content: JSON.stringify({ evidence, cvText: text }),
          },
        ],
        max_tokens: options.maximumOutputTokens,
      }),
      signal: options.signal,
    });
    if (!result.ok) throw new Error("AI request failed.");
    const envelope = (await result.json()) as {
      success?: unknown;
      result?: { response?: unknown };
    };
    const response = envelope.result?.response;
    if (typeof response !== "string") return response;
    try {
      return JSON.parse(response);
    } catch {
      return [];
    }
  },
  now: () => new Date(),
  randomUuid: () => crypto.randomUUID(),
  log: (record) => console.info(JSON.stringify(record)),
});

// The browser uploads to Storage directly and then calls this function, so it
// needs a preflight answer. Without one the invoke throws before the function
// runs, and the CV silently never extracts.
Deno.serve(
  withCors(handler, readCareerRuntimeEnvironment(Deno.env.toObject()).siteUrl),
);
