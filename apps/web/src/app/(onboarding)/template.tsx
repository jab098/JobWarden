/** Same soft entrance as the shell routes, replayed per onboarding step. */
export default function OnboardingTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="page-enter">{children}</div>;
}
