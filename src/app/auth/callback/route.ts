import { createClient } from "@/lib/supabase/server";
import { safeInternalRedirect } from "@/lib/security";
import { NextResponse } from "next/server";

function privateRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalRedirect(searchParams.get("next"), origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return privateRedirect(new URL(next, origin));
    }
  }

  return privateRedirect(
    new URL("/login?error=auth_callback_error", origin)
  );
}
