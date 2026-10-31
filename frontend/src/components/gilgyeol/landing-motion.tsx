"use client";

// Landing page motion pieces. All motion speaks the product's own language:
// pulses = vibration guidance, line drawing = the route, a short buzz = confirmation.
// Styles: the "Landing motion" block in globals.css (classes prefixed gl-), incl. prefers-reduced-motion.
import { useCallback } from "react";

/**
 * Marks an element as revealed (data-in) the first time it scrolls into view.
 * The element needs data-reveal in its markup; CSS animates its gl-* children once.
 */
export function useReveal<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.in = "1";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.in = "1";
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
  }, []);
}

/**
 * Hero illustration, one 5 s loop: the arrow swings around looking for the target,
 * the purple rings get faster as it lines up, then a short buzz and a check, like the real guidance.
 */
export function SeekingCompass() {
  return (
    <div aria-hidden="true" className="gl-compass relative mx-auto size-[148px]">
      <svg viewBox="0 0 168 168" className="absolute inset-0 size-full overflow-visible">
        {/* slow, faint search pulses */}
        <circle className="gl-ring-slow" cx="84" cy="84" r="58" fill="none" stroke="#5B4AB8" strokeWidth="2" />
        {/* fast, strong pulses once aligned */}
        <g className="gl-rings-fast">
          <circle className="gl-ring-fast" cx="84" cy="84" r="58" fill="none" stroke="#5B4AB8" strokeWidth="3" />
          <circle className="gl-ring-fast gl-ring-fast-2" cx="84" cy="84" r="58" fill="none" stroke="#5B4AB8" strokeWidth="3" />
        </g>
        <circle cx="84" cy="84" r="62" fill="none" stroke="#E3E0D7" strokeWidth="2" />
        <circle cx="84" cy="84" r="46" fill="#fff" />
        {/* target heading marker */}
        <path d="M84 10 l7 11 h-14 z" fill="#5B4AB8" />
        {/* device heading arrow */}
        <g className="gl-arrow">
          <path d="M84 50 L100 86 L88 82 L88 112 L80 112 L80 82 L68 86 Z" fill="#5B4AB8" />
        </g>
      </svg>
      <div className="gl-check absolute right-2 bottom-3 flex size-8 items-center justify-center rounded-full bg-success shadow-[0_6px_14px_rgba(37,115,75,.35)]">
        <svg width="16" height="16" viewBox="0 0 14 14">
          <polyline points="2,7 6,11 12,3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
