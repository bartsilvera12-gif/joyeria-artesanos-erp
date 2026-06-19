/**
 * Fetcher server-side de los videos de reseñas visibles para la home Elevate.
 *
 * Lee directamente vía PostgREST anon (mismo patrón que catalog-fetch). La
 * policy anon en elevate.resenas_videos garantiza activo+visible_web. Si
 * la query falla, devuelve []: la sección entonces hace fallback a los
 * testimonios de texto.
 */
import { postgrestGet } from "@/lib/elevate-public/catalog-postgrest";
import type { ResenaVideo } from "@/components/elevate-public/Reviews";

type Row = {
  id: string;
  titulo: string | null;
  descripcion: string | null;
  video_url: string;
  poster_url: string | null;
  orden: number | null;
};

export async function fetchResenasVideos(): Promise<ResenaVideo[]> {
  const qs = new URLSearchParams({
    select: "id,titulo,descripcion,video_url,poster_url,orden",
    order: "orden.asc,id.asc",
    limit: "4",
  });
  const r = await postgrestGet<Row>("resenas_videos", qs.toString());
  if (!r.ok) return [];
  return r.rows
    .filter((row) => typeof row.video_url === "string" && row.video_url.length > 0)
    .slice(0, 4)
    .map((row) => ({
      id: row.id,
      titulo: row.titulo,
      descripcion: row.descripcion,
      video_url: row.video_url,
      poster_url: row.poster_url,
      orden: typeof row.orden === "number" ? row.orden : 0,
    }));
}
