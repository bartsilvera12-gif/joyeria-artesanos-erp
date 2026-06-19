import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleClientOptions, type AppSupabaseClient } from "@/lib/supabase/schema";
import { getSupabaseServerUrl } from "@/lib/supabase/server-url";

/** Cliente service role (servidor): webhooks, /r redirect, jobs.
 *  Usa `SUPABASE_INTERNAL_URL` si está definida (co-host VPS); sino, `NEXT_PUBLIC_SUPABASE_URL`. */
export function createServiceRoleClient(): AppSupabaseClient {
  const url = getSupabaseServerUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { ...supabaseServiceRoleClientOptions }) as AppSupabaseClient;
}
