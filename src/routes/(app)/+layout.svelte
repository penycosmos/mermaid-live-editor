<script lang="ts">
  import { Toaster } from '$/components/ui/sonner';
  import { toggleDarkTheme } from '$/util/state.svelte';
  import { initHandler } from '$/util/util';
  import { mode, ModeWatcher } from 'mode-watcher';
  import { page } from '$app/state';
  import { onMount, type Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  onMount(() => {
    window.addEventListener('hashchange', initHandler);
    return () => window.removeEventListener('hashchange', initHandler);
  });
  $effect(() => toggleDarkTheme(mode.current === 'dark', page.route.id === '/(app)/edit'));
</script>

<ModeWatcher />
<Toaster />
<main class="h-dvh">{@render children()}</main>
