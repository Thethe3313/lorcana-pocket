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
- **Boosters** : 6 cartes (3 communes, 2 peu communes, 1 rare ou mieux). 2 boosters gratuits, rechargés toutes les 6 h, ou 50 pièces.
- **Collection** : progression par set, filtres, cartes manquantes en grisé, recyclage des doublons en pièces.
- **Decks** : format Pocket de 30 cartes, 2 exemplaires et 2 encres au maximum, deck automatique.
- **Combat** : règles Lorcana simplifiées (encrier, quêtes, défis, chansons, Alter/Shift, mots-clés), IA facile, normale ou difficile. Premier à 20 lore.
  Les effets courants (dégâts, pioche, bannissement, soins…) sont appliqués automatiquement à partir du texte officiel anglais ; les autres capacités sont ignorées. Les objets, les lieux et les actions non reconnues ne se jouent pas encore en combat.

## Le dossier
| Dossier | Contenu |
|---|---|
| `jeu/` | Le jeu publié : `index.html`, `css/`, `js/` (`engine.js` règles et IA, `store.js` sauvegarde et boosters, `app.js` écrans, `battle.js` combat), `data/cards.json` (cartes), icônes, manifeste et service worker. |
| `scripts/` | `build-jeu-data.mjs` régénère `jeu/data/cards.json` depuis LorcanaJSON (nouveaux sets) ; `serve.mjs` lance le jeu en local (http://localhost:8080) ; `simulate.mjs` fait jouer l'IA contre elle-même pour vérifier le moteur ; `creer-raccourci.ps1`, `creer-icones.ps1`. |
| `data/`, `images/` | Non publiés : la base SQLite des cartes (`lorcana.db`, avec les textes français) et les visuels HD téléchargés (`import-lorcana.mjs`, `make-thumbs.ps1`). |

Mettre à jour les cartes après la sortie d'un nouveau set :

```bash
node scripts/build-jeu-data.mjs
```

## Sources et droits
Données des cartes : [LorcanaJSON](https://lorcanajson.org) (français et anglais) ; base SQLite : [Lorcast](https://lorcast.com). Les visuels sont affichés depuis le site officiel de Ravensburger, ils ne sont pas copiés dans ce dépôt.
Disney Lorcana, ses cartes et ses illustrations appartiennent à Disney et Ravensburger. Ce jeu est un projet de fan non officiel, gratuit et sans publicité.
