/**
 * Configuration publique du portail d'accès.
 *
 * La clé "publishable" Supabase est conçue pour être utilisée dans le navigateur.
 * Ne jamais placer ici une clé "secret" ou "service_role".
 */
window.PORTFOLIO_ACCESS_CONFIG = Object.freeze({
  enabled: true,
  supabaseUrl: "https://stqyrrnrqelvyloesylj.supabase.co",
  supabasePublishableKey: "sb_publishable_cD73PFE6nY5ws_le8UGHTA_YdfpjhvJ",
  authRedirectUrl: "https://boris-samne.github.io/gis_engineer_Boris_samne/",
  privacyPolicyUrl: "privacy.html",
  consentVersion: "2026-07-27",
  consentStorageKey: "boris-portfolio-personal-tracking-consent",
  pendingProfileStorageKey: "boris-portfolio-pending-profile"
});
