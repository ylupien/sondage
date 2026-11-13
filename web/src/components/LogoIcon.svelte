<script>
  // Logo Sondo (images/sondo-logo-choix-multiple.zip) : icône seule. L'application s'appelle « Sondage » (le nom est écrit à côté, dans AppHeader).
  let { class: klass = '' } = $props();
</script>

<span class="inline-flex items-center {klass}" aria-hidden="true">
  <svg viewBox="0 0 200 200" class="h-full w-auto" aria-hidden="true">
    <rect width="200" height="200" rx="56" fill="#6741D9"/>
    <g transform="translate(35 35) scale(1.0833)">
    <circle cx="32" cy="34" r="9" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="5"/>
    <rect x="50" y="29" width="46" height="10" rx="5" fill="#FFFFFF" fill-opacity="0.6"/>
    <circle cx="32" cy="60" r="12" fill="#FFFFFF"/>
    <circle cx="32" cy="60" r="5" fill="#6741D9"/>
    <rect x="50" y="54" width="54" height="12" rx="6" fill="#FFFFFF"/>
    <circle cx="32" cy="86" r="9" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="5"/>
    <rect x="50" y="81" width="36" height="10" rx="5" fill="#FFFFFF" fill-opacity="0.6"/>
    </g>
  </svg>
</span>
