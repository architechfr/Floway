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
import './premium-v2.css';
import './premium-home.css';
import './floway-v3.css';
import './floway-live.css';
import './logic-v4.css';
import './station-enrichment.css';
import './route-price.css';
import './station-fuel-layer.css';
import './dynamic-reference.css';
import './road-navigation.css';
import './quick-fuel.css';
import './saved-places.css';
import InteractionLayer from './interaction-layer';
import PwaInstall from './pwa-install';
import StationEnrichmentLayer from './station-enrichment-layer';
import RoutePriceLayer from './route-price-layer';
import StationFuelLayer from './station-fuel-layer';
import SessionRestoreLayer from './session-restore-layer';
import QuickFuelLayer from './quick-fuel-layer';
import SavedPlacesLayer from './saved-places-layer';
import NumericInputFix from './numeric-input-fix';
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
  // FlowayStoreProvider enveloppe toute l'application : les layers restants
  // y puiseront leur etat au fur et a mesure de leur migration (phase 1).
  return <html lang="fr"><body>
    <FlowayStoreProvider>
      {children}
      <InteractionLayer />
      <SessionRestoreLayer />
      <SavedPlacesLayer />
      <NumericInputFix />
      <QuickFuelLayer />
      <StationEnrichmentLayer />
      <RoutePriceLayer />
      <StationFuelLayer />
      <PwaInstall />
    </FlowayStoreProvider>
  </body></html>;
}
