import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_PUBLIC_SUFFIXES = ["/auth/sign-in", "/auth/access-denied"];

function stripLocale(pathname: string): { locale: string; path: string } {
  const match = pathname.match(/^\/(en|ar)(\/.*)?$/);
  if (!match) {
    return { locale: "en", path: pathname };
  }
  return { locale: match[1], path: match[2] ?? "/" };
}

function isPublicPath(path: string): boolean {
  return AUTH_PUBLIC_SUFFIXES.some((suffix) => path === suffix || path.startsWith(`${suffix}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { locale, path } = stripLocale(request.nextUrl.pathname);

  if (path.startsWith("/auth/callback")) {
    return supabaseResponse;
  }

  if (!user && !isPublicPath(path)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = `/${locale}/auth/sign-in`;
    signInUrl.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  if (user && path === "/auth/sign-in") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = `/${locale}`;
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}
