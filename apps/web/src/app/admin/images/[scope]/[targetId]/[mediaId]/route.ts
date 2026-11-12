import { NextResponse } from "next/server";
import { dealseApiOrigin } from "../../../../../../lib/dealse-api";
import { requireWebSession } from "../../../../../../lib/auth-session";

export async function GET(_request: Request, { params }: { params: Promise<{ scope: string; targetId: string; mediaId: string }> }) {
  const { scope, targetId, mediaId } = await params;
  if (scope !== "store" && scope !== "offer") return new NextResponse(null, { status: 404 });
  let accessToken: string;
  try { ({ accessToken } = await requireWebSession("/admin/login")); } catch { return new NextResponse(null, { status: 401 }); }
  const target = scope === "store" ? "stores" : "deals";
  let upstream: Response;
  try {
    upstream = await fetch(`${dealseApiOrigin()}/api/v1/admin/${target}/${encodeURIComponent(targetId)}/media/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  } catch { return new NextResponse(null, { status: 502 }); }
  if (!upstream.ok) return new NextResponse(null, { status: upstream.status === 401 ? 401 : upstream.status === 403 ? 403 : 404 });
  return new NextResponse(await upstream.arrayBuffer(), { status: 200, headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
