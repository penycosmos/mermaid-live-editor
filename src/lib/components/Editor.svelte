<script lang="ts">
  import DesktopEditor from './DesktopEditor.svelte';
  import MobileEditor from './MobileEditor.svelte';
  import { TID } from '$/constants';
  import { updateCode, updateConfig, validatedState } from '$/util/state.svelte';

  const { isMobile } = $props<{ isMobile: boolean }>();
  const onUpdate = (text: string) => {
    if (validatedState.current.editorMode === 'code') updateCode(text);
    else updateConfig(text);
  };
</script>

<div class="flex h-full min-h-0 flex-col">
  {#if isMobile}<MobileEditor {onUpdate} />{:else}<DesktopEditor {onUpdate} />{/if}
  {#if validatedState.current.error}
    <div
      class="shrink-0 border-t border-destructive/20 bg-destructive/5 text-xs"
      data-testid={TID.errorContainer}>
      <p class="px-4 pt-3 font-semibold text-destructive">
        {validatedState.current.editorMode === 'config' ? '配置格式有误' : '图表语法有误'}
      </p>
      <output class="block max-h-36 overflow-auto p-4 pt-2" name="mermaid-error" for="editor"
        ><pre
          class="break-words whitespace-pre-wrap">{validatedState.current.error.toString()}</pre></output>
    </div>
  {/if}
</div>
