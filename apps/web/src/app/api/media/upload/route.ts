import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { dealseApiOrigin } from "../../../../lib/dealse-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxUploadBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) return Response.json({ message: "Invalid request origin." }, { status: 403 });
  } catch {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }
  let accessToken: string;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return Response.json({ message: "Sign in to upload an image." }, { status: 401 });
    accessToken = data.session.access_token;
  } catch {
    return Response.json({ message: "Sign in to upload an image." }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 1) return Response.json({ message: "A request length is required." }, { status: 411 });
  if (declaredLength > maxUploadBytes + 64 * 1024) return Response.json({ message: "Choose an image up to 5 MB." }, { status: 413 });
  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return Response.json({ message: "Choose a supported image file." }, { status: 400 });
  }
  const file = incoming.get("file");
  if (!(file instanceof File) || file.size > maxUploadBytes) return Response.json({ message: "Choose an image up to 5 MB." }, { status: 400 });

  const form = new FormData();
  for (const key of ["retailerId", "targetId", "purpose", "altText", "uploadId", "replaceMediaId"]) {
    const value = incoming.get(key);
    if (typeof value === "string") form.set(key, value);
  }
  form.set("file", new Blob([await file.arrayBuffer()], { type: file.type }), file.name.slice(0, 180) || "image");

  try {
    const upstream = await fetch(`${dealseApiOrigin()}/api/v1/media/upload`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ message: "Image upload is temporarily unavailable." }, { status: 503 });
  }
}
