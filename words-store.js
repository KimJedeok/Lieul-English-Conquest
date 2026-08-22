// words-store.js
const { ref, computed, watch } = Vue;

export function useWordsStore() {
    const allWords = ref([]);
    const learnedWordIDs = ref([]);
    const savedDate = ref('');
    const imageMap = ref({});
    const wordStats = ref({});

    // IDB 안전 접근 함수
    const safeLoadImagesFromIDB = async () => {
        if (typeof loadImagesFromIDB === 'function') {
            return await loadImagesFromIDB();
        }
        return {};
    };

    const safeSaveImagesToIDB = async (imgs) => {
        if (typeof saveImagesToIDB === 'function') {
            await saveImagesToIDB(imgs);
        }
    };

    // 통계 기록
    const recordAttempt = (wordId, isCorrect) => {
        if (!wordId) return;
        if (!wordStats.value[wordId]) {
            wordStats.value[wordId] = { correct: 0, total: 0 };
        }
        wordStats.value[wordId].total += 1;
        if (isCorrect) wordStats.value[wordId].correct += 1;

        try {
            localStorage.setItem('vocab_word_stats', JSON.stringify(wordStats.value));
        } catch (e) {}
    };

    const getWordAccuracy = (wordId) => {
        const stat = wordStats.value[wordId];
        if (!stat || stat.total === 0) return null;
        return Math.round((stat.correct / stat.total) * 100);
    };

    const getAccuracyBadgeClass = (rate) => {
        if (rate === null) return 'bg-purple-50 text-purple-600 border-purple-200';
        if (rate >= 80) return 'bg-emerald-100 text-emerald-700 border-emerald-300';
        if (rate >= 50) return 'bg-amber-100 text-amber-700 border-amber-300';
        return 'bg-pink-100 text-pink-700 border-pink-300';
    };

    // 로컬 데이터 로드
    const loadStoredData = async () => {
        try {
            const savedWords = localStorage.getItem('vocab_all_words');
            const savedLearned = localStorage.getItem('vocab_learned_ids');
            const savedDateVal = localStorage.getItem('vocab_saved_date');
            const savedStats = localStorage.getItem('vocab_word_stats');

            if (savedWords) allWords.value = JSON.parse(savedWords);
            if (savedLearned) learnedWordIDs.value = JSON.parse(savedLearned);
            if (savedDateVal) savedDate.value = savedDateVal;
            if (savedStats) wordStats.value = JSON.parse(savedStats);

            imageMap.value = await safeLoadImagesFromIDB();
        } catch (e) {
            console.error('데이터 로드 오류:', e);
        }
    };

    // 변경사항 저장 감시
    watch(learnedWordIDs, (newVal) => {
        try {
            localStorage.setItem('vocab_learned_ids', JSON.stringify(newVal));
        } catch (e) {}
    }, { deep: true });

    // 단어 데이터 파싱 및 저장
    const parseAndSaveWords = (raw) => {
        let list = Array.isArray(raw) ? raw : (raw?.words || raw?.data || raw?.items || []);
        if (!Array.isArray(list) || list.length === 0) {
            alert('❌ 단어장에 유효한 단어 데이터가 없습니다.');
            return;
        }

        const parsed = list.map((item, idx) => {
            const norm = {};
            Object.keys(item).forEach(k => {
                const cleanKey = k.toLowerCase().replace(/_/g, '').replace(/ /g, '');
                norm[cleanKey] = item[k];
            });

            const getVal = (keys) => {
                for (let k of keys) {
                    if (norm[k] !== undefined && norm[k] !== null && String(norm[k]).trim() !== '') {
                        return String(norm[k]).trim();
                    }
                }
                return '';
            };

            return {
                id: idx + 1,
                week: parseInt(getVal(['week', 'w'])) || 1,
                day: getVal(['day', 'd']) || 'Mon',
                english: getVal(['english', 'word', 'eng', 'vocab', 'target']) || 'No Word',
                meaning: getVal(['meaning', 'korean', 'kor', 'trans', 'def', 'mean']) || '뜻 없음',
                example: getVal(['example', 'examplesentence', 'sentence', 'ex']),
                exampleMeaning: getVal(['examplemeaning', 'sentencemeaning', 'examplekorean', 'exmeaning']),
                imageFileName: getVal(['imagefilename', 'filename', 'customimageurl', 'imageurl', 'image', 'img', 'file', 'photo', 'picture']) || null
            };
        });

        allWords.value = parsed;
        learnedWordIDs.value = [];
        const now = new Date();
        const formattedDate = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        savedDate.value = formattedDate;

        try {
            localStorage.setItem('vocab_all_words', JSON.stringify(parsed));
            localStorage.setItem('vocab_learned_ids', JSON.stringify([]));
            localStorage.setItem('vocab_saved_date', formattedDate);
        } catch (e) {}

        alert(`✅ 총 ${parsed.length}개 단어가 저장되었습니다! 🌸`);
    };

    const availableWeeks = computed(() => [...new Set(allWords.value.map(w => Number(w.week) || 1))].sort((a, b) => a - b));

    const getWords = (week, day) => {
        const wStr = String(week);
        if (day === 'Sat') {
            return allWords.value.filter(w => String(w.week) === wStr && String(w.day).toLowerCase() !== 'sat');
        }
        const dLower = String(day).toLowerCase();
        return allWords.value.filter(w => {
            const isWeekMatch = String(w.week) === wStr;
            const wDayLower = String(w.day).toLowerCase();
            return isWeekMatch && (
                wDayLower === dLower ||
                (dLower === 'mon' && ['mon', '1'].includes(wDayLower)) ||
                (dLower === 'tue' && ['tue', '2'].includes(wDayLower)) ||
                (dLower === 'wed' && ['wed', '3'].includes(wDayLower)) ||
                (dLower === 'thu' && ['thu', '4'].includes(wDayLower)) ||
                (dLower === 'fri' && ['fri', '5'].includes(wDayLower))
            );
        });
    };

    const isLearned = (word) => learnedWordIDs.value.includes(word.id);
    const markAsLearned = (word) => {
        if (!isLearned(word)) learnedWordIDs.value.push(word.id);
    };

    const getWeakWords = (currentWeek, count = 15) => {
        let weekWords = getWords(currentWeek, 'Sat') || [];
        if (weekWords.length === 0) weekWords = allWords.value.filter(w => String(w.week) === String(currentWeek));
        if (weekWords.length === 0) return [];

        return [...weekWords].sort((a, b) => {
            const accA = Number(getWordAccuracy(a.id)) || 0;
            const accB = Number(getWordAccuracy(b.id)) || 0;
            return accA - accB;
        }).slice(0, count);
    };

    return {
        allWords, learnedWordIDs, savedDate, imageMap, wordStats, availableWeeks,
        loadStoredData, parseAndSaveWords, safeSaveImagesToIDB, recordAttempt,
        getWordAccuracy, getAccuracyBadgeClass, getWords, isLearned, markAsLearned, getWeakWords
    };
}