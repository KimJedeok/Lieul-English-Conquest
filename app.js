const { createApp, ref, computed, watch, nextTick, onMounted } = Vue;

createApp({
    setup() {
        // Base State
        const activeScreen = ref('home');
        const allWords = ref([]);
        const learnedWordIDs = ref([]);
        const satCompletedWeeks = ref([]); // 토요일 복습 완료 주차 관리
        const savedDate = ref('');
        const imageMap = ref({});
        const currentWeek = ref(1);
        const selectedDay = ref('Mon');
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // 토요일 주말 종합 복습 전용 상태값
        const satStage = ref(1);             // 1: 힌트, 2: 음성/뜻, 3: 스피드
        const satWordIndex = ref(0);         // 현재 출제 문제 인덱스
        const satQuizList = ref([]);          // 토요일 복습 대상 단어 리스트
        const satCorrectCount = ref(0);       // 맞힌 개수
        const satTotalQuestions = ref(55);    // 총 문항 수 (15+15+25)
        const satFeedbackMessage = ref('');   // 피드백 메시지
        const satComboCount = ref(0);         // 연속 정답 콤보

        const wordStats = ref({});
        const isReplayingDay = ref(false);

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

        const currentIndex = ref(0);
        const currentMode = ref('practice');
        const practiceText = ref('');
        const practiceCount = ref(0);
        const quizText = ref('');
        const isDayCompleted = ref(false);

        // Stage 2 Sub-State
        const quizSubStage = ref(1);
        const quizPart1Count = ref(0);
        const quizPart2Count = ref(0);
        const quizBlanks = ref([]);

        // Sound Blind Hint States
        const soundBlindFailCount = ref(0);
        const hintLevel = ref(0);

        // Stage 3 States
        const stage3Active = ref(false);
        const stage3List = ref([]);
        const stage3Index = ref(0);
        const stage3AnswerRevealed = ref(false);

        // DOM Refs
        const practiceInput = ref(null);
        const quizInput = ref(null);
        const canvasRef = ref(null);
        const fileInput = ref(null);

        const showConfirmModal = ref(false);

        const resizeCanvas = () => {
            const canvas = document.getElementById('pencilCanvas');
            if (canvas && canvas.parentElement) {
                const rect = canvas.parentElement.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    canvas.width = Math.floor(rect.width);
                    canvas.height = Math.floor(rect.height);
                }
            }
        };

        onMounted(async () => {
            try {
                const savedWords = localStorage.getItem('vocab_all_words');
                const savedLearned = localStorage.getItem('vocab_learned_ids');
                const savedSatCompleted = localStorage.getItem('vocab_sat_completed');
                const savedDateVal = localStorage.getItem('vocab_saved_date');
                const savedStats = localStorage.getItem('vocab_word_stats');

                if (savedWords) allWords.value = JSON.parse(savedWords);
                if (savedLearned) learnedWordIDs.value = JSON.parse(savedLearned);
                if (savedSatCompleted) satCompletedWeeks.value = JSON.parse(savedSatCompleted);
                if (savedDateVal) savedDate.value = savedDateVal;
                if (savedStats) wordStats.value = JSON.parse(savedStats);

                if (typeof loadImagesFromIDB === 'function') {
                    imageMap.value = await loadImagesFromIDB();
                }
            } catch (e) {
                console.error('데이터 로드 오류:', e);
            }

            window.addEventListener('resize', () => {
                if (stage3Active.value && currentStage3Item.value?.type === 'pencil') {
                    resizeCanvas();
                }
            });
        });

        watch(learnedWordIDs, (newVal) => {
            try {
                localStorage.setItem('vocab_learned_ids', JSON.stringify(newVal));
            } catch (e) {}
        }, { deep: true });

        watch(satCompletedWeeks, (newVal) => {
            try {
                localStorage.setItem('vocab_sat_completed', JSON.stringify(newVal));
            } catch (e) {}
        }, { deep: true });

        const openConfirmModal = () => showConfirmModal.value = true;
        const confirmLoadFile = () => {
            showConfirmModal.value = false;
            if (fileInput.value) fileInput.value.click();
        };
        const cancelLoadFile = () => showConfirmModal.value = false;

        const handleFileUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                if (typeof JSZip === 'undefined' && file.name.toLowerCase().endsWith('.zip')) {
                    alert('❌ JSZip 라이브러리가 준비되지 않았습니다. 인터넷 연결을 확인 후 새로고침해 주세요.');
                    e.target.value = '';
                    return;
                }

                if (file.name.toLowerCase().endsWith('.zip')) {
                    const zip = await JSZip.loadAsync(file);
                    const isRealFile = (f) => {
                        const name = f.name;
                        const fileName = name.split('/').pop();
                        return !name.includes('__MACOSX') && !fileName.startsWith('.') && !f.dir;
                    };

                    const jsonFiles = zip.file(/\.json$/i).filter(isRealFile);
                    if (jsonFiles.length === 0) {
                        alert('❌ ZIP 파일 내부에 .json 단어장 파일이 없습니다.');
                        e.target.value = '';
                        return;
                    }

                    let jsonText = await jsonFiles[0].async('text');
                    jsonText = jsonText.replace(/^﻿/, '');
                    let raw = JSON.parse(jsonText);

                    const imageFiles = zip.file(/\.(png|jpe?g|webp|gif|svg)$/i).filter(isRealFile);
                    const extractedImages = {};

                    for (const imgFile of imageFiles) {
                        const fullPath = imgFile.name;
                        const fileName = fullPath.split('/').pop();
                        const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')).toLowerCase();
                        const base64 = await imgFile.async('base64');
                        let mime = 'image/jpeg';
                        const lowerName = fileName.toLowerCase();
                        if (lowerName.endsWith('.png')) mime = 'image/png';
                        else if (lowerName.endsWith('.webp')) mime = 'image/webp';
                        else if (lowerName.endsWith('.gif')) mime = 'image/gif';
                        else if (lowerName.endsWith('.svg')) mime = 'image/svg+xml';

                        const dataUrl = `data:${mime};base64,${base64}`;
                        extractedImages[lowerName] = dataUrl;
                        extractedImages[fileNameWithoutExt] = dataUrl;
                    }

                    if (typeof saveImagesToIDB === 'function') {
                        await saveImagesToIDB(extractedImages);
                    }
                    imageMap.value = extractedImages;
                    parseAndSaveWords(raw);

                } else if (file.name.toLowerCase().endsWith('.json')) {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            let text = event.target.result.replace(/^﻿/, '');
                            const raw = JSON.parse(text);
                            if (typeof saveImagesToIDB === 'function') {
                                await saveImagesToIDB({});
                            }
                            imageMap.value = {};
                            parseAndSaveWords(raw);
                        } catch (err) {
                            alert(`❌ JSON 문법 오류: ${err.message}`);
                        }
                    };
                    reader.readAsText(file);
                }
            } catch (err) {
                alert(`❌ 파일을 처리하는 중 오류가 발생했습니다.\n\n오류 상세: ${err.message || err}`);
            }
            e.target.value = '';
        };

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

                const engWord = getVal(['english', 'word', 'eng', 'vocab', 'target']) || 'No Word';

                return {
                    id: idx + 1,
                    week: parseInt(getVal(['week', 'w'])) || 1,
                    day: getVal(['day', 'd']) || 'Mon',
                    english: engWord,
                    word: engWord, // 연동 호환성을 위해 word 키 추가
                    meaning: getVal(['meaning', 'korean', 'kor', 'trans', 'def', 'mean']) || '뜻 없음',
                    example: getVal(['example', 'examplesentence', 'sentence', 'ex']),
                    exampleMeaning: getVal(['examplemeaning', 'sentencemeaning', 'examplekorean', 'exmeaning']),
                    imageFileName: getVal(['customimageurl', 'imageurl', 'image', 'img']) || null
                };
            });

            allWords.value = parsed;
            learnedWordIDs.value = [];
            satCompletedWeeks.value = [];
            const now = new Date();
            const formattedDate = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            savedDate.value = formattedDate;

            try {
                localStorage.setItem('vocab_all_words', JSON.stringify(parsed));
                localStorage.setItem('vocab_learned_ids', JSON.stringify([]));
                localStorage.setItem('vocab_sat_completed', JSON.stringify([]));
                localStorage.setItem('vocab_saved_date', formattedDate);
            } catch (e) {}

            alert(`✅ 총 ${parsed.length}개 단어가 저장되었습니다! 🌸`);
        };

        const availableWeeks = computed(() => [...new Set(allWords.value.map(w => w.week))].sort((a, b) => a - b));
        
        const getWords = (week, day) => {
            if (!Array.isArray(allWords.value)) return [];
            if (day === 'Sat') {
                return allWords.value.filter(w => String(w.week) === String(week) && w.day !== 'Sat');
            }
            return allWords.value.filter(w => String(w.week) === String(week) && String(w.day).toLowerCase() === String(day).toLowerCase());
        };
        
        const isLearned = (word) => word && learnedWordIDs.value.includes(word.id);
        const markAsLearned = (word) => {
            if (word && !isLearned(word)) learnedWordIDs.value.push(word.id);
        };

        const isWeekCompleted = (week) => {
            const words = allWords.value.filter(w => w.week === week);
            const allWordsLearned = words.length > 0 && words.every(w => isLearned(w));
            return allWordsLearned && satCompletedWeeks.value.includes(week);
        };

        const isWeekUnlocked = (week) => true;

        const isDayDone = (week, day) => {
            if (day === 'Sat') {
                return satCompletedWeeks.value.includes(week);
            }
            const words = getWords(week, day);
            return words.length > 0 && words.every(w => isLearned(w));
        };

        const isDayUnlocked = (week, day) => {
            const targetIdx = days.indexOf(day);
            if (targetIdx === 0) return true;

            for (let i = 0; i < targetIdx; i++) {
                const prevDayWords = getWords(week, days[i]);
                if (prevDayWords.length > 0 && !prevDayWords.every(w => isLearned(w))) return false;
            }
            return true;
        };

        const overallProgressRate = computed(() => allWords.value.length === 0 ? 0 : learnedWordIDs.value.length / allWords.value.length);
        
        const getWeekProgressRate = (week) => {
            const words = allWords.value.filter(w => w.week === week);
            if (words.length === 0) return 0;
            const learnedCount = words.filter(w => isLearned(w)).length;
            const satDone = satCompletedWeeks.value.includes(week) ? 1 : 0;
            return (learnedCount + (satDone ? (words.length * 0.2) : 0)) / (words.length * 1.2);
        };

        const todayLesson = computed(() => {
            for (let w of availableWeeks.value) {
                for (let d of days) {
                    if (isDayUnlocked(w, d) && !isDayDone(w, d)) {
                        return { week: w, day: d };
                    }
                }
            }
            return { week: availableWeeks.value[0] || 1, day: 'Mon' };
        });

        const getDayBtnClass = (week, day) => {
            if (isDayDone(week, day)) return 'bg-emerald-100 text-emerald-700 font-extrabold';
            if (isDayUnlocked(week, day)) return 'bg-pink-100 text-pink-600 hover:bg-pink-200 border border-pink-200 font-extrabold';
            return 'bg-purple-50 text-purple-200';
        };

        const currentWordList = computed(() => getWords(currentWeek.value, selectedDay.value));
        const currentWord = computed(() => currentWordList.value[currentIndex.value] || null);

        // [안전 강화] 토요일 복습 전용 현재 단어 (Null 반환 방지)
        const satCurrentWord = computed(() => {
            const list = satQuizList.value || [];
            const index = satWordIndex.value || 0;
            return list[index] || { id: '', english: '', word: '', meaning: '', example: '', exampleMeaning: '' };
        });
        
        const learnedInDayCount = computed(() => currentWordList.value.filter(w => isLearned(w)).length);
        const currentStage3Item = computed(() => stage3List.value[stage3Index.value] || null);

        const startLesson = (week, day) => {
            currentWeek.value = week;
            selectedDay.value = day;
            activeScreen.value = 'learning';
            
            if (day === 'Sat') {
                startSaturdayReview();
            } else {
                resetDayProgress();
            }
        };

        const changeDay = (day) => {
            isReplayingDay.value = false;
            selectedDay.value = day;
            resetDayProgress();
        };

        const resetDayProgress = (forceStartOver = false) => {
            stage3Active.value = false;
            const firstUnlearnedIdx = currentWordList.value.findIndex(w => !isLearned(w));

            if (!forceStartOver && firstUnlearnedIdx !== -1) {
                currentIndex.value = firstUnlearnedIdx;
                isDayCompleted.value = false;
            } else if (!forceStartOver && (firstUnlearnedIdx === -1 || selectedDay.value === 'Sat')) {
                currentIndex.value = 0;
                isDayCompleted.value = isDayDone(currentWeek.value, selectedDay.value);
            } else {
                currentIndex.value = 0;
                isDayCompleted.value = false;
            }

            currentMode.value = 'practice';
            practiceText.value = '';
            practiceCount.value = 0;
            quizText.value = '';
            quizSubStage.value = 1;
            quizPart1Count.value = 0;
            quizPart2Count.value = 0;
            quizBlanks.value = [];
            soundBlindFailCount.value = 0;
            hintLevel.value = 0;

            focusInput();
            if (!isDayCompleted.value && currentWord.value && typeof speak === 'function') {
                speak(currentWord.value.english, 0.75);
            }
        };

        const resetAllProgress = () => {
            if (confirm('정말로 모든 주차의 학습 진도를 초기화하시겠습니까? 🌸')) {
                learnedWordIDs.value = [];
                satCompletedWeeks.value = [];
            }
        };

        const resetWeekProgress = (week) => {
            if (confirm(`${week}주차의 학습 진도만 초기화하시겠습니까? 🌸\n(다른 주차의 진도는 그대로 보존됩니다)`)) {
                const weekWordIDs = allWords.value.filter(w => w.week === week).map(w => w.id);
                learnedWordIDs.value = learnedWordIDs.value.filter(id => !weekWordIDs.includes(id));
                satCompletedWeeks.value = satCompletedWeeks.value.filter(wNum => wNum !== week);
            }
        };

        const resetDayProgressFromUI = () => {
            const w = currentWeek.value;
            const d = selectedDay.value;

            if (d === 'Sat') {
                if (confirm(`${w}주차 토요일 주말 복습 기록만 초기화하시겠습니까? 🌸\n(월~금요일 학습 단어는 삭제되지 않고 유지됩니다)`)) {
                    satCompletedWeeks.value = satCompletedWeeks.value.filter(weekNum => weekNum !== w);
                    resetDayProgress(true);
                }
            } else {
                const targetIdx = days.indexOf(d);
                const affectedDays = days.slice(targetIdx, 5);
                const affectedWords = allWords.value.filter(word => word.week === w && affectedDays.includes(word.day));
                const affectedIDs = affectedWords.map(word => word.id);

                if (confirm(`${w}주차 ${d}요일부터 금요일까지의 진도를 초기화하시겠습니까? 🌸\n(이전 요일 및 다른 주차의 진도는 안전하게 보존됩니다)`)) {
                    learnedWordIDs.value = learnedWordIDs.value.filter(id => !affectedIDs.includes(id));
                    satCompletedWeeks.value = satCompletedWeeks.value.filter(weekNum => weekNum !== w);
                    resetDayProgress(true);
                }
            }
        };

        const focusInput = () => {
            nextTick(() => {
                if (currentMode.value === 'practice' && practiceInput.value) {
                    practiceInput.value.focus();
                } else if (currentMode.value === 'quiz' && quizInput.value) {
                    quizInput.value.focus();
                }
            });
        };

        const clearPracticeInput = () => { practiceText.value = ''; focusInput(); };
        const clearQuizInput = () => { quizText.value = ''; focusInput(); };

        const isCharCorrect = (char, idx) => {
            if (!currentWord.value) return false;
            return idx < currentWord.value.english.length && char.toLowerCase() === currentWord.value.english[idx].toLowerCase();
        };

        const onPracticeInput = (e) => {
            if (!currentWord.value) return;
            const val = practiceText.value;
            const target = currentWord.value.english;
            if (val.length > 0) {
                const lastIdx = val.length - 1;
                if (lastIdx < target.length && val[lastIdx].toLowerCase() === target[lastIdx].toLowerCase()) {
                    if (typeof playTypingSound === 'function') playTypingSound();
                } else {
                    if (typeof playErrorSound === 'function') playErrorSound();
                }
            }
        };

        const onQuizInput = (e) => {
            if (!currentWord.value) return;
            const val = quizText.value;
            const target = currentWord.value.english;

            if (val.length > 0) {
                if (quizSubStage.value === 1) {
                    const lastIdx = val.length - 1;
                    if (lastIdx < target.length && val[lastIdx].toLowerCase() === target[lastIdx].toLowerCase()) {
                        if (typeof playTypingSound === 'function') playTypingSound();
                    } else {
                        if (typeof playErrorSound === 'function') playErrorSound();
                    }
                } else {
                    if (typeof playTypingSound === 'function') playTypingSound();
                }
            }
        };

        const generateQuizBlanks = (attemptNumber) => {
            if (!currentWord.value) return;
            const len = currentWord.value.english.length;
            let blankCount = len <= 3 ? 1 : (len <= 6 ? (attemptNumber === 1 ? 1 : 2) : (attemptNumber === 1 ? 2 : 3));
            blankCount = Math.min(blankCount, len);

            const indices = [];
            while (indices.length < blankCount) {
                const rand = Math.floor(Math.random() * len);
                if (!indices.includes(rand)) indices.push(rand);
            }
            quizBlanks.value = indices;
        };

        const submitPractice = () => {
            if (!currentWord.value) return;
            if (practiceText.value.trim().toLowerCase() === currentWord.value.english.toLowerCase()) {
                recordAttempt(currentWord.value.id, true);
                if (typeof playCorrectSound === 'function') playCorrectSound();
                practiceCount.value++;
                practiceText.value = '';

                if (practiceCount.value >= 3) {
                    currentMode.value = 'quiz';
                    quizSubStage.value = 1;
                    quizPart1Count.value = 0;
                    quizPart2Count.value = 0;
                    soundBlindFailCount.value = 0;
                    hintLevel.value = 0;
                    quizText.value = '';
                    generateQuizBlanks(1);
                    focusInput();
                }
            } else {
                recordAttempt(currentWord.value.id, false);
                if (typeof playErrorSound === 'function') playErrorSound();
                practiceText.value = '';
            }
        };

        const getMaskedWord = (word) => word ? word[0] + ' _'.repeat(word.length - 1) : '';

        const triggerHint = () => {
            if (hintLevel.value < 2) {
                hintLevel.value++;
                focusInput();
            }
        };

        const submitQuiz = () => {
            if (!currentWord.value) return;
            const target = currentWord.value.english;

            if (quizText.value.trim().toLowerCase() === target.toLowerCase()) {
                recordAttempt(currentWord.value.id, true);
                if (typeof playCorrectSound === 'function') playCorrectSound();
                quizText.value = '';

                if (quizSubStage.value === 1) {
                    quizPart1Count.value++;
                    if (quizPart1Count.value >= 3) {
                        quizSubStage.value = 2;
                        soundBlindFailCount.value = 0;
                        hintLevel.value = 0;
                        focusInput();
                        if (typeof speak === 'function') speak(currentWord.value.english, 0.75);
                    } else {
                        generateQuizBlanks(quizPart1Count.value + 1);
                        focusInput();
                    }
                } else if (quizSubStage.value === 2) {
                    if (hintLevel.value === 2) {
                        moveToNextWordOrStage3();
                        return;
                    }

                    quizPart2Count.value++;
                    soundBlindFailCount.value = 0;
                    hintLevel.value = 0;

                    if (quizPart2Count.value >= 2) {
                        moveToNextWordOrStage3();
                    } else {
                        focusInput();
                        if (typeof speak === 'function') speak(currentWord.value.english, 0.75);
                    }
                }
            } else {
                recordAttempt(currentWord.value.id, false);
                if (typeof playErrorSound === 'function') playErrorSound();
                if (quizSubStage.value === 2) soundBlindFailCount.value++;
                quizText.value = '';
            }

            if (currentIndex.value >= currentWordList.value.length - 1) {
                isReplayingDay.value = false;
            }
        };

        const moveToNextWordOrStage3 = () => {
            practiceText.value = '';
            practiceCount.value = 0;
            quizSubStage.value = 1;
            quizPart1Count.value = 0;
            quizPart2Count.value = 0;
            soundBlindFailCount.value = 0;
            hintLevel.value = 0;
            currentMode.value = 'practice';

            if (currentIndex.value + 1 < currentWordList.value.length) {
                currentIndex.value++;
                focusInput();
                if (typeof speak === 'function') speak(currentWord.value.english, 0.75);
            } else {
                startStage3();
            }
        };

        const generateMCQOptions = (targetWord) => {
            const options = [targetWord.english];
            const pool = currentWordList.value.filter(w => w.english.toLowerCase() !== targetWord.english.toLowerCase());
            const shuffledPool = [...pool].sort(() => 0.5 - Math.random());

            for (let i = 0; i < Math.min(2, shuffledPool.length); i++) {
                options.push(shuffledPool[i].english);
            }

            if (options.length < 3) {
                const globalPool = allWords.value.filter(w => !options.includes(w.english));
                const shuffledGlobal = [...globalPool].sort(() => 0.5 - Math.random());
                for (let i = 0; options.length < 3 && i < shuffledGlobal.length; i++) {
                    options.push(shuffledGlobal[i].english);
                }
            }
            return options.sort(() => 0.5 - Math.random());
        };

        const startStage3 = () => {
            const list = [];
            
            const shuffledPencil = [...currentWordList.value].sort(() => 0.5 - Math.random());
            shuffledPencil.forEach(w => {
                list.push({ word: w, type: 'pencil' });
            });

            const exampleWords = currentWordList.value.filter(w => w.example);
            const shuffledExample = [...exampleWords].sort(() => 0.5 - Math.random());
            shuffledExample.forEach(w => {
                list.push({
                    word: w,
                    type: 'example',
                    mcqOptions: generateMCQOptions(w)
                });
            });

            stage3List.value = list;
            stage3Index.value = 0;
            stage3Active.value = true;
            isDayCompleted.value = false;
            initStage3Question();
        };

        const initStage3Question = () => {
            stage3AnswerRevealed.value = false;

            nextTick(() => {
                if (currentStage3Item.value) {
                    if (currentStage3Item.value.type === 'pencil') {
                        resizeCanvas();
                        clearCanvas();
                        if (typeof initPencilCanvas === 'function') {
                            initPencilCanvas('pencilCanvas');
                        }
                        if (typeof speak === 'function') speak(currentStage3Item.value.word.english, 0.75);
                    } else if (currentStage3Item.value.type === 'example') {
                        if (typeof speakSequence === 'function') {
                            speakSequence(currentStage3Item.value.word.english, currentStage3Item.value.word.example);
                        }
                    }
                }
            });
        };

        const nextStage3Question = () => {
            if (stage3Index.value + 1 < stage3List.value.length) {
                stage3Index.value++;
                initStage3Question();
            } else {
                stage3Active.value = false;
                isDayCompleted.value = true;
                
                if (selectedDay.value === 'Sat') {
                    if (!satCompletedWeeks.value.includes(currentWeek.value)) {
                        satCompletedWeeks.value.push(currentWeek.value);
                    }
                } else {
                    currentWordList.value.forEach(w => markAsLearned(w));
                }
                
                if (typeof playCorrectSound === 'function') playCorrectSound();
            }
        };

        const clearCanvasStrokesOnly = () => {
            resizeCanvas();
            if (typeof clearPencilCanvas === 'function') {
                clearPencilCanvas('pencilCanvas');
            } else if (canvasRef.value) {
                const ctx = canvasRef.value.getContext('2d');
                ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
            }
        };

        const clearCanvas = () => {
            clearCanvasStrokesOnly();
            stage3AnswerRevealed.value = false;
        };

        const praiseList = [
            "🎉 완벽해요! 정답입니다! 💖",
            "✨ 참 잘했어요! 글씨가 아주 예뻐요! 🌸",
            "👍 최고예요! 단어를 정확하게 기억하네요! 🦄",
            "💯 최고입니다! 다음 문제도 도전해봐요! ⭐️",
            "🌟 대단해요! 완벽하게 잘 썼어요! 🎀"
        ];

        const revealPencilAnswer = async () => {
            if (!currentStage3Item.value) return;
            const targetWord = currentStage3Item.value.word.english;

            if (typeof checkPencilAnswer === 'function') {
                const result = await checkPencilAnswer(targetWord, 'pencilCanvas');

                if (!result.success) {
                    if (result.reason === 'EMPTY') {
                        alert("글씨를 먼저 써주세요! ✍️");
                        return;
                    }
                    stage3AnswerRevealed.value = true;
                    if (typeof speak === 'function') speak(targetWord, 0.75);
                    return;
                }

                if (result.isCorrect) {
                    recordAttempt(currentStage3Item.value.word.id, true);
                    if (typeof playCorrectSound === 'function') playCorrectSound();
                    const randomPraise = praiseList[Math.floor(Math.random() * praiseList.length)];
                    alert(randomPraise);
                    nextStage3Question();
                } else {
                    recordAttempt(currentStage3Item.value.word.id, false);
                    if (typeof playErrorSound === 'function') playErrorSound();
                    stage3AnswerRevealed.value = true;
                    if (typeof speak === 'function') speak(targetWord, 0.75);
                    alert(`아쉬워요! AI가 '${result.recognizedText}'(으)로 읽었어요. 정답을 확인하고 다시 써볼까요? ✨`);
                    clearCanvasStrokesOnly();
                }
            } else {
                stage3AnswerRevealed.value = true;
                if (typeof speak === 'function') speak(targetWord, 0.75);
            }
        };

        const getMaskedExample = (word) => {
            if (!word || !word.example) return '';
            const regex = new RegExp(word.english, 'gi');
            return word.example.replace(regex, '_______');
        };

        const getHighlightedExampleMeaning = (word) => {
            if (!word || !word.exampleMeaning) return '';
            let text = word.exampleMeaning;
            if (!word.meaning) return text;

            const meanings = word.meaning.split(/[,/]/).map(m => m.trim()).filter(m => m.length > 0);
            meanings.forEach(m => {
                if (m && text.includes(m)) {
                    const regex = new RegExp(m, 'g');
                    text = text.replace(regex, `<span class="text-pink-500 font-extrabold underline decoration-pink-300 decoration-2 underline-offset-2">${m}</span>`);
                }
            });
            return text;
        };

        const submitStage3MCQ = (selectedOpt) => {
            if (!currentStage3Item.value) return;
            if (selectedOpt.toLowerCase() === currentStage3Item.value.word.english.toLowerCase()) {
                recordAttempt(currentStage3Item.value.word.id, true);
                if (typeof playCorrectSound === 'function') playCorrectSound();
                nextStage3Question();
            } else {
                recordAttempt(currentStage3Item.value.word.id, false);
                if (typeof playErrorSound === 'function') playErrorSound();
            }
        };

        const advanceToNextDay = () => {
            const targetIdx = days.indexOf(selectedDay.value);
            if (targetIdx < days.length - 1) {
                selectedDay.value = days[targetIdx + 1];
            } else {
                const weekIdx = availableWeeks.value.indexOf(currentWeek.value);
                if (weekIdx < availableWeeks.value.length - 1) {
                    currentWeek.value = availableWeeks.value[weekIdx + 1];
                    selectedDay.value = 'Mon';
                }
            }
            resetDayProgress();
        };

        const getWordImage = (word) => {
            if (!word) return '';
            if (word.imageFileName) {
                const lowerSpec = word.imageFileName.toLowerCase().trim();
                const specWithoutPath = lowerSpec.split('/').pop();
                const specWithoutExt = specWithoutPath.substring(0, specWithoutPath.lastIndexOf('.')) || specWithoutPath;

                if (imageMap.value[lowerSpec]) return imageMap.value[lowerSpec];
                if (imageMap.value[specWithoutPath]) return imageMap.value[specWithoutPath];
                if (imageMap.value[specWithoutExt]) return imageMap.value[specWithoutExt];
                if (word.imageFileName.startsWith('http')) return word.imageFileName;
            }

            if (imageMap.value) {
                const engLower = (word.english || word.word || '').toLowerCase().trim();
                if (imageMap.value[engLower]) return imageMap.value[engLower];
            }

            return `https://loremflickr.com/500/400/${encodeURIComponent((word.english || word.word || '').toLowerCase())},illustration,cartoon/all`;
        };

        const handleImgError = (e) => {
            e.target.src = 'https://via.placeholder.com/500x400/fff0f5/db2777?text=No+Image';
        };

        const restartStage1Only = () => {
            currentIndex.value = 0;
            currentMode.value = 'practice';
            practiceCount.value = 0;
            practiceText.value = '';
            stage3Active.value = false;
            isReplayingDay.value = true;
        };

        // [방어적 구현] 토요일 약점 단어 필터링
        const getWeakWords = (count = 15) => {
            try {
                const rawWords = Array.isArray(allWords?.value) ? allWords.value : [];
                const weekVal = currentWeek?.value ?? 1;

                let allWeekdayWords = rawWords.filter(w => {
                    if (!w) return false;
                    const isWeekMatch = String(w.week) === String(weekVal);
                    const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'mon', 'tue', 'wed', 'thu', 'fri', 1, 2, 3, 4, 5].includes(w.day);
                    return isWeekMatch && isWeekday;
                });

                if (allWeekdayWords.length === 0) {
                    allWeekdayWords = rawWords.filter(w => String(w?.week) === String(weekVal));
                }

                if (allWeekdayWords.length === 0) return [];

                const sorted = [...allWeekdayWords].sort((a, b) => {
                    const idA = a?.id || a?.english || '';
                    const idB = b?.id || b?.english || '';
                    const accA = Number(getWordAccuracy(idA)) || 0;
                    const accB = Number(getWordAccuracy(idB)) || 0;
                    return accA - accB;
                });

                return sorted.slice(0, count);
            } catch (err) {
                console.error('getWeakWords 처리 오류 예방:', err);
                return [];
            }
        };

        const startSaturdayReview = () => {
            isReplayingDay.value = true;
            satStage.value = 1;
            satWordIndex.value = 0;
            satCorrectCount.value = 0;
            satComboCount.value = 0;
            satQuizList.value = getWeakWords(15);
        };

        const getMaskedSpelling20 = (wordStr) => {
            if (!wordStr) return '';
            const len = wordStr.length;
            const hideCount = Math.max(1, Math.round(len * 0.25));
            const chars = wordStr.split('');
            
            for (let i = 0; i < hideCount; i++) {
                const targetIdx = Math.floor(len / 2) + i;
                if (targetIdx < len) chars[targetIdx] = '?';
            }
            return chars.join(' ');
        };

        const triggerSatFeedback = (isCorrect) => {
            if (isCorrect) {
                satComboCount.value++;
                const positiveMsgs = [
                    '✨ 완벽해요! 기억력이 대단해요!',
                    '🔥 연속 정답! 이대로 쭉 가볼까요?',
                    '🌸 주말 복습도 척척 해내고 있어요!',
                    '💖 대단해요! 완벽하게 외웠네요!'
                ];
                satFeedbackMessage.value = satComboCount.value >= 3 
                    ? `🔥 ${satComboCount.value}연속 정답! 대단해요!` 
                    : positiveMsgs[Math.floor(Math.random() * positiveMsgs.length)];
            } else {
                satComboCount.value = 0;
                const encourageMsgs = [
                    '💪 괜찮아요! 다음 문제에서 맞히면 돼요!',
                    '🌱 아깝네요! 다시 한번 소리를 떠올려봐요.',
                    '✨ 정답을 확인하고 다음엔 꼭 맞춰봐요!'
                ];
                satFeedbackMessage.value = encourageMsgs[Math.floor(Math.random() * encourageMsgs.length)];
            }
        };

        const nextSatQuestion = (isCorrect) => {
            triggerSatFeedback(isCorrect);
            if (isCorrect) satCorrectCount.value++;

            satWordIndex.value++;
            const currentListLen = satQuizList.value ? satQuizList.value.length : 0;

            if (satStage.value === 1 && (satWordIndex.value >= currentListLen || satWordIndex.value >= 15)) {
                satStage.value = 2;
                satWordIndex.value = 0;
                satQuizList.value = getWeakWords(15);
            } 
            else if (satStage.value === 2 && (satWordIndex.value >= currentListLen || satWordIndex.value >= 15)) {
                satStage.value = 3;
                satWordIndex.value = 0;
                
                // [수정] 상위 allWords ref와 변수명이 충돌하지 않도록 weekWords로 변경
                const rawWords = Array.isArray(allWords?.value) ? allWords.value : [];
                let weekWords = rawWords.filter(w => String(w?.week) === String(currentWeek.value));
                satQuizList.value = weekWords.sort(() => Math.random() - 0.5);
            } 
            else if (satStage.value === 3 && (satWordIndex.value >= currentListLen || satWordIndex.value >= 25)) {
                isReplayingDay.value = false;
                if (!satCompletedWeeks.value.includes(currentWeek.value)) {
                    satCompletedWeeks.value.push(currentWeek.value);
                }
            }
        };

        return {
            activeScreen, allWords, learnedWordIDs, satCompletedWeeks, savedDate, currentWeek, selectedDay, days,
            wordStats, recordAttempt, getWordAccuracy, getAccuracyBadgeClass,
            currentIndex, currentMode, practiceText, practiceCount, quizText, isDayCompleted,
            quizSubStage, quizPart1Count, quizPart2Count, quizBlanks, soundBlindFailCount, hintLevel,
            stage3Active, stage3List, stage3Index, stage3AnswerRevealed, currentStage3Item,
            practiceInput, quizInput, canvasRef, fileInput, showConfirmModal,
            openConfirmModal, confirmLoadFile, cancelLoadFile, handleFileUpload,
            availableWeeks, getWords, isLearned, isWeekUnlocked, isWeekCompleted,
            isDayUnlocked, isDayDone, overallProgressRate, getWeekProgressRate, todayLesson, getDayBtnClass,
            currentWordList, currentWord, learnedInDayCount, startLesson, changeDay, resetDayProgress,
            resetAllProgress, resetWeekProgress, resetDayProgressFromUI, isReplayingDay, restartStage1Only,
            isCharCorrect, onPracticeInput, onQuizInput, submitPractice, submitQuiz, advanceToNextDay,
            clearPracticeInput, clearQuizInput, getWordImage, handleImgError,
            startStage3, clearCanvas, clearCanvasStrokesOnly, revealPencilAnswer,
            getMaskedExample, getHighlightedExampleMeaning, submitStage3MCQ, nextStage3Question,

            // 토요일 바인딩
            satStage, satWordIndex, satQuizList, satCorrectCount, satTotalQuestions,
            satFeedbackMessage, satComboCount, satCurrentWord,
            getWeakWords, startSaturdayReview, getMaskedSpelling20, triggerSatFeedback, nextSatQuestion
        };
    }
}).mount('#app');
