const { createApp, ref, computed, watch, nextTick, onMounted, onUnmounted } = Vue;

createApp({
    setup() {
        // ==================== [ 유틸리티 함수: 음성 및 효과음 ] ====================
        const speak = (text, rate = 0.75) => {
            if (!('speechSynthesis' in window) || !text) return;
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = rate;
            window.speechSynthesis.speak(utterance);
        };

        const speakSequence = (word, sentence) => {
            if (!('speechSynthesis' in window)) return;
            window.speechSynthesis.cancel();
            const u1 = new SpeechSynthesisUtterance(word);
            u1.lang = 'en-US';
            u1.rate = 0.75;
            u1.onend = () => {
                if (sentence) {
                    const u2 = new SpeechSynthesisUtterance(sentence);
                    u2.lang = 'en-US';
                    u2.rate = 0.85;
                    window.speechSynthesis.speak(u2);
                }
            };
            window.speechSynthesis.speak(u1);
        };

        const playSound = (type) => {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);

                if (type === 'correct') {
                    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
                    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
                    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.4);
                } else if (type === 'error') {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(220, ctx.currentTime);
                    osc.frequency.setValueAtTime(160, ctx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.3);
                } else if (type === 'typing') {
                    osc.type = 'triangle'; // 톡톡 튀는 키보드 느낌의 파형 설정
                    osc.frequency.setValueAtTime(600, ctx.currentTime); // 음높이 조정 (400 -> 600Hz)
                    gain.gain.setValueAtTime(0.08, ctx.currentTime); // 볼륨 대폭 상향 (0.02 -> 0.08)
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.08);
                }
            } catch (e) {}
        };

        const playTypingSound = () => playSound('typing');
        const playErrorSound = () => playSound('error');
        const playCorrectSound = () => playSound('correct');

        const safeLoadImagesFromIDB = async () => {
            if (typeof window.loadImagesFromIDB === 'function') {
                return await window.loadImagesFromIDB();
            }
            return {};
        };

        const safeSaveImagesToIDB = async (imgs) => {
            if (typeof window.saveImagesToIDB === 'function') {
                await window.saveImagesToIDB(imgs);
            }
        };

        // ==================== [ Base State ] ====================
        const activeScreen = ref('home');
        const allWords = ref([]);
        const learnedWordIDs = ref([]);
        const satCompletedWeeks = ref([]);
        const savedDate = ref('');
        const imageMap = ref({});
        const currentWeek = ref(1);
        const selectedDay = ref('Mon');
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        const isSatStageStarted = ref(false); // 단계 시작 여부 플래그
        
        // [단계 시작 버튼 클릭 함수]
        const startSatStage = () => {
            isSatStageStarted.value = true;
            focusInput();
            if (satCurrentWord.value) {
                speak(satCurrentWord.value.english, 0.75);
                if (satStage.value === 3) {
                    startSatTimer(); // 3단계일 때만 시작 버튼 클릭 시 타이머 동작
                }
            }
        };
        

        // ==================== [ 토요일 복습 커스텀 상태 및 타이머 ] ====================
        const satStage = ref(1);
        const satWordIndex = ref(0);
        const satQuizList = ref([]);
        const satCorrectCount = ref(0);
        const feedbackMessage = ref('');
        const isFeedbackCorrect = ref(true);
        const satComboCount = ref(0);
        const satInputText = ref('');
        const satTimer = ref(10);
        let satTimerInterval = null;
        const timerDisplay = ref('');

       // 👇 [추가] Vue Warn 경고 방지 및 타이머 바인딩용
        const timerDisplay = computed(() => {
            return satTimer.value !== null && satTimer.value !== undefined ? `${satTimer.value}` : '';
        }); 
        
        const satTotalQuestions = ref(55);

        const stopSatTimer = () => {
            if (satTimerInterval) {
                clearInterval(satTimerInterval);
                satTimerInterval = null;
            }
        };

        const startSatTimer = () => {
            stopSatTimer();
            if (satStage.value !== 3) return;
            satTimer.value = 10;
            satTimerInterval = setInterval(() => {
                satTimer.value--;
                if (satTimer.value <= 0) {
                    stopSatTimer();
                    playErrorSound();
                    isFeedbackCorrect.value = false;
                    feedbackMessage.value = '⏰ 제한 시간 초과! 다음 문제로 넘어갑니다.';
                    setTimeout(() => {
                        feedbackMessage.value = '';
                        nextSatQuestion(false);
                    }, 1500);
                }
            }, 1000);
        };

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

        const quizSubStage = ref(1);
        const quizPart1Count = ref(0);
        const quizPart2Count = ref(0);
        const quizBlanks = ref([]);

        const soundBlindFailCount = ref(0);
        const hintLevel = ref(0);

        const stage3Active = ref(false);
        const stage3List = ref([]);
        const stage3Index = ref(0);
        const stage3AnswerRevealed = ref(false);

        const practiceInput = ref(null);
        const quizInput = ref(null);
        const satInput = ref(null); // 토요일 입력창 Ref 추가
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

                imageMap.value = await safeLoadImagesFromIDB();
            } catch (e) {
                console.error('데이터 로드 오류:', e);
            }

            window.addEventListener('resize', () => {
                if (stage3Active.value && currentStage3Item.value?.type === 'pencil') {
                    resizeCanvas();
                }
            });
        });

        onUnmounted(() => {
            stopSatTimer();
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
                if (file.name.toLowerCase().endsWith('.zip')) {
                    if (typeof JSZip === 'undefined') {
                        alert('❌ JSZip 라이브러리가 준비되지 않았습니다. 새로고침 후 시도해 주세요.');
                        e.target.value = '';
                        return;
                    }

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

                    await safeSaveImagesToIDB(extractedImages);
                    imageMap.value = extractedImages;
                    parseAndSaveWords(raw);

                } else if (file.name.toLowerCase().endsWith('.json')) {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            let text = event.target.result.replace(/^﻿/, '');
                            const raw = JSON.parse(text);
                            await safeSaveImagesToIDB({});
                            imageMap.value = {};
                            parseAndSaveWords(raw);
                        } catch (err) {
                            alert(`❌ JSON 문법 오류: ${err.message}`);
                        }
                    };
                    reader.readAsText(file);
                }
            } catch (err) {
                alert(`❌ 파일 처리 중 오류: ${err.message || err}`);
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

                return {
                    id: idx + 1,
                    week: parseInt(getVal(['week', 'w'])) || 1,
                    day: getVal(['day', 'd']) || 'Mon',
                    english: getVal(['english', 'word', 'eng', 'vocab', 'target']) || 'No Word',
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
                const isDayMatch = wDayLower === dLower ||
                                  (dLower === 'mon' && ['mon', '1'].includes(wDayLower)) ||
                                  (dLower === 'tue' && ['tue', '2'].includes(wDayLower)) ||
                                  (dLower === 'wed' && ['wed', '3'].includes(wDayLower)) ||
                                  (dLower === 'thu' && ['thu', '4'].includes(wDayLower)) ||
                                  (dLower === 'fri' && ['fri', '5'].includes(wDayLower));
                return isWeekMatch && isDayMatch;
            });
        };

        const isLearned = (word) => learnedWordIDs.value.includes(word.id);
        const markAsLearned = (word) => {
            if (!isLearned(word)) learnedWordIDs.value.push(word.id);
        };

        const isWeekCompleted = (week) => {
            const wStr = String(week);
            const words = allWords.value.filter(w => String(w.week) === wStr);
            const allWordsLearned = words.length > 0 && words.every(w => isLearned(w));
            return allWordsLearned && satCompletedWeeks.value.some(w => String(w) === wStr);
        };

        const isWeekUnlocked = (week) => true;

        const isDayDone = (week, day) => {
            const wStr = String(week);
            if (day === 'Sat') {
                return satCompletedWeeks.value.some(w => String(w) === wStr);
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
            const wStr = String(week);
            const words = allWords.value.filter(w => String(w.week) === wStr);
            if (words.length === 0) return 0;
            const learnedCount = words.filter(w => isLearned(w)).length;
            const satDone = satCompletedWeeks.value.some(w => String(w) === wStr) ? 1 : 0;
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
        const satCurrentWord = computed(() => satQuizList.value[satWordIndex.value] || null);

        const learnedInDayCount = computed(() => currentWordList.value.filter(w => isLearned(w)).length);
        const currentStage3Item = computed(() => stage3List.value[stage3Index.value] || null);

        const startLesson = (week, day) => {
            stopSatTimer();
            if (typeof week !== 'number' && typeof week !== 'string') {
                week = todayLesson.value.week;
                day = todayLesson.value.day;
            } else if (!day) {
                day = todayLesson.value.day;
            }

            currentWeek.value = Number(week) || 1;
            selectedDay.value = String(day || 'Mon');
            activeScreen.value = 'learning';

            if (selectedDay.value === 'Sat') {
                startSaturdayReview();
            } else {
                resetDayProgress();
            }
        };

        const changeDay = (day) => {
            stopSatTimer();
            activeScreen.value = 'learning';
            isReplayingDay.value = false;
            selectedDay.value = String(day);
            if (selectedDay.value === 'Sat') {
                startSaturdayReview();
            } else {
                resetDayProgress();
            }
        };

        const resetDayProgress = (forceStartOver = false) => {
            stopSatTimer();
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
            if (!isDayCompleted.value && currentWord.value) speak(currentWord.value.english, 0.75);
        };

        const resetAllProgress = () => {
            if (confirm('정말로 모든 주차의 학습 진도를 초기화하시겠습니까? 🌸')) {
                learnedWordIDs.value = [];
                satCompletedWeeks.value = [];
            }
        };

        const resetWeekProgress = (week) => {
            if (confirm(`${week}주차의 학습 진도만 초기화하시겠습니까? 🌸`)) {
                const wStr = String(week);
                const weekWordIDs = allWords.value.filter(w => String(w.week) === wStr).map(w => w.id);
                learnedWordIDs.value = learnedWordIDs.value.filter(id => !weekWordIDs.includes(id));
                satCompletedWeeks.value = satCompletedWeeks.value.filter(wNum => String(wNum) !== wStr);
            }
        };

        const resetDayProgressFromUI = () => {
            const w = currentWeek.value;
            const d = selectedDay.value;

            if (d === 'Sat') {
                if (confirm(`${w}주차 토요일 주말 복습 기록만 초기화하시겠습니까? 🌸`)) {
                    satCompletedWeeks.value = satCompletedWeeks.value.filter(weekNum => String(weekNum) !== String(w));
                    startSaturdayReview();
                }
            } else {
                const targetIdx = days.indexOf(d);
                const affectedDays = days.slice(targetIdx, 5);
                const affectedWords = allWords.value.filter(word => String(word.week) === String(w) && affectedDays.includes(word.day));
                const affectedIDs = affectedWords.map(word => word.id);

                if (confirm(`${w}주차 ${d}요일부터 금요일까지의 진도를 초기화하시겠습니까? 🌸`)) {
                    learnedWordIDs.value = learnedWordIDs.value.filter(id => !affectedIDs.includes(id));
                    satCompletedWeeks.value = satCompletedWeeks.value.filter(weekNum => String(weekNum) !== String(w));
                    resetDayProgress(true);
                }
            }
        };

        // [focusInput 함수 수정]
        const focusInput = () => {
            nextTick(() => {
                if (selectedDay.value === 'Sat') {
                    if (satInput.value) satInput.value.focus();
                } else if (currentMode.value === 'practice' && practiceInput.value) {
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
                    playTypingSound();
                } else {
                    playErrorSound();
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
                        playTypingSound();
                    } else {
                        playErrorSound();
                    }
                } else {
                    playTypingSound();
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
                playCorrectSound();
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
                playErrorSound();
                practiceText.value = '';
            }
        };

        const getMaskedWord = (word) => {
            if (!word) return '';
            const str = typeof word === 'string' ? word : (word.english || '');
            if (!str) return '';
            return str[0] + ' _'.repeat(str.length - 1);
        };

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
                playCorrectSound();
                quizText.value = '';

                if (quizSubStage.value === 1) {
                    quizPart1Count.value++;
                    if (quizPart1Count.value >= 3) {
                        quizSubStage.value = 2;
                        soundBlindFailCount.value = 0;
                        hintLevel.value = 0;
                        focusInput();
                        speak(currentWord.value.english, 0.75);
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
                        speak(currentWord.value.english, 0.75);
                    }
                }
            } else {
                recordAttempt(currentWord.value.id, false);
                playErrorSound();
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
                speak(currentWord.value.english, 0.75);
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
                        speak(currentStage3Item.value.word.english, 0.75);
                    } else if (currentStage3Item.value.type === 'example') {
                        speakSequence(currentStage3Item.value.word.english, currentStage3Item.value.word.example);
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
                
                playCorrectSound();
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
                    speak(targetWord, 0.75);
                    return;
                }

                if (result.isCorrect) {
                    recordAttempt(currentStage3Item.value.word.id, true);
                    playCorrectSound();
                    const randomPraise = praiseList[Math.floor(Math.random() * praiseList.length)];
                    alert(randomPraise);
                    nextStage3Question();
                } else {
                    recordAttempt(currentStage3Item.value.word.id, false);
                    playErrorSound();
                    stage3AnswerRevealed.value = true;
                    speak(targetWord, 0.75);
                    alert(`아쉬워요! AI가 '${result.recognizedText}'(으)로 읽었어요. 정답을 확인하고 다시 써볼까요? ✨`);
                    clearCanvasStrokesOnly();
                }
            } else {
                stage3AnswerRevealed.value = true;
                speak(targetWord, 0.75);
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
                playCorrectSound();
                nextStage3Question();
            } else {
                recordAttempt(currentStage3Item.value.word.id, false);
                playErrorSound();
            }
        };

        const advanceToNextDay = () => {
            stopSatTimer();
            const targetIdx = days.indexOf(selectedDay.value);
            if (targetIdx < days.length - 1) {
                changeDay(days[targetIdx + 1]);
            } else {
                const weekIdx = availableWeeks.value.indexOf(currentWeek.value);
                if (weekIdx < availableWeeks.value.length - 1) {
                    currentWeek.value = availableWeeks.value[weekIdx + 1];
                    changeDay('Mon');
                }
            }
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
                const engLower = word.english.toLowerCase().trim();
                if (imageMap.value[engLower]) return imageMap.value[engLower];
            }

            return `https://loremflickr.com/500/400/${encodeURIComponent(word.english.toLowerCase())},illustration,cartoon/all`;
        };

        const handleImgError = (e) => {
            e.target.src = 'https://via.placeholder.com/500x400/fff0f5/db2777?text=No+Image';
        };

        const restartStage1Only = () => {
            stopSatTimer();
            currentIndex.value = 0;
            currentMode.value = 'practice';
            practiceCount.value = 0;
            practiceText.value = '';
            stage3Active.value = false;
            isReplayingDay.value = true;
            // 👇 [추가] 완료 상태를 해제해야 1단계 학습 화면이 정상적으로 표시됩니다.
            isDayCompleted.value = false; 
            
            // 👇 [추가] 1단계 재시작 시 입력창 포커스 및 첫 단어 음성 재생
            focusInput();
            if (currentWord.value) speak(currentWord.value.english, 0.75);
        };

        const getWeakWords = (count) => {
            let allWeekdayWords = getWords(currentWeek.value, 'Sat') || [];

            if (allWeekdayWords.length === 0 && allWords.value) {
                allWeekdayWords = allWords.value.filter(w => String(w.week) === String(currentWeek.value));
            }

            if (allWeekdayWords.length === 0) return [];

            const sorted = [...allWeekdayWords].sort((a, b) => {
                const idA = a.id || a.word;
                const idB = b.id || b.word;
                const accA = Number(getWordAccuracy(idA)) || 0;
                const accB = Number(getWordAccuracy(idB)) || 0;
                return accA - accB;
            });

            return sorted.slice(0, count);
        };

        // [Base State 영역]
        const satHintText = ref(''); // 1단계 힌트 저장용 Ref
        
        // [1단계 힌트 생성 함수]
        const generateSatHint = (wordStr) => {
            if (!wordStr) return '';
            const len = wordStr.length;
            
            // 30% ~ 50% 범위의 랜덤 비율 적용 (최소 1개 이상 가림)
            const ratio = 0.3 + Math.random() * 0.2; // 0.30 ~ 0.50
            const hideCount = Math.max(1, Math.round(len * ratio));
        
            // 중복 없는 랜덤 인덱스 선택
            const hideIndices = new Set();
            while (hideIndices.size < hideCount) {
                const randIdx = Math.floor(Math.random() * len);
                hideIndices.add(randIdx);
            }
        
            // 가려진 글자는 '_'로 표시
            return wordStr
                .split('')
                .map((char, idx) => (hideIndices.has(idx) ? '_' : char))
                .join(' ');
        };
        
        // ==================== [ 토요일 주말 복습 로직 ] ====================
        const startSaturdayReview = () => {
            stopSatTimer();
            activeScreen.value = 'learning';
            isReplayingDay.value = false;
            stage3Active.value = false;
            isDayCompleted.value = false;
            satStage.value = 1;
            satWordIndex.value = 0;
            satCorrectCount.value = 0;
            satComboCount.value = 0;
            satTotalQuestions.value = 55;
            satInputText.value = '';
            feedbackMessage.value = '';
            isFeedbackCorrect.value = true;
            isSatStageStarted.value = false;
            
            satQuizList.value = getWeakWords(15);
           
            if (satQuizList.value.length === 0) {
                satQuizList.value = getWords(currentWeek.value, 'Sat').sort(() => 0.5 - Math.random());
            }
        
            if (satCurrentWord.value) {
                satHintText.value = generateSatHint(satCurrentWord.value.english);
                speak(satCurrentWord.value.english, 0.75);
            }

            focusInput();
        };

        const satStageTitle = computed(() => {
            if (satStage.value === 1) return '🎯 1단계: 취약 단어 집중 공략 (힌트 제공)';
            if (satStage.value === 2) return '⚡ 2단계: 블라인드 사운드 리콜 (사운드 집중)';
            return '🔥 3단계: 5초 스피드 타임어택 (스피드 게임)';
        });

        const satStageThemeClass = computed(() => {
            if (satStage.value === 1) return 'bg-pink-500 text-white';
            if (satStage.value === 2) return 'bg-indigo-600 text-white';
            return 'bg-rose-600 text-white animate-pulse';
        });

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

        const nextSatQuestion = (isCorrect) => {
            stopSatTimer();
            if (isCorrect) {
                satCorrectCount.value++;
            }

            satWordIndex.value++;
            satInputText.value = '';

            if (satStage.value === 1 && satWordIndex.value >= satQuizList.value.length) {
                satStage.value = 2;
                satWordIndex.value = 0;
                satQuizList.value = getWeakWords(15);
                isSatStageStarted.value = false;
            } 
            else if (satStage.value === 2 && satWordIndex.value >= satQuizList.value.length) {
                satStage.value = 3;
                satWordIndex.value = 0;
                satQuizList.value = getWords(currentWeek.value, 'Sat').sort(() => Math.random() - 0.5);
                isSatStageStarted.value = false;
            } 
            else if (satStage.value === 3 && satWordIndex.value >= satQuizList.value.length) {
                isReplayingDay.value = false;
                isDayCompleted.value = true;
                if (!satCompletedWeeks.value.includes(currentWeek.value)) {
                    satCompletedWeeks.value.push(currentWeek.value);
                }
                playCorrectSound();
                return;
            }

            focusInput();
            
            if (satCurrentWord.value) {
                satHintText.value = generateSatHint(satCurrentWord.value.english);
                speak(satCurrentWord.value.english, 0.75);
                if (satStage.value === 3) {
                    startSatTimer();
                }
            }
        };

        const submitSatAnswer = () => {
            if (feedbackMessage.value) return; 
            
            if (!satInputText.value || !satInputText.value.trim()) {
                focusInput();
                return;
            }
            
            if (!satCurrentWord.value) return;

            const userInput = satInputText.value.trim().toLowerCase();
            const targetWord = satCurrentWord.value.english.toLowerCase();
            const isCorrect = (userInput === targetWord);

            isFeedbackCorrect.value = isCorrect;
            if (isCorrect) {
                satComboCount.value++;
                const positiveMsgs = [
                    '✨ 완벽해요! 완벽하게 기억하셨네요!',
                    '🔥 훌륭해요! 거침없는 정답 행진!',
                    '🌸 대단합니다! 실력이 대폭 상승 중!',
                    '💖 정답! 이 기세로 완벽 마감해봅시다!'
                ];
                feedbackMessage.value = satComboCount.value >= 3 
                    ? `🔥 ${satComboCount.value}연속 정답 폭발!! 최고예요! 🎉` 
                    : positiveMsgs[Math.floor(Math.random() * positiveMsgs.length)];
                playCorrectSound();
            } else {
                satComboCount.value = 0;
                feedbackMessage.value = `아쉽네요! 정답은 '${satCurrentWord.value.english}' 입니다. 😢`;
                playErrorSound();
            }

            satInputText.value = '';

            setTimeout(() => {
                feedbackMessage.value = '';
                nextSatQuestion(isCorrect);
            }, 1500);
        };

        // [신규 기능 1] 토요일 3단계만 바로 재도전
        const startSatStage3Only = () => {
            stopSatTimer();
            activeScreen.value = 'learning';
            isReplayingDay.value = false;
            stage3Active.value = false;
            isDayCompleted.value = false;
            satStage.value = 3;
            satWordIndex.value = 0;
            satCorrectCount.value = 0;
            satComboCount.value = 0;
            satTotalQuestions.value = 25;
            satQuizList.value = getWords(currentWeek.value, 'Sat').sort(() => Math.random() - 0.5);
            isSatStageStarted.value = false;
            satInputText.value = '';
            feedbackMessage.value = '';
            focusInput();
        };

        // [신규 기능 2] 다음 학습으로 이동
        const advanceFromSat = () => {
            stopSatTimer();
            const weekIdx = availableWeeks.value.indexOf(currentWeek.value);
            if (weekIdx < availableWeeks.value.length - 1) {
                currentWeek.value = availableWeeks.value[weekIdx + 1];
                changeDay('Mon');
            } else {
                activeScreen.value = 'home';
            }
        };

        return {
            activeScreen, allWords, learnedWordIDs, satCompletedWeeks, savedDate, currentWeek, selectedDay, days,
            wordStats, recordAttempt, getWordAccuracy, getAccuracyBadgeClass,
            currentIndex, currentMode, practiceText, practiceCount, quizText, isDayCompleted,
            quizSubStage, quizPart1Count, quizPart2Count, quizBlanks, soundBlindFailCount, hintLevel,
            stage3Active, stage3List, stage3Index, stage3AnswerRevealed, currentStage3Item,
            practiceInput, quizInput, satInput, canvasRef, fileInput, showConfirmModal,
            openConfirmModal, confirmLoadFile, cancelLoadFile, handleFileUpload,
            availableWeeks, getWords, isLearned, isWeekUnlocked, isWeekCompleted,
            isDayUnlocked, isDayDone, overallProgressRate, getWeekProgressRate, todayLesson, getDayBtnClass,
            currentWordList, currentWord, learnedInDayCount, startLesson, changeDay, resetDayProgress,
            resetAllProgress, resetWeekProgress, resetDayProgressFromUI, isReplayingDay, restartStage1Only,
            isCharCorrect, onPracticeInput, onQuizInput, submitPractice, submitQuiz, advanceToNextDay,
            clearPracticeInput, clearQuizInput, speak, speakSequence, getWordImage, handleImgError,
            startStage3, clearCanvas, clearCanvasStrokesOnly, revealPencilAnswer,
            getMaskedWord, getMaskedExample, getHighlightedExampleMeaning, submitStage3MCQ, nextStage3Question,
            satStage, satWordIndex, satQuizList, satCorrectCount, feedbackMessage, isFeedbackCorrect, satComboCount, satCurrentWord,
            satInputText, submitSatAnswer, getWeakWords, startSaturdayReview, getMaskedSpelling20,
            nextSatQuestion, satTimer, timerDisplay, satStageTitle, satStageThemeClass, satTotalQuestions, satHintText,
            isSatStageStarted, startSatStage,
            
            playTypingSound,
            startSatStage3Only,
            advanceFromSat
        };
    }
}).mount('#app');
