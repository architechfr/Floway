import type { Metadata, Viewport } from 'next';
import './globals.css';
import './timing.css';
import './journey.css';
import './context.css';
import './poi.css';
import './interactions.css';
import './visuals.css';
import './cinematic.css';
import './pwa.css';
import InteractionLayer from './interaction-layer';
import PwaInstall from './pwa-install';

export const metadata: Metadata = {
  title: 'Floway — Le meilleur arrêt sur votre route',
  description: 'Assistant d’itinéraire intelligent : stations, prix, recharge, trafic, pauses et estimation d’attente.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Floway',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Floway',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/floway-app-icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a2119',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        {children}
        <InteractionLayer />
        <PwaInstall />
      </body>
    </html>
  );
}
