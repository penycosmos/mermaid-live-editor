<script lang="ts">
  import Actions from '$/components/Actions.svelte';
  import Editor from '$/components/Editor.svelte';
  import History from '$/components/History/History.svelte';
  import { addAutoEntry, startAutoSave } from '$/components/History/historyState.svelte';
  import Preset from '$/components/Preset.svelte';
  import Share from '$/components/Share.svelte';
  import ThemeIcon from '$/components/ThemeIcon.svelte';
  import View from '$/components/View.svelte';
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import SyncRoughToolbar from '$/components/SyncRoughToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import * as Resizable from '$/components/ui/resizable';
  import { DIAGRAM_LABELS, TID } from '$/constants';
  import { PanZoomState } from '$/util/panZoom';
  import {
    defaultState,
    getCodeRevision,
    inputState,
    replaceInputState,
    updateCode,
    updateCodeStore,
    urls,
    validatedState
  } from '$/util/state.svelte';
  import { initHandler } from '$/util/util';
  import { notify } from '$/util/notify';
  import { mode, setMode } from 'mode-watcher';
  import { onDestroy, onMount } from 'svelte';
  import {
    Code2,
    LayoutTemplate,
    History as HistoryIcon,
    FolderOpen,
    FilePlus2,
    Save,
    X,
    Workflow,
    Check,
    AlertCircle
  } from 'lucide-svelte';

  type Panel = 'code' | 'templates' | 'history';
  let panel = $state<Panel | null>(null);
  let editorOpened = $state(false);
  $effect(() => {
    if (panel === 'code') editorOpened = true;
  });
  let width = $state(1200);
  let isMobile = $derived(width < 768);
  let fileInput: HTMLInputElement;
  let fileReadId = 0;
  let fileName = $state('未命名图表.mmd');
  const panZoomState = new PanZoomState();
  const panels = [
    { id: 'code', label: '代码', icon: Code2 },
    { id: 'templates', label: '模板', icon: LayoutTemplate },
    { id: 'history', label: '历史', icon: HistoryIcon }
  ] as const;
  const titles = { code: '代码编辑', templates: '图表模板', history: '本地历史' };

  const backup = () => addAutoEntry($state.snapshot(inputState));
  const newDiagram = () => {
    backup();
    replaceInputState({ ...defaultState });
    fileName = '未命名图表.mmd';
    panel = 'code';
  };
  const openFile = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const readId = ++fileReadId;
    const revision = getCodeRevision();
    try {
      if (!/\.mmd$/i.test(file.name)) throw new Error('请选择 .mmd 源码文件');
      const code = await file.text();
      if (readId !== fileReadId || revision !== getCodeRevision()) return;
      backup();
      updateCode(code, { resetPanZoom: true, updateDiagram: true });
      fileName = file.name;
      panel = 'code';
    } catch (error) {
      if (readId === fileReadId && revision === getCodeRevision())
        notify(error instanceof Error ? error.message : '读取文件失败，当前图表已保留');
    } finally {
      if (readId === fileReadId) fileInput.value = '';
    }
  };
  const saveSource = () => {
    const url = URL.createObjectURL(
      new Blob([inputState.code], { type: 'text/plain;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  onMount(initHandler);
  onMount(() => startAutoSave());
  onDestroy(() => fileReadId++);
</script>

<svelte:window bind:innerWidth={width} />

<div class="workspace flex h-full flex-col overflow-hidden">
  <header
    class="workspace-header flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-3 sm:px-5">
    <div class="flex min-w-0 items-center gap-3">
      <span
        class="brand-mark flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
        ><Workflow size={19} strokeWidth={1.8} /></span>
      <div class="min-w-0">
        <h1 class="sr-only text-sm font-semibold tracking-tight sm:not-sr-only">
          Mermaid <span class="hidden sm:inline">离线编辑器</span>
        </h1>
        <p class="hidden truncate text-[11px] text-muted-foreground sm:block">{fileName}</p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-1 sm:gap-2">
      <Button variant="ghost" size="sm" onclick={newDiagram} title="新建图表" aria-label="新建图表"
        ><FilePlus2 /><span class="hidden lg:inline">新建</span></Button>
      <Button
        variant="ghost"
        size="sm"
        onclick={() => fileInput.click()}
        title="打开 .mmd 文件"
        aria-label="打开文件"><FolderOpen /><span class="hidden sm:inline">打开</span></Button>
      <Button
        variant="ghost"
        size="sm"
        onclick={saveSource}
        title="保存源码 .mmd"
        aria-label="保存源码"><Save /><span class="hidden sm:inline">保存源码</span></Button>
      <span class="mx-1 h-5 w-px bg-border"></span>
      <Share />
      <Button
        variant="ghost"
        size="icon"
        data-testid={TID.themeToggleButton}
        title="切换为{mode.current === 'dark' ? '浅色' : '深色'}主题"
        onclick={() => setMode(mode.current === 'dark' ? 'light' : 'dark')}><ThemeIcon /></Button>
      <Actions />
    </div>
    <input
      class="hidden"
      type="file"
      accept=".mmd"
      bind:this={fileInput}
      onchange={openFile}
      data-testid="source-file-input"
      aria-label="打开 Mermaid 源码" />
  </header>

  <div class="flex min-h-0 flex-1">
    <nav
      aria-label="工作区工具"
      class="tool-rail flex w-14 shrink-0 flex-col items-center gap-2 border-r bg-card py-4">
      {#each panels as item (item.id)}
        <button
          class={[
            'rail-button flex w-11 flex-col items-center gap-1 rounded-lg py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            panel === item.id && 'active'
          ]}
          aria-label={titles[item.id]}
          aria-pressed={panel === item.id}
          title={titles[item.id]}
          onclick={() => (panel = panel === item.id ? null : item.id)}>
          <item.icon size={19} strokeWidth={1.65} /><span class="text-[10px] font-medium"
            >{item.label}</span>
        </button>
      {/each}
      <span class="mt-auto text-[10px] text-muted-foreground [writing-mode:vertical-rl]"
        >本机 · 离线</span>
    </nav>
    <div class="relative min-w-0 flex-1">
      {#if isMobile}
        {@render canvas()}
        {#if panel || editorOpened}
          <aside
            id="workspace-panel"
            class="absolute inset-0 z-20 flex flex-col bg-card"
            style={panel ? undefined : 'display: none'}>
            {@render panelContent()}
          </aside>
        {/if}
      {:else}
        <Resizable.PaneGroup direction="horizontal" class="h-full">
          {#if panel || editorOpened}
            <Resizable.Pane
              order={0}
              defaultSize={30}
              minSize={22}
              maxSize={55}
              class="min-w-0 bg-card"
              style={panel ? undefined : 'display: none'}>
              <aside id="workspace-panel" class="flex h-full min-h-0 flex-col">
                {@render panelContent()}
              </aside>
            </Resizable.Pane>
            <Resizable.Handle
              aria-label="调整侧栏宽度"
              class="z-20 w-px bg-border after:w-3 hover:bg-accent"
              style={panel ? undefined : 'display: none'} />
          {/if}
          <Resizable.Pane order={1} minSize={35} class="min-w-0">{@render canvas()}</Resizable.Pane>
        </Resizable.PaneGroup>
      {/if}
    </div>
  </div>
  <footer
    class="flex h-7 shrink-0 items-center justify-between border-t bg-card px-4 text-[10px] text-muted-foreground">
    <button
      class="flex items-center gap-1.5 hover:text-foreground"
      onclick={() => (panel = 'code')}
      aria-label={validatedState.current.error ? '查看图表错误' : '查看图表代码'}>
      {#if validatedState.current.error}<AlertCircle
          size={12}
          class="text-destructive" />图表有误，查看详情{:else}<Check
          size={12}
          class="text-accent" />语法通过{/if}
    </button>
    <span class="hidden sm:inline"
      >{DIAGRAM_LABELS[validatedState.current.diagramType ?? ''] ?? 'Mermaid 图表'}<span
        class="mx-2 opacity-40">/</span
      >数据仅保存在本机</span>
    <span>{inputState.code.split('\n').length} 行</span>
  </footer>
</div>

{#snippet panelContent()}
  <div class="flex h-12 shrink-0 items-center justify-between border-b px-4">
    <h2 class="text-xs font-semibold tracking-wide">{panel ? titles[panel] : ''}</h2>
    <Button variant="ghost" size="icon" title="收起侧栏" onclick={() => (panel = null)}
      ><X size={16} /></Button>
  </div>
  <div class="min-h-0 flex-1">
    {#if editorOpened}
      <div
        class="flex h-full min-h-0 flex-col"
        style={panel === 'code' ? undefined : 'display: none'}>
        <div
          role="tablist"
          aria-label="编辑内容"
          class="flex h-11 shrink-0 items-center gap-1 border-b px-3">
          {#each [['code', '图表代码'], ['config', '渲染配置']] as [id, label] (id)}
            <button
              role="tab"
              aria-selected={validatedState.current.editorMode === id}
              class={[
                'editor-tab rounded-md px-3 py-1.5 text-xs',
                validatedState.current.editorMode === id && 'active'
              ]}
              onclick={() => updateCodeStore({ editorMode: id as 'code' | 'config' })}
              >{label}</button>
          {/each}
        </div>
        <div class="min-h-0 flex-1 pt-3"><Editor {isMobile} /></div>
      </div>
    {/if}
    {#if panel === 'templates'}
      <Preset />
    {:else if panel === 'history'}
      <History />
    {/if}
  </div>
{/snippet}

{#snippet canvas()}
  <div class="canvas-shell relative h-full overflow-hidden">
    <div class="h-full px-3 pt-4 pb-20">
      <View {panZoomState} shouldShowGrid={validatedState.current.grid} />
    </div>
    <div class="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-2">
      <div
        class="canvas-dock pointer-events-auto flex items-center rounded-xl border bg-card/95 p-1 shadow-sm backdrop-blur-sm">
        <PanZoomToolbar {panZoomState} fullScreenHref={urls.current.view} compact />
        <span class="mx-1 h-5 w-px bg-border"></span>
        <SyncRoughToolbar />
      </div>
    </div>
  </div>
{/snippet}
