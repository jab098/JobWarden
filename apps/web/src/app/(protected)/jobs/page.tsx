import type { Metadata } from "next";

import { signOut } from "@/app/auth/sign-in/actions";
import { WorkspaceHoldingView } from "@/components/auth/workspace-holding-view";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  return <WorkspaceHoldingView signOutAction={signOut} />;
}
