/**
 * Mise en forme d'une liste de stations pour la lecture.
 *
 * Deux défauts constatés à l'écran sur un Paris–Marseille :
 *
 *  - trois cartes portaient le même titre, « Vierzon », parce que le flux ne
 *    donne pas d'enseigne et que l'adresse ne nomme pas un lieu : le titre
 *    retombait sur la commune. Rien ne distinguait les trois d'un coup d'œil ;
 *  - le classement les dispersait — Vierzon, Vierzon, Theillay, Salbris,
 *    Farges-Allichamps, Bourges, **Vierzon** — et revoir une commune déjà vue
 *    plus bas se lit comme une erreur, même quand le score le justifie.
 *
 * Module pur : il reçoit des titres déjà calculés et rend un ordre et des
 * libellés. Il ne connaît ni composant ni source de données.
 */

/** Retire les mots vides d'une adresse pour n'en garder que ce qui distingue. */
function fragmentUtile(adresse) {
  const texte = String(adresse || '').trim();
  if (!texte) return '';
  // Le numéro de voie ne distingue rien à lui seul et alourdit le titre.
  const sansNumero = texte.replace(/^\d+\s*(bis|ter|quater)?\s*[,-]?\s*/i, '');
  return sansNumero.trim() || texte;
}

/**
 * Rend un titre distinct pour chaque entrée d'une liste.
 *
 * Le titre commun n'est complété **que lorsqu'il se répète** : une station
 * seule dans sa commune garde « Vierzon », plus lisible que « Avenue du 19
 * mars 1962 ». Ce n'est qu'à partir de deux que la voie devient nécessaire.
 *
 * @param {Array<{id: string, titre: string, adresse?: string}>} entrees
 * @returns {Map<string, string>} identifiant → titre à afficher
 */
export function distinguerTitres(entrees) {
  const compte = new Map();
  for (const e of entrees) {
    const t = String(e?.titre || '').trim();
    if (t) compte.set(t, (compte.get(t) || 0) + 1);
  }

  const sortie = new Map();
  for (const e of entrees) {
    const titre = String(e?.titre || '').trim();
    if (!titre) {
      sortie.set(e.id, '');
      continue;
    }
    if ((compte.get(titre) || 0) < 2) {
      sortie.set(e.id, titre);
      continue;
    }
    const fragment = fragmentUtile(e.adresse);
    // Sans adresse exploitable, mieux vaut le titre nu qu'un libellé bricolé :
    // l'ambiguïté reste, mais rien n'est inventé.
    sortie.set(e.id, fragment && fragment.toLowerCase() !== titre.toLowerCase()
      ? `${titre} · ${fragment}`
      : titre);
  }
  return sortie;
}

/**
 * Rassemble les entrées d'un même lieu sans casser le classement.
 *
 * Un lieu prend le rang de sa **meilleure** entrée ; les lieux se suivent donc
 * dans l'ordre du classement, et à l'intérieur d'un lieu les entrées restent
 * elles aussi classées. Aucune entrée n'est retirée ni déplacée d'un lieu à un
 * autre : seule leur adjacence change.
 *
 * @param {Array<T>} entrees déjà triées par ordre de classement
 * @param {(entree: T) => string} lieuDe clé de regroupement
 * @returns {Array<T>}
 */
export function regrouperParLieu(entrees, lieuDe) {
  const groupes = new Map();
  for (const e of entrees) {
    const cle = String(lieuDe(e) ?? '').trim().toLowerCase();
    // Sans lieu identifiable, l'entrée reste seule : la regrouper avec toutes
    // les autres sans lieu créerait un faux ensemble.
    const identifiant = cle || `__seul_${groupes.size}`;
    const liste = groupes.get(identifiant);
    if (liste) liste.push(e);
    else groupes.set(identifiant, [e]);
  }
  return [...groupes.values()].flat();
}
