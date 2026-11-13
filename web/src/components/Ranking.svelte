<script>
  // Classement global (points Borda, rang moyen, j'aime / j'aime pas).
  let { results, phrases } = $props();

  const max = $derived(Math.max(1, ...results.ranking.map((r) => r.points)));
  const active = $derived(results.participants.filter((p) => p.active).length);
</script>

<section class="card">
  <div class="mb-3 flex items-baseline justify-between gap-2">
    <h2 class="text-lg font-semibold">Classement</h2>
    <span class="text-sm text-slate-500">{active} / {results.participants.length} participant·e·s ont répondu</span>
  </div>
  {#if results.ranking.length === 0}
    <p class="text-slate-500">Aucune phrase.</p>
  {:else}
    <ol class="space-y-3">
      {#each results.ranking as r, i (r.id)}
        <li class="flex items-start gap-3">
          <span class="w-6 shrink-0 font-semibold text-indigo-600 dark:text-indigo-400">{i + 1}</span>
          <div class="min-w-0 flex-1">
            <p>{r.text}</p>
            <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div class="h-full rounded-full bg-indigo-500 transition-all duration-500" style="width: {(r.points / max) * 100}%"></div>
            </div>
            <p class="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
              <span>{r.points} pts</span>
              <span>rang moyen {r.avgRank ? r.avgRank.toFixed(1) : '—'}</span>
              <span class="text-emerald-600">👍 {r.likes}</span>
              <span class="font-bold text-rose-600">✕ {r.dislikes}</span>
            </p>
          </div>
        </li>
      {/each}
    </ol>
    <p class="mt-4 text-xs text-slate-500">
      Points : avec {phrases.length} phrases, la 1<sup>re</sup> place d'une personne vaut {Math.max(0, phrases.length - 1)} pts, la dernière 0.
      Seuls les participant·e·s qui ont commencé à répondre comptent.
    </p>
  {/if}
</section>
