import React from 'react';
import { popupHtml } from './popupMarkup.mjs';

export default function PopupShell() {
  return <div className="contents" dangerouslySetInnerHTML={{ __html: popupHtml }} />;
}
