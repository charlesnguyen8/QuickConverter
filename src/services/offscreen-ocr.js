// QuickConverter OCR for the Chrome extension's service worker: the worker has no DOM for the
// OCR engine, so it hands the chapter picture to an offscreen page (views/ocr-offscreen.html)
// and gets the recognized text back.
(function (global) {
  'use strict';

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return global.btoa(binary);
  }

  function create({ ensureDocument, send }) {
    return {
      async recognize(bytes, mimeType, base64) {
        await ensureDocument();
        const reply = await send({ action: 'OCR_RECOGNIZE', target: 'offscreen', base64: base64 || toBase64(bytes), mimeType: mimeType || 'image/png' });
        if (!reply) throw new Error('The OCR page did not answer.');
        if (reply.error) throw new Error(reply.error);
        return reply.text || '';
      }
    };
  }

  const OffscreenOcr = { create, toBase64 };
  global.OffscreenOcr = OffscreenOcr;
  if (typeof module !== 'undefined' && module.exports) module.exports = OffscreenOcr;
})(typeof globalThis !== 'undefined' ? globalThis : this);
