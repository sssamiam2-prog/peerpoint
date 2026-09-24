import * as React from 'react';
import { ColoringSvg } from './ColoringSvg';
import { downloadColoringPng, downloadColoringSvg, printColoringPage } from './exportPage';
import { PAGE_SIZE } from './geometry';
import { DEFAULT_COLOR, COLORING_PALETTE } from './palette';
import {
  clearColoringFills,
  loadColoringFills,
  loadColoringPaint,
  saveColoringFills,
  saveColoringPaint,
  type ColoringFills
} from './storage';
import type { ColoringPage } from './types';

type Props = {
  page: ColoringPage;
  variant: 'modern' | 'classic';
};

type ColorMode = 'brush' | 'fill';

const BRUSH_SIZES = [
  { id: 'fine', label: 'Fine', size: 8 },
  { id: 'medium', label: 'Medium', size: 18 },
  { id: 'bold', label: 'Bold', size: 34 }
] as const;

function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
  const canvas = e.currentTarget;
  const box = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - box.left) / box.width) * canvas.width,
    y: ((e.clientY - box.top) / box.height) * canvas.height
  };
}

export function ColoringStudio({ page, variant }: Props): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawingRef = React.useRef(false);
  const lastRef = React.useRef<{ x: number; y: number } | null>(null);
  const undoRef = React.useRef<ImageData[]>([]);
  const [fills, setFills] = React.useState<ColoringFills>(() => loadColoringFills(page.id));
  const [color, setColor] = React.useState(DEFAULT_COLOR);
  const [mode, setMode] = React.useState<ColorMode>('brush');
  const [brushSize, setBrushSize] = React.useState<(typeof BRUSH_SIZES)[number]['id']>('medium');
  const [canUndo, setCanUndo] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [exportError, setExportError] = React.useState('');
  const [ready, setReady] = React.useState(false);

  const brushPx = BRUSH_SIZES.find(b => b.id === brushSize)?.size ?? 18;

  const persistPaint = React.useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveColoringPaint(page.id, canvas.toDataURL('image/jpeg', 0.82));
  }, [page.id]);

  const snapshot = React.useCallback((): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    undoRef.current = [...undoRef.current.slice(-14), ctx.getImageData(0, 0, canvas.width, canvas.height)];
    setCanUndo(true);
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    undoRef.current = [];
    setCanUndo(false);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const storedFills = loadColoringFills(page.id);
    for (const region of page.regions) {
      const fill = storedFills[region.id];
      if (!fill || fill === '#ffffff') continue;
      ctx.fillStyle = fill;
      ctx.fill(new Path2D(region.d));
    }
    const paint = loadColoringPaint(page.id);
    if (!paint) {
      setReady(true);
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setReady(true);
    };
    img.onerror = () => setReady(true);
    img.src = paint;
  }, [page]);

  React.useEffect(() => {
    saveColoringFills(page.id, fills);
  }, [page.id, fills]);

  const strokeTo = (ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }): void => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brushPx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (mode !== 'brush') return;
    e.preventDefault();
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    snapshot();
    drawingRef.current = true;
    const point = canvasPoint(e);
    lastRef.current = point;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, brushPx / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (mode !== 'brush' || !drawingRef.current) return;
    const ctx = e.currentTarget.getContext('2d');
    const last = lastRef.current;
    if (!ctx || !last) return;
    const point = canvasPoint(e);
    strokeTo(ctx, last, point);
    lastRef.current = point;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    persistPaint();
  };

  const fillRegion = (regionId: string): void => {
    const region = page.regions.find(item => item.id === regionId);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!region || !ctx) return;
    snapshot();
    ctx.fillStyle = color;
    ctx.fill(new Path2D(region.d));
    setFills(current => {
      if (color === '#ffffff') {
        const next = { ...current };
        delete next[regionId];
        return next;
      }
      return { ...current, [regionId]: color };
    });
    persistPaint();
  };

  const undoLast = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const last = undoRef.current[undoRef.current.length - 1];
    if (!canvas || !ctx || !last) return;
    ctx.putImageData(last, 0, 0);
    undoRef.current = undoRef.current.slice(0, -1);
    setCanUndo(undoRef.current.length > 0);
    persistPaint();
  };

  const resetPage = (): void => {
    if (!window.confirm('Clear colors on this page? This only affects this device.')) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    undoRef.current = [];
    setCanUndo(false);
    setFills({});
    clearColoringFills(page.id);
  };

  return (
    <div className={`coloring-studio coloring-studio--${variant}`}>
      <p className="coloring-studio__hint">
        {mode === 'brush'
          ? `${page.why} Color with your finger or mouse. White is an eraser.`
          : `${page.why} Tap a section to fill it. Switch back to Touch / Mouse to color by hand.`}
      </p>
      <div className="coloring-mode" role="radiogroup" aria-label="Coloring method">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'brush'}
          className={mode === 'brush' ? 'coloring-btn coloring-btn--primary' : 'coloring-btn'}
          onClick={() => setMode('brush')}
        >
          Touch / Mouse
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'fill'}
          className={mode === 'fill' ? 'coloring-btn coloring-btn--primary' : 'coloring-btn'}
          onClick={() => setMode('fill')}
        >
          Color by filling
        </button>
      </div>
      <div className="coloring-toolbar" role="toolbar" aria-label="Coloring tools">
        {mode === 'brush'
          ? BRUSH_SIZES.map(size => (
              <button
                key={size.id}
                type="button"
                className={brushSize === size.id ? 'coloring-btn coloring-btn--primary' : 'coloring-btn'}
                onClick={() => setBrushSize(size.id)}
              >
                {size.label}
              </button>
            ))
          : null}
        <button type="button" className="coloring-btn" onClick={undoLast} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="coloring-btn" onClick={resetPage}>
          Reset
        </button>
        <button
          type="button"
          className="coloring-btn"
          onClick={() => setZoom(z => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
          disabled={zoom <= 1}
        >
          −
        </button>
        <span className="coloring-zoom">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="coloring-btn"
          onClick={() => setZoom(z => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
        >
          +
        </button>
      </div>
      <div className="coloring-paper-wrap">
        <div
          className={`coloring-paper ${mode === 'brush' ? 'coloring-paper--brush' : 'coloring-paper--fill'}`}
          style={{ width: `${zoom * 100}%` }}
        >
          <canvas
            ref={canvasRef}
            className="coloring-paint"
            width={PAGE_SIZE}
            height={PAGE_SIZE}
            aria-label={page.title}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          />
          <ColoringSvg
            page={page}
            fills={fills}
            overlay
            onFillRegion={mode === 'fill' ? fillRegion : undefined}
          />
        </div>
      </div>
      {!ready ? <p className="coloring-note">Loading page…</p> : null}
      <div className="coloring-palette" role="group" aria-label="Colors">
        {COLORING_PALETTE.map(swatch => (
          <button
            key={swatch.hex + swatch.label}
            type="button"
            className={color === swatch.hex ? 'coloring-swatch selected' : 'coloring-swatch'}
            style={{ background: swatch.hex }}
            aria-label={swatch.label}
            title={swatch.label}
            onClick={() => setColor(swatch.hex)}
          />
        ))}
        <label className="coloring-custom">
          <span>Custom</span>
          <input
            type="color"
            value={color === '#ffffff' ? DEFAULT_COLOR : color}
            onChange={e => setColor(e.target.value)}
            aria-label="Custom color"
          />
        </label>
      </div>
      {exportError ? <p className="coloring-export-error">{exportError}</p> : null}
      <div className="coloring-export">
        <button type="button" className="coloring-btn coloring-btn--primary" onClick={() => printColoringPage(page, fills, true)}>
          Print blank page
        </button>
        <button type="button" className="coloring-btn" onClick={() => downloadColoringSvg(page, {}, true)}>
          Download blank
        </button>
        <button
          type="button"
          className="coloring-btn"
          onClick={() => {
            setExportError('');
            void downloadColoringPng(page, fills, false, canvasRef.current).catch(err =>
              setExportError(err instanceof Error ? err.message : 'Could not download colored page.')
            );
          }}
        >
          Download my coloring
        </button>
      </div>
    </div>
  );
}
