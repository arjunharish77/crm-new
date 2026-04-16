import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseBrowserEnv } from "./env";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const { url, anonKey } = getSupabaseBrowserEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          request.cookies.set(name, value)
        );

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  void supabase.auth.getUser();

  return response;
}
