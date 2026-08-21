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
    // 1. 빈 데이터가 들어오면 기존 DB를 지우지 않고 즉시 중단
    if (!imagesObj || Object.keys(imagesObj).length === 0) return;

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('images', 'readwrite');
            const store = tx.objectStore('images');
            
            store.clear();
            for (const [key, val] of Object.entries(imagesObj)) {
                // 2. 새로고침 시 파기되는 blob: URL 검출 시 콘솔 경고
                if (typeof val === 'string' && val.startsWith('blob:')) {
                    console.warn(`⚠️ [${key}] 이미지가 blob: URL 상태입니다. Base64 문자열이나 File 객체로 저장해야 새로고침 후 유지됩니다.`);
                }
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
};const dbName = "VocabAppDB";

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
    // 1. 빈 데이터가 들어오면 기존 DB를 지우지 않고 즉시 중단
    if (!imagesObj || Object.keys(imagesObj).length === 0) return;

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('images', 'readwrite');
            const store = tx.objectStore('images');
            
            store.clear();
            for (const [key, val] of Object.entries(imagesObj)) {
                // 2. 새로고침 시 파기되는 blob: URL 검출 시 콘솔 경고
                if (typeof val === 'string' && val.startsWith('blob:')) {
                    console.warn(`⚠️ [${key}] 이미지가 blob: URL 상태입니다. Base64 문자열이나 File 객체로 저장해야 새로고침 후 유지됩니다.`);
                }
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
