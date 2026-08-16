import { NextResponse } from 'next/server';

const TRAFFIC_INDEX = 'https://tipi.bison-fute.gouv.fr/bison-fute-ouvert/publicationsDIR/TRAFICOLOR-DIR/';
const EVENTS_INDEX = 'https://tipi.bison-fute.gouv.fr/bison-fute-ouvert/publicationsDIR/Evenementiel-DIR/grt/RRN/';

function latestTimestampFromIndex(html: string) {
  const matches = [...html.matchAll(/(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})/g)];
  if (!matches.length) return null;
  const latest = matches[matches.length - 1];
  return `${latest[1]}T${latest[2]}:00+02:00`;
}

export async function GET() {
  try {
    const [trafficResponse, eventsResponse] = await Promise.all([
      fetch(TRAFFIC_INDEX, { cache: 'no-store', headers: { Accept: 'text/html' } }),
      fetch(EVENTS_INDEX, { cache: 'no-store', headers: { Accept: 'text/html' } }),
    ]);

    const [trafficHtml, eventsHtml] = await Promise.all([
      trafficResponse.ok ? trafficResponse.text() : Promise.resolve(''),
      eventsResponse.ok ? eventsResponse.text() : Promise.resolve(''),
    ]);

    return NextResponse.json({
      connected: trafficResponse.ok || eventsResponse.ok,
      provider: 'Bison Futé / Ministère chargé des Transports',
      traffic: {
        available: trafficResponse.ok,
        scope: 'RRN non concédé — états de trafic, vitesses, débits, occupation',
        expectedRefresh: '1 à 6 min',
        latestPublicationSeen: latestTimestampFromIndex(trafficHtml),
      },
      events: {
        available: eventsResponse.ok,
        scope: 'RRN non concédé — événements routiers publics',
        latestPublicationSeen: latestTimestampFromIndex(eventsHtml),
      },
      limitations: [
        'La couverture publique sans authentification concerne principalement le réseau routier national non concédé.',
        'Les données détaillées des sociétés concessionnaires d’autoroutes peuvent nécessiter un accès Action b authentifié.',
        'Cette API vérifie la disponibilité et la fraîcheur des flux ; la corrélation géographique avec l’itinéraire sera le prochain traitement Floway.',
      ],
      sourceUrls: {
        traffic: TRAFFIC_INDEX,
        events: EVENTS_INDEX,
      },
    });
  } catch {
    return NextResponse.json({
      connected: false,
      provider: 'Bison Futé / Ministère chargé des Transports',
      traffic: { available: false },
      events: { available: false },
      limitations: ['Flux Bison Futé momentanément indisponible depuis Floway.'],
    }, { status: 200 });
  }
}
