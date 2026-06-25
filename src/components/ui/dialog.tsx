"use client";

/**
 * Sistema de diálogos in-app — reemplaza window.confirm/alert/prompt.
 *
 * Uso (importar desde "@/components/ui/dialog"):
 *
 *   const ok = await confirm({
 *     title: "Cancelar el pedido",
 *     message: "El cajero ya no lo va a ver.",
 *     confirmText: "Sí, cancelar",
 *     variant: "danger",
 *   });
 *   if (!ok) return;
 *
 *   await alert({ title: "Error", message: "...", variant: "danger" });
 *
 *   const nombre = await prompt({ title: "Nuevo nombre", defaultValue: "..." });
 *   if (nombre == null) return; // canceló
 *
 * El <DialogHost /> se monta una sola vez en el layout raíz.
 */

import { useEffect, useState, useRef } from "react";
import { AlertTriangle, Info, CheckCircle2, X } from "lucide-react";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type DialogVariant = "default" | "danger" | "warning" | "success" | "info";

interface BaseOpts {
  title?: string;
  message: string;
  variant?: DialogVariant;
}

export interface ConfirmOpts extends BaseOpts {
  confirmText?: string;
  cancelText?: string;
}

export interface AlertOpts extends BaseOpts {
  okText?: string;
}

export interface PromptOpts extends BaseOpts {
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

type DialogKind = "confirm" | "alert" | "prompt";

interface DialogState {
  id: number;
  kind: DialogKind;
  opts: ConfirmOpts | AlertOpts | PromptOpts;
  resolve: (value: unknown) => void;
}

// ─── Store + API imperativa ─────────────────────────────────────────────────

let nextId = 1;
let setQueue: ((q: DialogState[]) => void) | null = null;
let currentQueue: DialogState[] = [];

function push(state: DialogState) {
  currentQueue = [...currentQueue, state];
  setQueue?.(currentQueue);
}

function pop(id: number) {
  currentQueue = currentQueue.filter((s) => s.id !== id);
  setQueue?.(currentQueue);
}

export function confirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    push({ id: nextId++, kind: "confirm", opts, resolve: resolve as (v: unknown) => void });
  });
}

export function alert(opts: AlertOpts): Promise<void> {
  return new Promise((resolve) => {
    push({ id: nextId++, kind: "alert", opts, resolve: resolve as (v: unknown) => void });
  });
}

export function prompt(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    push({ id: nextId++, kind: "prompt", opts, resolve: resolve as (v: unknown) => void });
  });
}

// ─── Host (montar una sola vez) ─────────────────────────────────────────────

export function DialogHost() {
  const [queue, setQ] = useState<DialogState[]>([]);

  useEffect(() => {
    setQueue = setQ;
    setQ(currentQueue);
    return () => { setQueue = null; };
  }, []);

  const current = queue[0];
  if (!current) return null;

  return <DialogView key={current.id} state={current} onClose={() => pop(current.id)} />;
}

// ─── Vista del modal ────────────────────────────────────────────────────────

function variantStyles(v: DialogVariant = "default") {
  switch (v) {
    case "danger":
      return {
        iconBg: "bg-red-50", iconColor: "text-red-600", Icon: AlertTriangle,
        confirmBg: "bg-red-600 hover:bg-red-700",
      };
    case "warning":
      return {
        iconBg: "bg-amber-50", iconColor: "text-amber-600", Icon: AlertTriangle,
        confirmBg: "bg-amber-600 hover:bg-amber-700",
      };
    case "success":
      return {
        iconBg: "bg-emerald-50", iconColor: "text-emerald-600", Icon: CheckCircle2,
        confirmBg: "bg-emerald-600 hover:bg-emerald-700",
      };
    case "info":
    case "default":
    default:
      return {
        iconBg: "bg-[#4FAEB2]/10", iconColor: "text-[#4FAEB2]", Icon: Info,
        confirmBg: "bg-[#4FAEB2] hover:bg-[#3F8E91]",
      };
  }
}

function DialogView({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const { kind, opts, resolve } = state;
  const promptInitial = kind === "prompt" ? (opts as PromptOpts).defaultValue ?? "" : "";
  const [value, setValue] = useState(promptInitial);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const styles = variantStyles(opts.variant);

  useEffect(() => {
    // Focus inicial: input para prompt, botón confirmar para el resto.
    if (kind === "prompt") inputRef.current?.focus();
    else confirmBtnRef.current?.focus();
  }, [kind]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm() {
    if (kind === "confirm") resolve(true);
    else if (kind === "prompt") resolve(value);
    else resolve(undefined);
    onClose();
  }

  function handleCancel() {
    if (kind === "confirm") resolve(false);
    else if (kind === "prompt") resolve(null);
    else resolve(undefined);
    onClose();
  }

  const confirmText =
    kind === "alert"
      ? (opts as AlertOpts).okText ?? "Aceptar"
      : (opts as ConfirmOpts | PromptOpts).confirmText ?? "Aceptar";
  const cancelText =
    kind === "alert" ? null : (opts as ConfirmOpts | PromptOpts).cancelText ?? "Cancelar";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={opts.title ? "dialog-title" : undefined}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 p-5">
          <div className={`shrink-0 rounded-full p-2.5 ${styles.iconBg}`}>
            <styles.Icon className={`h-5 w-5 ${styles.iconColor}`} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            {opts.title && (
              <h2 id="dialog-title" className="text-base font-semibold text-slate-900">
                {opts.title}
              </h2>
            )}
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{opts.message}</p>
            {kind === "prompt" && (
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={(opts as PromptOpts).placeholder}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
            )}
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          {cancelText && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${styles.confirmBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
