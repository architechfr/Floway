'use client';

/**
 * Les cinq prochaines stations, pendant le trajet.
 *
 * En navigation, l'écran montrait la carte, la vitesse et les incidents, mais
 * rien de ce qui arrive : il fallait quitter la navigation pour savoir quelle
 * station venait ensuite. Ce panneau répond à la seule question utile au
 * volant — « qu'est-ce qui arrive, dans combien de kilomètres, à quelle
 * heure, à quel prix, avec quelle affluence ».
 *
 * Il ne calcule rien qu'il ne puisse justifier : sans allure connue, l'heure
 * de passage n'est pas affichée plutôt que devinée.
 */

import { waitLevel } from './lib/energy/stop-planner';
import { stationSubtitle, stationTitle } from './lib/station-label';
import styles from './next-stations.module.css';

export type NextStation = {
  id: string;
  name: string;
  brand?: string;
  city?: string;
  address?: string;
  distanceKm: number;
  price?: number;
  waitMin?: number;
  detourMin?: number;
  highway?: boolean;
  serviceCategories?: string[];
};

/** Nombre d'arrêts présentés. Au-delà, on lit une liste, on ne conduit plus. */
export const NEXT_STATIONS_COUNT = 5;

/**
 * Heure de passage estimée, à partir de l'allure moyenne de l'itinéraire.
 *
 * `null` si l'allure est inconnue : mieux vaut ne rien annoncer qu'annoncer
 * une heure sortie de nulle part.
 */
function passageAt(kmAhead: number, paceMinPerKm: number | null, now: Date) {
  if (paceMinPerKm === null || !Number.isFinite(kmAhead) || kmAhead < 0) return null;
  return new Date(now.getTime() + kmAhead * paceMinPerKm * 60000);
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function NextStations({
  stations,
  currentKm,
  distanceKm,
  durationMin,
  fuel,
  onSelect,
  now = new Date(),
}: {
  /** Stations de l'itinéraire, triées par point kilométrique. */
  stations: NextStation[];
  currentKm: number;
  distanceKm: number;
  durationMin: number;
  fuel: string;
  onSelect: (id: string) => void;
  now?: Date;
}) {
  const ahead = stations
    .filter((s) => Number.isFinite(s.distanceKm) && s.distanceKm >= currentKm)
    .slice(0, NEXT_STATIONS_COUNT);

  // Allure moyenne de l'itinéraire : la seule dont on dispose sans profil de
  // vitesse par tronçon. Elle vaut pour une estimation, pas pour une promesse.
  const pace = distanceKm > 0 && durationMin > 0 ? durationMin / distanceKm : null;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span>LES {NEXT_STATIONS_COUNT} PROCHAINES STATIONS</span>
        <small>{ahead.length ? `${fuel} · devant vous` : 'aucune donnée'}</small>
      </div>

      {ahead.length ? (
        <ol className={styles.list}>
          {ahead.map((s, index) => {
            const kmAhead = Math.max(0, s.distanceKm - currentKm);
            const at = passageAt(kmAhead, pace, now);
            const crowd = waitLevel(s.waitMin);
            const title = stationTitle(s);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => onSelect(s.id)}>
                  <b className={styles.rank}>{index + 1}</b>
                  <span className={styles.body}>
                    <strong>
                      {s.highway ? <i className={styles.highway}>A</i> : null}
                      {title}
                    </strong>
                    <small>
                      {[
                        stationSubtitle(s, title),
                        `dans ${Math.round(kmAhead)} km`,
                        at ? `vers ${hhmm(at)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                  <span className={styles.figures}>
                    {typeof s.price === 'number' ? <u>{s.price.toFixed(3)} €/L</u> : <u className={styles.unknown}>prix inconnu</u>}
                    <em>{crowd ? `${crowd.icon} ${crowd.label}` : '— affluence non estimée'}</em>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>
          Aucune station recensée devant vous sur cet itinéraire. Rien n’est affiché tant qu’une
          station réelle n’a pas été trouvée.
        </p>
      )}

      <p className={styles.truth}>
        Heure de passage estimée sur l’allure moyenne du trajet. L’affluence est une prédiction
        Floway, pas une mesure de file d’attente.
      </p>
    </div>
  );
}
