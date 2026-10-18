const BACKUP_FORMAT = 'quickconverter-backup';
const BACKUP_VERSION = 1;

const pad = (n) => String(n).padStart(2, '0');

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function backupFileName(date = new Date()) {
  return `quickconverter-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export function parseBackupFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('This file is not a QuickConverter backup.');
  }
  if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT) {
    throw new Error('This file is not a QuickConverter backup.');
  }
  if (typeof data.version === 'number' && data.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of QuickConverter. Update the app first.');
  }
  return data;
}

export function describeImport(result) {
  const novels = (result && result.novels) || 0;
  const chapters = (result && result.chapters) || 0;
  return `Imported ${plural(novels, 'novel')} and ${plural(chapters, 'chapter')}.`;
}

export async function exportBackupFile(storage, env = globalThis, date = new Date()) {
  const data = await storage.exportAll();
  const name = backupFileName(date);
  const nativeFiles = env.Platform && env.Platform.files;
  if (nativeFiles) {
    const saved = await nativeFiles.saveText(name, 'application/json', JSON.stringify(data));
    if (!saved) return 'Save cancelled.';
  } else {
    const blob = new env.Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = env.URL.createObjectURL(blob);
    try {
      const link = env.document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
    } finally {
      env.URL.revokeObjectURL(url);
    }
  }
  const novels = Array.isArray(data.novels) ? data.novels.length : 0;
  const chapters = Array.isArray(data.chapters) ? data.chapters.length : 0;
  return `Saved ${plural(novels, 'novel')} and ${plural(chapters, 'chapter')} to ${name}.`;
}

export async function importBackupFile(storage, file, { replace = false } = {}) {
  const data = parseBackupFile(await file.text());
  const result = await storage.importAll(data, { replace });
  return describeImport(result);
}
