import type { Metadata } from 'next';
import { JetBrains_Mono, Public_Sans, Source_Serif_4 } from 'next/font/google';
import type { ReactNode } from 'react';

import { themeInitScript } from '../lib/design/theme';

import '../design/tokens.css';
import './globals.css';

// Source Serif 4 is variable, so next/font takes the opsz axis only with the full weight range.
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-source-serif-4',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-public-sans',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
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
