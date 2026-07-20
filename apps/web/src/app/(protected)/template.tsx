import { Enter } from "@/components/ui/enter";

/**
 * Remounts on every route change inside the shell, so page content re-runs its
 * entrance while the sidebar and header stay put. A surface new to this session
 * rises in; one already seen fades. The global reduced-motion guard collapses
 * both to an instant appearance.
 */
export default function ProtectedTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Enter>{children}</Enter>;
}
