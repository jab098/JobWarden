import { Enter } from "@/components/ui/enter";

/**
 * Remounts on every route change inside the shell, so page content re-runs its
 * entrance while the rail and header stay put. A surface new to this session
 * rises into place; one already seen settles more quickly.
 *
 * Neither entrance starts from fully transparent, and that is the whole point.
 * The outgoing page is removed in the same frame the incoming one mounts, so an
 * entrance beginning at zero opacity leaves the column empty for a moment: the
 * blink. Starting part-way visible means content is on screen continuously and
 * the motion reads as arrival rather than as a flash.
 */
export default function ProtectedTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Enter>{children}</Enter>;
}
