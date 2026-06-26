import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { usuarioEmailLookupVariants } from "@/lib/auth/usuario-email-variants";
import { supabaseDbSchemaOption, type AppSupabaseClient } from "@/lib/supabase/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getSupabaseServerUrl } from "@/lib/supabase/server-url";

export type ApiAuthFailureCode =
  | "missing_public_env"
  | "no_session"
  | "usuario_query_error"
  | "usuario_zero_rows"
  | "empresa_id_null";

export type ApiAuthContext = {
  user: User;
  /** null solo cuando forDataSchemaEndpoint y super_admin sin empresa. */
  empresa_id: string | null;
  /** PK `zentra_erp.usuarios.id` cuando se resolvió la fila (service role o RLS). */
  usuarioCatalogId?: string | null;
  /** Cliente anon + JWT del usuario (cookies o Bearer). PostgREST respeta RLS en zentra_erp. */
  userScopedSupabase: AppSupabaseClient;
  usuarioRol?: string | null;
  usuarioNombre?: string | null;
  /** Sucursal del usuario (Joyería Artesanos multi-sucursal). NULL = ve todas. */
  sucursal_id?: string | null;
};

export type ApiAuthResult =
  | { ok: true; ctx: ApiAuthContext }
  | { ok: false; code: ApiAuthFailureCode; detail?: string };

function extractBearerFromRequest(request?: Request | null): string | null {
  const h = request?.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

type BearerResolved = { token: string | null; source: "request" | "next-headers" | "none" };

async function resolveBearerToken(request?: Request | null): Promise<BearerResolved> {
  const fromReq = extractBearerFromRequest(request);
  if (fromReq) return { token: fromReq, source: "request" };
  try {
    const h = await headers();
    const a = h.get("authorization");
    if (a?.toLowerCase().startsWith("bearer ")) {
      const t = a.slice(7).trim();
      if (t) return { token: t, source: "next-headers" };
    }
  } catch {
    /* fuera de contexto de petición */
  }
  return { token: null, source: "none" };
}

type UsuarioRow = {
  id?: string;
  empresa_id?: string | null;
  rol?: string | null;
  nombre?: string | null;
};

/**
 * Lectura best-effort de `usuarios.sucursal_id` (solo schemas multi-sucursal
 * como `joyeriaartesanos`). Si la columna no existe (deploys Elevate viejos),
 * devuelve null sin tirar error.
 */
async function fetchSucursalIdBestEffort(
  client: AppSupabaseClient,
  usuarioId: string,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("usuarios")
      .select("sucursal_id")
      .eq("id", usuarioId)
      .maybeSingle();
    if (error) return null;
    const raw = (data as { sucursal_id?: string | null } | null)?.sucursal_id;
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

export type ResolveApiAuthOptions = {
  forDataSchemaEndpoint?: boolean;
};

/**
 * Auth: `getUser` con anon + URL públicos (sin db.schema en el cliente de Auth).
 * Catálogo `zentra_erp.usuarios`: con `SUPABASE_SERVICE_ROLE_KEY` se lee por service role
 * (misma idea que module-access); sin service key, fallback anon+JWT+RLS.
 * PostgREST usuario: `userScopedSupabase` (anon + JWT + schema) para rutas que consultan con RLS.
 */
export async function resolveApiAuthContext(
  request?: Request | null,
  opts?: ResolveApiAuthOptions
): Promise<ApiAuthResult> {
  let url: string;
  try {
    url = getSupabaseServerUrl();
  } catch {
    return { ok: false, code: "missing_public_env" };
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) {
    return { ok: false, code: "missing_public_env" };
  }

  const bearerResolved = await resolveBearerToken(request);
  const bearer = bearerResolved.token;

  let user: User | null = null;
  let userScopedSupabase: AppSupabaseClient;

  if (bearer) {
    const authOnly = createClient(url, anonKey);
    const { data, error } = await authOnly.auth.getUser(bearer);
    if (error || !data.user?.id) {
      return { ok: false, code: "no_session", detail: error?.message };
    }
    user = data.user;

    userScopedSupabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      ...supabaseDbSchemaOption,
    }) as AppSupabaseClient;
  } else {
    const cookieStore = await cookies();

    const authOnly = createServerClient(url, anonKey, {
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
    const { data, error } = await authOnly.auth.getUser();
    if (error || !data.user?.id) {
      return { ok: false, code: "no_session", detail: error?.message };
    }
    user = data.user;

    userScopedSupabase = createServerClient(url, anonKey, {
      ...supabaseDbSchemaOption,
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
    }) as AppSupabaseClient;
  }

  let row: UsuarioRow | undefined;
  let lastUsuarioErr: string | null = null;

  /**
   * Estrategia de lectura de `usuarios`:
   *
   *   1. SR si está disponible (path legacy / multitenant).
   *   2. Si SR falla con 401/403 (Unauthorized) — caso típico cuando la SR del
   *      runtime no pertenece al proyecto Supabase actual (deploys Hostinger
   *      hPanel con env var stale) — fallback a JWT del usuario contra RLS.
   *   3. Sin SR configurada: directamente JWT.
   *
   * Sin RLS estricta en `elevate.*` y con grants a `authenticated`, el path JWT
   * funciona. Esto evita un rebote de login solo por una SR mal configurada.
   */
  const resolvedUser: User = user;
  async function tryWithClient(client: AppSupabaseClient): Promise<{ row?: UsuarioRow; err?: string }> {
    if (resolvedUser.id) {
      const { data: byId, error: e1, status } = await client
        .from("usuarios")
        .select("id, empresa_id, rol, nombre")
        .eq("auth_user_id", resolvedUser.id)
        .limit(1);
      if (e1) return { err: e1.message + (status ? ` [${status}]` : "") };
      if (byId?.[0]) return { row: byId[0] as UsuarioRow };
    }
    if (resolvedUser.email) {
      for (const em of usuarioEmailLookupVariants(resolvedUser.email)) {
        const { data: rows, error: uErr, status } = await client
          .from("usuarios")
          .select("id, empresa_id, rol, nombre")
          .ilike("email", em)
          .limit(1);
        if (uErr) return { err: uErr.message + (status ? ` [${status}]` : "") };
        if (rows?.[0]) return { row: rows[0] as UsuarioRow };
      }
    }
    return {};
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey) {
    const sr = createServiceRoleClient();
    const srResult = await tryWithClient(sr);
    row = srResult.row;
    lastUsuarioErr = srResult.err ?? null;
    // Fallback a JWT si SR fue rechazada por PostgREST (401/403) o devolvió Unauthorized.
    if (!row && lastUsuarioErr && /401|403|unauthorized|jwt|invalid/i.test(lastUsuarioErr)) {
      const jwtResult = await tryWithClient(userScopedSupabase);
      if (jwtResult.row) {
        row = jwtResult.row;
        lastUsuarioErr = null;
      } else if (jwtResult.err) {
        lastUsuarioErr = `SR:${lastUsuarioErr} | JWT:${jwtResult.err}`;
      }
    }
  } else {
    const jwtResult = await tryWithClient(userScopedSupabase);
    row = jwtResult.row;
    lastUsuarioErr = jwtResult.err ?? null;
  }

  if (!row && lastUsuarioErr) {
    return { ok: false, code: "usuario_query_error", detail: lastUsuarioErr };
  }

  if (!row) {
    return { ok: false, code: "usuario_zero_rows" };
  }

  const empresa_id = row.empresa_id ?? null;
  const usuarioRol = row.rol ?? null;
  const usuarioNombre = row.nombre ?? null;
  const usuarioCatalogId = typeof row.id === "string" ? row.id : null;
  const sucursal_id = usuarioCatalogId
    ? await fetchSucursalIdBestEffort(userScopedSupabase, usuarioCatalogId)
    : null;

  if (empresa_id) {
    return {
      ok: true,
      ctx: {
        user,
        empresa_id,
        usuarioCatalogId,
        userScopedSupabase,
        usuarioRol,
        usuarioNombre,
        sucursal_id,
      },
    };
  }

  if (opts?.forDataSchemaEndpoint && usuarioRol === "super_admin") {
    return {
      ok: true,
      ctx: {
        user,
        empresa_id: null,
        usuarioCatalogId,
        userScopedSupabase,
        usuarioRol,
        usuarioNombre,
        sucursal_id,
      },
    };
  }

  return { ok: false, code: "empresa_id_null" };
}
