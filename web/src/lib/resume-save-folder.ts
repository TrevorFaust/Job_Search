const DB_NAME = 'job-hunt-resume-save';
const STORE = 'kv';
const DIR_KEY = 'directory';

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
};

function directoryPickerWindow() {
  return window as DirectoryPickerWindow;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      })
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbDel(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      })
  );
}

export function canPickSaveFolder() {
  return typeof window !== 'undefined' && typeof directoryPickerWindow().showDirectoryPicker === 'function';
}

export async function getSavedDirectory(): Promise<DirHandle | null> {
  if (!canPickSaveFolder()) return null;
  try {
    const handle = await idbGet<DirHandle>(DIR_KEY);
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function pickSaveDirectory(): Promise<DirHandle> {
  const picker = directoryPickerWindow().showDirectoryPicker;
  if (!picker) throw new Error('Folder picker is not supported in this browser');
  const handle = await picker({
    id: 'job-hunt-resumes',
    mode: 'readwrite',
    startIn: 'documents',
  });
  await idbSet(DIR_KEY, handle);
  return handle;
}

export async function clearSavedDirectory() {
  await idbDel(DIR_KEY);
}

async function ensureWritePermission(handle: DirHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

export async function writeBlobToSavedFolder(filename: string, blob: Blob): Promise<string | null> {
  const handle = await getSavedDirectory();
  if (!handle) return null;
  if (!(await ensureWritePermission(handle))) return null;
  const file = await handle.getFileHandle(filename, { create: true });
  const writable = await (file as FileSystemFileHandle & {
    createWritable: () => Promise<FileSystemWritableFileStream>;
  }).createWritable();
  await writable.write(blob);
  await writable.close();
  return handle.name;
}

export function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]).replace(/[/\\?%*:|"<>]/g, '-');
    } catch {
      /* ignore */
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return (plain?.[1] ?? fallback).replace(/[/\\?%*:|"<>]/g, '-').trim();
}

export function triggerBrowserDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
