import type { SVGProps } from 'react';
import type { Condition } from '@/lib/constants';

type P = SVGProps<SVGSVGElement>;
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const;

export function ControllerIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M6.5 8h11a4 4 0 0 1 3.9 3.1l.9 4.1a2.6 2.6 0 0 1-4.5 2.3L15.6 16H8.4l-2.2 1.5a2.6 2.6 0 0 1-4.5-2.3l.9-4.1A4 4 0 0 1 6.5 8Z" />
      <path d="M7.5 11v3M6 12.5h3" />
      <circle cx="16" cy="11.6" r=".6" fill="currentColor" />
      <circle cx="17.8" cy="13.4" r=".6" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="M10 9.2v5.6l4.8-2.8L10 9.2Z" fill="currentColor" />
    </svg>
  );
}

export function CoffeeIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M4 10h12v4.5A5.5 5.5 0 0 1 10.5 20h-1A5.5 5.5 0 0 1 4 14.5V10Z" />
      <path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5c-.6.8-.6 1.7 0 2.5s.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5s.6 1.7 0 2.5" />
    </svg>
  );
}

export function CheckIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...base} strokeWidth={2.2} {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ArrowIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...base} strokeWidth={2} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function GridIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <rect x="3" y="3" width="5" height="5" rx="1.4" />
      <rect x="9.5" y="3" width="5" height="5" rx="1.4" fill="currentColor" />
      <rect x="16" y="3" width="5" height="5" rx="1.4" />
      <rect x="3" y="9.5" width="5" height="5" rx="1.4" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1.4" />
      <rect x="16" y="9.5" width="5" height="5" rx="1.4" fill="currentColor" />
      <rect x="3" y="16" width="5" height="5" rx="1.4" fill="currentColor" />
      <rect x="9.5" y="16" width="5" height="5" rx="1.4" />
      <rect x="16" y="16" width="5" height="5" rx="1.4" />
    </svg>
  );
}

export function LockIcon(p: P) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function ConditionIcon({ condition, ...p }: P & { condition: Condition }) {
  if (condition === 'video_game') return <ControllerIcon {...p} />;
  if (condition === 'youtube') return <PlayIcon {...p} />;
  return <CoffeeIcon {...p} />;
}
