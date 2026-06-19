-- =============================================================================
-- Elevate · Galería de imágenes por producto (hasta 5)
--
-- Tabla auxiliar para soportar varias imágenes por producto. La columna legacy
-- elevate.productos.imagen_url se preserva como fallback (single-image) y se
-- mantiene en sync con la fila marcada `es_principal=true` desde el endpoint
-- de admin (sin tocarla acá).
--
-- Reglas:
--   - Máximo 5 imágenes por producto (CHECK orden 0..4 + trigger conteo).
--   - Solo UNA fila con es_principal=true por producto (partial unique idx +
--     trigger que apaga las demás al setear una nueva como principal).
--   - Borrado de producto cascadea borrado de imágenes (ON DELETE CASCADE).
--
-- Backfill: por cada producto con `imagen_url IS NOT NULL` y sin fila en
-- producto_imagenes, inserta una fila como orden=0, es_principal=true. NO
-- modifica elevate.productos.
--
-- Idempotente: IF NOT EXISTS + DO $$ guards. Seguro de re-correr.
-- =============================================================================

BEGIN;

-- ── Tabla ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elevate.producto_imagenes (
  id              uuid         PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  empresa_id      uuid         NOT NULL REFERENCES elevate.empresas(id),
  producto_id     uuid         NOT NULL REFERENCES elevate.productos(id) ON DELETE CASCADE,
  imagen_path     text         NOT NULL,
  imagen_url      text         NOT NULL,
  orden           int          NOT NULL DEFAULT 0,
  es_principal    boolean      NOT NULL DEFAULT false,
  alt_text        text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT producto_imagenes_orden_range CHECK (orden >= 0 AND orden <= 4)
);

COMMENT ON TABLE elevate.producto_imagenes IS
  'Hasta 5 imágenes por producto. La fila es_principal=true determina la imagen del catálogo/card.';

-- Solo una imagen principal por producto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_imagenes_principal
  ON elevate.producto_imagenes (producto_id)
  WHERE es_principal = true;

CREATE INDEX IF NOT EXISTS idx_producto_imagenes_producto_orden
  ON elevate.producto_imagenes (producto_id, orden ASC);

CREATE INDEX IF NOT EXISTS idx_producto_imagenes_empresa
  ON elevate.producto_imagenes (empresa_id);

-- ── Trigger: máx 5 imágenes por producto (defensa contra inserts en burst) ──
CREATE OR REPLACE FUNCTION elevate._pi_limite_5()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM elevate.producto_imagenes WHERE producto_id = NEW.producto_id) >= 5 THEN
    RAISE EXCEPTION 'Un producto no puede tener más de 5 imágenes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pi_limite_5 ON elevate.producto_imagenes;
CREATE TRIGGER trg_pi_limite_5
  BEFORE INSERT ON elevate.producto_imagenes
  FOR EACH ROW
  EXECUTE FUNCTION elevate._pi_limite_5();

-- ── Trigger: solo una principal por producto ────────────────────────────────
CREATE OR REPLACE FUNCTION elevate._pi_unica_principal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.es_principal = true THEN
    UPDATE elevate.producto_imagenes
       SET es_principal = false
     WHERE producto_id = NEW.producto_id
       AND id <> NEW.id
       AND es_principal = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pi_unica_principal ON elevate.producto_imagenes;
CREATE TRIGGER trg_pi_unica_principal
  AFTER INSERT OR UPDATE OF es_principal ON elevate.producto_imagenes
  FOR EACH ROW
  WHEN (NEW.es_principal = true)
  EXECUTE FUNCTION elevate._pi_unica_principal();

-- ── Trigger: mantener updated_at ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION elevate._pi_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pi_updated_at ON elevate.producto_imagenes;
CREATE TRIGGER trg_pi_updated_at
  BEFORE UPDATE ON elevate.producto_imagenes
  FOR EACH ROW
  EXECUTE FUNCTION elevate._pi_set_updated_at();

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA elevate TO anon, authenticated;

-- anon: columnas seguras para catálogo público. NO se expone empresa_id ni
-- timestamps administrativos.
GRANT SELECT
  (id, producto_id, imagen_path, imagen_url, orden, es_principal, alt_text)
  ON elevate.producto_imagenes
  TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON elevate.producto_imagenes TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE elevate.producto_imagenes ENABLE ROW LEVEL SECURITY;

-- anon: solo imágenes de productos visibles + activos. El embed desde el
-- endpoint /api/public/elevate/productos/[slug] necesita esta visibilidad.
DROP POLICY IF EXISTS producto_imagenes_select_anon ON elevate.producto_imagenes;
CREATE POLICY producto_imagenes_select_anon
  ON elevate.producto_imagenes
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM elevate.productos p
       WHERE p.id = producto_id
         AND p.activo = true
         AND p.visible_web = true
    )
  );

DROP POLICY IF EXISTS producto_imagenes_select_authenticated ON elevate.producto_imagenes;
CREATE POLICY producto_imagenes_select_authenticated
  ON elevate.producto_imagenes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS producto_imagenes_insert_authenticated ON elevate.producto_imagenes;
CREATE POLICY producto_imagenes_insert_authenticated
  ON elevate.producto_imagenes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS producto_imagenes_update_authenticated ON elevate.producto_imagenes;
CREATE POLICY producto_imagenes_update_authenticated
  ON elevate.producto_imagenes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS producto_imagenes_delete_authenticated ON elevate.producto_imagenes;
CREATE POLICY producto_imagenes_delete_authenticated
  ON elevate.producto_imagenes
  FOR DELETE
  TO authenticated
  USING (true);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Por cada producto con imagen_url y sin galería: inserta como principal.
-- NO toca productos.imagen_url/imagen_path. Usa imagen_path = imagen_url como
-- fallback cuando el path está vacío (productos antiguos con URL externa).
INSERT INTO elevate.producto_imagenes
  (empresa_id, producto_id, imagen_path, imagen_url, orden, es_principal)
SELECT
  p.empresa_id,
  p.id,
  COALESCE(p.imagen_path, p.imagen_url) AS imagen_path,
  p.imagen_url,
  0,
  true
FROM elevate.productos p
WHERE p.imagen_url IS NOT NULL
  AND length(btrim(p.imagen_url)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM elevate.producto_imagenes pi WHERE pi.producto_id = p.id
  );

COMMIT;
