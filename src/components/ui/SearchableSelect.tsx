"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchableOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Cap de items visibles en el dropdown (perf cuando hay miles). Default 200. */
  maxResults?: number;
  className?: string;
  required?: boolean;
}

/**
 * Combobox con buscador inline. Cuando hay 1000+ items (catálogo de productos
 * grande), el <select> nativo es inusable porque obliga a scrollear toda la
 * lista. Este componente filtra a medida que el usuario tipea.
 *
 * Diseño:
 * - Trigger muestra el label seleccionado, o el placeholder si está vacío.
 * - Al abrir: input enfocado + lista filtrada debajo.
 * - Filtra por label + sublabel (case/accent-insensitive).
 * - Limita items visibles a maxResults para no laguear con 6000+ productos.
 * - ↑/↓ navega, Enter selecciona, Esc cierra, click afuera cierra.
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  emptyText = "Sin resultados",
  disabled = false,
  maxResults = 200,
  className = "",
  required = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value]
  );

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options.slice(0, maxResults);
    const out: SearchableOption[] = [];
    for (const o of options) {
      const hay = norm(o.label + " " + (o.sublabel ?? ""));
      if (hay.includes(q)) {
        out.push(o);
        if (out.length >= maxResults) break;
      }
    }
    return out;
  }, [options, query, maxResults]);

  // Click afuera cierra el dropdown.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Auto-focus en el input cuando se abre.
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      // setTimeout para que el input ya esté montado.
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  // Scroll del item activo dentro de la lista.
  useEffect(() => {
    if (!open) return;
    const li = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    if (li) li.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  function commit(id: string) {
    onChange(id);
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIdx];
      if (opt) commit(opt.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Trigger: parece un <select>, abre el dropdown al click. */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-left text-sm transition-colors hover:border-slate-400 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
          open ? "border-[#4FAEB2] ring-2 ring-[#4FAEB2]/20" : ""
        }`}
      >
        <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {selected ? (
            <>
              <span className="font-medium">{selected.label}</span>
              {selected.sublabel && <span className="text-slate-500"> — {selected.sublabel}</span>}
            </>
          ) : (
            placeholder
          )}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[#4FAEB2] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Validación HTML5: input oculto que refleja el value, para required en forms. */}
      {required && (
        <input
          type="text"
          tabIndex={-1}
          aria-hidden
          value={value}
          onChange={() => {}}
          required
          className="sr-only absolute inset-0 h-0 w-0 opacity-0"
        />
      )}

      {open && !disabled && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          onKeyDown={handleKey}
        >
          <div className="border-b border-slate-100 p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              placeholder="Buscar…"
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:bg-white focus:ring-2 focus:ring-[#4FAEB2]/20"
              autoComplete="off"
            />
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-400">{emptyText}</div>
          ) : (
            <ul
              ref={listRef}
              role="listbox"
              className="max-h-64 overflow-y-auto py-1 text-sm"
            >
              {filtered.map((o, i) => {
                const isActive = i === activeIdx;
                const isSelected = o.id === value;
                return (
                  <li
                    key={o.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => commit(o.id)}
                    className={`cursor-pointer px-3 py-2 ${
                      isActive ? "bg-[#4FAEB2]/10" : ""
                    } ${isSelected ? "font-semibold text-[#4FAEB2]" : "text-slate-700"}`}
                  >
                    <div className="truncate">{o.label}</div>
                    {o.sublabel && (
                      <div className="text-xs text-slate-500 truncate">{o.sublabel}</div>
                    )}
                  </li>
                );
              })}
              {filtered.length === maxResults && (
                <li className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-400">
                  Mostrando primeros {maxResults}. Refiná la búsqueda para ver más.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
