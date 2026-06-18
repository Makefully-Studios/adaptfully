/* global indexedDB, window */

(function registerIndexedDBStorage(ns) {
    function configValue(key, fallback) {
        if (!ns.has('config')) {
            return fallback;
        }
        const config = ns.get('config');
        return config?.[key] != null ? config[key] : fallback;
    }

    ns.storage.IndexedDB = function indexedDBFactory() {
        const dbName = configValue('indexedDBName', 'adaptfully');
        const storeName = configValue('indexedDBStoreName', 'storage');
        /** @type {Promise<IDBDatabase> | null} */
        let dbPromise = null;

        function openDb() {
            if (!dbPromise) {
                dbPromise = new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbName, 1);
                    request.onupgradeneeded = () => {
                        request.result.createObjectStore(storeName);
                    };
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }
            return dbPromise;
        }

        function withStore(mode, fn) {
            return openDb().then((db) => new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, mode);
                const store = tx.objectStore(storeName);
                const request = fn(store);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }));
        }

        return {
            name: 'indexedDB',
            async get(field) {
                try {
                    const value = await withStore('readonly', (store) => store.get(field));
                    return value === undefined ? false : value;
                } catch {
                    return false;
                }
            },
            async set(field, value) {
                await this.remove(field);
                try {
                    await withStore('readwrite', (store) => store.put(value, field));
                } catch {
                    // ignore
                }
            },
            async remove(field) {
                try {
                    await withStore('readwrite', (store) => store.delete(field));
                } catch {
                    // ignore
                }
            },
            async getObject(field) {
                const raw = await this.get(field);
                if (!raw) {
                    return false;
                }
                try {
                    return JSON.parse(raw);
                } catch {
                    return false;
                }
            },
            async setObject(field, obj) {
                try {
                    await this.set(field, JSON.stringify(obj));
                } catch {
                    // ignore
                }
            },
        };
    };
}(window.adaptfully));
