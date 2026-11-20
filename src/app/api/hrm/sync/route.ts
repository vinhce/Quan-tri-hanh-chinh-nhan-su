import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');

function getStore(): Record<string, unknown> {
  if (globalThis._hrmSyncStore && Object.keys(globalThis._hrmSyncStore).length > 0) {
    return globalThis._hrmSyncStore;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      globalThis._hrmSyncStore = JSON.parse(content);
      return globalThis._hrmSyncStore || {};
    }
  } catch {
    // fallback
  }
  if (!globalThis._hrmSyncStore) {
    globalThis._hrmSyncStore = {};
  }
  return globalThis._hrmSyncStore;
}

function persistStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(globalThis._hrmSyncStore || {}, null, 2), 'utf-8');
  } catch {
    // ignore file write errors in restricted environments
  }
}

export async function GET() {
  const stores = getStore();
  return NextResponse.json({ success: true, stores });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, items, fullSync } = body;
    const store = getStore();

    if (fullSync && typeof fullSync === 'object') {
      Object.assign(store, fullSync);
    } else if (key && items !== undefined) {
      store[key] = items;
    }

    persistStore();
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi đồng bộ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
