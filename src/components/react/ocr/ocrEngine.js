import { createOcrClient } from './ocrWorkerProtocol.js';

let client = null;

export async function recognizeChapterImage(bytes, mimeType) {
  if (!client) client = createOcrClient(() => new Worker(new URL('./ocr.worker.js', import.meta.url), { type: 'module' }));
  return client.recognize(bytes, mimeType);
}
