<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="toolbar flex h-9 items-center justify-between gap-1">
  {@render children()}
</div>
