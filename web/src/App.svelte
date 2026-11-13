<script>
  import AppHeader from './components/AppHeader.svelte';
  import { route } from './lib/router.svelte.js';
  import Admin from './pages/Admin.svelte';
  import Results from './pages/Results.svelte';
  import Vote from './pages/Vote.svelte';

  const vote = $derived(route.path.match(/^\/v\/([A-Za-z0-9_-]+)(\/resultats)?$/));
  const admin = $derived(route.path.match(/^\/admin(?:\/s\/([A-Za-z0-9_-]+))?$/));
</script>

<AppHeader admin={Boolean(admin)} />

{#if vote && vote[2]}
  <Results token={vote[1]} />
{:else if vote}
  <Vote token={vote[1]} />
{:else if admin}
  <Admin pollId={admin[1] || null} />
{:else}
  <main class="mx-auto max-w-md p-8 text-center">
    <h1 class="text-2xl font-semibold">Sondage</h1>
    <p class="mt-2 text-slate-500">Utilisez le lien personnel reçu par courriel pour voter.</p>
  </main>
{/if}
