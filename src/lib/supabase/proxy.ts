import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/site";

const protectedPrefixes = ["/buyer", "/vendor", "/admin", "/onboarding", "/account", "/report"];

export function isProtectedPath(path: string) {
  return protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value)
        );
      }
    }
  });

  const { data } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (isProtectedPath(path) && !authenticated) {
    const loginUrl = new URL(absoluteUrl("/login"));
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }
  if (path === "/login" && authenticated) {
    return NextResponse.redirect(new URL(absoluteUrl("/onboarding")));
  }
  return response;
}
