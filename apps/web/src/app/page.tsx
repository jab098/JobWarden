import { signInWithGoogle } from "@/app/auth/sign-in/actions";
import { PublicHome } from "@/components/auth/public-home";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { turnstileSiteKey } from "@/lib/early-access/turnstile";

export default function Home() {
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });

  return (
    <PublicHome
      dataMode={
        developmentAccess.enabled ? developmentAccess.dataMode : undefined
      }
      signInAction={signInWithGoogle}
      // Read on the server: the site key is public, but whether one exists at
      // all decides whether the form can be offered, and that belongs here
      // rather than being discovered in the browser.
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
