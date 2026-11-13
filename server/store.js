// Stockage en fichiers JSON locaux, un dossier par sondage :
//   data/polls/<pollId>/poll.json              le sondage (titre, phrases, participants avec leur jeton)
//   data/polls/<pollId>/people/<personId>.json les préférences d'une personne (j'aime / j'aime pas, ordre)
// Un sondage supprimé est déplacé dans data/deleted/ (récupérable à la main).
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const POLLS_DIR = path.join(DATA_DIR, 'polls');
const DELETED_DIR = path.join(DATA_DIR, 'deleted');

export const newId = (bytes = 6) => randomBytes(bytes).toString('base64url');
const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const pollDir = (pollId) => path.join(POLLS_DIR, pollId);
const pollFile = (pollId) => path.join(pollDir(pollId), 'poll.json');
const personFile = (pollId, personId) => path.join(pollDir(pollId), 'people', `${personId}.json`);

// Écritures sérialisées par fichier, puis écriture atomique (fichier temporaire + rename).
const queues = new Map();
function writeJson(file, data) {
  const prev = queues.get(file) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const tmp = `${file}.${process.pid}.${newId(4)}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    await rename(tmp, file);
  });
  queues.set(file, next);
  next.finally(() => { if (queues.get(file) === next) queues.delete(file); });
  return next;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

// Cache mémoire : les fichiers sont lus au démarrage, le serveur est seul à écrire.
const polls = new Map(); // pollId → sondage
const tokens = new Map(); // jeton → { pollId, personId }
const people = new Map(); // `${pollId}/${personId}` → préférences brutes

function indexTokens(poll, previous) {
  for (const p of previous?.participants || []) tokens.delete(p.token);
  for (const p of poll.participants) tokens.set(p.token, { pollId: poll.id, personId: p.id });
}

export async function init() {
  await mkdir(POLLS_DIR, { recursive: true });
  await migrateLegacy();
  for (const entry of await readdir(POLLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ID_RE.test(entry.name)) continue;
    const poll = await readJson(pollFile(entry.name), null);
    if (!poll) continue;
    poll.id = entry.name;
    polls.set(poll.id, poll);
    indexTokens(poll);
  }
}

// Ancienne version à sondage unique (data/pool.json + data/people/) → data/polls/<id>/
async function migrateLegacy() {
  const legacy = path.join(DATA_DIR, 'pool.json');
  if (!existsSync(legacy)) return;
  const id = newId();
  await mkdir(pollDir(id), { recursive: true });
  const poll = await readJson(legacy, {});
  await writeFile(pollFile(id), JSON.stringify({ ...poll, id, createdAt: poll.updatedAt || new Date().toISOString() }, null, 2));
  if (existsSync(path.join(DATA_DIR, 'people'))) await rename(path.join(DATA_DIR, 'people'), path.join(pollDir(id), 'people'));
  await rename(legacy, `${legacy}.migre`);
  console.log(`Ancien sondage migré vers data/polls/${id}`);
}

export const getPoll = (pollId) => polls.get(pollId) || null;

export const listPolls = () =>
  [...polls.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

export async function createPoll(title) {
  const id = newId();
  const now = new Date().toISOString();
  const poll = { id, title: title || 'Nouveau sondage', description: '', phrases: [], participants: [], createdAt: now, updatedAt: now };
  await mkdir(path.join(pollDir(id), 'people'), { recursive: true });
  await writeJson(pollFile(id), poll);
  polls.set(id, poll);
  return poll;
}

export async function savePoll(next) {
  const previous = polls.get(next.id);
  if (!previous) throw new Error('sondage inconnu');
  const poll = { ...next, updatedAt: new Date().toISOString() };
  await mkdir(path.join(pollDir(poll.id), 'people'), { recursive: true });
  await writeJson(pollFile(poll.id), poll);
  polls.set(poll.id, poll);
  indexTokens(poll, previous);
  return poll;
}

export async function deletePoll(pollId) {
  const poll = polls.get(pollId);
  if (!poll) return false;
  await mkdir(DELETED_DIR, { recursive: true });
  await rename(pollDir(pollId), path.join(DELETED_DIR, `${pollId}-${Date.now()}`));
  polls.delete(pollId);
  for (const p of poll.participants) tokens.delete(p.token);
  for (const key of people.keys()) if (key.startsWith(`${pollId}/`)) people.delete(key);
  return true;
}

// Jeton d'un lien personnel → { poll, person }
export function findByToken(token) {
  const ref = typeof token === 'string' ? tokens.get(token) : null;
  const poll = ref && polls.get(ref.pollId);
  const person = poll?.participants.find((p) => p.id === ref.personId);
  return person ? { poll, person } : null;
}

// Ordre de départ propre à chaque personne : mélange stable (même ordre à chaque visite),
// pour que l'ordre saisi par l'admin n'influence pas le vote de priorité.
const shuffleKey = (personId, phraseId) => createHash('sha1').update(`${personId}:${phraseId}`).digest('hex');

// Préférences ramenées à l'état actuel du sondage : phrases retirées oubliées, nouvelles ajoutées à la fin
// (dans l'ordre mélangé de la personne).
function normalize(poll, personId, prefs) {
  const ids = poll.phrases.map((p) => p.id);
  const known = new Set(ids);
  const votes = {};
  for (const [id, v] of Object.entries(prefs.votes || {})) {
    if (known.has(id) && (v === 'like' || v === 'dislike')) votes[id] = v;
  }
  const order = (prefs.order || []).filter((id, i, a) => known.has(id) && a.indexOf(id) === i);
  const missing = ids.filter((id) => !order.includes(id));
  missing.sort((a, b) => shuffleKey(personId, a).localeCompare(shuffleKey(personId, b)));
  order.push(...missing);
  return { votes, order, updatedAt: prefs.updatedAt || null };
}

export async function getPrefs(pollId, personId) {
  const poll = polls.get(pollId);
  if (!poll || !ID_RE.test(personId)) throw new Error('identifiant invalide');
  const key = `${pollId}/${personId}`;
  if (!people.has(key)) people.set(key, await readJson(personFile(pollId, personId), { votes: {}, order: [] }));
  return normalize(poll, personId, people.get(key));
}

async function putPrefs(pollId, personId, prefs) {
  const poll = polls.get(pollId);
  const person = poll.participants.find((p) => p.id === personId);
  const data = { id: personId, name: person?.name || null, ...prefs, updatedAt: new Date().toISOString() };
  people.set(`${pollId}/${personId}`, data);
  await writeJson(personFile(pollId, personId), data);
  return normalize(poll, personId, data);
}

export async function setVote(pollId, personId, phraseId, value) {
  const prefs = await getPrefs(pollId, personId);
  if (!polls.get(pollId).phrases.some((p) => p.id === phraseId)) throw new Error('phrase inconnue');
  if (value === 'like' || value === 'dislike') prefs.votes[phraseId] = value;
  else delete prefs.votes[phraseId];
  return putPrefs(pollId, personId, prefs);
}

export async function setOrder(pollId, personId, order) {
  const prefs = await getPrefs(pollId, personId);
  if (!Array.isArray(order)) throw new Error('ordre invalide');
  prefs.order = order.filter((id) => typeof id === 'string');
  return putPrefs(pollId, personId, normalize(polls.get(pollId), personId, prefs));
}

// Résultats : par personne et agrégés (j'aime, j'aime pas, rang moyen, points Borda).
export async function results(pollId) {
  const poll = polls.get(pollId);
  const n = poll.phrases.length;
  const stats = Object.fromEntries(
    poll.phrases.map((p) => [p.id, { id: p.id, text: p.text, likes: 0, dislikes: 0, points: 0, rankSum: 0, voters: 0 }]),
  );
  const participants = [];
  for (const person of poll.participants) {
    const prefs = await getPrefs(pollId, person.id);
    const active = Boolean(prefs.updatedAt);
    participants.push({ id: person.id, name: person.name, active, votes: prefs.votes, order: prefs.order });
    for (const [id, v] of Object.entries(prefs.votes)) stats[id][v === 'like' ? 'likes' : 'dislikes']++;
    if (!active) continue; // l'ordre par défaut d'une personne qui n'a rien touché ne compte pas
    prefs.order.forEach((id, i) => {
      stats[id].points += n - 1 - i;
      stats[id].rankSum += i + 1;
      stats[id].voters++;
    });
  }
  const ranking = Object.values(stats)
    .map((s) => ({ ...s, avgRank: s.voters ? s.rankSum / s.voters : null }))
    .sort((a, b) => b.points - a.points || b.likes - b.dislikes - (a.likes - a.dislikes) || a.text.localeCompare(b.text));
  return { participants, ranking };
}

// Résumé pour la liste de l'admin
export async function summary(pollId) {
  const poll = polls.get(pollId);
  const r = await results(pollId);
  return {
    id: poll.id,
    title: poll.title,
    createdAt: poll.createdAt,
    updatedAt: poll.updatedAt,
    phrases: poll.phrases.length,
    participants: poll.participants.length,
    answered: r.participants.filter((p) => p.active).length,
    leader: poll.phrases.length && r.participants.some((p) => p.active) ? r.ranking[0].text : null,
  };
}
