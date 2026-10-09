/** Les 58 wilayas (code officiel + nom). */
export const WILAYAS: readonly { code: number; name: string }[] = [
  { code: 1, name: "Adrar" }, { code: 2, name: "Chlef" }, { code: 3, name: "Laghouat" },
  { code: 4, name: "Oum El Bouaghi" }, { code: 5, name: "Batna" }, { code: 6, name: "Béjaïa" },
  { code: 7, name: "Biskra" }, { code: 8, name: "Béchar" }, { code: 9, name: "Blida" },
  { code: 10, name: "Bouira" }, { code: 11, name: "Tamanrasset" }, { code: 12, name: "Tébessa" },
  { code: 13, name: "Tlemcen" }, { code: 14, name: "Tiaret" }, { code: 15, name: "Tizi Ouzou" },
  { code: 16, name: "Alger" }, { code: 17, name: "Djelfa" }, { code: 18, name: "Jijel" },
  { code: 19, name: "Sétif" }, { code: 20, name: "Saïda" }, { code: 21, name: "Skikda" },
  { code: 22, name: "Sidi Bel Abbès" }, { code: 23, name: "Annaba" }, { code: 24, name: "Guelma" },
  { code: 25, name: "Constantine" }, { code: 26, name: "Médéa" }, { code: 27, name: "Mostaganem" },
  { code: 28, name: "M'Sila" }, { code: 29, name: "Mascara" }, { code: 30, name: "Ouargla" },
  { code: 31, name: "Oran" }, { code: 32, name: "El Bayadh" }, { code: 33, name: "Illizi" },
  { code: 34, name: "Bordj Bou Arréridj" }, { code: 35, name: "Boumerdès" }, { code: 36, name: "El Tarf" },
  { code: 37, name: "Tindouf" }, { code: 38, name: "Tissemsilt" }, { code: 39, name: "El Oued" },
  { code: 40, name: "Khenchela" }, { code: 41, name: "Souk Ahras" }, { code: 42, name: "Tipaza" },
  { code: 43, name: "Mila" }, { code: 44, name: "Aïn Defla" }, { code: 45, name: "Naâma" },
  { code: 46, name: "Aïn Témouchent" }, { code: 47, name: "Ghardaïa" }, { code: 48, name: "Relizane" },
  { code: 49, name: "Timimoun" }, { code: 50, name: "Bordj Badji Mokhtar" }, { code: 51, name: "Ouled Djellal" },
  { code: 52, name: "Béni Abbès" }, { code: 53, name: "In Salah" }, { code: 54, name: "In Guezzam" },
  { code: 55, name: "Touggourt" }, { code: 56, name: "Djanet" }, { code: 57, name: "El M'Ghair" },
  { code: 58, name: "El Meniaa" },
];

export const DEFAULT_WILAYA = "Tizi Ouzou";

/**
 * Communes de la wilaya de Tizi Ouzou, proposées en suggestions
 * (le client peut toujours saisir une autre commune).
 */
export const TIZI_OUZOU_COMMUNES: readonly string[] = [
  "Tizi Ouzou", "Abi Youcef", "Aghribs", "Agouni Gueghrane", "Aïn El Hammam", "Aïn Zaouia",
  "Aït Aggouacha", "Aït Aïssa Mimoun", "Aït Bouaddou", "Aït Boumahdi", "Aït Chafâa", "Aït Khellili",
  "Aït Mahmoud", "Aït Oumalou", "Aït Toudert", "Aït Yahia", "Aït Yahia Moussa", "Akbil", "Akerrou",
  "Assi Youcef", "Azazga", "Azeffoun", "Beni Aïssi", "Beni Douala", "Beni Yenni", "Beni Ziki",
  "Beni Zmenzer", "Boghni", "Boudjima", "Bounouh", "Bouzeguène", "Draâ Ben Khedda", "Draâ El Mizan",
  "Freha", "Frikat", "Iboudraren", "Idjeur", "Iferhounène", "Ifigha", "Iflissen", "Illilten",
  "Illoula Oumalou", "Imsouhal", "Irdjen", "Larbaâ Nath Irathen", "Maâtkas", "Makouda", "Mechtras",
  "Mekla", "Mizrana", "M'Kira", "Ouacif", "Ouadhia", "Ouaguenoun", "Sidi Naâmane", "Souamaâ",
  "Souk El Thenine", "Tadmaït", "Tigzirt", "Timizart", "Tirmitine", "Tizi Gheniff", "Tizi N'Tleta",
  "Tizi Rached", "Yakouren", "Yatafen", "Zekri",
];
