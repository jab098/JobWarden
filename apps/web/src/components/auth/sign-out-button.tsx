import { LogOut } from "lucide-react";

import { signOut } from "@/app/auth/sign-in/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button variant="ghost" type="submit" className="rounded-md">
        <LogOut aria-hidden="true" />
        Sign out
      </Button>
    </form>
  );
}
