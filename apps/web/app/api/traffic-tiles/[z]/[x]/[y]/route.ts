import { NextRequest, NextResponse } from 'next/server';

import { timeoutFetch } from '../../../../_lib/http';

const fetch = timeoutFetch();

/**
 * Relais des tuiles de trafic TomTom.
 *
 * Pourquoi un relais plutôt qu'une URL directe dans la page : l'URL d'une
 * tuile porte la clé d'API. La mettre dans le `src` d'une balise `img`
 * publierait la clé du projet à tous les visiteurs. Elle reste donc côté
 * serveur, et le navigateur n'appelle que cette route.
 *
 * Format vérifié dans la documentation TomTom (Traffic API, Raster Flow
 * Tiles), pas supposé :
 *
 *   https://api.tomtom.com/traffic/map/4/tile/flow/{style}/{z}/{x}/{y}.png
 *     ?key={clé}&tileSize={256|512}
 *
 * Styles documentés : absolute, relative, relative0, relative0-dark,
 * relative-delay, reduced-sensitivity. `relative0-dark` est retenu : il donne
 * la vitesse relative à la fluidité — la lecture attendue d'une carte de
 * trafic — sur un fond sombre, celui de l'application.
 */
const STYLE = 'relative0-dark';
const VERSION = 4;
const TAILLE_TUILE = 256;

/** Bornes documentées du pavage. Au-delà, TomTom refuse la requête. */
const ZOOM_MAX = 22;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params;
  const zoom = Number(z);
  const col = Number(x);
  const row = Number(y);

  // Validation stricte : cette route relaie vers un tiers, elle ne doit pas
  // pouvoir servir de proxy ouvert. Seuls des entiers dans les bornes du
  // pavage passent.
  const entier = (n: number) => Number.isInteger(n) && n >= 0;
  const limite = Number.isInteger(zoom) && zoom >= 0 && zoom <= ZOOM_MAX ? 2 ** zoom : 0;
  if (!entier(zoom) || zoom > ZOOM_MAX || !entier(col) || !entier(row) || col >= limite || row >= limite) {
    return NextResponse.json({ error: 'Tuile hors bornes.' }, { status: 400 });
  }

  const cle = process.env.TOMTOM_API_KEY;
  // L'absence de clé est dite, pas masquée par une tuile vide : l'interface
  // doit pouvoir afficher « trafic non connecté » plutôt qu'un calque muet.
  if (!cle) {
    return NextResponse.json({ error: 'TRAFFIC_KEY_MISSING' }, { status: 503 });
  }

  const url = new URL(
    `https://api.tomtom.com/traffic/map/${VERSION}/tile/flow/${STYLE}/${zoom}/${col}/${row}.png`,
  );
  url.searchParams.set('key', cle);
  url.searchParams.set('tileSize', String(TAILLE_TUILE));

  try {
    // Le trafic bouge en continu : une minute de cache suffit à absorber le
    // pavage d'un écran sans servir une situation périmée.
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (!r.ok) return NextResponse.json({ error: `TRAFFIC_TILE_${r.status}` }, { status: 502 });
    const image = await r.arrayBuffer();
    return new NextResponse(image, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'TRAFFIC_TILE_ERROR' },
      { status: 502 },
    );
  }
}
