# Houcine Chapati — plateforme de commande et de livraison

Trois applications web connectées en temps réel à une même base **Supabase** :

| Application | Pour qui | Adresse locale | Optimisée pour |
|---|---|---|---|
| **Houcine Chapati** (`apps/client`) | les clients | http://localhost:5173 | iPhone, Android, ordinateur |
| **Houcine Chapati — Administration** (`apps/admin`) | le restaurant | http://localhost:5174 | ordinateur, tablette |
| **Houcine Chapati — Livreur** (`apps/livreur`) | les livreurs | http://localhost:5175 | smartphone |

Scénario couvert : **CLIENT → COMMANDE → RESTAURANT → PRÉPARATION → LIVREUR → GOOGLE MAPS → LIVRAISON → CLIENT**, avec mises à jour instantanées (Supabase Realtime), sécurité par Row Level Security, comptes clients vérifiés par Google et cartes Google Maps.

> Architecture détaillée (modèle de données, RPC, temps réel, notifications) : **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Installation](#2-installation)
3. [Configuration Supabase](#3-configuration-supabase)
4. [Création des tables (migrations)](#4-création-des-tables-migrations)
5. [Comptes et rôles](#5-comptes-et-rôles-admin--livreur--client)
6. [Edge Function de gestion des livreurs](#6-edge-function-de-gestion-des-livreurs)
7. [Commande sans compte (clients)](#7-commande-sans-compte-clients)
8. [Configuration Google Maps](#8-configuration-google-maps)
9. [Variables d'environnement](#9-variables-denvironnement-env)
10. [Lancement local](#10-lancement-local)
11. [Tester le scénario complet](#11-tester-le-scénario-complet)
12. [Déploiement](#12-déploiement)
13. [Sécurité](#13-sécurité)
14. [Fonctionnement général](#14-fonctionnement-général)
15. [Notifications (Push, WhatsApp, SMS)](#15-notifications-push-whatsapp-sms)
16. [Points à vérifier avec le restaurant](#16-points-à-vérifier-avec-le-restaurant)

---

## Essayer tout de suite (mode démo local, sans Supabase)

```bash
cd plateforme
npm install
npm run demo
```

Ouvre les 3 applications sur ce PC avec une base PostgreSQL embarquée qui exécute les **vraies** migrations, la vraie RLS et le temps réel. Les données sont en mémoire et remises à zéro à chaque lancement. Comptes : `admin@demo.dz` (administration), `karim@demo.dz` et `yanis@demo.dz` (livreurs), mot de passe `demo1234`. Le serveur de démo (`demo/server.mjs`) imite localement les API Supabase : il sert à essayer et à présenter la plateforme, **pas** à la production (voir les sections suivantes).

## 1. Prérequis

* **Node.js 20.19 ou plus récent** (testé avec Node 24) et npm.
* Un compte **Supabase** (gratuit pour démarrer) : https://supabase.com
* Un compte **Google Cloud** avec facturation activée pour Google Maps Platform (un crédit mensuel gratuit couvre généralement un petit restaurant).
* Facultatif : la CLI Supabase, utilisée via `npx supabase …` (pas d'installation, **Docker non requis** pour les commandes de ce guide).

## 2. Installation

```bash
cd plateforme
npm install
cp .env.example .env      # puis remplir les valeurs (§ 9)
```

## 3. Configuration Supabase

1. **Créer un projet** sur https://supabase.com/dashboard (région conseillée : Europe, la plus proche de l'Algérie). Notez le mot de passe de la base.
2. **Clés** : *Project Settings → API Keys*. Copiez :
   * l'**URL du projet** (`https://<ref>.supabase.co`) → `VITE_SUPABASE_URL` ;
   * la **publishable key** (`sb_publishable_…`), ou la clé **anon** sur un ancien projet → `VITE_SUPABASE_ANON_KEY`.
   * ⚠ Ne copiez **jamais** la *secret key* / *service_role* dans `.env` : les applications refusent de démarrer si elles en détectent une.
3. **Authentification** : *Authentication → Sign In / Providers* :
   * laissez le fournisseur **Email** activé (connexion du restaurant et des livreurs, par mot de passe) ;
   * activez **Allow anonymous sign-ins** (même page, *Configuration*) : les clients commandent sans compte — détails au § 7.
4. **Realtime et Storage** : rien à faire, la migration 005 ajoute les tables à la publication `supabase_realtime` et crée le bucket public `product-images`.

## 4. Création des tables (migrations)

Les fichiers `supabase/migrations/*.sql` créent tout : tables, relations, index, RLS, politiques, fonctions métier, triggers, notifications, Realtime, Storage. `supabase/seed.sql` charge la **vraie carte** du restaurant (48 produits, tailles et suppléments) et ses réglages.

**Option A — sans outil (SQL Editor)**

```bash
npm run db:bundle        # crée supabase/dist/setup.sql (migrations + seed)
```

Supabase → *SQL Editor* → *New query* → collez le contenu de `supabase/dist/setup.sql` → **Run**. À faire **une seule fois** sur un projet neuf.

**Option B — CLI Supabase (recommandée pour les mises à jour)**

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase db push --include-seed
```

Les futures évolutions de la base seront de nouvelles migrations appliquées par `npx supabase db push`.

> **Projet Supabase déjà installé ?** Appliquez aussi **`20261011000800_driver_history.sql`** (onglet *Historique* de l'app livreur : fonction `driver_delivery_history`, additive, sans données personnelles des clients), puis la migration **`20261010000700_driver_applications.sql`** (inscription des livreurs, § 5) avec `npx supabase db push`, ou collez-la dans le *SQL Editor* → **Run**. Elle est **additive** (nouvelle table `driver_applications` et deux fonctions) : rien n'est supprimé ni modifié. Sans elle, le bouton « Continuer avec Google » de l'app livreur affiche une erreur ; tout le reste fonctionne.
>
> La migration `20261009000600_customer_address.sql` (fonction `customer_save_address`) est **additive** : elle ne modifie ni ne supprime aucune donnée. Elle n'est plus utilisée par l'application client depuis le passage à la commande sans compte ; l'appliquer ou non ne change rien au fonctionnement.

## 5. Comptes et rôles (Admin / Livreur / Client)

| Rôle | Comment il est créé | Accès |
|---|---|---|
| `CUSTOMER` | automatiquement, à la première commande (session invité, § 7) | les commandes passées depuis son téléphone uniquement |
| `DRIVER` | inscription Google validée par l'administration (ci-dessous), ou création par l'administration (§ 6) / en SQL | les commandes qui lui sont assignées |
| `ADMIN` | à la main, une fois (ci-dessous) | toutes les commandes, le menu, les livreurs, les réglages |

Le rôle est stocké dans `public.profiles.role` et **ne peut pas être modifié depuis une application** (seule la base peut le changer).

**Créer le premier administrateur**

1. *Authentication → Users → Add user → Create new user* : email + mot de passe solide, cochez **Auto Confirm User**.
2. *SQL Editor* :
   ```sql
   select private.promote_to_admin('proprietaire@exemple.com');
   ```

**Créer un livreur** : *Administration → Livreurs → Ajouter un livreur* (nom, téléphone, email, mot de passe provisoire). Sans l'Edge Function du § 6, créez le compte dans *Authentication → Users* puis :

```sql
select private.promote_to_driver('livreur@exemple.com', 'Prénom Nom', '0661000000');
```

**Inscription d'un livreur par lui-même (Google)** — application livreur → **Continuer avec Google** :

1. Google confirme l'identité et l'email ; le livreur complète **prénom, nom et téléphone** (l'email est celui de Google, non modifiable).
2. Sa demande arrive **en direct** dans *Administration → Livreurs → Demandes d'inscription* (avec une alerte), où vous pouvez **Approuver**, **Refuser** ou l'appeler.
3. Tant que la demande n'est pas approuvée, le compte n'a **aucun accès** aux commandes ni aux données des clients (vérifié côté base, pas seulement à l'écran). Dès l'approbation, son tableau de bord s'ouvre tout seul. Un refus lui permet d'envoyer une nouvelle demande.

La base refuse toute demande qui ne vient pas d'un compte Google (`GOOGLE_REQUIRED`) : un simple email ou une session invité ne suffit pas. Il faut donc activer le fournisseur **Google** dans Supabase (§ 7). Les livreurs créés par l'administration avec un mot de passe continuent de se connecter avec email + mot de passe.

D'autres requêtes utiles se trouvent dans [`supabase/scripts/comptes.sql`](supabase/scripts/comptes.sql).

## 6. Edge Function de gestion des livreurs

Créer un compte de connexion nécessite la clé secrète : c'est donc une **Edge Function** (`supabase/functions/manage-drivers`) qui s'en charge, après avoir vérifié que l'appelant est administrateur. La clé secrète lui est fournie automatiquement par Supabase : vous n'avez rien à copier.

```bash
npx supabase functions deploy manage-drivers --no-verify-jwt --use-api
```

* `--use-api` : compilation côté Supabase, **sans Docker** ;
* `--no-verify-jwt` : la fonction vérifie elle-même le jeton de l'appelant (nécessaire avec les nouvelles clés `sb_publishable_` / `sb_secret_`).

Elle permet : créer un livreur, changer son mot de passe. Modifier le nom/téléphone ou désactiver un livreur se fait directement depuis l'administration.

## 7. Commande sans compte (clients)

Les clients n'ont **ni compte, ni inscription, ni mot de passe**. À l'ouverture de l'app, un écran d'accueil présente les plats et un bouton **« Commencer »** mène directement au menu. Au moment de valider la commande, le client donne son **nom**, son **numéro de téléphone**, son adresse et sa **position** (GPS ou marqueur sur la carte) ; ces coordonnées ne sont **pas gardées** sur le téléphone et sont redemandées à chaque commande.

Pour que chaque téléphone ne voie que **ses propres** commandes (suivi en direct, onglet *Mes commandes*), l'app crée en silence, à la première commande, une **session invité** Supabase (connexion anonyme). Elle ne contient aucune donnée personnelle ; la sécurité (RLS) s'appuie dessus exactement comme pour un compte : un client ne voit jamais la commande d'un autre. Si le client efface les données de son navigateur (ou touche *Réglages → Effacer l'historique de ce téléphone*), il ne voit plus ses anciennes commandes sur ce téléphone ; le restaurant, lui, les garde pour les livrer.

**À activer dans Supabase** : *Authentication → Sign In / Providers → Allow anonymous sign-ins* (**ON**). Sans cela, la validation d'une commande affiche « Les commandes sans compte ne sont pas activées ».

**Protection contre les abus** : `place_order` limite déjà chaque téléphone à 3 commandes en cours et 3 commandes par 10 minutes, et refuse les positions hors d'Algérie ou hors du rayon de livraison. Pour aller plus loin en production, activez un CAPTCHA (*Authentication → Attack Protection*, Cloudflare Turnstile ou hCaptcha) — il faudra alors ajouter le widget correspondant à l'écran de commande.

La connexion Google des clients a été retirée de l'application client. Le fournisseur **Google** reste nécessaire pour l'**inscription des livreurs** (§ 5) : *Authentication → Sign In / Providers → Google* (Client ID / Secret créés dans Google Cloud Console → *Credentials → OAuth client ID*, type *Web application*, URI de redirection `https://<ref-du-projet>.supabase.co/auth/v1/callback`). Ajoutez aussi l'adresse de l'app livreur (ex. `https://livreur.votre-domaine.dz`) dans *Authentication → URL Configuration → Redirect URLs*.

**Mode démo local** (`npm run demo`) : les sessions invité fonctionnent sans aucune configuration, et « Continuer avec Google » de l'app livreur est **simulé** (compte `samir.livreur@gmail.com`, aucun vrai Google n'est contacté) pour essayer l'inscription et la validation.

## 8. Configuration Google Maps

1. https://console.cloud.google.com → créez un projet → activez la **facturation**.
2. *APIs & Services → Library* : activez **Maps JavaScript API** et **Routes API** (itinéraire dessiné dans l'app livreur).
3. *APIs & Services → Credentials → Create credentials → API key*, puis **restreignez la clé** :
   * *Application restrictions* → **Websites** : `http://localhost:5173/*`, `http://localhost:5174/*`, `http://localhost:5175/*` et vos domaines de production (ex. `https://commande.votre-domaine.dz/*`) ;
   * *API restrictions* → **Maps JavaScript API** et **Routes API** uniquement.
4. *Google Maps Platform → Map Management → Create Map ID* (type JavaScript) → `VITE_GOOGLE_MAPS_MAP_ID` (requis pour les marqueurs personnalisés ; vide = `DEMO_MAP_ID`, réservé aux tests).
5. Copiez la clé dans `VITE_GOOGLE_MAPS_API_KEY`.

**Pourquoi la clé est-elle dans le navigateur ?** Une clé Maps JavaScript est publique par nature (elle est lue par la page). Sa protection vient des **restrictions** de l'étape 3 : elle ne fonctionne que sur vos domaines et pour ces deux API. Elle n'est jamais écrite dans le code source : seulement dans `.env` (non commité) ou dans les variables de l'hébergeur.

**Sans clé**, tout reste utilisable :
* à la commande, le client choisit sa position sur une carte **OpenStreetMap** (bibliothèque Leaflet, gratuite, sans clé) : il touche la carte pour placer le marqueur 🏠 et le fait glisser sur sa porte, ou utilise le GPS. C'est aussi la carte utilisée si la clé Google échoue ;
* les autres cartes (suivi, administration, livreur) affichent un encadré avec lien Google Maps, et le bouton « 🗺️ Démarrer l'itinéraire » du livreur fonctionne (simple lien, sans clé).

⚠ Les tuiles de `tile.openstreetmap.org` sont un service gratuit pour un usage modéré ([règles d'utilisation](https://operations.osmfoundation.org/policies/tiles/)) : parfait pour tester et pour un petit volume. Pour un trafic important en production, configurez la clé Google Maps ci-dessus (ou un fournisseur de tuiles OpenStreetMap commercial).

## 9. Variables d'environnement (`.env`)

Un seul fichier `.env` à la racine de `plateforme/` sert aux trois applications.

| Variable | Obligatoire | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | oui | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | oui | clé **publique** (`sb_publishable_…` ou anon). `VITE_SUPABASE_PUBLISHABLE_KEY` est aussi accepté |
| `VITE_GOOGLE_MAPS_API_KEY` | conseillé | clé Google Maps **restreinte** |
| `VITE_GOOGLE_MAPS_MAP_ID` | conseillé en production | Map ID Google |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | test e2e | compte admin de test |
| `E2E_DRIVER_EMAIL`, `E2E_DRIVER_PASSWORD` | test e2e | compte livreur de test |

`.env` est ignoré par git (`.gitignore`). Ne commitez jamais de vraies clés.

## 10. Lancement local

Dans trois terminaux :

```bash
npm run dev:client     # http://localhost:5173
npm run dev:admin      # http://localhost:5174
npm run dev:livreur    # http://localhost:5175
```

**Tester sur un vrai téléphone** : les navigateurs n'autorisent le GPS qu'en **HTTPS** (ou sur `localhost`). Pour essayer la géolocalisation depuis un téléphone, utilisez un déploiement de test (§ 12) ou un tunnel HTTPS (Cloudflare Tunnel, ngrok…) vers `localhost:5173` / `5175`, et ajoutez l'adresse obtenue aux restrictions de la clé Google (§ 8).

Autres commandes :

```bash
npm test             # tous les tests (base de données + logique)
npm run test:db      # tests RLS + workflow sur un vrai PostgreSQL (PGlite)
npm run typecheck    # contrôle TypeScript des 4 paquets
npm run build        # build de production des 3 applications
```

## 11. Tester le scénario complet

**A. Automatiquement, sans projet Supabase** — `npm run test:db` exécute les migrations sur un vrai PostgreSQL embarqué et rejoue tout le workflow avec les contrôles de sécurité : un client ne voit jamais la commande d'un autre, un livreur ne voit que les siennes, prix recalculés par le serveur, transitions interdites refusées, notifications générées à chaque étape.

**B. Automatiquement, sur votre projet Supabase** — après les §§ 3 à 6, créez un compte admin et un livreur de test, renseignez `E2E_*` dans `.env`, puis :

```bash
npm run e2e
```

Le script joue le scénario avec la clé publique (comme les apps) et vérifie chaque événement temps réel. Les deux « clients » du test empruntent le même chemin côté base (`place_order`, RLS, notifications) qu'un vrai client. ⚠ Il crée une vraie commande « TEST AUTOMATIQUE ».

**C. À la main (recommandé avant l'ouverture)**

1. **Admin** (5174) : connectez-vous, cliquez **« Activer le son »**, vérifiez *Réglages* (position du restaurant, frais de livraison).
2. **Livreur** (5175, idéalement sur un téléphone) : connectez-vous, touchez **« Activer le son et les alertes »**, passez **Disponible**.
3. **Client** (5173) : **Commencer** → ajoutez des produits → bouton panier (au centre en bas) → *Commander* → nom, téléphone, adresse → **📍 Utiliser ma position actuelle** → ajustez le marqueur → **Je confirme cette position** → **Commander**. La page de suivi s'affiche.
4. **Admin** : la commande apparaît **instantanément** avec un son → *Confirmer* → *Préparer* → *Prête ✓* → **🚴 Assigner** → choisissez le livreur. Le client voit chaque étape en direct.
5. **Livreur** : la commande arrive avec alerte → *Ouvrir la commande* → carte client/restaurant/itinéraire → **🗺️ Démarrer l'itinéraire** (Google Maps s'ouvre ; le client voit « 🔵 Livreur en route ») → **✅ Commande livrée** → confirmer.
6. **Client** : « ✅ Votre commande a été livrée ».

## 12. Déploiement

Chaque application est un **site statique** : déployez-les séparément (Vercel, Netlify, Cloudflare Pages…), idéalement sur trois sous-domaines (`commande.`, `admin.`, `livreur.`).

| Réglage chez l'hébergeur | Client | Admin | Livreur |
|---|---|---|---|
| Répertoire racine | `plateforme` | `plateforme` | `plateforme` |
| Commande d'installation | `npm ci` | `npm ci` | `npm ci` |
| Commande de build | `npm run build -w @hc/client` | `npm run build -w @hc/admin` | `npm run build -w @hc/livreur` |
| Dossier publié | `apps/client/dist` | `apps/admin/dist` | `apps/livreur/dist` |

* Ajoutez les variables `VITE_*` dans les paramètres de chaque projet (elles sont intégrées au moment du build).
* Le routage par `#` ne demande **aucune règle de réécriture**.
* Ajoutez les domaines de production aux restrictions de la clé Google Maps (§ 8) et dans *Supabase → Authentication → URL Configuration* (nécessaire pour que la connexion Google revienne au bon domaine). Le Client ID/Secret OAuth (§ 7) et l'URI de redirection Google n'ont, eux, pas besoin de changer : ils pointent toujours vers le même domaine Supabase, quel que soit le domaine de l'application.
* Le site vitrine existant (dossier parent) n'est pas modifié : il peut renvoyer son bouton « Commander » vers l'application client.

## 13. Sécurité

**Ce qui est en place**

* **Clés** : seule la clé publique est dans le navigateur ; la clé secrète n'existe que dans les Edge Functions (fournie par Supabase). Garde-fou : les apps refusent de démarrer avec une clé `sb_secret_` ou `service_role`.
* **Row Level Security** sur **toutes** les tables exposées, avec des droits accordés colonne par colonne (ex. un utilisateur ne peut modifier que `name` et `phone` de son profil, jamais son rôle).
* **Aucune écriture directe** sur les commandes : tout passe par des fonctions RPC qui vérifient le rôle de l'appelant et les **transitions autorisées**.
* **Clients sans compte** : session invité propre à chaque téléphone (§ 7), aucune donnée personnelle gardée sur l'appareil.
* **Client** : ne voit que les commandes passées depuis son téléphone ; ne peut annuler qu'avant confirmation.
* **Livreur** : ne voit que les commandes qui lui sont assignées (et seulement 24 h après livraison) ; un livreur désactivé ne voit plus rien.
* **Prix recalculés côté serveur** à partir du menu : un client ne peut pas modifier un prix ; options validées (taille obligatoire, choix unique, disponibilité).
* **Anti-abus** : 3 commandes en cours maximum par client, 3 commandes / 10 min, position limitée à l'Algérie et au rayon de livraison configuré.
* **Photos** : bucket en lecture publique, écriture réservée aux administrateurs.
* Fonctions `SECURITY DEFINER` avec `search_path` vide ; fonctions internes dans un schéma `private` non exposé par l'API.
* Tests automatiques des règles d'isolation (`npm run test:db`).

**Recommandations**

* Mot de passe administrateur long et unique ; si votre offre Supabase le propose, activez la protection contre les mots de passe divulgués (*Authentication → Password security*).
* Restreignez la clé Google Maps (§ 8) et surveillez les quotas.
* Activez un CAPTCHA sur les sessions invité avant une forte affluence (§ 7).

## 14. Fonctionnement général

| Étape | Qui agit | Statut | Ce que voit le client |
|---|---|---|---|
| Commande envoyée | client | `PENDING` | 🟡 Commande reçue |
| Acceptée | restaurant | `CONFIRMED` | 👍 Commande confirmée |
| En cuisine | restaurant | `PREPARING` | 🟠 Préparation |
| Prête | restaurant | `READY` | 🟢 Commande prête |
| Livreur choisi | restaurant | `ASSIGNED` | 🛵 Livreur assigné (+ nom et bouton d'appel) |
| Départ (« Démarrer l'itinéraire ») | livreur | `OUT_FOR_DELIVERY` | 🔵 Livreur en route |
| Remise au client | livreur | `DELIVERED` | ✅ Votre commande a été livrée |
| Annulation | client (avant confirmation) ou restaurant | `CANCELLED` | ❌ Commande annulée (+ motif) |

* **Numéro de commande** : `HC-AAMMJJ-NNN` (ex. `HC-261007-004`), compteur remis à zéro chaque jour (heure d'Alger).
* **Livreurs** : statut `AVAILABLE` / `BUSY` / `OFFLINE`. `BUSY` est automatique tant qu'il a des livraisons en cours. Sa position GPS est partagée pendant ses livraisons (carte du tableau de bord).
* **Menu** : toute modification (prix, photo, disponibilité, options, catégories) apparaît immédiatement chez les clients.
* **Réglages** : ouverture/fermeture des commandes en un clic, frais de livraison, livraison offerte à partir d'un montant, minimum de commande, rayon de livraison, position du restaurant, partage de la position du livreur avec le client.
* **Application client** : barre de navigation fixe en bas (*Accueil*, *Recherche*, bouton **panier** au centre, *Mes commandes*, *Réglages*). Recherche instantanée (sans tenir compte des accents) sur le nom, la description et la catégorie, avec filtres (produits disponibles, tri par prix, prix maximum). Catégories issues de la base (image de la catégorie si renseignée dans l'administration, sinon un pictogramme).
* **Application livreur** : barre de navigation en bas (*Accueil*, *Recherche*, *Historique*, *Compte*) et thème sombre / clair / automatique (sombre par défaut, gardé sur le téléphone).
  * *Accueil* : statut Disponible / Hors ligne, chiffres du jour (en cours, livrées, encaissé), commandes en cours avec alerte sonore.
  * *Recherche* : par numéro, client, téléphone, adresse ou commune (commandes en cours et des dernières 24 h), par numéro ou commune dans tout l'historique ; les dernières recherches restent sur le téléphone et peuvent être effacées.
  * *Historique* : toutes les courses terminées, groupées par jour, avec totaux. Au-delà de 24 h, la base ne renvoie plus le nom, le téléphone ni l'adresse du client (fonction `driver_delivery_history`).
  * *Compte* : fiche du livreur, mode de connexion, thème, test du son et des notifications, appel du restaurant, déconnexion.
* **Écran d'ouverture** : les plats (pizza, bol, chapati) tournent dans leur assiette et défilent au doigt ; **Commencer** ouvre le menu. Affiché à chaque lancement de l'app, pas quand on ouvre directement un lien de suivi.
* **Thème** : clair, sombre ou automatique (suit le réglage du téléphone, par défaut). Le choix est enregistré **sur l'appareil** et conservé après fermeture de l'application.
* **Coordonnées du client** : nom, téléphone, adresse et position saisis à chaque commande (obligatoires), jamais gardés sur le téléphone.

## 15. Notifications (Push, WhatsApp, SMS)

Chaque événement (nouvelle commande, changement de statut, assignation) crée une ligne dans `public.notifications`, diffusée en temps réel : toast, son, vibration et notification du navigateur.

Pour ajouter plus tard Push, WhatsApp ou SMS, le point d'entrée est prêt : l'Edge Function `dispatch-notification`, à brancher sur un *Database Webhook*. Les étapes sont décrites en tête de [`supabase/functions/dispatch-notification/index.ts`](supabase/functions/dispatch-notification/index.ts). Les fournisseurs y sont des squelettes, à compléter avec l'API choisie.

## 16. Points à vérifier avec le restaurant

* **Nom** : les applications affichent « Houcine Chapati » comme demandé, alors que le logo et le site vitrine écrivent « **Hocine** Chapati ». À confirmer.
* **Clé Google Maps** : à créer pour afficher la carte de l'écran de commande et de l'administration (§ 8). Sans elle, le client peut toujours envoyer sa position avec le bouton GPS.
* **Frais de livraison, minimum, rayon** : non fournis. Valeurs à saisir dans *Réglages* (le seed met 0 DA et aucun rayon).
* **Photos** : les photos de pizzas et de bols reprises du site sont des illustrations ; à remplacer par les vraies (*Menu → Modifier → Photo*).
* **Prix** : « Chapati 2x Fromage » (200 DA) et « 2x Fromage 2x Thon » (230 DA) suivent le flyer ; l'écran du magasin indiquait d'autres prix.
* **Horaires** : l'ouverture des commandes en ligne se pilote à la main (*Tableau de bord* ou *Réglages*) ; pas de fermeture automatique selon l'heure.
* **Paiement** : aucun paiement en ligne ; le livreur voit le montant « à encaisser ».
