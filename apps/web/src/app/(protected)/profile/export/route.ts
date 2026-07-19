import { NextResponse } from "next/server";

import { requireProtectedAccess } from "@/lib/auth/access-server";
import { resolveDevelopmentAccessMode } from "@/lib/development/access-mode";
import { getExportRepository } from "@/lib/profile/export-repository";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  // A route handler does not run the (protected) layout, so the access gate is
  // applied here explicitly.
  const developmentAccess = resolveDevelopmentAccessMode({
    nodeEnv: process.env.NODE_ENV,
    bypassFlag: process.env.JOBWARDEN_DEV_ACCESS_BYPASS,
  });
  if (!developmentAccess.enabled) await requireProtectedAccess();

  try {
    const bundle = await (await getExportRepository()).exportOwnData();

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-disposition": 'attachment; filename="jobwarden-export.json"',
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
