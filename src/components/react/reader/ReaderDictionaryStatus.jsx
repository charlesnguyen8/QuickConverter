import React from 'react';
import { formatLoadTimings } from './readerText.js';

export default function ReaderDictionaryStatus({ conversionMode = false, loading = false, timings = null }) {
  if (!conversionMode) return null;
  const text = loading ? 'Loading dictionaries…' : formatLoadTimings(timings);
  if (!text) return null;
  return (
    <p id="reader-dict-timing" role="status" className="text-[11px] text-slate-500 mt-1">
      {text}
    </p>
  );
}
