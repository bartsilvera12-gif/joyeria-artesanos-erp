#!/usr/bin/env python3
"""
Genera supabase/migrations consolidado en SQL único reescrito al schema `elevate`.
- Toma N migraciones legacy en orden cronológico (descarta lista omit).
- Reescribe `zentra_erp.X` -> `elevate.X` global.
- Reescribe `public.X` -> `elevate.X` SOLO para X en listas blancas ERP (tablas y funciones).
- Reescribe `'zentra_erp'` (literal) -> `'elevate'`.
- NO toca public.gen_random_uuid, public.uuid_generate_v4, ni otras extensiones.
- Genera BEGIN/COMMIT explícito.

Output: stdout (redirigir a archivo).
"""

import argparse
import os
import re
import sys

# Force UTF-8 stdout (Windows defaults to cp1252)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass


def load_list(path: str) -> set[str]:
    if not os.path.exists(path):
        return set()
    with open(path, "r", encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip() and not line.startswith("#")}


def rewrite_chunk(sql: str, erp_tables: set[str], erp_funcs: set[str]) -> str:
    # 1) zentra_erp global (cualquier identifier)
    sql = re.sub(r'\bzentra_erp\.', 'elevate.', sql)
    sql = re.sub(r'"zentra_erp"\.', '"elevate".', sql)
    sql = re.sub(r"'zentra_erp'", "'elevate'", sql)
    # 1b) SET search_path = zentra_erp[, ...] → SET search_path = elevate[, ...]
    sql = re.sub(
        r'(SET\s+(?:LOCAL\s+)?search_path\s*=\s*)zentra_erp\b',
        r'\1elevate',
        sql,
        flags=re.IGNORECASE,
    )
    # 1c) String literales 'public' o 'zentra_erp' en contextos de schema-lookup
    #     (DO blocks que iteran pg_class/pg_constraint/pg_policy filtrando por nspname).
    #     Reescribir SOLO en patrones específicos para evitar afectar string literales legítimos.
    for col in ('nspname', 'schemaname', 'table_schema'):
        # nspname = 'public' → nspname = 'elevate' (con o sin alias n. / t. / etc)
        sql = re.sub(
            r"(\b\w+\.)?(" + col + r"\s*=\s*)'public'",
            r"\1\2'elevate'",
            sql,
        )
        sql = re.sub(
            r"(\b\w+\.)?(" + col + r"\s*=\s*)'zentra_erp'",
            r"\1\2'elevate'",
            sql,
        )
        # nspname IN ('public', ...) — más raro, pero igual
        sql = re.sub(
            r"(\b\w+\.)?(" + col + r"\s+IN\s*\(\s*)'public'",
            r"\1\2'elevate'",
            sql,
            flags=re.IGNORECASE,
        )
    # 2) public.<ERP> con word boundaries
    for name in sorted(erp_tables | erp_funcs, key=len, reverse=True):
        pattern_qual = re.compile(r'\bpublic\.' + re.escape(name) + r'\b')
        sql = pattern_qual.sub(f'elevate.{name}', sql)
        pattern_quoted = re.compile(r'"public"\."' + re.escape(name) + r'"')
        sql = pattern_quoted.sub(f'"elevate"."{name}"', sql)
    return sql


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--migrations-dir", required=True)
    p.add_argument("--omit-list", required=True, help="archivo con basenames a omitir, uno por línea")
    p.add_argument("--erp-tables", required=True, help="archivo con nombres de tablas ERP en public")
    p.add_argument("--erp-funcs", required=True, help="archivo con nombres de funciones ERP en public")
    p.add_argument("--defer-list", required=False, help="archivo con basenames a diferir al final, uno por línea")
    args = p.parse_args()

    omit = load_list(args.omit_list)
    erp_tables = load_list(args.erp_tables)
    erp_funcs = load_list(args.erp_funcs)
    defer = load_list(args.defer_list) if args.defer_list else set()

    all_files = sorted(
        f for f in os.listdir(args.migrations_dir)
        if f.endswith(".sql") and f not in omit
    )
    files = [f for f in all_files if f not in defer]
    deferred_files = [f for f in all_files if f in defer]

    print(f"-- ELEVATE BOOTSTRAP CONSOLIDATED")
    print(f"-- Source: {len(files)} migrations from {args.migrations_dir}")
    print(f"-- Omitted: {len(omit)} migrations (multi-tenant bootstrap + elevate)")
    print(f"-- Deferred (applied at end): {len(deferred_files)} migrations")
    print(f"-- ERP public tables rewritten to elevate: {len(erp_tables)}")
    print(f"-- ERP public funcs rewritten to elevate: {len(erp_funcs)}")
    print(f"-- Schema target: elevate")
    print()
    print("BEGIN;")
    print()
    print("CREATE SCHEMA IF NOT EXISTS elevate;")
    print("GRANT USAGE ON SCHEMA elevate TO postgres, anon, authenticated, service_role;")
    print()
    print("-- Make 'elevate' first in search_path so unqualified table refs land there.")
    print("SET LOCAL search_path = elevate, public, extensions, pg_catalog;")
    print()

    for fname in files:
        path = os.path.join(args.migrations_dir, fname)
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        rewritten = rewrite_chunk(content, erp_tables, erp_funcs)
        print(f"-- ============================================================")
        print(f"-- BEGIN MIGRATION: {fname}")
        print(f"-- ============================================================")
        print(rewritten)
        if not rewritten.endswith("\n"):
            print()
        print(f"-- END MIGRATION: {fname}")
        print()

    if deferred_files:
        print()
        print("-- ============================================================")
        print("-- DEFERRED MIGRATIONS (applied after main chronological order")
        print("-- because their dependencies were created later in the timeline)")
        print("-- ============================================================")
        for fname in deferred_files:
            path = os.path.join(args.migrations_dir, fname)
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            rewritten = rewrite_chunk(content, erp_tables, erp_funcs)
            print(f"-- ============================================================")
            print(f"-- BEGIN DEFERRED MIGRATION: {fname}")
            print(f"-- ============================================================")
            print(rewritten)
            if not rewritten.endswith("\n"):
                print()
            print(f"-- END DEFERRED MIGRATION: {fname}")
            print()

    print()
    print("-- Final grants on elevate")
    print("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA elevate TO authenticated;")
    print("GRANT ALL ON ALL TABLES IN SCHEMA elevate TO postgres, service_role;")
    print("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA elevate TO authenticated;")
    print("GRANT ALL ON ALL SEQUENCES IN SCHEMA elevate TO postgres, service_role;")
    print("GRANT EXECUTE ON ALL ROUTINES IN SCHEMA elevate TO authenticated, service_role;")
    print("GRANT ALL ON ALL ROUTINES IN SCHEMA elevate TO postgres, service_role;")
    print()
    print("NOTIFY pgrst, 'reload schema';")
    print()
    print("COMMIT;")


if __name__ == "__main__":
    main()
