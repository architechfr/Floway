import type { Metadata, Viewport } from 'next';
import './globals.css';
import './pwa.css';
import './floway-v3.css';
import './floway-live.css';
import './logic-v4.css';
import './road-navigation.css';
import PwaInstall from './pwa-install';
import { FlowayStoreProvider } from './state/floway-store';

export const metadata: Metadata = {
  title: 'Floway — Le meilleur arrêt sur votre route',
  description: 'Assistant d’itinéraire intelligent : stations, prix, recharge, trafic, pauses et estimation d’attente.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Floway',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Floway' },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: '/floway-app-icon.svg', type: 'image/svg+xml' }], apple: [{ url: '/floway-app-icon.svg', type: 'image/svg+xml' }] },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#05090c' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Fin de la phase 1 : plus aucun layer DOM. Le store enveloppe la page, et
  // `PwaInstall` est un composant a part entiere.
  return <html lang="fr"><body>
    <FlowayStoreProvider>
      {children}
      <PwaInstall />
    </FlowayStoreProvider>
  </body></html>;
}
