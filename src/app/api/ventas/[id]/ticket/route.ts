/**
 * GET /api/ventas/[id]/ticket?w=58|80&auto=1
 *
 * Ticket NO FISCAL imprimible para joyería. Una sola copia tipo cliente
 * con: nombre del negocio, fecha, número de venta, ítems (nombre/cantidad/
 * precio/subtotal), totales y leyenda no fiscal.
 *
 * `auto=1` ejecuta window.print() al cargar (auto-impresión).
 * `w` controla el ancho térmico: 58 mm o 80 mm (default 80).
 *
 * Sin SIFEN, sin XML, sin timbrado.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getAccessTokenForRequest, postgrestGet } from "@/lib/supabase/postgrest-runtime";

const NEGOCIO_FALLBACK = "Joyería Artesanos";

type VentaRow = {
  id: string;
  numero_control: string;
  fecha: string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  tipo_venta: string;
  metodo_pago: string | null;
};

type ItemRow = {
  venta_id: string;
  producto_nombre: string;
  sku: string | null;
  cantidad: number | string;
  precio_venta: number | string;
  total_linea: number | string;
};

type EmpresaRow = {
  nombre_empresa: string | null;
  ruc: string | null;
  telefono: string | null;
  direccion: string | null;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtGs(v: number): string {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-PY", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Asuncion",
    });
  } catch { return iso; }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function metodoLabel(m: string | null): string {
  switch (m) {
    case "tarjeta": return "Tarjeta";
    case "transferencia": return "Transferencia";
    case "efectivo": return "Efectivo";
    default: return "—";
  }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getTenantSupabaseFromAuth(request);
  if (!auth) return new NextResponse("No autenticado", { status: 401 });
  const empresaId = auth.auth.empresa_id;
  const jwt = await getAccessTokenForRequest(request);

  const url = new URL(request.url);
  const wParam = url.searchParams.get("w") ?? "80";
  const widthMm = wParam === "58" ? 58 : 80;
  const auto = url.searchParams.get("auto") === "1";

  // 1) Venta
  const vRes = await postgrestGet<VentaRow>("ventas", new URLSearchParams({
    select: "id,numero_control,fecha,subtotal,monto_iva,total,tipo_venta,metodo_pago",
    id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
    limit: "1",
  }).toString(), { role: "jwt", jwt, noStore: true });
  if (!vRes.ok || vRes.rows.length === 0) {
    return new NextResponse("Venta no encontrada", { status: 404 });
  }
  const v = vRes.rows[0];

  // 2) Items
  const iRes = await postgrestGet<ItemRow>("ventas_items", new URLSearchParams({
    select: "venta_id,producto_nombre,sku,cantidad,precio_venta,total_linea",
    venta_id: `eq.${id}`,
    empresa_id: `eq.${empresaId}`,
  }).toString(), { role: "jwt", jwt, noStore: true });
  const items = iRes.ok ? iRes.rows : [];

  // 3) Empresa (datos del membrete) — best-effort.
  let negocio = process.env.NEURA_CLIENT_NAME?.trim() || NEGOCIO_FALLBACK;
  let ruc: string | null = null;
  let telefono: string | null = null;
  let direccion: string | null = null;
  try {
    const eRes = await postgrestGet<EmpresaRow>("empresas", new URLSearchParams({
      select: "nombre_empresa,ruc,telefono,direccion",
      id: `eq.${empresaId}`,
      limit: "1",
    }).toString(), { role: "jwt", jwt, noStore: true });
    if (eRes.ok && eRes.rows[0]) {
      const r = eRes.rows[0];
      if (r.nombre_empresa?.trim()) negocio = r.nombre_empresa.trim();
      ruc = r.ruc;
      telefono = r.telefono;
      direccion = r.direccion;
    }
  } catch { /* opcional */ }

  // 4) HTML
  const itemsHtml = items.map((it) => {
    const cant = num(it.cantidad);
    const total = num(it.total_linea);
    return `
      <tr>
        <td class="it-nom">${escapeHtml(it.producto_nombre ?? "")}</td>
        <td class="it-cant">${cant.toLocaleString("es-PY", { maximumFractionDigits: 3 })}</td>
        <td class="it-tot">${fmtGs(total)}</td>
      </tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ticket ${escapeHtml(v.numero_control)}</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #000; background: #fff;
                 font-family: "Courier New", ui-monospace, monospace;
                 font-size: ${widthMm === 58 ? "11px" : "12px"};
                 line-height: 1.35;
                 width: ${widthMm - 4}mm; }
    .center { text-align: center; }
    .right { text-align: right; }
    .b { font-weight: 700; }
    .sep { border-top: 1px dashed #000; margin: 4px 0; }
    h1.brand { font-size: ${widthMm === 58 ? "13px" : "15px"}; margin: 2px 0; font-weight: 800; letter-spacing: 0.5px; }
    .meta p { margin: 1px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    .it-nom { width: auto; }
    .it-cant { width: 26%; text-align: right; }
    .it-tot { width: 32%; text-align: right; }
    .tot-row td { padding: 2px 0; }
    .tot-row .lbl { text-align: right; }
    .tot-row .val { text-align: right; }
    .grand td { font-size: ${widthMm === 58 ? "13px" : "15px"}; font-weight: 800; padding: 4px 0 6px; }
    .leyenda { margin-top: 6px; font-size: ${widthMm === 58 ? "9.5px" : "10.5px"}; text-align: center; }
    @media print { body { color: #000 !important; } }
  </style>
</head>
<body>
  <div class="center">
    <h1 class="brand">${escapeHtml(negocio)}</h1>
    ${ruc ? `<p class="meta">RUC: ${escapeHtml(ruc)}</p>` : ""}
    ${direccion ? `<p class="meta">${escapeHtml(direccion)}</p>` : ""}
    ${telefono ? `<p class="meta">Tel: ${escapeHtml(telefono)}</p>` : ""}
  </div>
  <div class="sep"></div>
  <div class="meta">
    <p><span class="b">N°:</span> ${escapeHtml(v.numero_control)}</p>
    <p><span class="b">Fecha:</span> ${escapeHtml(fmtFecha(v.fecha))}</p>
    <p><span class="b">Pago:</span> ${escapeHtml(metodoLabel(v.metodo_pago))}${v.tipo_venta === "CREDITO" ? " (Crédito)" : ""}</p>
  </div>
  <div class="sep"></div>
  <table>
    <thead>
      <tr class="b"><td>Producto</td><td class="it-cant">Cant.</td><td class="it-tot">Total</td></tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="sep"></div>
  <table>
    <tr class="tot-row"><td class="lbl">Subtotal:</td><td class="val">${fmtGs(num(v.subtotal))}</td></tr>
    <tr class="tot-row"><td class="lbl">IVA:</td><td class="val">${fmtGs(num(v.monto_iva))}</td></tr>
    <tr class="grand"><td class="lbl">TOTAL:</td><td class="val">${fmtGs(num(v.total))}</td></tr>
  </table>
  <div class="sep"></div>
  <p class="leyenda">¡Gracias por su compra!</p>
  <p class="leyenda">Documento NO FISCAL.</p>
  ${auto ? `<script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>` : ""}
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
