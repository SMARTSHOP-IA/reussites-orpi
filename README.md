# Réussites Orpi — outil de gestion des trophées

Un seul outil remplace les trois fichiers suivants :

- « Réussites SMARTCLIC » : le fichier de la cliente. L'outil le lit tout seul.
- « Répartition GIE récompenses » : la répartition, les GIE et les livraisons.
- « Répartition Laser Style » : les quantités à envoyer à l'usine.

## Ce que fait l'outil

| Vue | Rôle |
|---|---|
| Tableau de bord | Totaux par métal, incohérences, choses à produire, formulaires à traiter, livraisons. Avancement par région, dans l'ordre de priorité. |
| Récompenses | Une ligne par trophée, avec filtres. Les incohérences sont en couleur : rouge = bloquant, orange = à vérifier. Les corrections manuelles sont soulignées en bleu et ne sont jamais écrasées par le fichier client. Les conflits sont arbitrés en un clic. |
| Régions & livraisons | Ordre de priorité (glisser-déposer), contacts, une ou deux adresses, répartition des agences entre les deux adresses, envoi et relance du formulaire, validation des réponses. |
| Productions usine | Création de lots (un GIE est toujours produit en entier), envoi à l'usine, suivi, export Excel. Un trophée modifié après production devient un complément facturable. |
| Expéditions | Transporteur, n° de suivi (avec lien de suivi), colis, dates, statut. Une ligne par adresse. |
| Diplômes | Statut du BAT par région, liste exportable, diplômes à revoir après un changement. Le générateur de diplômes sera ajouté plus tard. |
| Références trophées | Une liste par métal. On peut modifier, ajouter, réordonner ; la numérotation se recalcule toute seule. Règles d'attribution : catégorie du fichier client + civilité. |
| Journal | Toutes les lignes ajoutées, modifiées ou supprimées (par le client ou à la main), plus les actions de suivi. Export Excel. |
| Paramètres | Lien du Google Sheet, import manuel (Excel ou CSV), textes des e-mails, accès cliente et usine, éditions, sauvegarde. |

**Synchronisation** : le Google Sheet de la cliente est relu à chaque ouverture de l'outil. Les écarts sont appliqués tout de suite et tracés dans le journal :

- une correction manuelle est conservée ;
- si la cliente finit par saisir la même valeur que la correction, la correction disparaît ;
- si elle saisit une autre valeur, l'outil signale un conflit.

**Profils**

| Profil | Accès |
|---|---|
| Équipe Smartshop | Tout compte Google @smartshop.fr. Lecture et modification. |
| Cliente | Lecture seule. Ne voit pas la vue usine. |
| Laser Style | Uniquement les lots envoyés et les quantités. Aucun nom de lauréat. |

## Où tourne l'outil

L'outil suit la même installation que « Étude des commandes » :

- **Site** : GitHub Pages, depuis la branche `main` de ce dépôt (racine), à l'adresse https://smartshop-ia.github.io/reussites-orpi/.
- **Données** : le projet Firebase partagé `smartshop-catalogues`, dans des collections préfixées `reussites_` :
  - `reussites_editions`, avec, par édition, les sous-collections `references`, `gies`, `lignes`, `lots` et `journal` ;
  - `reussites_formulaires` ;
  - `reussites_acces`.
- **Mode démo** : ajouter `?demo=1` à l'adresse. Les données restent dans le navigateur et les e-mails sont simulés. Le jeu de test se charge depuis l'écran de connexion avec le fichier `seed-2026.json`.

Le dépôt ne contient aucune donnée : le dossier `data/` est exclu par `.gitignore`, car il contient les noms des lauréats.

## Service d'envoi (Railway) — e-mails et Google Sheet au nom de celia@smartshop.fr

Le dossier `api/` contient un petit service Node, sans dépendance, déployé sur Railway. Il agit au nom de **celia@smartshop.fr** :

- il lit le Google Sheet de la cliente : c'est le compte de Célia qui doit y avoir accès ;
- il envoie les formulaires de livraison depuis la boîte Gmail de Célia. Les e-mails apparaissent dans ses « Envoyés » et les réponses arrivent chez elle.

Seule l'équipe peut appeler le service. Il vérifie la connexion Firebase de la personne : un compte @smartshop.fr, ou un rôle `editor` dans `authorizedUsers`.

Mise en place (une fois) :

1. **Google Cloud**, projet smartshop-catalogues :
   - activer l'API Gmail et l'API Google Sheets ;
   - créer le compte de service `reussites-orpi-envoi` et générer une clé JSON.
2. **Console d'administration Google Workspace** (admin.google.com) :
   - aller dans Sécurité › Accès et contrôle des données › Commandes des API › Délégation au niveau du domaine ;
   - ajouter l'ID client du compte de service avec les champs d'application :
     `https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/spreadsheets.readonly`
3. **Railway** :
   - créer un service depuis le dépôt GitHub, avec `/api` comme dossier racine ;
   - ajouter la variable `GOOGLE_SA_KEY`, qui contient tout le JSON de la clé. Facultatif : `COMPTE_DELEGUE` (celia@smartshop.fr par défaut) ;
   - générer un domaine public.
4. Adresse du service (déjà renseignée dans `js/config.js`, constante `API_URL`) : https://reussites-orpi-production.up.railway.app

Quand `API_URL` est vide, l'outil utilise le compte Google de la personne connectée.

## Réglages à faire une fois dans Firebase (projet smartshop-catalogues)

1. **Règles Firestore** : dans la console Firebase, ouvrir Firestore › Règles. Coller le contenu de `firestore-regles-reussites.rules` à l'intérieur du bloc `match /databases/{database}/documents { … }`, puis cliquer sur Publier. *Fait le 03/11/2026.*
2. **Authentication** : Google, et adresse e-mail avec lien de connexion. Le domaine `smartshop-ia.github.io` doit être autorisé. *Fait.*

## Premier lancement

1. Se connecter avec son compte Google smartshop.fr.
2. Dans Paramètres :
   - vérifier le lien du Google Sheet de la cliente et l'onglet `CATEGORIES CONFONDUES` ;
   - pour tester avec 2026, utiliser « Charger le jeu de test 2026 » avec `seed-2026.json` ;
   - ajouter les accès de la cliente et de Laser Style. Ils se connecteront avec un lien reçu par e-mail.

Le compte celia@smartshop.fr doit avoir accès au Google Sheet de la cliente.

## Édition 2027

Dans Paramètres, « Créer cette édition » crée l'édition 2027. Elle reprend les références, les régions, les contacts, les adresses et les priorités. Ensuite :

1. renseigner le lien du nouveau fichier de la cliente ;
2. au premier import, toutes les récompenses arrivent.

## Structure

```
index.html, formulaire.html     application + formulaire public de livraison
js/logic.js                   moteur : références, incohérences, comparaison, production (testé)
js/model.js                   calculs dérivés (par GIE, statistiques)
js/actions.js                 toutes les modifications (avec journal)
js/store.js                   Firestore / démo (localStorage)
js/auth.js, google.js         connexion, Google Sheets, Gmail
js/exports.js, xlsx.js        exports Excel
js/views/*.js                 écrans
firestore-regles-reussites.rules  règles à ajouter dans le projet Firebase
tools/                          reprise des fichiers 2026 → jeu de test
tests/logic.test.mjs            tests du moteur (node --test tests/)
```

Pour regénérer le jeu de test 2026 à partir des fichiers Excel :

```
python3 tools/extract_2026.py client.xlsx repartition.xlsx laserstyle.xlsx raw.json
node tools/build_seed.mjs raw.json data/seed-2026.json
```
