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

const STATIONS: Station[] = [
  { id: '1', name: 'Villabé', motorway: 'A6', distanceKm: 12, price: 1.919, waitMin: 18, detourMin: 1 },
  { id: '2', name: 'Nemours', motorway: 'A6', distanceKm: 31, price: 1.889, waitMin: 4, detourMin: 2 },
  { id: '3', name: 'Darvault', motorway: 'A6', distanceKm: 47, price: 1.899, waitMin: 8, detourMin: 3 },
  { id: '4', name: 'Courtenay', motorway: 'A6', distanceKm: 76, price: 1.909, waitMin: 12, detourMin: 2 },
];

function score(station: Station) {
  return station.waitMin + station.detourMin + Math.max(0, station.price - 1.889) * 100;
}

function tone(minutes: number) {
  if (minutes <= 5) return 'good';
  if (minutes <= 12) return 'medium';
  return 'bad';
}

export default function Home() {
  const [position, setPosition] = useState('Position non activée');
  const [locating, setLocating] = useState(false);
  const [fuel, setFuel] = useState('Gazole');
  const [queueStation, setQueueStation] = useState<string | null>(null);

  const ranked = useMemo(() => [...STATIONS].sort((a, b) => score(a) - score(b)), []);
  const best = ranked[0];
  const nearest = [...STATIONS].sort((a, b) => a.distanceKm - b.distanceKm)[0];
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
    <main className="appShell">
      <header className="brandBar">
        <div className="wing wingLeft" />
        <div className="logoWord">FLOWAY</div>
        <div className="wing wingRight" />
        <div className="subtitle">Le meilleur arrêt sur votre route</div>
      </header>

      <section className="routeHeader">
        <div>
          <div className="routeLabel">PARIS → LYON</div>
          <div className="routeSub">via A6</div>
        </div>
        <button className="ghostButton">Modifier</button>
      </section>

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
                <small>{station.distanceKm} km</small>
              </div>
            </div>
          );
        })}
        <button className="locationFab" onClick={locate} disabled={locating}>⌖</button>
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
        <button className="cta">CHOISIR CET ARRÊT <span>→</span></button>
      </section>

      <section className="compareSection">
        <div className="sectionHead">
          <div>
            <span className="miniLabel">PROCHAINES STATIONS</span>
            <h2>Comparatif en temps réel</h2>
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
              <button
                className={queueStation === station.id ? 'queueButton active' : 'queueButton'}
                onClick={() => setQueueStation(queueStation === station.id ? null : station.id)}
              >
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
        <div className="flowState"><strong>FLUIDE</strong><div>● ● ● ○ ○</div><small>Mise à jour il y a 1 min</small></div>
      </section>

      <div className="positionNote">{position} · {fuel}</div>

      <nav className="bottomNav">
        <button className="activeNav">⌁<span>Route</span></button>
        <button>⛽<span>Stations</span></button>
        <button>◉<span>Communauté</span></button>
        <button>○<span>Profil</span></button>
      </nav>
    </main>
  );
}
