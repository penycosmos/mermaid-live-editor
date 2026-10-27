<script lang="ts">
  import { Button, buttonVariants } from '$/components/ui/button';
  import * as Dialog from '$/components/ui/dialog';
  import { Input } from '$/components/ui/input';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import { TID } from '$/constants';
  import { waitForRender } from '$/util/autoSync';
  import { prepareExportSvg } from '$/util/exportSvg';
  import { inputState, updateCodeStore, validatedState } from '$/util/state.svelte';
  import { notify } from '$/util/notify';
  import { toBase64 } from 'js-base64';
  import dayjs from 'dayjs';
  import { Download, Copy, Image as ImageIcon, FileImage } from 'lucide-svelte';

  let imageSizeMode = $state<'auto' | 'width' | 'height'>('auto');
  let imageSize = $state(1080);
  let exporting = $state(false);

  const download = (extension: string, href: string) => {
    const link = document.createElement('a');
    link.download = `mermaid-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;
    link.href = href;
    link.click();
  };

  const exportDiagram = async (format: 'png' | 'svg' | 'clipboard') => {
    if (exporting) return;
    if (
      imageSizeMode !== 'auto' &&
      (!Number.isFinite(imageSize) || imageSize < 3 || imageSize > 10000)
    ) {
      notify('图片尺寸须为 3 至 10000 像素');
      return;
    }
    const panZoom = inputState.panZoom;
    exporting = true;
    try {
      updateCodeStore({ panZoom: false });
      // State validation is asynchronous; allow the new viewport to reach the render queue.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await waitForRender();
      const source = document.querySelector<SVGSVGElement>('#container svg');
      if (!source) throw new Error('没有可导出的图表');
      const svg = await prepareExportSvg(source, inputState.rough);
      const box = source.getBoundingClientRect();
      const viewBox = source.viewBox.baseVal;
      const width = viewBox.width || box.width;
      const height = viewBox.height || box.height;
      const canvas = document.createElement('canvas');
      canvas.width =
        imageSizeMode === 'width'
          ? imageSize
          : imageSizeMode === 'height'
            ? (imageSize * width) / height
            : width * 2;
      canvas.height =
        imageSizeMode === 'height'
          ? imageSize
          : imageSizeMode === 'width'
            ? (imageSize * height) / width
            : height * 2;
      svg.setAttribute('width', String(canvas.width));
      svg.setAttribute('height', String(canvas.height));
      const data = `data:image/svg+xml;base64,${toBase64(new XMLSerializer().serializeToString(svg))}`;
      if (format === 'svg') {
        download('svg', data);
        return;
      }
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('图表转换失败，请检查图表中的本地资源'));
        image.src = data;
      });
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建图片画布');
      context.fillStyle = getComputedStyle(document.body).getPropertyValue('--background');
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (format === 'png') download('png', canvas.toDataURL('image/png'));
      else {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('无法生成图片'))))
        );
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        notify('图片已复制');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '导出失败');
    } finally {
      updateCodeStore({ panZoom });
      exporting = false;
    }
  };
</script>

<Dialog.Root>
  <Dialog.Trigger class={buttonVariants({ variant: 'accent', size: 'sm' })}
    ><Download /><span>导出</span></Dialog.Trigger>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header
      ><Dialog.Title>导出图表</Dialog.Title><Dialog.Description
        >在本机生成图片，字体与图标随文件保存。</Dialog.Description
      ></Dialog.Header>
    <div class="flex flex-col gap-5 py-2">
      <div class="flex flex-col gap-3">
        <span class="text-xs font-medium">图片尺寸</span>
        <ToggleGroup.Root
          type="single"
          variant="outline"
          value={imageSizeMode}
          onValueChange={(value) => {
            if (value === 'auto' || value === 'width' || value === 'height') imageSizeMode = value;
          }}>
          <ToggleGroup.Item value="auto">自动</ToggleGroup.Item><ToggleGroup.Item value="width"
            >指定宽度</ToggleGroup.Item
          ><ToggleGroup.Item value="height">指定高度</ToggleGroup.Item>
        </ToggleGroup.Root>
        {#if imageSizeMode !== 'auto'}<label class="flex items-center gap-3 text-xs"
            ><Input
              type="number"
              min="3"
              max="10000"
              bind:value={imageSize}
              aria-label="导出尺寸" />像素</label
          >{/if}
      </div>
      <div class="grid grid-cols-2 gap-3">
        <Button
          onclick={() => exportDiagram('png')}
          disabled={exporting || !!validatedState.current.error}
          data-testid={TID.downloadPNG}><ImageIcon />保存 PNG</Button>
        <Button
          onclick={() => exportDiagram('svg')}
          disabled={exporting || !!validatedState.current.error}
          data-testid={TID.downloadSVG}><FileImage />保存 SVG</Button>
      </div>
      {#if typeof ClipboardItem !== 'undefined'}<Button
          variant="outline"
          onclick={() => exportDiagram('clipboard')}
          disabled={exporting || !!validatedState.current.error}><Copy />复制图片</Button
        >{/if}
      {#if exporting}<p role="status" class="text-center text-xs text-muted-foreground">
          正在生成图片…
        </p>{/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
