import { Enter } from "@/components/ui/enter";

/**
 * The frame around onboarding. The steps themselves advance through a server
 * action rather than a navigation, so this never remounts between them; the
 * flow animates each step itself, keyed on which step it is.
 */
export default function OnboardingTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Enter>{children}</Enter>;
}
