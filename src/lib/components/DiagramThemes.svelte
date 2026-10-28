<script lang="ts">
  import { Button } from '$/components/ui/button';
  import {
    diagramColors,
    diagramThemes,
    softNodeColor,
    type DiagramMode,
    type DiagramThemeId
  } from '$/util/diagramThemes';
  import { inputState, selectDiagramTheme, themePreferences } from '$/util/state.svelte';
  import { notify } from '$/util/notify';
  import { addAutoEntry } from './History/historyState.svelte';
  import { mode, setMode } from 'mode-watcher';
  import { Check, Moon, Sun } from 'lucide-svelte';

  const modes = [
    { id: 'light', name: '亮色主题', icon: Sun },
    { id: 'dark', name: '暗色主题', icon: Moon }
  ] as const;
  const choose = (appearance: DiagramMode, id: DiagramThemeId) => {
    try {
      const previous = $state.snapshot(inputState);
      const firstSelection = !themePreferences.current.enabled;
      selectDiagramTheme(appearance, id);
      if (firstSelection) addAutoEntry(previous);
      setMode(appearance);
    } catch (error) {
      notify(error instanceof Error ? error.message : '主题切换失败');
    }
  };
</script>

<div class="h-full overflow-auto p-4">
  <p class="mb-5 text-xs leading-5 text-muted-foreground">
    亮暗主题分别记住。选择卡片立即预览，顶部按钮可随时切换。
  </p>
  <div class="space-y-6">
    {#each modes as appearance (appearance.id)}
      {@const colors = diagramColors[appearance.id]}
      <section aria-label={appearance.name}>
        <div class="mb-3 flex items-center gap-2 text-xs font-medium">
          <appearance.icon size={15} />
          <h3>{appearance.name}</h3>
          {#if mode.current === appearance.id}
            <span class="ml-auto rounded bg-accent/10 px-2 py-0.5 text-[10px] text-accent"
              >正在使用</span>
          {/if}
        </div>
        <div class="grid grid-cols-2 gap-2">
          {#each diagramThemes as theme (theme.id)}
            {@const selected = themePreferences.current[appearance.id] === theme.id}
            <Button
              variant="outline"
              class={[
                'h-auto min-w-0 flex-col items-stretch gap-0 overflow-hidden p-0 text-left whitespace-normal hover:bg-muted hover:text-foreground [&_.selection-check]:size-3 [&_.theme-preview]:h-auto [&_.theme-preview]:w-full',
                selected && 'border-accent ring-1 ring-accent/30'
              ]}
              aria-label={`${appearance.name}：${theme.name}`}
              aria-pressed={selected}
              onclick={() => choose(appearance.id, theme.id)}>
              <svg
                viewBox="0 0 160 80"
                class="theme-preview rounded-t-md"
                style:background={colors.background}
                aria-hidden="true">
                <path
                  d="M 48 27 H 108 V 56 H 81"
                  fill="none"
                  stroke={colors.text}
                  stroke-opacity="0.45" />
                <path d="m 85 53 -4 3 4 3" fill="none" stroke={colors.text} stroke-opacity="0.45" />
                {#each [0, 1, 2] as index (index)}
                  {@const x = index === 1 ? 108 : index === 2 ? 37 : 10}
                  {@const y = index === 2 ? 46 : 17}
                  <rect
                    {x}
                    {y}
                    width="42"
                    height="20"
                    rx="4"
                    fill={theme.id === 'soft'
                      ? softNodeColor(index + 1, appearance.id)
                      : appearance.id === 'dark'
                        ? '#26353E'
                        : '#FFFFFF'}
                    stroke={colors.text}
                    stroke-opacity="0.4" />
                  <path
                    d={`M ${x + 12} ${y + 10} h 18`}
                    stroke={colors.text}
                    stroke-opacity="0.65" />
                {/each}
                <rect x="65" y="20" width="22" height="13" rx="3" fill={colors.label} />
                <path d="M 71 26 h 10" stroke={colors.text} stroke-opacity="0.6" />
              </svg>
              <span class="flex items-center gap-1 px-2.5 pt-2 text-xs font-medium">
                {theme.name}{#if selected}<Check
                    size={12}
                    class="selection-check ml-auto text-accent" />{/if}
              </span>
              <span class="px-2.5 pt-1 pb-2.5 text-[10px] leading-4 text-muted-foreground"
                >{theme.description}</span>
            </Button>
          {/each}
        </div>
      </section>
    {/each}
  </div>
  <p class="mt-5 text-[11px] leading-5 text-muted-foreground">
    {#if !themePreferences.current.enabled}
      首次选择会将当前图表备份到本地历史，再替换原有配色与自定义 CSS。
    {:else}
      配色由主题面板管理，图表代码中指定的业务颜色会保留。
    {/if}
  </p>
</div>
