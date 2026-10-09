/**
 * Traduction des erreurs (codes levés par les fonctions SQL, erreurs réseau,
 * erreurs Auth) en messages clairs en français.
 */
const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Votre session a expiré. Rechargez la page.",
  FORBIDDEN: "Vous n'avez pas les droits pour cette action.",
  ORDERS_CLOSED: "Le restaurant ne prend pas de commandes en ce moment.",
  INVALID_NAME: "Indiquez votre nom (2 à 80 caractères).",
  INVALID_FIRST_NAME: "Indiquez votre prénom (2 caractères minimum).",
  INVALID_LAST_NAME: "Indiquez votre nom de famille (2 caractères minimum).",
  INVALID_PHONE: "Numéro de téléphone invalide. Exemple : 0555 12 34 56.",
  GOOGLE_REQUIRED: "Connectez-vous avec votre compte Google pour vous inscrire comme livreur.",
  EMAIL_NOT_VERIFIED: "Connectez-vous avec le code reçu par email pour vous inscrire comme livreur.",
  ALREADY_STAFF: "Ce compte est déjà un compte livreur ou administrateur.",
  ALREADY_DECIDED: "Cette demande a déjà été traitée.",
  NOT_FOUND: "Élément introuvable (il a peut-être été supprimé).",
  PROFILE_INCOMPLETE: "Complétez d'abord votre nom et votre téléphone dans votre profil.",
  INVALID_ADDRESS: "Indiquez une adresse complète (rue, quartier, bâtiment…).",
  INVALID_WILAYA: "Choisissez votre wilaya.",
  INVALID_COMMUNE: "Indiquez votre commune.",
  TEXT_TOO_LONG: "Un des textes est trop long (500 caractères maximum).",
  INVALID_LOCATION: "Position invalide. Replacez le marqueur sur la carte.",
  LOCATION_REQUIRED: "Indiquez votre position : bouton « Utiliser ma position actuelle » ou marqueur sur la carte.",
  LOCATION_OUT_OF_AREA: "La position indiquée est en dehors de l'Algérie.",
  OUT_OF_DELIVERY_ZONE: "Désolé, cette adresse est hors de notre zone de livraison ({detail} km autour du restaurant).",
  TOO_MANY_ACTIVE_ORDERS: "Vous avez déjà 3 commandes en cours. Attendez leur livraison avant d'en passer une nouvelle.",
  RATE_LIMITED: "Trop de commandes en peu de temps. Réessayez dans quelques minutes.",
  EMPTY_CART: "Votre panier est vide.",
  CART_TOO_LARGE: "Votre panier contient trop de lignes (30 maximum).",
  INVALID_QUANTITY: "Quantité invalide (1 à 50 par produit).",
  PRODUCT_NOT_FOUND: "Un produit de votre panier n'existe plus. Retirez-le puis réessayez.",
  PRODUCT_UNAVAILABLE: "« {detail} » n'est plus disponible. Retirez-le du panier.",
  INVALID_OPTION: "Une option de « {detail} » est invalide.",
  OPTION_UNAVAILABLE: "Une option de « {detail} » n'est plus disponible.",
  OPTION_RULE_VIOLATION: "Choix à compléter : {detail}.",
  MIN_ORDER_NOT_REACHED: "Le minimum de commande est de {detail} DA.",
  ORDER_NOT_FOUND: "Commande introuvable.",
  INVALID_STATUS_TRANSITION: "La commande a déjà changé de statut ({detail}). L'écran va se mettre à jour.",
  ORDER_NOT_READY: "La commande doit être « prête » pour assigner un livreur.",
  DRIVER_NOT_FOUND: "Livreur introuvable ou désactivé.",
  DRIVER_OFFLINE: "Ce livreur est hors ligne.",
  DRIVER_HAS_ACTIVE_ORDERS: "Terminez vos livraisons en cours avant de passer hors ligne.",
  INVALID_OPTIONS: "Options invalides.",
  USER_NOT_FOUND_OR_ADMIN: "Compte introuvable (ou compte administrateur).",
};

const POSTGRES_CODES: Record<string, string> = {
  "23503": "Impossible : cet élément est encore utilisé (ex. une catégorie qui contient des produits).",
  "23505": "Cet élément existe déjà.",
  "23514": "Une valeur saisie n'est pas valide.",
  "42501": "Vous n'avez pas les droits pour cette action.",
};

interface ErrorLike {
  message?: string;
  details?: string | null;
  code?: string;
  status?: number;
}

export function errorMessage(error: unknown): string {
  if (!error) return "Une erreur inconnue est survenue.";
  const e = (typeof error === "object" ? error : { message: String(error) }) as ErrorLike;
  const message = e.message ?? "";
  const detail = e.details ?? "";

  const known = MESSAGES[message];
  if (known) return known.replace("{detail}", detail || "?");

  if (message === "Invalid login credentials") return "Email ou mot de passe incorrect.";
  // Connexion par code reçu par email (Supabase Email OTP)
  if (/token has expired or is invalid|otp_expired/i.test(message)) {
    return "Code incorrect ou expiré. Vérifiez les 6 chiffres ou demandez un nouveau code.";
  }
  const wait = message.match(/only request this (?:after|once every) (\d+) seconds?/i);
  if (wait) return `Patientez ${wait[1]} secondes avant de demander un nouveau code.`;
  if (/email rate limit exceeded|over_email_send_rate_limit/i.test(message)) {
    return "Trop de codes envoyés. Réessayez dans quelques minutes.";
  }
  if (/signups not allowed for otp/i.test(message)) return "Aucun compte avec cet email.";
  if (/unable to validate email address|invalid format/i.test(message)) return "Adresse email invalide.";
  if (/error sending (magic link|confirmation|otp)? ?email/i.test(message)) {
    return "L'email n'a pas pu être envoyé. Réessayez plus tard ou contactez le restaurant.";
  }
  if (message.includes("Email not confirmed")) return "Adresse email non confirmée.";
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return "Les commandes sans compte ne sont pas activées (Supabase → Authentication → Anonymous sign-ins).";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Connexion impossible. Vérifiez votre connexion internet puis réessayez.";
  }
  if (e.code && POSTGRES_CODES[e.code]) return POSTGRES_CODES[e.code]!;
  if (/permission denied|row-level security/i.test(message)) return MESSAGES.FORBIDDEN!;
  return message || "Une erreur est survenue. Réessayez.";
}
