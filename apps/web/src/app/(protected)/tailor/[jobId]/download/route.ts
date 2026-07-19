import { NextResponse } from "next/server";
import { z } from "zod";

import { requireProtectedAccess } from "@/lib/auth/access-server";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { getTailoringRepository } from "@/lib/tailoring/get-repository";

export const dynamic = "force-dynamic";

const docxMediaType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Quoted filename, ASCII only, so no header can be split by the value. */
function contentDisposition(fileName: string): string {
  const safe = fileName.replace(/[^\w.-]+/gu, "-").slice(0, 120);
  return `attachment; filename="${safe}"`;
}

export async function GET(request: Request): Promise<Response> {
  // A route handler does not run the (protected) layout, so the access gate is
  // applied here explicitly. RLS would still refuse another owner's variant,
  // but this route must not be the one place that relies on it alone.
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });
  if (!developmentAccess.enabled) await requireProtectedAccess();

  const variantId = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("variantId"));
  if (!variantId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    // Regenerated from the stored original on every request, so a download can
    // never serve a stale or tampered binary.
    const rendered = await (
      await getTailoringRepository()
    ).renderVariant(variantId.data);

    return new NextResponse(rendered.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-disposition": contentDisposition(rendered.fileName),
        "content-type": docxMediaType,
      },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }
}
