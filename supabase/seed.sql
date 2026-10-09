-- =============================================================================
-- Houcine Chapati — Données initiales (menu + réglages)
-- -----------------------------------------------------------------------------
-- Reprend la carte du site vitrine (assets/js/menu-data.js : flyer + écrans du
-- restaurant). Tout est ensuite modifiable depuis l'administration.
-- Sans effet si des produits existent déjà (pas de doublons).
--
-- Images "/menu/*.webp" : servies par les applications (packages/shared/public).
-- ⚠ pizza-* et bol-* sont des photos d'illustration à remplacer par les vraies
--   photos du restaurant (Administration → Menu → produit → Photo).
-- =============================================================================

do $seed$
declare
  v_groups jsonb := $json${
    "SUPP_S2": { "name": "Suppléments", "selection": "MULTIPLE", "required": false, "options": [
      ["Fromage", 100], ["Poulet", 150], ["Viande", 200], ["Barquette de frites", 150] ] },
    "SUPP_ORIGINAL": { "name": "Suppléments", "selection": "MULTIPLE", "required": false, "options": [
      ["Kiri", 50], ["Salami", 100], ["Poulet fumé", 150], ["Thon / Œuf / Fromage", 30], ["Barquette de frites", 150] ] },
    "SUPP_PIZZA": { "name": "Suppléments", "selection": "MULTIPLE", "required": false, "options": [
      ["Cheddar", 180], ["Mozzarella", 150], ["Gruyère", 200], ["Camembert", 100],
      ["Poulet", 150], ["Viande", 200], ["Champignons", 100] ] }
  }$json$;

  -- Produits avec "sizes" : prix de base = 1re taille, les autres tailles
  -- deviennent des options (groupe "Taille", choix unique obligatoire).
  v_menu jsonb := $json$[
    { "category": "Chapati", "image": "/menu/pnj-chapati.webp", "products": [
      { "name": "Chapati S-2 3 Fromages", "desc": "Trois fromages, version Saison 2.", "price": 350, "image": "/menu/pnj-chapati.webp", "groups": ["SUPP_S2"] },
      { "name": "Chapati S-2 Poulet", "desc": "Le Chapati S-2 au poulet.", "price": 400, "image": "/menu/chapati-close.webp", "groups": ["SUPP_S2"] },
      { "name": "Chapati S-2 Viande", "desc": "Le Chapati S-2 à la viande.", "price": 500, "image": "/menu/chapati-mid.webp", "groups": ["SUPP_S2"] },
      { "name": "Chapati S-2 Mixte", "desc": "Poulet et viande réunis.", "price": 550, "image": "/menu/chapati-right.webp", "groups": ["SUPP_S2"] },
      { "name": "Chapati S-2 Abat", "desc": "Le Chapati S-2 aux abats.", "price": 550, "image": "/menu/chapati-hero.webp", "groups": ["SUPP_S2"] },
      { "name": "Chapati Complet", "desc": "La recette complète de la maison.", "price": 200, "image": "/menu/chapati-close.webp", "groups": ["SUPP_ORIGINAL"] },
      { "name": "Chapati Thon / Fromage", "desc": "Thon et fromage.", "price": 200, "image": "/menu/chapati-mid.webp", "groups": ["SUPP_ORIGINAL"] },
      { "name": "Chapati Fromage", "desc": "Fromage fondant.", "price": 200, "image": "/menu/chapati-right.webp", "groups": ["SUPP_ORIGINAL"] },
      { "name": "Chapati 2x Fromage", "desc": "Double portion de fromage.", "price": 200, "image": "/menu/chapati-hero.webp", "groups": ["SUPP_ORIGINAL"] },
      { "name": "Chapati 2x Fromage 2x Thon", "desc": "Double fromage, double thon.", "price": 230, "image": "/menu/chapati-rond.webp", "groups": ["SUPP_ORIGINAL"] },
      { "name": "Chapati 2x Fromage 2x Omelette", "desc": "Double fromage, double omelette.", "price": 250, "image": "/menu/chapati-close.webp", "groups": ["SUPP_ORIGINAL"] },
      { "name": "Chapati tout en double", "desc": "Toute la garniture, en double.", "price": 280, "image": "/menu/chapati-mid.webp", "groups": ["SUPP_ORIGINAL"] },
      { "name": "Chapati Salami", "desc": "Garni de salami.", "price": 250, "image": "/menu/chapati-right.webp", "groups": ["SUPP_ORIGINAL"] },
      { "name": "Chapati Kiri", "desc": "Garni de Kiri.", "price": 250, "image": "/menu/chapati-hero.webp", "groups": ["SUPP_ORIGINAL"] }
    ]},
    { "category": "Pizzas", "image": "/menu/pnj-pizza.webp", "products": [
      { "name": "Pizza Margherita", "desc": "La classique, sauce tomate et fromage.", "image": "/menu/pnj-pizza.webp", "sizes": [["Mini", 300], ["Normal", 400], ["Mega", 1200]], "groups": ["SUPP_PIZZA"] },
      { "name": "Pizza Végétarienne", "desc": "Garniture 100 % légumes.", "image": "/menu/pizza-1.webp", "sizes": [["Mini", 350], ["Normal", 550], ["Mega", 1500]], "groups": ["SUPP_PIZZA"] },
      { "name": "Pizza Poulet fumé", "desc": "Au poulet fumé.", "image": "/menu/pizza-2.webp", "sizes": [["Mini", 500], ["Normal", 600], ["Mega", 1800]], "groups": ["SUPP_PIZZA"] },
      { "name": "Pizza 3 Fromages", "desc": "Trois fromages fondants.", "image": "/menu/pizza-3.webp", "sizes": [["Mini", 400], ["Normal", 600], ["Mega", 1700]], "groups": ["SUPP_PIZZA"] },
      { "name": "Pizza 4 Fromages", "desc": "Quatre fromages fondants.", "image": "/menu/pizza-4.webp", "sizes": [["Mini", 450], ["Normal", 750], ["Mega", 1900]], "groups": ["SUPP_PIZZA"] },
      { "name": "Pizza Viande", "desc": "Garnie de viande.", "image": "/menu/pizza-5.webp", "sizes": [["Mini", 500], ["Normal", 650], ["Mega", 1800]], "groups": ["SUPP_PIZZA"] },
      { "name": "Pizza Poulet", "desc": "Garnie de poulet.", "image": "/menu/pizza-ronde.webp", "sizes": [["Mini", 400], ["Normal", 500], ["Mega", 1800]], "groups": ["SUPP_PIZZA"] },
      { "name": "Pizza Thon", "desc": "Garnie de thon.", "image": "/menu/pizza-1.webp", "sizes": [["Mini", 450], ["Normal", 550], ["Mega", 1700]], "groups": ["SUPP_PIZZA"] },
      { "name": "Pizza Maison", "desc": "La recette signature de la maison.", "image": "/menu/pizza-2.webp", "sizes": [["Mini", 650], ["Normal", 850], ["Mega", 2300]], "groups": ["SUPP_PIZZA"] }
    ]},
    { "category": "Snacks", "image": "/menu/bol-rond.webp", "products": [
      { "name": "Bol Pasta Poulet", "desc": "Base pasta, garniture poulet.", "image": "/menu/bol-pasta.webp", "sizes": [["M", 500], ["L", 700], ["XL", 950]] },
      { "name": "Bol Pasta Viande", "desc": "Base pasta, garniture viande.", "image": "/menu/bol-pasta-viande.webp", "sizes": [["M", 650], ["L", 850], ["XL", 1000]] },
      { "name": "Bol Pasta Mixte", "desc": "Base pasta, poulet et viande.", "image": "/menu/bol-pasta.webp", "sizes": [["M", 750], ["L", 900], ["XL", 1100]] },
      { "name": "Bol Poutine Poulet", "desc": "Base poutine, garniture poulet.", "image": "/menu/bol-poutine.webp", "sizes": [["M", 500], ["L", 700], ["XL", 950]] },
      { "name": "Bol Poutine Viande", "desc": "Base poutine, garniture viande.", "image": "/menu/bol-poutine.webp", "sizes": [["M", 700], ["L", 850], ["XL", 1050]] },
      { "name": "Bol Poutine Mixte", "desc": "Base poutine, poulet et viande.", "image": "/menu/bol-poutine.webp", "sizes": [["M", 800], ["L", 1050], ["XL", 1250]] },
      { "name": "Formule Kebab", "desc": "Formule du restaurant.", "price": 550 },
      { "name": "Formule Maqloub Poulet", "desc": "Formule du restaurant.", "price": 550 },
      { "name": "Formule Maqloub Abat", "desc": "Formule du restaurant.", "price": 650 },
      { "name": "Formule Maqloub Viande", "desc": "Formule du restaurant.", "price": 700 }
    ]},
    { "category": "Boissons", "image": null, "products": [
      { "name": "Frappuccino café", "desc": "Frappuccino", "price": 550 },
      { "name": "Frappuccino vanille", "desc": "Frappuccino", "price": 550 },
      { "name": "Frappuccino choco (caramel, banane…)", "desc": "Frappuccino", "price": 600 },
      { "name": "Milkshake Vanille", "desc": "Milkshake", "price": 400 },
      { "name": "Milkshake Nutella Banane", "desc": "Milkshake", "price": 500 },
      { "name": "Milkshake Bueno", "desc": "Milkshake", "price": 600 },
      { "name": "Milkshake Oreo", "desc": "Milkshake", "price": 700 },
      { "name": "Milkshake KitKat", "desc": "Milkshake", "price": 700 },
      { "name": "Soda 30 cl", "desc": "Boisson fraîche", "price": 70 },
      { "name": "Jus 33 cl", "desc": "Boisson fraîche", "price": 80 },
      { "name": "Canette", "desc": "Boisson fraîche", "price": 100 },
      { "name": "Soda 1 L", "desc": "Boisson fraîche", "price": 150 },
      { "name": "Jus 1 L", "desc": "Boisson fraîche", "price": 150 },
      { "name": "Eau petit modèle", "desc": "Eau minérale", "price": 30 },
      { "name": "Eau grand modèle", "desc": "Eau minérale", "price": 50 }
    ]}
  ]$json$;

  v_cat         jsonb;
  v_cat_index   bigint;
  v_category_id uuid;
  v_product     jsonb;
  v_p_index     bigint;
  v_product_id  uuid;
  v_base        integer;
  v_group_key   text;
  v_group       jsonb;
  v_g_index     integer;
  v_group_id    uuid;
  v_option      jsonb;
  v_o_index     bigint;
begin
  -- Réglages réels du restaurant (fiche Google Maps et site vitrine).
  -- Frais de livraison, minimum et rayon : à définir dans Administration → Réglages.
  update public.restaurant_settings set
    name      = 'Houcine Chapati',
    phone     = '0556725681',
    address   = 'Tizi Ouzou, Algérie',
    latitude  = coalesce(latitude, 36.6975972),
    longitude = coalesce(longitude, 4.0516581)
  where id = 1;

  if exists (select 1 from public.products) then
    raise notice 'Menu déjà présent : seed du menu ignoré.';
    return;
  end if;

  for v_cat, v_cat_index in select value, ordinality from jsonb_array_elements(v_menu) with ordinality loop
    insert into public.categories (name, image, sort_order)
    values (v_cat ->> 'category', v_cat ->> 'image', v_cat_index::integer)
    returning id into v_category_id;

    for v_product, v_p_index in
      select value, ordinality from jsonb_array_elements(v_cat -> 'products') with ordinality
    loop
      v_base := coalesce((v_product ->> 'price')::integer, (v_product #>> '{sizes,0,1}')::integer);

      insert into public.products (category_id, name, description, price, image_url, sort_order)
      values (v_category_id, v_product ->> 'name', v_product ->> 'desc', v_base,
              v_product ->> 'image', v_p_index::integer)
      returning id into v_product_id;

      v_g_index := 0;

      if v_product ? 'sizes' then
        insert into public.product_option_groups (product_id, name, selection, required, sort_order)
        values (v_product_id, 'Taille', 'SINGLE', true, v_g_index)
        returning id into v_group_id;

        for v_option, v_o_index in
          select value, ordinality from jsonb_array_elements(v_product -> 'sizes') with ordinality
        loop
          insert into public.product_options (group_id, name, price_delta, sort_order)
          values (v_group_id, v_option ->> 0, (v_option ->> 1)::integer - v_base, v_o_index::integer);
        end loop;
        v_g_index := v_g_index + 1;
      end if;

      for v_group_key in
        select value from jsonb_array_elements_text(coalesce(v_product -> 'groups', '[]'::jsonb))
      loop
        v_group := v_groups -> v_group_key;
        insert into public.product_option_groups (product_id, name, selection, required, sort_order)
        values (v_product_id, v_group ->> 'name', (v_group ->> 'selection')::public.option_selection,
                (v_group ->> 'required')::boolean, v_g_index)
        returning id into v_group_id;

        for v_option, v_o_index in
          select value, ordinality from jsonb_array_elements(v_group -> 'options') with ordinality
        loop
          insert into public.product_options (group_id, name, price_delta, sort_order)
          values (v_group_id, v_option ->> 0, (v_option ->> 1)::integer, v_o_index::integer);
        end loop;
        v_g_index := v_g_index + 1;
      end loop;
    end loop;
  end loop;
end;
$seed$;
