/**
 * PATCH  /api/resenas-videos/[id]  — actualiza titulo, descripcion, orden, visible_web
 * DELETE /api/resenas-videos/[id]  — borra fila DB + objeto storage
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import {
  getAccessTokenForRequest,
  postgrestGet,
  postgrestRequest,
} from "@/lib/supabase/postgrest-runtime";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  RESENAS_VIDEOS_BUCKET,
  isManagedResenaPath,
  MAX_VIDEOS_VISIBLES,
} from "@/lib/resenas/storage";

const SELECT_COLS =
  "id,titulo,descripcion,video_path,video_url,poster_path,poster_url,orden,visible_web,activo,created_at,updated_at";

type ResenaRow = {
  id: string;
  titulo: string | null;
  descripcion: string | null;
  video_path: string;
  video_url: string;
  poster_path: string | null;
  poster_url: string | null;
  orden: number;
  visible_web: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

function storageClientWithJwt(jwt: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
  });
}

async function fetchVideo(
  jwt: string | null,
  empresaId: string,
  videoId: string
): Promise<ResenaRow | null> {
  const qs = new URLSearchParams({
    select: SELECT_COLS,
    id: `eq.${videoId}`,
    empresa_id: `eq.${empresaId}`,
    limit: "1",
  });
  const r = await postgrestGet<ResenaRow>("resenas_videos", qs.toString(), {
    role: "jwt",
    jwt,
    noStore: true,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.rows[0] ?? null;
}

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx)
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const existing = await fetchVideo(jwt, empresaId, videoId);
    if (!existing)
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.titulo !== undefined) {
      patch.titulo = typeof body.titulo === "string" ? body.titulo.trim() || null : null;
    }
    if (body.descripcion !== undefined) {
      patch.descripcion =
        typeof body.descripcion === "string" ? body.descripcion.trim() || null : null;
    }
    if (body.orden !== undefined) {
      const n = Number(body.orden);
      if (!Number.isFinite(n) || n < 0 || n > MAX_VIDEOS_VISIBLES - 1) {
        return NextResponse.json(
          errorResponse(`orden debe ser entre 0 y ${MAX_VIDEOS_VISIBLES - 1}.`),
          { status: 400 }
        );
      }
      patch.orden = Math.trunc(n);
    }
    if (body.visible_web !== undefined) {
      patch.visible_web = body.visible_web === true;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("Nada para actualizar."), { status: 400 });
    }

    const qs = new URLSearchParams({
      id: `eq.${videoId}`,
      empresa_id: `eq.${empresaId}`,
      select: SELECT_COLS,
    });
    const r = await postgrestRequest<ResenaRow>("resenas_videos", qs.toString(), {
      method: "PATCH",
      role: "jwt",
      jwt,
      body: patch,
      prefer: "return=representation",
    });
    if (!r.ok) {
      console.error("[/api/resenas-videos/[id] PATCH]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo actualizar. (${(r.error.message ?? "").slice(0, 160)})`),
        { status: 502 }
      );
    }
    return NextResponse.json(successResponse({ video: r.rows[0] }));
  } catch (err) {
    console.error("[/api/resenas-videos/[id] PATCH] outer", err);
    return NextResponse.json(errorResponse("No se pudo actualizar el video."), {
      status: 500,
    });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx)
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    const existing = await fetchVideo(jwt, empresaId, videoId);
    if (!existing)
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    // 1) Borrar fila DB
    const qs = new URLSearchParams({
      id: `eq.${videoId}`,
      empresa_id: `eq.${empresaId}`,
    });
    const r = await postgrestRequest<ResenaRow>("resenas_videos", qs.toString(), {
      method: "DELETE",
      role: "jwt",
      jwt,
    });
    if (!r.ok) {
      console.error("[/api/resenas-videos/[id] DELETE]", r.error);
      return NextResponse.json(
        errorResponse(`No se pudo eliminar. (${(r.error.message ?? "").slice(0, 160)})`),
        { status: 502 }
      );
    }

    // 2) Borrar objeto storage si pertenece a esta empresa.
    if (existing.video_path && isManagedResenaPath(existing.video_path, empresaId)) {
      try {
        const storage = storageClientWithJwt(jwt);
        await storage.storage.from(RESENAS_VIDEOS_BUCKET).remove([existing.video_path]);
      } catch (e) {
        console.warn("[/api/resenas-videos/[id] DELETE] storage cleanup fallo", e);
      }
    }

    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/resenas-videos/[id] DELETE] outer", err);
    return NextResponse.json(errorResponse("No se pudo eliminar el video."), {
      status: 500,
    });
  }
}
