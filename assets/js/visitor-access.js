(function () {
  "use strict";

  const config = window.PORTFOLIO_ACCESS_CONFIG || {};
  if (!config.enabled) return;

  const requiredConfig = ["supabaseUrl", "supabasePublishableKey", "consentVersion"];
  const missingConfig = requiredConfig.filter((key) => !config[key]);
  if (missingConfig.length) {
    console.error("Portail d'accès non configuré :", missingConfig.join(", "));
    return;
  }

  const consentKey = config.consentStorageKey || "portfolio-personal-tracking-consent";
  const pendingKey = config.pendingProfileStorageKey || "portfolio-pending-profile";
  const supabaseSdkUrl = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  let dbClient = null;
  let currentSession = null;
  let gate = null;
  let isUnlocking = false;

  document.documentElement.classList.add("portfolio-access-locked");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  function start() {
    renderGate();

    if (hasPriorConsent() || hasAuthCallback()) {
      connectAndRestore();
    } else {
      showIdentityForm();
    }
  }

  function hasPriorConsent() {
    try {
      const saved = JSON.parse(localStorage.getItem(consentKey));
      return Boolean(saved && saved.accepted && saved.version === config.consentVersion);
    } catch (_error) {
      return false;
    }
  }

  function hasAuthCallback() {
    const query = new URLSearchParams(window.location.search);
    return /(?:access_token|refresh_token|error_description)=/.test(window.location.hash)
      || query.has("code")
      || query.has("token_hash");
  }

  function renderGate() {
    gate = document.createElement("div");
    gate.id = "portfolio-access-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "access-title");
    document.body.appendChild(gate);
  }

  function shell(content) {
    gate.innerHTML = `
      <div class="access-card">
        <div class="access-card__header">
          <p class="access-card__eyebrow">Portfolio professionnel privé</p>
          <h1 id="access-title">Bienvenue sur le portfolio de Boris SAMNE</h1>
          <p>L'accès est réservé aux visiteurs qui s'identifient et acceptent un suivi nominatif de leur consultation.</p>
        </div>
        <div class="access-card__body">${content}</div>
      </div>
    `;
  }

  function showIdentityForm(options) {
    const sessionUser = options && options.sessionUser;
    const pending = readPendingProfile();
    const email = sessionUser ? sessionUser.email : (pending && pending.email) || "";

    shell(`
      <form id="portfolio-access-form" novalidate>
        <p id="access-status" class="access-status" role="status" aria-live="polite"></p>
        <div class="access-field">
          <label for="visitor-full-name">Nom et prénom *</label>
          <input id="visitor-full-name" name="fullName" type="text" autocomplete="name"
            maxlength="120" value="${escapeAttribute((pending && pending.fullName) || "")}" required>
        </div>
        <div class="access-field">
          <label for="visitor-company">Entreprise ou organisation</label>
          <input id="visitor-company" name="company" type="text" autocomplete="organization"
            maxlength="160" value="${escapeAttribute((pending && pending.company) || "")}">
        </div>
        <div class="access-field">
          <label for="visitor-email">Adresse e-mail professionnelle *</label>
          <input id="visitor-email" name="email" type="email" autocomplete="email"
            maxlength="254" value="${escapeAttribute(email)}" ${sessionUser ? "readonly" : ""} required>
        </div>
        <label class="access-consent">
          <input id="visitor-consent" name="consent" type="checkbox" required>
          <span>
            J'accepte que mon identité, les dates de mes visites, les pages et sections consultées,
            ainsi que mes clics et téléchargements soient enregistrés par Boris SAMNE.
            Je peux retirer mon accord à tout moment.
            <a href="${escapeAttribute(config.privacyPolicyUrl || "privacy.html")}" target="_blank" rel="noopener">Lire la politique de confidentialité</a>.
          </span>
        </label>
        <div class="access-actions">
          <button class="access-button access-button--primary" type="submit">
            ${sessionUser ? "Accepter et accéder au portfolio" : "Vérifier mon e-mail et accéder"}
          </button>
          <button id="access-refuse" class="access-button access-button--secondary" type="button">Refuser et quitter</button>
        </div>
        <p class="access-note">
          Aucun suivi nominatif n'est activé avant ton accord. En acceptant, un e-mail de vérification
          peut être envoyé et une session sera conservée sur cet appareil.
        </p>
      </form>
    `);

    const form = document.getElementById("portfolio-access-form");
    form.addEventListener("submit", sessionUser ? completeProfile : requestVerification);
    document.getElementById("access-refuse").addEventListener("click", showRefusal);
    window.setTimeout(() => document.getElementById("visitor-full-name").focus(), 0);
  }

  async function requestVerification(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = readForm(form);
    if (!values) return;

    setFormBusy(form, true);
    setStatus("Préparation de l'e-mail de vérification…");

    try {
      saveConsentChoice();
      savePendingProfile(values);
      await ensureSupabase();

      const redirectUrl = cleanCurrentUrl();
      const result = await dbClient.auth.signInWithOtp({
        email: values.email,
        options: { emailRedirectTo: redirectUrl }
      });
      if (result.error) throw result.error;

      setStatus(
        "Un lien de vérification vient d'être envoyé. Ouvre-le dans ce navigateur pour accéder au portfolio.",
        true
      );
    } catch (error) {
      clearConsentChoice();
      setStatus(friendlyError(error));
    } finally {
      setFormBusy(form, false);
    }
  }

  async function completeProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = readForm(form);
    if (!values || !currentSession) return;

    setFormBusy(form, true);
    try {
      saveConsentChoice();
      savePendingProfile(values);
      await saveProfileAndConsent(currentSession, values);
      await unlock(currentSession);
    } catch (error) {
      setStatus(friendlyError(error));
      setFormBusy(form, false);
    }
  }

  function readForm(form) {
    if (!form.reportValidity()) return null;

    const data = new FormData(form);
    if (data.get("consent") !== "on") {
      setStatus("Ton accord explicite est nécessaire pour accéder au portfolio.");
      return null;
    }

    return {
      fullName: String(data.get("fullName") || "").trim(),
      company: String(data.get("company") || "").trim(),
      email: String(data.get("email") || "").trim().toLowerCase()
    };
  }

  async function connectAndRestore() {
    setLoadingState("Vérification de ton accès…");

    try {
      await ensureSupabase();
      const result = await dbClient.auth.getSession();
      if (result.error) throw result.error;

      if (result.data.session) {
        currentSession = result.data.session;
        await handleAuthenticatedSession(currentSession);
        return;
      }

      dbClient.auth.onAuthStateChange((_event, session) => {
        if (!session || isUnlocking) return;
        currentSession = session;
        window.setTimeout(() => handleAuthenticatedSession(session), 0);
      });

      showIdentityForm();
      setStatus("La session a expiré. Merci de vérifier à nouveau ton adresse e-mail.");
    } catch (error) {
      clearConsentChoice();
      showIdentityForm();
      setStatus(friendlyError(error));
    }
  }

  async function handleAuthenticatedSession(session) {
    if (isUnlocking) return;

    const profileResult = await dbClient
      .from("visitor_profiles")
      .select("full_name, company, consent_version, consented_at")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileResult.error) throw profileResult.error;

    const profile = profileResult.data;
    if (
      profile &&
      profile.full_name &&
      profile.consent_version === config.consentVersion &&
      hasPriorConsent()
    ) {
      await unlock(session);
      return;
    }

    const pending = readPendingProfile();
    if (pending && pending.fullName && pending.email === session.user.email) {
      await saveProfileAndConsent(session, pending);
      await unlock(session);
      return;
    }

    showIdentityForm({ sessionUser: session.user });
    setStatus("Adresse vérifiée. Confirme maintenant ton identité et ton accord.");
  }

  async function saveProfileAndConsent(session, profile) {
    const updateResult = await dbClient
      .from("visitor_profiles")
      .update({
        full_name: profile.fullName,
        company: profile.company || null,
        consent_version: config.consentVersion,
        consented_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", session.user.id);

    if (updateResult.error) throw updateResult.error;

    const consentResult = await dbClient.from("visitor_consents").insert({
      user_id: session.user.id,
      consent_version: config.consentVersion,
      action: "granted"
    });
    if (consentResult.error) throw consentResult.error;

    try {
      localStorage.removeItem(pendingKey);
    } catch (_error) {
      // Le profil est déjà enregistré côté serveur.
    }
  }

  async function unlock(session) {
    if (isUnlocking) return;
    isUnlocking = true;
    currentSession = session;

    await recordEvent("page_view", {
      path: window.location.pathname + window.location.search,
      title: document.title,
      referrer: document.referrer || null
    });

    document.documentElement.classList.remove("portfolio-access-locked");
    gate.remove();
    addPrivacyControl();
    startInteractionTracking();
  }

  function startInteractionTracking() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      let eventName = "link_click";
      if (href.startsWith("mailto:")) eventName = "email_click";
      if (/\.(pdf|docx?|zip)(?:$|[?#])/i.test(href)) eventName = "document_download";
      if (/linkedin\.com/i.test(href)) eventName = "linkedin_click";
      if (/github\.com/i.test(href)) eventName = "github_click";

      recordEvent(eventName, {
        label: (link.textContent || link.getAttribute("aria-label") || "").trim().slice(0, 160),
        destination: sanitizeDestination(href)
      });
    });

    if ("IntersectionObserver" in window) {
      const seenSections = new Set();
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || seenSections.has(entry.target.id)) return;
          seenSections.add(entry.target.id);
          recordEvent("section_view", { section: entry.target.id });
        });
      }, { threshold: 0.45 });

      document.querySelectorAll("main section[id]").forEach((section) => observer.observe(section));
    }
  }

  async function recordEvent(eventName, details) {
    if (!dbClient || !currentSession) return;

    const result = await dbClient.from("visitor_events").insert({
      user_id: currentSession.user.id,
      event_name: eventName,
      page_path: window.location.pathname,
      page_title: document.title,
      referrer: eventName === "page_view" ? details.referrer : null,
      metadata: details || {}
    });

    if (result.error) {
      console.warn("Événement de visite non enregistré.");
    }
  }

  function addPrivacyControl() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "privacy-control";
    button.textContent = "Gérer mes données";
    button.addEventListener("click", openPrivacyControls);
    document.body.appendChild(button);
  }

  async function openPrivacyControls() {
    const withdraw = window.confirm(
      "Souhaites-tu retirer ton accord, fermer la session et verrouiller de nouveau le portfolio ?"
    );
    if (!withdraw) return;

    if (dbClient && currentSession) {
      await dbClient.from("visitor_consents").insert({
        user_id: currentSession.user.id,
        consent_version: config.consentVersion,
        action: "withdrawn"
      });
      await dbClient.auth.signOut();
    }

    clearConsentChoice();
    window.location.reload();
  }

  function showRefusal() {
    clearConsentChoice();
    try {
      localStorage.removeItem(pendingKey);
    } catch (_error) {
      // Aucun stockage disponible.
    }

    shell(`
      <div class="access-refused">
        <h2>Accès non autorisé</h2>
        <p>Ton choix a été pris en compte. Aucun suivi nominatif n'a été activé et le portfolio reste verrouillé.</p>
        <button id="change-access-choice" class="access-button access-button--secondary" type="button">Modifier mon choix</button>
      </div>
    `);
    document.getElementById("change-access-choice").addEventListener("click", showIdentityForm);
  }

  function setLoadingState(message) {
    shell(`
      <p id="access-status" class="access-status is-success" role="status" aria-live="polite">${escapeHtml(message)}</p>
      <p class="access-note">Le portfolio sera affiché après vérification de la session et de l'accord enregistré.</p>
    `);
  }

  function setStatus(message, success) {
    const status = document.getElementById("access-status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-success", Boolean(success));
  }

  function setFormBusy(form, busy) {
    Array.from(form.elements).forEach((element) => {
      element.disabled = busy;
    });
  }

  async function ensureSupabase() {
    if (dbClient) return dbClient;
    if (!window.supabase) await loadScript(supabaseSdkUrl);

    dbClient = window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
    return dbClient;
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Le service de vérification est momentanément indisponible."));
      document.head.appendChild(script);
    });
  }

  function saveConsentChoice() {
    localStorage.setItem(consentKey, JSON.stringify({
      accepted: true,
      version: config.consentVersion,
      acceptedAt: new Date().toISOString()
    }));
  }

  function clearConsentChoice() {
    try {
      localStorage.removeItem(consentKey);
    } catch (_error) {
      // Aucun stockage disponible.
    }
  }

  function savePendingProfile(profile) {
    localStorage.setItem(pendingKey, JSON.stringify({
      fullName: profile.fullName,
      company: profile.company,
      email: profile.email,
      expiresAt: Date.now() + (60 * 60 * 1000)
    }));
  }

  function readPendingProfile() {
    try {
      const pending = JSON.parse(localStorage.getItem(pendingKey));
      if (!pending || pending.expiresAt < Date.now()) {
        localStorage.removeItem(pendingKey);
        return null;
      }
      return pending;
    } catch (_error) {
      return null;
    }
  }

  function cleanCurrentUrl() {
    const url = new URL(window.location.href);
    ["code", "token_hash", "type", "error", "error_code", "error_description"].forEach((key) => {
      url.searchParams.delete(key);
    });
    url.hash = "";
    return url.toString();
  }

  function sanitizeDestination(href) {
    if (!href) return "";
    if (href.startsWith("mailto:")) return "mailto";
    try {
      const url = new URL(href, window.location.href);
      return url.origin === window.location.origin
        ? url.pathname
        : url.hostname;
    } catch (_error) {
      return href.slice(0, 180);
    }
  }

  function friendlyError(error) {
    const message = error && error.message ? error.message : "";
    if (/rate limit/i.test(message)) return "Trop de tentatives. Merci de patienter quelques minutes.";
    if (/invalid|email/i.test(message)) return "Vérifie l'adresse e-mail indiquée puis réessaie.";
    return message || "Une erreur empêche actuellement la vérification. Merci de réessayer.";
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
