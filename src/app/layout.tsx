import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { GridIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: {
    default: 'The Corsi Block-Tapping Experiment',
    template: '%s · Corsi Experiment'
  },
  description:
    'A within-subject research study comparing visuospatial working memory (Corsi span) after a 15-minute video game, YouTube, or screen-free break.'
};

export const viewport: Viewport = {
  themeColor: '#040a1a',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <div className="ambient" aria-hidden />
        <header className="sticky top-0 z-30 px-4 pt-3">
          <nav className="glass mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full px-4 py-2.5 sm:px-5">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-sky-200">
                <GridIcon className="h-5 w-5" />
              </span>
              <span className="hidden sm:inline">Corsi Experiment</span>
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link href="/methodology" className="rounded-full px-3 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
                Method
              </Link>
              <Link href="/results" className="rounded-full px-3 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
                Results
              </Link>
              <Link href="/dashboard" className="rounded-full bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15">
                My progress
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="px-4 pb-8 pt-12 text-center text-xs muted">
          <p>
            An experimental implementation of a Corsi-style block-tapping task for research purposes. Not a validated
            clinical or diagnostic assessment.
          </p>
          <p className="mt-2">
            <Link href="/methodology" className="underline-offset-2 hover:underline">Methodology</Link>
            {' · '}
            <Link href="/admin" className="underline-offset-2 hover:underline">Researcher login</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
