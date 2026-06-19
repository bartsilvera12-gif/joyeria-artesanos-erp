# Elevate — Bootstrap monocliente

Guía operativa para levantar esta repo como instancia **monocliente Elevate**
sobre Supabase self-hosted.

## Resumen arquitectónico

- Schema único: **`elevate`** (creado nuevo, **clonando estructura desde
  `zentra_erp`** sin modificar el original).
- Variable de entorno: `NEURA_CLIENT_SCHEMA=elevate` (default si no se setea).
- Empresa única con UUID fijo `00000000-0000-0000-0000-00000000e1e7`.
- Creación de nuevas empresas: **bloqueada** a nivel DB y endpoint.
- Schemas tenant `erp_*`: **no se usan**. Las RPCs de provisioning son stubs
  que fallan explícitamente.
- `empresa_modulos` se conserva como feature flag dentro de `elevate`.
- `empresa_id` y RLS se conservan para no romper lógica existente.

### Importante: infraestructura compartida

El Supabase self-hosted donde corre Elevate es **infraestructura compartida**
con otros proyectos (zentra_erp NEURA + ~17 schemas de otros clientes).
Por eso el bootstrap es **estrictamente no destructivo**:

- ❌ **NO** se ejecuta `ALTER SCHEMA zentra_erp RENAME TO elevate`.
- ❌ **NO** se modifican `public`, `zentra_erp`, ni ningún otro schema
  preexistente.
- ✅ **Sí** se crea `elevate` desde cero y se clona estructura (tablas vacías,
  constraints, índices, FKs, triggers, RLS, vistas, funciones) desde
  `zentra_erp`.
- ✅ `zentra_erp` queda 100% intacto.

## Variables de entorno requeridas

```env
NEXT_PUBLIC_SUPABASE_URL=https://<self-hosted-host>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service-role>
NEURA_CLIENT_SCHEMA=elevate
# Opcional, solo para scripts/apply-*.ts
SUPABASE_DB_URL=postgresql://postgres:<pass>@<host>:5432/postgres
```

## Orden de bootstrap (primera vez)

**Precondición:** `zentra_erp` ya existe en el Supabase self-hosted (creado por
las migraciones legacy del ERP NEURA). Esta repo Elevate **no** las re-aplica;
asume que `zentra_erp` está disponible como fuente para clonar.

1. **Verificar que `zentra_erp` exista** en el servidor self-hosted:
   ```bash
   ssh root@<vps> "docker exec -i supabase-db psql -U postgres -d postgres \
     -c \"SELECT 1 FROM information_schema.schemata WHERE schema_name='zentra_erp';\""
   ```
2. **Aplicar las migraciones de Elevate** (en orden):
   - `20260701000000_elevate_create_schema_clone_from_zentra_erp.sql`
     → **crea** el schema `elevate` y **clona** estructura desde `zentra_erp`
     (tablas vacías, constraints, índices, FKs, triggers, RLS, vistas,
     funciones de negocio). `zentra_erp` no se modifica.
   - `20260701000010_elevate_seed_empresa.sql`
     → inserta la empresa Elevate única y activa módulos Fase 1.
   - `20260701000020_elevate_lock_multiempresa.sql`
     → triggers para impedir más empresas o cambios de `data_schema`, y
     neutraliza las RPCs de provisioning (stubs que fallan).
3. **Exponer `elevate` en PostgREST**:
   - Local: ya está en `supabase/config.toml` (`schemas` incluye `elevate`).
   - Self-hosted compartido: agregar `elevate` a la lista de schemas expuestos
     en la config de Kong/PostgREST del servidor (sin remover los schemas
     existentes de otros proyectos).
4. **Crear el usuario admin** (no automatizado por migración porque requiere
   `auth.users` de Supabase Auth):
   ```sql
   -- Vía SQL (con service role) o vía Supabase Studio / Auth Admin API:
   -- 1. Crear usuario en auth.users con email del admin.
   -- 2. Insertar en elevate.usuarios:
   INSERT INTO elevate.usuarios (id, email, nombre_completo, empresa_id, rol, estado, auth_user_id)
   VALUES (
     gen_random_uuid(),
     'admin@elevate.local',
     'Admin Elevate',
     '00000000-0000-0000-0000-00000000e1e7'::uuid,
     'admin',
     'activo',
     (SELECT id FROM auth.users WHERE email = 'admin@elevate.local' LIMIT 1)
   );
   ```
5. **Validar**: login con admin, abrir dashboard, crear un cliente de prueba,
   verificar que `SELECT * FROM elevate.clientes` lo muestre.

## Qué se modificó en código

| Archivo | Cambio |
|---|---|
| `src/lib/supabase/schema.ts` | `SUPABASE_APP_SCHEMA` lee `NEURA_CLIENT_SCHEMA` (default `elevate`). `resolveEmpresaDataSchema()` siempre devuelve la constante. |
| `src/lib/supabase/empresa-data-schema.ts` | `fetchDataSchemaForEmpresaId()` y `createServiceRoleClientForEmpresa()` ignoran `empresaId` y devuelven el schema/cliente único. |
| `src/app/api/admin/crear-empresa/route.ts` | `POST` responde 410. El código legacy se conserva como `_legacyCrearEmpresa` (no exportado). |
| `supabase/config.toml` | `schemas` y `extra_search_path` cambian `zentra_erp` → `elevate`. |

## Qué NO se tocó (intencional)

- SIFEN / facturación electrónica.
- Omnicanal / chat / sorteos / campañas (sus tablas existen en `elevate`, los
  módulos no se activan por default).
- Tablas y RLS de tenants previos (`erp_*`): si existieran, se ignoran. En
  un self-hosted nuevo no existen.
- `empresa_id`, RLS, `empresa_modulos`: se mantienen para no romper queries.

## Reversibilidad

Como el bootstrap es no destructivo y `zentra_erp` queda intacto, revertir
es trivial: basta con eliminar el schema `elevate` (no afecta a nadie más).

```sql
DROP SCHEMA elevate CASCADE;
```

> ⚠️ Esto borra todos los datos de Elevate. Hacer backup primero si hay datos
> reales. El schema `zentra_erp` y demás proyectos del self-hosted no se
> afectan.

## Notas para futuras migraciones

Toda nueva migración del repo Elevate debe escribir contra `elevate.*`, no
contra `zentra_erp.*`. El schema `zentra_erp` pertenece a otro proyecto
(NEURA central) que vive en la misma instancia compartida y **no debe
tocarse desde acá**.

Si Elevate necesita features que se agregaron a `zentra_erp` posteriormente,
hay dos caminos:

1. **Recrear el cambio** como migración propia en `elevate.*` (preferido).
2. **Re-clonar selectivamente** (tabla por tabla) desde `zentra_erp` con un
   script ad-hoc — solo si el cambio es estructural grande. No automatizado.
