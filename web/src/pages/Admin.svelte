<script>
  // Administration : connexion, puis liste des sondages (/admin) ou édition d'un sondage (/admin/s/<id>).
  import { onDestroy, onMount } from 'svelte';
  import AdminList from '../components/AdminList.svelte';
  import AdminPoll from '../components/AdminPoll.svelte';
  import { api } from '../lib/api.js';
  import { link, navigate } from '../lib/router.svelte.js';
  import { connect } from '../lib/socket.js';

  let { pollId } = $props();

  let auth = $state(null); // { admin, configured }
  let password = $state('');
  let loginError = $state('');
  let online = $state(false);
  let socket = $state(null);

  async function load() {
    auth = await api('/api/admin/me');
    if (!auth.admin) return;
    socket?.disconnect();
    const s = connect();
    s.on('connect', () => (online = true));
    s.on('disconnect', () => (online = false));
    socket = s;
  }

  onMount(load);
  onDestroy(() => socket?.disconnect());

  async function login(e) {
    e.preventDefault();
    loginError = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: { password } });
      password = '';
      await load();
    } catch (err) {
      loginError = err.message;
    }
  }

  async function logout() {
    await api('/api/admin/logout', { method: 'POST' });
    socket?.disconnect();
    socket = null;
    auth = { ...auth, admin: false };
    navigate('/admin');
  }
</script>

<main class="mx-auto max-w-6xl p-4 sm:px-8 sm:py-6">
  {#if !auth}
    <p class="text-center text-slate-500">Chargement…</p>
  {:else if !auth.admin}
    <form class="card mx-auto mt-16 max-w-sm space-y-3" onsubmit={login}>
      <h1 class="text-xl font-semibold">Administration</h1>
      {#if !auth.configured}
        <p class="text-sm text-amber-600">ADMIN_PASSWORD n'est pas défini sur le serveur (.env).</p>
      {/if}
      <input class="input" type="password" placeholder="Mot de passe" bind:value={password} autocomplete="current-password" />
      {#if loginError}<p class="text-sm text-red-600">{loginError}</p>{/if}
      <button class="btn btn-primary w-full" disabled={!password}>Entrer</button>
    </form>
  {:else if socket}
    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <nav class="flex items-center gap-2 text-2xl font-semibold">
        {#if pollId}<a href="/admin" onclick={link} class="text-base font-medium text-indigo-600 hover:underline dark:text-indigo-400">← Tous les sondages</a>{:else}Sondages{/if}
      </nav>
      <div class="flex items-center gap-3 text-sm text-slate-500">
        <span class="flex items-center gap-2">
          <span class="inline-block size-2 rounded-full {online ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
          {online ? 'En direct' : 'Hors ligne'}
        </span>
        <button class="btn btn-ghost" onclick={logout}>Déconnexion</button>
      </div>
    </header>

    {#if pollId}
      {#key pollId}<AdminPoll {pollId} {socket} />{/key}
    {:else}
      <AdminList {socket} />
    {/if}
  {/if}
</main>
