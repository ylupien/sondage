<script>
  // Édition d'un sondage (phrases, participants, invitations) et résultats en direct.
  import { onDestroy, onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { link, navigate, setGuard } from '../lib/router.svelte.js';
  import Ranking from './Ranking.svelte';
  import ResponsesMatrix from './ResponsesMatrix.svelte';

  let { pollId, socket } = $props();

  let srv = $state(null); // dernier état enregistré (serveur)
  let draft = $state(null); // formulaire en cours
  let saving = $state(false);
  let message = $state('');
  let error = $state('');
  let bulk = $state('');
  let bulkPhrases = $state('');
  let bulkPhrasesOpen = $state(false); // ouvert d'office pour un sondage sans phrase (voir onMount)

  const base = `/api/admin/polls/${pollId}`;
  const dirty = $derived(draft && srv && JSON.stringify(toBody(draft)) !== JSON.stringify(toBody(srv.poll)));

  function toBody(p) {
    return {
      title: p.title,
      description: p.description,
      phrases: p.phrases.map(({ id, text }) => ({ id, text })),
      participants: p.participants.map(({ id, name, email }) => ({ id, name, email })),
    };
  }

  const clone = (poll) => JSON.parse(JSON.stringify(poll));
  const watch = () => socket.emit('watch-poll', pollId);
  const onResults = (results) => { if (srv) srv = { ...srv, results }; };
  const onDeleted = () => navigate('/admin');
  const confirmLeave = () => !dirty || confirm('Des modifications ne sont pas enregistrées. Quitter quand même ?');
  const beforeUnload = (e) => { if (dirty) e.preventDefault(); };

  onMount(async () => {
    socket.on('connect', watch);
    socket.on('results', onResults);
    socket.on('poll-deleted', onDeleted);
    window.addEventListener('beforeunload', beforeUnload);
    setGuard(confirmLeave);
    watch();
    try {
      srv = await api(base);
      draft = clone(srv.poll);
      bulkPhrasesOpen = draft.phrases.length === 0;
    } catch (err) {
      error = err.status === 404 ? 'Ce sondage n\'existe pas (ou a été supprimé).' : err.message;
    }
  });
  onDestroy(() => {
    socket.off('connect', watch);
    socket.off('results', onResults);
    socket.off('poll-deleted', onDeleted);
    socket.emit('watch-poll', null);
    window.removeEventListener('beforeunload', beforeUnload);
    setGuard(null);
  });

  function sentSummary(before, after) {
    const prev = new Map(before.participants.map((p) => [p.id, p]));
    const sent = after.participants.filter((p) => p.sentAt && p.sentAt !== prev.get(p.id)?.sentAt).length;
    const failed = after.participants.filter((p) => !p.sentAt && p.mailError).length;
    return [sent && `${sent} courriel(s) envoyé(s)`, failed && `${failed} non envoyé(s)`].filter(Boolean).join(', ');
  }

  async function save() {
    saving = true;
    error = message = '';
    try {
      const before = srv.poll;
      srv = await api(base, { method: 'PUT', body: toBody(draft) });
      draft = clone(srv.poll);
      message = ['Enregistré.', sentSummary(before, srv.poll)].filter(Boolean).join(' ');
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  async function resend(person) {
    error = message = '';
    try {
      srv = await api(`${base}/participants/${person.id}/send`, { method: 'POST' });
      const p = srv.poll.participants.find((x) => x.id === person.id);
      message = p?.mailError ? `Non envoyé : ${p.mailError}` : `Courriel envoyé à ${person.email}.`;
    } catch (err) {
      error = err.message;
    }
  }

  async function destroy() {
    if (!confirm(`Supprimer le sondage « ${srv.poll.title} » ? Les liens envoyés cesseront de fonctionner.`)) return;
    try {
      await api(base, { method: 'DELETE' });
      setGuard(null);
      navigate('/admin');
    } catch (err) {
      error = err.message;
    }
  }

  const addPhrase = () => draft.phrases.push({ id: null, text: '' });
  const addPerson = () => draft.participants.push({ id: null, name: '', email: '' });
  const remove = (list, i) => list.splice(i, 1);

  // Une ligne par personne : « Nom <courriel> », « Nom, courriel », « Nom ; courriel » ou « courriel »
  function importBulk() {
    for (const line of bulk.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const email = line.match(/[^\s<>,;]+@[^\s<>,;]+/)?.[0] || '';
      const name = line.replace(email, '').replace(/[<>,;"]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!email) continue;
      if (draft.participants.some((p) => p.email.toLowerCase() === email.toLowerCase())) continue;
      draft.participants.push({ id: null, name, email });
    }
    bulk = '';
  }

  // Une phrase par ligne. Les puces et numéros en début de ligne (« - », « • », « 1. », « 2) ») sont retirés,
  // les lignes vides et les phrases déjà présentes sont ignorées.
  function importPhrases() {
    const norm = (t) => t.trim().toLowerCase();
    const known = new Set(draft.phrases.map((p) => norm(p.text)));
    draft.phrases = draft.phrases.filter((p) => p.text.trim()); // champs vides laissés en route
    let added = 0;
    let skipped = 0;
    for (const raw of bulkPhrases.split('\n')) {
      const text = raw.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (known.has(norm(text))) { skipped++; continue; }
      known.add(norm(text));
      draft.phrases.push({ id: null, text });
      added++;
    }
    bulkPhrases = '';
    message = `${added} phrase${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}${skipped ? ` (${skipped} en double ignorée${skipped > 1 ? 's' : ''})` : ''}. N'oubliez pas d'enregistrer.`;
  }

  const saved = (id) => srv.poll.participants.find((p) => p.id === id);
  const fmt = (iso) => new Date(iso).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' });
  const copy = async (url) => { await navigator.clipboard.writeText(url); message = 'Lien copié.'; };
</script>

{#if error && !srv}
  <div class="card text-center">
    <p class="text-red-600">{error}</p>
    <a href="/admin" onclick={link} class="mt-3 inline-block text-indigo-600 hover:underline">← Retour aux sondages</a>
  </div>
{:else if !draft}
  <p class="text-slate-500">Chargement…</p>
{:else}
  {#if !srv.mailConfigured}
    <p class="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      Courriel non configuré (RESEND_API_KEY ou SMTP_HOST dans .env) : aucun courriel n'est envoyé. Copiez les liens ci-dessous pour les transmettre.
    </p>
  {/if}

  <div class="grid gap-6 lg:grid-cols-2">
    <div class="space-y-6">
      <section class="card space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Sondage</h2>
          <div class="flex items-center gap-4 text-sm">
            <a class="text-indigo-600 hover:underline dark:text-indigo-400" href="/api/admin/polls/{pollId}/email-preview" target="_blank" rel="noopener"
              title="Courriel tel qu'il sera envoyé (version enregistrée du sondage)">Aperçu du courriel</a>
            <button class="text-rose-600 hover:underline" onclick={destroy}>Supprimer le sondage</button>
          </div>
        </div>
        <label class="block text-sm">
          <span class="text-slate-500">Question</span>
          <input class="input mt-1" bind:value={draft.title} />
        </label>
        <label class="block text-sm">
          <span class="text-slate-500">Description (facultative)</span>
          <textarea class="input mt-1" rows="2" bind:value={draft.description}></textarea>
        </label>

        <h3 class="pt-2 font-medium">Phrases</h3>
        <p class="text-xs text-slate-500">Chaque personne les reçoit dans un ordre mélangé, puis les classe selon ses propres priorités.</p>
        <ul class="space-y-2">
          {#each draft.phrases as phrase, i}
            <li class="flex items-center gap-2">
              <input class="input" bind:value={phrase.text} placeholder="Phrase…" />
              <button class="text-rose-500 hover:text-rose-700" aria-label="Retirer" onclick={() => remove(draft.phrases, i)}>✕</button>
            </li>
          {/each}
        </ul>
        <button class="btn btn-ghost" onclick={addPhrase}>+ Ajouter une phrase</button>

        <details class="text-sm" bind:open={bulkPhrasesOpen}>
          <summary class="cursor-pointer text-slate-500">Ajouter plusieurs phrases</summary>
          <textarea
            class="input mt-2"
            rows="6"
            bind:value={bulkPhrases}
            placeholder={'Une phrase par ligne\nEnsemble, plus loin\nLe futur, maintenant\nSimplement mieux'}
          ></textarea>
          <button class="btn btn-ghost mt-2" onclick={importPhrases} disabled={!bulkPhrases.trim()}>Ajouter les phrases</button>
        </details>
      </section>

      <section class="card space-y-3">
        <h2 class="text-lg font-semibold">Participant·e·s</h2>
        <ul class="space-y-3">
          {#each draft.participants as person, i}
            {@const s = person.id ? saved(person.id) : null}
            <li class="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
              <div class="flex items-center gap-2">
                <input class="input" bind:value={person.name} placeholder="Nom" />
                <input class="input" type="email" bind:value={person.email} placeholder="courriel@exemple.com" />
                <button class="text-rose-500 hover:text-rose-700" aria-label="Retirer" onclick={() => remove(draft.participants, i)}>✕</button>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {#if !s}
                  <span>Nouveau : le lien sera envoyé à l'enregistrement</span>
                {:else}
                  {#if s.sentAt}
                    <span class="text-emerald-600">✓ envoyé le {fmt(s.sentAt)}</span>
                  {:else if s.mailError}
                    <span class="text-amber-600" title={s.mailError}>⚠ non envoyé</span>
                  {:else}
                    <span>pas encore envoyé</span>
                  {/if}
                  <button class="text-indigo-600 hover:underline" onclick={() => copy(s.url)}>Copier le lien</button>
                  <a class="text-indigo-600 hover:underline" href={s.url} target="_blank" rel="noopener">Ouvrir</a>
                  <button class="text-indigo-600 hover:underline" onclick={() => resend(s)}>{s.sentAt ? 'Renvoyer' : 'Envoyer'}</button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        <button class="btn btn-ghost" onclick={addPerson}>+ Ajouter une personne</button>

        <details class="text-sm">
          <summary class="cursor-pointer text-slate-500">Coller une liste</summary>
          <textarea class="input mt-2" rows="4" bind:value={bulk} placeholder={'Marie Tremblay <marie@exemple.com>\nJean Roy, jean@exemple.com'}></textarea>
          <button class="btn btn-ghost mt-2" onclick={importBulk} disabled={!bulk.trim()}>Ajouter à la liste</button>
        </details>
      </section>

      <div class="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl bg-white/90 p-3 shadow-lg backdrop-blur dark:bg-slate-900/90">
        <button class="btn btn-primary" onclick={save} disabled={saving || !dirty}>
          {saving ? 'Enregistrement…' : 'Enregistrer et envoyer les invitations'}
        </button>
        {#if dirty}<span class="text-sm text-amber-600">Modifications non enregistrées</span>{/if}
        {#if message}<span class="text-sm text-emerald-600">{message}</span>{/if}
        {#if error}<span class="whitespace-pre-line text-sm text-red-600">{error}</span>{/if}
      </div>
    </div>

    <div>
      <Ranking results={srv.results} phrases={srv.poll.phrases} />
    </div>
  </div>

  <div class="mt-6">
    <ResponsesMatrix results={srv.results} />
  </div>
{/if}
