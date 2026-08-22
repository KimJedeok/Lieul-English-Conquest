// sat-review.js
const { ref, computed, watch, nextTick, onUnmounted } = Vue;

export function useSaturdayReview(wordsStore, audio) {
    const satCompletedWeeks = ref([]);
    const satScores = ref({});
    const satStage = ref(1);
    const satWordIndex = ref(0);
    const satQuizList = ref([]);
    const satCorrectCount = ref(0);
    const feedbackMessage = ref('');
    const isFeedbackCorrect = ref(true);
    const satComboCount = ref(0);
    const satInputText = ref('');
    const satTimer = ref(10);
    const isSatStageStarted = ref(false);
    const isInputLocked = ref(false);
    const satTotalQuestions = ref(55);
    const satHintText = ref('');
    const showSatResetModal = ref(false);
    const satResetType = ref('all');

    let satTimerInterval = null;

    const timerDisplay = computed(() => satTimer.value !== null ? `${satTimer.value}` : '');
    const satCurrentWord = computed(() => satQuizList.value[satWordIndex.value] || null);

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

    // 로컬 데이터 초기화
    const initSatData = () => {
        try {
            const savedSatCompleted = localStorage.getItem('vocab_sat_completed');
            const savedSatScores = localStorage.getItem('vocab_sat_scores');
            if (savedSatCompleted) satCompletedWeeks.value = JSON.parse(savedSatCompleted);
            if (savedSatScores) satScores.value = JSON.parse(savedSatScores);
        } catch (e) {}
    };

    watch(satCompletedWeeks, (newVal) => {
        try { localStorage.setItem('vocab_sat_completed', JSON.stringify(newVal)); } catch (e) {}
    }, { deep: true });

    watch(satScores, (newVal) => {
        try { localStorage.setItem('vocab_sat_scores', JSON.stringify(newVal)); } catch (e) {}
    }, { deep: true });

    const stopSatTimer = () => {
        if (satTimerInterval) {
            clearInterval(satTimerInterval);
            satTimerInterval = null;
        }
    };

    const startSatTimer = (onTimeout) => {
        stopSatTimer();
        if (satStage.value !== 3) return;
        satTimer.value = 10;
        satTimerInterval = setInterval(() => {
            satTimer.value--;
            if (satTimer.value <= 0) {
                stopSatTimer();
                audio.playErrorSound();
                isFeedbackCorrect.value = false;
                feedbackMessage.value = '⏰ 제한 시간 초과! 다음 문제로 넘어갑니다.';
                setTimeout(() => {
                    feedbackMessage.value = '';
                    if (onTimeout) onTimeout();
                }, 1500);
            }
        }, 1000);
    };

    const generateSatHint = (wordStr) => {
        if (!wordStr) return '';
        const len = wordStr.length;
        const hideCount = Math.max(1, Math.round(len * (0.3 + Math.random() * 0.2)));
        const hideIndices = new Set();
        while (hideIndices.size < hideCount) {
            hideIndices.add(Math.floor(Math.random() * len));
        }
        return wordStr.split('').map((c, i) => hideIndices.has(i) ? '_' : c).join(' ');
    };

    const startSaturdayReview = (currentWeek, isDayCompleted, focusInput) => {
        stopSatTimer();
        isInputLocked.value = false;
        const weekWords = wordsStore.getWords(currentWeek, 'Sat');
        const isCompleted = satCompletedWeeks.value.some(w => String(w) === String(currentWeek));

        if (isCompleted) {
            isDayCompleted.value = true;
            satQuizList.value = weekWords;
            satTotalQuestions.value = 55;
            satCorrectCount.value = satScores.value[currentWeek] ?? 0;
            return;
        }

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

        satQuizList.value = wordsStore.getWeakWords(currentWeek, 15).sort(() => Math.random() - 0.5);
        if (satQuizList.value.length === 0) {
            satQuizList.value = weekWords.sort(() => 0.5 - Math.random());
        }

        if (satCurrentWord.value) {
            satHintText.value = generateSatHint(satCurrentWord.value.english);
        }
        focusInput();
    };

    // 모달 제어 함수
    const promptRestartSatAll = () => { satResetType.value = 'all'; showSatResetModal.value = true; };
    const promptRestartSatStage3 = () => { satResetType.value = 'stage3'; showSatResetModal.value = true; };
    const cancelSatReset = () => { showSatResetModal.value = false; };

    onUnmounted(() => stopSatTimer());

    return {
        satCompletedWeeks, satScores, satStage, satWordIndex, satQuizList, satCorrectCount,
        feedbackMessage, isFeedbackCorrect, satComboCount, satInputText, satTimer, isSatStageStarted,
        isInputLocked, satTotalQuestions, satHintText, showSatResetModal, satResetType,
        timerDisplay, satCurrentWord, satStageTitle, satStageThemeClass, initSatData,
        stopSatTimer, startSatTimer, generateSatHint, startSaturdayReview,
        promptRestartSatAll, promptRestartSatStage3, cancelSatReset
    };
}