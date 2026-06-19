"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import type { ResenaVideo } from "./Reviews";

/**
 * Carrusel de videos de reseñas.
 *
 * Audio:
 *  - Auto-unmute SOLO en mobile (`matchMedia("(max-width: 767px)")`). En
 *    tablet y desktop el comportamiento queda igual que antes: muteado
 *    por defecto, activación manual mediante el botón de bocina.
 *  - En mobile el video más centrado se desmutea cuando (a) la sección
 *    está visible y (b) el browser tiene el audio desbloqueado (autoplay
 *    policy: requiere un gesto previo del usuario).
 *  - `syncActiveVideoNow()` recomputa cuál es el activo y aplica el audio
 *    imperativamente. Se llama desde MUCHOS triggers — montaje, RAF,
 *    timeouts cortos, IntersectionObserver, scroll del carrusel, canplay
 *    y loadedmetadata de cada video, y el primer gesto del usuario. Así
 *    no dependemos de un único evento para sincronizar.
 *  - Al cambiar el activo: el viejo se mutea y el nuevo se desmutea
 *    instantáneamente. Nunca dos pistas a la vez.
 *  - Si play() es rechazado por política, se revierte a muteado en
 *    silencio (sin overlays/carteles) y el próximo gesto lo reintenta.
 *  - El botón de bocina funciona como override manual en TODOS los
 *    viewports (incluido desktop): tocarlo fija la decisión hasta que se
 *    vuelva a tocar.
 *  - El audio se manipula imperativamente sobre el HTMLVideoElement
 *    (muted + atributo HTML + volume + play) para sortear la race
 *    condition de React con `muted` (facebook/react#10389) y mantener
 *    el call site dentro del callstack del gesto (lo exige iOS Safari).
 */
export function ReviewsVideos({ videos }: { videos: ResenaVideo[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [unmutedId, setUnmutedId] = useState<string | null>(null);

  // Estado mutable que NO debe causar re-render. Lecturas seguras desde
  // callbacks (observers, scroll, gestos) sin closures viejos.
  const stateRef = useRef({
    audioUnlocked: false,
    sectionVisible: false,
    centeredId: null as string | null,
    manualPick: null as string | null,
    manualActive: false,
    // Auto-unmute por visibilidad SOLO en mobile (max-width: 767px).
    // En tablet/desktop el audio se activa únicamente con el botón de
    // bocina (override manual). Se computa en el useEffect, mount-time.
    autoOnVisible: false,
  });

  const scrollByCards = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-review-card]");
    const amount = card ? card.offsetWidth + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  /**
   * Recalcula cuál es la card más centrada horizontalmente en el carrusel
   * mirando getBoundingClientRect() en vivo. Devuelve el id o null si no
   * hay layout todavía.
   */
  const computeCentered = (): string | null => {
    const root = scrollerRef.current;
    if (!root) return null;
    const cards = Array.from(
      root.querySelectorAll<HTMLElement>("[data-review-card]"),
    );
    if (cards.length === 0) return null;
    const rect = root.getBoundingClientRect();
    if (rect.width === 0) return null;
    const center = rect.left + rect.width / 2;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const c of cards) {
      const id = c.dataset.reviewId;
      if (!id) continue;
      const r = c.getBoundingClientRect();
      if (r.width === 0) continue;
      const cc = r.left + r.width / 2;
      const d = Math.abs(cc - center);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best;
  };

  /**
   * Aplica la decisión de audio AHORA al DOM. Idempotente.
   * Mute a todos los que no son el target; el target queda con
   * muted=false, atributo removido, volume=1 y play() lanzado.
   */
  const applyAudio = (): string | null => {
    const s = stateRef.current;
    let target: string | null = null;
    if (s.manualActive) {
      target = s.manualPick;
    } else if (s.autoOnVisible && s.audioUnlocked && s.sectionVisible) {
      // Auto solo en mobile (≤767px). En tablet/desktop el flag
      // autoOnVisible queda en false y este branch no aplica — el audio
      // permanece muteado salvo override manual con el botón de bocina.
      target = s.centeredId;
    }

    videoRefs.current.forEach((vid, id) => {
      if (id !== target) {
        if (!vid.muted) {
          vid.muted = true;
          vid.setAttribute("muted", "");
        } else if (!vid.hasAttribute("muted")) {
          vid.setAttribute("muted", "");
        }
      }
    });

    if (target) {
      const vid = videoRefs.current.get(target);
      if (vid) {
        vid.muted = false;
        vid.removeAttribute("muted");
        vid.volume = 1;
        vid.play().catch(() => {
          // Política rechazó: revertir silenciosamente, sin UI ruidosa.
          // El próximo gesto disparará un nuevo intento via unlock.
          vid.muted = true;
          vid.setAttribute("muted", "");
          setUnmutedId(null);
        });
      }
    }
    setUnmutedId(target);
    return target;
  };

  /**
   * Sincronización completa: recomputa el centrado y aplica el audio.
   * Es el punto único llamado desde todos los triggers.
   */
  const syncActiveVideoNow = (): string | null => {
    const s = stateRef.current;
    const found = computeCentered();
    if (found !== s.centeredId) s.centeredId = found;
    return applyAudio();
  };

  const handleManualToggle = (id: string) => {
    const s = stateRef.current;
    if (s.manualActive && s.manualPick === id) {
      s.manualPick = null;
      s.manualActive = true;
    } else {
      s.manualPick = id;
      s.manualActive = true;
    }
    applyAudio();
  };

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const s = stateRef.current;

    // Mobile real: solo phones (≤767px). Tablet y desktop quedan con
    // comportamiento manual (botón de bocina) — sin cambios respecto a la
    // versión previa pre-auto-unmute en esos viewports.
    const mqMobile = window.matchMedia("(max-width: 767px)");
    s.autoOnVisible = mqMobile.matches;
    const onMqChange = (e: MediaQueryListEvent) => {
      s.autoOnVisible = e.matches;
      // Si se sale de mobile en caliente, mutear todos por consistencia.
      if (!e.matches) {
        videoRefs.current.forEach((vid) => {
          vid.muted = true;
          vid.setAttribute("muted", "");
        });
        setUnmutedId(null);
      } else {
        syncActiveVideoNow();
      }
    };
    mqMobile.addEventListener("change", onMqChange);

    const applyPlayback = () => {
      videoRefs.current.forEach((vid) => {
        if (s.sectionVisible) {
          vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      });
    };

    // ───── Triggers de sincronización ─────

    // 1) Inmediatamente al montar.
    syncActiveVideoNow();

    // 2) En el siguiente frame y con timeouts cortos, por si el layout
    //    no estaba listo (los videos pueden no tener bounding rect aún).
    const raf1 = requestAnimationFrame(() => {
      syncActiveVideoNow();
      // 3) Otro RAF para cubrir el segundo paint.
      requestAnimationFrame(() => syncActiveVideoNow());
    });
    const t0 = setTimeout(syncActiveVideoNow, 50);
    const t1 = setTimeout(syncActiveVideoNow, 250);
    const t2 = setTimeout(syncActiveVideoNow, 800);

    // 4) Por cada video, cuando esté listo para reproducir o tenga
    //    metadata, resincronizamos — clave en mobile donde el lazy load
    //    de los videos puede correrse después del primer paint.
    const onReady = () => syncActiveVideoNow();
    videoRefs.current.forEach((vid) => {
      vid.addEventListener("loadedmetadata", onReady);
      vid.addEventListener("canplay", onReady);
    });

    // 5) IntersectionObserver de la sección.
    const sectionObs = new IntersectionObserver(
      ([entry]) => {
        s.sectionVisible = (entry?.intersectionRatio ?? 0) >= 0.1;
        applyPlayback();
        syncActiveVideoNow();
      },
      { threshold: [0, 0.05, 0.1, 0.5] },
    );
    sectionObs.observe(root);

    // 6) Scroll del carrusel (horizontal) → cambia el centrado.
    const onCarouselScroll = () => syncActiveVideoNow();
    root.addEventListener("scroll", onCarouselScroll, { passive: true });

    // 7) Primer gesto del usuario en cualquier parte de la página.
    //    Escuchamos un set amplio para captar cualquier interacción:
    //    pointer/touch/click/key (gestos "duros" que satisfacen la
    //    autoplay policy) y wheel/scroll (que algunos browsers también
    //    aceptan; si no, el play() falla y se revierte sin ruido).
    //    Importante: la PRIMERA vez que se dispara, hacemos la sync
    //    SINCRÓNICAMENTE dentro del callstack del gesto, no en RAF —
    //    iOS Safari sólo concede el unlock si el play() ocurre acá.
    const ac = new AbortController();
    let rafScheduled = false;
    const scheduleSync = () => {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        syncActiveVideoNow();
      });
    };
    const onGesture = () => {
      if (!s.audioUnlocked) {
        s.audioUnlocked = true;
        // Sincronía obligatoria para conservar el "user gesture token"
        // que exige iOS para habilitar audio.
        syncActiveVideoNow();
      } else {
        // Subsecuentes gestos: throttle a 1 por frame.
        scheduleSync();
      }
    };
    const gestureEvents = [
      "pointerdown",
      "touchstart",
      "touchend",
      "click",
      "keydown",
      "wheel",
      "scroll",
    ] as const;
    for (const ev of gestureEvents) {
      window.addEventListener(ev, onGesture, {
        signal: ac.signal,
        passive: true,
        capture: ev === "scroll" ? true : false,
      });
    }

    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      videoRefs.current.forEach((vid) => {
        vid.removeEventListener("loadedmetadata", onReady);
        vid.removeEventListener("canplay", onReady);
      });
      sectionObs.disconnect();
      root.removeEventListener("scroll", onCarouselScroll);
      mqMobile.removeEventListener("change", onMqChange);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  return (
    <div className="relative mt-14">
      <button
        type="button"
        aria-label="Anterior"
        onClick={() => scrollByCards(-1)}
        className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-background/90 border border-border/60 text-primary shadow-soft flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-elegant"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => scrollByCards(1)}
        className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-background/90 border border-border/60 text-primary shadow-soft flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-elegant"
      >
        <ChevronRight size={22} />
      </button>

      <div
        ref={scrollerRef}
        className="reviews-scroller flex gap-4 lg:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth px-12 sm:px-14 pb-2"
      >
        {videos.map((v) => {
          const muted = unmutedId !== v.id;
          return (
            <figure
              key={v.id}
              data-review-card
              data-review-id={v.id}
              className="snap-center shrink-0 w-[78vw] sm:w-[280px] lg:w-[300px] bg-black border border-border/60 shadow-soft overflow-hidden"
            >
              <div className="relative aspect-[9/16] bg-black">
                <video
                  ref={(el) => {
                    // CLAVE: NO tocar muted acá. El ref callback inline se
                    // reejecuta en cada render que dispara setUnmutedId, y
                    // reasignar muted=true acá pisaría el unmute imperativo
                    // hecho desde applyAudio (este era el bug real). El
                    // estado inicial "muteado" lo da el atributo `muted` del
                    // JSX que React aplica solo en mount. Acá solo
                    // registramos el elemento en el map.
                    if (el) videoRefs.current.set(v.id, el);
                    else videoRefs.current.delete(v.id);
                  }}
                  src={v.video_url}
                  poster={v.poster_url ?? undefined}
                  loop
                  playsInline
                  muted
                  preload="auto"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={muted ? "Activar sonido" : "Silenciar"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleManualToggle(v.id);
                  }}
                  className="absolute bottom-3 right-3 z-10 h-10 w-10 rounded-full bg-black/55 text-white backdrop-blur flex items-center justify-center hover:bg-black/75 transition-elegant"
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
