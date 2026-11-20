# Lorcana Pocket

Jeu de cartes Disney Lorcana façon Pokémon TCG Pocket : ouvre des boosters, complète ta collection, construis des decks et affronte l'IA. Cartes en français (ou en anglais, au choix dans les Réglages).

## Jouer
**En ligne (ordinateur ou téléphone) : https://thethe3313.github.io/lorcana-pocket/**
- Sur téléphone : ouvre l'adresse dans Chrome (Android) ou Safari (iPhone), puis « Ajouter à l'écran d'accueil » (Android : menu ⋮ ; iPhone : bouton Partager). Le jeu s'ouvre alors en plein écran, comme une appli.
- Sur cet ordinateur : **double-clic sur « Lorcana Pocket »** (le raccourci à l'étoile) : le jeu s'ouvre dans sa propre fenêtre. Pour l'avoir sous la main : clic droit → « Épingler à la barre des tâches ». Si le raccourci disparaît : `scripts\creer-raccourci.ps1` (clic droit → « Exécuter avec PowerShell »).
- Après une première ouverture, le jeu marche sans réseau ; les visuels des cartes, eux, viennent du site de Ravensburger et demandent une connexion (hors ligne, un cadre de carte les remplace).
- Le site est mis à jour automatiquement à chaque envoi du projet sur GitHub (`git push`).

La partie est enregistrée dans le navigateur de chaque appareil. Pour la passer de l'ordinateur au téléphone : **Réglages (⚙️) → Exporter ma partie**, puis **Importer une partie** sur l'autre appareil.
Ta partie de la première version (avec le serveur local) a été convertie dans `ma-partie-lorcana.json` : importe-la de la même façon.

## Le jeu
- **Boosters** : comme les vrais, 12 cartes : 6 communes, 3 peu communes, 2 « rare ou mieux » et 1 foil (toutes raretés ; les Épiques, Enchantées et Iconiques ne sortent que là). Le **Booster Mystère** tire chaque carte dans un set au hasard. 2 boosters gratuits, rechargés toutes les 6 h, ou 100 pièces.
  Taux (estimations de la communauté, Ravensburger ne publie pas de chiffres officiels) : Légendaire ≈ 1 booster sur 4, Épique ≈ 1 sur 25, Enchantée ≈ 1 sur 50, Iconique ≈ 1 sur 200. Réglables dans `jeu/js/store.js` (`ECO`).
- **Collection** : recherche par nom ou texte dans tous les sets (sans tenir compte des accents), filtres (encre, type, rareté, coût, possédées / manquantes / doublons, jouables en combat), tri (numéro, nom, coût, rareté, prix), cartes manquantes en grisé avec leur prix.
- **Achat de cartes** : chaque carte s'achète à l'unité. Prix = cote du marché (USD, source Lorcast ; 1 $ = 20 pièces) avec un minimum selon la rareté ; revente des doublons à 20 % du prix.
- **Decks** : règles officielles, au moins 60 cartes, 4 exemplaires maximum d'une même carte, 1 ou 2 encres. Deck automatique et bouton « Compléter avec mes cartes ».
  **🏆 Meilleur deck** : cherche le deck le plus fort avec tes cartes, tous sets confondus, en simulant des milliers de parties contre des decks de référence puis en l'améliorant carte par carte (`jeu/js/optimizer.js`, dans un Web Worker).
  **📖 Guide** : explique comment jouer un deck (style, quoi mettre dans l'encrier, combos entre tes cartes, plan tour par tour, cartes clés, points faibles), calculé à partir de ses cartes (`jeu/js/guide.js`).
- **Combat** : règles Lorcana simplifiées (encrier, quêtes, défis, chansons, Alter/Shift, mots-clés), IA facile, normale ou difficile. Premier à 20 lore. **Mode auto** (🤖) : l'ordinateur joue tes tours à ta place, en vitesse normale ou rapide, et tu peux reprendre la main à tout moment.
  Les capacités sont lues dans le texte officiel anglais (`jeu/js/effects.js`) : déclencheurs (arrivée, quête, défi, bannissement, début/fin de tour…), effets permanents et conditions « While… », capacités ⟳ des objets, lieux (lore au début du tour, déplacement, bonus « ici », défi d'un lieu). Cartes dont toutes les capacités sont appliquées : 76 % des personnages, 65 % des actions, 65 % des objets, 55 % des lieux ; une capacité non comprise est ignorée en entier, et les actions, objets et lieux concernés ne vont pas dans les decks.

## Le dossier
| Dossier | Contenu |
|---|---|
| `jeu/` | Le jeu publié : `index.html`, `css/`, `js/` (`engine.js` règles et IA, `optimizer.js` recherche du meilleur deck, `store.js` sauvegarde et boosters, `app.js` écrans, `battle.js` combat), `data/cards.json` (cartes), icônes, manifeste et service worker. |
| `scripts/` | `build-jeu-data.mjs` régénère `jeu/data/cards.json` depuis LorcanaJSON (nouveaux sets) ; `serve.mjs` lance le jeu en local (http://localhost:8080) ; `simulate.mjs` fait jouer l'IA contre elle-même et mesure la couverture des effets ; `test-effets.mjs` vérifie des effets précis et des parties riches en objets et lieux ; `test-guide.mjs` ; `effets-manquants.mjs` liste les capacités pas encore appliquées ; `creer-raccourci.ps1`, `creer-icones.ps1`. |
| `data/`, `images/` | Non publiés : la base SQLite des cartes (`lorcana.db`, avec les textes français) et les visuels HD téléchargés (`import-lorcana.mjs`, `make-thumbs.ps1`). |

Mettre à jour les cartes après la sortie d'un nouveau set :

```bash
node scripts/build-jeu-data.mjs
```

## Sources et droits
Données des cartes : [LorcanaJSON](https://lorcanajson.org) (français et anglais) ; base SQLite : [Lorcast](https://lorcast.com). Les visuels sont affichés depuis le site officiel de Ravensburger, ils ne sont pas copiés dans ce dépôt.
Disney Lorcana, ses cartes et ses illustrations appartiennent à Disney et Ravensburger. Ce jeu est un projet de fan non officiel, gratuit et sans publicité.
