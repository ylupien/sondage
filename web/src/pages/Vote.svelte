<script>
  import { onDestroy, onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { api } from '../lib/api.js';
  import { connect } from '../lib/socket.js';

  let { token } = $props();

  let pool = $state(null);
  let me = $state(null);
  let prefs = $state({ votes: {}, order: [] });
  let error = $state('');
  let online = $state(false);
  let saving = $state(0);
  let drag = $state(null); // glisser en cours : { id, from, to, dy, h, gap, rects, dropping }
  let settle = $state(false); // coupe les transitions le temps de poser l'ordre final
  let listEl;
  let socket;

  const byId = $derived(Object.fromEntries((pool?.phrases || []).map((p) => [p.id, p])));
  const rows = $derived(prefs.order.map((id) => byId[id]).filter(Boolean));

  onMount(async () => {
    try {
      const data = await api(`/api/vote/${token}`);
      pool = data.pool;
      me = data.me;
      prefs = data.prefs;
    } catch (err) {
      error = err.message;
      return;
    }
    socket = connect(token);
    socket.on('connect', () => (online = true));
    socket.on('disconnect', () => (online = false));
    socket.on('connect_error', (e) => { online = false; if (e.message === 'Non autorisé') error = 'Lien invalide ou retiré.'; });
    socket.on('pool', (p) => (pool = p));
    socket.on('prefs', (p) => { if (!drag) prefs = p; }); // mis à jour depuis un autre navigateur
  });
  onDestroy(() => { socket?.disconnect(); stopListening(); });

  function send(event, payload) {
    saving++;
    socket.timeout(8000).emit(event, payload, (err, res) => {
      saving--;
      if (err || res?.error) { error = res?.error || 'Connexion perdue : modification non enregistrée.'; return; }
      error = '';
      if (!drag) prefs = res.prefs;
    });
  }

  // Après un vote, la liste se range en trois blocs : j'aime en haut, sans avis au milieu, j'aime pas en bas.
  // Dans chaque bloc, l'ordre de priorité de la personne est conservé.
  function vote(id, value) {
    if (drag) return;
    const next = prefs.votes[id] === value ? null : value;
    const votes = { ...prefs.votes };
    if (next) votes[id] = next; else delete votes[id];
    const group = (x) => (votes[x] === 'like' ? 0 : votes[x] === 'dislike' ? 2 : 1);
    const order = [0, 1, 2].flatMap((g) => prefs.order.filter((x) => group(x) === g));
    const reordered = order.join() !== prefs.order.join();
    prefs = { ...prefs, votes, order };
    send('vote', { phraseId: id, value: next, ...(reordered ? { order } : {}) });
  }

  function move(from, to) {
    if (to < 0 || to >= prefs.order.length || from === to) return false;
    const order = [...prefs.order];
    const [id] = order.splice(from, 1);
    order.splice(to, 0, id);
    prefs = { ...prefs, order };
    return true;
  }


  // --- Glisser-déposer ---
  // À la souris : on saisit la phrase n'importe où (sauf les boutons). Au doigt : par la poignée ⠿,
  // pour que le reste de la carte continue de faire défiler la page.
  // La phrase suit le pointeur ; les autres glissent pour libérer la place ; au lâcher, elle se pose.
  const THRESHOLD = 4; // px avant de considérer que c'est un glisser (et pas un clic)
  const EDGE = 70; // zone près du bord de la fenêtre qui fait défiler la page
  const DROP_MS = 180;
  let pending = null; // pointeur enfoncé, glisser pas encore commencé
  let lastY = 0; // dernière position verticale du pointeur (clientY)
  let scrollRaf = 0;

  function pointerDown(e, index, id) {
    if (drag || e.button !== 0) return;
    const onHandle = e.target.closest('[data-handle]');
    if (e.target.closest('button') && !onHandle) return; // boutons j'aime / j'aime pas
    if (e.pointerType !== 'mouse' && !onHandle) return;
    if (e.pointerType === 'mouse') e.preventDefault(); // pas de sélection de texte
    pending = { id, from: index, startPageY: e.clientY + window.scrollY };
    lastY = e.clientY;
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    window.addEventListener('keydown', keyDown);
  }

  function begin() {
    const rects = [...listEl.children].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    const { from } = pending;
    const gap = rects.length > 1 ? rects[1].top - (rects[0].top + rects[0].height) : 8;
    drag = { id: pending.id, from, to: from, dy: 0, h: rects[from].height, gap, rects, dropping: false };
    document.body.style.cursor = 'grabbing';
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  function update() {
    const { from, h, rects } = drag;
    const dy = lastY + window.scrollY - pending.startPageY;
    const center = rects[from].top + h / 2 + dy;
    let to = from;
    for (let i = from + 1; i < rects.length; i++) if (center > rects[i].top + rects[i].height / 2) to = i;
    for (let i = from - 1; i >= 0; i--) if (center < rects[i].top + rects[i].height / 2) to = i;
    drag.dy = dy;
    drag.to = to;
  }

  function pointerMove(e) {
    if (!pending) return;
    lastY = e.clientY;
    if (!drag) {
      if (Math.abs(e.clientY + window.scrollY - pending.startPageY) < THRESHOLD) return;
      begin();
    }
    e.preventDefault();
    update();
  }

  // Défilement automatique quand on approche du haut ou du bas de la fenêtre
  function autoScroll() {
    if (!drag || drag.dropping) return;
    const speed = lastY < EDGE ? -(EDGE - lastY) : lastY > innerHeight - EDGE ? lastY - (innerHeight - EDGE) : 0;
    if (speed) {
      window.scrollBy(0, Math.round(speed / 4));
      update();
    }
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  function pointerUp() {
    stopListening();
    if (!drag) { pending = null; return; }
    drop();
  }

  function keyDown(e) {
    if (e.key !== 'Escape' || !drag) return;
    drag.to = drag.from; // annuler : retour à sa place
    stopListening();
    drop();
  }

  // Vote d'une phrase déposée à la position « to », d'après ses nouvelles voisines, pour garder les blocs
  // cohérents (j'aime en haut, sans avis au milieu, j'aime pas en bas) :
  //   au-dessus d'un j'aime → j'aime ; sous un j'aime pas → j'aime pas ;
  //   sortie de son bloc (j'aime sous une phrase qui n'est pas j'aime, j'aime pas au-dessus d'une phrase qui
  //   n'est pas j'aime pas) → sans avis ; sinon le vote ne change pas.
  function voteAt(id, from, to) {
    const others = prefs.order.filter((_, i) => i !== from);
    const above = prefs.votes[others[to - 1]] ?? null;
    const below = prefs.votes[others[to]] ?? null;
    const current = prefs.votes[id] ?? null;
    if (below === 'like') return 'like';
    if (above === 'dislike') return 'dislike';
    if (current === 'like' && to > 0 && above !== 'like') return null;
    if (current === 'dislike' && to < others.length && below !== 'dislike') return null;
    return current;
  }

  // Vote affiché pendant le glisser : celui que la phrase aura si on la lâche maintenant
  const shownVote = (id) => (drag?.id === id ? voteAt(id, drag.from, drag.to) : prefs.votes[id]);

  // Animation de dépose vers la place libérée, puis enregistrement du nouvel ordre (et du vote s'il change)
  function drop() {
    const { from, to, h, rects } = drag;
    drag.dropping = true;
    drag.dy = to > from ? rects[to].top + rects[to].height - (rects[from].top + h) : rects[to].top - rects[from].top;
    setTimeout(() => {
      settle = true;
      const id = drag.id;
      const before = prefs.votes[id] ?? null;
      const after = voteAt(id, from, to);
      const changed = move(from, to);
      if (after !== before) {
        const votes = { ...prefs.votes };
        if (after) votes[id] = after; else delete votes[id];
        prefs = { ...prefs, votes };
      }
      drag = null;
      pending = null;
      document.body.style.cursor = '';
      requestAnimationFrame(() => requestAnimationFrame(() => (settle = false)));
      if (after !== before) send('vote', { phraseId: id, value: after, order: prefs.order });
      else if (changed) send('order', prefs.order);
    }, DROP_MS);
  }

  function stopListening() {
    cancelAnimationFrame(scrollRaf);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
    window.removeEventListener('keydown', keyDown);
  }

  // Décalage vertical d'une ligne pendant le glisser
  function offset(i) {
    if (!drag) return 0;
    const { from, to, h, gap, dy } = drag;
    if (i === from) return dy;
    if (from < i && i <= to) return -(h + gap);
    if (to <= i && i < from) return h + gap;
    return 0;
  }

  // Rang affiché : celui que la phrase aura si on lâche maintenant
  function rankAt(i) {
    if (!drag) return i + 1;
    const { from, to } = drag;
    if (i === from) return to + 1;
    if (from < i && i <= to) return i;
    if (to <= i && i < from) return i + 2;
    return i + 1;
  }
</script>

<main class="mx-auto max-w-2xl p-4 sm:px-8 sm:py-6">
  {#if error && !pool}
    <div class="card text-center text-red-600">{error}</div>
  {:else if !pool}
    <p class="text-center text-slate-500">Chargement…</p>
  {:else}
    <header class="mb-6">
      <div class="flex items-center justify-between gap-2 text-sm text-slate-500">
        <span>Bonjour {me.name || ''}</span>
        <span class="flex items-center gap-2">
          <span class="inline-block size-2 rounded-full {online ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
          {online ? (saving ? 'Enregistrement…' : 'Enregistré') : 'Hors ligne'}
        </span>
      </div>
      <h1 class="mt-2 text-2xl font-semibold">{pool.title}</h1>
      {#if pool.description}<p class="mt-2 whitespace-pre-line text-slate-600 dark:text-slate-400">{pool.description}</p>{/if}
      <p class="mt-3 text-sm text-slate-500">
        Donnez votre avis sur chaque phrase, puis classez-les selon vos priorités : la 1<sup>re</sup> est votre favorite. Ce classement est le vôtre, chaque personne a le sien.
        Tout est enregistré automatiquement.
      </p>
      <a href="/v/{token}/resultats" class="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
        Voir les réponses des participants →
      </a>
    </header>

    {#if error}<p class="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>{/if}

    {#if rows.length === 0}
      <div class="card text-center text-slate-500">Aucune phrase pour le moment.</div>
    {/if}

    <ol class="space-y-2" bind:this={listEl}>
      {#each rows as phrase, i (phrase.id)}
        {@const v = shownVote(phrase.id)}
        {@const lifted = drag?.id === phrase.id}
        <li
          animate:flip={{ duration: (d) => Math.min(700, 250 + d * 0.6), easing: cubicOut }}
          onpointerdown={(e) => pointerDown(e, i, phrase.id)}
          style:transform={offset(i) ? `translateY(${offset(i)}px)${lifted && !drag.dropping ? ' scale(1.02)' : ''}` : null}
          style:transition={settle || (lifted && !drag.dropping) ? 'none' : `transform ${lifted ? DROP_MS : 200}ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms`}
          class="card relative flex items-center gap-3 p-3
            {drag ? '' : 'sm:cursor-grab'}
            {lifted ? 'z-20 shadow-xl ring-2 ring-indigo-500' : 'z-0'}"
        >
          <button
            data-handle
            class="cursor-grab touch-none select-none px-1 text-xl text-slate-400 active:cursor-grabbing"
            title="Glisser pour changer l'ordre"
            aria-label="Déplacer"
          >⠿</button>
          <span class="w-6 text-center font-semibold text-indigo-600 tabular-nums dark:text-indigo-400">{rankAt(i)}</span>
          <p class="flex-1 select-none">{phrase.text}</p>
          <div class="flex flex-col gap-1 sm:flex-row">
            <button
              class="btn px-2 py-1 text-xs {v === 'like' ? 'bg-emerald-600 text-white' : 'btn-ghost'}"
              aria-pressed={v === 'like'}
              onclick={() => vote(phrase.id, 'like')}
            >👍 J'aime</button>
            <button
              class="btn px-2 py-1 text-xs {v === 'dislike' ? 'bg-rose-600 text-white' : 'btn-ghost'}"
              aria-pressed={v === 'dislike'}
              onclick={() => vote(phrase.id, 'dislike')}
            ><span class="font-bold">✕</span> J'aime pas</button>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</main>
