"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product, WebPresentacion } from "@/lib/elevate-public/products-mock";

/**
 * CartItem v2 (Fase Presentaciones).
 *
 * Soporta productos simples y productos con presentación por ml. La identidad
 * dentro del carrito es la key compuesta `product.id#presentacion.id` para
 * permitir varias filas del mismo producto con distinto ml.
 *
 * `presentacion` viene siempre del adapter público (mismo shape que la API).
 *
 * Backward-compat con localStorage:
 *   - Items legacy sin `presentacion`/`key` siguen funcionando (key se
 *     reconstruye en hidratación con sentinel `_` y se tratan como simples).
 *   - Items con `presentacion` no son legibles por builds anteriores, pero
 *     esos builds ya no existen post-deploy.
 */
export interface CartItem {
  /** Identidad estable: `product.id#presentacion.id` o `product.id#_`. */
  key: string;
  product: Product;
  presentacion?: WebPresentacion | null;
  qty: number;
}

interface CartCtx {
  items: CartItem[];
  /** Agrega producto simple. */
  add: (p: Product, qty?: number) => void;
  /** Agrega producto + presentación (Fase Presentaciones). */
  addWithPresentacion: (p: Product, presentacion: WebPresentacion, qty?: number) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  count: number;
  total: number;
  open: boolean;
  setOpen: (o: boolean) => void;
}

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = "elevate-cart";

/** Calcula la key compuesta. Presentacion null/undefined → sufijo "_". */
function buildKey(productId: string, presentacionId: string | null | undefined): string {
  return `${productId}#${presentacionId ?? "_"}`;
}

/** Precio efectivo: si hay presentación, usa su precio; si no, product.price. */
export function effectivePrice(item: CartItem): number {
  const v = item.presentacion?.precio ?? item.product.price;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Imagen efectiva: imagen propia de presentación o imagen del producto. */
export function effectiveImage(item: CartItem): string {
  return item.presentacion?.imagen_url ?? item.product.image;
}

/** Etiqueta visible: "Nombre · 50 ml" si tiene presentación, sino solo nombre. */
export function effectiveLabel(item: CartItem): string {
  if (item.presentacion && typeof item.presentacion.volumen_ml === "number") {
    return `${item.product.name} · ${item.presentacion.volumen_ml} ml`;
  }
  return item.product.name;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CartItem>[];
        // Sanitiza items: reconstruye key, descarta items malformados.
        const valid: CartItem[] = [];
        for (const it of parsed) {
          if (!it || !it.product || typeof it.product.id !== "string") continue;
          const qty = typeof it.qty === "number" && it.qty > 0 ? it.qty : 1;
          const presentacion =
            it.presentacion && typeof it.presentacion.id === "string"
              ? (it.presentacion as WebPresentacion)
              : null;
          const key = buildKey(it.product.id, presentacion?.id ?? null);
          valid.push({ key, product: it.product, presentacion, qty });
        }
        setItems(valid);
      }
    } catch {
      // localStorage corrupto: arrancamos limpio.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // quota / private mode — ignorar
    }
  }, [items, hydrated]);

  const add = (p: Product, qty: number = 1) => {
    const key = buildKey(p.id, null);
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.key === key);
      if (idx >= 0) {
        return prev.map((i, j) => (j === idx ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { key, product: p, presentacion: null, qty }];
    });
    setOpen(true);
  };

  const addWithPresentacion = (p: Product, presentacion: WebPresentacion, qty: number = 1) => {
    const key = buildKey(p.id, presentacion.id);
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.key === key);
      if (idx >= 0) {
        return prev.map((i, j) => (j === idx ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { key, product: p, presentacion, qty }];
    });
    setOpen(true);
  };

  const remove = (key: string) => setItems((p) => p.filter((i) => i.key !== key));
  const setQty = (key: string, qty: number) =>
    setItems((p) => p.map((i) => (i.key === key ? { ...i, qty: Math.max(1, qty) } : i)));
  const clear = () => setItems([]);

  const value = useMemo<CartCtx>(
    () => ({
      items,
      add,
      addWithPresentacion,
      remove,
      setQty,
      clear,
      open,
      setOpen,
      count: items.reduce((s, i) => s + i.qty, 0),
      total: items.reduce((s, i) => s + i.qty * effectivePrice(i), 0),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, open]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
