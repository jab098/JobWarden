import "server-only";

export type DevelopmentAccessInput = {
  nodeEnv: string | undefined;
  bypassFlag: string | undefined;
};

export function resolveDevelopmentAccessMode(
  input: DevelopmentAccessInput,
): { enabled: false } | { enabled: true; dataMode: "fixtures" } {
  if (input.bypassFlag !== "true") return { enabled: false };

  if (input.nodeEnv !== "development") {
    throw new Error(
      "Development access bypass is forbidden outside local development",
    );
  }

  return { enabled: true, dataMode: "fixtures" };
}
