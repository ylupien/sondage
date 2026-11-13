<script>
  // Réponses de chaque personne en tableau croisé : une ligne par phrase, une colonne par personne.
  // Case = rang donné par la personne (plus foncé = plus prioritaire) + son j'aime / j'aime pas.
  // Clic sur un nom : lignes triées selon l'ordre de cette personne.
  let { results, meId = null } = $props();

  let sortBy = $state(null); // null = classement global, sinon id d'une personne

  const n = $derived(results.ranking.length);
  const people = $derived(
    [...results.participants].sort((a, b) => (b.id === meId) - (a.id === meId) || b.active - a.active),
  );
  const rankOf = $derived(
    Object.fromEntries(results.participants.map((p) => [p.id, Object.fromEntries(p.order.map((id, i) => [id, i + 1]))])),
  );
  const sorter = $derived(results.participants.find((p) => p.id === sortBy && p.active) || null);
  const rows = $derived(
    sorter
      ? [...results.ranking].sort((a, b) => rankOf[sorter.id][a.id] - rankOf[sorter.id][b.id])
      : results.ranking,
  );
  const overall = $derived(Object.fromEntries(results.ranking.map((r, i) => [r.id, i + 1])));

  // Rang 1 : indigo plein ; dernier rang : presque transparent
  const alpha = (rank) => (n <= 1 ? 1 : 1 - ((rank - 1) / (n - 1)) * 0.88);
  const toggle = (id) => (sortBy = sortBy === id ? null : id);
</script>

<section class="card">
  <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
    <h2 class="text-lg font-semibold">Réponses par participant·e</h2>
    <p class="text-xs text-slate-500">
      {#if sorter}
        Trié selon l'ordre de <strong>{sorter.name || 'Sans nom'}</strong> ·
        <button class="text-indigo-600 hover:underline" onclick={() => (sortBy = null)}>revenir au classement</button>
      {:else}
        Cliquez sur un nom pour trier selon son ordre.
      {/if}
    </p>
  </div>

  {#if results.participants.length === 0 || n === 0}
    <p class="text-slate-500">Pas encore de réponses.</p>
  {:else}
    <div class="-mx-4 overflow-x-auto px-4">
      <table class="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th class="sticky left-0 z-10 bg-white pb-2 pr-3 text-left text-xs font-medium text-slate-500 dark:bg-slate-900">Phrase</th>
            {#each people as person (person.id)}
              <th class="min-w-20 px-1 pb-2 text-center align-bottom font-medium">
                <button
                  class="w-full rounded-md px-1 py-1 hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-slate-800
                    {sortBy === person.id ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : ''}
                    {person.active ? '' : 'text-slate-400'}"
                  disabled={!person.active}
                  title={person.active ? `Trier selon l'ordre de ${person.name}` : "N'a pas encore répondu"}
                  onclick={() => toggle(person.id)}
                >
                  {person.name || 'Sans nom'}
                  {#if person.id === meId}<span class="block text-[10px] font-normal text-indigo-600">(vous)</span>{/if}
                  {#if !person.active}<span class="block text-[10px] font-normal">pas répondu</span>{/if}
                </button>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.id)}
            <tr class="group">
              <td class="sticky left-0 z-10 min-w-44 max-w-md shadow-[1px_0_0_0] shadow-slate-100 sm:shadow-none dark:shadow-slate-800 border-t border-slate-100 bg-white py-1.5 pr-3 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
                <div class="flex gap-2">
                  <span class="w-5 shrink-0 text-right text-xs font-semibold text-slate-400" title="Rang au classement global">{overall[r.id]}</span>
                  <span class="line-clamp-2" title={r.text}>{r.text}</span>
                </div>
              </td>
              {#each people as person (person.id)}
                {@const rank = rankOf[person.id][r.id]}
                {@const vote = person.votes[r.id]}
                <td class="border-t border-slate-100 px-1 py-1.5 text-center group-hover:bg-slate-50 dark:border-slate-800 dark:group-hover:bg-slate-800">
                  {#if person.active}
                    <div class="inline-flex items-center gap-1">
                      <span
                        class="inline-flex size-7 items-center justify-center rounded-md text-xs font-semibold {alpha(rank) > 0.5 ? 'text-white' : 'text-slate-700 dark:text-slate-200'}"
                        style="background-color: rgb(79 70 229 / {alpha(rank)})"
                        title="{person.name} : rang {rank} sur {n}"
                      >{rank}</span>
                      <span class="w-4 text-xs">
                        {#if vote === 'like'}<span title="J'aime">👍</span>{:else if vote === 'dislike'}<span class="font-bold text-rose-600" title="J'aime pas">✕</span>{/if}
                      </span>
                    </div>
                  {:else}
                    <span class="text-slate-300 dark:text-slate-700">—</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      <span class="inline-flex items-center gap-1">
        <span class="inline-block size-3 rounded-sm" style="background-color: rgb(79 70 229 / 1)"></span>
        1<sup>re</sup> priorité
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="inline-block size-3 rounded-sm" style="background-color: rgb(79 70 229 / 0.12)"></span>
        dernière
      </span>
      <span>👍 j'aime</span>
      <span><span class="font-bold text-rose-600">✕</span> j'aime pas</span>
    </p>
  {/if}
</section>
