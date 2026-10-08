'use client';

import { useEffect, useState } from 'react';
import {
  canPickSaveFolder,
  clearSavedDirectory,
  getSavedDirectory,
  pickSaveDirectory,
} from '@/lib/resume-save-folder';

export function ResumeSaveFolder() {
  const [supported, setSupported] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(canPickSaveFolder());
    getSavedDirectory()
      .then((handle) => setFolderName(handle?.name ?? null))
      .catch(() => setFolderName(null));
  }, []);

  if (!supported) {
    return (
      <p className="text-xs text-ink-faint">
        Chrome or Edge can save straight into a folder you pick. This browser will use Downloads.
      </p>
    );
  }

  async function chooseFolder() {
    setBusy(true);
    try {
      const handle = await pickSaveDirectory();
      setFolderName(handle.name);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    } finally {
      setBusy(false);
    }
  }

  async function clearFolder() {
    await clearSavedDirectory();
    setFolderName(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
      <span>
        {folderName ? (
          <>
            Saving to <span className="text-ink-soft">{folderName}</span>
          </>
        ) : (
          'Downloads folder (browser default)'
        )}
      </span>
      <button
        type="button"
        onClick={chooseFolder}
        disabled={busy}
        className="text-brand hover:text-brand disabled:opacity-50"
      >
        {folderName ? 'Change folder' : 'Choose folder'}
      </button>
      {folderName ? (
        <button type="button" onClick={clearFolder} className="text-ink-faint hover:text-ink">
          Use Downloads
        </button>
      ) : null}
    </div>
  );
}
