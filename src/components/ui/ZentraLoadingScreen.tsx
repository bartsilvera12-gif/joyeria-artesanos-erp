"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Pantalla de carga global de Zentra.
 *
 * - Usa el logo OFICIAL del repo: /brand/zentra-logo-official.png
 * - Cubre TODO el viewport (sidebar incluido) vía createPortal sobre
 *   document.body, escapando del stacking context del AppShell.
 * - Animación discreta: zoom suave del logo + ola en "Cargando".
 * - Respeta `prefers-reduced-motion`.
 */
export function ZentraLoadingScreen({
  fullScreen = true,
  label = "Cargando",
}: {
  fullScreen?: boolean;
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const node = <Overlay label={label} fullScreen={fullScreen} />;

  // Cuando es fullScreen, portaleamos a <body> para garantizar que el
  // overlay cubra el sidebar/topbar/main sin depender del stacking.
  if (fullScreen && mounted && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}

function Overlay({ fullScreen, label }: { fullScreen: boolean; label: string }) {
  const containerClass = fullScreen
    ? "fixed inset-0 z-[2147483646] flex items-center justify-center"
    : "flex min-h-[40vh] w-full items-center justify-center py-16";

  return (
    <div
      className={containerClass}
      style={{
        background:
          "radial-gradient(ellipse at center, #1e3a8a 0%, #0f1e4d 55%, #07112b 100%)",
      }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-7">
        <div className="zentra-loading-logo relative h-32 w-64 sm:h-40 sm:w-80">
          <Image
            src="/brand/zentra-logo-official.png"
            alt="Zentra"
            fill
            sizes="(min-width: 640px) 320px, 256px"
            className="object-contain"
            priority
            unoptimized
          />
        </div>
        <div className="flex select-none gap-[3px] text-[11px] font-medium tracking-[0.5em] uppercase text-white/85">
          {Array.from(label).map((ch, i) => (
            <span
              key={`${ch}-${i}`}
              className="zentra-loading-letter inline-block"
              style={{ animationDelay: `${i * 110}ms` }}
            >
              {ch === " " ? " " : ch}
            </span>
          ))}
        </div>
      </div>
      <style jsx>{`
        @keyframes zentra-logo-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.92;
          }
          50% {
            transform: scale(1.05);
            opacity: 1;
          }
        }
        @keyframes zentra-letter-wave {
          0%, 100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          50% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
        :global(.zentra-loading-logo) {
          animation: zentra-logo-pulse 2.4s ease-in-out infinite;
          transform-origin: center;
          will-change: transform, opacity;
        }
        :global(.zentra-loading-letter) {
          animation: zentra-letter-wave 1.8s ease-in-out infinite;
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.zentra-loading-logo),
          :global(.zentra-loading-letter) {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
