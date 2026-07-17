import { PublicHome } from "@/components/auth/public-home";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";

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
    />
  );
}
