'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Station = {
  id: string;
  name: string;
  address: string;
  city: string;
  distanceKm: number;
  routeOffsetKm: number;
  price: number;
  waitMin: number;
  detourMin: number;
  lat?: number;
  lon?: number;
  arrivalIso?: string;
  arrivalHour?: number;
  arrivalMinute?: number;
  services: string[];
  serviceCategories?: string[];
  flowayContextScore?: number;
  smartContext?: { period: string; intent: string; preferredServices: string[]; contextFit: number; message: string };
  waitModel: { label: string; confidence: string; factors: string[] };
};

type RouteData = {
  origin: { label: string; lat: number; lon: number };
  destination: { label: string; lat: number; lon: number };
  distanceKm: number;
  durationMin: number;
  departureAt?: string;
  arrivalAt?: string;
  stations: Station[];
  fuel: string;
};

type Filter = 'Tous' | 'Restauration' | 'Café' | 'Boutique' | 'Toilettes';

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function duration(minutes = 0) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

function clock(station?: Station) {
  if (!station || station.arrivalHour == null) return '--:--';
  return `${String(station.arrivalHour).padStart(2, '0')}:${String(station.arrivalMinute || 0).padStart(2, '0')}`;
}

function score(s: Station) {
  return s.waitMin + s.detourMin + s.price * 2 - (s.flowayContextScore || 0);
}

function iconFor(categories?: string[]) {
  const c = categories || [];
  if (c.includes('Restauration')) return '🍴';
  if (c.includes('Café')) return '☕';
  if (c.includes('Recharge VE')) return '⚡';
  if (c.includes('Boutique')) return '🛍';
  return '⛽';
}

export default function PremiumHome() {
  const [origin, setOrigin] = useState('Paris');
  const [destination, setDestination] = useState('Lyon');
  const [draftOrigin, setDraftOrigin] = useState('Paris');
  const [draftDestination, setDraftDestination] = useState('Lyon');
  const [departureAt, setDepartureAt] = useState(localDateTimeValue());
  const [draftDepartureAt, setDraftDepartureAt] = useState(localDateTimeValue());
  const [fuel, setFuel] = useState('Gazole');
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Station | null>(null);
  const [startAfterKm, setStartAfterKm] = useState(120);
  const [filter, setFilter] = useState<Filter>('Tous');

  async function loadRoute(from: string, to: string, nextFuel = fuel, when = departureAt) {
    setLoading(true);
    setError('');
    try {
      const iso = new Date(when).toISOString();
      const response = await fetch(`/api/route?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&fuel=${encodeURIComponent(nextFuel)}&departureAt=${encodeURIComponent(iso)}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Calcul impossible');
      setRoute(json);
      setOrigin(json.origin.label);
      setDestination(json.destination.label);
      setDepartureAt(when);
      const preferredStart = Math.min(Math.max(120, Math.round(json.distanceKm * 0.5 / 10) * 10), Math.max(0, Math.floor(json.distanceKm - 50)));
      setStartAfterKm(preferredStart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de calculer cet itinéraire.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const now = localDateTimeValue();
    setDepartureAt(now);
    setDraftDepartureAt(now);
    void loadRoute('Paris', 'Lyon', 'Gazole', now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stations = useMemo(() => [...(route?.stations || [])].sort((a, b) => a.distanceKm - b.distanceKm), [route]);
  const eligible = useMemo(() => stations.filter(s => s.distanceKm >= startAfterKm && (filter === 'Tous' || s.serviceCategories?.includes(filter))), [stations, startAfterKm, filter]);
  const best = useMemo(() => [...eligible].sort((a, b) => score(a) - score(b))[0], [eligible]);
  const next = eligible[0];
  const saved = best && next ? Math.max(0, next.waitMin + next.detourMin - best.waitMin - best.detourMin) : 0;
  const breaks = route ? Math.max(0, Math.floor((route.durationMin - 1) / 120)) : 0;
  const stopTime = breaks * 15;
  const timeline = useMemo(() => {
    if (!stations.length) return [];
    const picks = [0.15, 0.32, 0.5, 0.68, 0.84].map(ratio => stations.reduce((closest, item) => Math.abs(item.distanceKm - (route?.distanceKm || 1) * ratio) < Math.abs(closest.distanceKm - (route?.distanceKm || 1) * ratio) ? item : closest, stations[0]));
    return [...new Map(picks.map(s => [s.id, s])).values()];
  }, [stations, route]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await loadRoute(draftOrigin.trim(), draftDestination.trim(), fuel, draftDepartureAt);
    setEditing(false);
  }

  return (
    <main className="premiumApp">
      <header className="premiumTopbar">
        <button className="roundIcon" aria-label="Menu">☰</button>
        <div className="premiumBrand"><span className="wing">≋</span><strong>Floway</strong><small>CHAQUE PAUSE COMPTE</small></div>
        <button className="roundIcon alertIcon" aria-label="Alertes">♧<b>2</b></button>
      </header>

      <section className="heroJourney">
        <div className="heroShade" />
        <div className="heroContent">
          <span className="hello">Bonjour 👋</span>
          <h1>Prêt pour<br/>une belle route ?</h1>
          <div className="heroRoute"><strong>{origin.split(',')[0]} <i>→</i> {destination.split(',')[0]}</strong><button onClick={() => setEditing(true)}>✎</button></div>
          <div className="heroMetrics">
            <div><b>{route ? Math.round(route.distanceKm) : '—'} km</b><span>Distance</span></div>
            <div><b>{route ? duration(route.durationMin) : '—'}</b><span>Conduite</span></div>
            <div><b>{breaks}</b><span>Pauses conseillées</span></div>
          </div>
          <button className="fullTank" onClick={() => setStartAfterKm(route ? Math.min(Math.round(route.distanceKm * .55 / 10) * 10, Math.max(0, route.distanceKm - 60)) : 120)}>DÉPART AVEC LE PLEIN <span>⛽</span></button>
        </div>
      </section>

      {error && <div className="premiumError">{error}</div>}

      <section className="journeyProgress">
        <div className="sectionKicker">MON ITINÉRAIRE</div>
        <div className="progressLabels"><strong>{origin.split(',')[0]}</strong><strong>{destination.split(',')[0]}</strong></div>
        <div className="progressTrack">
          <span className="trackFill" />
          <i className="startDot" />
          <span className="movingCar">🚗</span>
          {timeline.map((station, idx) => <button key={station.id} style={{ left: `${18 + idx * 16}%` }} className="timelineMarker" onClick={() => setSelected(station)}>{iconFor(station.serviceCategories)}</button>)}
          <i className="endDot" />
        </div>
        <div className="progressScale"><span>0 km</span><span>{route ? Math.round(route.distanceKm / 2) : 0} km</span><span>{route ? Math.round(route.distanceKm) : 0} km</span></div>
      </section>

      {best && (
        <section className="bestStopCard">
          <div className="bestStopPhoto"><span>PROCHAINE PAUSE RECOMMANDÉE</span><button onClick={() => setSelected(best)}>♡</button></div>
          <div className="bestStopBody">
            <div className="bestStopMain">
              <h2>Aire de<br/>{best.city || best.name}</h2>
              <div className="serviceIcons">
                {(best.serviceCategories || ['Carburant']).slice(0, 6).map(service => <span key={service}><i>{service === 'Restauration' ? '🍴' : service === 'Café' ? '☕' : service === 'Boutique' ? '🛍' : service === 'Toilettes' ? '🚻' : service === 'Recharge VE' ? '⚡' : '⛽'}</i>{service}</span>)}
              </div>
            </div>
            <aside>
              <b>Dans {Math.round(best.distanceKm)} km</b>
              <strong>~{duration(Math.round((best.distanceKm / Math.max(route?.distanceKm || 1, 1)) * (route?.durationMin || 0)))}</strong>
              <small>passage {clock(best)}</small>
              <button onClick={() => setSelected(best)}>VOIR LE DÉTAIL</button>
            </aside>
          </div>
        </section>
      )}

      <section className="twoColumnPremium">
        <div className="routeFeed">
          <div className="panelHead"><div><span>FIL DU VOYAGE</span><h2>Toutes les stations sur l’itinéraire</h2></div><b>{stations.length} stations</b></div>
          <div className="verticalRoute">
            <div className="verticalLine" />
            <div className="routeEndpoint"><i/> <strong>{origin.split(',')[0]}</strong><span>0 km</span></div>
            {timeline.map((station, index) => <button key={station.id} className={station.id === best?.id ? 'feedStop best' : 'feedStop'} onClick={() => setSelected(station)}><i>{iconFor(station.serviceCategories)}</i><div><strong>{station.city || station.name}</strong><span>{Math.round(station.distanceKm)} km · {clock(station)}</span></div>{station.id === best?.id && <b>FLOWAY AI</b>}</button>)}
            <div className="routeEndpoint destination"><i/> <strong>{destination.split(',')[0]}</strong><span>{route ? Math.round(route.distanceKm) : 0} km</span></div>
          </div>
        </div>

        <div className="aiPanel">
          <div className="panelHead"><div><span>FLOWAY AI</span><h2>Optimisé pour vous</h2></div><b>✦</b></div>
          <div className="aiOrb"><i/><i/><i/><strong>✦</strong></div>
          <p>{best?.smartContext?.message || 'Floway analyse votre heure de passage, les services disponibles, le détour et l’attente estimée pour choisir le meilleur arrêt.'}</p>
          <div className="aiMetrics"><div><span>TEMPS GAGNÉ</span><b>≈ {saved} min</b></div><div><span>DÉTOUR</span><b>{best ? `+${best.detourMin} min` : '—'}</b></div><div><span>ATTENTE</span><b>{best ? `${best.waitMin} min` : '—'}</b></div></div>
        </div>
      </section>

      <section className="plannerPremium">
        <div><span>QUAND VEUX-TU COMMENCER À CHERCHER ?</span><h2>Après {Math.round(startAfterKm)} km · environ {route ? duration(Math.round(startAfterKm / Math.max(route.distanceKm, 1) * route.durationMin)) : '—'}</h2></div>
        <input type="range" min="0" max={Math.max(50, Math.floor(route?.distanceKm || 500))} step="10" value={startAfterKm} onChange={e => setStartAfterKm(Number(e.target.value))}/>
        <div className="filterChips">{(['Tous','Restauration','Café','Boutique','Toilettes'] as Filter[]).map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      </section>

      <section className="featureGridPremium">
        <article><span>PAUSES INTELLIGENTES</span><h3>Au bon moment,<br/>au bon endroit.</h3><div className="miniPhoto stopPhoto"/></article>
        <article><span>ÉLECTRIQUE</span><h3>Recharge et pause<br/>synchronisées.</h3><a href="/ev">OUVRIR LE MODE EV →</a></article>
        <article><span>TOUS LES VÉHICULES</span><h3>Thermique · Hybride · Électrique</h3><div className="vehicleIcons">⛽ ⚡ 🔌</div></article>
        <article><span>TEMPS OPTIMISÉ</span><h3>Moins d’attente,<br/>plus de plaisir.</h3><strong>+{stopTime} min de pause utiles</strong></article>
      </section>

      <section className="stationStrip" id="stations">
        <div className="panelHead"><div><span>APRÈS {Math.round(startAfterKm)} KM</span><h2>Arrêts disponibles</h2></div><select value={fuel} onChange={e => { setFuel(e.target.value); void loadRoute(origin, destination, e.target.value, departureAt); }}><option>Gazole</option><option>SP95-E10</option><option>SP98</option><option>E85</option></select></div>
        <div className="stationCards">{eligible.slice(0, 12).map(station => <button key={station.id} onClick={() => setSelected(station)}><span>{iconFor(station.serviceCategories)}</span><strong>{station.city || station.name}</strong><small>{Math.round(station.distanceKm)} km · {clock(station)}</small><b>{station.waitMin} min</b></button>)}</div>
      </section>

      <nav className="premiumNav"><button className="active">⌁<span>Route</span></button><button onClick={() => document.getElementById('stations')?.scrollIntoView({behavior:'smooth'})}>⛽<span>Stations</span></button><a href="/ev">✦<span>Floway AI</span></a><button>◉<span>Communauté</span></button><button>○<span>Profil</span></button></nav>

      {editing && <div className="premiumModalBackdrop" onClick={() => !loading && setEditing(false)}><form className="premiumModal" onSubmit={submit} onClick={e => e.stopPropagation()}><span>NOUVEL ITINÉRAIRE</span><h2>Où va-t-on ?</h2><label>Départ<input value={draftOrigin} onChange={e => setDraftOrigin(e.target.value)}/></label><label>Destination<input value={draftDestination} onChange={e => setDraftDestination(e.target.value)}/></label><label>Heure de départ<input type="datetime-local" value={draftDepartureAt} onChange={e => setDraftDepartureAt(e.target.value)}/></label><button disabled={loading}>{loading ? 'ANALYSE…' : 'ANALYSER LE TRAJET →'}</button></form></div>}

      {selected && <div className="premiumModalBackdrop" onClick={() => setSelected(null)}><section className="stationDetailPremium" onClick={e => e.stopPropagation()}><button className="detailClose" onClick={() => setSelected(null)}>←</button><div className="detailPhoto"><span>RECOMMANDÉ PAR FLOWAY</span></div><div className="detailContent"><h2>Aire de {selected.city || selected.name}</h2><p>{Math.round(selected.distanceKm)} km · passage {clock(selected)}</p><div className="detailMetricGrid"><div><span>ATTENTE</span><b>{selected.waitMin} min</b></div><div><span>PRIX</span><b>{selected.price.toFixed(3)} €/L</b></div><div><span>DÉTOUR</span><b>+{selected.detourMin} min</b></div></div><div className="detailServices">{(selected.serviceCategories || ['Carburant']).map(s => <span key={s}>{s}</span>)}</div><div className="detailAi"><span>FLOWAY AI</span><p>{selected.smartContext?.message || selected.waitModel.factors.join(' · ')}</p></div><button className="chooseStop" onClick={() => setSelected(null)}>CHOISIR CET ARRÊT →</button></div></section></div>}
    </main>
  );
}
