import { NextRequest, NextResponse } from 'next/server';

import { timeoutFetch } from '../_lib/http';

// Masque le `fetch` global pour ce module : tout appel sortant est abandonné
// automatiquement au-delà du délai, sans modifier les points d'appel.
const fetch = timeoutFetch();

export async function GET(req: NextRequest) {
  const key = process.env.TOMTOM_API_KEY;
  const q = req.nextUrl.searchParams;
  const lat1 = Number(q.get('lat1'));
  const lon1 = Number(q.get('lon1'));
  const lat2 = Number(q.get('lat2'));
  const lon2 = Number(q.get('lon2'));
  const heading = Number(q.get('heading'));
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NextResponse.json({ speedLimit: null }, { status: 400 });
  if (!key) return NextResponse.json({ connected: false, speedLimit: null });
  const u = new URL('https://api.tomtom.com/snapToRoads/1');
  u.searchParams.set('key', key);
  u.searchParams.set('points', `${lon1},${lat1};${lon2},${lat2}`);
  if (Number.isFinite(heading)) u.searchParams.set('headings', `;${Math.max(0, Math.min(360, heading))}`);
  u.searchParams.set('fields', '{projectedPoints{properties{routeIndex,snapResult}},route{properties{speedLimits{value,unit,type},address{roadName,roadNumbers}}}}');
  u.searchParams.set('vehicleType', 'PassengerCar');
  u.searchParams.set('measurementSystem', 'metric');
  u.searchParams.set('offroadMargin', '60');
  try {
    const r = await fetch(u, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`SNAP_${r.status}`);
    const d = await r.json();
    const projected = d?.projectedPoints?.at?.(-1);
    const idx = projected?.properties?.routeIndex;
    const element = typeof idx === 'number' ? d?.route?.[idx] : d?.route?.at?.(-1);
    const limit = element?.properties?.speedLimits;
    return NextResponse.json({ connected: true, matched: projected?.properties?.snapResult === 'Matched', speedLimit: limit?.type === 'Maximum' ? limit?.value ?? null : null, unit: limit?.unit ?? 'kmph', roadName: element?.properties?.address?.roadName ?? null, roadNumbers: element?.properties?.address?.roadNumbers ?? [], source: 'TomTom Snap to Roads', updatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ connected: false, speedLimit: null, error: e instanceof Error ? e.message : 'SPEED_LIMIT_ERROR' }, { status: 502 });
  }
}
