import { INSTRUMENTS, type Instrument } from "./types.ts";

export type AudioAsset = { version: 1; original: Blob; stems: Partial<Record<Instrument, Blob>> };

/** Legacy single-recording rows remain readable without a database migration. */
export function parseAudioAsset(value: unknown): AudioAsset | null {
  if (value instanceof Blob) return { version: 1, original: value, stems: {} };
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AudioAsset>;
  if (candidate.version !== 1 || !(candidate.original instanceof Blob)) return null;
  const stems = Object.fromEntries(INSTRUMENTS.filter(kind => candidate.stems?.[kind] instanceof Blob).map(kind => [kind, candidate.stems![kind]]));
  return { version: 1, original: candidate.original, stems };
}

const DATABASE_NAME = "midi-stage-audio";
const STORE_NAME = "tracks";

/** Each operation owns its connection; unavailable storage never prevents a session. */
function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (database: IDBDatabase | null) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    try {
      if (typeof indexedDB === "undefined") {
        finish(null);
        return;
      }
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        finish(database);
      };
      request.onerror = () => finish(null);
      // A blocked open can later succeed; finish closes that late connection.
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
  result: (value: unknown) => T,
  fallback: T,
): Promise<T> {
  const database = await openDatabase();
  if (!database) return fallback;
  return new Promise((resolve) => {
    let transaction: IDBTransaction | undefined;
    let settled = false;
    let failed = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(value);
    };
    try {
      transaction = database.transaction(STORE_NAME, mode);
      transaction.onabort = () => finish(fallback);
      transaction.onerror = () => {
        failed = true;
      };
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onerror = () => {
        failed = true;
      };
      // A successful request can still be rolled back (for example, by quota errors).
      // Only report success after the entire transaction has committed.
      transaction.oncomplete = () => {
        try {
          finish(failed ? fallback : result(request.result));
        } catch {
          finish(fallback);
        }
      };
    } catch {
      if (transaction) {
        try {
          transaction.abort();
        } catch {
          finish(fallback);
        }
      } else {
        finish(fallback);
      }
    }
  });
}

export function saveAudioAsset(id: string, file: Blob | AudioAsset): Promise<boolean> {
  return transact(
    "readwrite",
    (store) => store.put(file, id),
    () => true,
    false,
  );
}

export function loadAudioAsset(id: string): Promise<Blob | null> {
  return transact(
    "readonly",
    (store) => store.get(id),
    (value) => parseAudioAsset(value)?.original ?? null,
    null,
  );
}

export function loadAudioBundle(id: string): Promise<AudioAsset | null> {
  return transact("readonly", store => store.get(id), parseAudioAsset, null);
}

export async function deleteAudioAsset(id: string): Promise<void> {
  await transact(
    "readwrite",
    (store) => store.delete(id),
    () => undefined,
    undefined,
  );
}
