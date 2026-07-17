const unsafeRedirectCharacter = /[\\\u0000-\u001f\u007f]/;

export function getSafeRedirectPath(path: string | null): string {
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    unsafeRedirectCharacter.test(path)
  ) {
    return "/jobs";
  }

  return path;
}
