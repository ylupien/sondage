<script>
  // Entête commun : icône + nom de l'application, « Sondage ». Dans l'admin, le logo ramène à la liste des sondages.
  import { link } from '../lib/router.svelte.js';
  import LogoIcon from './LogoIcon.svelte';

  let { admin = false } = $props();
</script>

<header class="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
  <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-8">
    {#if admin}
      <a href="/admin" onclick={link} class="flex items-center" title="Tous les sondages">
        <LogoIcon class="h-9 sm:h-10" />
        <span class="ml-2.5 text-lg font-semibold tracking-tight">Sondage</span>
      </a>
      <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Admin</span>
    {:else}
      <span class="flex items-center">
        <LogoIcon class="h-9 sm:h-10" />
        <span class="ml-2.5 text-lg font-semibold tracking-tight">Sondage</span>
      </span>
    {/if}
  </div>
</header>
