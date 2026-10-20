function bytesFromBase64(base64) {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function isOcrRequest(message) {
  return !!(message && message.action === 'OCR_RECOGNIZE' && message.target === 'offscreen');
}

export async function handleOcrMessage(message, recognize) {
  if (!isOcrRequest(message)) return null;
  try {
    const text = await recognize(bytesFromBase64(message.base64), message.mimeType);
    return { text: String(text || '') };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}
