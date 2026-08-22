import { useWordsStore } from './words-store.js';
import { useSaturdayReview } from './sat-review.js';
import * as audio from './audio.js';

const { createApp, ref, computed, nextTick, onMounted, onUnmounted } = Vue;

createApp({
    setup() {
        const wordsStore = useWordsStore();
        const satReview = useSaturdayReview(wordsStore, audio);

        const activeScreen = ref('home');
        const currentWeek = ref(1);
        const selectedDay = ref('Mon');
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const isDayCompleted = ref(false);
        const isReplayingDay = ref(false);

        const currentIndex = ref(0);
        const currentMode = ref('practice');
        const practiceText = ref('');
        const practiceCount = ref(0);
        const quizText = ref('');
        const quizSubStage = ref(1);
        const quizPart1Count = ref(0);
        const quizPart2Count = ref(0);
        const soundBlindFailCount = ref(0);
        const hintLevel = ref(0);

        const stage3Active = ref(false);
        const stage3List = ref([]);
        const stage3Index = ref(0);
        const stage3AnswerRevealed = ref(false);

        const practiceInput = ref(null);
        const quizInput = ref(null);
        const satInput = ref(null);
        const canvasRef = ref(null);
        const fileInput = ref(null);
        const showConfirmModal = ref(false);

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

        const currentWordList = computed(() => wordsStore.getWords(currentWeek.value, selectedDay.value));
        const currentWord = computed(() => currentWordList.value[currentIndex.value] || null);
        const learnedInDayCount = computed(() => currentWordList.value.filter(w => wordsStore.isLearned(w)).length);
        const currentStage3Item = computed(() => stage3List.value[stage3Index.value] || null);

        const isWeekCompleted = (week) => {
            const wStr = String(week);
            const words = wordsStore.allWords.value.filter(w => String(w.week) === wStr);
            const allWordsLearned = words.length > 0 && words.every(w => wordsStore.isLearned(w));
            return allWordsLearned && satReview.satCompletedWeeks.value.some(w => String(w) === wStr);
        };

        const isWeekUnlocked = () => true;

        const isDayDone = (week, day) => {
            const wStr = String(week);
            if (day === 'Sat') {
                return satReview.satCompletedWeeks.value.some(w => String(w) === wStr);
            }
            const words = wordsStore.getWords(week, day);
            return words.length > 0 && words.every(w => wordsStore.isLearned(w));
        };

        const isDayUnlocked = (week, day) => {
            const targetIdx = days.indexOf(day);
            if (targetIdx === 0) return true;
            for (let i = 0; i < targetIdx; i++) {
                const prevDayWords = wordsStore.getWords(week, days[i]);
                if (prevDayWords.length > 0 && !prevDayWords.every(w => wordsStore.isLearned(w))) return false;
            }
            return true;
        };

        const overallProgressRate = computed(() => {
            const total = wordsStore.allWords.value.length;
            return total === 0 ? 0 : wordsStore.learnedWordIDs.value.length / total;
        });

        const getWeekProgressRate = (week) => {
            const wStr = String(week);
            const words = wordsStore.allWords.value.filter(w => String(w.week) === wStr);
            if (words.length === 0) return 0;
            const learnedCount = words.filter(w => wordsStore.isLearned(w)).length;
            const satDone = satReview.satCompletedWeeks.value.some(w => String(w) === wStr) ? 1 : 0;
            return (learnedCount + (satDone ? (words.length * 0.2) : 0)) / (words.length * 1.2);
        };

        const todayLesson = computed(() => {
            const weeks = wordsStore.availableWeeks.value || [];
            for (let w of weeks) {
                for (let d of days) {
                    if (isDayUnlocked(w, d) && !isDayDone(w, d)) {
                        return { week: w, day: d };
                    }
                }
            }
            return { week: weeks[0] || 1, day: 'Mon' };
        });

        const getDayBtnClass = (week, day) => {
            if (isDayDone(week, day)) return 'bg-emerald-100 text-emerald-700 font-extrabold';
            if (isDayUnlocked(week, day)) return 'bg-pink-100 text-pink-600 hover:bg-pink-200 border border-pink-200 font-extrabold';
            return 'bg-purple-50 text-purple-200';
        };

        const startLesson = (week, day) => {
            satReview.stopSatTimer();
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
                satReview.startSaturdayReview(currentWeek.value, isDayCompleted, focusInput);
            } else {
                resetDayProgress();
            }
        };

        const changeDay = (day) => {
            satReview.stopSatTimer();
            activeScreen.value = 'learning';
            isReplayingDay.value = false;
            selectedDay.value = String(day);
            if (selectedDay.value === 'Sat') {
                satReview.startSaturdayReview(currentWeek.value, isDayCompleted, focusInput);
            } else {
                resetDayProgress();
            }
        };

        const resetDayProgress = (forceStartOver = false) => {
            satReview.stopSatTimer();
            stage3Active.value = false;
            const firstUnlearnedIdx = currentWordList.value.findIndex(w => !wordsStore.isLearned(w));

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
            soundBlindFailCount.value = 0;
            hintLevel.value = 0;

            focusInput();
            if (!isDayCompleted.value && currentWord.value) audio.speak(currentWord.value.english, 0.75);
        };

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

                    await wordsStore.safeSaveImagesToIDB(extractedImages);
                    wordsStore.imageMap.value = extractedImages;
                    wordsStore.parseAndSaveWords(raw);

                } else if (file.name.toLowerCase().endsWith('.json')) {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            let text = event.target.result.replace(/^﻿/, '');
                            const raw = JSON.parse(text);
                            await wordsStore.safeSaveImagesToIDB({});
                            wordsStore.imageMap.value = {};
                            wordsStore.parseAndSaveWords(raw);
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

        const clearPracticeInput = () => { practiceText.value = ''; focusInput(); };
        const clearQuizInput = () => { quizText.value = ''; focusInput(); };

        const isCharCorrect = (char, idx) => {
            if (!currentWord.value) return false;
            return idx < currentWord.value.english.length && char.toLowerCase() === currentWord.value.english[idx].toLowerCase();
        };

        const onPracticeInput = () => {
            if (!currentWord.value) return;
            const val = practiceText.value;
            const target = currentWord.value.english;
            if (val.length > 0) {
                const lastIdx = val.length - 1;
                if (lastIdx < target.length && val[lastIdx].toLowerCase() === target[lastIdx].toLowerCase()) {
                    audio.playTypingSound();
                } else {
                    audio.playErrorSound();
                }
            }
        };

        const onQuizInput = () => {
            if (!currentWord.value) return;
            const val = quizText.value;
            const target = currentWord.value.english;

            if (val.length > 0) {
                if (quizSubStage.value === 1) {
                    const lastIdx = val.length - 1;
                    if (lastIdx < target.length && val[lastIdx].toLowerCase() === target[lastIdx].toLowerCase()) {
                        audio.playTypingSound();
                    } else {
                        audio.playErrorSound();
                    }
                } else {
                    audio.playTypingSound();
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
            satReview.quizBlanks = indices;
        };

        const submitPractice = () => {
            if (!currentWord.value) return;
            if (practiceText.value.trim().toLowerCase() === currentWord.value.english.toLowerCase()) {
                wordsStore.recordAttempt(currentWord.value.id, true);
                audio.playCorrectSound();
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
                wordsStore.recordAttempt(currentWord.value.id, false);
                audio.playErrorSound();
                practiceText.value = '';
            }
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
                wordsStore.recordAttempt(currentWord.value.id, true);
                audio.playCorrectSound();
                quizText.value = '';

                if (quizSubStage.value === 1) {
                    quizPart1Count.value++;
                    if (quizPart1Count.value >= 3) {
                        quizSubStage.value = 2;
                        soundBlindFailCount.value = 0;
                        hintLevel.value = 0;
                        focusInput();
                        audio.speak(currentWord.value.english, 0.75);
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
                        audio.speak(currentWord.value.english, 0.75);
                    }
                }
            } else {
                wordsStore.recordAttempt(currentWord.value.id, false);
                audio.playErrorSound();
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
                audio.speak(currentWord.value.english, 0.75);
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
                const globalPool = wordsStore.allWords.value.filter(w => !options.includes(w.english));
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
                        audio.speak(currentStage3Item.value.word.english, 0.75);
                    } else if (currentStage3Item.value.type === 'example') {
                        audio.speakSequence(currentStage3Item.value.word.english, currentStage3Item.value.word.example);
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
                    if (!satReview.satCompletedWeeks.value.includes(currentWeek.value)) {
                        satReview.satCompletedWeeks.value.push(currentWeek.value);
                    }
                } else {
                    currentWordList.value.forEach(w => wordsStore.markAsLearned(w));
                }
                audio.playCorrectSound();
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
                    audio.speak(targetWord, 0.75);
                    return;
                }

                if (result.isCorrect) {
                    wordsStore.recordAttempt(currentStage3Item.value.word.id, true);
                    audio.playCorrectSound();
                    const randomPraise = praiseList[Math.floor(Math.random() * praiseList.length)];
                    alert(randomPraise);
                    nextStage3Question();
                } else {
                    wordsStore.recordAttempt(currentStage3Item.value.word.id, false);
                    audio.playErrorSound();
                    stage3AnswerRevealed.value = true;
                    audio.speak(targetWord, 0.75);
                    alert(`아쉬워요! AI가 '${result.recognizedText}'(으)로 읽었어요. 정답을 확인하고 다시 써볼까요? ✨`);
                    clearCanvasStrokesOnly();
                }
            } else {
                stage3AnswerRevealed.value = true;
                audio.speak(targetWord, 0.75);
            }
        };

        const submitSatAnswer = () => {
            if (satReview.isInputLocked.value || satReview.feedbackMessage.value) return;
            if (!satReview.satInputText.value || !satReview.satInputText.value.trim()) return;
            if (!satReview.satCurrentWord.value) return;

            satReview.isInputLocked.value = true;

            const userInput = satReview.satInputText.value.trim().toLowerCase();
            const targetWord = satReview.satCurrentWord.value.english.toLowerCase();
            const isCorrect = (userInput === targetWord);

            satReview.isFeedbackCorrect.value = isCorrect;
            if (isCorrect) {
                satReview.satComboCount.value++;
                const positiveMsgs = [
                    '✨ 완벽해요! 완벽하게 기억하셨네요!',
                    '🔥 훌륭해요! 거침없는 정답 행진!',
                    '🌸 대단합니다! 실력이 대폭 상승 중!',
                    '💖 정답! 이 기세로 완벽 마감해봅시다!'
                ];
                satReview.feedbackMessage.value = satReview.satComboCount.value >= 3
                    ? `🔥 ${satReview.satComboCount.value}연속 정답 폭발!! 최고예요! 🎉`
                    : positiveMsgs[Math.floor(Math.random() * positiveMsgs.length)];
                audio.playFanfareSound();
            } else {
                satReview.satComboCount.value = 0;
                satReview.feedbackMessage.value = `아쉽네요! 정답은 '${satReview.satCurrentWord.value.english}' 입니다. 😢`;
                audio.playSadSound();
            }

            satReview.satInputText.value = '';

            setTimeout(() => {
                satReview.feedbackMessage.value = '';
                satReview.isInputLocked.value = false;
                nextSatQuestion(isCorrect);
                focusInput();
            }, 1500);
        };

        const startSatStage = () => {
            satReview.isSatStageStarted.value = true;
            nextTick(() => {
                focusInput();
                if (satReview.satCurrentWord.value) {
                    satReview.satHintText.value = satReview.generateSatHint(satReview.satCurrentWord.value.english);
                    audio.speak(satReview.satCurrentWord.value.english, 0.75);
                    if (satReview.satStage.value === 3) {
                        satReview.startSatTimer(() => nextSatQuestion(false));
                    }
                }
            });
        };

        const nextSatQuestion = (isCorrect) => {
            satReview.stopSatTimer();
            if (isCorrect) {
                satReview.satCorrectCount.value++;
            }

            satReview.satWordIndex.value++;
            satReview.satInputText.value = '';

            if (satReview.satStage.value === 1 && satReview.satWordIndex.value >= satReview.satQuizList.value.length) {
                satReview.satStage.value = 2;
                satReview.satWordIndex.value = 0;
                satReview.satQuizList.value = wordsStore.getWeakWords(currentWeek.value, 15).sort(() => Math.random() - 0.5);
                satReview.isSatStageStarted.value = false;
                return;
            } else if (satReview.satStage.value === 2 && satReview.satWordIndex.value >= satReview.satQuizList.value.length) {
                satReview.satStage.value = 3;
                satReview.satWordIndex.value = 0;
                satReview.satQuizList.value = wordsStore.getWords(currentWeek.value, 'Sat').sort(() => Math.random() - 0.5);
                satReview.isSatStageStarted.value = false;
                return;
            } else if (satReview.satStage.value === 3 && satReview.satWordIndex.value >= satReview.satQuizList.value.length) {
                isReplayingDay.value = false;
                isDayCompleted.value = true;
                if (!satReview.satCompletedWeeks.value.includes(currentWeek.value)) {
                    satReview.satCompletedWeeks.value.push(currentWeek.value);
                }
                satReview.satScores.value[currentWeek.value] = satReview.satCorrectCount.value;
                audio.playCorrectSound();
                return;
            }

            focusInput();

            if (satReview.satCurrentWord.value) {
                satReview.satHintText.value = satReview.generateSatHint(satReview.satCurrentWord.value.english);
                audio.speak(satReview.satCurrentWord.value.english, 0.75);
                if (satReview.satStage.value === 3) {
                    satReview.startSatTimer(() => nextSatQuestion(false));
                }
            }
        };

        const startSatStage3Only = () => {
            satReview.stopSatTimer();
            activeScreen.value = 'learning';
            isReplayingDay.value = false;
            stage3Active.value = false;
            isDayCompleted.value = false;
            satReview.satStage.value = 3;
            satReview.satWordIndex.value = 0;
            satReview.satCorrectCount.value = 0;
            satReview.satComboCount.value = 0;
            satReview.satTotalQuestions.value = 25;
            satReview.satQuizList.value = wordsStore.getWords(currentWeek.value, 'Sat').sort(() => Math.random() - 0.5);
            satReview.isSatStageStarted.value = false;
            satReview.satInputText.value = '';
            satReview.feedbackMessage.value = '';
            focusInput();
        };

        const restartSaturdayChallenge = () => {
            satReview.stopSatTimer();
            satReview.isInputLocked.value = false;
            satReview.satCompletedWeeks.value = satReview.satCompletedWeeks.value.filter(w => String(w) !== String(currentWeek.value));
            isDayCompleted.value = false;
            satReview.satStage.value = 1;
            satReview.satWordIndex.value = 0;
            satReview.satCorrectCount.value = 0;
            satReview.satComboCount.value = 0;
            satReview.satTotalQuestions.value = 55;
            satReview.satInputText.value = '';
            satReview.feedbackMessage.value = '';
            satReview.isFeedbackCorrect.value = true;
            satReview.isSatStageStarted.value = false;

            satReview.satQuizList.value = wordsStore.getWeakWords(currentWeek.value, 15).sort(() => Math.random() - 0.5);
            if (satReview.satQuizList.value.length === 0) {
                satReview.satQuizList.value = wordsStore.getWords(currentWeek.value, 'Sat').sort(() => 0.5 - Math.random());
            }

            if (satReview.satCurrentWord.value) {
                satReview.satHintText.value = satReview.generateSatHint(satReview.satCurrentWord.value.english);
            }
            focusInput();
        };

        const confirmSatReset = () => {
            satReview.showSatResetModal.value = false;
            if (satReview.satResetType.value === 'all') {
                restartSaturdayChallenge();
            } else if (satReview.satResetType.value === 'stage3') {
                startSatStage3Only();
            }
        };

        const advanceFromSat = () => {
            satReview.stopSatTimer();
            const weeks = wordsStore.availableWeeks.value || [];
            const weekIdx = weeks.indexOf(currentWeek.value);
            if (weekIdx < weeks.length - 1) {
                currentWeek.value = weeks[weekIdx + 1];
                changeDay('Mon');
            } else {
                activeScreen.value = 'home';
            }
        };

        const advanceToNextDay = () => {
            satReview.stopSatTimer();
            const targetIdx = days.indexOf(selectedDay.value);
            if (targetIdx < days.length - 1) {
                changeDay(days[targetIdx + 1]);
            } else {
                const weeks = wordsStore.availableWeeks.value || [];
                const weekIdx = weeks.indexOf(currentWeek.value);
                if (weekIdx < weeks.length - 1) {
                    currentWeek.value = weeks[weekIdx + 1];
                    changeDay('Mon');
                }
            }
        };

        const getMaskedWord = (word) => {
            if (!word) return '';
            const str = typeof word === 'string' ? word : (word.english || '');
            if (!str) return '';
            return str[0] + ' _'.repeat(str.length - 1);
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
                wordsStore.recordAttempt(currentStage3Item.value.word.id, true);
                audio.playCorrectSound();
                nextStage3Question();
            } else {
                wordsStore.recordAttempt(currentStage3Item.value.word.id, false);
                audio.playErrorSound();
            }
        };

        const getWordImage = (word) => {
            if (!word) return '';
            const imgMap = wordsStore.imageMap.value || {};
            if (typeof word === 'string') {
                const lower = word.toLowerCase().trim();
                if (imgMap[lower]) return imgMap[lower];
                return `https://loremflickr.com/500/400/${encodeURIComponent(lower)},illustration,cartoon/all`;
            }

            const imgFile = word.imageFileName || word.imagefilename || word.image;
            if (imgFile) {
                const lowerSpec = String(imgFile).toLowerCase().trim();
                const specWithoutPath = lowerSpec.split('/').pop();
                const specWithoutExt = specWithoutPath.substring(0, specWithoutPath.lastIndexOf('.')) || specWithoutPath;

                if (imgMap[lowerSpec]) return imgMap[lowerSpec];
                if (imgMap[specWithoutPath]) return imgMap[specWithoutPath];
                if (imgMap[specWithoutExt]) return imgMap[specWithoutExt];
                if (String(imgFile).startsWith('http')) return imgFile;
            }

            if (imgMap && word.english) {
                const engLower = String(word.english).toLowerCase().trim();
                if (imgMap[engLower]) return imgMap[engLower];
            }

            return `https://loremflickr.com/500/400/${encodeURIComponent(String(word.english || '').toLowerCase())},illustration,cartoon/all`;
        };

        const handleImgError = (e) => {
            e.target.src = 'https://via.placeholder.com/500x400/fff0f5/db2777?text=No+Image';
        };

        const restartStage1Only = () => {
            satReview.stopSatTimer();
            currentIndex.value = 0;
            currentMode.value = 'practice';
            practiceCount.value = 0;
            practiceText.value = '';
            stage3Active.value = false;
            isReplayingDay.value = true;
            isDayCompleted.value = false;
            focusInput();
            if (currentWord.value) audio.speak(currentWord.value.english, 0.75);
        };

        const resetAllProgress = () => {
            if (confirm('정말로 모든 주차의 학습 진도를 초기화하시겠습니까? 🌸')) {
                wordsStore.learnedWordIDs.value = [];
                satReview.satCompletedWeeks.value = [];
                satReview.satScores.value = {};
            }
        };

        const resetWeekProgress = (week) => {
            if (confirm(`${week}주차의 학습 진도만 초기화하시겠습니까? 🌸`)) {
                const wStr = String(week);
                const weekWordIDs = wordsStore.allWords.value.filter(w => String(w.week) === wStr).map(w => w.id);
                wordsStore.learnedWordIDs.value = wordsStore.learnedWordIDs.value.filter(id => !weekWordIDs.includes(id));
                satReview.satCompletedWeeks.value = satReview.satCompletedWeeks.value.filter(wNum => String(wNum) !== wStr);
                delete satReview.satScores.value[week];
            }
        };

        const resetDayProgressFromUI = () => {
            const w = currentWeek.value;
            const d = selectedDay.value;

            if (d === 'Sat') {
                if (confirm(`${w}주차 토요일 주말 복습 기록만 초기화하시겠습니까? 🌸`)) {
                    satReview.satCompletedWeeks.value = satReview.satCompletedWeeks.value.filter(weekNum => String(weekNum) !== String(w));
                    delete satReview.satScores.value[w];
                    satReview.startSaturdayReview(w, isDayCompleted, focusInput);
                }
            } else {
                const targetIdx = days.indexOf(d);
                const affectedDays = days.slice(targetIdx, 5);
                const affectedWords = wordsStore.allWords.value.filter(word => String(word.week) === String(w) && affectedDays.includes(word.day));
                const affectedIDs = affectedWords.map(word => word.id);

                if (confirm(`${w}주차 ${d}요일부터 금요일까지의 진도를 초기화하시겠습니까? 🌸`)) {
                    wordsStore.learnedWordIDs.value = wordsStore.learnedWordIDs.value.filter(id => !affectedIDs.includes(id));
                    satReview.satCompletedWeeks.value = satReview.satCompletedWeeks.value.filter(weekNum => String(weekNum) !== String(w));
                    delete satReview.satScores.value[w];
                    resetDayProgress(true);
                }
            }
        };

        const handleResize = () => {
            if (stage3Active.value && currentStage3Item.value?.type === 'pencil') {
                resizeCanvas();
            }
        };

        onMounted(async () => {
            await wordsStore.loadStoredData();
            satReview.initSatData();
            window.addEventListener('resize', handleResize);
        });

        onUnmounted(() => {
            satReview.stopSatTimer();
            window.removeEventListener('resize', handleResize);
        });

        return {
            ...wordsStore,
            ...satReview,
            ...audio,
            activeScreen, currentWeek, selectedDay, days, isDayCompleted, isReplayingDay,
            currentIndex, currentMode, practiceText, practiceCount, quizText, quizSubStage,
            quizPart1Count, quizPart2Count, soundBlindFailCount, hintLevel, triggerHint,
            stage3Active, stage3List, stage3Index, stage3AnswerRevealed, currentStage3Item,
            practiceInput, quizInput, satInput, canvasRef, fileInput, showConfirmModal,
            currentWordList, currentWord, learnedInDayCount, isWeekCompleted, isWeekUnlocked,
            isDayDone, isDayUnlocked, overallProgressRate, getWeekProgressRate, todayLesson,
            getDayBtnClass, startLesson, changeDay, resetDayProgress, resetAllProgress,
            resetWeekProgress, resetDayProgressFromUI, restartStage1Only, openConfirmModal,
            confirmLoadFile, cancelLoadFile, handleFileUpload, clearPracticeInput, clearQuizInput,
            isCharCorrect, onPracticeInput, onQuizInput, submitPractice, submitQuiz,
            startStage3, clearCanvas, clearCanvasStrokesOnly, revealPencilAnswer,
            submitSatAnswer, startSatStage, nextSatQuestion, startSatStage3Only,
            restartSaturdayChallenge, confirmSatReset, advanceFromSat, advanceToNextDay,
            getMaskedWord, getMaskedExample, getHighlightedExampleMeaning, submitStage3MCQ,
            nextStage3Question, getWordImage, handleImgError, focusInput
        };
    }
}).mount('#app');
