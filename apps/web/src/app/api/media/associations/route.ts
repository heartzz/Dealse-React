import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { dealseApiOrigin } from "../../../../lib/dealse-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return Response.json({ message: "Invalid request origin." }, { status: 403 });
    }
  } catch {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declaredLength) || declaredLength > 16 * 1024) {
    return Response.json({ message: "The image gallery request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Choose a valid image gallery." }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return Response.json({ message: "Sign in to continue." }, { status: 401 });
    const upstream = await fetch(`${dealseApiOrigin()}/api/v1/media/associations`, {
      method: "PATCH",
      cache: "no-store",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ message: "Image gallery changes are temporarily unavailable." }, { status: 503 });
  }
}
