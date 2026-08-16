import { NextRequest, NextResponse } from 'next/server';

type GeocodeFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { label?: string };
};

async function geocode(query: string) {
  const url = new URL('https://data.geopf.fr/geocodage/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  url.searchParams.set('returntruegeometry', 'false');

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 },
  });

  if (!response.ok) throw new Error('GEOCODING_FAILED');
  const data = (await response.json()) as { features?: GeocodeFeature[] };
  const feature = data.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates) throw new Error('PLACE_NOT_FOUND');

  return {
    lon: coordinates[0],
    lat: coordinates[1],
    label: feature?.properties?.label || query,
  };
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.searchParams.get('origin')?.trim();
  const destination = request.nextUrl.searchParams.get('destination')?.trim();

  if (!origin || !destination) {
    return NextResponse.json({ error: 'Départ et destination requis.' }, { status: 400 });
  }

  try {
    const [from, to] = await Promise.all([geocode(origin), geocode(destination)]);
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=false&steps=false&overview=simplified&geometries=geojson`;
    const routingResponse = await fetch(osrmUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!routingResponse.ok) throw new Error('ROUTING_FAILED');
    const routing = await routingResponse.json();
    const route = routing.routes?.[0];
    if (!route) throw new Error('NO_ROUTE');

    return NextResponse.json({
      origin: { label: from.label, lat: from.lat, lon: from.lon },
      destination: { label: to.label, lat: to.lat, lon: to.lon },
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
      geometry: route.geometry,
      providers: {
        geocoding: 'Géoplateforme / Base Adresse Nationale',
        routing: 'OSRM / OpenStreetMap',
      },
      liveTraffic: false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    const message = code === 'PLACE_NOT_FOUND'
      ? 'Une des adresses n’a pas été trouvée.'
      : 'Impossible de calculer cet itinéraire pour le moment.';
    return NextResponse.json({ error: message, code }, { status: 502 });
  }
}
