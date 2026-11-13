<script>
  // Liste des sondages, mise à jour en direct (réponses, classement), et bouton « Créer un sondage ».
  import { onDestroy, onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { link, navigate } from '../lib/router.svelte.js';

  let { socket } = $props();

  let polls = $state(null);
  let error = $state('');
  let creating = $state(false);

  const onPolls = (list) => (polls = list);
  const onSummary = (s) => { if (polls) polls = polls.map((p) => (p.id === s.id ? s : p)); };
  const refresh = async () => {
    try { polls = (await api('/api/admin/polls')).polls; } catch (err) { error = err.message; }
  };

  onMount(() => {
    refresh();
    socket.on('polls', onPolls);
    socket.on('summary', onSummary);
    socket.on('connect', refresh); // après une reconnexion
  });
  onDestroy(() => {
    socket.off('polls', onPolls);
    socket.off('summary', onSummary);
    socket.off('connect', refresh);
  });

  async function create() {
    creating = true;
    try {
      const { poll } = await api('/api/admin/polls', { method: 'POST', body: { title: 'Nouveau sondage' } });
      navigate(`/admin/s/${poll.id}`);
    } catch (err) {
      error = err.message;
      creating = false;
    }
  }

  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-CA', { dateStyle: 'medium' }) : '');
</script>

<div class="mb-4 flex items-center justify-between gap-3">
  <p class="text-sm text-slate-500">{polls ? `${polls.length} sondage${polls.length > 1 ? 's' : ''}` : ''}</p>
  <button class="btn btn-primary" onclick={create} disabled={creating}>+ Créer un sondage</button>
</div>

{#if error}<p class="mb-3 text-sm text-red-600">{error}</p>{/if}

{#if !polls}
  <p class="text-slate-500">Chargement…</p>
{:else if polls.length === 0}
  <div class="card py-12 text-center">
    <p class="text-slate-500">Aucun sondage pour le moment.</p>
    <button class="btn btn-primary mt-4" onclick={create} disabled={creating}>+ Créer un sondage</button>
  </div>
{:else}
  <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each polls as poll (poll.id)}
      {@const pct = poll.participants ? Math.round((poll.answered / poll.participants) * 100) : 0}
      <li>
        <a href="/admin/s/{poll.id}" onclick={link} class="card block h-full transition hover:border-indigo-400 hover:shadow-md">
          <h2 class="font-semibold">{poll.title}</h2>
          <p class="mt-1 text-xs text-slate-500">Créé le {fmt(poll.createdAt)}</p>
          <p class="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {poll.phrases} phrase{poll.phrases > 1 ? 's' : ''} · {poll.answered} / {poll.participants} réponse{poll.participants > 1 ? 's' : ''}
          </p>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div class="h-full rounded-full bg-indigo-500 transition-all duration-500" style="width: {pct}%"></div>
          </div>
          {#if poll.leader}
            <p class="mt-3 truncate text-sm"><span class="text-slate-500">En tête :</span> {poll.leader}</p>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
{/if}
