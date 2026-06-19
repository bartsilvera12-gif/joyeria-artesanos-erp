/**
 * GET /api/public/elevate/resenas-videos
 *
 * Videos de reseñas visibles para la home pública Elevate. Anon vía PostgREST
 * con `Accept-Profile: elevate`. La policy anon ya filtra activo+visible_web.
 *
 * Exposición: id, titulo, descripcion, video_url, poster_url, orden. NO
 * empresa_id, NO paths internos del bucket, NO timestamps. Máx 4 videos.
 */
import { NextRequest, NextResponse } from "next/server";
import { elevatePublicCorsHeaders, PUBLIC_CATALOG_CACHE } from "@/lib/public-api/cors";
import { postgrestGet } from "@/lib/elevate-public/catalog-postgrest";

const PUBLIC_SELECT = "id,titulo,descripcion,video_url,poster_url,orden";

type ResenaRaw = {
  id: string;
  titulo: string | null;
  descripcion: string | null;
  video_url: string;
  poster_url: string | null;
  orden: number | null;
};

export type ResenaVideoPublica = {
  id: string;
  titulo: string | null;
  descripcion: string | null;
  video_url: string;
  poster_url: string | null;
  orden: number;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: elevatePublicCorsHeaders() });
}

export async function GET(_request: NextRequest) {
  try {
    const qs = new URLSearchParams({
      select: PUBLIC_SELECT,
      order: "orden.asc,id.asc",
      limit: "4",
    });
    const result = await postgrestGet<ResenaRaw>("resenas_videos", qs.toString());
    if (!result.ok) {
      console.error("[/api/public/elevate/resenas-videos GET]", result.error);
      return NextResponse.json(
        { videos: [] },
        {
          status: 200,
          headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE },
        }
      );
    }
    const videos: ResenaVideoPublica[] = result.rows
      .filter((r) => typeof r.video_url === "string" && r.video_url.length > 0)
      .slice(0, 4)
      .map((r) => ({
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion,
        video_url: r.video_url,
        poster_url: r.poster_url,
        orden: typeof r.orden === "number" ? r.orden : 0,
      }));
    return NextResponse.json(
      { videos },
      {
        status: 200,
        headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE },
      }
    );
  } catch (err) {
    console.error(
      "[/api/public/elevate/resenas-videos GET] outer",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { videos: [] },
      {
        status: 200,
        headers: { ...elevatePublicCorsHeaders(), ...PUBLIC_CATALOG_CACHE },
      }
    );
  }
}
