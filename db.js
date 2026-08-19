const dbName = "VocabAppDB";

const openDB = () => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('images')) {
                db.createObjectStore('images');
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e);
    });
};

const saveImagesToIDB = async (imagesObj) => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('images', 'readwrite');
            const store = tx.objectStore('images');
            store.clear();
            for (const [key, val] of Object.entries(imagesObj)) {
                store.put(val, key.toLowerCase());
            }
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    } catch (e) {
        console.warn('IndexedDB 저장 오류:', e);
    }
};

const loadImagesFromIDB = async () => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('images', 'readonly');
            const store = tx.objectStore('images');
            const req = store.openCursor();
            const result = {};
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    result[cursor.key] = cursor.value;
                    cursor.continue();
                } else {
                    resolve(result);
                }
            };
            req.onerror = (e) => reject(e);
        });
    } catch (e) {
        return {};
    }
};