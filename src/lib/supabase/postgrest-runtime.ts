/**
 * PostgREST HTTPS runtime helper para esta instancia Elevate.
 *
 * Regla absoluta de la app:
 *   - El runtime web/API NO usa pg.Pool / SUPABASE_DB_URL directo
 *     (puerto 5432 firewalled en Hostinger hPanel).
 *   - Todas las APIs productivas consultan PostgREST vía HTTPS.
 *
 * Resolución del schema: fijo `elevate` vía `SUPABASE_APP_SCHEMA`
 * (lee `NEURA_CLIENT_SCHEMA` con default `elevate`).
 *
 * Auth:
 *   - ANON: para endpoints públicos (catálogo).
 *   - JWT del usuario: para endpoints privados que respetan RLS de la
 *     tabla (lectura por empresa propia).
 *   - SERVICE ROLE: para operaciones server-side admin (jobs, webhooks).
 *     NUNCA expuesto al cliente.
 */
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";
import { getSupabaseServerUrl } from "@/lib/supabase/server-url";

export type PostgrestRole = "anon" | "jwt" | "service_role";

export type PostgrestErr = {
  status: number;
  message: string;
  code?: string;
  detail?: string;
  hint?: string;
};

export type PostgrestOk<T> = { ok: true; rows: T[]; status: number };
export type PostgrestFail = { ok: false; error: PostgrestErr };
export type PostgrestRes<T> = PostgrestOk<T> | PostgrestFail;

/**
 * URL del PostgREST server-side. Usa SUPABASE_INTERNAL_URL si está definida
 * (co-host VPS, loopback Kong); sino, NEXT_PUBLIC_SUPABASE_URL.
 */
function publicUrl(): string {
  return getSupabaseServerUrl();
}

function anonKey(): string {
  const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!k) throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return k;
}

function serviceRoleKey(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return k || null;
}

/**
 * Extrae el Bearer del request (header Authorization). Útil para pasar el
 * JWT del usuario a PostgREST y respetar RLS por empresa.
 */
export function extractBearerFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const t = h.replace(/^bearer\s+/i, "").trim();
  return t || null;
}

/**
 * Resuelve el access_token del usuario para enviar a PostgREST.
 *
 * Estrategia:
 *   1. Authorization: Bearer <jwt>  (clientes server-to-server, fetch API)
 *   2. Cookies de Supabase Auth     (browser usuario logueado)
 *
 * Sin acceso al JWT, las consultas con RLS por `puede_acceder_empresa` no
 * van a devolver filas (anon no califica). Por eso es CRÍTICO obtener el
 * token del usuario incluso cuando el frontend usa cookies.
 */
export async function getAccessTokenForRequest(req?: Request | null): Promise<string | null> {
  // 1) Bearer header
  if (req) {
    const fromHeader = extractBearerFromRequest(req);
    if (fromHeader) return fromHeader;
  }
  // 2) Supabase cookies via @supabase/ssr
  try {
    const url = publicUrl();
    const anon = anonKey();
    // Lazy import — evita ciclos y no fuerza next/headers fuera de RSC.
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const supa = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll() {
          /* read-only path */
        },
      },
    });
    const { data } = await supa.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

type FetchOpts = {
  /** "GET"|"POST"|... — default GET */
  method?: string;
  /** body JSON serializable, solo para writes */
  body?: unknown;
  /** Prefer header (return=representation, count=exact, resolution=...) */
  prefer?: string;
  /** Authorization: anon (default), jwt (requires `jwt` param), service_role */
  role?: PostgrestRole;
  /** JWT explícito cuando role==="jwt" */
  jwt?: string | null;
  /** Override schema; default SUPABASE_APP_SCHEMA */
  schema?: string;
  /** No-cache para APIs privadas (default true para POST/PATCH/DELETE; false para GET) */
  noStore?: boolean;
};

function resolveKey(role: PostgrestRole, jwt?: string | null): string {
  if (role === "service_role") {
    const sr = serviceRoleKey();
    if (!sr) {
      throw new Error("PostgREST role=service_role requerido pero SUPABASE_SERVICE_ROLE_KEY no está configurada");
    }
    return sr;
  }
  if (role === "jwt") {
    if (!jwt) {
      // Fallback a anon si no hay JWT (PostgREST trata anon como autenticado-anónimo).
      return anonKey();
    }
    return jwt;
  }
  return anonKey();
}

function buildHeaders(opts: FetchOpts): Record<string, string> {
  const schema = (opts.schema ?? SUPABASE_APP_SCHEMA).trim();
  const role = opts.role ?? "anon";
  const key = resolveKey(role, opts.jwt);
  // apikey: SIEMPRE la anon o sr del proyecto (NO el JWT del usuario).
  // Authorization: el JWT (o sr) que define el `role` postgres efectivo.
  const apikey = role === "service_role" ? key : anonKey();
  const h: Record<string, string> = {
    apikey,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": schema,
    Accept: "application/json",
  };
  if (opts.method && opts.method !== "GET" && opts.method !== "HEAD") {
    h["Content-Type"] = "application/json";
    h["Content-Profile"] = schema;
  }
  if (opts.prefer) h.Prefer = opts.prefer;
  return h;
}

async function safeJson(r: Response): Promise<unknown> {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asError(status: number, body: unknown): PostgrestErr {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    return {
      status,
      message: String(b.message ?? b.error ?? "PostgREST error"),
      code: typeof b.code === "string" ? b.code : undefined,
      detail: typeof b.detail === "string" ? b.detail : undefined,
      hint: typeof b.hint === "string" ? b.hint : undefined,
    };
  }
  return { status, message: typeof body === "string" ? body.slice(0, 300) : "PostgREST error" };
}

/**
 * Construye URL `{SUPABASE_URL}/rest/v1/{resource}?{queryString}`. El
 * queryString debe traer columnas explícitas en `select=…` — NUNCA `*`.
 */
function buildUrl(resource: string, queryString: string): string {
  const base = publicUrl().replace(/\/$/, "");
  const path = resource.startsWith("/") ? resource : `/${resource}`;
  return `${base}/rest/v1${path}?${queryString}`;
}

export async function postgrestRequest<T>(
  resource: string,
  queryString: string,
  opts: FetchOpts = {}
): Promise<PostgrestRes<T>> {
  try {
    const method = opts.method ?? "GET";
    const url = buildUrl(resource, queryString);
    const init: RequestInit = {
      method,
      headers: buildHeaders(opts),
      cache: opts.noStore ?? method !== "GET" ? "no-store" : "no-store",
    };
    if (opts.body !== undefined) {
      init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }
    const r = await fetch(url, init);
    const body = await safeJson(r);
    if (!r.ok) {
      return { ok: false, error: asError(r.status, body) };
    }
    const rows = Array.isArray(body) ? (body as T[]) : body == null ? [] : [body as T];
    return { ok: true, rows, status: r.status };
  } catch (e) {
    return {
      ok: false,
      error: { status: 0, message: e instanceof Error ? e.message : String(e) },
    };
  }
}

/** Atajos tipados — la mayoría de los call-sites usan estos. */
export function postgrestGet<T>(
  resource: string,
  queryString: string,
  opts: Omit<FetchOpts, "method" | "body"> = {}
): Promise<PostgrestRes<T>> {
  return postgrestRequest<T>(resource, queryString, { ...opts, method: "GET" });
}

export function postgrestInsert<T>(
  resource: string,
  body: unknown,
  opts: Omit<FetchOpts, "method" | "body"> = {}
): Promise<PostgrestRes<T>> {
  return postgrestRequest<T>(resource, "", {
    ...opts,
    method: "POST",
    body,
    prefer: opts.prefer ?? "return=representation",
  });
}

export function postgrestUpdate<T>(
  resource: string,
  queryString: string,
  body: unknown,
  opts: Omit<FetchOpts, "method" | "body"> = {}
): Promise<PostgrestRes<T>> {
  return postgrestRequest<T>(resource, queryString, {
    ...opts,
    method: "PATCH",
    body,
    prefer: opts.prefer ?? "return=representation",
  });
}

export function postgrestDelete<T>(
  resource: string,
  queryString: string,
  opts: Omit<FetchOpts, "method" | "body"> = {}
): Promise<PostgrestRes<T>> {
  return postgrestRequest<T>(resource, queryString, {
    ...opts,
    method: "DELETE",
    prefer: opts.prefer ?? "return=representation",
  });
}

/** Llamada a RPC PostgreSQL expuesta por PostgREST (POST /rpc/<fn>). */
export function postgrestRpc<T>(
  fn: string,
  args: Record<string, unknown>,
  opts: Omit<FetchOpts, "method" | "body"> = {}
): Promise<PostgrestRes<T>> {
  return postgrestRequest<T>(`rpc/${fn}`, "", {
    ...opts,
    method: "POST",
    body: args,
  });
}
