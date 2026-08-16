'use client';

import { useMemo, useState } from 'react';

type Station = {
  id: string;
  name: string;
  motorway: string;
  distanceKm: number;
  price: number;
  waitMin: number;
  detourMin: number;
};

const DEMO_STATIONS: Station[] = [
  { id: '1', name: 'Aire de Villabé', motorway: 'A6', distanceKm: 12, price: 1.919, waitMin: 18, detourMin: 1 },
  { id: '2', name: 'Aire de Nemours', motorway: 'A6', distanceKm: 31, price: 1.889, waitMin: 4, detourMin: 2 },
  { id: '3', name: 'Aire de Darvault', motorway: 'A6', distanceKm: 47, price: 1.899, waitMin: 8, detourMin: 2 },
];

function score(station: Station) {
  return station.waitMin + station.detourMin + Math.max(0, station.price - 1.889) * 100;
}

function waitLabel(minutes: number) {
  if (minutes <= 5) return { label: 'Fluide', className: 'good' };
  if (minutes <= 12) return { label: 'Modéré', className: 'medium' };
  return { label: 'Chargé', className: 'bad' };
}

export default function Home() {
  const [position, setPosition] = useState<string>('Position non activée');
  const [locating, setLocating] = useState(false);
  const [queueStation, setQueueStation] = useState<string | null>(null);
  const [fuel, setFuel] = useState('Gazole');

  const ranked = useMemo(() => [...DEMO_STATIONS].sort((a, b) => score(a) - score(b)), []);
  const best = ranked[0];
  const nearest = [...DEMO_STATIONS].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const saved = Math.max(0, nearest.waitMin + nearest.detourMin - best.waitMin - best.detourMin);

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

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brandMark">F</div>
        <div>
          <div className="brand">Floway</div>
          <div className="tagline">Le meilleur arrêt sur votre route</div>
        </div>
        <span className="demoBadge">Prototype</span>
      </header>

      <section className="hero">
        <p className="eyebrow">ASSISTANT D’ARRÊT</p>
        <h1>Évite la file.<br />Garde la route.</h1>
        <p className="heroText">Floway compare les prochaines stations selon le détour, le prix et l’attente estimée.</p>

        <div className="controls">
          <button className="primary" onClick={locate} disabled={locating}>
            {locating ? 'Localisation…' : '⌖ Utiliser ma position'}
          </button>
          <select value={fuel} onChange={(event) => setFuel(event.target.value)} aria-label="Carburant">
            <option>Gazole</option>
            <option>SP95-E10</option>
            <option>SP98</option>
            <option>E85</option>
          </select>
        </div>
        <div className="locationLine">{position} · {fuel}</div>
      </section>

      <section className="recommendation">
        <div className="recommendationTop">
          <span className="pill">RECOMMANDÉ</span>
          <span className="gain">≈ {saved} min gagnées</span>
        </div>
        <h2>{best.name}</h2>
        <p className="road">{best.motorway} · dans {best.distanceKm} km</p>
        <div className="metrics">
          <div><span>Attente</span><strong>{best.waitMin} min</strong></div>
          <div><span>Prix démo</span><strong>{best.price.toFixed(3)} €</strong></div>
          <div><span>Détour</span><strong>+{best.detourMin} min</strong></div>
        </div>
        <button className="navigate">Choisir cet arrêt →</button>
      </section>

      <section className="section">
        <div className="sectionTitleRow">
          <div>
            <p className="eyebrow">PROCHAINES STATIONS</p>
            <h2>Comparatif en direct</h2>
          </div>
          <span className="confidence">Démo</span>
        </div>

        <div className="stationList">
          {ranked.map((station, index) => {
            const status = waitLabel(station.waitMin);
            return (
              <article className={`stationCard ${index === 0 ? 'best' : ''}`} key={station.id}>
                <div className="stationHead">
                  <div>
                    <h3>{station.name}</h3>
                    <p>{station.motorway} · {station.distanceKm} km</p>
                  </div>
                  <span className={`status ${status.className}`}>{status.label}</span>
                </div>
                <div className="stationNumbers">
                  <span><b>{station.waitMin}</b> min attente</span>
                  <span><b>{station.price.toFixed(3)}</b> €/L</span>
                </div>
                <button
                  className={queueStation === station.id ? 'queue active' : 'queue'}
                  onClick={() => setQueueStation(queueStation === station.id ? null : station.id)}
                >
                  {queueStation === station.id ? '✓ File signalée — terminer' : 'Je fais la queue ici'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <footer>
        <strong>Floway alpha</strong>
        <span>Les temps d’attente et prix affichés ici sont des données de démonstration.</span>
      </footer>
    </main>
  );
}
