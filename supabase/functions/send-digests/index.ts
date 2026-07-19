import { readNotificationEnvironment } from "./environment.ts";
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { createNotificationHandler } from "./handler.ts";
import { createSupabaseNotificationRepository } from "./repository.ts";
import { createResendSender, readResendApiKey } from "./resend.ts";

const handler = createNotificationHandler({
  readEnvironment: () => readNotificationEnvironment(Deno.env.toObject()),
  createRepository: (environment) =>
    createSupabaseNotificationRepository(createServiceRoleClient(environment)),
  createSender: () => {
    const apiKey = readResendApiKey(Deno.env.toObject());
    return apiKey === null ? null : createResendSender(apiKey);
  },
  now: () => new Date(),
  randomUuid: () => crypto.randomUUID(),
  log: (record) => console.info(JSON.stringify(record)),
});

Deno.serve(handler);
