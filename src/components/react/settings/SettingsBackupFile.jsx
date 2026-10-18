import React, { useRef, useState } from 'react';
import { exportBackupFile, importBackupFile } from './backupFile.js';

const FEEDBACK_OK = 'text-xs font-medium text-emerald-400';
const FEEDBACK_ERR = 'text-xs font-medium text-rose-400';
const FEEDBACK_INFO = 'text-xs font-medium text-slate-400';

export default function SettingsBackupFile({ onImported }) {
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ text: '', cls: FEEDBACK_INFO });
  const inputRef = useRef(null);

  const storage = () => (typeof window !== 'undefined' ? window.StorageService : null);

  const onExport = async () => {
    const service = storage();
    if (!service) return;
    setBusy(true);
    setFeedback({ text: 'Preparing backup file...', cls: FEEDBACK_INFO });
    try {
      setFeedback({ text: await exportBackupFile(service), cls: FEEDBACK_OK });
    } catch (e) {
      setFeedback({ text: e.message || 'Export failed', cls: FEEDBACK_ERR });
    }
    setBusy(false);
  };

  const onPick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    const service = storage();
    if (!file || !service) return;
    if (replace && !window.confirm('Replace ALL local novels, chapters and settings with this backup? This cannot be undone.')) return;
    setBusy(true);
    setFeedback({ text: 'Importing...', cls: FEEDBACK_INFO });
    try {
      setFeedback({ text: await importBackupFile(service, file, { replace }), cls: FEEDBACK_OK });
      if (onImported) await onImported();
    } catch (e) {
      setFeedback({ text: e.message || 'Import failed', cls: FEEDBACK_ERR });
    }
    setBusy(false);
  };

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <span>📁</span>
          <span>Backup File</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Save your whole library to a .json file, or load one, for example to move it from the browser extension to the Android app. API keys are left out.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          id="settings-backup-export"
          onClick={onExport}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 min-h-10 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>Save backup file</span>
        </button>
        <button
          type="button"
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 min-h-10 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>Load backup file</span>
        </button>
        <input
          ref={inputRef}
          id="settings-backup-import"
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onPick}
        />
      </div>

      <label className="flex items-center gap-2 min-h-10 text-xs text-slate-300 cursor-pointer">
        <input
          id="settings-backup-replace"
          type="checkbox"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
          className="w-4 h-4"
        />
        <span>Replace everything on this device (otherwise the backup is merged in)</span>
      </label>

      {feedback.text ? <span className={feedback.cls}>{feedback.text}</span> : null}
    </div>
  );
}
