import { assembleParagraphs, planStrips } from './ocrText.js';

export const STRIP_HEIGHT = 1200;

export function blankRowsFromPixels(data, width, height) {
  const bg = [data[0], data[1], data[2]];
  const rows = new Array(height);
  for (let y = 0; y < height; y++) {
    let blank = true;
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 60) {
        blank = false;
        break;
      }
    }
    rows[y] = blank;
  }
  return rows;
}

export function workerCanvasTools(scope) {
  return {
    decode: (bytes, mimeType) => scope.createImageBitmap(new Blob([bytes], { type: mimeType || 'image/png' })),
    makeCanvas: (width, height) => new scope.OffscreenCanvas(width, height)
  };
}

export async function recognizeImage(service, bytes, mimeType, { decode, makeCanvas }) {
  const bitmap = await decode(bytes, mimeType);
  const { width, height } = bitmap;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);
  if (typeof bitmap.close === 'function') bitmap.close();

  const lines = [];
  const blank = blankRowsFromPixels(ctx.getImageData(0, 0, width, height).data, width, height);
  for (const [top, bottom] of planStrips(blank, STRIP_HEIGHT)) {
    const strip = makeCanvas(width, bottom - top);
    strip.getContext('2d').drawImage(canvas, 0, top, width, bottom - top, 0, 0, width, bottom - top);
    const result = await service.recognize(strip, { noCache: true });
    for (const line of (result && result.lines) || []) {
      lines.push(line.map((item) => ({ ...item, box: { ...item.box, y: item.box.y + top } })));
    }
  }
  return assembleParagraphs(lines);
}
