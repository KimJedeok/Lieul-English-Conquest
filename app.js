const { createApp, ref, computed, watch, nextTick, onMounted, onUnmounted } = Vue;

createApp({
    setup() {
        // [오디오 컨텍스트 싱글톤]
        let audioCtx = null;
        const getAudioContext = () => {
            if (!audioCtx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) audioCtx = new AudioCtx();
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            return audioCtx;
        };

        const speak = (text, rate = 0.75, onEndCallback = null) => {
            if (!('speechSynthesis' in window) || !text) {
                if (onEndCallback) onEndCallback();
                return;
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = rate;
            
            if (onEndCallback) {
                utterance.onend = () => onEndCallback();
                utterance.onerror = () => onEndCallback();
            }
            window.speechSynthesis.speak(utterance);
        };

        // 🔊 문장 2회 천천히 연속 재생 (0.8초 지연 간격)
        const speakSentenceTwice = (sentence, onComplete = null) => {
            if (!('speechSynthesis' in window) || !sentence) {
                if (onComplete) onComplete();
                return;
            }
            window.speechSynthesis.cancel();
            isSpeakingAudio.value = true;
            sttStatusText.value = '🔊 예문 문장을 들려주고 있어요...';

            const u1 = new SpeechSynthesisUtterance(sentence);
            u1.lang = 'en-US';
            u1.rate = 0.75;

            u1.onend = () => {
                setTimeout(() => {
                    const u2 = new SpeechSynthesisUtterance(sentence);
                    u2.lang = 'en-US';
                    u2.rate = 0.75;
                    u2.onend = () => {
                        isSpeakingAudio.value = false;
                        if (onComplete) onComplete();
                    };
                    u2.onerror = () => {
                        isSpeakingAudio.value = false;
                        if (onComplete) onComplete();
                    };
                    window.speechSynthesis.speak(u2);
                }, 800);
            };

            u1.onerror = () => {
                isSpeakingAudio.value = false;
                if (onComplete) onComplete();
            };

            window.speechSynthesis.speak(u1);
        };

        const playSound = (type) => {
            try {
                const ctx = getAudioContext();
                if (!ctx) return;
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
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(600, ctx.currentTime);
                    gain.gain.setValueAtTime(0.08, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.08);
                }
            } catch (e) {}
        };

        const playTypingSound = () => playSound('typing');
        const playErrorSound = () => playSound('error');
        const playCorrectSound = () => playSound('correct');
        const playFanfareSound = () => playSound('correct');
        const playSadSound = () => playSound('error');

        const safeLoadImagesFromIDB = async () => {
            if (typeof loadImagesFromIDB === 'function') return await loadImagesFromIDB();
            return {};
        };

        const safeSaveImagesToIDB = async (imgs) => {
            if (typeof saveImagesToIDB === 'function') await saveImagesToIDB(imgs);
        };

        // ==================== [ Base State ] ====================
        const activeScreen = ref('home');
        const allWords = ref([]);
        const learnedWordIDs = ref([]);
        const satCompletedWeeks = ref([]);
        const satScores = ref({});
        const savedDate = ref('');
        const imageMap = ref({});
        const currentWeek = ref(1);
        const selectedDay = ref('Mon');
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        const isSatStageStarted = ref(false);

        const satStage = ref(1);
        const satWordIndex = ref(0);
        const satQuizList = ref([]);
        const satCorrectCount = ref(0);
        const feedbackMessage = ref('');
        const isFeedbackCorrect = ref(true);
        const satComboCount = ref(0);
        const satInputText = ref('');
        const satTimer = ref(15);
        let satTimerInterval = null;

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
            satTimer.value = 15;
            satTimerInterval = setInterval(() => {
                satTimer.value--;
                if (satTimer.value <= 0) {
                    stopSatTimer();
                    handleSatTimeout();
                }
            }, 1000);
        };

        const startSatStage = () => {
            isSatStageStarted.value = true;
            nextTick(() => {
                focusInput();
                if (satCurrentWord.value) {
                    if (satStage.value === 1) {
                        satHintText.value = generateSatHint(satCurrentWord.value.english);
                    }
                    speak(satCurrentWord.value.english, 0.75);
                    if (satStage.value === 3) startSatTimer();
                }
            });
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
            if (rate === null) return 'bg-sky-50 text-sky-600 border-sky-200';
            if (rate >= 80) return 'bg-emerald-100 text-emerald-700 border-emerald-300';
            if (rate >= 50) return 'bg-amber-100 text-amber-700 border-amber-300';
            return 'bg-blue-100 text-blue-700 border-blue-300';
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

        // ==================== [ 3단계 개선된 STT 시스템 ] ====================
        const isListening = ref(false);
        const isSpeakingAudio = ref(false);
        const isSTTStartedByTouch = ref(false); // 3단계 시작 터치 여부
        const sttAttemptCount = ref(0); // 시도 횟수 (최대 2회)
        const recognizedWordIndices = ref([]);
        const aiRecognizedText = ref(''); // AI가 실제 들은 문자열
        const sttStatusText = ref('시작 버튼을 눌러주세요!');
        
        // 피드백 객체 { text, type: 'info' | 'success' | 'warn' | 'error' }
        const sttFeedbackObj = ref({
            text: '오디오 소리를 들은 후 크게 따라 말해보세요!',
            type: 'info'
        });

        const isSTTSupported = ref(false);
        let recognition = null;

        const requestMicPermission = async () => {
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    stream.getTracks().forEach(track => track.stop());
                    return true;
                }
            } catch (err) {
                alert("🎙️ 마이크 권한이 필요합니다!\n아이패드 [설정] -> [Safari] -> [마이크]에서 '허용'으로 설정해주세요.");
                return false;
            }
            return true;
        };

        const initSTT = () => {
            try {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (SpeechRecognition) {
                    isSTTSupported.value = true;
                    recognition = new SpeechRecognition();
                    recognition.lang = 'en-US';
                    recognition.continuous = false; // 문장 말하면 0.3초 내 빠른 반응!
                    recognition.interimResults = true;

                    recognition.onstart = () => {
                        isListening.value = true;
                        sttStatusText.value = '🎧 듣고 있어요... 큰 소리로 읽어주세요!';
                    };

                    recognition.onresult = (event) => {
                        let transcript = '';
                        for (let i = event.resultIndex; i < event.results.length; i++) {
                            transcript += event.results[i][0].transcript;
                        }
                        aiRecognizedText.value = transcript;
                        updateRealtimeKaraokeHighlight(transcript);
                    };

                    recognition.onerror = (event) => {
                        isListening.value = false;
                    };

                    recognition.onend = () => {
                        isListening.value = false;
                        evaluateSTTFinal();
                    };
                } else {
                    isSTTSupported.value = false;
                }
            } catch(err) {
                isSTTSupported.value = false;
            }
        };

        // 실시간 단어 색상 하이라이트 (어린이 발음 완화 매칭 알고리즘)
        const updateRealtimeKaraokeHighlight = (transcript) => {
            if (!currentStage3Item.value || !currentStage3Item.value.word || !currentStage3Item.value.word.example) return;

            const targetSentence = currentStage3Item.value.word.example;
            const targetWords = targetSentence.split(/\s+/);
            const recWords = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

            const matched = [];
            targetWords.forEach((word, idx) => {
                const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
                // 완화 비교: 철자 포함 또는 발음 부분 일치
                const isMatch = recWords.some(rw => rw.includes(cleanWord) || cleanWord.includes(rw));
                if (cleanWord && isMatch) {
                    matched.push(idx);
                }
            });

            recognizedWordIndices.value = matched;
        };

        // 터치 기반 3단계 마이크 시작 & 2회 오디오 재생
        const startStage3SpeakingSession = async () => {
            const hasPermission = await requestMicPermission();
            if (!hasPermission) return;

            isSTTStartedByTouch.value = true;
            sttAttemptCount.value = 0;
            aiRecognizedText.value = '';
            recognizedWordIndices.value = [];
            
            sttFeedbackObj.value = {
                text: '🔊 예문 문장을 2번 들려드립니다. 잘 들어보세요!',
                type: 'info'
            };

            if (currentStage3Item.value && currentStage3Item.value.word && currentStage3Item.value.word.example) {
                speakSentenceTwice(currentStage3Item.value.word.example, () => {
                    // 2회 오디오 청취 완료 후 마이크 자동 가동!
                    startSTT();
                });
            }
        };

        const startSTT = async () => {
            if (isSpeakingAudio.value) return;

            if (!recognition) initSTT();
            if (!isSTTSupported.value) {
                alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
                return;
            }

            try {
                aiRecognizedText.value = '';
                recognizedWordIndices.value = [];
                sttFeedbackObj.value = {
                    text: '🎙️ 지금 마이크에 대고 크게 읽어보세요!',
                    type: 'info'
                };
                recognition.start();
            } catch (e) {
                try {
                    recognition.stop();
                    recognition.start();
                } catch (err) {}
            }
        };

        const stopSTT = () => {
            try {
                if (recognition && isListening.value) recognition.stop();
            } catch(e) {}
        };

        // 결과 평가 및 실패 시 시도 횟수 제어 (2회 실패 시 오디오 재재생 후 자동 이동)
        const evaluateSTTFinal = () => {
            if (!currentStage3Item.value || currentStage3Item.value.type !== 'speaking') return;

            const targetSentence = currentStage3Item.value.word.example;
            const targetWords = targetSentence.split(/\s+/);
            const matchedCount = recognizedWordIndices.value.length;
            const passThreshold = Math.ceil(targetWords.length * 0.65); // 65% 이상 맞추면 정답

            if (matchedCount >= passThreshold) {
                // 🎉 성공
                sttFeedbackObj.value = {
                    text: '🎉 완벽해요! 문장을 정확하게 읽었어요!',
                    type: 'success'
                };
                recordAttempt(currentStage3Item.value.word.id, true);
                playCorrectSound();

                setTimeout(() => {
                    nextStage3Question();
                }, 1500);

            } else {
                sttAttemptCount.value++;

                if (!aiRecognizedText.value || !aiRecognizedText.value.trim()) {
                    // 묵음 / 소리 미인식
                    if (sttAttemptCount.value < 2) {
                        sttFeedbackObj.value = {
                            text: `👂 소리가 작거나 안 들렸어요! 마이크 가까이서 다시 크게 읽어볼까요? (시도 ${sttAttemptCount.value}/2)`,
                            type: 'warn'
                        };
                        playErrorSound();
                    } else {
                        handleFailedStage3Question("소리가 들리지 않았어요");
                    }
                } else {
                    // 소리는 들렸으나 발음 다름
                    if (sttAttemptCount.value < 2) {
                        sttFeedbackObj.value = {
                            text: `💡 AI 들은 소리: '${aiRecognizedText.value}' ➔ 조금 더 정확하게 따라해보세요! (시도 ${sttAttemptCount.value}/2)`,
                            type: 'warn'
                        };
                        playErrorSound();
                    } else {
                        handleFailedStage3Question(`AI가 '${aiRecognizedText.value}'(으)로 들었어요`);
                    }
                }
            }
        };

        // 2회 연속 실패 시 자동 대처 로직
        const handleFailedStage3Question = (reason) => {
            recordAttempt(currentStage3Item.value.word.id, false);
            playErrorSound();

            sttFeedbackObj.value = {
                text: `😢 아쉬워요! (${reason}) 정확한 소리를 들려주고 다음 문제로 넘어갑니다.`,
                type: 'error'
            };

            // 정답 오디오 1회 재재생 후 다음 문제로 자동 이동
            speak(currentStage3Item.value.word.example, 0.75, () => {
                setTimeout(() => {
                    nextStage3Question();
                }, 1500);
            });
        };

        const practiceInput = ref(null);
        const quizInput = ref(null);
        const satInput = ref(null);
        const satInputRef = ref(null);
        const canvasRef = ref(null);
        const fileInput = ref(null);

        const showConfirmModal = ref(false);
        const showSatResetModal = ref(false);
        const satResetType = ref('all');

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

        const handleResize = () => {
            if (stage3Active.value && currentStage3Item.value?.type === 'pencil') {
                resizeCanvas();
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

                const savedSatScores = localStorage.getItem('vocab_sat_scores');
                if (savedSatScores) satScores.value = JSON.parse(savedSatScores);

                imageMap.value = await safeLoadImagesFromIDB();
            } catch (e) {
                console.error('데이터 로드 오류:', e);
            }

            initSTT();
            window.addEventListener('resize', handleResize);
        });

        onUnmounted(() => {
            stopSatTimer();
            stopSTT();
            window.removeEventListener('resize', handleResize);
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

        watch(satScores, (newVal) => {
            try {
                localStorage.setItem('vocab_sat_scores', JSON.stringify(newVal));
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
                    imageFileName: getVal(['imagefilename', 'filename', 'customimageurl', 'imageurl', 'image', 'img', 'file', 'photo', 'picture']) || null
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
        
            alert(`✅ 총 ${parsed.length}개 단어가 저장되었습니다! 🌊🐬`);
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
            if (isDayUnlocked(week, day)) return 'bg-sky-100 text-sky-600 hover:bg-sky-200 border border-sky-200 font-extrabold';
            return 'bg-blue-50 text-blue-200';
        };

        const currentWordList = computed(() => getWords(currentWeek.value, selectedDay.value));
        const currentWord = computed(() => currentWordList.value[currentIndex.value] || null);
        const satCurrentWord = computed(() => satQuizList.value[satWordIndex.value] || null);

        const learnedInDayCount = computed(() => currentWordList.value.filter(w => isLearned(w)).length);
        const currentStage3Item = computed(() => stage3List.value[stage3Index.value] || null);

        const startLesson = (week, day) => {
            stopSatTimer();
            stopSTT();
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
            stopSTT();
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
            stopSTT();
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
            soundBlindFailCount.value = 0;
            hintLevel.value = 0;

            focusInput();
            if (!isDayCompleted.value && currentWord.value) speak(currentWord.value.english, 0.75);
        };

        const resetAllProgress = () => {
            if (confirm('정말로 모든 주차의 학습 진도를 초기화하시겠습니까? 🌊')) {
                learnedWordIDs.value = [];
                satCompletedWeeks.value = [];
                satScores.value = {};
            }
        };

        const resetWeekProgress = (week) => {
            if (confirm(`${week}주차의 학습 진도만 초기화하시겠습니까? 🌊`)) {
                const wStr = String(week);
                const weekWordIDs = allWords.value.filter(w => String(w.week) === wStr).map(w => w.id);
                learnedWordIDs.value = learnedWordIDs.value.filter(id => !weekWordIDs.includes(id));
                satCompletedWeeks.value = satCompletedWeeks.value.filter(wNum => String(wNum) !== wStr);
                delete satScores.value[week];
            }
        };

        const resetDayProgressFromUI = () => {
            const w = currentWeek.value;
            const d = selectedDay.value;

            if (d === 'Sat') {
                if (confirm(`${w}주차 토요일 주말 복습 기록만 초기화하시겠습니까? 🌊`)) {
                    satCompletedWeeks.value = satCompletedWeeks.value.filter(weekNum => String(weekNum) !== String(w));
                    delete satScores.value[w];
                    startSaturdayReview();
                }
            } else {
                const targetIdx = days.indexOf(d);
                const affectedDays = days.slice(targetIdx, 5);
                const affectedWords = allWords.value.filter(word => String(word.week) === String(w) && affectedDays.includes(word.day));
                const affectedIDs = affectedWords.map(word => word.id);

                if (confirm(`${w}주차 ${d}요일부터 금요일까지의 진도를 초기화하시겠습니까? 🌊`)) {
                    learnedWordIDs.value = learnedWordIDs.value.filter(id => !affectedIDs.includes(id));
                    satCompletedWeeks.value = satCompletedWeeks.value.filter(weekNum => String(weekNum) !== String(w));
                    delete satScores.value[w];
                    resetDayProgress(true);
                }
            }
        };

        const focusInput = () => {
            nextTick(() => {
                if (selectedDay.value === 'Sat') {
                    if (satInputRef.value) {
                        satInputRef.value.focus();
                    } else if (satInput.value) {
                        satInput.value.focus();
                    }
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

        // ==================== [ 3단계 생성 로직 ] ====================
        const startStage3 = () => {
            const list = [];
            
            const shuffledPencil = [...currentWordList.value].sort(() => 0.5 - Math.random());
            shuffledPencil.forEach(w => {
                list.push({ word: w, type: 'pencil' });
            });

            const exampleWords = currentWordList.value.filter(w => w && w.example);
            const shuffledExample = [...exampleWords].sort(() => 0.5 - Math.random());
            shuffledExample.forEach(w => {
                list.push({
                    word: w,
                    type: 'speaking'
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
            aiRecognizedText.value = '';
            recognizedWordIndices.value = [];
            isSTTStartedByTouch.value = false;
            sttAttemptCount.value = 0;
            stopSTT();

            sttFeedbackObj.value = {
                text: '아래 시작 버튼을 눌러서 예문 오디오를 듣고 시작하세요!',
                type: 'info'
            };

            nextTick(() => {
                if (currentStage3Item.value && currentStage3Item.value.word) {
                    if (currentStage3Item.value.type === 'pencil') {
                        resizeCanvas();
                        clearCanvas();
                        if (typeof initPencilCanvas === 'function') {
                            initPencilCanvas('pencilCanvas');
                        }
                        speak(currentStage3Item.value.word.english, 0.75);
                    }
                }
            });
        };

        const nextStage3Question = () => {
            stopSTT();
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
            "🎉 완벽해요! 정답이에요, LIEUL! 💙",
            "✨ 참 잘했어요, LIEUL! 글씨가 아주 예뻐요! 🐬",
            "👍 최고예요, LIEUL! 단어를 정확하게 기억하네요! ⭐",
            "💯 최고입니다! 다음 문제도 도전해봐요, LIEUL! 💎",
            "🌟 대단해요, LIEUL! 완벽하게 잘 썼어요! 🌊"
        ];

        const satCorrectMessages = [
            "🎉 완벽해요, LIEUL! 거침없이 정답입니다! 💙",
            "⚡ 빛의 속도로 정답! LIEUL 역시 실력이 대단해요! ⭐",
            "🔥 스펠링 완벽 파악! LIEUL 아주 훌륭합니다! 🐬",
            "💯 최고예요, LIEUL! 이 기세로 다음 문제도! 💎",
            "🌟 대단해요! 완벽하게 LIEUL 뇌리에 저장 완료! 🌊"
        ];
        
        const satIncorrectMessages = [
            "💪 아쉬워요! 괜찮아요, LIEUL! 이번에 확실히 외워둬요!",
            "🌱 LIEUL, 실수해도 괜찮아요! 다음 단어에서 멋지게 성공해봐요!",
            "🔥 아까운 오답! LIEUL! 다시 집중해서 다음 문제를 공략해요!",
            "✨ LIEUL, 정답을 확인하고 다음 문제에서 실력을 발휘해봐요!"
        ];

        const revealPencilAnswer = async () => {
            if (!currentStage3Item.value || !currentStage3Item.value.word) return;
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
                    alert(`아쉬워요! AI가 '${result.recognizedText}'(으)로 읽었어요. 정답을 확인하고 다시 써볼까요? ⭐`);
                    clearCanvasStrokesOnly();
                }
            } else {
                stage3AnswerRevealed.value = true;
                speak(targetWord, 0.75);
            }
        };

        const getMaskedWord = (word) => {
            if (!word) return '';
            const str = typeof word === 'string' ? word : (word.english || '');
            if (!str) return '';
            return str[0] + ' _'.repeat(str.length - 1);
        };

        const getHighlightedExampleMeaning = (word) => {
            if (!word || !word.exampleMeaning) return '';
            let text = word.exampleMeaning;
            if (!word.meaning) return text;

            try {
                const meanings = word.meaning.split(/[,/]/).map(m => m.trim()).filter(m => m.length > 0);
                meanings.forEach(m => {
                    if (m && text.includes(m)) {
                        const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(escaped, 'g');
                        text = text.replace(regex, `<span class="text-sky-600 font-extrabold underline decoration-sky-300 decoration-2 underline-offset-2">${m}</span>`);
                    }
                });
            } catch(e) {}
            return text;
        };

        const advanceToNextDay = () => {
            stopSatTimer();
            stopSTT();
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
            if (typeof word === 'string') {
                const lower = word.toLowerCase().trim();
                if (imageMap.value && imageMap.value[lower]) return imageMap.value[lower];
                return `https://loremflickr.com/500/400/${encodeURIComponent(lower)},illustration,cartoon/all`;
            }
        
            const imgFile = word.imageFileName || word.imagefilename || word.image;
        
            if (imgFile) {
                const lowerSpec = String(imgFile).toLowerCase().trim();
                const specWithoutPath = lowerSpec.split('/').pop();
                const specWithoutExt = specWithoutPath.substring(0, specWithoutPath.lastIndexOf('.')) || specWithoutPath;
        
                if (imageMap.value[lowerSpec]) return imageMap.value[lowerSpec];
                if (imageMap.value[specWithoutPath]) return imageMap.value[specWithoutPath];
                if (imageMap.value[specWithoutExt]) return imageMap.value[specWithoutExt];
                if (String(imgFile).startsWith('http')) return imgFile;
            }
        
            if (imageMap.value && word.english) {
                const engLower = String(word.english).toLowerCase().trim();
                if (imageMap.value[engLower]) return imageMap.value[engLower];
            }
        
            return `https://loremflickr.com/500/400/${encodeURIComponent(String(word.english || '').toLowerCase())},illustration,cartoon/all`;
        };

        const handleImgError = (e) => {
            e.target.src = 'https://via.placeholder.com/500x400/e0f2fe/0284c7?text=No+Image';
        };

        const restartStage1Only = () => {
            stopSatTimer();
            stopSTT();
            currentIndex.value = 0;
            currentMode.value = 'practice';
            practiceCount.value = 0;
            practiceText.value = '';
            stage3Active.value = false;
            isReplayingDay.value = true;
            isDayCompleted.value = false; 
            
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

        const satHintText = ref('');
        
        const generateSatHint = (wordStr) => {
            if (!wordStr) return '';
            const len = wordStr.length;
            const ratio = 0.3 + Math.random() * 0.2;
            const hideCount = Math.max(1, Math.round(len * ratio));
        
            const hideIndices = new Set();
            while (hideIndices.size < hideCount) {
                const randIdx = Math.floor(Math.random() * len);
                hideIndices.add(randIdx);
            }
        
            return wordStr
                .split('')
                .map((char, idx) => (hideIndices.has(idx) ? '_' : char))
                .join(' ');
        };

        const isInputLocked = ref(false);
        
        const startSaturdayReview = () => {
            stopSatTimer();
            stopSTT();
            clearSatFeedbackTimer();
            activeScreen.value = 'learning';
            isReplayingDay.value = false;
            stage3Active.value = false;
            isInputLocked.value = false;

            const weekWords = getWords(currentWeek.value, 'Sat');
            const isCompleted = satCompletedWeeks.value.some(w => String(w) === String(currentWeek.value));

            const weakList = getWeakWords(15);
            const calculatedTotal = (weakList.length * 2) + weekWords.length;
                    
            if (isCompleted) {
                isDayCompleted.value = true;
                satQuizList.value = weekWords;
                const savedScore = satScores.value[currentWeek.value];
                if (savedScore !== undefined && savedScore !== null) {
                    if (typeof savedScore === 'object') {
                        satCorrectCount.value = savedScore.correct;
                        satTotalQuestions.value = savedScore.total;
                    } else {
                        satCorrectCount.value = Number(savedScore);
                        satTotalQuestions.value = calculatedTotal || 55;
                    }
                } else {
                    satTotalQuestions.value = calculatedTotal || 55;
                    const correctWordCount = weekWords.filter(w => {
                        const stat = wordStats.value[w.id];
                        return stat && stat.correct > 0;
                    }).length;
                    satCorrectCount.value = Math.round((correctWordCount / (weekWords.length || 1)) * 55);
                }
                return;
            }
            
            isDayCompleted.value = false;
            satStage.value = 1;
            satWordIndex.value = 0;
            satCorrectCount.value = 0;
            satComboCount.value = 0;
            satTotalQuestions.value = calculatedTotal || 55;
            satInputText.value = '';
            feedbackMessage.value = '';
            isFeedbackCorrect.value = true;
            isSatStageStarted.value = false;
            
            satQuizList.value = getWeakWords(15).sort(() => Math.random() - 0.5);
            if (satQuizList.value.length === 0) {
                satQuizList.value = getWords(currentWeek.value, 'Sat').sort(() => 0.5 - Math.random());
            }
        
            if (satCurrentWord.value) {
                satHintText.value = generateSatHint(satCurrentWord.value.english);
            }

            focusInput();
        };

        const satStageTitle = computed(() => {
            if (satStage.value === 1) return '🎯 1단계: 취약 단어 집중 공략 (힌트 제공)';
            if (satStage.value === 2) return '⚡ 2단계: 블라인드 사운드 리콜 (사운드 집중)';
            return '🔥 3단계: 15초 스피드 타임어택 (스피드 게임)';
        });

        const satStageThemeClass = computed(() => {
            if (satStage.value === 1) return 'bg-sky-500 text-white';
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

        const restartSaturdayChallenge = () => {
            stopSatTimer();
            stopSTT();
            clearSatFeedbackTimer();
            isInputLocked.value = false;
        
            satCompletedWeeks.value = satCompletedWeeks.value.filter(
                w => String(w) !== String(currentWeek.value)
            );
        
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
        
            satQuizList.value = getWeakWords(15).sort(() => Math.random() - 0.5);
            if (satQuizList.value.length === 0) {
                satQuizList.value = getWords(currentWeek.value, 'Sat').sort(() => 0.5 - Math.random());
            }
        
            if (satCurrentWord.value) {
                satHintText.value = generateSatHint(satCurrentWord.value.english);
            }
        
            focusInput();
        };

        const startSatStage3Only = () => {
            stopSatTimer();
            stopSTT();
            clearSatFeedbackTimer();
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

        const advanceFromSat = () => {
            stopSatTimer();
            stopSTT();
            clearSatFeedbackTimer();
            const weekIdx = availableWeeks.value.indexOf(currentWeek.value);
            if (weekIdx < availableWeeks.value.length - 1) {
                currentWeek.value = availableWeeks.value[weekIdx + 1];
                changeDay('Mon');
            } else {
                activeScreen.value = 'home';
            }
        };

        const promptRestartSatAll = () => {
            satResetType.value = 'all';
            showSatResetModal.value = true;
        };
        
        const promptRestartSatStage3 = () => {
            satResetType.value = 'stage3';
            showSatResetModal.value = true;
        };
        
        const cancelSatReset = () => {
            showSatResetModal.value = false;
        };

        let satFeedbackTimer = null;

        const satStageTotalQuestions = computed(() => {
            const listLen = satQuizList.value.length || 0;
            if (satResetType.value === 'stage3') {
                return Math.min(25, listLen || 25);
            }
            const target = (satStage.value === 3) ? 25 : 15;
            return listLen > 0 ? Math.min(target, listLen) : target;
        });   

        const clearSatFeedbackTimer = () => {
            if (satFeedbackTimer) {
                clearTimeout(satFeedbackTimer);
                satFeedbackTimer = null;
            }
        }; 

        const submitSatAnswer = () => {
            if (isInputLocked.value || feedbackMessage.value) return; 
            if (!satInputText.value || !satInputText.value.trim()) return;
            if (!satCurrentWord.value) return;
        
            clearSatFeedbackTimer();
            stopSatTimer();
            isInputLocked.value = true;
        
            const userInput = satInputText.value.trim().toLowerCase();
            const correctWord = satCurrentWord.value.english.trim().toLowerCase();
        
            if (userInput === correctWord) {
                satCorrectCount.value++;
                satComboCount.value++;
                isFeedbackCorrect.value = true;
                const randomMsg = satCorrectMessages[Math.floor(Math.random() * satCorrectMessages.length)];
                feedbackMessage.value = randomMsg;
                playCorrectSound();
            } else {
                satComboCount.value = 0;
                isFeedbackCorrect.value = false;
                const randomMsg = satIncorrectMessages[Math.floor(Math.random() * satIncorrectMessages.length)];
                feedbackMessage.value = `${randomMsg} (정답: ${satCurrentWord.value.english})`;
                playErrorSound();
            }
        
            satFeedbackTimer = setTimeout(() => {
                nextSatQuestion();
            }, 1500);
        };

        const handleSatTimeout = () => {
            if (isInputLocked.value) return;
            clearSatFeedbackTimer();
            isInputLocked.value = true;
            satComboCount.value = 0;
            isFeedbackCorrect.value = false;
            feedbackMessage.value = `⏰ 아쉽게 시간 초과! 다음 문제에서 빠르게 도전해봐요! (정답: ${satCurrentWord.value?.english})`;
            playErrorSound();

            satFeedbackTimer = setTimeout(() => {
                nextSatQuestion();
            }, 1500);
        };

        const advanceSatStage = () => {
            stopSatTimer();
            if (satStage.value === 1) {
                satStage.value = 2;
                satWordIndex.value = 0;
                satQuizList.value = getWeakWords(15).sort(() => Math.random() - 0.5);
                satInputText.value = '';
                feedbackMessage.value = '';
                isInputLocked.value = false;
                isSatStageStarted.value = false;
            } else if (satStage.value === 2) {
                satStage.value = 3;
                satWordIndex.value = 0;
                satQuizList.value = getWords(currentWeek.value, 'Sat').sort(() => Math.random() - 0.5);
                satInputText.value = '';
                feedbackMessage.value = '';
                isInputLocked.value = false;
                isSatStageStarted.value = false;
            } else {
                isDayCompleted.value = true;
                if (!satCompletedWeeks.value.includes(currentWeek.value)) {
                    satCompletedWeeks.value.push(currentWeek.value);
                }
                satScores.value[currentWeek.value] = {
                    correct: satCorrectCount.value,
                    total: satTotalQuestions.value
                };
                playFanfareSound();
            }
        };

        const nextSatQuestion = () => {
            clearSatFeedbackTimer();
            satInputText.value = '';
            feedbackMessage.value = '';
            satWordIndex.value++;
            const currentLimit = satStage.value === 3 ? 25 : 15;
            
            if (satWordIndex.value >= currentLimit || satWordIndex.value >= satQuizList.value.length) {
                advanceSatStage();
            } else {
                if (satStage.value === 1 && satCurrentWord.value) {
                    satHintText.value = generateSatHint(satCurrentWord.value.english);
                }
                if (satStage.value === 3) startSatTimer();
                if (satCurrentWord.value) speak(satCurrentWord.value.english, 0.75);
                
                isInputLocked.value = false;
                focusInput();
            }
        };

        const confirmSatReset = () => {
            clearSatFeedbackTimer();
            stopSatTimer();
            showSatResetModal.value = false;
            isDayCompleted.value = false;
            satCompletedWeeks.value = satCompletedWeeks.value.filter(
                w => String(w) !== String(currentWeek.value)
            );
            delete satScores.value[currentWeek.value];
            isSatStageStarted.value = false;
            
            satCorrectCount.value = 0;
            satWordIndex.value = 0;
            satComboCount.value = 0;
            satInputText.value = '';
            feedbackMessage.value = '';
        
            if (satResetType.value === 'stage3') {
                satStage.value = 3;
                satTotalQuestions.value = 25;
                satQuizList.value = getWeakWords(25).sort(() => Math.random() - 0.5);
                if (satQuizList.value.length === 0) {
                    satQuizList.value = getWords(currentWeek.value, 'Sat').sort(() => Math.random() - 0.5);
                }
            } else {
                satStage.value = 1;
                satTotalQuestions.value = 55;
                satQuizList.value = getWeakWords(15).sort(() => Math.random() - 0.5);
                if (satQuizList.value.length === 0) {
                    satQuizList.value = getWords(currentWeek.value, 'Sat').sort(() => Math.random() - 0.5);
                }
            }
            
            if (satStage.value === 1 && satCurrentWord.value) {
                satHintText.value = generateSatHint(satCurrentWord.value.english);
            }
            isInputLocked.value = false;
            focusInput();
        };
                
        return {
            activeScreen, allWords, learnedWordIDs, satCompletedWeeks, savedDate, currentWeek, selectedDay, days,
            wordStats, recordAttempt, getWordAccuracy, getAccuracyBadgeClass,
            currentIndex, currentMode, practiceText, practiceCount, quizText, isDayCompleted,
            quizSubStage, quizPart1Count, quizPart2Count, quizBlanks, soundBlindFailCount, hintLevel, triggerHint,
            stage3Active, stage3List, stage3Index, stage3AnswerRevealed, currentStage3Item,
            practiceInput, quizInput, satInput, satInputRef, canvasRef, fileInput, showConfirmModal,
            openConfirmModal, confirmLoadFile, cancelLoadFile, handleFileUpload,
            availableWeeks, getWords, isLearned, isWeekUnlocked, isWeekCompleted,
            isDayUnlocked, isDayDone, overallProgressRate, getWeekProgressRate, todayLesson, getDayBtnClass,
            currentWordList, currentWord, learnedInDayCount, startLesson, changeDay, resetDayProgress,
            resetAllProgress, resetWeekProgress, resetDayProgressFromUI, isReplayingDay, restartStage1Only,
            isCharCorrect, onPracticeInput, onQuizInput, submitPractice, submitQuiz, advanceToNextDay,
            clearPracticeInput, clearQuizInput, speak, getWordImage, handleImgError,
            startStage3, clearCanvas, clearCanvasStrokesOnly, revealPencilAnswer,
            getMaskedWord, getHighlightedExampleMeaning, nextStage3Question,
            satStage, satWordIndex, satQuizList, satCorrectCount, feedbackMessage, isFeedbackCorrect, satComboCount, satCurrentWord,
            satInputText, submitSatAnswer, getWeakWords, startSaturdayReview, getMaskedSpelling20,
            nextSatQuestion, satTimer, timerDisplay, satStageTitle, satStageThemeClass, satTotalQuestions, satHintText, restartSaturdayChallenge, satScores,
            isSatStageStarted, startSatStage, playTypingSound, startSatStage3Only, advanceFromSat,
            playFanfareSound, playSadSound, isInputLocked,
            showSatResetModal, satResetType, promptRestartSatAll, promptRestartSatStage3, confirmSatReset, cancelSatReset,
            satStageTotalQuestions, focusInput,
            isListening, isSpeakingAudio, isSTTStartedByTouch, sttAttemptCount, recognizedWordIndices, aiRecognizedText, sttStatusText, sttFeedbackObj,
            startStage3SpeakingSession, startSTT, stopSTT, speakSentenceTwice
        };
    }
}).mount('#app');
