import { NextRequest, NextResponse } from 'next/server';

import { clientIp, rateLimit, requireTrustedCaller, timeoutFetch, tooManyRequests } from '../_lib/http';

const fetch = timeoutFetch();

/**
 * Enseignes des stations, par lot.
 *
 * Le flux du ministère ne porte **aucune marque** : ses champs sont id,
 * latitude, longitude, cp, pop, adresse, ville, horaires, services, prix,
 * geom, et les prix et dates par carburant. Vérifié sur le catalogue de
 * l'API. Or l'enseigne décide de l'arrêt pour qui possède une carte
 * carburant — Total, Avia, Esso — et c'est la première chose qu'on cherche
 * dans une liste.
 *
 * `/api/station-details` sait déjà lire l'enseigne chez TomTom, mais une
 * station à la fois, à l'ouverture de la fiche. Cette route fait le même
 * travail pour une poignée de stations d'un coup, afin que les listes
 * puissent l'afficher sans une requête par ligne.
 *
 * Ce qui manque reste dit : une station sans enseigne trouvée rend `null`,
 * jamais un nom deviné à partir de son adresse.
 */

/**
 * Plafond de stations par appel.
 *
 * Chaque station coûte un appel TomTom : le lot est volontairement petit et
 * réservé aux étapes du voyage, pas à la liste entière.
 */
const MAX_POINTS = 6;

/** Une station-service voisine au-delà n'est plus la même station. */
const RAYON_M = 400;

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 40;

type PoiResult = {
  dist?: number;
  poi?: { name?: string; categories?: string[]; brands?: Array<{ name?: string }> };
};

/**
 * Reconnaît une station-service dans un résultat TomTom.
 *
 * Même prédicat que `/api/station-details`, éprouvé en production. On
 * n'emploie pas `categorySet` : la documentation confirme le paramètre mais la
 * page des codes ne donne pas le numéro de la catégorie « petrol station »,
 * et un code inventé filtrerait silencieusement tous les résultats.
 */
function estStation(p: PoiResult) {
  const texte = `${p.poi?.name || ''} ${(p.poi?.categories || []).join(' ')}`.toLowerCase();
  return /(petrol|fuel|gas station|station-service|station service|carburant)/.test(texte);
}

async function enseigne(key: string, lat: number, lon: number) {
  const u = new URL('https://api.tomtom.com/search/2/nearbySearch/.json');
  u.searchParams.set('key', key);
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('lon', String(lon));
  u.searchParams.set('radius', String(RAYON_M));
  u.searchParams.set('limit', '20');
  u.searchParams.set('countrySet', 'FR');
  u.searchParams.set('language', 'fr-FR');
  // Les enseignes bougent peu : une journée de cache évite de repayer le même
  // appel à chaque calcul d'itinéraire.
  const r = await fetch(u, { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } });
  if (!r.ok) return null;
  const d = (await r.json()) as { results?: PoiResult[] };
  const stations = (d.results || [])
    .filter(estStation)
    .sort((a, b) => (a.dist || 99999) - (b.dist || 99999));
  const proche = stations[0];
  if (!proche) return null;
  const marque = proche.poi?.brands?.[0]?.name?.trim() || null;
  const nom = proche.poi?.name?.trim() || null;
  // Sans marque déclarée, le nom du point d'intérêt ne la remplace pas : il
  // vaut souvent l'adresse, et l'afficher comme une enseigne serait faux.
  return marque ? { brand: marque, poiName: nom, distanceM: Math.round(proche.dist || 0) } : null;
}

export async function POST(req: NextRequest) {
  const refus = requireTrustedCaller(req);
  if (refus) return refus;

  const quota = rateLimit(`brands:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!quota.ok) return tooManyRequests(quota.retryAfterSeconds);

  let corps: { points?: Array<{ id?: string; lat?: number; lon?: number }> };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps illisible.' }, { status: 400 });
  }

  const points = (corps.points || [])
    .filter(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        Math.abs(p.lat as number) <= 90 &&
        Math.abs(p.lon as number) <= 180,
    )
    .slice(0, MAX_POINTS) as Array<{ id: string; lat: number; lon: number }>;

  if (!points.length) return NextResponse.json({ error: 'Aucun point exploitable.' }, { status: 400 });

  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    return NextResponse.json({
      provider: { name: 'TomTom Search', connected: false },
      brands: {},
      message: 'Enseignes indisponibles : TOMTOM_API_KEY non configurée.',
    });
  }

  const trouvees = await Promise.all(
    points.map(async (p) => {
      try {
        return [p.id, await enseigne(key, p.lat, p.lon)] as const;
      } catch {
        // Une station qui échoue ne doit pas priver les autres de leur
        // enseigne : elle rend simplement null.
        return [p.id, null] as const;
      }
    }),
  );

  return NextResponse.json({
    provider: { name: 'TomTom Search', connected: true, updatedAt: new Date().toISOString() },
    source: 'TomTom Search — enseigne absente du flux du ministère',
    brands: Object.fromEntries(trouvees),
  });
}
