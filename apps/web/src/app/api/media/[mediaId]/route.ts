import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { dealseApiOrigin } from "../../../../lib/dealse-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) return Response.json({ message: "Invalid request origin." }, { status: 403 });
  } catch {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }
  const { mediaId } = await context.params;
  const retailerId = new URL(request.url).searchParams.get("retailerId");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(mediaId) || !retailerId || !uuid.test(retailerId)) return Response.json({ message: "Image not found." }, { status: 404 });

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return Response.json({ message: "Sign in to continue." }, { status: 401 });
    const upstream = await fetch(`${dealseApiOrigin()}/api/v1/media/${mediaId}?retailerId=${encodeURIComponent(retailerId)}`, {
      method: "DELETE",
      cache: "no-store",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ message: "Image removal is temporarily unavailable." }, { status: 503 });
  }
}
