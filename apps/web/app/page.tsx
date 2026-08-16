'use client';

import { FormEvent, useMemo, useState } from 'react';

type Station = {
  id: string;
  name: string;
  motorway: string;
  distanceKm: number;
  price: number;
  waitMin: number;
  detourMin: number;
};

type RouteData = {
  origin: { label: string; lat: number; lon: number };
  destination: { label: string; lat: number; lon: number };
  distanceKm: number;
  durationMin: number;
  liveTraffic: boolean;
  providers: { geocoding: string; routing: string };
};

const STATIONS: Station[] = [
  { id: '1', name: 'Villabé', motorway: 'A6', distanceKm: 12, price: 1.919, waitMin: 18, detourMin: 1 },
  { id: '2', name: 'Nemours', motorway: 'A6', distanceKm: 31, price: 1.889, waitMin: 4, detourMin: 2 },
  { id: '3', name: 'Darvault', motorway: 'A6', distanceKm: 47, price: 1.899, waitMin: 8, detourMin: 3 },
  { id: '4', name: 'Courtenay', motorway: 'A6', distanceKm: 76, price: 1.909, waitMin: 12, detourMin: 2 },
];

const TOLL = {
  name: 'Péage de Fleury-en-Bière',
  motorway: 'A6',
  distanceKm: 24,
  waitMin: 6,
};

function score(station: Station) {
  return station.waitMin + station.detourMin + Math.max(0, station.price - 1.889) * 100;
}

function tone(minutes: number) {
  if (minutes <= 5) return 'good';
  if (minutes <= 12) return 'medium';
  return 'bad';
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

export default function Home() {
  const [position, setPosition] = useState('Position non activée');
  const [locating, setLocating] = useState(false);
  const [fuel, setFuel] = useState('Gazole');
  const [queueStation, setQueueStation] = useState<string | null>(null);
  const [origin, setOrigin] = useState('Paris');
  const [destination, setDestination] = useState('Lyon');
  const [draftOrigin, setDraftOrigin] = useState(origin);
  const [draftDestination, setDraftDestination] = useState(destination);
  const [editingRoute, setEditingRoute] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [routeData, setRouteData] = useState<RouteData | null>(null);

  const ranked = useMemo(() => [...STATIONS].sort((a, b) => score(a) - score(b)), []);
  const best = ranked[0];
  const nearest = [...STATIONS].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const saved = Math.max(0, nearest.waitMin + nearest.detourMin - best.waitMin - best.detourMin);
  const totalObservedDelay = TOLL.waitMin + STATIONS.reduce((sum, station) => sum + station.waitMin, 0);

  function locate() {
    setLocating(true);
    if (!navigator.geolocation) {
      setPosition('Géolocalisation indisponible');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
        setLocating(false);
      },
      () => {
        setPosition('Autorisation de localisation refusée');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function saveRoute(event: FormEvent) {
    event.preventDefault();
    const from = draftOrigin.trim();
    const to = draftDestination.trim();
    if (!from || !to) return;

    setRouteLoading(true);
    setRouteError('');
    try {
      const response = await fetch(`/api/route?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Calcul impossible');

      setRouteData(payload);
      setOrigin(payload.origin.label);
      setDestination(payload.destination.label);
      setEditingRoute(false);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Impossible de calculer le trajet.');
    } finally {
      setRouteLoading(false);
    }
  }

  return (
    <main className="appShell">
      <header className="brandBar">
        <div className="wing wingLeft" />
        <div className="logoWord">FLOWAY</div>
        <div className="wing wingRight" />
        <div className="subtitle">Le meilleur arrêt sur votre route</div>
      </header>

      <section className="routeHeader">
        <div>
          <div className="routeLabel">{origin.toUpperCase()} → {destination.toUpperCase()}</div>
          <div className="routeSub">itinéraire actif · calcul routier réel</div>
        </div>
        <button className="ghostButton" onClick={() => setEditingRoute(true)}>Modifier</button>
      </section>

      <section className="tripSummary">
        <div><span>TRAJET</span><strong>{routeData ? formatDuration(routeData.durationMin) : '≈ 4 h 28'}</strong><small>{routeData ? `${routeData.distanceKm} km calculés` : 'référence démo'}</small></div>
        <div><span>POINTS SENSIBLES</span><strong>5</strong><small>encore en mode démo</small></div>
        <div><span>TEMPS OBSERVÉ</span><strong>+{totalObservedDelay} min</strong><small>attentes encore simulées</small></div>
        <div className="summaryGain"><span>GAIN FLOWAY</span><strong>≈ {saved} min</strong><small>sur l’arrêt carburant</small></div>
      </section>

      {routeData && (
        <section className="routeProviderStrip">
          <span>ITINÉRAIRE RÉEL</span>
          <strong>{routeData.distanceKm} km · {formatDuration(routeData.durationMin)}</strong>
          <small>{routeData.providers.geocoding} + {routeData.providers.routing} · trafic temps réel non inclus</small>
        </section>
      )}

      <section className="mapPanel">
        <div className="savedBadge"><strong>{saved} MIN</strong><span>GAGNÉES</span></div>
        <div className="routeLine" />
        {STATIONS.map((station, index) => {
          const isBest = station.id === best.id;
          return (
            <div className={`routeStop stop${index + 1} ${isBest ? 'routeBest' : ''}`} key={station.id}>
              <div className={`routeDot ${tone(station.waitMin)}`} />
              <div className="routeCopy">
                <strong>{station.waitMin} min</strong>
                <span>{station.name}</span>
                <small>{station.distanceKm} km · station démo</small>
              </div>
            </div>
          );
        })}
        <div className="tollStop">
          <div className="tollDot">P</div>
          <div className="tollCopy"><strong>{TOLL.waitMin} min</strong><span>{TOLL.name}</span><small>{TOLL.distanceKm} km · péage démo</small></div>
        </div>
        <button className="locationFab" onClick={locate} disabled={locating}>⌖</button>
      </section>

      <section className="routeInsight">
        <div><span>PROCHAIN POINT SENSIBLE</span><strong>{TOLL.name}</strong><small>{TOLL.motorway} · dans {TOLL.distanceKm} km</small></div>
        <div className="tollTime"><b>{TOLL.waitMin}</b><span>MIN</span><small>ATTENTE DÉMO</small></div>
      </section>

      <section className="bestCard">
        <div className="cardTopline">
          <span>MEILLEUR ARRÊT</span>
          <b>≈ {saved} MIN GAGNÉES</b>
        </div>
        <h1>AIRE DE {best.name.toUpperCase()}</h1>
        <p>{best.motorway} · dans {best.distanceKm} km</p>
        <div className="dataGrid">
          <div><span>ATTENTE</span><strong className="greenText">{best.waitMin} min</strong></div>
          <div><span>PRIX</span><strong>{best.price.toFixed(3)} €/L</strong></div>
          <div><span>DÉTOUR</span><strong className="orangeText">+{best.detourMin} min</strong></div>
        </div>
        <div className="sourceStrip"><span>Source attente</span><strong>Données de démonstration</strong><em>Confiance : prototype</em></div>
        <button className="cta">CHOISIR CET ARRÊT <span>→</span></button>
      </section>

      <section className="compareSection">
        <div className="sectionHead">
          <div>
            <span className="miniLabel">PROCHAINES STATIONS</span>
            <h2>Comparatif sur l’itinéraire</h2>
          </div>
          <select value={fuel} onChange={(e) => setFuel(e.target.value)}>
            <option>Gazole</option>
            <option>SP95-E10</option>
            <option>SP98</option>
            <option>E85</option>
          </select>
        </div>

        <div className="stationStack">
          {ranked.map((station) => (
            <article className={`retroCard ${tone(station.waitMin)}Border`} key={station.id}>
              <div className="retroCardHead">
                <div className={`pumpIcon ${tone(station.waitMin)}`}>⛽</div>
                <div>
                  <span className="miniLabel">AIRE DE</span>
                  <h3>{station.name.toUpperCase()}</h3>
                  <p>{station.motorway} · {station.distanceKm} km</p>
                </div>
              </div>
              <div className="retroStats">
                <div><span>ATTENTE</span><strong>{station.waitMin} min</strong></div>
                <div><span>PRIX</span><strong>{station.price.toFixed(3)} €/L</strong></div>
                <div><span>DÉTOUR</span><strong>+{station.detourMin} min</strong></div>
              </div>
              <div className="dataSource">Démo · futur calcul Floway = trafic + communauté + historique</div>
              <button className={queueStation === station.id ? 'queueButton active' : 'queueButton'} onClick={() => setQueueStation(queueStation === station.id ? null : station.id)}>
                {queueStation === station.id ? '✓ FILE SIGNALÉE — TERMINER' : 'JE FAIS LA QUEUE ICI'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="splitPanel">
        <div>
          <span>ATTENTE ACTUELLE</span>
          <div className="splitDigits"><b>0</b><b>4</b><em>MIN</em></div>
        </div>
        <div className="flowState"><strong>FLUIDE</strong><div>● ● ● ○ ○</div><small>Prototype · donnée non temps réel</small></div>
      </section>

      <div className="positionNote">{position} · {fuel}</div>

      <nav className="bottomNav">
        <button className="activeNav">⌁<span>Route</span></button>
        <button>⛽<span>Stations</span></button>
        <button>◉<span>Communauté</span></button>
        <button>○<span>Profil</span></button>
      </nav>

      {editingRoute && (
        <div className="modalBackdrop" onClick={() => !routeLoading && setEditingRoute(false)}>
          <form className="routeModal" onSubmit={saveRoute} onClick={(e) => e.stopPropagation()}>
            <span className="miniLabel">NOUVEL ITINÉRAIRE</span>
            <h2>Où va-t-on ?</h2>
            <label>Départ<input value={draftOrigin} onChange={(e) => setDraftOrigin(e.target.value)} disabled={routeLoading} /></label>
            <label>Destination<input value={draftDestination} onChange={(e) => setDraftDestination(e.target.value)} disabled={routeLoading} /></label>
            {routeError && <div className="routeError">{routeError}</div>}
            <div className="modalActions">
              <button type="button" className="ghostButton" onClick={() => setEditingRoute(false)} disabled={routeLoading}>Annuler</button>
              <button type="submit" className="cta" disabled={routeLoading}>{routeLoading ? 'CALCUL EN COURS…' : 'CALCULER LE TRAJET →'}</button>
            </div>
            <small>Géocodage : Géoplateforme/BAN. Routage : OSRM/OpenStreetMap. Prototype sans trafic temps réel.</small>
          </form>
        </div>
      )}
    </main>
  );
}
