import type { Metadata } from 'next';
import './globals.css';
import './timing.css';
import './journey.css';
import './context.css';

export const metadata: Metadata = {
  title: 'Floway — Le meilleur arrêt sur votre route',
  description: 'Assistant d’itinéraire intelligent : stations, prix, trafic et estimation d’attente.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
