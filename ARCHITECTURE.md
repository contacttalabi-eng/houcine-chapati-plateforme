# Architecture — Houcine Chapati

Plateforme de commande et de livraison : **3 applications web** (client, administration, livreur) qui partagent **un seul backend Supabase** (PostgreSQL + Auth + Realtime + Storage + Edge Functions).

```
                       ┌──────────────────────── Supabase ────────────────────────┐
  App CLIENT  ───────▶ │  Auth (connexion Google)          PostgreSQL               │
  (mobile/web)  ◀───── │                                  ├─ tables + RLS           │
                       │  PostgREST (API auto)  ────────▶ ├─ fonctions RPC métier   │
  App ADMIN   ───────▶ │                                  ├─ triggers (historique,  │
  (ordi/tablette) ◀─── │  Realtime (postgres_changes) ◀── │   notifications)        │
                       │                                  └─ publication realtime   │
  App LIVREUR ───────▶ │  Storage (photos du menu)                                  │
  (smartphone)  ◀───── │  Edge Functions : manage-drivers, dispatch-notification    │
                       └────────────────────────────────────────────────────────────┘
        │                                     ▲
        └── Google Maps Platform (cartes, marqueurs, itinéraire Routes API)
            + lien Google Maps (navigation guidée sur le téléphone du livreur)
```

## 1. Organisation du code (monorepo npm workspaces)

```
plateforme/
├─ apps/
│  ├─ client/      Vite + React — commande et suivi (thème sombre, mobile-first)
│  ├─ admin/       Vite + React — restaurant (thème clair, ordinateur/tablette)
│  └─ livreur/     Vite + React — livreurs (thème sombre, très gros boutons)
├─ packages/shared/
│  ├─ public/      logo, photos du menu, manifestes (servis par les 3 apps)
│  └─ src/
│     ├─ env.ts, supabase.ts      configuration + garde-fou « clé secrète interdite »
│     ├─ types.ts                 types du domaine (alignés sur le SQL)
│     ├─ domain/                  statuts, panier, prix, téléphone DZ, wilayas, erreurs FR
│     ├─ api/                     TOUS les appels Supabase (menu, commandes, livreurs…)
│     ├─ hooks/                   temps réel, session, compte client (Google), GPS, alertes son/vibration
│     ├─ maps/                    Google Maps : fournisseur, carte + itinéraire, sélecteur de position
│     ├─ ui/, auth/               composants réutilisables, écran de connexion + contrôle du rôle
│     └─ styles/theme.css         design system (Tailwind v4) repris du site vitrine
├─ supabase/
│  ├─ migrations/  001 schéma · 002 sécurité/RLS · 003 logique métier · 004 notifications · 005 realtime/storage
│  ├─ seed.sql     carte réelle du restaurant + réglages
│  ├─ functions/   Edge Functions (Deno)
│  └─ config.toml  configuration CLI Supabase
├─ tests/db/       tests SQL (PGlite) : RLS + workflow complet
└─ scripts/        db:bundle (SQL en un fichier), e2e (scénario réel sur votre projet)
```

**Choix techniques** : React 19, TypeScript strict, Vite 8, Tailwind CSS 4, `@supabase/supabase-js` 2, `@vis.gl/react-google-maps` (bibliothèque React soutenue par Google), Vitest + PGlite pour tester la base sans Docker. Routage par hash (`#/suivi/<id>`) : aucun réglage de réécriture d'URL chez l'hébergeur.

## 2. Modèle de données

| Table | Rôle |
|---|---|
| `profiles` | un profil par compte Auth, **rôle** `CUSTOMER` / `DRIVER` / `ADMIN` (créé par trigger) |
| `customers` | dernières coordonnées de livraison d'un client (pré-remplissage) |
| `drivers` | livreurs : statut `AVAILABLE`/`BUSY`/`OFFLINE`, actif, dernière position |
| `categories`, `products` | menu (prix entiers en DA, photo, disponibilité, ordre) |
| `product_option_groups`, `product_options` | options : « Taille » (choix unique, obligatoire), « Suppléments »… |
| `orders` | commande + **copie** des coordonnées et du GPS du client, statut, horodatage de chaque étape |
| `order_items` | lignes (copie du nom, des options et du prix au moment de la commande) |
| `order_status_history` | historique des statuts (frise de suivi, audit) |
| `driver_locations` | positions GPS des livreurs (1 point / 10 s max) |
| `notifications`, `notification_deliveries`, `push_subscriptions` | événements à notifier + journal des envois externes (préparé) |
| `restaurant_settings` | ligne unique : position du restaurant, frais/zone de livraison, ouverture |
| `private.order_counters` | compteur journalier des numéros `HC-AAMMJJ-NNN` (non exposé) |

Relations clés : `orders.customer_id → customers`, `orders.driver_id → drivers` (*set null*), `order_items.product_id → products` (*set null* : supprimer un produit ne casse pas l'historique), `products.category_id → categories` (*restrict*).

## 3. Cycle de vie d'une commande

```
PENDING ──admin──▶ CONFIRMED ──admin──▶ PREPARING ──admin──▶ READY
                                                               │ admin_assign_driver
                                                               ▼
DELIVERED ◀──livreur── OUT_FOR_DELIVERY ◀──livreur── ASSIGNED (livreur → BUSY)
(livreur → AVAILABLE)

CANCELLED : client tant que PENDING · admin à tout moment avant livraison
```

Les transitions sont **définies une seule fois en SQL** (`private.is_valid_transition`) et reprises dans l'interface (`domain/status.ts`) uniquement pour afficher les bons boutons.

## 4. Fonctions RPC (toute écriture métier passe par elles)

| Fonction | Appelant | Effet |
|---|---|---|
| `place_order(jsonb)` | client (compte Google) | valide tout, **recalcule les prix**, numérote, crée la commande |
| `customer_cancel_order` | client propriétaire | annule si `PENDING` |
| `get_order_driver` | client propriétaire | nom/téléphone du livreur (+ position si autorisé) |
| `admin_set_order_status` | admin | transitions restaurant, annulation, reprise manuelle |
| `admin_assign_driver` | admin | assigne/réassigne un livreur à une commande `READY` |
| `admin_dashboard_stats` | admin | indicateurs du jour (heure d'Alger) |
| `admin_save_product_options` | admin | enregistre les options d'un produit (transaction) |
| `driver_set_availability` | livreur | disponible / hors ligne |
| `driver_start_delivery`, `driver_complete_delivery` | livreur assigné | en route / livrée |
| `driver_report_location` | livreur | position GPS |
| `service_create_driver` | **serveur uniquement** | crée la fiche livreur (Edge Function) |

## 5. Temps réel

Les tables `orders`, `notifications`, `drivers`, menu et réglages sont dans la publication `supabase_realtime`. Supabase applique la **RLS à chaque abonné** :

| Application | Abonnement | Usage |
|---|---|---|
| Client | `orders` filtré `id=eq.<commande>` | frise de suivi mise à jour sans recharger |
| Client | menu + réglages | prix, photos, disponibilités, ouverture en direct |
| Admin | `orders`, `drivers`, `restaurant_settings` | nouvelle commande instantanée, statuts, livreurs |
| Livreur | `orders` filtré `driver_id=eq.<moi>` | commande assignée reçue immédiatement |
| Tous | `notifications` (RLS : les siennes) | toast + son + vibration + notification système |

Après une coupure réseau, chaque écran **recharge** ses données (les événements manqués ne sont pas rejoués) et se resynchronise aussi au retour au premier plan.

## 6. Notifications

Un trigger (`private.notify_order_event`) écrit une ligne dans `notifications` pour chaque événement :
client (reçue → livrée/annulée), restaurant (nouvelle commande, annulation client), livreur (assignée, retirée, annulée).

* **Aujourd'hui** : livraison par Realtime dans les applications.
* **Plus tard** : Database Webhook → Edge Function `dispatch-notification` → fournisseur Push / WhatsApp / SMS selon `notifications.channels`, chaque envoi tracé dans `notification_deliveries`. Les fournisseurs sont des squelettes qui répondent `SKIPPED` tant qu'ils ne sont pas configurés.

## 7. Géolocalisation et cartes

* **Client** : bouton « 📍 Utiliser ma position actuelle » (`navigator.geolocation`, autorisation du navigateur), carte Google avec marqueur **déplaçable** (ou toucher la carte), confirmation explicite. Aucune coordonnée n'est inventée : sans GPS ni action du client, la commande est refusée (`LOCATION_REQUIRED`).
* **Livreur** : carte avec client 🏠, restaurant 🍽️ et sa position 🛵 ; itinéraire dessiné via **Routes API** (`Route.computeRoutes`, successeur du `DirectionsService`) avec durée et distance. « 🗺️ Démarrer l'itinéraire » ouvre Google Maps en navigation guidée depuis la position du téléphone.
* **Position du livreur** : partagée automatiquement pendant ses livraisons (toutes les 15 s ou 40 m) → `drivers.current_*` (carte admin en direct) + `driver_locations` (historique).
* **Suivi du livreur par le client** : déjà en place derrière le réglage « Montrer la position du livreur au client » (`get_order_driver`, rafraîchi toutes les 20 s). Évolution possible : Realtime Broadcast par commande pour une mise à jour à la seconde.

## 8. Sécurité (résumé — détails dans le README)

Clé publique seulement dans le navigateur · comptes clients vérifiés par Google (OAuth/PKCE) · RLS sur toutes les tables · droits colonne par colonne · écritures via RPC qui vérifient le rôle · rôle non modifiable par l'utilisateur · prix recalculés côté serveur · limites anti-abus · livreur limité à ses commandes (et 24 h après) · photos : écriture admin uniquement · fonctions `SECURITY DEFINER` à `search_path` vide · schéma `private` non exposé · clé secrète uniquement dans les Edge Functions.
