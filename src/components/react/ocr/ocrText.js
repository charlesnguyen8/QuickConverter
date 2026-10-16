function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function flattenLine(pieces) {
  const items = (Array.isArray(pieces) ? pieces : [pieces])
    .filter((p) => p && p.box && typeof p.text === 'string')
    .sort((a, b) => a.box.x - b.box.x);
  if (items.length === 0) return null;
  const text = items.map((p) => p.text).join('').trim();
  const width = items.reduce((sum, p) => sum + p.box.width, 0);
  return {
    text,
    charWidth: text ? width / Array.from(text).length : 0,
    left: Math.min(...items.map((p) => p.box.x)),
    right: Math.max(...items.map((p) => p.box.x + p.box.width)),
    top: Math.min(...items.map((p) => p.box.y)),
    bottom: Math.max(...items.map((p) => p.box.y + p.box.height)),
    height: median(items.map((p) => p.box.height))
  };
}

export function assembleParagraphs(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return '';
  const rows = lines.map(flattenLine).filter((row) => row && row.text);
  if (rows.length === 0) return '';

  const charHeight = median(rows.map((row) => row.height)) || 1;
  const charWidth = median(rows.filter((row) => Array.from(row.text).length >= 4).map((row) => row.charWidth)) || charHeight;
  const minLeft = Math.min(...rows.map((row) => row.left));
  const maxRight = Math.max(...rows.map((row) => row.right));
  const paragraphs = [];
  let previous = null;

  rows.forEach((row) => {
    const indented = row.left - minLeft > charWidth * 0.8;
    const farBelow = previous && row.top - previous.bottom > charHeight * 1.2;
    const afterShortLine = previous && previous.right < maxRight - charWidth * 2;
    if (!previous || indented || farBelow || afterShortLine) {
      paragraphs.push(row.text);
    } else {
      paragraphs[paragraphs.length - 1] += row.text;
    }
    previous = row;
  });

  return paragraphs.join('\n\n');
}

export function planStrips(blankRows, maxHeight) {
  const height = Array.isArray(blankRows) ? blankRows.length : 0;
  const strips = [];
  let start = 0;
  while (start < height) {
    if (height - start <= maxHeight) {
      strips.push([start, height]);
      break;
    }
    let cut = start + maxHeight;
    for (let y = start + maxHeight; y > start + maxHeight / 2; y--) {
      if (blankRows[y]) {
        cut = y;
        break;
      }
    }
    strips.push([start, cut]);
    start = cut;
  }
  return strips;
}

export function isOcrImageMessage(event, expectedSource) {
  if (!event || event.source !== expectedSource) return false;
  const data = event.data;
  return !!data && data.type === 'QC_OCR_IMAGE' && data.bytes instanceof ArrayBuffer;
}
