import * as ort from 'onnxruntime-web';
import { PaddleOcrService } from 'ppu-paddle-ocr/web';
import { assembleParagraphs, planStrips } from './ocrText.js';

const STRIP_HEIGHT = 1200;

let servicePromise = null;

function assetUrl(relativePath) {
  return new URL(relativePath, window.location.href).href;
}

function getService() {
  if (!servicePromise) {
    ort.env.wasm.wasmPaths = assetUrl('../ocr/ort/');
    ort.env.wasm.numThreads = 1;
    const service = new PaddleOcrService({
      model: {
        detection: assetUrl('../ocr/models/PP-OCRv6_tiny_det.ort'),
        recognition: assetUrl('../ocr/models/PP-OCRv6_tiny_rec.ort'),
        charactersDictionary: assetUrl('../ocr/models/ppocrv6_tiny_dict.txt')
      },
      detection: { paddingVertical: 0.6, paddingHorizontal: 1.0 },
      session: { executionProviders: ['wasm'] }
    });
    servicePromise = service.initialize()
      .then(() => service)
      .catch((err) => {
        servicePromise = null;
        throw err;
      });
  }
  return servicePromise;
}

function blankRows(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
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

export async function recognizeChapterImage(bytes, mimeType) {
  const service = await getService();
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType || 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);

  const lines = [];
  for (const [top, bottom] of planStrips(blankRows(ctx, canvas.width, canvas.height), STRIP_HEIGHT)) {
    const strip = document.createElement('canvas');
    strip.width = canvas.width;
    strip.height = bottom - top;
    strip.getContext('2d').drawImage(canvas, 0, top, canvas.width, bottom - top, 0, 0, canvas.width, bottom - top);
    const result = await service.recognize(strip, { noCache: true });
    for (const line of (result && result.lines) || []) {
      lines.push(line.map((item) => ({ ...item, box: { ...item.box, y: item.box.y + top } })));
    }
  }
  return assembleParagraphs(lines);
}
