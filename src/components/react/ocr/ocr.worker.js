import * as ort from 'onnxruntime-web';
import { PaddleOcrService } from 'ppu-paddle-ocr/web';
import { recognizeImage, workerCanvasTools } from './ocrPipeline.js';
import { handleWorkerRequest } from './ocrWorkerProtocol.js';

let servicePromise = null;

function assetUrl(relativePath) {
  return new URL(relativePath, self.location.href).href;
}

function getService() {
  if (!servicePromise) {
    ort.env.wasm.wasmPaths = assetUrl('../ocr/ort/');
    ort.env.wasm.numThreads = 1;
    const service = new PaddleOcrService({
      model: {
        detection: assetUrl('../ocr/models/PP-OCRv6_small_det.ort'),
        recognition: assetUrl('../ocr/models/PP-OCRv6_small_rec.ort'),
        charactersDictionary: assetUrl('../ocr/models/ppocrv6_dict.txt')
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

const tools = workerCanvasTools(self);

self.addEventListener('message', async (event) => {
  const reply = await handleWorkerRequest(event.data, async (bytes, mimeType) => recognizeImage(await getService(), bytes, mimeType, tools));
  self.postMessage(reply);
});
