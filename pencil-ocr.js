// pencil-ocr.js (독립 모듈)
let strokes = [];
let currentStroke = [[], [], []];
let isDrawing = false;

function initPencilCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.addEventListener('pointerdown', (e) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    currentStroke = [[x], [y], [Date.now()]];
    ctx.beginPath();
    ctx.moveTo(x, y);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    currentStroke[0].push(x);
    currentStroke[1].push(y);
    currentStroke[2].push(Date.now());
    ctx.lineTo(x, y);
    ctx.stroke();
  });

  const stopDrawing = () => {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke[0].length > 0) strokes.push(currentStroke);
  };

  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointerleave', stopDrawing);
}

function clearPencilCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes = []; // 좌표 배열 리셋
}

async function checkPencilAnswer(targetWord, canvasId) {
  if (strokes.length === 0) return { success: false, reason: 'EMPTY' };

  const canvas = document.getElementById(canvasId);
  const payload = {
    options: "enable_homophone_conversion",
    requests: [{
      writing_guide: { writing_area_width: canvas.width, writing_area_height: canvas.height },
      ink: strokes,
      language: "en"
    }]
  };

  try {
    const res = await fetch("https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data[0] === "SUCCESS") {
      const recognizedText = data[1][0][1][0].trim().toLowerCase();
      const isCorrect = recognizedText === targetWord.trim().toLowerCase();
      return { success: true, isCorrect, recognizedText };
    }
    return { success: false, reason: 'API_FAIL' };
  } catch (err) {
    return { success: false, reason: 'NETWORK_ERROR' };
  }
}
