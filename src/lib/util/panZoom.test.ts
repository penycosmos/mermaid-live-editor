import panzoom from 'svg-pan-zoom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanZoomState } from './panZoom';

vi.mock('svg-pan-zoom', () => ({ default: vi.fn() }));

// Model the library's synchronous viewport cache and one deferred SVG commit per frame.
const createPanZoom = (options: SvgPanZoom.Options = {}) => {
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let pending = false;
  const commit = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      options.onUpdatedCTM?.({} as SVGMatrix);
    });
  };
  const instance = {
    destroy: vi.fn(),
    disableDblClickZoom: vi.fn(),
    disablePan: vi.fn(),
    disableZoom: vi.fn(),
    enablePan: vi.fn(),
    enableZoom: vi.fn(),
    getPan: () => ({ ...pan }),
    getSizes: () => ({ width: 800, height: 600 }),
    getZoom: () => zoom,
    pan: (point: SvgPanZoom.Point) => {
      pan = point;
      options.onPan?.(pan);
      commit();
    },
    panBy: (point: SvgPanZoom.Point) => instance.pan({ x: pan.x + point.x, y: pan.y + point.y }),
    reset: () => {
      instance.zoom(1);
      instance.pan({ x: 0, y: 0 });
    },
    resize: vi.fn(),
    zoom: (value: number) => {
      zoom = value;
      options.onZoom?.(zoom);
      commit();
    },
    zoomAtPoint: vi.fn((value: number, point: SvgPanZoom.Point) => {
      const ratio = value / zoom;
      instance.zoom(value);
      instance.pan({
        x: point.x - (point.x - pan.x) * ratio,
        y: point.y - (point.y - pan.y) * ratio
      });
    }),
    zoomIn: () => instance.zoom(zoom * 1.1),
    zoomOut: () => instance.zoom(zoom / 1.1)
  };
  return instance;
};

let state: PanZoomState;
let container: HTMLDivElement;
let svg: SVGSVGElement;
let instance: ReturnType<typeof createPanZoom>;
let now: number;
let frameId: number;
let frames: Map<number, FrameRequestCallback>;
let reducedMotion: boolean;

const frame = (elapsed = 1000 / 60) => {
  now += elapsed;
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(now);
};

const settle = () => {
  for (let i = 0; i < 20 && frames.size; i++) frame();
  expect(frames.size).toBe(0);
};

const wheel = (deltaY = -100, deltaMode = 0) => {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: 300,
    clientY: 250,
    deltaMode,
    deltaY
  });
  svg.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  now = 0;
  frameId = 0;
  frames = new Map();
  reducedMotion = false;
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    }
  );
  vi.mocked(panzoom).mockImplementation((_element, options) => {
    instance = createPanZoom(options);
    return instance as unknown as SvgPanZoom.Instance;
  });
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  Object.assign(svg, {
    getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => {
      const point = {
        x: 0,
        y: 0,
        matrixTransform: () => ({ x: (point.x - 100) / 2, y: (point.y - 50) / 2 })
      };
      return point;
    }
  });
  container = document.createElement('div');
  container.append(svg);
  document.body.append(container);
  state = new PanZoomState();
  state.updateElement(svg, { pan: { x: 0, y: 0 }, zoom: 1 });
  frame();
});

afterEach(() => {
  state.destroy();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('viewport notifications', () => {
  it('publishes the latest pan and zoom only once per SVG commit', () => {
    const changed = vi.fn();
    state.onPanZoomChange = changed;
    for (let i = 1; i <= 10; i++) instance.zoomAtPoint(i, { x: 100, y: 80 });
    expect(changed).not.toHaveBeenCalled();
    frame();
    expect(changed).toHaveBeenCalledExactlyOnceWith({ x: -900, y: -720 }, 10);
  });

  it('discards queued viewport writes when content is replaced', () => {
    const changed = vi.fn();
    state.onPanZoomChange = changed;
    state.zoomIn();
    state.cancelPendingChanges();
    frame();
    expect(changed).not.toHaveBeenCalled();
    state.zoomOut();
    frame();
    expect(changed).toHaveBeenCalledOnce();
  });

  it('ignores old SVG callbacks after replacement and destroy', () => {
    const changed = vi.fn();
    state.onPanZoomChange = changed;
    const old = instance;
    state.zoomIn();
    state.updateElement(svg, { pan: { x: 20, y: 30 }, zoom: 2 });
    frame();
    expect(old.destroy).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledExactlyOnceWith({ x: 20, y: 30 }, 2);
    changed.mockClear();
    state.zoomIn();
    state.destroy();
    state.destroy();
    frame();
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not attach a controller to a detached SVG', () => {
    state.destroy();
    svg.remove();
    vi.mocked(panzoom).mockClear();
    state.updateElement(svg, {});
    expect(panzoom).not.toHaveBeenCalled();
  });
});

describe('wheel zoom', () => {
  it.each([8, 16, 100])('accumulates the same zoom with inputs %ims apart', (interval) => {
    for (let i = 0; i < 5; i++) {
      expect(wheel().defaultPrevented).toBe(true);
      frame(interval);
    }
    settle();
    expect(instance.getZoom()).toBeCloseTo(1.2 ** 5, 10);
  });

  it.each([
    [100, 0],
    [3, 1],
    [1, 2]
  ])('normalizes delta %i in mode %i', (delta, mode) => {
    wheel(-delta, mode);
    settle();
    expect(instance.getZoom()).toBeCloseTo(1.2, 10);
    expect(instance.zoomAtPoint).toHaveBeenLastCalledWith(1.2, { x: 100, y: 100 });
    wheel(delta, mode);
    settle();
    expect(instance.getZoom()).toBeCloseTo(1, 10);
  });

  it.each([60, 120])('finishes in 100ms at %iHz without a jump to the target', (hz) => {
    wheel();
    frame(1000 / hz);
    expect(instance.getZoom()).toBeGreaterThan(1);
    expect(instance.getZoom()).toBeLessThan(1.2);
    for (let i = 1; i < hz / 10 + 1; i++) frame(1000 / hz);
    expect(instance.getZoom()).toBeCloseTo(1.2, 10);
    settle();
  });

  it('reverses from the current view instead of chasing the old target', () => {
    wheel(-300);
    frame(20);
    const current = instance.getZoom();
    wheel(100);
    frame(20);
    expect(instance.getZoom()).toBeLessThan(current);
    settle();
    expect(instance.getZoom()).toBeCloseTo(current / 1.2, 10);
  });

  it('clamps accumulated targets at both zoom limits', () => {
    wheel(-100_000);
    settle();
    expect(instance.getZoom()).toBe(12);
    wheel(100_000);
    settle();
    expect(instance.getZoom()).toBe(0.2);
  });

  it('ignores zero, horizontal-only, invalid and disabled inputs', () => {
    expect(wheel(0).defaultPrevented).toBe(false);
    const horizontal = new WheelEvent('wheel', { deltaX: 100 });
    svg.dispatchEvent(horizontal);
    const invalid = new WheelEvent('wheel');
    Object.defineProperty(invalid, 'deltaY', { value: Number.NaN });
    svg.dispatchEvent(invalid);
    wheel(-100, 3);
    state.isPanEnabled = false;
    expect(wheel().defaultPrevented).toBe(false);
    expect(frames.size).toBe(0);
    expect(instance.getZoom()).toBe(1);
  });

  it('applies the same target immediately for reduced motion', () => {
    reducedMotion = true;
    wheel();
    expect(instance.getZoom()).toBe(1.2);
    settle();
    expect(instance.zoomAtPoint).toHaveBeenCalledOnce();
  });

  it.each(['pointerdown', 'zoomIn', 'zoomOut', 'reset', 'resize', 'restore', 'replace', 'destroy'])(
    'cancels animation on %s',
    (action) => {
      wheel(-300);
      frame(20);
      if (action === 'pointerdown') svg.dispatchEvent(new Event('pointerdown'));
      else if (action === 'restore') state.restorePanZoom({ x: 10, y: 20 }, 2);
      else if (action === 'replace') state.cancelPendingChanges();
      else state[action as 'zoomIn' | 'zoomOut' | 'reset' | 'resize' | 'destroy']();
      const current = instance.getZoom();
      settle();
      expect(instance.getZoom()).toBe(current);
    }
  );

  it('does not write pending animated views after cancellation or handle wheels after destroy', () => {
    const changed = vi.fn();
    state.onPanZoomChange = changed;
    wheel();
    frame(20);
    state.cancelPendingChanges();
    settle();
    expect(changed).not.toHaveBeenCalled();
    state.destroy();
    expect(wheel().defaultPrevented).toBe(false);
    expect(frames.size).toBe(0);
  });
});

describe('smooth wheel rendering', () => {
  it('animates the visible camera without updating SVG geometry every frame', () => {
    const changed = vi.fn();
    const readMatrix = vi.spyOn(svg, 'getScreenCTM');
    state.onPanZoomChange = changed;
    state.setWheelRenderMode('smooth');
    wheel();
    frame(20);
    frame(20);
    expect(instance.zoomAtPoint).not.toHaveBeenCalled();
    expect(instance.getZoom()).toBe(1);
    expect(svg.style.transform).toContain('matrix3d(');
    expect(svg.style.willChange).toBe('transform');
    expect(readMatrix).toHaveBeenCalledOnce();
    const [pan, zoom] = changed.mock.lastCall ?? [];
    expect(zoom).toBeGreaterThan(1);
    expect(zoom).toBeLessThan(1.2);
    expect(pan.x).toBeCloseTo(100 * (1 - zoom), 8);
    expect(pan.y).toBeCloseTo(100 * (1 - zoom), 8);
    settle();
    expect(instance.getZoom()).toBeCloseTo(1.2, 10);
    expect(instance.getPan()).toEqual({ x: expect.closeTo(-20, 8), y: expect.closeTo(-20, 8) });
    expect(svg.style.transform).toBe('');
    expect(svg.style.willChange).toBe('');
  });

  it('hands the visible camera to the next mode without jumping to the wheel target', () => {
    const changed = vi.fn();
    state.onPanZoomChange = changed;
    state.setWheelRenderMode('smooth');
    wheel(-300);
    frame(20);
    const [pan, zoom] = changed.mock.lastCall ?? [];
    state.setWheelRenderMode('crisp');
    settle();
    expect(instance.getZoom()).toBe(zoom);
    expect(instance.getPan()).toEqual(pan);
    expect(svg.style.transform).toBe('');
    expect(state.wheelRenderMode).toBe('crisp');
  });

  it.each([60, 120])('retargets and reverses from the visible camera at %iHz', (hz) => {
    const changed = vi.fn();
    state.onPanZoomChange = changed;
    state.setWheelRenderMode('smooth');
    wheel();
    frame(1000 / hz);
    wheel();
    settle();
    expect(instance.getZoom()).toBeCloseTo(1.44, 10);
    wheel(-300);
    frame(1000 / hz);
    const zoom = changed.mock.lastCall?.[1];
    wheel(100);
    settle();
    expect(instance.getZoom()).toBeCloseTo(zoom / 1.2, 10);
  });

  it.each(['pointerdown', 'zoomIn', 'zoomOut', 'reset', 'resize', 'restore'])(
    'hands the visible camera to %s',
    (action) => {
      const changed = vi.fn();
      state.onPanZoomChange = changed;
      state.setWheelRenderMode('smooth');
      wheel(-300);
      frame(20);
      const zoom = changed.mock.lastCall?.[1];
      if (action === 'pointerdown') container.dispatchEvent(new Event('pointerdown'));
      else if (action === 'restore') state.restorePanZoom({ x: 10, y: 20 }, 2);
      else state[action as 'zoomIn' | 'zoomOut' | 'reset' | 'resize']();
      settle();
      const expected = { zoomIn: zoom * 1.1, zoomOut: zoom / 1.1, reset: 0.875, restore: 2 };
      expect(instance.getZoom()).toBeCloseTo(expected[action as keyof typeof expected] ?? zoom, 10);
      expect(svg.style.transform).toBe('');
    }
  );

  it('accepts wheel input on blank canvas while a native commit is pending', () => {
    state.setWheelRenderMode('smooth');
    wheel();
    frame(100);
    expect(svg.style.transform).not.toBe('');
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 700, clientY: 550 }));
    settle();
    expect(instance.getZoom()).toBeCloseTo(1.44, 10);
    expect(svg.style.transform).toBe('');
  });

  it('does not publish stale or duplicate views on commit, replacement or destroy', () => {
    const changed = vi.fn();
    state.onPanZoomChange = changed;
    state.setWheelRenderMode('smooth');
    wheel();
    frame(100);
    expect(changed).toHaveBeenCalledOnce();
    frame();
    expect(changed).toHaveBeenCalledOnce();
    wheel();
    frame(20);
    changed.mockClear();
    state.cancelPendingChanges();
    settle();
    expect(changed).not.toHaveBeenCalled();
    expect(svg.style.transform).toBe('');
    state.destroy();
    const event = new WheelEvent('wheel', { cancelable: true, deltaY: -100 });
    container.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('restores inline styles and releases the cache even at the zoom limit', () => {
    svg.style.overflow = 'clip';
    svg.style.willChange = 'opacity';
    svg.style.transformOrigin = '5px 7px';
    container.style.overflow = 'auto';
    state.setWheelRenderMode('smooth');
    wheel(-100_000);
    settle();
    expect(instance.getZoom()).toBe(12);
    wheel(-100);
    settle();
    expect(svg.style.transform).toBe('');
    expect(svg.style.overflow).toBe('clip');
    expect(svg.style.willChange).toBe('opacity');
    expect(svg.style.transformOrigin).toBe('5px 7px');
    expect(container.style.overflow).toBe('auto');
    wheel(100_000);
    settle();
    expect(instance.getZoom()).toBe(0.2);
    expect(svg.style.transform).toBe('');
  });

  it('preserves custom root transforms using vector updates', () => {
    svg.style.transform = 'translateX(20px)';
    state.setWheelRenderMode('smooth');
    wheel();
    settle();
    expect(instance.getZoom()).toBeCloseTo(1.2, 10);
    expect(svg.style.transform).toBe('translateX(20px)');
  });

  it('respects reduced motion, including a preference change during preview', () => {
    state.setWheelRenderMode('smooth');
    reducedMotion = true;
    wheel();
    expect(instance.getZoom()).toBe(1.2);
    expect(svg.style.transform).toBe('');
    settle();
    reducedMotion = false;
    wheel();
    frame(20);
    reducedMotion = true;
    wheel();
    settle();
    expect(instance.getZoom()).toBeCloseTo(1.2 ** 3, 10);
    expect(svg.style.transform).toBe('');
  });
});
