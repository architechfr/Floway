/**
 * Lecture des paramètres numériques d'une requête.
 *
 * `URLSearchParams.get()` rend `null` quand le paramètre est absent, et
 * **`Number(null)` vaut `0`, qui est fini**. Le motif employé partout dans
 * l'API —
 *
 *   const lat = Number(params.get('lat'));
 *   if (!Number.isFinite(lat)) return erreur;
 *
 * — ne détecte donc jamais un paramètre manquant : il le remplace
 * silencieusement par zéro. Constaté en production sur `/api/stations-near`,
 * dont le rayon par défaut de 8 km n'était jamais appliqué : sans `radius`,
 * la valeur devenait 0, passait le test de finitude, et se voyait ramenée à
 * 1 km par la borne basse. La station d'à côté n'était cherchée que dans un
 * rayon d'un kilomètre.
 *
 * Sur des coordonnées, la même faute est pire : `lat` et `lon` absents
 * donnaient le point 0°/0°, au large du golfe de Guinée, traité comme une
 * position valide.
 *
 * Module pur : il ne connaît ni Next.js ni `URLSearchParams`, seulement la
 * chaîne brute ou `null`.
 */

/**
 * Lit un nombre, ou rend `defaut` si le paramètre est absent ou illisible.
 *
 * Une chaîne vide ou faite d'espaces compte comme absente : `?radius=` n'est
 * pas une demande de rayon nul.
 *
 * @param {string|null|undefined} brut valeur telle que rendue par `get()`
 * @param {object} [options]
 * @param {number} [options.min] borne basse, appliquée après lecture
 * @param {number} [options.max] borne haute, appliquée après lecture
 * @param {number|null} [options.defaut] valeur rendue si absent ou illisible
 * @returns {number|null}
 */
export function nombreDeRequete(brut, { min, max, defaut = null } = {}) {
  if (brut === null || brut === undefined) return defaut;
  const texte = String(brut).trim();
  if (!texte) return defaut;
  const valeur = Number(texte);
  // `Number` accepte l'infini et rend NaN sur une chaîne libre : les deux sont
  // des absences de nombre exploitable.
  if (!Number.isFinite(valeur)) return defaut;
  let borne = valeur;
  if (Number.isFinite(min)) borne = Math.max(min, borne);
  if (Number.isFinite(max)) borne = Math.min(max, borne);
  return borne;
}

/**
 * Lit un couple de coordonnées, ou `null` si l'une des deux manque.
 *
 * Les bornes sont celles du monde : une latitude de 91° ou une longitude de
 * 200° ne sont pas des positions, et sont refusées plutôt que ramenées à la
 * borne — corriger silencieusement une coordonnée fausse reviendrait à
 * inventer un lieu.
 *
 * @returns {{ lat: number, lon: number }|null}
 */
export function positionDeRequete(latBrut, lonBrut) {
  const lat = nombreDeRequete(latBrut);
  const lon = nombreDeRequete(lonBrut);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}
