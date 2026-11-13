<script>
  import { onDestroy, onMount } from 'svelte';
  import ResultsView from '../components/ResultsView.svelte';
  import { api } from '../lib/api.js';
  import { connect } from '../lib/socket.js';

  let { token } = $props();

  let data = $state(null);
  let error = $state('');
  let online = $state(false);
  let socket;

  onMount(async () => {
    try {
      data = await api(`/api/vote/${token}/results`);
    } catch (err) {
      error = err.message;
      return;
    }
    socket = connect(token);
    socket.on('connect', () => { online = true; socket.emit('watch-results'); });
    socket.on('disconnect', () => (online = false));
    socket.on('results', (results) => (data = { ...data, results }));
    socket.on('pool', (pool) => (data = { ...data, pool }));
  });
  onDestroy(() => socket?.disconnect());
</script>

<main class="mx-auto max-w-4xl p-4 sm:px-8 sm:py-6">
  {#if error}
    <div class="card text-center text-red-600">{error}</div>
  {:else if !data}
    <p class="text-center text-slate-500">Chargement…</p>
  {:else}
    <header class="mb-6">
      <div class="flex items-center justify-between text-sm">
        <a href="/v/{token}" class="font-medium text-indigo-600 hover:underline dark:text-indigo-400">← Mon vote</a>
        <span class="flex items-center gap-2 text-slate-500">
          <span class="inline-block size-2 rounded-full {online ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
          {online ? 'En direct' : 'Hors ligne'}
        </span>
      </div>
      <h1 class="mt-2 text-2xl font-semibold">{data.pool.title}</h1>
    </header>
    <ResultsView results={data.results} phrases={data.pool.phrases} meId={data.me.id} />
  {/if}
</main>
