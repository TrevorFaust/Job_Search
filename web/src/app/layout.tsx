import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import { Providers } from '@/components/Providers';
import './globals.css';

// Fraunces is loaded from Google in the document head. next/font splits this
// family into several files, and Vercel's build rejects that with
// "next/font/google queries have exactly one entry".
const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600;1,9..144,700&display=swap';

const body = Figtree({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Hustle Hunter',
  description: 'Daily job digests matched to your filters',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href={FRAUNCES_HREF} rel="stylesheet" />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
