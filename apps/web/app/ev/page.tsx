'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

type Charger = {
  id: string;
  name: string;
  operator: string;
  distanceKm: number;
  routeOffsetKm: number;
  powerKw: number;
  count: number;
  fast: boolean;
  openingHours: string | null;
  sockets: string[];
};

type EvData = {
  origin: { label: string };
  destination: { label: string };
  distanceKm: number;
  durationMin: number;
  vehicle: { batteryKwh: number; consumption: number; startSoc: number; reserveSoc: number; targetSoc: number; rangeBeforeReserveKm: number };
  chargers: Charger[];
  recommendation: (Charger & { arrivalSoc: number; targetSoc: number; chargeMinutes: number; energyKwh: number }) | null;
  providers: { charging: string; nextDataSource: string };
};

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export default function EvPage() {
  const [origin, setOrigin] = useState('Paris');
  const [destination, setDestination] = useState('Lyon');
  const [batteryKwh, setBatteryKwh] = useState(75);
  const [consumption, setConsumption] = useState(18);
  const [startSoc, setStartSoc] = useState(80);
  const [reserveSoc, setReserveSoc] = useState(15);
  const [targetSoc, setTargetSoc] = useState(75);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<EvData | null>(null);

  async function analyse(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        origin,
        destination,
        batteryKwh: String(batteryKwh),
        consumption: String(consumption),
        startSoc: String(startSoc),
        reserveSoc: String(reserveSoc),
        targetSoc: String(targetSoc),
      });
      const response = await fetch(`/api/ev?${params.toString()}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Analyse électrique indisponible.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse électrique indisponible.');
    } finally {
      setLoading(false);
    }
  }

  const recommendation = data?.recommendation;
  const batteryFill = recommendation ? Math.max(4, Math.min(100, recommendation.arrivalSoc)) : startSoc;
  const tripEnergy = data ? data.distanceKm / 100 * consumption : 0;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}><span>⚡</span> FLOWAY</div>
          <div className={styles.modeBadge}>MODE ÉLECTRIQUE</div>
        </header>

        <div className={styles.content}>
          <section className={styles.hero}>
            <small>FLOWAY EV INTELLIGENCE</small>
            <h1>Recharge au bon moment.</h1>
            <p>Floway cherche les bornes réellement présentes autour de l’itinéraire et transforme la recharge en arrêt utile : repas, café ou pause.</p>

            <form className={styles.form} onSubmit={analyse}>
              <div className={styles.routeGrid}>
                <div className={styles.field}><label>DÉPART</label><input value={origin} onChange={e => setOrigin(e.target.value)} /></div>
                <div className={styles.field}><label>DESTINATION</label><input value={destination} onChange={e => setDestination(e.target.value)} /></div>
              </div>
              <div className={styles.vehicleGrid}>
                <div className={styles.field}><label>BATTERIE kWh</label><input type="number" min="20" max="150" value={batteryKwh} onChange={e => setBatteryKwh(Number(e.target.value))} /></div>
                <div className={styles.field}><label>CONSO kWh/100</label><input type="number" min="8" max="45" step="0.5" value={consumption} onChange={e => setConsumption(Number(e.target.value))} /></div>
                <div className={styles.field}><label>DÉPART %</label><input type="number" min="10" max="100" value={startSoc} onChange={e => setStartSoc(Number(e.target.value))} /></div>
                <div className={styles.field}><label>RÉSERVE %</label><input type="number" min="5" max="40" value={reserveSoc} onChange={e => setReserveSoc(Number(e.target.value))} /></div>
                <div className={styles.field}><label>CIBLE APRÈS CHARGE %</label><input type="number" min="40" max="95" value={targetSoc} onChange={e => setTargetSoc(Number(e.target.value))} /></div>
              </div>
              <button className={styles.primary} disabled={loading}>{loading ? 'FLOWAY ANALYSE LES BORNES…' : 'ANALYSER LE TRAJET ÉLECTRIQUE →'}</button>
            </form>
          </section>

          {error && <div className={styles.error}>{error}</div>}

          {data && (
            <>
              <section className={styles.metrics}>
                <div className={styles.metric}><span>TRAJET</span><strong>{data.distanceKm} km</strong><small>{formatDuration(data.durationMin)} de conduite estimée</small></div>
                <div className={styles.metric}><span>PORTÉE AVANT RÉSERVE</span><strong>{data.vehicle.rangeBeforeReserveKm} km</strong><small>{startSoc}% → {reserveSoc}%</small></div>
                <div className={styles.metric}><span>ÉNERGIE TRAJET</span><strong>≈ {Math.round(tripEnergy)} kWh</strong><small>à {consumption} kWh/100 km</small></div>
                <div className={`${styles.metric} ${styles.green}`}><span>BORNES TROUVÉES</span><strong>{data.chargers.length}</strong><small>dans le corridor Floway</small></div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionTitle}><div><small>ÉTAT ÉNERGÉTIQUE</small><h2>{data.origin.label.split(',')[0]} → {data.destination.label.split(',')[0]}</h2></div><b>{startSoc}% départ</b></div>
                <div className={styles.batteryTrack}><div className={styles.batteryFill} style={{ width: `${batteryFill}%` }} /></div>
                <small>Floway conserve une réserve cible de {reserveSoc}% pour éviter une arrivée à la borne trop tendue.</small>
              </section>

              {recommendation ? (
                <section className={`${styles.section} ${styles.recommend}`}>
                  <div className={styles.recommendHead}>
                    <div><small>RECHARGE RECOMMANDÉE</small><h2>{recommendation.name}</h2><p>{recommendation.operator} · à {Math.round(recommendation.distanceKm)} km</p></div>
                    <div className={styles.bolt}>⚡</div>
                  </div>
                  <div className={styles.stats}>
                    <div><span>BATTERIE À L’ARRIVÉE</span><strong>{recommendation.arrivalSoc}%</strong></div>
                    <div><span>PUISSANCE</span><strong>{recommendation.powerKw} kW</strong></div>
                    <div><span>RECHARGE</span><strong>≈ {recommendation.chargeMinutes} min</strong></div>
                  </div>
                  <div className={styles.ai}>
                    <strong>FLOWAY AI — LOGIQUE DE L’ARRÊT</strong>
                    <p>Cette borne est proche du point où ta batterie atteindra la zone de réserve, tout en privilégiant une puissance élevée, plusieurs points de charge et un détour faible. Floway vise {recommendation.targetSoc}% après la pause, soit environ {recommendation.energyKwh} kWh à reprendre.</p>
                  </div>
                </section>
              ) : <section className={styles.section}><div className={styles.empty}>Aucune borne exploitable trouvée dans le corridor de cet itinéraire.</div></section>}

              <section className={styles.section}>
                <div className={styles.sectionTitle}><div><small>FIL DE RECHARGE</small><h2>Bornes sur la route</h2></div><b>{data.chargers.length}</b></div>
                <div className={styles.chargerList}>
                  {data.chargers.slice(0, 12).map(charger => (
                    <div className={styles.charger} key={charger.id}>
                      <div className={styles.chargerIcon}>⚡</div>
                      <div><strong>{charger.name}</strong><span>{charger.operator} · {Math.round(charger.distanceKm)} km · détour {charger.routeOffsetKm} km</span></div>
                      <aside><b>{charger.powerKw} kW</b><small>{charger.count} point{charger.count > 1 ? 's' : ''}</small></aside>
                    </div>
                  ))}
                </div>
                <div className={styles.source}>Source actuelle : {data.providers.charging}. Étape suivante : {data.providers.nextDataSource} pour enrichir la couverture, la disponibilité dynamique et les caractéristiques officielles.</div>
              </section>
            </>
          )}

          <Link href="/" className={styles.back}>← Retour à Floway classique</Link>
        </div>
      </div>
    </main>
  );
}
