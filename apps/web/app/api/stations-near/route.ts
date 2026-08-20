import { NextRequest, NextResponse } from 'next/server';

import { timeoutFetch } from '../_lib/http';
import { cats, haversine, point, price, serviceList, type FuelRecord } from '../_lib/stations';
import { stationOpeningHours } from '../../../../../packages/algorithms/fuel-station-hours.mjs';

// Masque le `fetch` global pour ce module : tout appel sortant est abandonné
// automatiquement au-delà du délai.
const fetch = timeoutFetch();

const DATASET = 'prix-des-carburants-en-france-flux-instantane-v2';
const API = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;

/** Au-delà, ce n'est plus « avant de partir », c'est un détour. */
const RAYON_MAX_KM = 20;
const RAYON_DEFAUT_KM = 8;

/**
 * Stations autour d'un point, pour faire le plein avant de prendre la route.
 *
 * `/api/route` ne renvoie que les stations du couloir de l'itinéraire, à partir
 * du premier kilomètre. Or quand le réservoir ne suffit pas, ce que veut
 * l'utilisateur n'est pas la première station *sur* la route : c'est celle
 * d'à côté de chez lui, avant de partir. C'est une recherche par rayon, pas
 * par couloir — d'où cette route distincte.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lon = Number(req.nextUrl.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'Coordonnées de départ manquantes.' }, { status: 400 });
  }

  const rayonDemande = Number(req.nextUrl.searchParams.get('radius'));
  const rayon = Number.isFinite(rayonDemande)
    ? Math.min(RAYON_MAX_KM, Math.max(1, rayonDemande))
    : RAYON_DEFAUT_KM;
  const carburant = req.nextUrl.searchParams.get('fuel') || 'Gazole';

  try {
    const u = new URL(API);
    u.searchParams.set('limit', '60');
    u.searchParams.set('where', `within_distance(geom, geom'POINT(${lon} ${lat})', ${rayon} km)`);
    const r = await fetch(u, { headers: { Accept: 'application/json' }, next: { revalidate: 600 } });
    if (!r.ok) throw new Error(`NEAR_${r.status}`);
    const d = (await r.json()) as { results?: FuelRecord[] };

    const stations = (d.results || [])
      .map((record) => {
        const p = point(record);
        const prix = price(record, carburant);
        // Sans position ni prix pour le carburant demandé, la station ne peut
        // ni être placée ni être comparée : on ne la propose pas.
        if (!p || !prix) return null;
        const services = serviceList(record);
        return {
          id: String(record.id || ''),
          name: String(record.ville || record.adresse || 'Station'),
          address: String(record.adresse || ''),
          city: String(record.ville || ''),
          lat: p[1],
          lon: p[0],
          price: Math.round(prix * 1000) / 1000,
          detourKm: Math.round(haversine([lon, lat], p) * 10) / 10,
          services: services.slice(0, 12),
          serviceCategories: cats(services),
          highway: String(record.pop || '').toUpperCase() === 'A',
          openingHours: stationOpeningHours(record.horaires, record.horaires_automate_24_24),
        };
      })
      .filter(Boolean) as Array<{ detourKm: number; price: number }>;

    // Le plus proche d'abord, à prix égal ; le moins cher départage à distance
    // comparable. Un kilomètre de détour vaut environ trois centimes au litre.
    stations.sort((a, b) => a.detourKm * 0.03 + a.price - (b.detourKm * 0.03 + b.price));

    return NextResponse.json({
      source: 'Ministère de l’Économie — Prix des carburants en France',
      official: true,
      fuel: carburant,
      radiusKm: rayon,
      stations: stations.slice(0, 12),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'NEAR_LOOKUP_ERROR' },
      { status: 502 },
    );
  }
}
