<script lang="ts">
  import FloatingToolbar from '$/components/FloatingToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import { Separator } from '$/components/ui/separator';
  import * as Tooltip from '$/components/ui/tooltip';
  import type { PanZoomState, WheelRenderMode } from '$/util/panZoom';
  import ExpandIcon from '~icons/material-symbols/open-in-full-rounded';
  import ArrowsToCircleIcon from '~icons/material-symbols/screenshot-frame-2';
  import MagnifyingGlassPlusIcon from '~icons/material-symbols/zoom-in';
  import MagnifyingGlassMinusIcon from '~icons/material-symbols/zoom-out';

  let {
    /** Embed/narrow frames: keep zoom buttons visible below the `sm` breakpoint. */
    compact = false,
    fullScreenHref,
    panZoomState
  }: {
    compact?: boolean;
    /** When set, shows a "全屏查看" button linking here. Omit for store-free embeds. */
    fullScreenHref?: string;
    panZoomState: PanZoomState;
  } = $props();

  const zoomClass = $derived(compact ? undefined : 'hidden sm:block');
  let renderMode: WheelRenderMode = $derived(panZoomState.wheelRenderMode);
</script>

<Tooltip.Provider delayDuration={200} disableHoverableContent>
  <FloatingToolbar>
    <Tooltip.Root>
      <Tooltip.Trigger onclick={() => panZoomState.reset()}>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon" aria-label="适应画布">
            <ArrowsToCircleIcon />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>适应画布</Tooltip.Content>
    </Tooltip.Root>
    <Separator orientation="vertical" />
    <Tooltip.Root>
      <Tooltip.Trigger onclick={() => panZoomState.zoomOut()}>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon" class={zoomClass} aria-label="缩小">
            <MagnifyingGlassMinusIcon />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>缩小</Tooltip.Content>
    </Tooltip.Root>
    <Tooltip.Root>
      <Tooltip.Trigger onclick={() => panZoomState.zoomIn()}>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon" class={zoomClass} aria-label="放大">
            <MagnifyingGlassPlusIcon />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>放大</Tooltip.Content>
    </Tooltip.Root>
    <Separator orientation="vertical" />
    <Tooltip.Root>
      <Tooltip.Trigger
        onclick={() => {
          renderMode = renderMode === 'crisp' ? 'smooth' : 'crisp';
          panZoomState.setWheelRenderMode(renderMode);
        }}>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="sm"
            class="shrink-0 px-2"
            aria-label="缩放显示模式"
            aria-pressed={renderMode === 'smooth'}>
            {renderMode === 'crisp' ? '清晰优先' : '流畅优先'}
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content class="max-w-72">
        {renderMode === 'crisp'
          ? '切换为流畅优先：缩放时文字可能暂时变软，停止后恢复清晰'
          : '切换为清晰优先：缩放过程中保持矢量清晰度'}
      </Tooltip.Content>
    </Tooltip.Root>
    {#if fullScreenHref}
      <Separator orientation="vertical" class={zoomClass} />
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              aria-label="全屏查看"
              href={fullScreenHref}
              target="_blank">
              <ExpandIcon />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>全屏查看</Tooltip.Content>
      </Tooltip.Root>
    {/if}
  </FloatingToolbar>
</Tooltip.Provider>
