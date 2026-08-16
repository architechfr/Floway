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

type Tab = 'route' | 'stations' | 'community' | 'profile';

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

function serviceIcon(service: string) {
  const s = service.toLowerCase();
  if (s.includes('toilet')) return 'WC';
  if (s.includes('rest')) return '☕';
  if (s.includes('wifi')) return '⌁';
  if (s.includes('boutique')) return '▣';
  if (s.includes('lavage')) return '◫';
  return '•';
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
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('route');

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

  function goTab(tab: Tab) {
    setActiveTab(tab);
    const id = tab === 'route' ? 'route-top' : tab === 'stations' ? 'stations-section' : tab === 'community' ? 'community-section' : 'profile-section';
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="appShell">
      <div id="route-top" />
      <header className="brandBar">
        <div className="brandWing leftWing"><i /><i /><i /></div>
        <div className="logoWord">FLOWAY</div>
        <div className="brandWing rightWing"><i /><i /><i /></div>
        <div className="subtitle">Le meilleur arrêt sur votre route</div>
      </header>

      <section className="routeHeader">
        <div>
          <div className="routeLabel">{origin.toUpperCase()} → {destination.toUpperCase()}</div>
          <div className="routeSub">itinéraire réel · optimisation Floway</div>
        </div>
        <button className="ghostButton" onClick={() => setEditingRoute(true)}>✎ Modifier</button>
      </section>

      <section className="tripSummary">
        <div><span>TRAJET</span><strong>{routeData ? formatDuration(routeData.durationMin) : '—'}</strong><small>{routeData ? `${routeData.distanceKm} km` : 'analyse'}</small></div>
        <div><span>STATIONS</span><strong>{routeData?.stations.length ?? '—'}</strong><small>données officielles</small></div>
        <div><span>TRAFIC</span><strong>{trafficStatus?.connected ? 'LIVE' : '—'}</strong><small>Bison Futé</small></div>
        <div className="summaryGain"><span>GAIN</span><strong>{best ? `≈ ${saved} min` : '—'}</strong><small>potentiel</small></div>
      </section>

      <section className={`trafficLiveCard ${trafficStatus?.connected ? 'connected' : ''}`}>
        <div><span className="miniLabel">SIGNAL ROUTIER</span><h2>{trafficStatus?.connected ? 'Trafic public connecté' : 'Connexion trafic'}</h2><p>{trafficStatus?.traffic?.scope || 'Analyse des flux et événements publics.'}</p></div>
        <div className="trafficLiveMeta"><strong>{trafficStatus?.traffic?.available ? 'ACTIF' : 'PARTIEL'}</strong><span>{trafficStatus?.traffic?.expectedRefresh || '1–6 min'}</span><small>{formatFreshness(trafficStatus?.traffic?.latestPublicationSeen)}</small></div>
      </section>

      {routeError && <div className="routeError routeErrorMain">{routeError}</div>}

      <section className="mapPanel">
        <div className="mapTexture" />
        <div className="savedBadge"><strong>{best ? `${saved} MIN` : 'IA'}</strong><span>GAGNÉES</span></div>
        <div className="routeLine" />
        {displayedStations.map((station, index) => {
          const isBest = station.id === best?.id;
          return (
            <button className={`routeStop stop${index + 1} ${isBest ? 'routeBest' : ''}`} key={station.id} onClick={() => setSelectedStation(station)}>
              <div className={`routeDot ${tone(station.waitMin)}`} />
              <div className="routeCopy"><strong>{station.waitMin} min</strong><span>{station.city || station.name}</span><small>{station.distanceKm} km</small></div>
            </button>
          );
        })}
        <button className="locationFab" onClick={locate} disabled={locating}>➤</button>
      </section>

      {best ? (
        <section className="bestCard">
          <div className="cardTopline"><span>MEILLEUR ARRÊT</span><b>≈ {saved} MIN GAGNÉES</b></div>
          <h1>{best.city ? `STATION ${best.city.toUpperCase()}` : best.name.toUpperCase()}</h1>
          <p>{best.address} · dans {best.distanceKm} km</p>
          <div className="dataGrid">
            <div><span>ATTENTE IA</span><strong className="greenText">{best.waitMin} min</strong></div>
            <div><span>PRIX OFFICIEL</span><strong>{best.price.toFixed(3)} €/L</strong></div>
            <div><span>DÉTOUR</span><strong className="orangeText">+{best.detourMin} min</strong></div>
          </div>
          <div className="confidenceLine"><span>CONFIANCE IA</span><div className="confidenceDots"><i /><i /><i /><i /><i /></div><b>{best.waitModel.confidence}</b></div>
          <button className="cta" onClick={() => setSelectedStation(best)}>VOIR LE DÉTAIL <span>›</span></button>
        </section>
      ) : !routeLoading && (
        <section className="bestCard"><div className="cardTopline"><span>ANALYSE FLOWAY</span></div><h1>AUCUNE STATION ÉLIGIBLE</h1><p>Aucune station avec prix {fuel} n’a été identifiée à proximité immédiate de cet itinéraire.</p></section>
      )}

      <section id="stations-section" className="compareSection">
        <div className="sectionHead"><div><span className="miniLabel">PROCHAINES STATIONS</span><h2>Comparatif Floway</h2></div><select value={fuel} onChange={(e) => void changeFuel(e.target.value)} disabled={routeLoading}><option>Gazole</option><option>SP95-E10</option><option>SP98</option><option>E85</option></select></div>
        <div className="stationStack">
          {ranked.slice(0, 10).map((station) => (
            <article className={`retroCard ${tone(station.waitMin)}Border`} key={station.id}>
              <button className="stationMainButton" onClick={() => setSelectedStation(station)}>
                <div className="retroCardHead"><div className={`pumpIcon ${tone(station.waitMin)}`}>⛽</div><div><span className="miniLabel">{station.id === best?.id ? 'RECOMMANDÉ' : station.waitModel.label}</span><h3>{station.city ? station.city.toUpperCase() : station.name.toUpperCase()}</h3><p>{station.address} · {station.distanceKm} km</p></div><span className="stationChevron">›</span></div>
                <div className="retroStats"><div><span>ATTENTE</span><strong>{station.waitMin} min</strong></div><div><span>PRIX</span><strong>{station.price.toFixed(3)} €/L</strong></div><div><span>DÉTOUR</span><strong>+{station.detourMin} min</strong></div></div>
              </button>
              <div className="queueRow"><button className={queueStation === station.id ? 'queueButton active' : 'queueButton'} onClick={() => setQueueStation(queueStation === station.id ? null : station.id)}>{queueStation === station.id ? '✓ PRÉSENCE SIGNALÉE' : 'JE SUIS DANS LA FILE'}</button><span className="crowdCount">◉ {Math.max(12, Math.round(28 + station.waitMin * 6))}</span></div>
            </article>
          ))}
        </div>
      </section>

      <section id="community-section" className="communityPanel">
        <span className="miniLabel">COMMUNAUTÉ FLOWAY</span>
        <h2>Le trafic devient plus intelligent avec chaque conducteur.</h2>
        <div className="communityGrid"><div><strong>Présence</strong><span>Détecter les files</span></div><div><strong>Sortie</strong><span>Mesurer la durée</span></div><div><strong>IA</strong><span>Prédire l’attente</span></div></div>
      </section>

      <section id="profile-section" className="profilePanel">
        <span className="miniLabel">PROFIL CONDUCTEUR</span><h2>Préférences de trajet</h2><div className="profilePills"><span>{fuel}</span><span>Temps prioritaire</span><span>Autoroute</span></div>
      </section>

      <div className="positionNote">{position} · {fuel}</div>
      <nav className="bottomNav">
        <button className={activeTab === 'route' ? 'activeNav' : ''} onClick={() => goTab('route')}>⌁<span>Route</span></button>
        <button className={activeTab === 'stations' ? 'activeNav' : ''} onClick={() => goTab('stations')}>⛽<span>Stations</span></button>
        <button className={activeTab === 'community' ? 'activeNav' : ''} onClick={() => goTab('community')}>◉<span>Communauté</span></button>
        <button className={activeTab === 'profile' ? 'activeNav' : ''} onClick={() => goTab('profile')}>○<span>Profil</span></button>
      </nav>

      {selectedStation && (
        <div className="stationDetailBackdrop" onClick={() => setSelectedStation(null)}>
          <section className="stationDetail" onClick={(e) => e.stopPropagation()}>
            <div className="detailHero">
              <button className="detailBack" onClick={() => setSelectedStation(null)}>←</button><button className="detailStar">☆</button>
              <span className="miniLabel">STATION</span><h2>{selectedStation.city?.toUpperCase() || selectedStation.name.toUpperCase()}</h2><p>{selectedStation.address}</p>
              <div className="detailBadges"><span>RECOMMANDÉ</span><b>≈ {saved} MIN GAGNÉES</b></div>
            </div>
            <div className="stationIllustration"><div className="sunGlow" /><div className="canopy" /><div className="pumpOne">⛽</div><div className="pumpTwo">⛽</div><div className="roadStripe" /></div>
            <div className="detailQuickActions"><button>➤<span>ITINÉRAIRE</span></button><button>⛽<span>PRIX</span></button><button>ⓘ<span>INFOS</span></button></div>
            <div className="detailMetrics">
              <div className="retroWait"><span>ATTENTE ESTIMÉE</span><strong>{String(selectedStation.waitMin).padStart(2, '0')}</strong><em>MIN</em></div>
              <div className="detailFlow"><span>{tone(selectedStation.waitMin) === 'good' ? 'FLUIDE' : tone(selectedStation.waitMin) === 'medium' ? 'MODÉRÉ' : 'CHARGÉ'}</span><div className="confidenceDots"><i /><i /><i /><i /><i /></div><small>Confiance {selectedStation.waitModel.confidence}</small></div>
            </div>
            <div className="detailFuel"><span>CARBURANT</span><div className="fuelGrid"><div className="selectedFuel"><small>{fuel}</small><strong>{selectedStation.price.toFixed(3)} €</strong></div><div><small>Distance</small><strong>{selectedStation.distanceKm} km</strong></div><div><small>Détour</small><strong>+{selectedStation.detourMin} min</strong></div></div></div>
            <div className="detailServices"><span>SERVICES DISPONIBLES</span><div>{(selectedStation.services.length ? selectedStation.services : ['Toilettes','Restauration','Boutique','Wifi']).slice(0,6).map((service) => <i key={service} title={service}>{serviceIcon(service)}</i>)}</div></div>
            <div className="aiExplain detailExplain"><b>POURQUOI FLOWAY LA RECOMMANDE</b>{selectedStation.waitModel.factors.map((factor) => <span key={factor}>• {factor}</span>)}</div>
            <button className="cta detailCta">CHOISIR CET ARRÊT <span>›</span></button>
          </section>
        </div>
      )}

      {editingRoute && (
        <div className="modalBackdrop" onClick={() => !routeLoading && setEditingRoute(false)}>
          <form className="routeModal" onSubmit={saveRoute} onClick={(e) => e.stopPropagation()}>
            <span className="miniLabel">NOUVEL ITINÉRAIRE</span><h2>Où va-t-on ?</h2>
            <label>Départ<input value={draftOrigin} onChange={(e) => setDraftOrigin(e.target.value)} disabled={routeLoading} /></label>
            <label>Destination<input value={draftDestination} onChange={(e) => setDraftDestination(e.target.value)} disabled={routeLoading} /></label>
            {routeError && <div className="routeError">{routeError}</div>}
            <div className="modalActions"><button type="button" className="ghostButton" onClick={() => setEditingRoute(false)} disabled={routeLoading}>Annuler</button><button type="submit" className="cta" disabled={routeLoading}>{routeLoading ? 'FLOWAY ANALYSE…' : 'ANALYSER LE TRAJET →'}</button></div>
            <small>Trajet et stations réels. Prix officiels. L’attente est une estimation Floway enrichie par les signaux trafic disponibles.</small>
          </form>
        </div>
      )}
    </main>
  );
}
