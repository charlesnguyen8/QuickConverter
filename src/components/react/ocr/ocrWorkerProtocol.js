export async function handleWorkerRequest(message, recognize) {
  const id = message ? message.id : undefined;
  try {
    const text = await recognize(message.bytes, message.mimeType);
    return { id, text: String(text || '') };
  } catch (e) {
    return { id, error: e && e.message ? e.message : String(e) };
  }
}

function copyOf(bytes) {
  if (ArrayBuffer.isView(bytes)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return bytes.slice(0);
}

export function createOcrClient(createWorker) {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  const start = () => {
    const started = createWorker();
    started.addEventListener('message', (event) => {
      const data = (event && event.data) || {};
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.error) entry.reject(new Error(data.error));
      else entry.resolve(data.text);
    });
    started.addEventListener('error', (event) => {
      if (worker === started) worker = null;
      try { started.terminate(); } catch (e) {}
      const error = new Error(`The OCR worker stopped: ${event && event.message ? event.message : 'unknown error'}`);
      pending.forEach((entry) => entry.reject(error));
      pending.clear();
    });
    return started;
  };

  return {
    recognize(bytes, mimeType) {
      if (!worker) worker = start();
      const id = nextId++;
      const copy = copyOf(bytes);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, bytes: copy, mimeType }, [copy]);
      });
    }
  };
}
