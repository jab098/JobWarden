import type { MetadataRoute } from "next";

/**
 * JobWarden is a UK private beta. Every product surface already redirects an
 * unauthenticated request, and the few public pages (landing, legal, sign-in)
 * carry no content worth indexing while access is invite-only. So the whole
 * origin is disallowed to crawlers.
 *
 * This is a one-line posture change: when the beta opens and the landing should
 * be discoverable, replace `disallow: "/"` with the specific paths to allow.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
