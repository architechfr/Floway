import type { Metadata } from 'next';
import './globals.css';
import './details.css';

export const metadata: Metadata = {
  title: 'Floway — Le meilleur arrêt sur votre route',
  description: 'Comparez les prochaines stations selon la distance, le prix et l’attente estimée.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
