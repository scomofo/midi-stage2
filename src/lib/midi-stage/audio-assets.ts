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

export function saveAudioAsset(id: string, file: Blob): Promise<boolean> {
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
    (value) => (value instanceof Blob ? value : null),
    null,
  );
}

export async function deleteAudioAsset(id: string): Promise<void> {
  await transact(
    "readwrite",
    (store) => store.delete(id),
    () => undefined,
    undefined,
  );
}
