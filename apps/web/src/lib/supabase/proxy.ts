import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSupabaseSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const secure = process.env.NODE_ENV === "production";
  const authCookiePresent = request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
  let sessionCookiesRefreshed = false;
  const supabase = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        if (cookiesToSet.some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name))) {
          sessionCookiesRefreshed = true;
        }
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: "lax",
            secure,
            path: "/",
          });
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  if (authCookiePresent && error) {
    const code = typeof error.code === "string" && /^[a-z0-9_-]{1,80}$/i.test(error.code) ? error.code : null;
    const status = typeof error.status === "number" && Number.isInteger(error.status) ? error.status : null;
    console.warn("[DealSe Auth] session claims or refresh rejected", {
      stage: "session_refresh",
      cookiePresent: true,
      refreshAccepted: false,
      providerErrorCode: code,
      providerStatus: status,
    });
  } else if (authCookiePresent && sessionCookiesRefreshed) {
    console.info("[DealSe Auth] session cookies refreshed", {
      stage: "session_refresh",
      cookiePresent: true,
      refreshAccepted: !error,
      claimsPresent: Boolean(data?.claims.sub),
    });
  }
  return response;
}
