import { NextRequest, NextResponse } from 'next/server';

type Point = [number, number];
type GeocodeFeature = { geometry?: { coordinates?: Point }; properties?: { label?: string } };
type FuelRecord = Record<string, unknown>;

const FUEL_DATASET = 'prix-des-carburants-en-france-flux-instantane-v2';
const FUEL_API = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${FUEL_DATASET}/records`;

async function geocode(query: string) {
  const url = new URL('https://data.geopf.fr/geocodage/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  url.searchParams.set('returntruegeometry', 'false');
  const response = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } });
  if (!response.ok) throw new Error('GEOCODING_FAILED');
  const data = (await response.json()) as { features?: GeocodeFeature[] };
  const feature = data.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates) throw new Error('PLACE_NOT_FOUND');
  return { lon: coordinates[0], lat: coordinates[1], label: feature?.properties?.label || query };
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

function sampleGeometry(coords: Point[], max = 14) {
  if (coords.length <= max) return coords;
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * (coords.length - 1) / (max - 1))]);
}

function pointFromRecord(record: FuelRecord): Point | null {
  const geom = record.geom as { lon?: number; lat?: number } | { coordinates?: Point } | undefined;
  if (geom && 'lon' in geom && 'lat' in geom && typeof geom.lon === 'number' && typeof geom.lat === 'number') return [geom.lon, geom.lat];
  if (geom && 'coordinates' in geom && Array.isArray(geom.coordinates)) return geom.coordinates as Point;
  const lon = Number(record.longitude);
  const lat = Number(record.latitude);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function fuelField(fuel: string) {
  const key = fuel.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key.includes('gazole')) return 'gazole_prix';
  if (key.includes('sp95e10') || key === 'e10') return 'e10_prix';
  if (key.includes('sp98')) return 'sp98_prix';
  if (key.includes('sp95')) return 'sp95_prix';
  if (key.includes('e85')) return 'e85_prix';
  return 'gazole_prix';
}

function parsePrice(record: FuelRecord, fuel: string) {
  const direct = Number(record[fuelField(fuel)]);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const raw = String(record.prix || '');
  const aliases = fuel.toLowerCase().includes('gazole') ? ['Gazole'] : fuel.toLowerCase().includes('e10') ? ['E10', 'SP95-E10'] : [fuel];
  for (const alias of aliases) {
    const match = raw.match(new RegExp(`${alias}[^0-9]{0,30}([0-9]+[.,][0-9]{2,3})`, 'i'));
    if (match) return Number(match[1].replace(',', '.'));
  }
  return null;
}

function serviceCategories(services: string[]) {
  const haystack = services.join(' ').toLowerCase();
  const categories: string[] = [];
  if (/restaur|sandwich|repas|fast.?food|snack/.test(haystack)) categories.push('Restauration');
  if (/cafe|café|boisson|bar/.test(haystack)) categories.push('Café');
  if (/boutique|shop|magasin|épicer|epicer/.test(haystack)) categories.push('Boutique');
  if (/toilet|sanitaire|wc/.test(haystack)) categories.push('Toilettes');
  if (/douche/.test(haystack)) categories.push('Douches');
  if (/wifi|wi-fi/.test(haystack)) categories.push('Wi-Fi');
  if (/borne|recharge|électrique|electrique/.test(haystack)) categories.push('Recharge VE');
  return categories;
}

function stopContext(date: Date) {
  const h = date.getHours();
  if (h >= 5 && h < 10) return { period: 'matin', intent: 'Petit-déjeuner / café', preferred: ['Café', 'Restauration', 'Toilettes'] };
  if (h >= 11 && h < 14) return { period: 'midi', intent: 'Déjeuner', preferred: ['Restauration', 'Toilettes', 'Boutique'] };
  if (h >= 18 && h < 21) return { period: 'soir', intent: 'Dîner', preferred: ['Restauration', 'Toilettes'] };
  if (h >= 21 || h < 5) return { period: 'nuit', intent: 'Pause nocturne', preferred: ['Café', 'Toilettes', 'Boutique'] };
  return { period: 'hors repas', intent: 'Pause / carburant', preferred: ['Café', 'Toilettes', 'Boutique'] };
}

async function fetchFuelStations(routeCoords: Point[], fuel: string, routeDurationMin: number, departureAt: Date) {
  const samples = sampleGeometry(routeCoords, 14);
  const responses = await Promise.all(samples.map(async ([lon, lat]) => {
    const url = new URL(FUEL_API);
    url.searchParams.set('limit', '50');
    url.searchParams.set('where', `within_distance(geom, geom'POINT(${lon} ${lat})', 28 km)`);
    const response = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 600 } });
    if (!response.ok) return [] as FuelRecord[];
    const data = await response.json() as { results?: FuelRecord[] };
    return data.results || [];
  }));

  const unique = new Map<string, FuelRecord>();
  for (const record of responses.flat()) unique.set(String(record.id || `${record.longitude}-${record.latitude}`), record);

  const cumulative: number[] = [0];
  for (let i = 1; i < routeCoords.length; i++) cumulative[i] = cumulative[i - 1] + haversineKm(routeCoords[i - 1], routeCoords[i]);
  const routeLengthKm = cumulative[cumulative.length - 1] || 1;

  const enriched = [...unique.values()].map(record => {
    const point = pointFromRecord(record);
    if (!point) return null;
    let nearestIndex = 0;
    let routeDistanceKm = Infinity;
    for (let i = 0; i < routeCoords.length; i++) {
      const d = haversineKm(point, routeCoords[i]);
      if (d < routeDistanceKm) { routeDistanceKm = d; nearestIndex = i; }
    }
    if (routeDistanceKm > 5) return null;
    const price = parsePrice(record, fuel);
    if (!price) return null;
    return { record, point, price, routeDistanceKm, distanceKm: Math.round(cumulative[nearestIndex] * 10) / 10 };
  }).filter(Boolean) as Array<{ record: FuelRecord; point: Point; price: number; routeDistanceKm: number; distanceKm: number }>;

  const prices = enriched.map(x => x.price).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;

  return enriched
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 60)
    .map((item, index) => {
      const services = String(item.record.services || '').split(/[,;|]/).map(s => s.trim()).filter(Boolean);
      const categories = serviceCategories(services);
      const progress = Math.max(0, Math.min(1, item.distanceKm / routeLengthKm));
      const arrivalDate = new Date(departureAt.getTime() + progress * routeDurationMin * 60_000);
      const context = stopContext(arrivalDate);
      const arrivalHour = arrivalDate.getHours();
      const arrivalMinute = arrivalDate.getMinutes();
      const peak = (arrivalHour >= 7 && arrivalHour <= 9) || (arrivalHour >= 17 && arrivalHour <= 19) ? 2 : 0;
      const mealPeak = ['midi', 'soir'].includes(context.period) ? 1 : 0;
      const weekend = [0, 6].includes(arrivalDate.getDay()) ? 1 : 0;
      const attractivePrice = median && item.price <= median - 0.03 ? 2 : median && item.price <= median ? 1 : 0;
      const busyServices = services.length >= 7 ? 1 : 0;
      const contextMatches = context.preferred.filter(category => categories.includes(category)).length;
      const contextFit = Math.min(3, contextMatches);
      const waitMin = Math.max(2, Math.min(12, 2 + peak + mealPeak + weekend + attractivePrice + busyServices));
      const detourMin = Math.max(1, Math.round(item.routeDistanceKm * 1.8));
      const name = String(item.record.ville || item.record.adresse || `Station ${index + 1}`);
      return {
        id: String(item.record.id || index),
        name,
        address: String(item.record.adresse || ''),
        city: String(item.record.ville || ''),
        motorway: 'Sur itinéraire',
        distanceKm: item.distanceKm,
        routeOffsetKm: Math.round(item.routeDistanceKm * 10) / 10,
        price: Math.round(item.price * 1000) / 1000,
        waitMin,
        detourMin,
        lat: item.point[1],
        lon: item.point[0],
        services: services.slice(0, 12),
        serviceCategories: categories,
        arrivalHour,
        arrivalMinute,
        arrivalIso: arrivalDate.toISOString(),
        smartContext: {
          period: context.period,
          intent: context.intent,
          preferredServices: context.preferred,
          contextFit,
          message: context.period === 'nuit'
            ? 'À cette heure, Floway privilégie les services utiles la nuit plutôt qu’un repas classique.'
            : `À cette heure, Floway privilégie : ${context.intent.toLowerCase()}.`,
        },
        flowayContextScore: contextFit * 4,
        waitModel: {
          label: 'Estimation IA Floway',
          confidence: services.length >= 4 ? 'moyenne' : 'exploratoire',
          factors: [
            `arrivée estimée vers ${String(arrivalHour).padStart(2, '0')}h${String(arrivalMinute).padStart(2, '0')}`,
            `contexte voyage : ${context.intent}`,
            contextMatches ? `${contextMatches} service(s) adapté(s) à cette heure` : 'services horaires à enrichir',
            attractivePrice ? 'prix attractif donc demande potentielle plus forte' : 'prix proche du marché',
            weekend ? 'effet week-end' : 'jour ouvré',
          ],
        },
        sources: {
          station: 'Prix des carburants - Ministère de l’Économie',
          priceFreshness: 'flux instantané officiel',
          wait: 'modèle Floway v0 (estimation, non mesure terrain)',
        },
      };
    });
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.searchParams.get('origin')?.trim();
  const destination = request.nextUrl.searchParams.get('destination')?.trim();
  const fuel = request.nextUrl.searchParams.get('fuel')?.trim() || 'Gazole';
  const departureParam = request.nextUrl.searchParams.get('departureAt');
  const parsedDeparture = departureParam ? new Date(departureParam) : new Date();
  const departureAt = Number.isNaN(parsedDeparture.getTime()) ? new Date() : parsedDeparture;
  if (!origin || !destination) return NextResponse.json({ error: 'Départ et destination requis.' }, { status: 400 });

  try {
    const [from, to] = await Promise.all([geocode(origin), geocode(destination)]);
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=false&steps=false&overview=full&geometries=geojson`;
    const routingResponse = await fetch(osrmUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!routingResponse.ok) throw new Error('ROUTING_FAILED');
    const routing = await routingResponse.json();
    const route = routing.routes?.[0];
    if (!route) throw new Error('NO_ROUTE');
    const coords = route.geometry?.coordinates as Point[] | undefined;
    if (!coords?.length) throw new Error('NO_GEOMETRY');
    const durationMin = Math.round(route.duration / 60);
    const stations = await fetchFuelStations(coords, fuel, durationMin, departureAt);
    return NextResponse.json({
      origin: { label: from.label, lat: from.lat, lon: from.lon },
      destination: { label: to.label, lat: to.lat, lon: to.lon },
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin,
      departureAt: departureAt.toISOString(),
      arrivalAt: new Date(departureAt.getTime() + durationMin * 60_000).toISOString(),
      geometry: route.geometry,
      stations,
      fuel,
      providers: {
        geocoding: 'Géoplateforme / Base Adresse Nationale',
        routing: 'OSRM / OpenStreetMap',
        fuel: 'Ministère de l’Économie - flux instantané prix carburants',
        ai: 'Floway Context Engine v0.1',
      },
      traffic: {
        liveConnected: false,
        availableSource: 'Bison Futé / DATEX II',
        nextStep: 'brancher événements, vitesses et temps de parcours RRN',
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    const message = code === 'PLACE_NOT_FOUND' ? 'Une des adresses n’a pas été trouvée.' : 'Impossible de calculer cet itinéraire pour le moment.';
    return NextResponse.json({ error: message, code }, { status: 502 });
  }
}
