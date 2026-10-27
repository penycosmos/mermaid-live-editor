<script lang="ts">
  import { getSampleDiagrams, type SampleExample } from '$/util/mermaid';
  import { updateCode, inputState } from '$/util/state.svelte';
  import { addAutoEntry } from './History/historyState.svelte';
  import { ChevronRight } from 'lucide-svelte';

  const extras: Record<string, SampleExample[]> = {
    ZenUML: [
      {
        title: 'Order Service',
        isDefault: true,
        code: `zenuml
    title Order Service
    @Actor Client #FFEBE6
    @Boundary OrderController #0747A6
    @EC2 <<BFF>> OrderService #E3FCEF
    group BusinessService {
      @Lambda PurchaseService
      @AzureFunction InvoiceService
    }

    @Starter(Client)
    // \`POST /orders\`
    OrderController.post(payload) {
      OrderService.create(payload) {
        order = new Order(payload)
        if(order != null) {
          par {
            PurchaseService.createPO(order)
            InvoiceService.createInvoice(order)
          }
        }
      }
    }
    `
      }
    ]
  };

  const samples = { ...getSampleDiagrams(), ...extras };
  const labels: Record<string, string> = {
    Architecture: '架构图',
    Block: '块图',
    C4: 'C4 架构',
    Class: '类图',
    'Cynefin Framework': 'Cynefin 框架',
    'Entity Relationship': '实体关系图',
    'Event Modeling': '事件建模',
    Flowchart: '流程图',
    Gantt: '甘特图',
    Git: 'Git 分支图',
    Ishikawa: '鱼骨图',
    Journey: '用户旅程',
    Kanban: '看板',
    Mindmap: '思维导图',
    Packet: '数据包',
    Pie: '饼图',
    Quadrant: '象限图',
    Radar: '雷达图',
    'Railroad (ABNF)': '语法图 · ABNF',
    'Railroad (EBNF)': '语法图 · EBNF',
    'Railroad (IR)': '语法图 · IR',
    'Railroad (PEG)': '语法图 · PEG',
    Requirement: '需求图',
    Sankey: '桑基图',
    Sequence: '时序图',
    State: '状态图',
    Timeline: '时间线',
    TreeView: '树形图',
    Treemap: '矩形树图',
    'Use Case': '用例图',
    'User Journey': '用户旅程',
    Venn: '韦恩图',
    'Wardley Maps': 'Wardley 地图',
    XY: 'XY 图表',
    ZenUML: 'ZenUML'
  };
  const mainDiagrams = [
    'Flowchart',
    'Class',
    'Sequence',
    'Entity Relationship',
    'State',
    'Mindmap'
  ];
  const order = [
    ...mainDiagrams,
    ...Object.keys(samples)
      .filter((name) => !mainDiagrams.includes(name))
      .sort()
  ];
  const load = (example: SampleExample) => {
    addAutoEntry($state.snapshot(inputState));
    updateCode(example.code, { resetPanZoom: true, updateDiagram: true });
  };
</script>

<div class="h-full overflow-auto p-4">
  <p class="mb-4 text-xs leading-5 text-muted-foreground">
    选择一种图表开始。当前内容会先保存到本地历史。
  </p>
  <div class="flex flex-col gap-1">
    {#each order as name, index (name)}
      {#if index === 0 || index === mainDiagrams.length}<h3
          class="mb-1 px-2 pt-3 text-[10px] font-semibold tracking-wide text-muted-foreground">
          {index === 0 ? '常用图表' : '更多类型'}
        </h3>{/if}
      <div class="group flex items-center rounded-lg hover:bg-muted">
        <button
          class="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5 text-left text-xs"
          onclick={() => load(samples[name][0])}
          title={name}>
          <span>{labels[name] ?? name}</span><ChevronRight
            size={14}
            class="text-muted-foreground opacity-40" />
        </button>
        {#if samples[name].length > 1}
          <select
            aria-label="{labels[name] ?? name}示例"
            class="mr-2 max-w-24 rounded border bg-card p-1 text-[10px] text-muted-foreground"
            value=""
            onchange={(event) => {
              load(samples[name][Number(event.currentTarget.value)]);
              event.currentTarget.value = '';
            }}>
            <option value="" disabled>更多示例</option>
            {#each samples[name] as example, i (example.title)}<option value={i}
                >示例 {i + 1}</option
              >{/each}
          </select>
        {/if}
      </div>
    {/each}
  </div>
</div>
