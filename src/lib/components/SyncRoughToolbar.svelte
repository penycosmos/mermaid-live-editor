<script lang="ts">
  import FloatingToolbar from '$/components/FloatingToolbar.svelte';
  import { Toggle } from '$/components/ui/toggle';
  import * as Tooltip from '$/components/ui/tooltip';
  import { defaultState, inputState, updateCodeStore } from '$/util/state.svelte';
  import RoughIcon from '~icons/material-symbols/draw-outline-rounded';
  import BackgroundIcon from '~icons/material-symbols/grid-4x4-rounded';

  if (inputState.grid === undefined) {
    // Handle cases where old states were saved without grid option
    updateCodeStore({ grid: defaultState.grid });
  }
</script>

<Tooltip.Provider delayDuration={200} disableHoverableContent>
  <FloatingToolbar>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Toggle
            {...props}
            bind:pressed={() => inputState.rough, (rough) => updateCodeStore({ rough })}
            size="sm"
            aria-label="手绘风格">
            <RoughIcon />
          </Toggle>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>手绘风格</Tooltip.Content>
    </Tooltip.Root>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Toggle
            {...props}
            bind:pressed={
              () => inputState.grid ?? defaultState.grid, (grid) => updateCodeStore({ grid })
            }
            size="sm"
            aria-label="背景网格">
            <BackgroundIcon />
          </Toggle>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>背景网格</Tooltip.Content>
    </Tooltip.Root>
  </FloatingToolbar>
</Tooltip.Provider>
