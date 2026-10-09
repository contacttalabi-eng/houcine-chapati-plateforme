-- =============================================================================
-- Houcine Chapati — gestion des comptes depuis Supabase → SQL Editor
-- Exécuter UNE ligne à la fois, après avoir remplacé les valeurs.
-- (Le SQL Editor agit en administrateur de la base : ces fonctions du schéma
--  "private" ne sont PAS accessibles depuis les applications.)
-- =============================================================================

-- 1) Administrateur : créer d'abord le compte dans Authentication → Users →
--    « Add user » → « Create new user » (email + mot de passe, Auto Confirm),
--    puis lui donner le rôle ADMIN :
select private.promote_to_admin('proprietaire@exemple.com');

-- 2) Livreur créé à la main (sinon : Administration → Livreurs → Ajouter) :
--    créer le compte dans Authentication → Users, puis :
select private.promote_to_driver('livreur@exemple.com', 'Prénom Nom', '0661000000');

-- 3) Vérifier les rôles
select u.email, p.role, p.created_at
from public.profiles p join auth.users u on u.id = p.user_id
where p.role in ('ADMIN', 'DRIVER')
order by p.role, u.email;

-- 4) Retirer le rôle administrateur
-- update public.profiles set role = 'CUSTOMER'
-- where user_id = (select id from auth.users where email = 'ancien@exemple.com');
