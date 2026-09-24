import type { ColoringFills } from './storage';
import type { ColoringPage } from './types';

export function coloringSvgMarkup(
  page: ColoringPage,
  fills: ColoringFills,
  blank: boolean,
  lineArtOnly = false
): string {
  const paths = page.regions
    .map(region => {
      const fill = lineArtOnly ? 'none' : blank ? '#ffffff' : fills[region.id] || '#ffffff';
      return `<path d="${region.d}" fill="${fill}" stroke="#1a1a1a" stroke-width="${page.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join('');
  const paper = lineArtOnly ? '' : '<rect width="100%" height="100%" fill="#ffffff"/>';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${page.viewBox}" width="2400" height="2400">
  ${paper}
  ${paths}
</svg>`;
}

export function downloadTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadColoringSvg(page: ColoringPage, fills: ColoringFills, blank: boolean): void {
  const slug = blank ? 'printable' : 'colored';
  downloadTextFile(
    `peerpoint-${page.id}-${slug}.svg`,
    coloringSvgMarkup(page, fills, blank),
    'image/svg+xml'
  );
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render page.'));
    };
    img.src = url;
  });
}

export async function downloadColoringPng(
  page: ColoringPage,
  fills: ColoringFills,
  blank: boolean,
  paint?: HTMLCanvasElement | null
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 2400;
  canvas.height = 2400;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not export image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!blank && paint) {
    ctx.drawImage(paint, 0, 0, canvas.width, canvas.height);
  }
  const svg = coloringSvgMarkup(page, fills, blank, Boolean(!blank && paint));
  const img = await loadSvgImage(svg);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  await new Promise<void>((resolve, reject) => {
    canvas.toBlob(file => {
      if (!file) {
        reject(new Error('Could not export image.'));
        return;
      }
      const pngUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `peerpoint-${page.id}-${blank ? 'printable' : 'colored'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(pngUrl);
      resolve();
    }, 'image/png');
  });
}

export function printColoringPage(page: ColoringPage, fills: ColoringFills, blank: boolean): void {
  const svg = coloringSvgMarkup(page, fills, blank).replace(/^<\?xml[^>]*>/, '');
  const frame = window.open('', '_blank', 'noopener,noreferrer');
  if (!frame) return;
  const title = blank ? `${page.title} (printable)` : page.title;
  frame.document.write(`<!doctype html>
<html><head><title>${title} — PEERPoint</title>
<style>
  @page { size: letter portrait; margin: 0.45in; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #222; }
  header { text-align: center; margin-bottom: 8px; }
  h1 { font-size: 16pt; margin: 0 0 4px; font-weight: 600; }
  p { font-size: 9pt; margin: 0; color: #555; }
  .art { display: flex; justify-content: center; }
  svg { width: 7.4in; height: 7.4in; }
</style></head>
<body>
  <header>
    <h1>${title}</h1>
    <p>PEERPoint Coloring Therapy · Color at your own pace. Not a substitute for 911, 988, or Peer Support.</p>
  </header>
  <div class="art">${svg}</div>
</body></html>`);
  frame.document.close();
  frame.focus();
  window.setTimeout(() => frame.print(), 250);
}
