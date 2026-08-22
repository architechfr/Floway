/**
 * Couloir d'interrogation d'un itinéraire.
 *
 * Pour trouver les stations d'un trajet, on interroge le flux national autour
 * de quelques points échantillonnés sur le tracé, puis on ne garde que celles
 * qui sont à moins de `couloirKm` de la route.
 *
 * Le rayon d'interrogation était fixé à 28 km, sans rapport avec l'espacement
 * des points. Conséquence mesurée sur le flux réel : 308 stations se trouvent
 * à moins de 28 km de Ferrières-en-Brie, 564 à moins de 28 km de Paris, alors
 * que l'API n'en rend au plus que 100 par appel. Le tirage rendu ne contenait
 * **aucune** station du couloir de 6 km : la station d'à côté ne pouvait pas
 * être proposée.
 *
 * Module pur : il ne connaît ni API ni composant.
 */

/**
 * Rayon à demander autour de chaque point d'échantillonnage.
 *
 * Un point doit couvrir tout ce qui est à moins de `couloirKm` du tracé
 * jusqu'à mi-chemin de son voisin. Une station située à `couloirKm` du tracé
 * et à `espacement / 2` le long de la route est à
 * `√((espacement/2)² + couloirKm²)` du point, or `√(a² + b²) ≤ a + b` :
 * `espacement / 2 + couloirKm` suffit, et tout kilomètre au-delà ne fait que
 * redemander ce que le point voisin a déjà vu — en saturant la limite de
 * l'API.
 *
 * @param {object} input
 * @param {number} input.routeLengthKm longueur totale de l'itinéraire
 * @param {number} input.sampleCount nombre de points interrogés
 * @param {number} input.couloirKm demi-largeur du couloir retenu
 * @param {number} [input.minKm] plancher, pour ne pas rater une station
 *   légèrement à l'écart sur un trajet très court
 * @param {number} [input.maxKm] plafond, au-delà duquel la limite de l'API
 *   redevient contraignante en zone dense
 * @returns {number} rayon en kilomètres, entier
 */
export function corridorRadiusKm({
  routeLengthKm,
  sampleCount,
  couloirKm,
  minKm = 8,
  maxKm = 28,
}) {
  const longueur = Number.isFinite(routeLengthKm) && routeLengthKm > 0 ? routeLengthKm : 0;
  const points = Number.isFinite(sampleCount) && sampleCount > 1 ? sampleCount : 2;
  const marge = Number.isFinite(couloirKm) && couloirKm > 0 ? couloirKm : 0;
  const espacement = longueur / (points - 1);
  return Math.min(maxKm, Math.max(minKm, Math.ceil(espacement / 2 + marge)));
}
