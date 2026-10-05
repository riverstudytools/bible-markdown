/** Project storage. The app only talks to this interface, so the backing can be a real folder or the browser. */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export interface Store {
  readonly kind: 'fs' | 'memory';
  readonly name: string;
  /** Relative paths ("romans/ROM.md") of every file the app can show. */
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
}

export const KNOWN_EXT = ['md', 'markdown', 'biblemd', 'usfm', 'sfm', 'html', 'htm'];
export const isKnown = (p: string) => KNOWN_EXT.includes((p.split('.').pop() ?? '').toLowerCase());

/* ---- tiny IndexedDB key-value helper ---- */
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    const open = indexedDB.open('biblemd', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => resolve(undefined);
    open.onsuccess = () => {
      try {
        const req = fn(open.result.transaction('kv', mode).objectStore('kv'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    };
  });
}
export const kvGet = <T>(key: string) => idb<T>('readonly', (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => idb('readwrite', (s) => s.put(value, key));

/* ---- a real folder (File System Access API: Chromium browsers) ---- */
export class FsStore implements Store {
  readonly kind = 'fs' as const;
  constructor(readonly root: FileSystemDirectoryHandle) {}
  get name() { return this.root.name; }

  async list(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, h] of dir.entries()) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        if (h.kind === 'directory') await walk(h as FileSystemDirectoryHandle, prefix + name + '/');
        else if (isKnown(name)) out.push(prefix + name);
      }
    };
    await walk(this.root, '');
    return out.sort();
  }

  private async dir(path: string, create: boolean) {
    let d = this.root;
    const parts = path.split('/').slice(0, -1);
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }
  async read(path: string) {
    const d = await this.dir(path, false);
    const fh = await d.getFileHandle(path.split('/').pop()!);
    return (await fh.getFile()).text();
  }
  async write(path: string, text: string) {
    const d = await this.dir(path, true);
    const fh = await d.getFileHandle(path.split('/').pop()!, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }
}

/* ---- in the browser (Firefox, Safari, phones): files live in memory and in IndexedDB ---- */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  files = new Map<string, string>();
  constructor(public name: string, private persistKey: string | null = 'project') {}

  async list() { return [...this.files.keys()].sort(); }
  async read(path: string) {
    const t = this.files.get(path);
    if (t === undefined) throw new Error('No such file: ' + path);
    return t;
  }
  async write(path: string, text: string) {
    this.files.set(path, text);
    if (this.persistKey) void kvSet(this.persistKey, { name: this.name, files: [...this.files] });
  }
  static async restore(): Promise<MemoryStore | null> {
    const saved = await kvGet<{ name: string; files: [string, string][] }>('project');
    if (!saved || !saved.files.length) return null;
    const s = new MemoryStore(saved.name);
    s.files = new Map(saved.files);
    return s;
  }
  static async fromFileList(list: FileList): Promise<MemoryStore> {
    const first = list[0] as File & { webkitRelativePath?: string };
    const root = first?.webkitRelativePath ? first.webkitRelativePath.split('/')[0] : 'Project';
    const s = new MemoryStore(root);
    for (const f of Array.from(list) as Array<File & { webkitRelativePath?: string }>) {
      const rel = f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name;
      if (rel.split('/').some((p) => p.startsWith('.'))) continue;
      if (isKnown(rel)) s.files.set(rel, await f.text());
      else if (rel.toLowerCase().endsWith('.zip')) await s.addZip(new Uint8Array(await f.arrayBuffer()));
    }
    void kvSet('project', { name: s.name, files: [...s.files] });
    return s;
  }
  async addZip(data: Uint8Array) {
    const entries = unzipSync(data);
    for (const [p, bytes] of Object.entries(entries)) {
      if (p.endsWith('/') || p.split('/').some((x) => x.startsWith('.') || x === '__MACOSX') || !isKnown(p)) continue;
      this.files.set(p, strFromU8(bytes));
    }
  }
}

export function makeZip(files: Record<string, string>): Uint8Array {
  const o: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) o[k] = strToU8(v);
  return zipSync(o);
}

export const hasFsAccess = () => typeof (window as any).showDirectoryPicker === 'function';
export async function pickFolder(): Promise<FsStore | null> {
  try {
    const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    void kvSet('handle', handle);
    return new FsStore(handle);
  } catch { return null; }
}
export async function lastFolder(): Promise<FileSystemDirectoryHandle | undefined> { return kvGet<FileSystemDirectoryHandle>('handle'); }
export async function ensurePermission(h: FileSystemDirectoryHandle): Promise<boolean> {
  const anyH = h as any;
  if ((await anyH.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await anyH.requestPermission({ mode: 'readwrite' })) === 'granted';
}
