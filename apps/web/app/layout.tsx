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
import './live-copilot.css';
import './motorway-navigation.css';
import './quick-fuel.css';
import './safety-alert.css';
import './saved-places.css';
import InteractionLayer from './interaction-layer';
import PwaInstall from './pwa-install';
import StationEnrichmentLayer from './station-enrichment-layer';
import RoutePriceLayer from './route-price-layer';
import StationFuelLayer from './station-fuel-layer';
import SpeedLimitLayer from './speed-limit-layer';
import LiveCopilotLayer from './live-copilot-layer';
import SessionRestoreLayer from './session-restore-layer';
import CurrentLocationOrigin from './current-location-origin';
import QuickFuelLayer from './quick-fuel-layer';
import SafetyAlertLayer from './safety-alert-layer';
import SavedPlacesLayer from './saved-places-layer';

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
  return <html lang="fr"><body>
    {children}
    <InteractionLayer />
    <SessionRestoreLayer />
    <CurrentLocationOrigin />
    <SavedPlacesLayer />
    <QuickFuelLayer />
    <StationEnrichmentLayer />
    <RoutePriceLayer />
    <StationFuelLayer />
    <SpeedLimitLayer />
    <LiveCopilotLayer />
    <SafetyAlertLayer />
    <PwaInstall />
  </body></html>;
}
