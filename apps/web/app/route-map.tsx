'use client';

/**
 * Carte de l'itinéraire.
 *
 * Fond de carte : tuiles de la Géoplateforme IGN, sans clé d'API, en
 * Licence Ouverte. Deux couches disponibles, plan et vue aérienne.
 *
 * Aucune bibliothèque cartographique n'est embarquée : le pavage et la
 * projection tiennent dans `packages/algorithms/slippy-map.mjs`, testé. Le
 * tracé, les arrêts et la position vive sont dessinés en SVG au-dessus des
 * tuiles. C'est un choix de sobriété — l'application traîne déjà 134 Ko de
 * CSS, lui ajouter une dépendance de plusieurs centaines de kilo-octets pour
 * afficher une ligne et des points ne se justifiait pas.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fitView,
  panView,
  simplifyForDisplay,
  tilesFor,
  toScreen,
  zoomView,
  zoomViewAt,
  type MapView,
} from './lib/map/slippy-map';
import styles from './route-map.module.css';

const WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM';

const LAYERS = {
  plan: { label: 'Plan', layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', format: 'image/png' },
  aerien: { label: 'Vue aérienne', layer: 'ORTHOIMAGERY.ORTHOPHOTOS', format: 'image/jpeg' },
} as const;

type LayerId = keyof typeof LAYERS;

const tileUrl = (layer: LayerId, x: number, y: number, z: number) =>
  `${WMTS}&LAYER=${LAYERS[layer].layer}&FORMAT=${LAYERS[layer].format}&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;

/**
 * Tuile de trafic, servie par notre relais.
 *
 * L'URL TomTom porte la clé d'API : elle ne peut pas figurer dans le `src`
 * d'une image. `/api/traffic-tiles` la garde côté serveur.
 */
const trafficTileUrl = (x: number, y: number, z: number) => `/api/traffic-tiles/${z}/${x}/${y}`;

/**
 * Zoom en deçà duquel la couche de trafic n'apporte rien : les axes se
 * superposent et la couleur devient illisible. Le seuil était à 6, ce qui
 * masquait la couche sur une vue France entière — exactement le cadrage par
 * défaut d'un Paris–Marseille : on appuyait sur « Trafic » et rien
 * n'apparaissait. À 5, le trafic autoroutier reste lisible.
 */
const ZOOM_TRAFIC_MIN = 5;

export type MapStop = {
  id: string;
  lat?: number;
  lon?: number;
  label: string;
  /** Motif de l'arrêt, qui détermine la couleur du repère. */
  kind?: 'carburant' | 'repas' | 'confort';
  highway?: boolean;
};

type Props = {
  /** Géométrie de l'itinéraire, couples [lon, lat]. */
  geometry: [number, number][];
  stops?: MapStop[];
  live?: { lat: number; lon: number } | null;
  height?: number;
  /** Appele quand un repere est active, au clic ou au clavier. */
  onSelectStop?: (id: string) => void;
  /** Couche de trafic active des l'affichage. */
  traffic?: boolean;
  /**
   * Zoom maximal du cadrage initial.
   *
   * Sur un point unique — une position sans itineraire — le cadrage choisit
   * sinon le zoom le plus fin possible, ce qui donne une vue de quartier la ou
   * on attend une vue regionale.
   */
  fitMaxZoom?: number;
};

export default function RouteMap({
  geometry,
  stops = [],
  live = null,
  height = 280,
  onSelectStop,
  traffic: traficInitial = false,
  fitMaxZoom,
}: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height });
  const [layer, setLayer] = useState<LayerId>('plan');
  // Couche de trafic : demandée par l'utilisateur, donc jamais imposée.
  const [trafic, setTrafic] = useState(traficInitial);
  // Le relais répond 503 sans clé TomTom. On l'affiche au lieu de laisser un
  // calque muet laisser croire à une route déserte.
  const [traficIndisponible, setTraficIndisponible] = useState(false);
  const [view, setView] = useState<MapView | null>(null);
  const [moved, setMoved] = useState(false);
  // `capture` : la capture du pointeur n'est prise qu'au premier mouvement
  // reel. Prise des `pointerdown`, elle detournait le `click` vers le cadre et
  // aucun bouton de la carte ne repondait — plan, vue aerienne, zoom, recadrer,
  // trafic. Les reperes y echappaient seuls, par `stopPropagation`.
  const drag = useRef<{ x: number; y: number; id: number; capture: boolean } | null>(null);
  // Pointeurs actifs sur le cadre : deux doigts posés valent un pincement.
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  // Écart initial du pincement et vue au moment où il a commencé. Le zoom du
  // pavage est entier : on ne change de niveau qu'au franchissement d'un
  // doublement ou d'une division par deux de l'écart.
  const pince = useRef<{ ecart: number; x: number; y: number } | null>(null);

  // La largeur n'est connue qu'après le montage : on la mesure et on la suit.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [height]);

  const path = useMemo(() => simplifyForDisplay(geometry || [], 400), [geometry]);

  // Cadrage initial, et recadrage si l'itinéraire change — mais pas après un
  // déplacement manuel : reprendre la main à l'utilisateur serait pénible.
  useEffect(() => {
    if (!path.length || !size.width) return;
    setView(fitView(path, size.width, size.height, { padding: 26, ...(fitMaxZoom ? { maxZoom: fitMaxZoom } : {}) }));
    setMoved(false);
  }, [path, size.width, size.height, fitMaxZoom]);

  const tiles = useMemo(
    () => (view ? tilesFor(view, size.width, size.height) : []),
    [view, size.width, size.height],
  );

  const line = useMemo(() => {
    if (!view || !size.width) return '';
    return path
      .map(([lon, lat]) => toScreen(lon, lat, view, size.width, size.height))
      .filter(Boolean)
      .map((p, i) => `${i ? 'L' : 'M'}${p!.x.toFixed(1)},${p!.y.toFixed(1)}`)
      .join(' ');
  }, [path, view, size.width, size.height]);

  const placed = useMemo(() => {
    if (!view || !size.width) return [];
    return stops
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => ({ stop: s, at: toScreen(s.lon!, s.lat!, view, size.width, size.height)! }))
      .filter((s) => s.at.x > -30 && s.at.x < size.width + 30 && s.at.y > -30 && s.at.y < size.height + 30);
  }, [stops, view, size.width, size.height]);

  const livePoint = useMemo(
    () => (view && live && size.width ? toScreen(live.lon, live.lat, view, size.width, size.height) : null),
    [live, view, size.width, size.height],
  );

  const start = path.length && view ? toScreen(path[0][0], path[0][1], view, size.width, size.height) : null;
  const end =
    path.length && view
      ? toScreen(path[path.length - 1][0], path[path.length - 1][1], view, size.width, size.height)
      : null;

  const relacher = (e: React.PointerEvent<HTMLDivElement>) => {
    pointeurs.current.delete(e.pointerId);
    if (pointeurs.current.size < 2) pince.current = null;
    if (drag.current?.capture && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  };

  const recadrer = () => {
    if (!path.length || !size.width) return;
    setView(fitView(path, size.width, size.height, { padding: 26, ...(fitMaxZoom ? { maxZoom: fitMaxZoom } : {}) }));
    setMoved(false);
  };

  return (
    <div className={styles.wrapper} style={{ height }}>
      <div
        ref={frame}
        className={styles.frame}
        onPointerDown={(e) => {
          pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointeurs.current.size === 2) {
            // Deuxième doigt : on passe en pincement et on abandonne le
            // déplacement à un doigt, sinon la carte glisserait en zoomant.
            const [a, b] = [...pointeurs.current.values()];
            pince.current = {
              ecart: Math.hypot(a.x - b.x, a.y - b.y),
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2,
            };
            drag.current = null;
            return;
          }
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, capture: false };
        }}
        onPointerMove={(e) => {
          if (pointeurs.current.has(e.pointerId)) {
            pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          }

          // --- pincement à deux doigts -------------------------------------
          if (pointeurs.current.size >= 2 && pince.current && view) {
            const [a, b] = [...pointeurs.current.values()];
            const ecart = Math.hypot(a.x - b.x, a.y - b.y);
            if (ecart < 24 || pince.current.ecart < 24) return;
            const rapport = ecart / pince.current.ecart;
            // Un niveau de pavage vaut un facteur deux : on n'agit qu'au
            // franchissement, ce qui évite de sauter de niveau sur un
            // tremblement de doigt.
            const pas = rapport >= 2 ? 1 : rapport <= 0.5 ? -1 : 0;
            if (pas !== 0) {
              const cadre = e.currentTarget.getBoundingClientRect();
              setView((v) =>
                v
                  ? zoomViewAt(v, pas, {
                      x: (a.x + b.x) / 2 - cadre.left,
                      y: (a.y + b.y) / 2 - cadre.top,
                      width: cadre.width,
                      height: cadre.height,
                    })
                  : v,
              );
              setMoved(true);
              pince.current = { ecart, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            }
            return;
          }

          if (!drag.current || !view) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) < 2) return;
          // Deplacement avere : on prend la main sur le pointeur pour suivre le
          // doigt hors du cadre, mais pas avant — sinon un simple appui devient
          // un glissement et le clic n'atteint jamais sa cible.
          if (!drag.current.capture) {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current.capture = true;
          }
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
          setView((v) => (v ? panView(v, dx, dy) : v));
          setMoved(true);
        }}
        onPointerUp={(e) => {
          relacher(e);
        }}
        onPointerCancel={(e) => {
          relacher(e);
        }}
        onPointerLeave={(e) => {
          // Un doigt qui quitte le cadre sans `pointerup` laisserait un
          // pincement fantôme, et le doigt restant ne déplacerait plus rien.
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) relacher(e);
        }}
      >
        {tiles.map((t) => (
          <img
            key={`${t.z}/${t.x}/${t.y}`}
            className={styles.tile}
            src={tileUrl(layer, t.x, t.y, t.z)}
            style={{ left: t.left, top: t.top }}
            alt=""
            draggable={false}
            loading="lazy"
          />
        ))}

        {trafic &&
          !traficIndisponible &&
          view &&
          view.zoom >= ZOOM_TRAFIC_MIN &&
          tiles.map((t) => (
            <img
              key={`trafic-${t.z}/${t.x}/${t.y}`}
              className={`${styles.tile} ${styles.trafficTile}`}
              src={trafficTileUrl(t.x, t.y, t.z)}
              style={{ left: t.left, top: t.top }}
              alt=""
              draggable={false}
              onError={() => setTraficIndisponible(true)}
            />
          ))}

        {view && size.width > 0 && (
          <svg
            className={styles.overlay}
            width={size.width}
            height={size.height}
            role={onSelectStop ? 'group' : 'presentation'}
            aria-label={onSelectStop ? 'Arrêts sur l’itinéraire' : undefined}
            aria-hidden={onSelectStop ? undefined : true}
          >
            <path className={styles.halo} d={line} aria-hidden="true" />
            <path className={styles.line} d={line} aria-hidden="true" />
            {start && <circle className={styles.start} cx={start.x} cy={start.y} r={6} />}
            {end && <circle className={styles.end} cx={end.x} cy={end.y} r={6} />}
            {placed.map(({ stop, at }) => {
              const actionnable = Boolean(onSelectStop);
              const activer = () => onSelectStop?.(stop.id);
              return (
                <g
                  key={stop.id}
                  className={`${styles.stop} ${actionnable ? styles.clickable : ''}`}
                  data-kind={stop.kind || 'confort'}
                  role={actionnable ? 'button' : undefined}
                  tabIndex={actionnable ? 0 : undefined}
                  aria-label={actionnable ? `Voir ${stop.label}` : undefined}
                  onClick={actionnable ? activer : undefined}
                  // Sans cela, appuyer sur un repere demarre un deplacement de
                  // la carte et le clic se perd.
                  onPointerDown={actionnable ? (e) => e.stopPropagation() : undefined}
                  onKeyDown={
                    actionnable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activer(); }
                        }
                      : undefined
                  }
                >
                  {/* Cible tactile confortable : le repere visible fait 14 px. */}
                  {actionnable && <circle className={styles.hit} cx={at.x} cy={at.y} r={18} />}
                  <circle cx={at.x} cy={at.y} r={7} />
                  {stop.highway && <rect x={at.x - 9} y={at.y - 15} width={18} height={10} rx={2} />}
                </g>
              );
            })}
            {livePoint && (
              <>
                <circle className={styles.livePulse} cx={livePoint.x} cy={livePoint.y} r={13} />
                <circle className={styles.live} cx={livePoint.x} cy={livePoint.y} r={6} />
              </>
            )}
          </svg>
        )}

        <div className={styles.controls}>
          <button type="button" onClick={() => setView((v) => (v ? zoomView(v, 1) : v))} aria-label="Zoomer">
            +
          </button>
          <button type="button" onClick={() => setView((v) => (v ? zoomView(v, -1) : v))} aria-label="Dézoomer">
            −
          </button>
          {moved && (
            <button type="button" className={styles.recenter} onClick={recadrer}>
              RECADRER
            </button>
          )}
        </div>

        <div className={styles.layers}>
          {(Object.keys(LAYERS) as LayerId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={id === layer ? styles.layerOn : undefined}
              onClick={() => setLayer(id)}
            >
              {LAYERS[id].label}
            </button>
          ))}
          <button
            type="button"
            className={trafic && !traficIndisponible ? styles.layerOn : undefined}
            aria-pressed={trafic}
            onClick={() => setTrafic((v) => !v)}
          >
            Trafic
          </button>
        </div>

        {trafic && (
          <div className={styles.trafficLegend}>
            {traficIndisponible ? (
              <span className={styles.trafficOff}>Trafic non connecté</span>
            ) : view && view.zoom < ZOOM_TRAFIC_MIN ? (
              <span className={styles.trafficOff}>Zoomez pour afficher le trafic</span>
            ) : (
              <>
                <i data-flux="libre" /> fluide
                <i data-flux="dense" /> dense
                <i data-flux="bloque" /> bloqué
                <b>TomTom · temps réel</b>
              </>
            )}
          </div>
        )}

        <small className={styles.credit}>
          © IGN — Géoplateforme{trafic && !traficIndisponible ? ' · trafic © TomTom' : ''}
        </small>
      </div>
    </div>
  );
}
