'use client';

/**
 * Tableau du trafic — une carte à part, comme on consulte Sytadin.
 *
 * La couche de trafic existait déjà sur la carte d'itinéraire, mais elle y est
 * un calque parmi d'autres, sous le tracé et les arrêts. Ce qu'on cherche en
 * regardant le trafic est différent : voir l'état des axes autour de soi,
 * pouvoir se déplacer et zoomer librement, sans que l'itinéraire n'occupe
 * l'écran.
 *
 * Cette vue-ci n'affiche donc ni arrêt ni classement. Le tracé reste dessiné
 * quand il existe, comme repère, et rien d'autre.
 */

import { useState } from 'react';

import RouteMap from './route-map';
import styles from './traffic-board.module.css';

export default function TrafficBoard({
  geometry,
  live,
  incidentCount,
  connected,
}: {
  /** Tracé de l'itinéraire, s'il y en a un. Sert de repère, pas de sujet. */
  geometry?: [number, number][] | null;
  live?: { lat: number; lon: number } | null;
  incidentCount: number;
  connected: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  // Sans itinéraire, on cadre sur la position. Le zoom du cadrage est plafonné :
  // sur un point unique, l'ajustement choisirait le niveau le plus fin et
  // donnerait une vue de quartier là où on attend une vue régionale.
  const trace = geometry?.length ? geometry : live ? [[live.lon, live.lat] as [number, number]] : null;

  if (!trace) return null;

  return (
    <section className={styles.board}>
      <div className={styles.head}>
        <div>
          <span>TRAFIC</span>
          <h2>L’état des axes</h2>
        </div>
        <button type="button" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}>
          {ouvert ? 'RÉDUIRE' : 'OUVRIR LA CARTE'}
        </button>
      </div>

      <p className={styles.source}>
        {connected
          ? `TomTom Traffic · temps réel${incidentCount ? ` · ${incidentCount} incident${incidentCount > 1 ? 's' : ''} près de vous` : ''}`
          : 'Source trafic non connectée : rien n’est affiché plutôt qu’un état inventé.'}
      </p>

      {ouvert && (
        <RouteMap
          geometry={trace}
          live={live || null}
          height={460}
          traffic
          fitMaxZoom={geometry?.length ? undefined : 10}
        />
      )}
    </section>
  );
}
