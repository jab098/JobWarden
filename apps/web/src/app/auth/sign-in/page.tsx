import type { Metadata } from "next";

import { signInWithGoogle } from "./actions";
import { SignInView } from "@/components/auth/sign-in-view";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  return (
    <SignInView
      action={signInWithGoogle}
      error={typeof error === "string" ? error : undefined}
    />
  );
}
