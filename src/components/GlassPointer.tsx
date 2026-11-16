'use client';

import { useEffect } from 'react';

/** Makes every `.glass` surface catch a soft highlight under the pointer (liquid-glass sheen). */
export default function GlassPointer() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let current: HTMLElement | null = null;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = (e.target as Element | null)?.closest?.('.glass') as HTMLElement | null;
        if (current && current !== el) current.style.setProperty('--glow', '0');
        current = el;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
        el.style.setProperty('--glow', '1');
      });
    };
    const onLeave = () => current?.style.setProperty('--glow', '0');
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);
  return null;
}
