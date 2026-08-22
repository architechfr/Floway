# Floway — état du projet et suite à faire

Document de reprise. À ouvrir au début d'une nouvelle session pour repartir sans tout réexpliquer.

## Où en est le dépôt

- Dépôt : `architechfr/Floway`, clone local `C:\dev\Floway`, branche `main`.
- Dernier merge : PR #4 (`refactor/phase-1-state-store`), commit `cfd35e6`.
- **Phases 1 et 2 (CSS) terminées** : neuf couches + un nettoyage livrés depuis, en attente de commit (voir plus bas).
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

Neuf couches et un nettoyage sont sur le disque, vérifiés, pas encore committés.

**Couche 3 — `session-restore`**
- Le store expose `lastRoute` (dernier trajet calculé) et `hydrated` (fin de relecture du stockage local). Les effets des enfants s'exécutant avant ceux du provider, tout composant qui a besoin d'une valeur persistée à son premier chargement doit attendre ce drapeau.
- `floway-v3` repart du dernier trajet au lieu de `Paris → Lyon` en dur, et mémorise le trajet à chaque calcul réussi.
- Supprimé : `session-restore-layer.tsx` — ouverture simulée de la fenêtre d'itinéraire (`.v3routeTitle`.click()), réécriture des deux champs via le setter natif de `HTMLInputElement`, `requestSubmit()` 650 ms après l'affichage, et un `setInterval` de 2 s qui relisait le trajet dans le DOM.
- Bug corrigé au passage : l'ancien layer mémorisait le libellé *raccourci* affiché dans l'en-tête (`placeLabel`). Un départ GPS y était écrit « Position GPS », chaîne qu'aucun géocodeur ne résout — la reprise repartait donc en erreur. Nouvelle clé `floway:last-route` avec le libellé complet ; l'ancienne `floway:active-session` est nettoyée au démarrage.
- `pwa-install.tsx` recopiait cette ancienne clé dans `floway:resume-after-update`, que rien ne lit : supprimé.

**Couche 4 — `quick-fuel`**
- `quick-fuel-sheet.tsx` + `quick-fuel-sheet.module.css` : la feuille de correction du niveau, en composant piloté par `floway-v3`.
- Supprimé : `quick-fuel-layer.tsx` — écouteur de clic sur tout le document en phase de capture pour reconnaître trois sélecteurs CSS, relecture du niveau dans `localStorage`, réécriture du curseur React via le setter natif. Et `quick-fuel.css`, une feuille globale de plus.
- Les trois déclencheurs sont désormais de vrais `<button>` (classe `.fuelQuickTrigger`, transparente) : accessibles au clavier, ce que ne permettait pas un `<b>` cliqué en capture.
- Bug corrigé au passage : la feuille n'écrivait que dans `vehicle.fuelPct`, pas dans `trip.fuelLevelPct` du store. Le plan d'énergie ne bougeait donc pas, alors que la feuille annonce « les recommandations sont recalculées immédiatement ». Toute saisie de niveau écrit maintenant dans les deux.

**Couche 5 — `route-price`**
- `route-price-ribbon.tsx` + module CSS. La synthèse des prix (`summarizePrices`) se calcule sur les stations déjà reçues par la page, et le bandeau remonte dans la section « STATIONS DEVANT VOUS », là où on le cherche.
- Supprimé : `route-price-layer.tsx` — il relançait un `/api/route` **complet** pour n'en garder que les prix : un second calcul d'itinéraire au chargement, puis toutes les 30 s, **plus un à chaque événement `change` du document** (déplacer le curseur de carburant en déclenchait un). Il lisait en plus origine et destination dans le texte de `.v3routeTitle`, donc les libellés raccourcis. Le chargement de la page passe de 2 appels `/api/route` à 1.
- Supprimé aussi : `route-price.css`. Ses règles `.v3routeTitle` étaient intégralement recouvertes par `dynamic-reference.css`, chargé après.
- `.v3routeTitle em` (le crayon ✎) et le bouton `.v3modifyRoute` étaient masqués à **quatre** endroits — `route-price.css`, `dynamic-reference.css`, et un `MutationObserver` sur `document.body` qui repassait un `style.display='none'` en JS à chaque mutation. Les deux éléments sont retirés du balisage ; le `:after` de `dynamic-reference.css` (« › ») assure déjà l'affordance. Les règles orphelines de `floway-live.css` et `dynamic-reference.css` tombent avec la phase 2.

**Couche 6 — `saved-places`**
- `saved-places.tsx` + module CSS, monté sous le champ « Destination » de la fenêtre d'itinéraire. Les destinations mémorisées passent dans le store (`savedPlaces`, `setPlaceAddress`, `addSavedPlace`, `removeSavedPlace`), avec relecture validée : une entrée mal formée du stockage est écartée au lieu de traverser jusqu'à l'affichage.
- Supprimé : `saved-places-layer.tsx` — il construisait sa section en `innerHTML`, la réinjectait à chaque mutation via un `MutationObserver` sur `document.body`, écrivait dans le champ destination par le setter natif, et demandait nom et adresse par des `window.prompt()`. La saisie se fait maintenant en ligne : plus de fenêtre native bloquante, impossible à styler et hasardeuse en PWA installée.
- Supprimé aussi : `saved-places.css`. Elle portait encore `.flowayOriginAuto`, `.flowayOriginRaw` et `.flowayOriginToast`, orphelines depuis la migration de `current-location-origin` vers `origin-field` (couche 1).
- Ajouté : on peut retirer un favori. L'ancien layer permettait d'en créer sans jamais en supprimer.
- Bug trouvé et corrigé pendant la vérification : « Entrée » dans les champs de saisie soumettait le formulaire d'itinéraire — donc lançait un calcul de trajet au lieu d'enregistrer le favori.

**Couche 7 — `station-enrichment` + `station-fuel`** (les deux ensemble : même cible, la fiche station)
- `station-fuel-panel.tsx` et `station-poi-panel.tsx`, montés dans la fiche aux emplacements exacts où les layers s'injectaient. Le hook partagé `lib/station-lookup.ts` porte l'interrogation.
- Supprimé : `station-enrichment-layer.tsx`, `station-fuel-layer.tsx`, `station-enrichment.css`, `station-fuel-layer.css`. Deux `MutationObserver` sur `document.body` de moins.
- **Un aller-retour de géocodage économisé par panneau.** Les deux APIs acceptent `lat` et `lon` et ne géocodent `q` qu'à défaut ; les layers ne passaient que `q`, qu'ils reconstituaient en relisant le texte affiché. Or le `h2` de la fiche concatène l'enseigne et le nom **sans espace** — « TotalEnergiesAire de Beaune » partait tel quel au géocodeur. On envoie maintenant les coordonnées de la station.
- **Injection HTML fermée.** `station-fuel-layer` construisait son panneau en `innerHTML` en y interpolant `data.source`, `data.message` et le libellé de chaque carburant — des chaînes qui viennent d'un jeu de données public. React les rend comme du texte. Vérifié avec une charge hostile dans la réponse d'API.
- **Course corrigée.** Chaque requête est abandonnée (`AbortController`) au démontage et au changement de station : ouvrir une fiche puis une autre ne peut plus faire apparaître la réponse de la première par-dessus la seconde. Même défaut que celui listé en phase 3 pour `loadRoute`.
- `layout.tsx` passe de 22 imports CSS et 8 layers à 16 imports et 2 layers.

**Nettoyage — code mort (phases 2 et 5, la part vérifiable)**

Chaque suppression a été vérifiée avant, pas supposée : classes CSS croisées avec le JSX réel, `@keyframes` cherchés dans les autres feuilles, variables `--*` tracées jusqu'à leur point de définition, sélecteurs d'éléments nus recensés.

Feuilles de style, ~44 Ko : `cinematic.css`, `context.css`, `timing.css`, `journey.css`, `poi.css`, `visuals.css` — **aucune de leurs classes n'apparaît dans le JSX**. `premium-v2.css` — idem (ses `.routeNode`, `.bottomNav`, `.recommendHead` appartiennent à une maquette abandonnée ; `/ev` est en CSS Modules, d'où de fausses correspondances). `premium-home.css` — ne stylait que `premium-home.tsx`, supprimé avec elle. `details.css` — n'était plus importée nulle part.

Une seule chose valait d'être préservée : `premium-v2.css` surchargeait le fond de page défini dans `globals.css`. Sa valeur a été reportée dans `globals.css`, le rendu est donc inchangé.

Fichiers, ~36 Ko : `premium-home.tsx` (importé nulle part), `restaurant-preferences-panel.tsx` (aucune référence), `standalone-preview.html`, `apps/mobile/` (l'app Expo qui n'existe pas), `apps/web/app/api/vehicle/`.

`layout.tsx` passe de 16 imports CSS à 8. Le dépôt perd ~80 Ko de code que personne n'exécutait.

**Restent à trancher, pas supprimés** : `globals.css` n'utilise que 19 de ses 58 classes, mais porte aussi la base (reset, polices, fond) — l'élagage y demande du cas par cas. `dynamic-reference.css` et ses 133 `!important` sont toujours là ; c'est le cœur de la phase 2.

**Couche 8 — profil véhicule : convergence des deux sources, et `numeric-input-fix`**

Le panneau véhicule (`.v3vehiclePanel`) était masqué en production par un `display:none!important` dans `dynamic-reference.css`. Le retirer seul aurait fait des dégâts silencieux : l'autonomie affichée partout — pastille du hero, bandeau navigation, seuil « carburant critique », arrêt ravitaillement conseillé, « AUTONOMIE SÛRE » — était calculée sur `vehicle.tankL`, `vehicle.consumption` et `vehicle.reserveKm`, éditables **uniquement** dans `.vehicleModal`, la fiche qu'on ouvrait depuis ce panneau invisible. Autrement dit : l'application affichait à tout le monde l'autonomie d'un Volkswagen Tiguan 2.0 TDI 64 L, sans aucun moyen de la corriger.

- L'autonomie vient maintenant du profil du store, celui qu'édite réellement le panneau de contexte de trajet, via `planEnergy` du moteur de calcul. Le `Vehicle` historique, `defaultVehicle`, la clé `floway:vehicle` et sa persistance disparaissent.
- **Sans capacité ni consommation renseignées, plus aucun chiffre n'est affiché** : « autonomie inconnue », et la raison est dite à l'écran. Conforme à la règle « aucune donnée fictive en remplacement d'une donnée absente ».
- Le niveau de carburant n'a plus qu'une source (`trip.fuelLevelPct`), et suit la batterie sur un véhicule électrique. Les formulations s'adaptent : « de batterie », « Recharge à envisager », « La charge reste une contrainte physique ».
- Supprimés avec : `.v3vehiclePanel`, `.vehicleModal`, `numeric-input-fix.tsx` (il ne corrigeait que les champs de cette fiche), et leurs règles CSS dans `logic-v4.css` et `dynamic-reference.css`.

**Couche 9 — `interaction-layer` : le dernier**

- `action-sheet.tsx` (menu, alertes, communauté, profil, partage), `route-actions.tsx` (inverser / favori), `toast.tsx`, chacun avec son module CSS. `interactions.css`, dont la totalité des règles servait ce layer, disparaît.
- Les itinéraires favoris passent dans le store (`favoriteRoutes`, `toggleFavoriteRoute`, `removeFavoriteRoute`), avec relecture validée.
- **Fin du détournement de boutons.** Le layer écoutait tous les clics du document en phase de capture et reconnaissait les boutons de la page par leurs sélecteurs CSS : `.v3icon` (menu), `.v3status > button` (alertes), `.v3nav button:nth-child(4)` et `:nth-child(5)`, `.v3stopImage > button` (le cœur), `.v3choose`. Ces boutons portent désormais leur propre `onClick`. Un sixième branchement visait `button.gpsButton` / `[data-floway-gps]` — des sélecteurs qui n'existent nulle part : code mort, supprimé.
- **Fin de la mutation d'un élément rendu par React** : le cœur de la carte « prochaine pause » était basculé en réécrivant son `textContent` et sa `classList` à la main, sur un nœud que React possède. C'est maintenant un état.
- **Fin de l'ouverture simulée de la fenêtre d'itinéraire** : inverser un trajet ou rejouer un favori cliquait `.v3routeTitle`, écrivait dans les deux champs par le setter natif de `HTMLInputElement`, puis appelait `requestSubmit()` 100 ms plus tard. Ces deux actions appellent maintenant directement le calcul.
- **Conflit corrigé** : le layer interceptait aussi le bouton NAVIGATION pour faire défiler la page vers le haut — en plus de l'ouverture de la navigation par le bouton lui-même. Les deux se déclenchaient.
- **Défaut d'affichage corrigé** : les boutons « Inverser » et « Favori » étaient injectés après le titre d'itinéraire avec une marge négative, et passaient sous le bandeau de trajet positionné en absolu. Le bloc est maintenant dans le flux, et `.v3heroContent` réserve la hauteur du bandeau. Effet de bord heureux : les trois métriques du hero (distance, durée, pauses), jusque-là recouvertes, redeviennent visibles.

**Phase 2 — fusion de `dynamic-reference.css`**

Cette feuille, chargée en 25e position, réécrivait la présentation de la page à coups de `!important` — 132 au total. Elle est fusionnée dans `floway-v3.css` et supprimée : à spécificité égale, la règle la plus basse dans le fichier l'emporte, le `!important` n'a plus de raison d'être.

Six sélecteurs (`.v3livebar`, `.v3car`, `.v3fuelHero` et ses enfants, `.v3status span:last-child`) entrent en collision avec `floway-live.css` et `logic-v4.css`, chargés *après* `floway-v3.css` : leurs règles vont dans `logic-v4.css` pour conserver l'ordre de cascade d'origine.

**Le `!important` du projet passe de 132 à 11** — 6 dans `logic-v4.css`, 5 dans `road-navigation.css`. `layout.tsx` descend à 6 feuilles globales.

**Vérifié par comparaison des styles calculés, pas à l'œil.** `tools/css-snapshot.mjs` relève, sur 12 états (accueil, fiche station, fenêtre d'itinéraire, menu × 1440/760/390 px), 58 propriétés calculées et le rectangle de chacun des 4 505 éléments — environ 260 000 valeurs. `tools/css-diff.mjs` compare deux relevés. Résultat : **0 différence**.

L'outil a gagné son coût dès le premier essai. L'analyse des sélecteurs communs annonçait sept collisions ; elle en manquait une. `.v3track button` et `.journeyMarker` désignent les mêmes éléments sous deux noms différents : les marqueurs de la frise passaient de 34 à 42 px. Au passage, trois déclarations `!important` de `.journeyMarker` (`width`, `height`, `top`) se sont révélées mortes — `dynamic-reference.css` les recouvrait déjà — et ont été retirées plutôt que reconduites.

**Vérifié aussi** : `npx tsc --noEmit` propre, `next build` OK, 86 tests OK, 18 + 15 + 17 + 11 + 18 + 24 = **103 vérifications fonctionnelles Chromium** — dont le calcul d'autonomie contrôlé sur des valeurs connues (50 L à 5 L/100 → 1000 km pleins ; 40 % → 400 km théoriques, 300 km sûrs avec 10 % de réserve ; 60 kWh à 15 kWh/100 à 50 % → 200 km / 160 km) (reprise du trajet, repli premier lancement, nettoyage de l'ancienne clé, absence de fenêtre d'édition au démarrage, ouverture de la feuille, pas ±1/±5, bornes 0/100, persistance des deux clés, accès clavier, `window.fetch` et le setter natif intacts).

### Commandes, dans `C:\dev\Floway`, PowerShell

```
git rm apps/web/app/live-copilot-layer.tsx apps/web/app/speed-limit-layer.tsx apps/web/app/safety-alert-layer.tsx apps/web/app/live-copilot.css apps/web/app/safety-alert.css apps/web/app/motorway-navigation.css
git add apps/web/app/floway-v3.tsx apps/web/app/layout.tsx
git commit -m "refactor: limitation de vitesse en React, suppression de 3 layers DOM"

git rm apps/web/app/session-restore-layer.tsx
git add apps/web/app/state/floway-store.tsx apps/web/app/floway-v3.tsx apps/web/app/layout.tsx apps/web/app/pwa-install.tsx
git commit -m "refactor: reprise du dernier trajet par le store, suppression du layer session-restore"

git rm apps/web/app/quick-fuel-layer.tsx apps/web/app/quick-fuel.css
git add apps/web/app/quick-fuel-sheet.tsx apps/web/app/quick-fuel-sheet.module.css apps/web/app/floway-v3.tsx apps/web/app/floway-v3.css apps/web/app/layout.tsx
git commit -m "refactor: feuille carburant en composant React, suppression du layer quick-fuel"

git rm apps/web/app/route-price-layer.tsx apps/web/app/route-price.css
git add apps/web/app/route-price-ribbon.tsx apps/web/app/route-price-ribbon.module.css apps/web/app/floway-v3.tsx apps/web/app/layout.tsx
git commit -m "refactor: prix du trajet calcules depuis les stations recues, suppression du layer route-price"

git rm apps/web/app/saved-places-layer.tsx apps/web/app/saved-places.css
git add apps/web/app/saved-places.tsx apps/web/app/saved-places.module.css apps/web/app/state/floway-store.tsx apps/web/app/floway-v3.tsx apps/web/app/layout.tsx
git commit -m "refactor: destinations rapides en composant React, suppression du layer saved-places"

git rm apps/web/app/station-enrichment-layer.tsx apps/web/app/station-enrichment.css apps/web/app/station-fuel-layer.tsx apps/web/app/station-fuel-layer.css
git add apps/web/app/station-fuel-panel.tsx apps/web/app/station-fuel-panel.module.css apps/web/app/station-poi-panel.tsx apps/web/app/station-poi-panel.module.css apps/web/app/lib/station-lookup.ts apps/web/app/floway-v3.tsx apps/web/app/layout.tsx FLOWAY-REPRISE.md
git commit -m "refactor: fiche station autonome, suppression des layers station-enrichment et station-fuel"

git rm -r apps/mobile apps/web/app/api/vehicle
git rm standalone-preview.html apps/web/app/premium-home.tsx apps/web/app/premium-home.css apps/web/app/restaurant-preferences-panel.tsx apps/web/app/cinematic.css apps/web/app/context.css apps/web/app/timing.css apps/web/app/journey.css apps/web/app/poi.css apps/web/app/visuals.css apps/web/app/premium-v2.css apps/web/app/details.css
git add apps/web/app/layout.tsx apps/web/app/globals.css
git commit -m "chore: suppression du code mort verifie (~80 Ko)"

git rm apps/web/app/numeric-input-fix.tsx
git add apps/web/app/floway-v3.tsx apps/web/app/floway-v3.css apps/web/app/logic-v4.css apps/web/app/dynamic-reference.css apps/web/app/quick-fuel-sheet.tsx apps/web/app/layout.tsx
git commit -m "refactor: autonomie issue du profil du store, suppression du profil vehicule historique"

git rm apps/web/app/interaction-layer.tsx apps/web/app/interactions.css
git add apps/web/app/action-sheet.tsx apps/web/app/action-sheet.module.css apps/web/app/route-actions.tsx apps/web/app/route-actions.module.css apps/web/app/toast.tsx apps/web/app/toast.module.css apps/web/app/state/floway-store.tsx apps/web/app/floway-v3.tsx apps/web/app/dynamic-reference.css apps/web/app/layout.tsx FLOWAY-REPRISE.md
git commit -m "refactor: fin de la phase 1, suppression du dernier layer DOM"

git rm apps/web/app/dynamic-reference.css
git add apps/web/app/floway-v3.css apps/web/app/logic-v4.css apps/web/app/layout.tsx tools/ FLOWAY-REPRISE.md
git commit -m "refactor: fusion de dynamic-reference.css, 132 !important ramenes a 11"

git push
```

## Suite à faire, dans l'ordre

**Phase 1 — terminée.**

Plus aucun layer DOM. `layout.tsx` ne monte plus que le store, la PWA et la page ; il est passé de 22 imports CSS et 8 layers à **7 imports et 0 layer**. Il ne reste, dans tout le code, ni `MutationObserver`, ni patch du setter natif de `HTMLInputElement`, ni monkey-patch de `window.fetch`, ni `innerHTML` alimenté par une API.

**Phase 2 — CSS** (faite : voir le nettoyage et la fusion plus haut)
Reste, moins urgent : élaguer `globals.css` (19 classes utilisées sur 58, mais elle porte aussi la base — reset, polices, fond), unifier les tokens de couleur, ramener à 3 points de rupture. Passer par `tools/css-snapshot.mjs` : c'est exactement le cas d'usage.

**La prochaine priorité est ailleurs.** La phase 4 est bloquante pour une ouverture publique : le serveur de démo OSRM et l'Overpass public ne sont pas utilisables en production.

**Phase 3 — fiabilité**
Recalcul haversine sur toute la géométrie à chaque tick GPS. `loadRoute` sans `AbortController` (course possible ; le motif est déjà en place dans `lib/station-lookup.ts`, à reprendre). Écran blanc en navigation privée. Marqueur GPS positionné par index au lieu de distance. Services en dur dans le repli.

**Phase 4 — conformité, bloquant pour une ouverture publique**
Remplacer le serveur de démo OSRM et l'Overpass public par des instances autorisées.

**Phase 5 — fondations**
Le code mort est supprimé (voir le nettoyage). Reste : README et `docs/ARCHITECTURE.md` décrivent toujours une app Expo qui n'existe plus du tout — à réécrire sur ce qui tourne réellement. Schéma Supabase inutilisé (`station_events` et `wait_observations` ont du RLS sans aucune policy).

**Produit**
- Catalogue véhicules FR (~300 modèles) : choix marque / modèle / motorisation, avec saisie manuelle de la capacité réservoir ou batterie et estimation proposée. Pas d'ADEME pour l'instant (décision prise).
- ~~Les 5 prochaines stations sur la route pendant le trajet.~~ Fait.
- ~~Temps d'attente en station à intégrer au classement.~~ Fait.
- Mesurer réellement l'attente. `wait-estimator.mjs` sait pondérer des observations horodatées, mais rien ne l'alimente : le classement s'appuie sur le modèle Floway v0, présenté comme une prédiction. La table Supabase `wait_observations` existe et n'a aucune policy.

## Défaut de couverture du flux carburant — corrigé

Constaté au test : sur un trajet au départ de Ferrières-en-Brie, ni l'Intermarché voisin (356 m) ni Croissy-Beaubourg (4,7 km) n'étaient proposés.

Cause. `/api/route` demandait **80 enregistrements dans un rayon de 28 km** autour de chacun des 34 points échantillonnés, **sans `order_by`**. Or le flux compte 308 stations à moins de 28 km de Ferrières-en-Brie et 564 à moins de 28 km de Paris. L'API rendait donc 80 stations au hasard de l'ordre du jeu de données, et le filtre de couloir (≤ 6 km du tracé) s'appliquait à ce tirage. Mesuré sur l'API réelle : **le tirage de 80 ne contenait aucune station du couloir de 6 km. Zéro sur 80.** `/api/stations-near` avait le même défaut (60 demandées, 96 stations à moins de 8 km de Paris).

Correction, vérifiée contre l'API réelle avant d'être écrite :
- `order_by=distance(geom, geom'POINT(lon lat)')` — la fonction `distance()` est documentée comme utilisable en `select` et `order_by` dans ODSQL. Les enregistrements rendus sont désormais les plus proches, c'est-à-dire exactement ceux que le couloir retient.
- `limit` porté à 100, plafond documenté de l'API Explore v2.1.
- Rayon déduit de l'espacement des points au lieu d'être fixé à 28 km : `packages/algorithms/route-corridor.mjs`, testé. Un point doit couvrir `espacement / 2 + couloir`, pas davantage — au-delà il redemande ce que son voisin a déjà vu, en saturant la limite.
- La troncature restante est signalée dans `coverage.truncated` plutôt que tue.

Après correction, même point de départ : 69 stations rendues sur 69 existantes, **13 dans le couloir**, Ferrières-en-Brie et Croissy-Beaubourg comprises.

Limite qui demeure, et qui n'est pas un bug : le flux du ministère **ne porte aucune enseigne**, et ne contient que les stations qui déclarent leurs prix. Un Carrefour City qui ne déclare pas n'y figure pas, et aucune station n'y est nommée « Carrefour ». C'est une limite de la source, pas du filtre.

## Retours du test du 20/08 — état

Corrigés dans ce lot :
- **Le fil du voyage s'arrêtait au plein.** `buildJourney` était court-circuité à une seule étape dès que le carburant était critique : 750 km, 6 h 32, un seul événement affiché. Un ravitaillement d'urgence ouvre désormais le fil au lieu de le remplacer (`urgentStation`).
- **Aucune pause après un ravitaillement.** L'étape de confort ne se déclenchait que `if (!steps.length)` : un seul arrêt carburant retenu supprimait toute pause du reste du trajet. Remplacé par la règle réelle — on roule au plus `MAX_DRIVING_STRETCH_MIN`, puis on s'arrête — en plaçant la station **la plus tardive encore acceptable**, pas celle du milieu (couper au milieu laisse une seconde moitié aussi longue que le maximum et gaspille un arrêt).
- **Un repas était abandonné** dès que son meilleur candidat était trop proche d'un arrêt déjà retenu. On essaie maintenant les candidats suivants du créneau.
- **Les arrêts imposés bloquaient le suivant.** Un plein d'urgence au km 8 interdisait le dîner d'un départ à 20 h 52, faute de station à plus de 90 km encore dans le créneau. Un arrêt imposé (plein au départ, urgence) ne compte plus dans l'espacement.
- **Le classement d'urgence ignorait le prix.** Tri purement kilométrique, d'où Émerainville. On y fait le plein *complet* : l'atteignabilité reste la contrainte, le prix devient l'objectif (0,10 €/L sur 60 L = 6 €, soit bien plus que quelques kilomètres).
- **Après un plein d'urgence, la suite se planifiait sur le réservoir vide.** Même défaut que pour le plein au départ, corrigé de la même façon.
- **Les intentions étaient verrouillées sur « Carburant ».** Un niveau critique impose le plein, il n'interdit pas d'avoir faim.
- **« FLOWAY AI » dans la barre du bas était `<a href="/ev">`** — la page véhicule électrique, étiquetée « FLOWAY AI ». Renommée « ÉLECTRIQUE ».

Faits ensuite :
- **Couche de trafic.** Tuiles TomTom *Raster Flow*, format vérifié dans la documentation : `https://api.tomtom.com/traffic/map/4/tile/flow/{style}/{z}/{x}/{y}.png`, styles `absolute`, `relative`, `relative0`, `relative0-dark`, `relative-delay`, `reduced-sensitivity`. `relative0-dark` retenu : vitesse relative à la fluidité, sur fond sombre. **L'URL porte la clé d'API**, donc elle ne peut pas figurer dans le `src` d'une image : les tuiles passent par `/api/traffic-tiles/{z}/{x}/{y}`, qui valide strictement le pavage pour ne pas devenir un proxy ouvert. Sans clé, le relais répond 503 et la carte affiche « Trafic non connecté » plutôt qu'un calque muet. Sytadin est écarté : Île-de-France seulement, pas d'API publique.
- **Aucun contrôle de la carte ne fonctionnait.** `setPointerCapture` était appelé dès `pointerdown` sur le cadre : le `click` était alors dispatché au cadre et non au bouton. Plan, vue aérienne, zoom, recadrer — tous inertes. Seuls les repères y échappaient, grâce à leur `stopPropagation`. La capture n'est désormais prise qu'au premier mouvement avéré. C'est la « carte non interactive » constatée.

## Carte tactile, trafic dédié, alertes réelles — retour du 22/08

**Pincement à deux doigts.** La carte ne se zoomait qu'aux boutons. `zoomViewAt` zoome désormais en gardant fixe le point entre les deux doigts — zoomer sur le centre pendant un pincement décentré donne l'impression que la carte fuit. Les niveaux restent entiers, le pavage réclamant un `TILEMATRIX` entier : on ne change de niveau qu'au franchissement d'un doublement ou d'une division par deux de l'écart, ce qui évite de sauter de niveau sur un tremblement de doigt. Un `pointerleave` sans `pointerup` ne laisse plus de pincement fantôme.

**La touche « Trafic » semblait morte.** Elle fonctionnait, mais `ZOOM_TRAFIC_MIN` valait 6 alors que le cadrage par défaut d'un Paris–Marseille est plus large : on appuyait, et seule une petite mention « Zoomez pour afficher le trafic » apparaissait. Seuil ramené à 5, où le trafic autoroutier reste lisible.

**Carte de trafic à part.** `TrafficBoard` est une section propre, repliée par défaut — elle pèse quelques dizaines de tuiles et n'a pas à se charger tant qu'on ne la regarde pas. Elle n'affiche ni arrêt ni classement : le tracé sert de repère, rien d'autre. Sans itinéraire, elle se cadre sur la position, avec un zoom plafonné (sur un point unique, l'ajustement choisirait le niveau le plus fin et donnerait une vue de quartier là où on attend une vue régionale).

**La pastille d'alertes.** Elle n'était plus factice — c'est le nombre d'incidents TomTom réels — mais deux choses manquaient :

- le panneau qu'elle ouvrait affichait « surveillance active » et trois lignes d'état, **sans jamais nommer les incidents comptés**. Il liste désormais chacun : nature, route, distance, retard, description, et sa source ;
- rien ne permettait de l'éteindre. Un bouton « marquer comme lu » acquitte les alertes vues.

L'acquittement supposait un identifiant stable, qui n'existait pas : `/api/safety` numérotait les incidents par leur **rang** dans la réponse (`incident-0`, `incident-1`…). Ce rang change dès qu'un incident apparaît ou disparaît — un acquittement enregistré sur `incident-2` aurait masqué un autre incident au relevé suivant. `cleIncident` dérive la clé de ce que l'incident *est* : catégorie, routes, extrémités, position arrondie à ~100 m. Un incident dont on ignore tout rend `null` et **reste affiché** : on ne le fait pas disparaître au motif qu'on ne sait pas l'identifier. Et les acquittements d'incidents disparus sont oubliés, sinon un bouchon résolu resterait acquitté pour toujours et ne serait jamais signalé s'il revenait.

## Lisibilité de la carte et de la liste — retour du 22/08

**Les repères écrasaient la carte.** Bug de spécificité CSS : `.stop circle` (0,1,1) l'emporte sur `.hit` (0,1,0), donc **la cible tactile invisible de 18 px de rayon était peinte**. À l'échelle de la France, cela donnait d'énormes ronds orange qui se chevauchaient et masquaient le tracé. Le voisin `.clickable:hover circle:not(.hit)` excluait déjà `.hit` — la règle de base l'avait oublié. Corrigé par `:not(.hit)` sur les trois règles de peinture, et `.hit` neutralisé sans condition.

**Trois cartes titrées « Vierzon ».** Sans enseigne au flux et sans adresse nommant un lieu, `stationTitle` retombe sur la commune : rien ne distinguait les trois d'un coup d'œil. `distinguerTitres` complète le titre par la voie **uniquement là où il se répète** — une station seule dans sa commune garde « Vierzon », plus lisible que « avenue du 19 mars 1962 ». Sans adresse exploitable, le titre reste nu : l'ambiguïté demeure mais rien n'est inventé.

**Le classement dispersait les communes.** Vierzon, Vierzon, Theillay, Salbris, Farges-Allichamps, Bourges, puis **Vierzon** à nouveau. Revoir plus bas une commune déjà vue se lit comme une erreur, même quand le score le justifie. `regrouperParLieu` rassemble chaque commune au rang de sa meilleure station, sans rien retirer ni déplacer d'un lieu à un autre : seule l'adjacence change.

Les deux fonctions vivent dans `packages/algorithms/station-list.mjs`, pures et testées (9 tests, dont la non-perte et la non-duplication d'entrées, et le cas des stations sans commune identifiable qui ne doivent pas être fondues en un faux ensemble).

Le sous-titre de la carte dit désormais « sur autoroute » ou la commune, au lieu de répéter l'adresse déjà remontée dans le titre.

## L'enrichissement TomTom des stations était cassé — trouvé en production

Vérifié après mise en ligne : `/api/station-brands` ne trouvait **aucune enseigne** sur six points testés. En creusant avec `/api/station-details`, la cause est apparue et elle est plus large : **40 POI ramenés, `station: null` partout** — à Ferrières-en-Brie, à Vierzon et à Lyon. L'enrichissement de la fiche station ne fonctionnait donc pas, et pas seulement pour les enseignes.

Cause. Les deux routes appelaient `nearbySearch`, qui rend les points d'intérêt les plus proches **toutes catégories confondues**, plafonnés à 40. En zone dense, ces 40 sont des commerces et des restaurants : aucune station-service n'y figure, et le filtre par texte ne pouvait rien trouver. Même défaut de forme que la couverture du flux carburant — un tirage tronqué avant le filtre.

Correction. `categorySearch/{query}` accepte un **nom de catégorie en texte libre**, pas un identifiant numérique : c'est écrit dans la documentation, il n'y a donc rien à deviner. C'est ce qui manquait quand `categorySet` avait été écarté faute de connaître le code de la catégorie. Les deux routes cherchent désormais `station-service` par catégorie, et le prédicat texte ne sert plus que de garde-fou.

À vérifier en production après déploiement : le conteneur de développement n'a pas accès à TomTom, cette correction n'a donc pas pu être éprouvée contre l'API réelle avant d'être écrite.

## Enseignes des stations

Le flux du ministère ne porte **aucune marque** — vérifié sur le catalogue de l'API. Or l'enseigne décide de l'arrêt pour qui possède une carte carburant, et c'est la première chose qu'on cherche dans une liste.

`/api/station-details` savait déjà la lire chez TomTom, mais une station à la fois, à l'ouverture de la fiche. `/api/station-brands` fait le même travail par lot, plafonné à **6 stations par appel** : chaque station coûte un appel TomTom, donc l'enrichissement est réservé aux étapes du voyage et à l'arrêt recommandé — ce qui est réellement lu — jamais à la liste entière. Cache d'une journée : les enseignes bougent peu.

`categorySet` n'est **pas** employé : la documentation confirme le paramètre, mais la page des codes ne donne pas le numéro de la catégorie « petrol station », et un code inventé filtrerait silencieusement tous les résultats. On garde le prédicat texte déjà éprouvé en production sur `station-details`.

Ce qui manque reste dit : une station sans enseigne trouvée rend `null`. Aucune marque n'est déduite du nom de la commune ni de l'adresse — et sans marque déclarée par TomTom, le nom du point d'intérêt ne la remplace pas, car il vaut souvent l'adresse.

Reste à faire de ce côté : filtrer la liste par enseigne, pour les porteurs de cartes. Cela suppose d'enrichir plus de stations que six, donc un choix de coût.

Restent ouverts :
1. **Refonte du mode énergie.** `EnergyKind` connaît déjà `hybride` et `hybride-rechargeable`, mais l'écran traite l'énergie en binaire (`electricVehicle = energyKind === 'electrique'`). Une hybride rechargeable a **un réservoir et une batterie** : aucun des deux branchements actuels ne la décrit. Et `/ev` est un second formulaire complet, déconnecté du véhicule et du trajet déjà saisis — c'est pour cela qu'il n'a jamais servi.

## En ligne depuis le 22/08

`main` est passé de `cfd35e6` à `e6fb2a9` : les 7 commits du chantier sont en production. Vérifié sur le site — `/api/stations-near` répond 200 et rend en premier l'Intermarché de Ferrières-en-Brie (ZAC DES HAUTS DE FERRIERES), à 0,4 km, exactement la station qui manquait au test. `/api/traffic-tiles/10/517/352` rend une image PNG : la clé TomTom est bien configurée sur Vercel, la couche de trafic fonctionne.

**Leçon retenue** : `POUSSER.ps1` pousse la branche courante. Il faut `FUSIONNER.ps1` pour mettre en production. Sans quoi on teste du vieux code et on corrige à l'aveugle — ce qui est arrivé pendant plusieurs jours.

Et les scripts PowerShell doivent rester en **ASCII pur** : Windows PowerShell 5.1 lit les `.ps1` en CP1252 faute de BOM, et un tiret cadratin `—` s'y décode en une séquence dont le dernier octet est `"`, que PowerShell accepte comme guillemet fermant. Une chaîne se referme alors en plein milieu.

## `Number(null)` vaut 0 — cinq routes touchées

Trouvé en vérifiant le premier appel en production : `/api/stations-near` renvoyait `radiusKm: 1` alors que le défaut est 8.

`URLSearchParams.get()` rend `null` quand le paramètre est absent, et **`Number(null)` vaut `0`, qui est fini**. Le motif employé partout —

```ts
const lat = Number(params.get('lat'));
if (!Number.isFinite(lat)) return erreur;
```

— ne détecte donc jamais un paramètre manquant : il le remplace silencieusement par zéro.

Conséquences réelles :
- `/api/stations-near` : sans `radius`, la valeur devenait 0, passait le test de finitude, puis était ramenée à 1 km par la borne basse. **La station d'à côté n'était cherchée que dans un rayon d'un kilomètre.**
- `/api/reverse-geocode`, `/api/safety` : coordonnées ou bbox absentes traitées comme le point 0°/0°, au large du golfe de Guinée.
- `/api/station-details`, `/api/station-fuels` : des coordonnées absentes devenaient 0°/0° et **empêchaient le repli par géocodage du nom**, qui n'était donc jamais atteint.

Corrigé par `packages/algorithms/query-params.mjs` — module pur, 10 tests : `nombreDeRequete` (absent, vide, illisible, infini → défaut ; bornes appliquées à la valeur lue, pas au défaut ; un `0` explicite reste un zéro) et `positionDeRequete` (couple incomplet → null ; coordonnée hors du monde refusée plutôt que ramenée à la borne, corriger silencieusement reviendrait à inventer un lieu).

## Historique : la production est restée figée jusqu'au 22/08

Vérifié le 22/08 : `git ls-remote` donne `main = cfd35e6`, inchangé depuis le début de ce chantier, et `refactor/phase-1-state-store = b0fd71d`. Contre-épreuve directe sur le site : `https://floway-app.vercel.app/api/stations-near` répond **404** — cette route n'existe que sur la branche.

`POUSSER.ps1` pousse la **branche courante**. Tous les lots sont donc partis sur `refactor/phase-1-state-store`, et la production n'a jamais bougé. Les tests menés sur `floway-app.vercel.app` portaient sur le build d'avant la refonte : c'est ce qui explique les constats déjà corrigés depuis (carte, champs numériques, marque de station).

`FUSIONNER.ps1` bascule la branche sur `main` après vérification de l'état de la CI.

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
