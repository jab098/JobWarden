import { describe, expect, it } from "vitest";

import {
  requiredMigrationFiles,
  verifyFoundationSql,
} from "./verify-supabase-foundation.mjs";

describe("Supabase foundation static verifier", () => {
  it("fails when a required migration is missing", () => {
    const failures = verifyFoundationSql(new Map());

    expect(failures).toContain(
      `missing required migration: ${requiredMigrationFiles[0]}`,
    );
  });

  it("rejects security-definer functions without an empty search path", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );
    files.set(
      requiredMigrationFiles[1],
      `
        create function public.insecure() returns boolean
        language sql stable security definer
        as $$ select true $$;
      `,
    );

    expect(verifyFoundationSql(files)).toContain(
      "security-definer function public.insecure must set search_path to empty",
    );
  });

  it("checks the real migration set when supplied by the caller", () => {
    const files = new Map(
      requiredMigrationFiles.map((file) => [file, "select 1;"]),
    );

    expect(verifyFoundationSql(files)).toEqual(
      expect.arrayContaining([
        "public table profiles must enable and force RLS",
        "missing exact approved-users active-jobs policy",
        "missing transaction-scoped source advisory lock",
      ]),
    );
  });
});
