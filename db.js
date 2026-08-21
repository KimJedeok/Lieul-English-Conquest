/**
 * db.js - IndexedDB 매니저 파일
 * 전역 변수 충돌 방지를 위해 즉시 실행 함수(IIFE) 스코프로 감싸져 있습니다.
 */
(() => {
    // DB 관련 상수 정의 (IIFE 내부로 격리되어 전역 충돌을 일으키지 않습니다)
    const DB_NAME = "VocabAppDB";
    const DB_VERSION = 1;
    const STORE_NAME = "images";

    // IndexedDB 연결 함수
    const openDB = () => {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
    };

    // IndexedDB에 이미지 저장
    const saveImagesToIDB = async (imagesObj) => {
        if (!imagesObj || typeof imagesObj !== 'object') {
            console.warn('저장할 올바른 데이터 객체가 제공되지 않았습니다.');
            return;
        }

        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);

                store.clear();

                for (const [key, val] of Object.entries(imagesObj)) {
                    store.put(val, key.toLowerCase());
                }

                tx.oncomplete = () => resolve(true);
                tx.onerror = (e) => reject(e.target.error);
            });
        } catch (e) {
            console.warn('IndexedDB 저장 오류:', e);
            throw e;
        }
    };

    // IndexedDB에서 이미지 불러오기
    const loadImagesFromIDB = async () => {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
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

                req.onerror = (e) => reject(e.target.error);
            });
        } catch (e) {
            console.warn('IndexedDB 로드 오류:', e);
            return {};
        }
    };

    // 전역(window)에서 호출 가능하도록 함수 등록
    window.saveImagesToIDB = saveImagesToIDB;
    window.loadImagesFromIDB = loadImagesFromIDB;
})();
