const FALLBACK_PATH = "/jobs";
const MAX_DECODE_LAYERS = 2;
const unsafeRedirectCharacter = /[\\\u0000-\u001f\u007f-\u009f]/;

function isSafePathLayer(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !unsafeRedirectCharacter.test(path)
  );
}

function passesDecodedPathChecks(path: string): boolean {
  let decoded = path;

  for (let layer = 0; layer <= MAX_DECODE_LAYERS; layer += 1) {
    if (!isSafePathLayer(decoded)) return false;
    if (!decoded.includes("%")) return true;
    if (layer === MAX_DECODE_LAYERS) return false;

    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return false;
    }
  }

  return false;
}

export function getSafeRedirectPath(
  path: string | null,
  siteOrigin: string,
): string {
  if (!path || !passesDecodedPathChecks(path)) return FALLBACK_PATH;

  try {
    const configuredOrigin = new URL(siteOrigin);
    const destination = new URL(path, configuredOrigin);

    if (
      !["http:", "https:"].includes(configuredOrigin.protocol) ||
      destination.origin !== configuredOrigin.origin
    ) {
      return FALLBACK_PATH;
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return FALLBACK_PATH;
  }
}
