import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseDbSchemaOption } from "@/lib/supabase/schema";
import { getSupabaseServerUrl } from "@/lib/supabase/server-url";

/**
 * Cliente Supabase con sesión del usuario (cookies). Usar en Server Components / Route Handlers.
 */
export async function createSupabaseServerClient() {
  const url = getSupabaseServerUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY no definida");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    ...supabaseDbSchemaOption,
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* set desde Server Component sin mutar cookies */
        }
      },
    },
  });
}

/**
 * Misma sesión que `createSupabaseServerClient`, pero PostgREST apunta a otro esquema (datos omnicanal por empresa).
 */
export async function createSupabaseServerClientWithDbSchema(schema: string) {
  const url = getSupabaseServerUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY no definida");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    db: { schema },
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* set desde Server Component sin mutar cookies */
        }
      },
    },
  });
}
