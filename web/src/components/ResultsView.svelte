<script>
  // Page « résultats » des participants : classement puis réponses de chacun.
  import Ranking from './Ranking.svelte';
  import ResponsesMatrix from './ResponsesMatrix.svelte';

  let { results, phrases, meId = null } = $props();
</script>

<div class="space-y-6">
  <Ranking {results} {phrases} />
  <ResponsesMatrix {results} {meId} />
</div>
