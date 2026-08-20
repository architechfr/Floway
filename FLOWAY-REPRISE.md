# Floway — état du projet et suite à faire

Document de reprise. À ouvrir au début d'une nouvelle session pour repartir sans tout réexpliquer.

## Où en est le dépôt

- Dépôt : `architechfr/Floway`, clone local `C:\dev\Floway`, branche `main`.
- Dernier merge : PR #4 (`refactor/phase-1-state-store`), commit `cfd35e6`.
- Production : https://floway-app.vercel.app/
- Clé TomTom : en place et fonctionnelle (les 4 routes répondent 200).

## Ce qui est fait

**Phase 0 — build et sécurité**
- Build débloqué (accolade manquante dans `live-copilot-layer.tsx`), garde CI ajoutée.
- Proxy Mistral ouvert fermé, timeouts sortants, `/api/safety` passé de 60 à 2 appels/min.
- Helpers dans `apps/web/app/api/_lib/http.ts` : `timeoutFetch`, `rateLimit`, `requireTrustedCaller`, `clientIp`, `tooManyRequests`.

**Moteur de calcul — `packages/algorithms/` (pur, sans réseau, testé)**
- `energy-model.mjs` — autonomie, quantité nécessaire, nombre de pleins, coût trajet et coût d'achat. Une donnée absente sort dans `missing: [...]` et les champs calculés valent `null`. Jamais de valeur inventée.
- `trip-clock.mjs` — `Europe/Paris`, gestion DST. Règle : un instant absolu voyage, le formatage se fait toujours dans le fuseau du trajet.
- `opening-hours.mjs` — parseur OSM (jours, plages, coupures, nuit, `24/7`, `off`). Rend `ouvert | ferme | inconnu`, ne devine jamais.
- `stop-planner.mjs` — fenêtres repas (déjeuner 11h45–14h15, dîner 18h45–21h30), chevauchement minimum 30 min, classement pondéré attente / détour / prix / besoin carburant / repas / ouverture / services.
- `fuel-station-hours.mjs` — convertit les horaires du flux officiel du ministère en notation OSM.
- `route-timing.mjs` — heures de passage réelles à partir des durées par segment OSRM, repli explicite sur interpolation.
- `slippy-map.mjs` — projection Web Mercator, tuiles, zoom, pan. Carte IGN sans dépendance cartographique.
- 86 tests `node --test` passent.

**Interface**
- Store React `apps/web/app/state/floway-store.tsx` : origine (dont géolocalisation), véhicule, contexte de trajet, persistance `localStorage` validée en lecture comme en écriture.
- Composants : `origin-field.tsx`, `trip-context-panel.tsx`, `route-map.tsx`.
- Cartes station : badge autoroute franc, prix affiché, horaires réels, heures d'arrivée calculées sur les durées réelles.

**Couche 2 (livrée, à committer)**
- Limitation de vitesse pilotée par React dans `floway-v3.tsx` : position quantifiée à ~220 m, throttle dur de 8 s, active uniquement quand la navigation est ouverte.
- Retrait de 3 layers DOM : `live-copilot-layer.tsx`, `speed-limit-layer.tsx`, `safety-alert-layer.tsx` + `live-copilot.css`, `safety-alert.css`, `motorway-navigation.css`.
- Vérifié : `npx tsc --noEmit` propre, `next build` OK, 86 tests OK.

## À committer maintenant

Dans `C:\dev\Floway`, PowerShell :

```
git rm apps/web/app/live-copilot-layer.tsx apps/web/app/speed-limit-layer.tsx apps/web/app/safety-alert-layer.tsx apps/web/app/live-copilot.css apps/web/app/safety-alert.css apps/web/app/motorway-navigation.css
git add apps/web/app/floway-v3.tsx apps/web/app/layout.tsx
git commit -m "refactor: limitation de vitesse en React, suppression de 3 layers DOM"
git push
```

## Suite à faire, dans l'ordre

**Phase 1 — reste des layers DOM (7 restants)**
`session-restore`, `quick-fuel`, `saved-places`, `route-price`, `station-enrichment`, `station-fuel`, `numeric-input-fix`, `interaction-layer`. Un layer par commit.

**Phase 2 — CSS**
Supprimer `timing.css`, `context.css`, `cinematic.css`, `details.css`, `premium-home.css`, `premium-v2.css` (~46 Ko). Fusionner `dynamic-reference.css` dans `floway-v3.css` en retirant les 133 `!important`. Unifier les tokens, ramener à 3 points de rupture.

**Phase 3 — fiabilité**
Recalcul haversine sur toute la géométrie à chaque tick GPS. `loadRoute` sans `AbortController` (course possible). Écran blanc en navigation privée. Marqueur GPS positionné par index au lieu de distance. Services en dur dans le repli.

**Phase 4 — conformité, bloquant pour une ouverture publique**
Remplacer le serveur de démo OSRM et l'Overpass public par des instances autorisées.

**Phase 5 — fondations**
README et ARCHITECTURE décrivent une app Expo qui n'existe pas. Schéma Supabase inutilisé (`station_events` et `wait_observations` ont du RLS sans aucune policy). Code mort : `apps/mobile`, `standalone-preview.html`, `/api/vehicle`, `premium-home.tsx`.

**Produit**
- Catalogue véhicules FR (~300 modèles) : choix marque / modèle / motorisation, avec saisie manuelle de la capacité réservoir ou batterie et estimation proposée. Pas d'ADEME pour l'instant (décision prise).
- Les 5 prochaines stations sur la route pendant le trajet.
- Temps d'attente en station à intégrer au classement.

## Règles de travail établies

- Commits directs sur `main`. Branche + PR réservées aux gros chantiers risqués.
- Aucune donnée fictive en remplacement d'une donnée absente : le manque est explicite.
- Les sources de données restent indépendantes du moteur de calcul.
- Lister les fichiers à modifier avant d'implémenter.
- Vérifier la documentation réelle d'une API avant de l'utiliser, ne jamais inventer un endpoint ou un champ.

## Formules de référence

- Autonomie thermique = (capacité L / conso L/100) × 100
- Carburant nécessaire = (distance × conso) / 100
- Autonomie électrique = (kWh utiles / conso kWh/100) × 100
- Énergie nécessaire = (distance × conso kWh/100) / 100
- Plus : réserve de sécurité paramétrable, correction conso réelle, autonomie restante, nombre de pleins ou de recharges, quantité totale, coût estimé.
