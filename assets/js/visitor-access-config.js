/**
 * Configuration publique du portail d'accès.
 *
 * La clé "publishable" Supabase est conçue pour être utilisée dans le navigateur.
 * Ne jamais placer ici une clé "secret" ou "service_role".
 */
window.PORTFOLIO_ACCESS_CONFIG = Object.freeze({
  enabled: false,
  supabaseUrl: "",
  supabasePublishableKey: "",
  privacyPolicyUrl: "privacy.html",
  consentVersion: "2026-07-27",
  consentStorageKey: "boris-portfolio-personal-tracking-consent",
  pendingProfileStorageKey: "boris-portfolio-pending-profile"
});
