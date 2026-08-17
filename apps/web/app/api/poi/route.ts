import { NextRequest, NextResponse } from 'next/server';

type Poi = {
  id: string;
  name: string;
  category: 'restaurant' | 'fast_food' | 'cafe' | 'shop';
  brand?: string;
  cuisine?: string;
  openingHours?: string;
  lat: number;
  lon: number;
  distanceM: number;
  status: 'open' | 'closed' | 'unknown' | '24_7';
  statusLabel: string;
};

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function minutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function simpleOpeningStatus(openingHours: string | undefined, arrivalAt: Date) {
  if (!openingHours) return { status: 'unknown' as const, label: 'Horaires à confirmer' };
  if (openingHours.trim() === '24/7') return { status: '24_7' as const, label: 'Ouvert 24/7' };

  const clock = arrivalAt.getHours() * 60 + arrivalAt.getMinutes();
  const ranges = [...openingHours.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];
  if (!ranges.length) return { status: 'unknown' as const, label: openingHours };

  const open = ranges.some(match => {
    const start = minutes(match[1]);
    const end = minutes(match[2]);
    if (start == null || end == null) return false;
    if (end >= start) return clock >= start && clock <= end;
    return clock >= start || clock <= end;
  });

  return open
    ? { status: 'open' as const, label: 'Probablement ouvert à votre passage' }
    : { status: 'closed' as const, label: 'Probablement fermé à votre passage' };
}

function categoryFrom(tags: Record<string, string>) {
  const amenity = tags.amenity;
  if (amenity === 'restaurant') return 'restaurant' as const;
  if (amenity === 'fast_food') return 'fast_food' as const;
  if (amenity === 'cafe') return 'cafe' as const;
  return 'shop' as const;
}

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get('lat'));
  const lon = Number(request.nextUrl.searchParams.get('lon'));
  const arrivalRaw = request.nextUrl.searchParams.get('arrivalAt');
  const arrivalAt = arrivalRaw ? new Date(arrivalRaw) : new Date();

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'Coordonnées invalides.' }, { status: 400 });
  }

  const query = `[out:json][timeout:8];(nwr(around:1800,${lat},${lon})[amenity~"restaurant|fast_food|cafe"];nwr(around:1800,${lat},${lon})[shop~"convenience|bakery|supermarket|kiosk"];);out center tags;`;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
        'User-Agent': 'Floway-client-showcase/0.1',
      },
      body: new URLSearchParams({ data: query }),
      next: { revalidate: 1800 },
    });

    if (!response.ok) throw new Error('OVERPASS_UNAVAILABLE');
    const data = await response.json() as { elements?: OverpassElement[] };

    const pois: Poi[] = (data.elements || [])
      .map(element => {
        const tags = element.tags || {};
        const poiLat = element.lat ?? element.center?.lat;
        const poiLon = element.lon ?? element.center?.lon;
        if (!Number.isFinite(poiLat) || !Number.isFinite(poiLon)) return null;
        const name = tags.name || tags.brand || (tags.amenity === 'cafe' ? 'Café' : tags.shop ? 'Commerce' : 'Restaurant');
        const opening = simpleOpeningStatus(tags.opening_hours, arrivalAt);
        return {
          id: `${element.type}-${element.id}`,
          name,
          category: categoryFrom(tags),
          brand: tags.brand,
          cuisine: tags.cuisine,
          openingHours: tags.opening_hours,
          lat: poiLat as number,
          lon: poiLon as number,
          distanceM: haversineM(lat, lon, poiLat as number, poiLon as number),
          status: opening.status,
          statusLabel: opening.label,
        } satisfies Poi;
      })
      .filter(Boolean)
      .sort((a, b) => {
        const priority = { '24_7': 0, open: 1, unknown: 2, closed: 3 } as const;
        const statusDiff = priority[(a as Poi).status] - priority[(b as Poi).status];
        return statusDiff || (a as Poi).distanceM - (b as Poi).distanceM;
      })
      .slice(0, 18) as Poi[];

    return NextResponse.json({
      arrivalAt: Number.isNaN(arrivalAt.getTime()) ? null : arrivalAt.toISOString(),
      radiusM: 1800,
      pois,
      summary: {
        restaurants: pois.filter(p => p.category === 'restaurant' || p.category === 'fast_food').length,
        cafes: pois.filter(p => p.category === 'cafe').length,
        shops: pois.filter(p => p.category === 'shop').length,
        likelyOpen: pois.filter(p => p.status === 'open' || p.status === '24_7').length,
      },
      provider: 'OpenStreetMap / Overpass API',
      note: 'Les horaires OSM peuvent être incomplets. Floway les utilise comme signal de contexte, pas comme garantie contractuelle.',
    });
  } catch {
    return NextResponse.json({
      pois: [],
      summary: { restaurants: 0, cafes: 0, shops: 0, likelyOpen: 0 },
      provider: 'OpenStreetMap / Overpass API',
      degraded: true,
      note: 'Source POI temporairement indisponible.',
    });
  }
}
