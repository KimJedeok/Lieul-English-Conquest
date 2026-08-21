const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 사용자 클릭/터치 시 브라우저 오디오 차단 해제
const unlockAudio = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if ('speechSynthesis' in window) {
        const dummyUtterance = new SpeechSynthesisUtterance('');
        dummyUtterance.volume = 0;
        window.speechSynthesis.speak(dummyUtterance);
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
};
window.addEventListener('click', unlockAudio);
window.addEventListener('touchstart', unlockAudio);

const playSound = (freq, type, duration) => {
    try {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
};

const playTypingSound = () => playSound(800, 'sine', 0.05);
const playCorrectSound = () => {
    playSound(523.25, 'sine', 0.1);
    setTimeout(() => playSound(659.25, 'sine', 0.15), 100);
};
const playErrorSound = () => playSound(180, 'sawtooth', 0.2);

const playChimeSound = () => {
    playSound(587.33, 'sine', 0.08);
    setTimeout(() => playSound(880, 'sine', 0.12), 80);
};

let speechTimer = null;
const speak = (text, rate = 0.7, delay = 400) => {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        if (speechTimer) clearTimeout(speechTimer);
        speechTimer = setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = rate;
            window.speechSynthesis.speak(utterance);
        }, delay);
    }
};

const speakSequence = (wordText, sentenceText) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (speechTimer) clearTimeout(speechTimer);

    const u1 = new SpeechSynthesisUtterance(wordText);
    u1.lang = 'en-US';
    u1.rate = 0.75;

    u1.onend = () => {
        playChimeSound();
        speechTimer = setTimeout(() => {
            const u2 = new SpeechSynthesisUtterance(sentenceText);
            u2.lang = 'en-US';
            u2.rate = 0.65;
            window.speechSynthesis.speak(u2);
        }, 400);
    };

    window.speechSynthesis.speak(u1);
};

// 화려한 승리 팡파르 (도-미-솔-높은도)
const playFanfareSound = () => {
    playSound(523.25, 'triangle', 0.1);
    setTimeout(() => playSound(659.25, 'triangle', 0.1), 80);
    setTimeout(() => playSound(783.99, 'triangle', 0.1), 160);
    setTimeout(() => playSound(1046.50, 'triangle', 0.35), 240);
};

// 아쉬운 실패음 (하강 단조 3연음)
const playSadSound = () => {
    playSound(311.13, 'sawtooth', 0.12);
    setTimeout(() => playSound(293.66, 'sawtooth', 0.12), 120);
    setTimeout(() => playSound(261.63, 'sawtooth', 0.4), 240);
};
