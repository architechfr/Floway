'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Station = {
  id: string;
  name: string;
  address: string;
  city: string;
  motorway: string;
  distanceKm: number;
  routeOffsetKm: number;
  price: number;
  waitMin: number;
  detourMin: number;
  services: string[];
  waitModel: { label: string; confidence: string; factors: string[] };
  sources: { station: string; priceFreshness: string; wait: string };
};

type RouteData = {
  origin: { label: string; lat: number; lon: number };
  destination: { label: string; lat: number; lon: number };
  distanceKm: number;
  durationMin: number;
  stations: Station[];
  fuel: string;
  providers: { geocoding: string; routing: string; fuel: string; ai: string };
};

type TrafficStatus = {
  connected: boolean;
  provider: string;
  traffic?: { available?: boolean; scope?: string; expectedRefresh?: string; latestPublicationSeen?: string | null };
  events?: { available?: boolean; scope?: string; latestPublicationSeen?: string | null };
  limitations?: string[];
};

function score(station: Station) {
  return station.waitMin + station.detourMin + station.price * 2;
}

function tone(minutes: number) {
  if (minutes <= 5) return 'good';
  if (minutes <= 8) return 'medium';
  return 'bad';
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

function formatFreshness(value?: string | null) {
  if (!value) return 'publication détectée';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'publication détectée' : date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeError, setRouteError] = useState('');
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [trafficStatus, setTrafficStatus] = useState<TrafficStatus | null>(null);

  async function calculateRoute(from: string, to: string, selectedFuel = fuel) {
    setRouteLoading(true);
    setRouteError('');
    try {
      const response = await fetch(`/api/route?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&fuel=${encodeURIComponent(selectedFuel)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Calcul impossible');
      setRouteData(payload);
      setOrigin(payload.origin.label);
      setDestination(payload.destination.label);
      return true;
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Impossible de calculer le trajet.');
      return false;
    } finally {
      setRouteLoading(false);
    }
  }

  async function refreshTrafficStatus() {
    try {
      const response = await fetch('/api/traffic', { cache: 'no-store' });
      const payload = await response.json();
      setTrafficStatus(payload);
    } catch {
      setTrafficStatus({ connected: false, provider: 'Bison Futé' });
    }
  }

  useEffect(() => {
    void calculateRoute('Paris', 'Lyon', 'Gazole');
    void refreshTrafficStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ranked = useMemo(() => [...(routeData?.stations || [])].sort((a, b) => score(a) - score(b)), [routeData]);
  const best = ranked[0];
  const nearest = [...(routeData?.stations || [])].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const saved = best && nearest ? Math.max(0, nearest.waitMin + nearest.detourMin - best.waitMin - best.detourMin) : 0;
  const displayedStations = (routeData?.stations || []).slice(0, 4);

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
    const ok = await calculateRoute(from, to, fuel);
    if (ok) {
      await refreshTrafficStatus();
      setEditingRoute(false);
    }
  }

  async function changeFuel(nextFuel: string) {
    setFuel(nextFuel);
    await calculateRoute(origin, destination, nextFuel);
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
          <div className="routeSub">itinéraire + stations + prix réels</div>
        </div>
        <button className="ghostButton" onClick={() => setEditingRoute(true)}>Modifier</button>
      </section>

      <section className="tripSummary">
        <div><span>TRAJET RÉEL</span><strong>{routeData ? formatDuration(routeData.durationMin) : '—'}</strong><small>{routeData ? `${routeData.distanceKm} km` : 'calcul en cours'}</small></div>
        <div><span>STATIONS SUR ROUTE</span><strong>{routeData?.stations.length ?? '—'}</strong><small>flux officiel État</small></div>
        <div><span>TRAFIC OFFICIEL</span><strong>{trafficStatus?.connected ? 'CONNECTÉ' : 'EN ATTENTE'}</strong><small>{trafficStatus?.traffic?.available ? 'Bison Futé actif' : 'couverture à vérifier'}</small></div>
        <div className="summaryGain"><span>GAIN FLOWAY</span><strong>{best ? `≈ ${saved} min` : '—'}</strong><small>vs prochain arrêt détecté</small></div>
      </section>

      <section className="routeProviderStrip">
        <span>{routeLoading ? 'FLOWAY ANALYSE LA ROUTE…' : 'DONNÉES RÉELLES + ESTIMATION IA'}</span>
        <strong>{routeData ? `${routeData.distanceKm} km · ${formatDuration(routeData.durationMin)} · ${routeData.stations.length} stations` : 'Calcul en cours'}</strong>
        <small>{routeData ? `${routeData.providers.routing} · ${routeData.providers.fuel} · attente : ${routeData.providers.ai}` : 'Géocodage, routage et recherche des stations…'}</small>
      </section>

      <section className={`trafficLiveCard ${trafficStatus?.connected ? 'connected' : ''}`}>
        <div>
          <span className="miniLabel">TRAFIC PUBLIC TEMPS RÉEL</span>
          <h2>{trafficStatus?.connected ? 'Bison Futé connecté' : 'Connexion Bison Futé'}</h2>
          <p>{trafficStatus?.traffic?.scope || 'Vérification des flux trafic et événements routiers.'}</p>
        </div>
        <div className="trafficLiveMeta">
          <strong>{trafficStatus?.traffic?.available ? 'ACTIF' : 'PARTIEL'}</strong>
          <span>{trafficStatus?.traffic?.expectedRefresh || '1–6 min'}</span>
          <small>{formatFreshness(trafficStatus?.traffic?.latestPublicationSeen)}</small>
        </div>
      </section>
      {trafficStatus?.limitations?.[0] && <div className="coverageNote">Couverture actuelle : {trafficStatus.limitations[0]}</div>}

      {routeError && <div className="routeError routeErrorMain">{routeError}</div>}

      <section className="mapPanel">
        <div className="savedBadge"><strong>{best ? `${saved} MIN` : 'IA'}</strong><span>{best ? 'POTENTIEL' : 'ANALYSE'}</span></div>
        <div className="routeLine" />
        {displayedStations.map((station, index) => {
          const isBest = station.id === best?.id;
          return (
            <div className={`routeStop stop${index + 1} ${isBest ? 'routeBest' : ''}`} key={station.id}>
              <div className={`routeDot ${tone(station.waitMin)}`} />
              <div className="routeCopy">
                <strong>{station.waitMin} min IA</strong>
                <span>{station.city || station.name}</span>
                <small>{station.distanceKm} km · {station.price.toFixed(3)} €/L</small>
              </div>
            </div>
          );
        })}
        <button className="locationFab" onClick={locate} disabled={locating}>⌖</button>
      </section>

      {nearest && (
        <section className="routeInsight">
          <div><span>PROCHAINE STATION RÉELLE</span><strong>{nearest.city || nearest.name}</strong><small>dans {nearest.distanceKm} km · à {nearest.routeOffsetKm} km de la route</small></div>
          <div className="tollTime"><b>{nearest.waitMin}</b><span>MIN</span><small>ESTIMATION IA</small></div>
        </section>
      )}

      {best ? (
        <section className="bestCard">
          <div className="cardTopline"><span>RECOMMANDATION FLOWAY</span><b>≈ {saved} MIN DE POTENTIEL</b></div>
          <h1>{best.city ? `STATION ${best.city.toUpperCase()}` : best.name.toUpperCase()}</h1>
          <p>{best.address} · dans {best.distanceKm} km</p>
          <div className="dataGrid">
            <div><span>ATTENTE IA</span><strong className="greenText">{best.waitMin} min</strong></div>
            <div><span>PRIX OFFICIEL</span><strong>{best.price.toFixed(3)} €/L</strong></div>
            <div><span>DÉTOUR EST.</span><strong className="orangeText">+{best.detourMin} min</strong></div>
          </div>
          <div className="sourceStrip"><span>Confiance IA</span><strong>{best.waitModel.confidence}</strong><em>Prix : flux officiel</em></div>
          <div className="aiExplain"><b>Pourquoi Floway la recommande</b>{best.waitModel.factors.map((factor) => <span key={factor}>• {factor}</span>)}</div>
          <button className="cta">CHOISIR CET ARRÊT <span>→</span></button>
        </section>
      ) : !routeLoading && (
        <section className="bestCard"><div className="cardTopline"><span>ANALYSE FLOWAY</span></div><h1>AUCUNE STATION ÉLIGIBLE</h1><p>Aucune station avec prix {fuel} n’a été identifiée à proximité immédiate de cet itinéraire.</p></section>
      )}

      <section className="compareSection">
        <div className="sectionHead">
          <div><span className="miniLabel">STATIONS RÉELLES SUR L’ITINÉRAIRE</span><h2>Comparatif Floway</h2></div>
          <select value={fuel} onChange={(e) => void changeFuel(e.target.value)} disabled={routeLoading}>
            <option>Gazole</option><option>SP95-E10</option><option>SP98</option><option>E85</option>
          </select>
        </div>

        <div className="stationStack">
          {ranked.slice(0, 10).map((station) => (
            <article className={`retroCard ${tone(station.waitMin)}Border`} key={station.id}>
              <div className="retroCardHead"><div className={`pumpIcon ${tone(station.waitMin)}`}>⛽</div><div><span className="miniLabel">{station.waitModel.label}</span><h3>{station.city ? station.city.toUpperCase() : station.name.toUpperCase()}</h3><p>{station.address} · {station.distanceKm} km sur le trajet</p></div></div>
              <div className="retroStats">
                <div><span>ATTENTE IA</span><strong>{station.waitMin} min</strong></div>
                <div><span>PRIX OFFICIEL</span><strong>{station.price.toFixed(3)} €/L</strong></div>
                <div><span>DÉTOUR EST.</span><strong>+{station.detourMin} min</strong></div>
              </div>
              <div className="dataSource">{station.sources.station} · {station.sources.priceFreshness} · confiance IA {station.waitModel.confidence}</div>
              <button className={queueStation === station.id ? 'queueButton active' : 'queueButton'} onClick={() => setQueueStation(queueStation === station.id ? null : station.id)}>
                {queueStation === station.id ? '✓ PRÉSENCE SIGNALÉE — TERMINER' : 'JE SUIS DANS LA FILE'}
              </button>
            </article>
          ))}
        </div>
      </section>

      {best && (
        <section className="splitPanel">
          <div><span>ESTIMATION FLOWAY</span><div className="splitDigits"><b>{String(best.waitMin).padStart(2, '0')[0]}</b><b>{String(best.waitMin).padStart(2, '0')[1]}</b><em>MIN</em></div></div>
          <div className="flowState"><strong>{tone(best.waitMin) === 'good' ? 'FLUIDE' : tone(best.waitMin) === 'medium' ? 'MODÉRÉ' : 'CHARGÉ'}</strong><div>● ● ● ○ ○</div><small>Modèle v0 · trafic Bison Futé en cours d’intégration au score</small></div>
        </section>
      )}

      <div className="positionNote">{position} · {fuel}</div>
      <nav className="bottomNav"><button className="activeNav">⌁<span>Route</span></button><button>⛽<span>Stations</span></button><button>◉<span>Communauté</span></button><button>○<span>Profil</span></button></nav>

      {editingRoute && (
        <div className="modalBackdrop" onClick={() => !routeLoading && setEditingRoute(false)}>
          <form className="routeModal" onSubmit={saveRoute} onClick={(e) => e.stopPropagation()}>
            <span className="miniLabel">NOUVEL ITINÉRAIRE</span><h2>Où va-t-on ?</h2>
            <label>Départ<input value={draftOrigin} onChange={(e) => setDraftOrigin(e.target.value)} disabled={routeLoading} /></label>
            <label>Destination<input value={draftDestination} onChange={(e) => setDraftDestination(e.target.value)} disabled={routeLoading} /></label>
            {routeError && <div className="routeError">{routeError}</div>}
            <div className="modalActions"><button type="button" className="ghostButton" onClick={() => setEditingRoute(false)} disabled={routeLoading}>Annuler</button><button type="submit" className="cta" disabled={routeLoading}>{routeLoading ? 'FLOWAY ANALYSE…' : 'ANALYSER LE TRAJET →'}</button></div>
            <small>Trajet et stations réels. Prix officiels. Flux Bison Futé surveillés. L’attente reste une estimation Floway explicitement identifiée jusqu’à calibration communautaire.</small>
          </form>
        </div>
      )}
    </main>
  );
}
