# Outils de vérification

## `css-snapshot.mjs` + `css-diff.mjs`

Comparateur de rendu, pour refactoriser le CSS sans changer l'affichage.

```
npm --prefix apps/web run build
node tools/css-snapshot.mjs /tmp/avant.json

# … modifier le CSS …
npm --prefix apps/web run build
node tools/css-snapshot.mjs /tmp/apres.json

node tools/css-diff.mjs /tmp/avant.json /tmp/apres.json   # sort en erreur s'il reste une différence
```

L'empreinte parcourt 12 états — accueil, fiche station, fenêtre d'itinéraire et
menu, à 1440, 760 et 390 px — et relève, pour chacun des ~4 500 éléments,
58 propriétés calculées plus son rectangle. Soit environ 260 000 valeurs
comparées.

**Pourquoi pas une simple comparaison de sélecteurs.** En fusionnant
`dynamic-reference.css`, l'analyse des sélecteurs communs annonçait sept
collisions. Elle en manquait une : `.v3track button` et `.journeyMarker`
désignent les mêmes éléments sous deux noms différents, et les marqueurs de la
frise passaient de 34 à 42 px. Seul le style calculé le montre.

**Ce qui est ignoré.** Le port du serveur de test change à chaque exécution :
il est normalisé. Les éléments en cours d'animation ou de transition — l'orbe
`.v3orb i`, la bannière d'installation PWA — et leurs descendants ont une
opacité, un `transform` et un rectangle qui dépendent de l'instant de la
capture ; ces propriétés-là sont écartées pour eux seuls, et le nombre d'écarts
ignorés est affiché. Deux captures du *même* build donnent bien 0 différence
réelle : c'est le contrôle de l'outil lui-même.

**Prérequis.** `next build` à jour et Playwright installé. Les chemins du
module et du binaire Chromium se règlent par `PLAYWRIGHT_MODULE` et
`CHROMIUM_PATH`.
