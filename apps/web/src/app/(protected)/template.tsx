/**
 * Remounts on every route change inside the shell, so page content re-runs
 * the CSS entrance while the sidebar and header stay put. Pure CSS; the
 * global reduced-motion guard collapses it to an instant appearance.
 */
export default function ProtectedTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="page-enter">{children}</div>;
}
