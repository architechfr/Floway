import { NextRequest, NextResponse } from 'next/server';

import { timeoutFetch, SLOW_TIMEOUT_MS } from '../_lib/http';

// Masque le `fetch` global pour ce module : tout appel sortant est abandonné
// automatiquement au-delà du délai, sans modifier les points d'appel.
const fetch = timeoutFetch(SLOW_TIMEOUT_MS);

type Point = [number, number];
type GeocodeFeature = { geometry?: { coordinates?: Point }; properties?: { label?: string } };
type OsmElement = { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

async function geocode(query: string) {
  const url = new URL('https://data.geopf.fr/geocodage/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } });
  if (!response.ok) throw new Error('GEOCODING_FAILED');
  const data = (await response.json()) as { features?: GeocodeFeature[] };
  const feature = data.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!coords) throw new Error('PLACE_NOT_FOUND');
  return { lon: coords[0], lat: coords[1], label: feature?.properties?.label || query };
}

function haversineKm(a: Point, b: Point) {
  const toRad = (n: number) => n * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function sampleGeometry(coords: Point[], max = 10) {
  if (coords.length <= max) return coords;
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * (coords.length - 1) / (max - 1))]);
}

function parsePowerKw(tags: Record<string, string>) {
  const candidates = Object.entries(tags)
    .filter(([key]) => /output|power|capacity/.test(key))
    .map(([, value]) => value)
    .join(' ');
  const values = [...candidates.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kW|kw)/g)].map(match => Number(match[1].replace(',', '.')));
  if (values.length) return Math.max(...values);
  if (tags['socket:ccs'] || tags['socket:chademo']) return 100;
  return 22;
}

function chargerCount(tags: Record<string, string>) {
  const capacity = Number(tags.capacity);
  if (Number.isFinite(capacity) && capacity > 0) return capacity;
  let total = 0;
  for (const [key, value] of Object.entries(tags)) {
    if (!key.startsWith('socket:')) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) total += numeric;
  }
  return total || 1;
}

async function fetchChargers(routeCoords: Point[]) {
  const samples = sampleGeometry(routeCoords, 10);
  const union = samples.map(([lon, lat]) => `nwr(around:12000,${lat},${lon})[\"amenity\"=\"charging_station\"];`).join('\n');
  const query = `[out:json][timeout:25];(${union});out center tags;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json' },
    body: new URLSearchParams({ data: query }).toString(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('CHARGERS_FAILED');
  const data = (await response.json()) as { elements?: OsmElement[] };
  return data.elements || [];
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.searchParams.get('origin')?.trim();
  const destination = request.nextUrl.searchParams.get('destination')?.trim();
  const batteryKwh = Number(request.nextUrl.searchParams.get('batteryKwh') || '75');
  const consumption = Number(request.nextUrl.searchParams.get('consumption') || '18');
  const startSoc = Number(request.nextUrl.searchParams.get('startSoc') || '80');
  const reserveSoc = Number(request.nextUrl.searchParams.get('reserveSoc') || '15');
  const targetSoc = Number(request.nextUrl.searchParams.get('targetSoc') || '75');
  if (!origin || !destination) return NextResponse.json({ error: 'Départ et destination requis.' }, { status: 400 });

  try {
    const [from, to] = await Promise.all([geocode(origin), geocode(destination)]);
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=false&steps=false&overview=full&geometries=geojson`;
    const routingResponse = await fetch(osrmUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!routingResponse.ok) throw new Error('ROUTING_FAILED');
    const routing = await routingResponse.json();
    const route = routing.routes?.[0];
    const coords = route?.geometry?.coordinates as Point[] | undefined;
    if (!route || !coords?.length) throw new Error('NO_ROUTE');

    const cumulative: number[] = [0];
    for (let i = 1; i < coords.length; i++) cumulative[i] = cumulative[i - 1] + haversineKm(coords[i - 1], coords[i]);
    const routeLengthKm = cumulative[cumulative.length - 1] || route.distance / 1000;

    const rawChargers = await fetchChargers(coords);
    const unique = new Map<number, OsmElement>();
    rawChargers.forEach(element => unique.set(element.id, element));

    const chargers = [...unique.values()].map(element => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (lat == null || lon == null) return null;
      const point: Point = [lon, lat];
      let nearestIndex = 0;
      let routeOffsetKm = Infinity;
      for (let i = 0; i < coords.length; i++) {
        const d = haversineKm(point, coords[i]);
        if (d < routeOffsetKm) { routeOffsetKm = d; nearestIndex = i; }
      }
      if (routeOffsetKm > 8) return null;
      const tags = element.tags || {};
      const powerKw = parsePowerKw(tags);
      const count = chargerCount(tags);
      return {
        id: String(element.id),
        name: tags.name || tags.operator || tags.brand || 'Station de recharge',
        operator: tags.operator || tags.brand || 'Opérateur non renseigné',
        distanceKm: Math.round(cumulative[nearestIndex] * 10) / 10,
        routeOffsetKm: Math.round(routeOffsetKm * 10) / 10,
        lat,
        lon,
        powerKw,
        count,
        fast: powerKw >= 100,
        openingHours: tags.opening_hours || null,
        fee: tags.fee || null,
        access: tags.access || null,
        sockets: Object.keys(tags).filter(key => key.startsWith('socket:') && !key.includes(':output')).map(key => key.replace('socket:', '')),
      };
    }).filter(Boolean) as Array<{ id: string; name: string; operator: string; distanceKm: number; routeOffsetKm: number; lat: number; lon: number; powerKw: number; count: number; fast: boolean; openingHours: string | null; fee: string | null; access: string | null; sockets: string[] }>;

    chargers.sort((a, b) => a.distanceKm - b.distanceKm);

    const usableStartKwh = Math.max(0, (startSoc - reserveSoc) / 100 * batteryKwh);
    const rangeBeforeReserveKm = consumption > 0 ? usableStartKwh / consumption * 100 : 0;
    const targetDistance = Math.min(routeLengthKm, Math.max(40, rangeBeforeReserveKm * 0.82));
    const recommendationPool = chargers.filter(c => c.distanceKm >= Math.max(20, targetDistance - 70) && c.distanceKm <= targetDistance + 55);
    const best = [...(recommendationPool.length ? recommendationPool : chargers)].sort((a, b) => {
      const scoreA = Math.abs(a.distanceKm - targetDistance) + a.routeOffsetKm * 12 - Math.min(a.powerKw, 350) / 8 - Math.min(a.count, 20) * 1.5;
      const scoreB = Math.abs(b.distanceKm - targetDistance) + b.routeOffsetKm * 12 - Math.min(b.powerKw, 350) / 8 - Math.min(b.count, 20) * 1.5;
      return scoreA - scoreB;
    })[0] || null;

    let recommendation = null;
    if (best) {
      const usedKwh = best.distanceKm / 100 * consumption;
      const arrivalKwh = Math.max(0, startSoc / 100 * batteryKwh - usedKwh);
      const arrivalSoc = Math.max(0, Math.min(100, arrivalKwh / batteryKwh * 100));
      const energyToTarget = Math.max(0, (targetSoc - arrivalSoc) / 100 * batteryKwh);
      const effectivePower = Math.max(11, Math.min(best.powerKw, 180));
      const chargeMinutes = Math.max(8, Math.round(energyToTarget / effectivePower * 60 * 1.18));
      recommendation = { ...best, arrivalSoc: Math.round(arrivalSoc), targetSoc, chargeMinutes, energyKwh: Math.round(energyToTarget * 10) / 10 };
    }

    return NextResponse.json({
      origin: from,
      destination: to,
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
      geometry: route.geometry,
      vehicle: { batteryKwh, consumption, startSoc, reserveSoc, targetSoc, rangeBeforeReserveKm: Math.round(rangeBeforeReserveKm) },
      chargers: chargers.slice(0, 80),
      recommendation,
      providers: { geocoding: 'Géoplateforme', routing: 'OSRM / OpenStreetMap', charging: 'OpenStreetMap / Overpass', nextDataSource: 'Base nationale IRVE statique + dynamique' },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    const message = code === 'PLACE_NOT_FOUND' ? 'Une des adresses n’a pas été trouvée.' : 'Impossible de calculer le trajet électrique pour le moment.';
    return NextResponse.json({ error: message, code }, { status: 502 });
  }
}
