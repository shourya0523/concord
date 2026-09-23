/**
 * Process-wide in-memory stores for the no-DATABASE_URL fallback.
 *
 * Next.js bundles each route handler separately, so a plain module-level Map
 * in `lib/data/*` is a different object in `/api/notes` than in
 * `/api/notes/[id]`. Keying the Map on globalThis gives every route in the
 * server process the same store (and survives dev hot reloads).
 */
const STORE_KEY = Symbol.for("concord.memoryStores");

type StoreRegistry = Map<string, Map<unknown, unknown>>;

function registry(): StoreRegistry {
  const holder = globalThis as typeof globalThis & { [STORE_KEY]?: StoreRegistry };
  holder[STORE_KEY] ??= new Map();
  return holder[STORE_KEY];
}

export function memoryStore<K, V>(name: string): Map<K, V> {
  const stores = registry();
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store as Map<K, V>;
}
