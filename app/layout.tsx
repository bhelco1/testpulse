import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import { themeInitScript } from '../lib/design/theme';

import '../design/tokens.css';
import './globals.css';

// The files are the latin subsets Google Fonts serves, committed so the build never needs
// the network. Each is variable, so one file covers the weight range; Source Serif 4 also carries
// its opsz axis.
const sourceSerif = localFont({
  src: './fonts/source-serif-4/SourceSerif4-latin.woff2',
  weight: '200 900',
  style: 'normal',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
  variable: '--font-source-serif-4',
});

const publicSans = localFont({
  src: './fonts/public-sans/PublicSans-latin.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  adjustFontFallback: 'Arial',
  variable: '--font-public-sans',
});

const jetBrainsMono = localFont({
  src: './fonts/jetbrains-mono/JetBrainsMono-latin.woff2',
  weight: '400 600',
  style: 'normal',
  display: 'swap',
  adjustFontFallback: 'Arial',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'testpulse',
  description:
    "Live test results for Bobby Helco's software projects, reported by each project's CI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const fontVariables = `${sourceSerif.variable} ${publicSans.variable} ${jetBrainsMono.variable}`;
  return (
    // The inline script sets data-theme before hydration, so React must not flag the difference.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
