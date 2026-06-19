/**
 * POST /api/resenas-videos/chunk
 *
 * Receptor de chunks (6 MB c/u) del upload de videos de reseñas. La razón:
 * Cloudflare (free tier) corta requests >100 MB, por lo que tanto el
 * single-POST como TUS browser→Storage fallan en archivos grandes; TUS
 * browser→Storage adicionalmente está bloqueado por CORS en Kong (los
 * headers Upload-Length/Upload-Metadata/Tus-Resumable no están en la
 * allowlist de Access-Control-Allow-Headers).
 *
 * Estrategia:
 *   1. Browser parte el archivo en chunks <= 6 MB.
 *   2. Cada chunk va por multipart al ERP en la misma origin
 *      (sin CORS, body chico — pasa Cloudflare y Next.js sin problema).
 *   3. Server acumula chunks en /tmp/{uploadId}/.
 *   4. En el último chunk (`final=true`), server hace TUS server→Supabase
 *      Storage. Server-to-server no tiene CORS, así que TUS funciona, y
 *      cada chunk TUS también es 6 MB → no choca con Cloudflare.
 *   5. Server limpia /tmp y devuelve { video_path }.
 *
 * Body (multipart/form-data):
 *   uploadId    string  (uuid o id estable, [0-9a-zA-Z-_]{8,128})
 *   chunkIndex  number  0-based
 *   chunkTotal  number  cantidad total de chunks
 *   ext         string  mp4 | webm | mov
 *   mime        string  video/mp4 | video/webm | video/quicktime
 *   final       "true" | "false"
 *   file        Blob    bytes del chunk
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_VIDEO_MIME,
  MAX_VIDEO_BYTES,
  MAX_VIDEOS_VISIBLES,
  RESENAS_VIDEOS_BUCKET,
  buildResenaVideoPath,
} from "@/lib/resenas/storage";
import { getAccessTokenForRequest, postgrestGet } from "@/lib/supabase/postgrest-runtime";
import { getSupabaseServerUrl } from "@/lib/supabase/server-url";

// Runtime y duración: este endpoint maneja uploads que pueden tardar.
export const runtime = "nodejs";
export const maxDuration = 300; // segundos
export const dynamic = "force-dynamic";

const TMP_BASE = path.join(os.tmpdir(), "resenas-uploads");
const MAX_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB tope defensivo por chunk
const MAX_CHUNKS = 200; // tope teórico de chunks; el cap real lo impone MAX_VIDEO_BYTES (95 MB)
const SAFE_UPLOAD_ID = /^[0-9a-zA-Z_-]{8,128}$/;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-side POST directo a Supabase Storage usando service_role.
 *
 * Server-to-server: no hay preflight CORS, no hay browser body limit.
 * Usa la URL interna si está configurada (`SUPABASE_INTERNAL_URL`,
 * típicamente loopback al Kong del mismo VPS — sin Cloudflare en el path).
 * Si no, cae a la URL pública (la que sí pasa por Cloudflare).
 *
 * Para archivos < 100 MB esto siempre funciona porque está debajo del
 * único corte que tenemos (Cloudflare free). Para archivos más grandes,
 * y si SUPABASE_INTERNAL_URL no está seteada, conviene activar el flag
 * en Cloudflare DNS (gris en lugar de naranja) para api.neura.com.py.
 */
async function uploadToStorageDirect(opts: {
  fullPath: string;
  filePath: string;
  contentType: string;
  size: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const baseUrl = getSupabaseServerUrl().replace(/\/$/, "");
  if (!sr) return { ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY" };

  const endpoint = `${baseUrl}/storage/v1/object/${encodeURIComponent(
    RESENAS_VIDEOS_BUCKET
  )}/${opts.fullPath.split("/").map(encodeURIComponent).join("/")}`;

  // El cap operativo es 95 MB; cargar a Buffer y postear es simple y la
  // tiene RAM suficiente y evita complicaciones de streaming en node-fetch.
  const buf = await fs.readFile(opts.filePath);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 270_000); // 4.5 min hard cap
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      body: buf,
      headers: {
        Authorization: `Bearer ${sr}`,
        apikey: sr,
        "Content-Type": opts.contentType,
        "Content-Length": String(opts.size),
        "x-upsert": "false",
        "Cache-Control": "3600",
      },
      signal: ac.signal,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${r.status} ${txt.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

export async function POST(request: NextRequest) {
  let dir: string | null = null;
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx)
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const jwt = await getAccessTokenForRequest(request);

    // Gate: count < 4 visibles+activos (defensa redundante con DB trigger)
    const qsCount = new URLSearchParams({
      select: "id",
      empresa_id: `eq.${empresaId}`,
      activo: "eq.true",
      visible_web: "eq.true",
    });
    const rCount = await postgrestGet<{ id: string }>(
      "resenas_videos",
      qsCount.toString(),
      { role: "jwt", jwt, noStore: true }
    );
    if (!rCount.ok) {
      return NextResponse.json(errorResponse("No se pudo verificar el contador."), {
        status: 502,
      });
    }
    if (rCount.rows.length >= MAX_VIDEOS_VISIBLES) {
      return NextResponse.json(
        errorResponse(
          `Ya alcanzaste el máximo de ${MAX_VIDEOS_VISIBLES} videos. Eliminá uno para cargar otro.`
        ),
        { status: 409 }
      );
    }

    const form = await request.formData();
    const uploadId = String(form.get("uploadId") ?? "");
    const chunkIndex = Number(form.get("chunkIndex"));
    const chunkTotal = Number(form.get("chunkTotal"));
    const ext = String(form.get("ext") ?? "").toLowerCase();
    const mime = String(form.get("mime") ?? "").toLowerCase();
    const finalFlag = String(form.get("final") ?? "false") === "true";
    const file = form.get("file");

    if (!SAFE_UPLOAD_ID.test(uploadId)) {
      return NextResponse.json(errorResponse("uploadId inválido."), { status: 400 });
    }
    if (
      !Number.isInteger(chunkIndex) ||
      !Number.isInteger(chunkTotal) ||
      chunkIndex < 0 ||
      chunkTotal <= 0 ||
      chunkTotal > MAX_CHUNKS ||
      chunkIndex >= chunkTotal
    ) {
      return NextResponse.json(errorResponse("Índice de chunk inválido."), {
        status: 400,
      });
    }
    if (!/^[a-z0-9]{2,5}$/.test(ext) || !ALLOWED_VIDEO_MIME.has(mime)) {
      return NextResponse.json(
        errorResponse("Formato no permitido. Usá MP4 (recomendado), WebM o MOV."),
        { status: 400 }
      );
    }
    if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_CHUNK_BYTES) {
      return NextResponse.json(errorResponse("Chunk inválido o demasiado grande."), {
        status: 400,
      });
    }

    // Path tmp aislado por empresa+uploadId
    dir = path.join(TMP_BASE, empresaId, uploadId);
    await fs.mkdir(dir, { recursive: true });
    const partPath = path.join(dir, String(chunkIndex).padStart(6, "0") + ".part");
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(partPath, buf);

    if (!finalFlag) {
      return NextResponse.json(
        successResponse({ received: chunkIndex + 1, total: chunkTotal })
      );
    }

    // Final: asegurar que tenemos todos los chunks 0..chunkTotal-1
    const parts = (await fs.readdir(dir)).filter((n) => n.endsWith(".part")).sort();
    if (parts.length !== chunkTotal) {
      return NextResponse.json(
        errorResponse(
          `Faltan chunks (recibidos ${parts.length}/${chunkTotal}). Reintentá la carga.`
        ),
        { status: 400 }
      );
    }

    // Concatenar a un solo archivo final
    const finalPath = path.join(dir, "video." + ext);
    const out = await fs.open(finalPath, "w");
    let totalSize = 0;
    try {
      for (const part of parts) {
        const data = await fs.readFile(path.join(dir, part));
        totalSize += data.length;
        if (totalSize > MAX_VIDEO_BYTES) {
          return NextResponse.json(
            errorResponse(
              "El video supera el tamaño permitido. Subí un MP4 optimizado para web de hasta 95 MB."
            ),
            { status: 413 }
          );
        }
        await out.write(data);
      }
    } finally {
      await out.close();
    }

    // Generar path y subir server→Storage por TUS (server-to-server, sin CORS).
    const videoId =
      (globalThis.crypto?.randomUUID?.() ?? "") ||
      `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const bucketPath = buildResenaVideoPath(empresaId, videoId, mime);

    const res = await uploadToStorageDirect({
      fullPath: bucketPath,
      filePath: finalPath,
      contentType: mime,
      size: totalSize,
    });
    if (!res.ok) {
      console.error("[/api/resenas-videos/chunk] storage upload", res.error);
      // Si el upload cayó por límite de tamaño en upstream (nginx, storage-api
      // o Cloudflare), devolver 413 con copy humano fijo para que la UI lo
      // muestre tal cual.
      const isSizeLimit =
        /413|Request Entity Too Large|Maximum size exceeded|Payload Too Large|nginx|cloudflare/i.test(
          res.error
        );
      if (isSizeLimit) {
        return NextResponse.json(
          errorResponse(
            "El video supera el tamaño permitido. Subí un MP4 optimizado para web de hasta 95 MB."
          ),
          { status: 413 }
        );
      }
      return NextResponse.json(
        errorResponse(`No se pudo subir el video al storage. (${res.error.slice(0, 200)})`),
        { status: 502 }
      );
    }

    return NextResponse.json(
      successResponse({ video_path: bucketPath, mime, size: totalSize })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    console.error("[/api/resenas-videos/chunk POST] outer", err);
    return NextResponse.json(
      errorResponse(`No se pudo procesar el chunk. (${msg.slice(0, 200)})`),
      { status: 500 }
    );
  } finally {
    // Cleanup tmp dir (best-effort) si llegamos al final del request.
    // En caso de chunks intermedios, dir queda con sus parts esperando el próximo.
    // El cleanup real ocurre cuando completamos o cuando un retry posterior
    // sobrescribe los mismos parts.
    if (dir) {
      try {
        // Solo borrar si ya está finalizado (existe video.{ext})
        const entries = await fs.readdir(dir).catch(() => [] as string[]);
        if (entries.some((n) => /^video\.[a-z0-9]+$/.test(n))) {
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch {
        // best-effort
      }
    }
  }
}
