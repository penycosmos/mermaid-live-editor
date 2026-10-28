<script lang="ts">
  import View from '$/components/View.svelte';
  import { initHandler } from '$/util/util';
  import { validatedState } from '$/util/state.svelte';
  import { silentlySanitizeConfig } from '$/util/sanitize';
  import { isDarkTheme } from '$/util/embed';
  import { diagramColors } from '$/util/diagramThemes';
  import { onMount } from 'svelte';
  onMount(initHandler);
  const config = $derived(silentlySanitizeConfig(validatedState.current.mermaid));
  const background = $derived(
    config.themeVariables?.background ??
      diagramColors[isDarkTheme(config.theme ?? '') ? 'dark' : 'light'].background
  );
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="h-full" style:background-color={background}><View shouldShowGrid={false} /></div>
