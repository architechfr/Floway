/**
 * Position d'un véhicule le long d'un itinéraire.
 *
 * Répond à deux défauts relevés en phase 3 de l'audit.
 *
 * **Le repère sautait de sommet en sommet.** La progression était celle du
 * sommet le plus proche (`cum[idx]`), pas celle du véhicule. Sur une portion
 * droite d'autoroute, deux sommets peuvent être distants de plusieurs
 * kilomètres : le repère restait figé, puis sautait. On projette désormais la
 * position sur le segment, ce qui donne une progression continue.
 *
 * **Tout l'itinéraire était re-parcouru à chaque point GPS.** Le cumul des
 * distances était recalculé et les milliers de sommets comparés une fois par
 * seconde. Le cumul se calcule une fois par itinéraire (`cumulativeDistances`),
 * et la recherche part du dernier sommet connu : un véhicule avance, il ne se
 * téléporte pas.
 *
 * Module pur : ni API, ni composant, ni état.
 */

const R = 6371;
const rad = (n) => (n * Math.PI) / 180;

/** Distance orthodromique entre deux points [lon, lat], en kilomètres. */
export function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const la1 = rad(a[1]);
  const la2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Distance cumulée depuis le départ, pour chaque sommet.
 *
 * À calculer une seule fois par itinéraire, puis à passer à `routeProgress`.
 */
export function cumulativeDistances(coords) {
  const out = new Array(coords.length);
  out[0] = 0;
  for (let i = 1; i < coords.length; i += 1) out[i] = out[i - 1] + haversine(coords[i - 1], coords[i]);
  return out;
}

/**
 * Projette un point sur un segment, en coordonnées locales planes.
 *
 * Sur quelques kilomètres, l'erreur de la projection plane est négligeable
 * devant la précision d'un GPS grand public. La longitude est corrigée par le
 * cosinus de la latitude, sans quoi un degré de longitude vaudrait autant
 * qu'un degré de latitude — faux d'un facteur 1,5 à nos latitudes.
 *
 * @returns {{t:number, distanceKm:number}} `t` est la fraction parcourue du
 *   segment, bornée à [0, 1].
 */
export function projectOnSegment(point, a, b) {
  const k = Math.cos(rad((a[1] + b[1]) / 2));
  const ax = a[0] * k;
  const ay = a[1];
  const bx = b[0] * k;
  const by = b[1];
  const px = point[0] * k;
  const py = point[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  const proj = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, distanceKm: haversine(point, proj) };
}

/**
 * Avancement sur l'itinéraire, par projection sur le segment le plus proche.
 *
 * @param {Array<[number,number]>} coords géométrie de l'itinéraire
 * @param {number[]} cum distances cumulées, de `cumulativeDistances`
 * @param {[number,number]} point position du véhicule, en [lon, lat]
 * @param {object} [options]
 * @param {number} [options.fromIndex] dernier sommet connu ; la recherche
 *   commence là et ne balaie que la fenêtre qui suit
 * @param {number} [options.window] nombre de segments examinés depuis
 *   `fromIndex`. Au-delà, on considère que le véhicule a quitté la fenêtre et
 *   on rebalaie tout l'itinéraire.
 * @returns {{km:number, offRouteKm:number, index:number}|null}
 */
export function routeProgress(coords, cum, point, { fromIndex = 0, window = 200 } = {}) {
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(cum)) return null;
  if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;

  const chercher = (debut, fin) => {
    let meilleur = null;
    for (let i = debut; i < fin; i += 1) {
      const { t, distanceKm } = projectOnSegment(point, coords[i], coords[i + 1]);
      if (!meilleur || distanceKm < meilleur.offRouteKm) {
        meilleur = {
          offRouteKm: distanceKm,
          index: i,
          km: cum[i] + (cum[i + 1] - cum[i]) * t,
        };
      }
    }
    return meilleur;
  };

  const debut = Math.max(0, Math.min(fromIndex, coords.length - 2));
  const fin = Math.min(coords.length - 1, debut + window);
  let resultat = chercher(debut, fin);

  // Le véhicule est sorti de la fenêtre — reprise d'itinéraire, saut, ou
  // simple démarrage loin du dernier point connu : on rebalaie tout.
  const sorti = !resultat || resultat.index >= fin - 1 || resultat.offRouteKm > 5;
  if (sorti && (debut > 0 || fin < coords.length - 1)) {
    const complet = chercher(0, coords.length - 1);
    if (complet && (!resultat || complet.offRouteKm < resultat.offRouteKm)) resultat = complet;
  }
  return resultat;
}
