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
      <p className="text-xs text-zinc-600">
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
      <span>
        {folderName ? (
          <>
            Saving to <span className="text-zinc-300">{folderName}</span>
          </>
        ) : (
          'Downloads folder (browser default)'
        )}
      </span>
      <button
        type="button"
        onClick={chooseFolder}
        disabled={busy}
        className="text-amber-400/90 hover:text-amber-300 disabled:opacity-50"
      >
        {folderName ? 'Change folder' : 'Choose folder'}
      </button>
      {folderName ? (
        <button type="button" onClick={clearFolder} className="text-zinc-500 hover:text-zinc-300">
          Use Downloads
        </button>
      ) : null}
    </div>
  );
}
