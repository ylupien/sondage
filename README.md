# Sondage « meilleure phrase »

L'admin gère plusieurs sondages : une liste (`/admin`) avec « Créer un sondage », puis pour chacun des phrases
et une liste de participant·e·s (nom + courriel). À l'enregistrement, chaque personne reçoit par courriel un lien
unique propre à ce sondage. Sur sa page, elle met « J'aime » ou « J'aime pas » sur chaque phrase et les classe
selon ses priorités par glisser-déposer. C'est un vote de priorité : chaque personne a son propre ordre,
qui part d'un mélange propre à elle. Tout est enregistré en temps réel (Socket.IO), sans bouton : ses autres
navigateurs, la page de résultats des participant·e·s et l'admin se mettent à jour aussitôt.

Stack : Node (Express 5 + Socket.IO + nodemailer), Vite + Svelte 5 + Tailwind 4. Aucune base de données :

- `data/polls/<sondage>/poll.json` : le sondage (titre, phrases, participant·e·s et leur jeton)
- `data/polls/<sondage>/people/<id>.json` : les votes et l'ordre de priorité d'une personne
- `data/deleted/` : sondages supprimés (déplacés, récupérables à la main)

## Lancer

    cp .env.example .env        # renseigner ADMIN_PASSWORD (et RESEND_API_KEY ou SMTP_*)
    docker compose up -d --build

- Admin : http://localhost:8900/admin (liste), /admin/s/<sondage> (édition et résultats en direct)
- Participant : http://localhost:8900/v/<jeton> ; résultats : /v/<jeton>/resultats

### Développement (par défaut)

`docker-compose.override.yml` est chargé automatiquement : `server/` et `web/` sont montés dans le conteneur,
Vite tourne en middleware dans le serveur Node (même port 8900). Aucune compilation :

- un fichier de `web/` modifié est recompilé seul et l'interface se met à jour sans recharger la page (HMR) ;
- un fichier de `server/` modifié redémarre le serveur (`node --watch`).

Reconstruire l'image seulement après un changement de `package.json` ou de `vite.config.js` :
`docker compose up -d --build`. Si les modifications ne sont plus détectées (Docker Desktop / WSL),
ajouter `VITE_POLLING=true` dans `.env`.

Sans Docker : `npm install` puis `npm run dev` (même chose, sur http://localhost:8900).

### Production

Ajouter `COMPOSE_FILE=docker-compose.yml` dans `.env` (ignore l'override de développement), puis
`docker compose up -d --build` : frontend compilé, image en lecture seule. Sans Docker : `npm run build && npm start`.

Courriel : `RESEND_API_KEY` (Resend) ou `SMTP_HOST` + `SMTP_*` (prioritaire).
Sans l'un ni l'autre, aucun courriel n'est envoyé : les liens sont affichés dans l'admin (« Copier le lien ») et dans
`docker compose logs app`. Une personne déjà invitée ne reçoit pas de nouveau courriel à chaque enregistrement
(bouton « Renvoyer » au besoin) ; si son courriel change, elle est réinvitée avec le même lien.

Vote : J'aime / J'aime pas, puis classement par glisser-déposer (n'importe où sur la carte à la souris, poignée ⠿
au doigt). Après chaque vote, l'ordre se range en trois blocs (J'aime, sans avis, J'aime pas), et l'ordre de la
personne est conservé dans chaque bloc. Classement global : points Borda (avec n phrases, la 1re place vaut n−1 points,
la dernière 0), puis J'aime − J'aime pas. Seules les personnes qui ont commencé à répondre comptent.

## Publication (Cloudflare Tunnel)

Tunnel Cloudflare nommé « sondage », sur un domaine géré par Cloudflare (ici `sondage.exemple.com`). Connexion sortante seulement, aucun port ouvert. Le service `tunnel` relie le nom public à
`http://app:8900`.

- `deploy/cloudflared/config.yml` et `credentials.json` : identifiants du tunnel (hors Git, mode 600, à sauvegarder).
  Modèle : `deploy/cloudflared/config.example.yml`.
- `.env` : `PUBLIC_URL=https://sondage.exemple.com` (adresse des liens envoyés), `COOKIE_SECURE=true`,
  `COMPOSE_PROFILES=public` (démarre le tunnel), `COMPOSE_FILE=docker-compose.yml` (production, sans HMR).
- `docker compose up -d --build` après une modification du code (en production, le frontend est compilé dans l'image).
- Journaux : `docker compose logs -f tunnel`. Retirer le site public : `docker compose stop tunnel`.

Pour développer avec HMR, retirer `COMPOSE_FILE` de `.env` puis `docker compose up -d --build`. Le site public
sert alors la version de développement : la remettre en production une fois les modifications faites.

Recréer le tunnel ailleurs (prérequis : `cloudflared tunnel login`) :

    cloudflared tunnel create --credentials-file deploy/cloudflared/credentials.json sondage
    cloudflared tunnel route dns sondage sondage.exemple.com
    # puis config.yml : tunnel: <id>, credentials-file: /etc/cloudflared/credentials.json,
    # ingress: sondage.exemple.com → http://app:8900, puis http_status:404
