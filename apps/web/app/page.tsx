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
  serviceCategories?: string[];
  arrivalHour?: number;
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
};

type TrafficStatus = {
  connected: boolean;
  traffic?: { available?: boolean; expectedRefresh?: string };
};

type ServiceFilter = 'Tous' | 'Restauration' | 'Café' | 'Boutique' | 'Toilettes';

function formatDuration(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

function pausePlan(durationMin: number) {
  const count = Math.max(0, Math.floor((durationMin - 1) / 120));
  const pauseMinutes = count * 15;
  return { count, pauseMinutes, totalMinutes: durationMin + pauseMinutes };
}

function tone(wait: number) {
  if (wait <= 5) return 'good';
  if (wait <= 8) return 'medium';
  return 'bad';
}

function score(station: Station) {
  return station.waitMin + station.detourMin + station.price * 2;
}

function sampleStations(stations: Station[], max = 6) {
  if (stations.length <= max) return stations;
  return Array.from({ length: max }, (_, i) => stations[Math.round(i * (stations.length - 1) / (max - 1))]);
}

export default function Home() {
  const [origin, setOrigin] = useState('Paris');
  const [destination, setDestination] = useState('Lyon');
  const [draftOrigin, setDraftOrigin] = useState('Paris');
  const [draftDestination, setDraftDestination] = useState('Lyon');
  const [fuel, setFuel] = useState('Gazole');
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [traffic, setTraffic] = useState<TrafficStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Station | null>(null);
  const [activeTab, setActiveTab] = useState<'route' | 'stations' | 'community' | 'profile'>('route');
  const [startAfterKm, setStartAfterKm] = useState(120);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('Tous');
  const [showAllStations, setShowAllStations] = useState(false);

  async function loadRoute(from: string, to: string, selectedFuel = fuel) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/route?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&fuel=${encodeURIComponent(selectedFuel)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Calcul impossible');
      setRouteData(json);
      setOrigin(json.origin.label);
      setDestination(json.destination.label);
      setStartAfterKm(Math.min(120, Math.max(0, Math.floor(json.distanceKm * 0.3))));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de calculer cet itinéraire.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoute('Paris', 'Lyon', 'Gazole');
    fetch('/api/traffic', { cache: 'no-store' })
      .then(r => r.json())
      .then(setTraffic)
      .catch(() => setTraffic({ connected: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allStations = useMemo(() => [...(routeData?.stations || [])].sort((a, b) => a.distanceKm - b.distanceKm), [routeData]);
  const eligibleStations = useMemo(() => allStations.filter(station => {
    if (station.distanceKm < startAfterKm) return false;
    if (serviceFilter === 'Tous') return true;
    return station.serviceCategories?.includes(serviceFilter) ?? false;
  }), [allStations, startAfterKm, serviceFilter]);
  const ranked = useMemo(() => [...eligibleStations].sort((a, b) => score(a) - score(b)), [eligibleStations]);
  const best = ranked[0];
  const nearest = eligibleStations[0];
  const saved = best && nearest ? Math.max(0, nearest.waitMin + nearest.detourMin - best.waitMin - best.detourMin) : 0;
  const routeStations = sampleStations(allStations, 6);
  const breaks = routeData ? pausePlan(routeData.durationMin) : null;
  const visibleStations = showAllStations ? eligibleStations : eligibleStations.slice(0, 8);
  const startAfterTime = routeData?.distanceKm ? Math.round((startAfterKm / routeData.distanceKm) * routeData.durationMin) : 0;

  async function submitRoute(e: FormEvent) {
    e.preventDefault();
    const ok = await loadRoute(draftOrigin.trim(), draftDestination.trim(), fuel);
    if (ok) setEditing(false);
  }

  async function changeFuel(nextFuel: string) {
    setFuel(nextFuel);
    await loadRoute(origin, destination, nextFuel);
  }

  return (
    <main className="phoneShell">
      <header className="topbar">
        <button className="iconButton" aria-label="Menu">☰</button>
        <div className="brand">
          <div className="brandLogo"><i/><i/><i/><strong>FLOWAY</strong><i/><i/><i/></div>
          <span>Le meilleur arrêt sur votre route</span>
        </div>
        <button className="iconButton orange" aria-label="Alertes">♢</button>
      </header>

      <section className="routeCard">
        <div>
          <small>ITINÉRAIRE ACTIF</small>
          <h1>{origin.split(',')[0]} <span>→</span> {destination.split(',')[0]}</h1>
          <p>{routeData ? `${routeData.distanceKm} km · ${formatDuration(routeData.durationMin)} de conduite estimée` : 'Calcul en cours…'}</p>
          {routeData && <p className="durationDisclaimer">Hors pauses · ETA trafic temps réel non appliqué</p>}
        </div>
        <button className="editButton" onClick={() => setEditing(true)}>✎ Modifier</button>
      </section>

      <section className="metricsGrid">
        <div><span>CONDUITE</span><strong>{routeData ? formatDuration(routeData.durationMin) : '—'}</strong><small>modèle routier OSRM</small></div>
        <div><span>PAUSES</span><strong>{breaks ? `+ ${breaks.pauseMinutes} min` : '—'}</strong><small>{breaks ? `${breaks.count} pause${breaks.count > 1 ? 's' : ''} × 15 min` : 'conseil Floway'}</small></div>
        <div><span>VOYAGE FLOWAY</span><strong>{breaks ? formatDuration(breaks.totalMinutes) : '—'}</strong><small>conduite + pauses</small></div>
        <div className="gain"><span>GAIN</span><strong>≈ {saved} min</strong><small>sur les arrêts optimisés</small></div>
      </section>

      <section className="trafficCard">
        <div><small>SIGNAL ROUTIER</small><strong>Trafic public {traffic?.connected ? 'connecté' : 'en cours de connexion'}</strong><span>Vitesses, débits et événements selon couverture disponible</span></div>
        <div className="trafficState"><b>{traffic?.traffic?.available ? 'ACTIF' : 'PARTIEL'}</b><span>{traffic?.traffic?.expectedRefresh || '1–6 min'}</span><em>non appliqué à l’ETA</em></div>
      </section>

      {error && <div className="errorBox">{error}</div>}

      <section className="routeMap" aria-label="Stations sur le trajet">
        <div className="mapHeader"><span>ROUTE FLOWAY</span><strong>{allStations.length} <em>STATIONS DÉTECTÉES</em></strong></div>
        <div className="mapBody">
          <div className="roadRail" />
          {routeStations.map((station, index) => {
            const isBest = station.id === best?.id;
            const side = index % 2 === 0 ? 'left' : 'right';
            return (
              <button className={`routeNode ${side} ${isBest ? 'best' : ''}`} key={station.id} onClick={() => setSelected(station)}>
                <div className="nodeCard">
                  <b>{station.waitMin} min</b>
                  <strong>{station.city || station.name}</strong>
                  <span>{station.distanceKm} km · {station.price.toFixed(3)} €/L</span>
                </div>
                <i className={`nodeDot ${tone(station.waitMin)}`} />
              </button>
            );
          })}
          <button className="gpsButton" aria-label="Position">➤</button>
        </div>
      </section>

      <section className="journeyRailSection">
        <div className="journeyRailHead">
          <div><small>FIL DU VOYAGE</small><strong>Toutes les stations sur l’itinéraire</strong></div>
          <span>{allStations.length} arrêts</span>
        </div>
        <div className="journeyRail">
          {allStations.map(station => (
            <button key={station.id} className={station.distanceKm >= startAfterKm ? 'journeyStop active' : 'journeyStop muted'} onClick={() => setSelected(station)}>
              <span>{Math.round(station.distanceKm)} km</span>
              <i className={tone(station.waitMin)} />
              <strong>{station.city || station.name}</strong>
              <small>{station.serviceCategories?.slice(0, 2).join(' · ') || 'Carburant'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="stopPlanner">
        <div className="plannerHead"><div><small>QUAND VEUX-TU COMMENCER À CHERCHER ?</small><strong>Après {startAfterKm} km · environ {formatDuration(startAfterTime)}</strong></div><span>Départ avec le plein</span></div>
        <input type="range" min="0" max={Math.max(50, Math.floor(routeData?.distanceKm || 500))} step="10" value={startAfterKm} onChange={e => setStartAfterKm(Number(e.target.value))} />
        <div className="rangeLabels"><span>Maintenant</span><span>Plus tard sur la route</span></div>
        <div className="serviceChips">
          {(['Tous', 'Restauration', 'Café', 'Boutique', 'Toilettes'] as ServiceFilter[]).map(filter => <button key={filter} className={serviceFilter === filter ? 'active' : ''} onClick={() => setServiceFilter(filter)}>{filter}</button>)}
        </div>
      </section>

      {breaks && breaks.count > 0 && (
        <section className="pauseCard">
          <div><small>PLAN DE PAUSES FLOWAY</small><strong>{breaks.count} pauses conseillées</strong><span>Une pause de 15 min environ toutes les 2 h de conduite.</span></div>
          <div><b>+{breaks.pauseMinutes}</b><span>MIN</span></div>
        </section>
      )}

      {best && (
        <section className="recommendation">
          <div className="recommendHead"><span>MEILLEUR ARRÊT APRÈS {startAfterKm} KM</span><strong>≈ {saved} MIN GAGNÉES</strong></div>
          <div className="stationTitle">
            <div className="pump">⛽</div>
            <div><small>{best.serviceCategories?.join(' · ') || 'STATION'}</small><h2>{best.city || best.name}</h2><p>{best.address}</p></div>
          </div>
          <div className="stationStats">
            <div><span>ATTENTE IA</span><strong className="green">{best.waitMin} min</strong></div>
            <div><span>PRIX OFFICIEL</span><strong>{best.price.toFixed(3)} €/L</strong></div>
            <div><span>DÉTOUR</span><strong className="orangeText">+{best.detourMin} min</strong></div>
          </div>
          <div className="confidence"><span>Confiance IA</span><b>{best.waitModel.confidence}</b><i/><i/><i/><i className="off"/><i className="off"/></div>
          <button className="primaryButton" onClick={() => setSelected(best)}>VOIR LE DÉTAIL <span>→</span></button>
        </section>
      )}

      <section className="sectionHeader" id="stations">
        <div><small>ARRÊTS ÉLIGIBLES APRÈS {startAfterKm} KM</small><h2>{serviceFilter === 'Tous' ? 'Toutes les stations' : serviceFilter}</h2></div>
        <select value={fuel} onChange={e => void changeFuel(e.target.value)} disabled={loading}>
          <option>Gazole</option><option>SP95-E10</option><option>SP98</option><option>E85</option>
        </select>
      </section>

      <section className="stationList">
        {visibleStations.map(station => (
          <button className={`stationRow ${tone(station.waitMin)}`} key={station.id} onClick={() => setSelected(station)}>
            <div className="stationIcon">⛽</div>
            <div className="stationInfo"><small>{station.serviceCategories?.join(' · ') || station.waitModel.label}</small><strong>{station.city || station.name}</strong><span>{station.distanceKm} km · arrivée estimée {String(station.arrivalHour ?? '--').padStart(2, '0')}h</span></div>
            <div className="stationNumbers"><b>{station.waitMin} min</b><span>{station.price.toFixed(3)} €/L</span></div>
            <i>›</i>
          </button>
        ))}
        {eligibleStations.length > 8 && <button className="showAllButton" onClick={() => setShowAllStations(v => !v)}>{showAllStations ? 'Réduire la liste' : `Voir les ${eligibleStations.length} stations éligibles`}</button>}
      </section>

      {activeTab === 'community' && (
        <section className="simplePanel"><small>COMMUNAUTÉ FLOWAY</small><h2>Le signal terrain complète l’IA</h2><p>Les conducteurs peuvent signaler leur présence dans une file. Ces observations renforceront progressivement la précision du modèle.</p></section>
      )}
      {activeTab === 'profile' && (
        <section className="simplePanel"><small>PROFIL</small><h2>Préférences conducteur</h2><p>Carburant favori, tolérance au détour, heure de pause, restauration et services pourront personnaliser le score Floway.</p></section>
      )}

      <nav className="bottomNav">
        <button className={activeTab === 'route' ? 'active' : ''} onClick={() => setActiveTab('route')}>⌁<span>Route</span></button>
        <button className={activeTab === 'stations' ? 'active' : ''} onClick={() => { setActiveTab('stations'); document.getElementById('stations')?.scrollIntoView({ behavior: 'smooth' }); }}>⛽<span>Stations</span></button>
        <button className={activeTab === 'community' ? 'active' : ''} onClick={() => setActiveTab('community')}>◉<span>Communauté</span></button>
        <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>○<span>Profil</span></button>
      </nav>

      {editing && (
        <div className="modalBackdrop" onClick={() => !loading && setEditing(false)}>
          <form className="routeModal" onSubmit={submitRoute} onClick={e => e.stopPropagation()}>
            <small>NOUVEL ITINÉRAIRE</small><h2>Où va-t-on ?</h2>
            <label>Départ<input value={draftOrigin} onChange={e => setDraftOrigin(e.target.value)} /></label>
            <label>Destination<input value={draftDestination} onChange={e => setDraftDestination(e.target.value)} /></label>
            <button className="primaryButton" disabled={loading}>{loading ? 'ANALYSE…' : 'ANALYSER LE TRAJET →'}</button>
          </form>
        </div>
      )}

      {selected && (
        <div className="modalBackdrop" onClick={() => setSelected(null)}>
          <section className="detailSheet" onClick={e => e.stopPropagation()}>
            <button className="closeButton" onClick={() => setSelected(null)}>←</button>
            <div className="detailHero"><small>AIRE / STATION</small><h2>{selected.city || selected.name}</h2><p>{selected.address}</p></div>
            <div className="detailBadge">{selected.serviceCategories?.join(' · ') || 'RECOMMANDATION FLOWAY'}</div>
            <div className="detailStats">
              <div><span>ATTENTE IA</span><strong>{selected.waitMin} min</strong></div>
              <div><span>PRIX</span><strong>{selected.price.toFixed(3)} €/L</strong></div>
              <div><span>DÉTOUR</span><strong>+{selected.detourMin} min</strong></div>
            </div>
            <div className="retroBoard"><span>ATTENTE ESTIMÉE</span><strong>{String(selected.waitMin).padStart(2, '0')}</strong><b>MIN</b></div>
            <div className="detailExplain"><small>POURQUOI CETTE ESTIMATION ?</small>{selected.waitModel.factors.map(f => <p key={f}>• {f}</p>)}</div>
            <div className="services"><small>SERVICES DÉCLARÉS</small><div>{(selected.services.length ? selected.services : ['Carburant', 'Paiement CB', 'Aire']).slice(0, 10).map(s => <span key={s}>{s}</span>)}</div></div>
            <button className="primaryButton greenButton">CHOISIR CET ARRÊT →</button>
          </section>
        </div>
      )}
    </main>
  );
}
