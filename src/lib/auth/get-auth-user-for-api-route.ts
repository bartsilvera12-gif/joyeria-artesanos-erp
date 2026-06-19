import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseServerUrl } from "@/lib/supabase/server-url";

export function extractBearerTokenFromRequest(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

/**
 * Usuario de Auth para Route Handlers: JWT en header o cookies.
 * Usa SUPABASE_INTERNAL_URL server-side cuando está definida (co-host VPS).
 */
export async function getAuthUserForApiRoute(request: Request): Promise<User | null> {
  let url: string;
  try {
    url = getSupabaseServerUrl();
  } catch {
    return null;
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) return null;

  const bearer = extractBearerTokenFromRequest(request);
  if (bearer) {
    const c = createClient(url, anonKey);
    const { data, error } = await c.auth.getUser(bearer);
    if (!error && data.user?.id) return data.user;
  }

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });
  const { data, error } = await supabaseAuth.auth.getUser();
  if (!error && data.user?.id) return data.user;
  return null;
}
