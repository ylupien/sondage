// Serveur : API REST (admin), Socket.IO (votes et résultats en temps réel), frontend compilé.
//
// Salles Socket.IO :
//   admin                 liste des sondages (admin)
//   admin:<pollId>        résultats complets d'un sondage (admin)
//   poll:<pollId>         participants d'un sondage (changements du sondage)
//   results:<pollId>      pages « résultats » des participants
//   person:<personId>     tous les navigateurs d'une même personne
import cookieParser from 'cookie-parser';
import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import * as auth from './auth.js';
import { invitationEmail, LOGO_PNG } from './emailTemplate.js';
import { mailConfigured, mailProvider, sendInvitation, verifyMail } from './mail.js';
import * as store from './store.js';

const PORT = Number(process.env.PORT || 8900);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || 'dist');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

await store.init();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

const server = createServer(app);
// destroyUpgrade: false : laisse passer le WebSocket HMR de Vite en développement
const io = new Server(server, { serveClient: false, destroyUpgrade: false });
const DEV = process.env.NODE_ENV !== 'production';

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const voteUrl = (p) => `${PUBLIC_URL}/v/${p.token}`;
const publicPoll = (poll) => ({ id: poll.id, title: poll.title, description: poll.description, phrases: poll.phrases });

async function adminState(poll) {
  return {
    poll: { ...poll, participants: poll.participants.map((p) => ({ ...p, url: voteUrl(p) })) },
    results: await store.results(poll.id),
    mailConfigured: mailConfigured(),
  };
}

const listPolls = () => Promise.all(store.listPolls().map((p) => store.summary(p.id)));

// Après un vote ou une modification : résultats aux admins et aux participants, résumé à la liste.
async function broadcastResults(pollId) {
  const results = await store.results(pollId);
  io.to(`admin:${pollId}`).emit('results', results);
  io.to(`results:${pollId}`).emit('results', results);
  io.to('admin').emit('summary', await store.summary(pollId));
}

const requireAdmin = (req, res, next) =>
  auth.isAdminSession(req.cookies[auth.COOKIE]) ? next() : res.status(401).json({ error: 'Non autorisé' });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function loadPoll(req, res, next) {
  req.poll = store.getPoll(req.params.pollId);
  return req.poll ? next() : res.status(404).json({ error: 'Sondage introuvable' });
}

// --- Admin ---
app.get('/api/admin/me', (req, res) =>
  res.json({ admin: auth.isAdminSession(req.cookies[auth.COOKIE]), configured: auth.adminConfigured() }),
);

app.post('/api/admin/login', (req, res) => {
  if (!auth.adminConfigured()) return res.status(503).json({ error: 'ADMIN_PASSWORD non configuré sur le serveur.' });
  if (!auth.checkPassword(req.body?.password || '')) return res.status(401).json({ error: 'Mot de passe incorrect.' });
  res.cookie(auth.COOKIE, auth.issueSession(), auth.cookieOptions()).json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => res.clearCookie(auth.COOKIE, { path: '/' }).json({ ok: true }));

app.use('/api/admin/polls', requireAdmin);

app.get('/api/admin/polls', wrap(async (req, res) => res.json({ polls: await listPolls() })));

app.post('/api/admin/polls', wrap(async (req, res) => {
  const poll = await store.createPoll(clean(req.body?.title, 200));
  io.to('admin').emit('polls', await listPolls());
  res.status(201).json(await adminState(poll));
}));

app.get('/api/admin/polls/:pollId', loadPoll, wrap(async (req, res) => res.json(await adminState(req.poll))));

app.delete('/api/admin/polls/:pollId', loadPoll, wrap(async (req, res) => {
  const { id } = req.poll;
  await store.deletePoll(id);
  // Les participants et les autres admins ouverts sur ce sondage perdent l'accès
  io.to(`poll:${id}`).to(`admin:${id}`).emit('poll-deleted');
  io.in(`poll:${id}`).disconnectSockets(true);
  io.to('admin').emit('polls', await listPolls());
  res.json({ ok: true });
}));

// Sauvegarde du sondage : les nouveaux participants reçoivent un lien unique par courriel.
app.put('/api/admin/polls/:pollId', loadPoll, wrap(async (req, res) => {
  const body = req.body || {};
  const current = req.poll;

  const knownPhrases = new Set(current.phrases.map((p) => p.id));
  const phrases = [];
  for (const raw of Array.isArray(body.phrases) ? body.phrases : []) {
    const text = clean(raw?.text, 500);
    if (!text) continue;
    phrases.push({ id: knownPhrases.has(raw?.id) ? raw.id : store.newId(), text });
  }

  const byId = new Map(current.participants.map((p) => [p.id, p]));
  const byEmail = new Map(current.participants.map((p) => [p.email, p]));
  const participants = [];
  const seen = new Set();
  const errors = [];
  for (const raw of Array.isArray(body.participants) ? body.participants : []) {
    const name = clean(raw?.name, 120);
    const email = clean(raw?.email, 255).toLowerCase();
    if (!name && !email) continue;
    if (!EMAIL_RE.test(email)) { errors.push(`Courriel invalide : « ${email || name} »`); continue; }
    if (seen.has(email)) { errors.push(`Courriel en double : ${email}`); continue; }
    seen.add(email);
    const prev = byId.get(raw?.id) || byEmail.get(email);
    participants.push(prev
      ? { ...prev, name, email, ...(prev.email !== email ? { sentAt: null, mailError: null } : {}) } // nouveau courriel : renvoi
      : { id: store.newId(), token: store.newId(18), name, email, sentAt: null, mailError: null, createdAt: new Date().toISOString() });
  }
  if (errors.length) return res.status(400).json({ error: errors.join('\n') });

  const title = clean(body.title, 200) || 'Sondage';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '';
  let poll = await store.savePoll({ ...current, title, description, phrases, participants });

  poll = await sendPending(poll, participants.filter((p) => !p.sentAt));

  // Personnes retirées : leurs pages ouvertes perdent l'accès
  const kept = new Set(poll.participants.map((p) => p.id));
  for (const p of current.participants) if (!kept.has(p.id)) io.in(`person:${p.id}`).disconnectSockets(true);

  io.to(`poll:${poll.id}`).emit('poll', publicPoll(poll));
  // Ordre de chaque personne réajusté (phrases ajoutées ou retirées)
  for (const p of poll.participants) io.to(`person:${p.id}`).emit('prefs', await store.getPrefs(poll.id, p.id));
  await broadcastResults(poll.id);
  res.json(await adminState(poll));
}));

app.post('/api/admin/polls/:pollId/participants/:id/send', loadPoll, wrap(async (req, res) => {
  const person = req.poll.participants.find((p) => p.id === req.params.id);
  if (!person) return res.status(404).json({ error: 'Participant introuvable' });
  res.json(await adminState(await sendPending(req.poll, [person])));
}));

async function sendPending(poll, list) {
  if (!list.length) return poll;
  const outcome = new Map();
  for (const p of list) {
    outcome.set(p.id, await sendInvitation({ ...p, url: voteUrl(p), title: poll.title, description: poll.description, phrases: poll.phrases }));
  }
  const latest = store.getPoll(poll.id);
  return store.savePoll({
    ...latest,
    participants: latest.participants.map((p) => {
      const r = outcome.get(p.id);
      if (!r) return p;
      return r.ok ? { ...p, sentAt: new Date().toISOString(), mailError: null } : { ...p, mailError: r.error };
    }),
  });
}

// Aperçu du courriel d'invitation (tel qu'enregistré), logo en data: au lieu de la pièce jointe
app.get('/api/admin/polls/:pollId/email-preview', loadPoll, (req, res) => {
  const { html } = invitationEmail({
    name: 'Marie',
    url: `${PUBLIC_URL}/v/exemple-de-lien-personnel`,
    title: req.poll.title,
    description: req.poll.description,
    phrases: req.poll.phrases,
    logoSrc: `data:image/png;base64,${LOGO_PNG.toString('base64')}`,
  });
  res.type('html').set('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'").send(html);
});

// --- Participant ---
function loadToken(req, res, next) {
  req.found = store.findByToken(req.params.token);
  return req.found ? next() : res.status(404).json({ error: 'Lien invalide ou expiré.' });
}

app.get('/api/vote/:token', loadToken, wrap(async (req, res) => {
  const { poll, person } = req.found;
  res.json({ me: { id: person.id, name: person.name }, pool: publicPoll(poll), prefs: await store.getPrefs(poll.id, person.id) });
}));

app.get('/api/vote/:token/results', loadToken, wrap(async (req, res) => {
  const { poll, person } = req.found;
  res.json({ me: { id: person.id, name: person.name }, pool: publicPoll(poll), results: await store.results(poll.id) });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Introuvable' }));

// --- Frontend ---
// Développement : Vite en middleware sur le même port, recompilation à la volée et mise à jour à chaud (HMR).
// Production : fichiers compilés par « npm run build » (dist/).
if (DEV) {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({
    configFile: path.resolve('vite.config.js'),
    appType: 'spa',
    server: {
      middlewareMode: true,
      ws: { server },
      // Docker Desktop sous WSL : les événements de fichiers des volumes peuvent ne pas arriver
      watch: process.env.VITE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    },
  });
  app.use(vite.middlewares);
} else if (existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

// --- Socket.IO : admin (cookie) ou participant (jeton du lien) ---
io.use((socket, next) => {
  const cookies = parseCookie(socket.handshake.headers.cookie || '');
  socket.data.admin = auth.isAdminSession(cookies[auth.COOKIE]);
  const token = socket.handshake.auth?.token;
  socket.data.token = token && store.findByToken(token) ? token : null;
  if (token && !socket.data.token) return next(new Error('Non autorisé'));
  if (!socket.data.admin && !socket.data.token) return next(new Error('Non autorisé'));
  next();
});

io.on('connection', (socket) => {
  // La personne est relue à chaque événement : un participant retiré perd l'accès aussitôt.
  const found = () => (socket.data.token ? store.findByToken(socket.data.token) : null);

  const f = found();
  if (f) {
    socket.join([`poll:${f.poll.id}`, `person:${f.person.id}`]);
    socket.on('watch-results', () => { const x = found(); if (x) socket.join(`results:${x.poll.id}`); });
  } else if (socket.data.admin) {
    socket.join('admin');
    socket.on('watch-poll', (pollId) => {
      for (const room of socket.rooms) if (room.startsWith('admin:')) socket.leave(room);
      if (store.getPoll(pollId)) socket.join(`admin:${pollId}`);
    });
  }

  const handle = (fn) => async (payload, ack) => {
    const me = found();
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!me) return reply({ error: 'Lien invalide' });
    try {
      const prefs = await fn(me, payload);
      socket.to(`person:${me.person.id}`).emit('prefs', prefs); // ses autres navigateurs
      reply({ prefs });
      await broadcastResults(me.poll.id);
    } catch (err) {
      reply({ error: err.message });
    }
  };

  // Un vote peut arriver avec le nouvel ordre qu'il entraîne (j'aime en haut, j'aime pas en bas)
  socket.on('vote', handle(async ({ poll, person }, { phraseId, value, order } = {}) => {
    const prefs = await store.setVote(poll.id, person.id, phraseId, value ?? null);
    return Array.isArray(order) ? store.setOrder(poll.id, person.id, order) : prefs;
  }));
  socket.on('order', handle(({ poll, person }, order) => store.setOrder(poll.id, person.id, order)));
});

server.listen(PORT, () => {
  console.log(`Pool : ${PUBLIC_URL} (admin : ${PUBLIC_URL}/admin) — port ${PORT}${DEV ? ' — développement (Vite HMR)' : ''}`);
  if (!auth.adminConfigured()) console.warn('ADMIN_PASSWORD absent : la page admin restera fermée.');
  if (!mailConfigured()) console.warn('Courriel non configuré (RESEND_API_KEY ou SMTP_HOST) : les liens sont journalisés.');
  else verifyMail().then(
    () => console.log(`Courriel : ${mailProvider()} prêt`),
    (err) => console.error(`Courriel : connexion à ${mailProvider()} impossible : ${err.message}`),
  );
});
