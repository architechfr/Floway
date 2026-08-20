/**
 * Projection Web Mercator et découpage en tuiles.
 *
 * Permet d'afficher un fond de carte à partir de tuiles XYZ standard sans
 * embarquer de bibliothèque cartographique. Les tuiles de la Géoplateforme IGN
 * (`TILEMATRIXSET=PM`) suivent exactement ce schéma : `TILEMATRIX` est le zoom,
 * `TILECOL` la colonne, `TILEROW` la ligne.
 *
 * Le choix de ne pas dépendre de MapLibre est délibéré : l'application traîne
 * déjà 134 Ko de CSS et un problème de poids ; ce module fait une centaine de
 * lignes et couvre le besoin — afficher un itinéraire et ses arrêts.
 */

export const TILE_SIZE = 256;

/** Taille du monde en pixels à un niveau de zoom donné. */
export function worldSize(zoom) {
  return TILE_SIZE * 2 ** zoom;
}

/**
 * Longitude/latitude vers pixels monde.
 *
 * @returns {{x:number,y:number}}
 */
export function project(lon, lat, zoom) {
  const size = worldSize(zoom);
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clampedLat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * size;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * size;
  // Aux latitudes extrêmes, l'arrondi flottant peut sortir d'un cheveu du
  // monde : on borne, sinon une tuile inexistante serait demandée.
  return { x, y: Math.max(0, Math.min(size, y)) };
}

/** Pixels monde vers longitude/latitude. */
export function unproject(x, y, zoom) {
  const size = worldSize(zoom);
  const lon = (x / size) * 360 - 180;
  const n = Math.PI - 2 * Math.PI * (y / size);
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lon, lat };
}

/**
 * Cadre le tracé dans la surface disponible.
 *
 * @param {[number,number][]} coords couples [lon, lat]
 * @param {number} width largeur en pixels
 * @param {number} height hauteur en pixels
 * @param {object} [options]
 * @returns {{zoom:number,centerX:number,centerY:number}|null} centre en pixels monde
 */
export function fitView(coords, width, height, options = {}) {
  const { padding = 24, minZoom = 2, maxZoom = 17 } = options;
  const points = (coords || []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  );
  if (!points.length || !(width > 0) || !(height > 0)) return null;

  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);

  for (let zoom = Math.floor(maxZoom); zoom >= minZoom; zoom -= 1) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [lon, lat] of points) {
      const p = project(lon, lat, zoom);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (maxX - minX <= usableWidth && maxY - minY <= usableHeight) {
      return { zoom, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
    }
  }

  const p = project(points[0][0], points[0][1], minZoom);
  return { zoom: minZoom, centerX: p.x, centerY: p.y };
}

/**
 * Tuiles nécessaires pour couvrir la vue, avec leur position à l'écran.
 *
 * @returns {{x:number,y:number,z:number,left:number,top:number}[]}
 */
export function tilesFor(view, width, height) {
  if (!view || !(width > 0) || !(height > 0)) return [];
  const { zoom, centerX, centerY } = view;
  const count = 2 ** zoom;
  const originX = centerX - width / 2;
  const originY = centerY - height / 2;

  const firstCol = Math.floor(originX / TILE_SIZE);
  const lastCol = Math.floor((originX + width) / TILE_SIZE);
  const firstRow = Math.floor(originY / TILE_SIZE);
  const lastRow = Math.floor((originY + height) / TILE_SIZE);

  const tiles = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    // Hors des pôles il n'y a pas de tuile : on saute plutôt que d'en demander
    // une qui n'existe pas.
    if (row < 0 || row >= count) continue;
    for (let col = firstCol; col <= lastCol; col += 1) {
      // La longitude s'enroule : la colonne se ramène dans l'intervalle.
      const wrapped = ((col % count) + count) % count;
      tiles.push({
        x: wrapped,
        y: row,
        z: zoom,
        left: col * TILE_SIZE - originX,
        top: row * TILE_SIZE - originY,
      });
    }
  }
  return tiles;
}

/** Position à l'écran d'un point géographique, dans la vue donnée. */
export function toScreen(lon, lat, view, width, height) {
  if (!view) return null;
  const p = project(lon, lat, view.zoom);
  return {
    x: p.x - (view.centerX - width / 2),
    y: p.y - (view.centerY - height / 2),
  };
}

/**
 * Réduit un tracé au nombre de points nécessaires à son affichage.
 *
 * Une géométrie OSRM `overview=full` compte plusieurs milliers de points ;
 * en tracer autant dans un SVG de 400 pixels de large ne se voit pas et coûte
 * cher. On garde les extrémités et un point sur N.
 */
export function simplifyForDisplay(coords, maxPoints = 400) {
  const points = coords || [];
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Recentre la vue après un déplacement de `dx`, `dy` pixels écran. */
export function panView(view, dx, dy) {
  if (!view) return view;
  const size = worldSize(view.zoom);
  return {
    zoom: view.zoom,
    centerX: Math.max(0, Math.min(size, view.centerX - dx)),
    centerY: Math.max(0, Math.min(size, view.centerY - dy)),
  };
}

/** Change le zoom en conservant le centre géographique. */
export function zoomView(view, delta, { minZoom = 2, maxZoom = 17 } = {}) {
  if (!view) return view;
  const next = Math.max(minZoom, Math.min(maxZoom, view.zoom + delta));
  if (next === view.zoom) return view;
  const factor = 2 ** (next - view.zoom);
  return { zoom: next, centerX: view.centerX * factor, centerY: view.centerY * factor };
}
