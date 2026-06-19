import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isElevatePublicHost,
  ELEVATE_PUBLIC_PREFIX,
  ELEVATE_PUBLIC_HEADER,
} from "@/lib/elevate-public/hosts";

/**
 * Middleware:
 *   1. Si el host del request corresponde a la web pública de Elevate
 *      (config en `ELEVATE_PUBLIC_WEB_HOSTS`), rewrite hacia el prefijo
 *      interno `/__public/...` y se evita el refresh de sesión Supabase.
 *      La URL visible en el browser no cambia.
 *   2. Si el host corresponde al ERP/admin (elevate.neura.com.py u otro),
 *      se refresca la sesión Supabase en cookies como antes.
 *
 * Las rutas `/api/*`, `/_next/*` y estáticas se sirven sin rewrite incluso
 * en hosts públicos — la API pública vive en `/api/public/elevate/*` y debe
 * seguir accesible para fetch desde el frontend público.
 */
export async function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const pathname = request.nextUrl.pathname;

  // Bypass para rutas que no son páginas: API, assets internos.
  const isAssetOrApi =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.[a-zA-Z0-9]+$/.test(pathname);

  if (isElevatePublicHost(host)) {
    if (isAssetOrApi) {
      // En hosts públicos no refrescamos sesión Supabase (no hay sesión).
      return NextResponse.next();
    }

    // Si ya está rewriteado (defensivo), no duplicar prefijo.
    if (pathname.startsWith(`${ELEVATE_PUBLIC_PREFIX}/`) || pathname === ELEVATE_PUBLIC_PREFIX) {
      return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? ELEVATE_PUBLIC_PREFIX : `${ELEVATE_PUBLIC_PREFIX}${pathname}`;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(ELEVATE_PUBLIC_HEADER, "1");

    return NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  }

  /**
   * Host NO público (ERP/admin) — bloquear el prefijo interno `/publico/*`
   * que no debería ser navegable directamente desde el dominio del ERP.
   * El contenido público solo debe servirse vía hosts en
   * `ELEVATE_PUBLIC_WEB_HOSTS`.
   */
  if (pathname === ELEVATE_PUBLIC_PREFIX || pathname.startsWith(`${ELEVATE_PUBLIC_PREFIX}/`)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // ERP/admin path — comportamiento legacy (refresh de sesión Supabase).
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}

/**
 * Matcher: excluye TODO lo que no requiere lógica de middleware.
 * Sin esto, cada request a un asset/imagen/font/etc. ejecuta el middleware,
 * carga ssr, lee request data y marca todas las rutas como dynamic.
 *
 * Excluidos:
 *   - /api/webhooks/*       (Meta sin cookies)
 *   - /api/public/elevate/* (catálogo público, sin sesión)
 *   - /_next/static/*
 *   - /_next/image
 *   - /_next/data/*
 *   - favicon, robots, sitemap, manifest
 *   - cualquier archivo con extensión (.svg/.png/.jpg/.css/.js/.woff/etc.)
 */
export const config = {
  matcher: [
    "/((?!api/webhooks|api/public/elevate|_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.json|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
