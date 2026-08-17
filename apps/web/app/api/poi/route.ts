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

type AiInsight = {
  headline: string;
  recommendation: string;
  reasoning: string[];
  warning: string;
  confidence: number;
  suggestedIntent: string;
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

async function askMistral(arrivalAt: Date, pois: Poi[]): Promise<AiInsight | null> {
  const apiKey = process.env.mistralfloway || process.env.MISTRAL_API_KEY;
  if (!apiKey || !pois.length) return null;

  const context = {
    arrivalAt: Number.isNaN(arrivalAt.getTime()) ? null : arrivalAt.toISOString(),
    pois: pois.slice(0, 10).map(poi => ({
      name: poi.name,
      category: poi.category,
      brand: poi.brand,
      cuisine: poi.cuisine,
      distanceM: poi.distanceM,
      status: poi.status,
      statusLabel: poi.statusLabel,
      openingHours: poi.openingHours,
    })),
  };

  const system = `Tu es Floway AI, un assistant automobile français. Analyse uniquement les données fournies. N'invente jamais un commerce, un horaire ou une disponibilité. Ton objectif est d'expliquer si cet arrêt est pertinent à l'heure de passage, surtout pour repas, café, pause ou services. Réponds uniquement en JSON valide avec exactement : {"headline":"","recommendation":"","reasoning":["","",""],"warning":"","confidence":0,"suggestedIntent":"carburant|cafe|repas|pause|services|autre"}. confidence est un entier de 0 à 100.`;

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        temperature: 0.2,
        max_tokens: 350,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Analyse cet arrêt Floway : ${JSON.stringify(context)}` },
        ],
      }),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as AiInsight;
    return {
      headline: String(parsed.headline || 'Analyse Floway AI'),
      recommendation: String(parsed.recommendation || ''),
      reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning.slice(0, 3).map(String) : [],
      warning: String(parsed.warning || ''),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      suggestedIntent: String(parsed.suggestedIntent || 'autre'),
    };
  } catch {
    return null;
  }
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

    const ai = await askMistral(arrivalAt, pois);
    const defaultNote = 'Les horaires OSM peuvent être incomplets. Floway les utilise comme signal de contexte, pas comme garantie contractuelle.';
    const aiNote = ai
      ? `FLOWAY AI — ${ai.headline}. ${ai.recommendation}${ai.reasoning.length ? ` · ${ai.reasoning.join(' · ')}` : ''}${ai.warning ? ` · Prudence : ${ai.warning}` : ''} · Confiance ${ai.confidence}%`
      : defaultNote;

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
      provider: ai ? 'OpenStreetMap + Mistral AI' : 'OpenStreetMap / Overpass API',
      ai,
      note: aiNote,
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
