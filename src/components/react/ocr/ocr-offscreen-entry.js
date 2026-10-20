import { recognizeChapterImage } from './ocrEngine.js';
import { handleOcrMessage, isOcrRequest } from './ocrOffscreen.js';

window.Platform.messaging.subscribe((message, sender, sendResponse) => {
  if (!isOcrRequest(message)) return false;
  handleOcrMessage(message, recognizeChapterImage).then(sendResponse);
  return true;
});
