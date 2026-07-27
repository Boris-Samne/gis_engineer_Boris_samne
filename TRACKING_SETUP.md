# Activation du suivi nominatif

Le portail est déjà intégré au portfolio, mais il reste volontairement désactivé
tant que le service sécurisé n'est pas configuré. Ainsi, le site public actuel
ne risque pas de devenir inaccessible par erreur.

## 1. Créer le service de stockage

1. Créer un projet sur Supabase.
2. Ouvrir l'éditeur SQL du projet.
3. Copier et exécuter le contenu de `supabase/setup.sql`.
4. Dans les paramètres d'authentification, conserver l'authentification par e-mail.
5. Dans `Authentication > URL Configuration`, définir :
   - `Site URL` : `https://boris-samne.github.io/gis_engineer_Boris_samne/`
   - `Redirect URLs` : ajouter exactement la même adresse.

## 2. Relier le portfolio

Dans `assets/js/visitor-access-config.js` :

- renseigner `supabaseUrl` avec l'URL du projet ;
- renseigner `supabasePublishableKey` avec la clé publique/publishable ;
- renseigner `authRedirectUrl` avec l'adresse publique exacte du portfolio ;
- passer `enabled` de `false` à `true`.

Ne jamais placer une clé `secret` ou `service_role` dans le portfolio.

## 3. Vérifier avant publication

Tester les parcours suivants :

1. nouvel appareil : le portfolio est bloqué ;
2. refus : aucune requête Supabase n'est envoyée et le contenu reste bloqué ;
3. acceptation : réception du lien de vérification ;
4. ouverture du lien : accès au portfolio et création du profil ;
5. seconde visite : accès restauré et nouvelle visite enregistrée ;
6. retrait depuis « Gérer mes données » : fermeture de la session et retour au portail.

## 4. Consulter les visites

Dans le tableau de bord Supabase :

- `visitor_profiles` contient les identités ;
- `visitor_events` contient les pages, sections, clics et téléchargements ;
- `visitor_consents` conserve la preuve des accords et retraits.

Les lignes se relient par `visitor_profiles.id = visitor_events.user_id`.

## Limite de l'hébergement statique

Le portail bloque l'interface et la navigation normale. Comme GitHub Pages livre
les fichiers HTML publiquement, une personne techniquement déterminée peut
cependant consulter le code source sans passer par l'interface. Une protection
réelle du contenu exige un hébergement qui vérifie l'identité avant d'envoyer
les pages au navigateur.
