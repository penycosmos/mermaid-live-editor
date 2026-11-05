<script lang="ts">
  import FloatingToolbar from '$/components/FloatingToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import { Separator } from '$/components/ui/separator';
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

<FloatingToolbar>
  <Button variant="ghost" size="icon" title="适应画布" onclick={() => panZoomState.reset()}>
    <ArrowsToCircleIcon />
  </Button>
  <Separator orientation="vertical" />
  <Button
    variant="ghost"
    size="icon"
    class={zoomClass}
    title="缩小"
    onclick={() => panZoomState.zoomOut()}>
    <MagnifyingGlassMinusIcon />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class={zoomClass}
    title="放大"
    onclick={() => panZoomState.zoomIn()}>
    <MagnifyingGlassPlusIcon />
  </Button>
  <Separator orientation="vertical" />
  <Button
    variant="ghost"
    size="sm"
    class="shrink-0 px-2"
    aria-label="缩放显示模式"
    aria-pressed={renderMode === 'smooth'}
    title={renderMode === 'crisp'
      ? '切换为流畅优先：缩放时文字可能暂时变软，停止后恢复清晰'
      : '切换为清晰优先：缩放过程中保持矢量清晰度'}
    onclick={() => {
      renderMode = renderMode === 'crisp' ? 'smooth' : 'crisp';
      panZoomState.setWheelRenderMode(renderMode);
    }}>
    {renderMode === 'crisp' ? '清晰优先' : '流畅优先'}
  </Button>
  {#if fullScreenHref}
    <Separator orientation="vertical" class={zoomClass} />
    <Button variant="ghost" size="icon" title="全屏查看" href={fullScreenHref} target="_blank">
      <ExpandIcon />
    </Button>
  {/if}
</FloatingToolbar>
