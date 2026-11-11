import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { dealseApiOrigin } from "../../../lib/dealse-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaId)) {
    return Response.json({ message: "Image not found." }, { status: 404 });
  }

  let accessToken: string | undefined;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token;
  } catch {
    // Public images remain available without an authenticated browser session.
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${dealseApiOrigin()}/api/v1/media/${mediaId}/content`, {
      cache: "no-store",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  } catch {
    return Response.json({ message: "Images are temporarily unavailable." }, { status: 503 });
  }

  const headers = new Headers();
  for (const name of ["content-type", "content-length", "cache-control", "etag", "x-content-type-options"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
