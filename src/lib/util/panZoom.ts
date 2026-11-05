import type { State } from '$/types';
import Hammer from 'hammerjs';
import type { Point } from 'mermaid/dist/types.js';
import panzoom from 'svg-pan-zoom';
type PanZoom = typeof panzoom;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 12;
const WHEEL_DURATION = 100;
export type WheelRenderMode = 'crisp' | 'smooth';

export class PanZoomState {
  private pzoom: PanZoom | undefined;
  private svg?: SVGSVGElement;
  private listeners?: AbortController;
  private pendingChange = false;
  private wheelFrame?: number;
  private renderMode: WheelRenderMode = 'smooth';
  private preview?: {
    basePan: Point;
    baseZoom: number;
    committing: boolean;
    inverseScreen: SVGMatrix;
    pan: Point;
    restore: () => void;
    zoom: number;
  };
  private wheel?: {
    clientX: number;
    clientY: number;
    direction: number;
    from: number;
    start: number;
    target: number;
  };
  private isDirty = false;
  private resizeObserver: ResizeObserver;

  public isPanEnabled: boolean;
  public onPanZoomChange?: (pan: Point, zoom: number) => void;

  constructor() {
    this.isPanEnabled = true;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  public updateElement(diagramView: SVGSVGElement, { pan, zoom }: Pick<State, 'pan' | 'zoom'>) {
    this.destroy();
    if (!diagramView.isConnected) return;
    this.svg = diagramView;
    this.listeners = new AbortController();
    const signal = this.listeners.signal;
    const eventTarget = diagramView.parentElement ?? diagramView;
    const markChanged = () => {
      if (signal.aborted) return;
      this.isDirty = true;
      this.pendingChange = true;
    };
    let hammer: HammerManager | undefined;
    this.pzoom = panzoom(diagramView, {
      center: true,
      controlIconsEnabled: false,
      customEventsHandler: {
        haltEventListeners: ['touchstart', 'touchend', 'touchmove', 'touchleave', 'touchcancel'],
        init: (options) => {
          const instance = options.instance;
          let initialScale = 1;
          let pannedX = 0;
          let pannedY = 0;
          hammer = new Hammer(eventTarget);

          const resetPanned = () => {
            pannedX = 0;
            pannedY = 0;
          };
          const handlePan = (event: HammerInput) => {
            instance.panBy({ x: event.deltaX - pannedX, y: event.deltaY - pannedY });
            pannedX = event.deltaX;
            pannedY = event.deltaY;
          };

          hammer.get('pinch').set({ enable: true });
          hammer.on('panstart panmove', (event) => {
            if (event.type === 'panstart') {
              this.cancelWheelZoom();
              resetPanned();
            }
            handlePan(event);
          });
          hammer.on('pinchstart pinchmove', (event) => {
            if (event.type === 'pinchstart') {
              this.cancelWheelZoom();
              initialScale = instance.getZoom();
              resetPanned();
            }
            instance.zoomAtPoint(initialScale * event.scale, {
              x: event.center.x,
              y: event.center.y
            });
            handlePan(event);
          });
          eventTarget.addEventListener('touchmove', (event) => event.preventDefault(), {
            passive: false,
            signal
          });
        },
        destroy: function () {
          hammer?.destroy();
        }
      },
      // The library only uses EventTarget methods here; its typings require an SVGElement.
      eventsListenerElement: eventTarget as unknown as SVGElement,
      fit: true,
      maxZoom: MAX_ZOOM,
      minZoom: MIN_ZOOM,
      mouseWheelZoomEnabled: false,
      onPan: markChanged,
      onUpdatedCTM: () => {
        if (signal.aborted || !diagramView.isConnected || !this.pzoom) return;
        if (this.preview?.committing) this.clearPreview();
        if (!this.pendingChange) return;
        this.pendingChange = false;
        // Pan and zoom can both change several times before the SVG paints.
        this.onPanZoomChange?.(this.pzoom.getPan(), this.pzoom.getZoom());
      },
      onZoom: markChanged,
      panEnabled: true,
      zoomEnabled: true
    });

    this.pzoom.disableDblClickZoom();
    eventTarget.addEventListener('wheel', this.handleWheel as EventListener, {
      passive: false,
      signal
    });
    eventTarget.addEventListener('pointerdown', this.cancelWheelZoom, { capture: true, signal });

    this.resizeObserver.disconnect();
    this.resizeObserver.observe(diagramView);

    if (pan && zoom && Number.isFinite(zoom) && Number.isFinite(pan.x) && Number.isFinite(pan.y)) {
      this.restorePanZoom(pan, zoom);
    } else {
      this.reset();
    }

    // we start out with both pan and zoom enabled so that the tool can auto position view refreshed
    // then set enable/disable pan based on state
    if (this.isPanEnabled) {
      this.pzoom.enablePan();
      this.pzoom.enableZoom();
    } else {
      this.pzoom.disableZoom();
      this.pzoom.disablePan();
    }

    if (pan === undefined && zoom === undefined) {
      this.reset();
    }
  }

  public cancelPendingChanges() {
    this.clearPreview();
    this.cancelWheelZoom();
    this.pendingChange = false;
  }

  public get wheelRenderMode() {
    return this.renderMode;
  }

  public setWheelRenderMode(mode: WheelRenderMode) {
    if (mode === this.renderMode) return;
    this.cancelWheelZoom();
    this.renderMode = mode;
  }

  private cancelWheelZoom = () => {
    if (this.wheelFrame !== undefined) cancelAnimationFrame(this.wheelFrame);
    this.wheelFrame = undefined;
    this.wheel = undefined;
    this.commitPreview();
  };

  private handleWheel = (event: WheelEvent) => {
    if (!this.isPanEnabled || !this.pzoom || !this.svg?.isConnected || event.buttons) return;
    // Normalize pixel, line and page deltas to the same wheel step.
    const unit = [100, 3, 1][event.deltaMode];
    const steps = -event.deltaY / unit;
    if (!Number.isFinite(steps) || steps === 0) return;
    event.preventDefault();
    const from = this.preview?.zoom ?? this.pzoom.getZoom();
    const direction = Math.sign(steps);
    // Accumulate notches regardless of their timing; reverse from the current view.
    const base = this.wheel?.direction === direction ? this.wheel.target : from;
    const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, base * 1.2 ** steps));
    this.wheel = {
      clientX: event.clientX,
      clientY: event.clientY,
      direction,
      from,
      start: performance.now(),
      target
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.cancelWheelZoom();
      this.zoomAtPointer(target, event);
    } else if (this.wheelFrame === undefined) {
      this.wheelFrame = requestAnimationFrame(this.animateWheel);
    }
  };

  private animateWheel = (timestamp: number) => {
    this.wheelFrame = undefined;
    const wheel = this.wheel;
    if (!wheel || !this.svg?.isConnected) {
      this.cancelPendingChanges();
      return;
    }
    const progress = Math.max(0, Math.min(1, (timestamp - wheel.start) / WHEEL_DURATION));
    const zoom =
      progress === 1
        ? wheel.target
        : wheel.from * (wheel.target / wheel.from) ** (1 - (1 - progress) ** 3);
    if (this.renderMode === 'smooth') this.beginPreview();
    const point = this.pointerInSvg(wheel);
    if (point && this.preview && !this.preview.committing) {
      const preview = this.preview;
      const ratio = zoom / preview.zoom;
      preview.pan = {
        x: point.x + (preview.pan.x - point.x) * ratio,
        y: point.y + (preview.pan.y - point.y) * ratio
      };
      preview.zoom = zoom;
      const scale = zoom / preview.baseZoom;
      const x = preview.pan.x - preview.basePan.x * scale;
      const y = preview.pan.y - preview.basePan.y * scale;
      this.svg.style.transform = `matrix3d(${scale},0,0,0,0,${scale},0,0,0,0,1,0,${x},${y},0,1)`;
      this.isDirty = true;
      this.onPanZoomChange?.({ ...preview.pan }, zoom);
    } else if (point) {
      this.pzoom?.zoomAtPoint(zoom, point);
    }
    if (progress < 1) this.wheelFrame = requestAnimationFrame(this.animateWheel);
    else {
      this.wheel = undefined;
      this.commitPreview();
    }
  };

  private pointerInSvg({ clientX, clientY }: { clientX: number; clientY: number }) {
    const inverse = this.preview?.inverseScreen ?? this.svg?.getScreenCTM()?.inverse();
    if (!inverse || !this.svg) return;
    const point = this.svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(inverse);
  }

  private zoomAtPointer(zoom: number, pointer: { clientX: number; clientY: number }) {
    const point = this.pointerInSvg(pointer);
    if (point) this.pzoom?.zoomAtPoint(zoom, point);
  }

  private beginPreview() {
    if (this.preview || !this.svg || !this.pzoom) return;
    const svg = this.svg;
    const container = svg.parentElement;
    const matrix = svg.getScreenCTM();
    if (!container || !matrix) return;
    // shortcut: custom root transforms use vector updates; compose them if cached zoom is needed.
    const transform = getComputedStyle(svg).transform;
    if (transform && transform !== 'none') return;
    const { overflow, transform: inlineTransform, transformOrigin, willChange } = svg.style;
    const containerOverflow = container.style.overflow;
    const pan = this.pzoom.getPan();
    const zoom = this.pzoom.getZoom();
    this.preview = {
      basePan: pan,
      baseZoom: zoom,
      committing: false,
      inverseScreen: matrix.inverse(),
      pan,
      restore: () => {
        Object.assign(svg.style, {
          overflow,
          transform: inlineTransform,
          transformOrigin,
          willChange
        });
        container.style.overflow = containerOverflow;
      },
      zoom
    };
    container.style.overflow = 'hidden';
    svg.style.overflow = 'visible';
    svg.style.transformOrigin = '0 0';
    svg.style.willChange = 'transform';
  }

  private commitPreview() {
    const preview = this.preview;
    if (!preview || preview.committing || !this.pzoom) return;
    const pan = this.pzoom.getPan();
    if (
      preview.zoom === this.pzoom.getZoom() &&
      preview.pan.x === pan.x &&
      preview.pan.y === pan.y
    ) {
      this.clearPreview();
      return;
    }
    preview.committing = true;
    this.pzoom.zoom(preview.zoom);
    this.pzoom.pan(preview.pan);
    // The preview already published this camera; clear CSS only after the native SVG commit.
    this.pendingChange = false;
  }

  private clearPreview() {
    this.preview?.restore();
    this.preview = undefined;
  }

  public destroy() {
    this.cancelPendingChanges();
    this.listeners?.abort();
    this.listeners = undefined;
    this.resizeObserver.disconnect();
    this.svg = undefined;
    this.pzoom?.destroy();
    this.pzoom = undefined;
  }

  public restorePanZoom(pan: Point, zoom: number) {
    this.cancelWheelZoom();
    if (!this.pzoom) {
      console.error('PanZoomState.restorePanZoom: pzoom is not initialized');
      return;
    }
    this.pzoom.zoom(zoom);
    this.pzoom.pan(pan);
  }

  public resize() {
    this.cancelWheelZoom();
    if (!this.pzoom) return;
    const previous = this.pzoom.getSizes();
    this.pzoom.resize();
    if (!this.isDirty) {
      this.reset();
    } else {
      const current = this.pzoom.getSizes();
      if (current.width !== previous.width || current.height !== previous.height) {
        // Preserve the user's zoom and center when a sidebar changes the viewport.
        this.pzoom.panBy({
          x: (current.width - previous.width) / 2,
          y: (current.height - previous.height) / 2
        });
      }
    }
  }

  public zoomIn() {
    this.cancelWheelZoom();
    this.pzoom?.zoomIn();
  }

  public zoomOut() {
    this.cancelWheelZoom();
    this.pzoom?.zoomOut();
  }

  public reset() {
    this.cancelWheelZoom();
    this.pzoom?.reset();
    // Zoom out a bit to avoid overlap with the toolbar
    this.pzoom?.zoom(0.875);
    this.isDirty = false;
  }
}
