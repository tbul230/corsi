import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { GridIcon } from '@/components/icons';
import NavLinks from '@/components/NavLinks';

export const metadata: Metadata = {
  title: {
    default: 'The Corsi Block-Tapping Experiment',
    template: '%s · Corsi Experiment'
  },
  description:
    'A within-subject research study comparing visuospatial working memory (Corsi span) after a 15-minute video game, YouTube, or screen-free break.'
};

export const viewport: Viewport = {
  themeColor: '#060b18',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <div className="ambient" aria-hidden />
        <header className="header-bar sticky top-0 z-30">
          <nav className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
                <GridIcon className="h-4.5 w-4.5" />
              </span>
              <span className="hidden text-[15px] min-[400px]:inline">Corsi Experiment</span>
            </Link>
            <NavLinks />
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-4 py-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
            <p>An experimental Corsi-style block-tapping task for research. Not a clinical or diagnostic assessment.</p>
            <p className="flex gap-4">
              <Link href="/methodology" className="hover:text-ink">Methodology</Link>
              <Link href="/results" className="hover:text-ink">Results</Link>
              <Link href="/admin" className="hover:text-ink">Researcher login</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
