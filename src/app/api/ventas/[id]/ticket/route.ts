/**
 * GET /api/ventas/[id]/ticket?w=58|80
 *
 * Ticket NO FISCAL imprimible para joyería. Una sola copia tipo cliente
 * con membrete del negocio, fecha, número de venta, ítems, totales y
 * leyenda no fiscal.
 *
 * El ticket se centra en pantalla sobre fondo gris (vista previa) y al
 * imprimir ocupa el ancho exacto de la impresora térmica. Auto-dispara
 * `window.print()` al cargar; también hay un botón "Imprimir" visible.
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  const fontPx = widthMm === 58 ? 11 : 12;
  // URL absoluta para el logo: dentro del iframe oculto del ERP también
  // resuelve bien con path relativo, pero la dejamos absoluta para que la
  // pestaña standalone (si se abre directo) también la cargue.
  const origin = `${url.protocol}//${url.host}`;
  const logoUrl = `${origin}/web/uploads/logo.PNG`;

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

  // 3) Empresa (membrete) — best-effort.
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

  // 4) Render items
  const itemsHtml = items.map((it) => {
    const cant = num(it.cantidad);
    const punit = num(it.precio_venta);
    const sub = num(it.total_linea);
    return `
      <tr>
        <td class="qty"><strong>${cant}×</strong></td>
        <td class="name">${escapeHtml(it.producto_nombre ?? "")}</td>
        <td class="amt">${fmtGs(sub)}</td>
      </tr>
      <tr class="sub"><td></td><td colspan="2">${cant} × ${fmtGs(punit)}</td></tr>`;
  }).join("");

  const subtotal = num(v.subtotal);
  const ivaTotal = num(v.monto_iva);
  const total = num(v.total);
  const altWidth = widthMm === 80 ? 58 : 80;

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ticket ${escapeHtml(v.numero_control)} — ${escapeHtml(negocio)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, "Courier New", monospace;
      font-size: ${fontPx}px;
      color: #000;
      background: #f1f1f1;
      margin: 0;
      padding: 20px;
    }
    .paper {
      background: #fff;
      width: ${widthMm}mm;
      margin: 0 auto;
      padding: 6mm 4mm;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
    }
    .logo-wrap {
      text-align: center;
      margin: 0 0 2mm;
    }
    .logo-wrap img {
      max-width: ${widthMm === 58 ? 36 : 48}mm;
      max-height: ${widthMm === 58 ? 14 : 18}mm;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    h1 {
      font-size: ${fontPx + 4}px;
      text-align: center;
      margin: 0 0 2mm;
      letter-spacing: 1px;
    }
    .header-meta {
      font-size: ${fontPx - 1}px;
      text-align: center;
      line-height: 1.35;
    }
    .header-meta p { margin: 0.4mm 0; }
    .meta {
      font-size: ${fontPx - 1}px;
      text-align: center;
      margin: 1mm 0 2mm;
    }
    hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 0.5mm 0; }
    td.qty { width: 9mm; }
    td.amt { width: 22mm; text-align: right; white-space: nowrap; }
    tr.sub td { color: #555; font-size: ${fontPx - 2}px; padding-bottom: 1mm; }
    .totales td { padding: 0.7mm 0; }
    .totales .lbl { text-align: left; }
    .totales .val { text-align: right; white-space: nowrap; }
    .total-row { font-weight: bold; font-size: ${fontPx + 2}px; border-top: 1px solid #000; }
    .footer {
      font-size: ${fontPx - 2}px;
      text-align: center;
      margin-top: 3mm;
      font-style: italic;
    }
    .actions {
      max-width: ${widthMm}mm;
      margin: 8mm auto 0;
      text-align: center;
    }
    .actions button {
      padding: 8px 16px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid #4FAEB2;
      background: #4FAEB2;
      color: #fff;
      border-radius: 6px;
      font-weight: 600;
    }
    .actions button:hover { background: #3F8E91; }
    .actions a {
      margin-left: 12px;
      font-size: 13px;
      color: #555;
      text-decoration: underline;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .paper { width: ${widthMm}mm; box-shadow: none; padding: 2mm; margin: 0; }
      .actions { display: none; }
      @page { margin: 0; size: ${widthMm}mm auto; }
    }
  </style>
</head>
<body>
  <section class="paper">
    <div class="logo-wrap">
      <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(negocio)}" onerror="this.style.display='none'" />
    </div>
    <h1>${escapeHtml(negocio)}</h1>
    <div class="header-meta">
      ${ruc ? `<p>RUC: ${escapeHtml(ruc)}</p>` : ""}
      ${direccion ? `<p>${escapeHtml(direccion)}</p>` : ""}
      ${telefono ? `<p>Tel: ${escapeHtml(telefono)}</p>` : ""}
    </div>
    <div class="meta">
      <strong>${escapeHtml(v.numero_control)}</strong><br>
      ${escapeHtml(fmtFecha(v.fecha))}
    </div>
    <hr>
    <table>
      <tbody>${itemsHtml}</tbody>
    </table>
    <hr>
    <table class="totales">
      <tbody>
        <tr><td class="lbl">Subtotal</td><td class="val">${fmtGs(subtotal)}</td></tr>
        ${ivaTotal > 0 ? `<tr><td class="lbl">IVA</td><td class="val">${fmtGs(ivaTotal)}</td></tr>` : ""}
        <tr class="total-row"><td class="lbl">TOTAL</td><td class="val">${fmtGs(total)}</td></tr>
        <tr><td class="lbl">Pago</td><td class="val">${escapeHtml(metodoLabel(v.metodo_pago))}${v.tipo_venta === "CREDITO" ? " (Crédito)" : ""}</td></tr>
      </tbody>
    </table>
    <hr>
    <div class="footer">
      ¡Gracias por su compra!<br>
      Documento NO FISCAL.
    </div>
  </section>
  <div class="actions">
    <button type="button" onclick="window.print()">Imprimir</button>
    <a href="?w=${altWidth}">Cambiar a ${altWidth}mm</a>
  </div>
  <script>
    // Auto-print: SIEMPRE al cargar la página (esta URL es solo para imprimir).
    window.addEventListener("load", function () {
      setTimeout(function () {
        try { window.print(); } catch (e) {}
      }, 300);
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
