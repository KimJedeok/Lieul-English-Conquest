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

export const speak = (text, rate = 0.75) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
};

export const speakSequence = (word, sentence) => {
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

export const playSound = (type) => {
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

export const playTypingSound = () => playSound('typing');
export const playErrorSound = () => playSound('error');
export const playCorrectSound = () => playSound('correct');
export const playFanfareSound = () => playSound('correct');
export const playSadSound = () => playSound('error');
