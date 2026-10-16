# Ponts de pochoir et de découpe — script Adobe Illustrator

**PontsPochoir.jsx** v1.0.0 — trouve les « îles » qui tomberaient à la découpe et pose automatiquement les ponts les plus courts pour qu'elles restent attachées : pochoirs, découpe laser, plasma, jet d'eau, fraiseuse CNC.
*Finds the "islands" that would fall out when cutting and automatically adds the shortest bridges that keep them attached: stencils, laser, plasma, water-jet, CNC (FR/EN dialog).*

## Ce que fait le script

Quand on découpe le mot « BONJOUR » dans une plaque, l'intérieur du B, des O et du R tombe : ce sont des îles. Il faut ajouter à la main de petits ponts (Gomme ou Pathfinder > Soustraire, lettre par lettre). Ce script le fait pour tout le dessin sélectionné :

1. **il prépare une copie** du dessin : textes vectorisés, formes fusionnées (Pathfinder > Ajouter), objets non vectoriels écartés ;
2. **il lit l'imbrication réelle des contours** (courbes de Bézier comprises) : contour extérieur, contre-forme, forme dans une contre-forme (®, ©, ◎), etc. ;
3. **il cherche pour chaque île le passage le plus étroit** vers la matière voisine, en vérifiant que le pont reste dans la partie à franchir et ne coupe aucun autre contour ;
4. **il relie toutes les îles par un arbre de ponts minimal** (le moins de ponts possible, les plus courts possible), ou, au choix, chaque île directement vers la forme qui l'entoure ;
5. **il pose des rectangles de pont** prolongés juste assez pour franchir les deux bords sur toute leur largeur (pas de reste fin qui couperait le pont), puis **les applique** par Pathfinder ;
6. **il vérifie le résultat** : nombre d'îles restantes après découpe.

Deux types de découpe :

- **Pochoir** : le dessin est évidé, la feuille autour doit tenir (intérieur des lettres, logos en négatif, plaques gravées traversantes). Les ponts sont **retirés** du dessin.
- **Pièce découpée** : le dessin est gardé et toutes ses parties doivent tenir ensemble (enseigne découpée d'un seul tenant, point du i, accents, points des lettres arabes, élément posé dans une contre-forme). Les ponts sont **ajoutés** au dessin.

Options :

- largeur du pont et longueur maximale (mm) ;
- 1 ou 2 ponts par île (le second est placé loin du premier, pour un pochoir plus rigide) ;
- orientation : la plus courte, verticale ou horizontale (aspect « police pochoir ») ;
- relier chaque île à la forme qui l'entoure (pas de pont entre deux îles, comme le 8 des polices pochoir) ;
- lecture du dessin : **Auto**, **formes pleines** (fusionnées) ou **lignes de coupe** (fichiers laser en traits seuls : chaque tracé fermé est une coupe, imbrication pair / impair) ;
- vectoriser les traits quand ils font partie du dessin ;
- masquer l'original (conservé intact).

Deux façons de travailler :

- **Créer et appliquer** : tout est fait en une fois.
- **Poser seulement** : les ponts sont posés en rectangles magenta sur un calque non imprimable **« Pochoir – ponts #n »**. Déplacez-les, élargissez-les, ajoutez-en ou supprimez-en, puis relancez le script et cliquez sur **Appliquer les ponts posés**.

Le bouton **Analyser** indique le nombre d'îles, de ponts nécessaires et leur longueur, sans rien laisser dans le document. Les îles impossibles à relier (longueur maximale trop courte, orientation imposée) sont entourées en rouge. Fonctionne avec l'arabe (ه، و، ق، ف، م، ص، ط…), le latin et tout dessin vectoriel. Les réglages sont mémorisés dans un petit fichier local (dossier des données utilisateur).

## Pourquoi c'est nouveau

Vérifié le 16 octobre 2026 :

- **Illustrator** n'a aucune fonction de ponts (ni dans les nouveautés jusqu'à la version 30.8). La méthode documentée partout reste manuelle : Gomme avec Maj, ou rectangles + Pathfinder > Soustraire (Graphic Design Stack Exchange « Quickest way to create stencil bridge in Illustrator », Adobe Community « Text for plasma cutting » et « Trouble creating bridge in text », Reddit r/AdobeIllustrator, aide Ponoko, blog Bay Stencil).
- **Les outils automatiques existent seulement hors d'Illustrator** : sites web (Bay Stencil, Stencil It, Makerfern, Stencilfy), extensions Inkscape (inkscape-stencil-islands, inkscape-pathbinder), bibliothèque TypeScript laser-stencil, outil Python Stencilizer (pour les polices TrueType), GMLStenciler. Il faut exporter puis réimporter, avec perte des calques et de la mise en page.
- **GitHub** : aucune recherche (« stencil bridge », « stencil illustrator », code `stencil app.activeDocument` en .jsx) ne donne de script Illustrator de ce type.
- Rien chez les auteurs connus (creold, Hiroyuki Sato, John Wundes, Alexander Ladygin, wckdtall, Kelso Cartography) ni dans les boutiques consultées (Astute Graphics — VectorScribe n'a pas de ponts —, Adobe Exchange — « Stencilizer by Schwingo » est un module Photoshop de trames, sans ponts —, aescripts, Gumroad).

## Installation

- **Ponctuelle** : Fichier > Scripts > Autre script…, puis choisir `PontsPochoir.jsx`.
- **Permanente** : copier le fichier dans le dossier `Presets/<langue>/Scripts` d'Illustrator (par exemple `Adobe Illustrator 2026/Presets/fr_FR/Scripts` sur macOS ou `C:\Program Files\Adobe\Adobe Illustrator 2026\Presets\fr_FR\Scripts` sur Windows), puis redémarrer Illustrator. Le script apparaît dans Fichier > Scripts.

## Utilisation

1. Travaillez sur une **copie** de votre fichier.
2. Sélectionnez le dessin : texte, tracés, tracés transparents (composés) ou groupes.
3. Lancez le script, choisissez le type de découpe, la largeur des ponts (par exemple 1,5 mm pour un pochoir en PVC, 3 mm pour de l'acier découpé au plasma) et cliquez sur **Analyser**.
4. Cliquez sur **Créer**. Le résultat est sur le calque **« Pochoir – résultat #n »**, l'original est masqué (Objet > Tout afficher pour le revoir).

**Annuler** : Ctrl+Z / Cmd+Z. Les commandes Pathfinder appelées par le script peuvent créer plusieurs étapes d'annulation selon la version : appuyez plusieurs fois, ou supprimez simplement les calques « Pochoir – … » puis Objet > Tout afficher. L'original n'est jamais modifié.

## Version cible et statut des tests

- Cible : Adobe Illustrator CC 2018 et plus récent (ExtendScript, Windows et macOS).
- **Non testé dans Illustrator.**
- Syntaxe vérifiée avec acorn en mode ES3 et ES5.
- Géométrie vérifiée sur données simulées (`tests/test-core.js`, 44 tests) : aplatissement des courbes, O, 8, ®, trou en C, trou plus étroit que le pont, mode pièce (i, point dans un O), orientation imposée, 2 ponts par île, longueur maximale, 80 lettres. La découpe réelle est contrôlée avec une bibliothèque de booléens (polygon-clipping) : ponts soustraits ou ajoutés, puis comptage des morceaux obtenus, y compris sur 60 dessins aléatoires.
- Préparation, pose des ponts, application et messages vérifiés sur objets Illustrator simulés (`tests/test-simulation.js`, 22 tests, Pathfinder simulé). Ces simulations ne remplacent pas un essai réel.

Pour lancer les tests : `npm i polygon-clipping` puis `node tests/test-core.js` et `node tests/test-simulation.js`.

Limites : un objet blanc posé par-dessus un objet noir n'est pas un trou (faites d'abord Pathfinder > Soustraire) ; les masques d'écrêtage, les effets dynamiques et les images ne sont pas pris en compte ; en lecture « lignes de coupe », les tracés qui se croisent donnent un résultat à vérifier. Sur de très gros textes, l'analyse peut prendre quelques dizaines de secondes.

Aucun appel réseau, aucune collecte de données.

## Licence

MIT © 2026 Amirouche Amwanes — voir [LICENSE](LICENSE).
