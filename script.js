// VARIABLES GLOBALES
let timeLeft = 300;
let timerInterval = null;
let strikes = 0;
let gameOver = false;
let difficulty = 'hard';
let maxStrikes = 3;
let gameStarted = false;
let activeModuleIds = [];
const allModuleIds = ['wires', 'keypad', 'switches', 'simon', 'capacitor', 'memory', 'valve', 'communication'];
const difficultySettings = {
  easy: { label: 'FÁCIL', time: 600, strikes: 5 },
  medium: { label: 'MEDIO', time: 420, strikes: 4 },
  hard: { label: 'DIFÍCIL', time: 300, strikes: 3 }
};
let simonTimeouts = [];

// Estado del juego
let serialNum = "";
let batteryCount = 0;
let pwrState = false;

// Módulos resueltos
let solvedModules = { wires: false, keypad: false, switches: false, simon: false, capacitor: false, memory: false, valve: false, communication: false };

// Datos del Módulo 1 (Cables)
let wiresData = [];
let correctWireIndex = -1;

// Datos del Módulo 2 (Keypad)
let keypadInput = "";
let correctKeypadCode = "";

// Datos del Módulo 3 (Interruptores)
let switchesState = [false, false, false];
let correctSwitchesState = [false, false, false];

// Datos del Módulo 4 (Simón Dice)
let simonSequence = [];
let simonInput = [];
let isPlayingSimon = false;

// Datos de los módulos 5, 6 y 7
let capacitorCharge = 0;
let capacitorPurgeCooldown = 0;
let capacitorPurgeCount = 0;
let capacitorResonanceTarget = 1;
let capacitorResonanceSelected = 1;
let memoryRound = 0;
let memoryDisplay = 1;
let memoryHistory = [];
let memoryDisplays = [];
let valveTarget = 1;
let valveSelected = 1;
let communicationMap = [];
let communicationConnections = [];
let communicationSource = null;
let solutionItems = [];

// MÚSICA Y AUDIO ENGINE (Web Audio API)
const AudioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgMusicGain = null;
let musicInterval = null;
let musicPlaying = false;
let musicEnabled = true;

// INICIALIZACIÓN
window.onload = () => showMainMenu();

function showMainMenu() {
  gameStarted = false;
  clearInterval(timerInterval);
  stopBgMusic();
  document.querySelectorAll('.modal').forEach((modal) => modal.classList.remove('active'));
  document.getElementById('main-menu').classList.add('active');
}

function startGame() {
  difficulty = document.getElementById('menu-difficulty').value;
  gameStarted = true;
  document.getElementById('main-menu').classList.remove('active');
  initGame();
}

function restartGame() {
  if (!gameStarted) return startGame();
  initGame();
}

function initGame() {
  clearInterval(timerInterval);
  const settings = difficultySettings[difficulty];
  timeLeft = settings.time;
  maxStrikes = settings.strikes;
  strikes = 0;
  gameOver = false;
  gameStarted = true;
  simonTimeouts.forEach(clearTimeout);
  simonTimeouts = [];
  isPlayingSimon = false;
  solvedModules = { wires: false, keypad: false, switches: false, simon: false, capacitor: false, memory: false, valve: false, communication: false };
  keypadInput = "";
  capacitorCharge = 0;
  capacitorPurgeCooldown = 0;
  memoryRound = 0;
  memoryHistory = [];
  memoryDisplays = [];
  communicationConnections = [];
  communicationSource = null;

  activeModuleIds = [...allModuleIds]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  // Interruptores necesita los colores del módulo de cables para poder resolverse.
  if (activeModuleIds.includes('switches') && !activeModuleIds.includes('wires')) {
    const replacementIndex = activeModuleIds.findIndex((moduleId) => moduleId !== 'switches');
    activeModuleIds[replacementIndex] = 'wires';
  }

  // Ocultar modales
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.getElementById('capacitor-warning').classList.remove('visible');
  document.getElementById('boom-solutions').hidden = true;

  // Limpiar clases de resuelto
  document.querySelectorAll('.module-status').forEach(s => s.classList.remove('solved'));
  document.querySelectorAll('.module').forEach(m => m.classList.remove('solved-glow'));

  // Generar datos aleatorios
  generateSerial();
  batteryCount = Math.floor(Math.random() * 4);
  pwrState = Math.random() < 0.5;

  // Actualizar UI General
  document.getElementById('serial-num').innerText = serialNum;
  document.getElementById('manual-link').href = `manual.html?difficulty=${difficulty}`;
  document.getElementById('bat-count').innerText = batteryCount;
  document.querySelectorAll('.battery-cell').forEach((cell, index) => {
    cell.classList.toggle('charged', index < batteryCount);
  });
  document.getElementById('battery-display').setAttribute('aria-label', `${batteryCount} baterías`);
  const ledPwr = document.getElementById('led-pwr');
  const pwrIndicator = document.getElementById('pwr-indicator');
  const pwrLabel = document.getElementById('pwr-label');
  pwrState ? ledPwr.classList.add('on') : ledPwr.classList.remove('on');
  pwrIndicator.classList.toggle('is-on', pwrState);
  pwrLabel.innerText = pwrState ? 'ON' : 'OFF';

  updateStrikesUI();
  updateTimerUI();
  updateDifficultyUI();
  updateProgressUI();
  showFeedback('SISTEMA LISTO. COORDINEN SUS DECISIONES.', 'info');

  // Inicializar Módulos
  setupWiresModule();
  setupKeypadModule();
  setupSwitchesModule();
  setupSimonModule();
  setupCapacitorModule();
  setupMemoryModule();
  setupValveModule();
  setupCommunicationModule();
  buildSolutionItems();
  applyActiveModules();
  if (musicEnabled && !musicPlaying) startBgMusic();

  // Iniciar Reloj con sonido por segundo
  timerInterval = setInterval(() => {
    if (timeLeft > 0 && !gameOver) {
      timeLeft--;
      updateTimerUI();
      updateCapacitor();
      
      const tickFreq = timeLeft <= 30 ? 1200 : 800;
      if (musicEnabled) playBeepSound(tickFreq, 0.05, 'sine', 1.25);
    } else if (timeLeft <= 0 && !gameOver) {
      triggerExplosion();
    }
  }, 1000);
}

// TEMPORIZADOR Y STRIKES
function updateTimerUI() {
  const m = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const s = String(timeLeft % 60).padStart(2, '0');
  document.getElementById('timer').innerText = `${m}:${s}`;
}

function addStrike() {
  strikes++;
  updateStrikesUI();
  triggerStrikeEffect();
  playBeepSound(120, 0.35, 'sawtooth', 1.5);
  showFeedback(`ERROR DETECTADO: STRIKE ${strikes}/${maxStrikes}`, 'error');

  if (strikes >= maxStrikes) {
    triggerExplosion();
  }
}

function updateStrikesUI() {
  const spans = document.querySelectorAll('#strikes span');
  spans.forEach((span, index) => {
    span.style.display = index < maxStrikes ? '' : 'none';
    if (index < strikes) {
      span.classList.add('strike-active');
    } else {
      span.classList.remove('strike-active');
    }
  });
}

function updateDifficultyUI() {
  const selector = document.getElementById('difficulty-select');
  const label = document.getElementById('difficulty-label');
  if (selector) selector.value = difficulty;
  if (label) label.innerText = difficultySettings[difficulty].label;
}

function changeDifficulty(nextDifficulty) {
  if (!difficultySettings[nextDifficulty] || nextDifficulty === difficulty) return;
  difficulty = nextDifficulty;
  initGame();
}

function updateProgressUI() {
  const progress = document.getElementById('progress-count');
  if (!progress) return;
  const solvedCount = activeModuleIds.filter((moduleId) => solvedModules[moduleId]).length;
  progress.innerText = `${solvedCount}/${activeModuleIds.length}`;
}

function applyActiveModules() {
  const moduleElements = document.querySelectorAll('.module');
  const moduleIds = Object.keys(solvedModules);

  moduleElements.forEach((moduleElement, index) => {
    const moduleId = moduleIds[index];
    moduleElement.classList.toggle('inactive', !activeModuleIds.includes(moduleId));
  });

  updateProgressUI();
}

function showFeedback(message, type = 'info') {
  const feedback = document.getElementById('game-feedback');
  if (!feedback) return;
  feedback.innerText = message;
  feedback.className = `game-feedback ${type}`;
  clearTimeout(showFeedback.timeout);
  showFeedback.timeout = setTimeout(() => feedback.classList.remove('visible'), 8000);
  requestAnimationFrame(() => feedback.classList.add('visible'));
}

// EFECTOS VISUALES Y MODAL CONFIRMACIÓN
function pedirConfirmacionReiniciar() {
  if (gameOver) {
    initGame();
  } else {
    document.getElementById('modal-confirm').classList.add('active');
  }
}

function confirmarReiniciar(confirmado) {
  document.getElementById('modal-confirm').classList.remove('active');
  if (confirmado) initGame();
}

function triggerStrikeEffect() {
  const container = document.querySelector('.main-container');
  container.classList.add('flash-error', 'shake');
  setTimeout(() => container.classList.remove('flash-error', 'shake'), 400);
}

function markModuleSolved(moduleId, statusId) {
  if (!activeModuleIds.includes(moduleId)) return;
  solvedModules[moduleId] = true;
  document.getElementById(statusId).classList.add('solved');
  const moduleElem = document.getElementById(statusId).closest('.module');
  if (moduleElem) moduleElem.classList.add('solved-glow');

  playBeepSound(900, 0.15, 'triangle', 1.25);
  updateProgressUI();
  showFeedback(`MÓDULO COMPLETADO: ${moduleId.toUpperCase()}`, 'success');
  checkVictoryCondition();
}

function checkVictoryCondition() {
  if (activeModuleIds.length === 3 && activeModuleIds.every((moduleId) => solvedModules[moduleId])) {
    gameOver = true;
    clearInterval(timerInterval);
    stopBgMusic();
    document.getElementById('win-time').innerText = document.getElementById('timer').innerText;
    document.getElementById('win-strikes').innerText = strikes;
    document.getElementById('modal-win').classList.add('active');
  }
}

function triggerExplosion() {
  gameOver = true;
  clearInterval(timerInterval);
  stopBgMusic();
  playExplosionSound();
  renderSolutions();
  document.getElementById('modal-boom').classList.add('active');
}

function buildSolutionItems() {
  const moduleNames = {
    wires: 'CABLES', keypad: 'KEYPAD', switches: 'INTERRUPTORES', simon: 'SIMÓN',
    capacitor: 'CAPACITOR', memory: 'MEMORIA', valve: 'VÁLVULA', communication: 'COMUNICACIÓN'
  };
  const wireColors = wiresData.map((wire) => wire.name.toUpperCase()).join(' · ');
  const switchSolution = correctSwitchesState.map((isOn) => isOn ? 'ON' : 'OFF').join(' / ');
  const simonColors = ['ROJO', 'AZUL', 'AMARILLO', 'VERDE'];
  const translatedSimon = simonSequence.map((colorIndex) => {
    let buttonIndex = colorIndex;
    if (pwrState && colorIndex < 2) buttonIndex = colorIndex === 0 ? 1 : 0;
    if (!pwrState && colorIndex >= 2) buttonIndex = colorIndex === 2 ? 3 : 2;
    return simonColors[buttonIndex];
  }).join(' → ');
  const memorySolution = memoryDisplays.map((display, round) => {
    let buttonIndex = display - 1;
    if (round === 1) buttonIndex = memoryDisplays[0] - 1;
    if (round === 2) buttonIndex = [2, 0, 3, 1][display - 1];
    if (round === 3) buttonIndex = [1, 3, 0, 2][display - 1];
    return `R${round + 1}: botón ${buttonIndex + 1}`;
  }).join(' · ');
  const communicationSolution = communicationMap.map((target, source) => `OUT ${source + 1}→IN ${target + 1}`).join(' · ');

  const solutions = {
    wires: `Cortar el cable ${correctWireIndex + 1}. Orden: ${wireColors}.`,
    keypad: `Introducir el código ${correctKeypadCode}.`,
    switches: `Configurar SW-1 / SW-2 / SW-3: ${switchSolution}.`,
    simon: `Presionar: ${translatedSimon}.`,
    capacitor: `Usar resonancia nivel ${capacitorResonanceTarget}; emergencia con carga ≥75% y ${batteryCount} baterías; controlada tras 3 purgas y carga ≤25%.`,
    memory: memorySolution,
    valve: `Seleccionar nivel ${valveTarget} y bloquear la válvula.`,
    communication: `Conectar ${communicationSolution} y transmitir.`
  };
  solutionItems = activeModuleIds.map((moduleId) => ({ name: moduleNames[moduleId], text: solutions[moduleId] }));
}

function renderSolutions() {
  const list = document.getElementById('solution-list');
  if (!list) return;
  list.innerHTML = solutionItems.map((solution) => `<div class="solution-item"><strong>${solution.name}:</strong> ${solution.text}</div>`).join('');
}

function toggleSolutions() {
  const panel = document.getElementById('boom-solutions');
  if (!panel) return;
  panel.hidden = !panel.hidden;
}

// GENERAR SERIE
function generateSerial() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const digits = "0123456789";
  serialNum = "";
  for (let i = 0; i < 6; i++) {
    serialNum += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // El manual necesita un dígito para las reglas de paridad.
  const digitPosition = Math.floor(Math.random() * serialNum.length);
  serialNum = `${serialNum.slice(0, digitPosition)}${digits.charAt(Math.floor(Math.random() * digits.length))}${serialNum.slice(digitPosition + 1)}`;
}

// MÓDULO 01: CABLES (8 Cables con 1 par duplicado)
function setupWiresModule() {
  const colors = ['#ff2a4d', '#00bfff', '#ffb700', '#00ff88', '#ffffff', '#1e293b', '#a855f7', '#ff6b00'];
  const colorNames = ['rojo', 'azul', 'amarillo', 'verde', 'blanco', 'negro', 'violeta', 'naranja'];
  wiresData = [];

  let availableIndices = [...Array(colors.length).keys()];
  availableIndices.sort(() => Math.random() - 0.5);
  let selectedIndices = availableIndices.slice(0, 7);

  const duplicatedIndex = selectedIndices[Math.floor(Math.random() * selectedIndices.length)];
  selectedIndices.push(duplicatedIndex);

  selectedIndices.sort(() => Math.random() - 0.5);

  selectedIndices.forEach(idx => {
    wiresData.push({ hex: colors[idx], name: colorNames[idx] });
  });

  const lastDigit = parseInt(serialNum.replace(/\D/g, '').slice(-1) || '0', 10);
  const isOdd = lastDigit % 2 !== 0;
  const hasBlue = wiresData.some(w => w.name === 'azul');
  const lastColor = wiresData[7].name;

  if (wiresData[0].name === 'rojo' && isOdd) {
    correctWireIndex = 2;
  } else if (pwrState && hasBlue) {
    correctWireIndex = wiresData.findIndex(w => w.name === 'azul');
  } else if (lastColor === 'negro' || lastColor === 'blanco') {
    correctWireIndex = 7;
  } else if (batteryCount >= 2) {
    correctWireIndex = 1;
  } else {
    correctWireIndex = 4;
  }

  const container = document.getElementById('wires-list');
  container.innerHTML = '';
  wiresData.forEach((wire, idx) => {
    const div = document.createElement('div');
    div.className = 'wire-line';
    div.style.backgroundColor = wire.hex;
    div.style.setProperty('--wire-color', wire.hex);
    div.onclick = (e) => cutWire(idx, e);
    container.appendChild(div);
  });
}

function cutWire(index, event) {
  if (solvedModules.wires || gameOver) return;

  const wireElements = document.querySelectorAll('#wires-list .wire-line');
  const selectedWire = wireElements[index];

  if (selectedWire.classList.contains('cut')) return;

  selectedWire.style.setProperty('--wire-color', wiresData[index].hex);
  selectedWire.classList.add('cut');

  // EFECTO DE CHISPAS Y SONIDO
  createSparks(event.clientX, event.clientY);
  playBeepSound(1200, 0.08, 'sawtooth', 1.5);

  if (index === correctWireIndex) {
    markModuleSolved('wires', 'st-wires');
  } else {
    addStrike();
  }
}

function createSparks(x, y) {
  const sparkColors = ['#ffb700', '#ff2a4d', '#ffffff', '#00bfff'];
  for (let i = 0; i < 20; i++) {
    const spark = document.createElement('div');
    spark.className = 'spark';
    
    const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];
    spark.style.backgroundColor = color;
    spark.style.boxShadow = `0 0 6px ${color}`;
    
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;

    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 50;
    const dx = `${Math.cos(angle) * distance}px`;
    const dy = `${Math.sin(angle) * distance}px`;

    spark.style.setProperty('--dx', dx);
    spark.style.setProperty('--dy', dy);

    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 500);
  }
}

// MÓDULO 02: KEYPAD
function setupKeypadModule() {
  keypadInput = "";
  document.getElementById('keypad-input').innerText = "____";

  const digits = serialNum.replace(/\D/g, '').split('').map(Number);
  const sumDigits = digits.reduce((a, b) => a + b, 0);
  let val = (sumDigits * 150) + (batteryCount * 100) + (pwrState ? 500 : -200);
  
  val = Math.abs(val);
  const strVal = String(val).padStart(4, '0');
  correctKeypadCode = strVal.slice(-4);
}

function pressKey(num) {
  if (solvedModules.keypad || gameOver || keypadInput.length >= 4) return;
  keypadInput += num;
  document.getElementById('keypad-input').innerText = keypadInput.padEnd(4, '_');
  playBeepSound(450, 0.08, 'sine', 1.25);
}

document.addEventListener('keydown', (event) => {
  if (!gameStarted || !activeModuleIds.includes('keypad') || gameOver) return;

  if (event.key >= '0' && event.key <= '9') {
    pressKey(event.key);
    return;
  }
  if (event.key === 'Enter') {
    submitKeypad();
    return;
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    clearKeypad();
  }
});

function clearKeypad() {
  if (solvedModules.keypad || gameOver) return;
  keypadInput = "";
  document.getElementById('keypad-input').innerText = "____";
}

function submitKeypad() {
  if (solvedModules.keypad || gameOver) return;
  if (keypadInput === correctKeypadCode) {
    markModuleSolved('keypad', 'st-keypad');
  } else {
    addStrike();
    clearKeypad();
  }
}

// MÓDULO 03: INTERRUPTORES
function setupSwitchesModule() {
  switchesState = [false, false, false];
  for (let i = 0; i < 3; i++) {
    const sw = document.getElementById(`sw-${i}`);
    sw.classList.remove('on');
  }

  const hasVowel = /[AEIOU]/i.test(serialNum);
  const hasBlueInWires = wiresData.some(w => w.name === 'azul');

  correctSwitchesState[0] = hasVowel;
  correctSwitchesState[1] = pwrState && (batteryCount >= 2);
  correctSwitchesState[2] = hasBlueInWires;
}

function toggleSwitch(idx) {
  if (solvedModules.switches || gameOver) return;
  switchesState[idx] = !switchesState[idx];
  const sw = document.getElementById(`sw-${idx}`);
  switchesState[idx] ? sw.classList.add('on') : sw.classList.remove('on');
  playBeepSound(300, 0.08, 'square', 1.25);
}

function submitSwitches() {
  if (solvedModules.switches || gameOver) return;
  const isCorrect = switchesState.every((val, i) => val === correctSwitchesState[i]);
  if (isCorrect) {
    markModuleSolved('switches', 'st-switches');
  } else {
    addStrike();
  }
}

// MÓDULO 04: SIMÓN DICE
function setupSimonModule() {
  simonSequence = [];
  simonInput = [];
  for (let i = 0; i < 3; i++) {
    simonSequence.push(Math.floor(Math.random() * 4));
  }
}

function playSimonSequence() {
  if (solvedModules.simon || gameOver || isPlayingSimon) return;
  isPlayingSimon = true;
  simonInput = [];

  let delay = 0;
  simonSequence.forEach((btnIdx) => {
    simonTimeouts.push(setTimeout(() => flashSimonBtn(btnIdx), delay));
    delay += 600;
  });

  simonTimeouts.push(setTimeout(() => { isPlayingSimon = false; simonTimeouts = []; }, delay));
}

function flashSimonBtn(idx) {
  const btn = document.getElementById(`simon-btn-${idx}`);
  btn.classList.add('active');
  playBeepSound(350 + (idx * 120), 0.2, 'sine', 1.25);
  setTimeout(() => btn.classList.remove('active'), 300);
}

function pressSimon(btnIdx) {
  if (solvedModules.simon || gameOver || isPlayingSimon) return;

  flashSimonBtn(btnIdx);
  let expectedBtn = btnIdx;

  if (pwrState) {
    if (btnIdx === 0) expectedBtn = 1;
    else if (btnIdx === 1) expectedBtn = 0;
  } else {
    if (btnIdx === 2) expectedBtn = 3;
    else if (btnIdx === 3) expectedBtn = 2;
  }

  simonInput.push(expectedBtn);
  const currentStep = simonInput.length - 1;

  if (simonInput[currentStep] !== simonSequence[currentStep]) {
    addStrike();
    simonInput = [];
    return;
  }

  if (simonInput.length === simonSequence.length) {
    markModuleSolved('simon', 'st-simon');
  }
}

// SISTEMA DE AUDIO (EFECTOS Y MÚSICA SINTETIZADA)
function playBeepSound(freq, duration, type = 'sine', volume = 1.25) {
  if (AudioCtx.state === 'suspended') AudioCtx.resume();
  const osc = AudioCtx.createOscillator();
  const gain = AudioCtx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, AudioCtx.currentTime);
  
  gain.gain.setValueAtTime(volume, AudioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, AudioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(AudioCtx.destination);
  osc.start();
  osc.stop(AudioCtx.currentTime + duration);
}

function playExplosionSound() {
  if (AudioCtx.state === 'suspended') AudioCtx.resume();

  const bufferSize = AudioCtx.sampleRate * 2;
  const buffer = AudioCtx.createBuffer(1, bufferSize, AudioCtx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const noise = AudioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = AudioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, AudioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(30, AudioCtx.currentTime + 1.8);

  const noiseGain = AudioCtx.createGain();
  noiseGain.gain.setValueAtTime(1.8, AudioCtx.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, AudioCtx.currentTime + 1.8);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(AudioCtx.destination);

  const subOsc = AudioCtx.createOscillator();
  const subGain = AudioCtx.createGain();
  subOsc.type = 'sawtooth';
  subOsc.frequency.setValueAtTime(150, AudioCtx.currentTime);
  subOsc.frequency.exponentialRampToValueAtTime(20, AudioCtx.currentTime + 1.2);

  subGain.gain.setValueAtTime(1.5, AudioCtx.currentTime);
  subGain.gain.exponentialRampToValueAtTime(0.01, AudioCtx.currentTime + 1.2);

  subOsc.connect(subGain);
  subGain.connect(AudioCtx.destination);

  noise.start();
  subOsc.start();
  noise.stop(AudioCtx.currentTime + 1.8);
  subOsc.stop(AudioCtx.currentTime + 1.2);
}

function toggleMusic() {
  const btn = document.getElementById('btn-music');
  if (musicPlaying) {
    musicEnabled = false;
    stopBgMusic();
    btn.innerText = '🔇 MÚSICA: OFF';
  } else {
    musicEnabled = true;
    startBgMusic();
    btn.innerText = '🔊 MÚSICA: ON';
  }
}

function startBgMusic() {
  if (AudioCtx.state === 'suspended') AudioCtx.resume();
  musicPlaying = true;
  const btn = document.getElementById('btn-music');
  if (btn) btn.innerText = '🔊 MÚSICA: ON';

  const notes = [110, 130.81, 123.47, 164.81, 110, 155.56, 130.81, 146.83];
  let noteIndex = 0;

  musicInterval = setInterval(() => {
    if (!musicPlaying) return;

    const osc = AudioCtx.createOscillator();
    const gain = AudioCtx.createGain();
    const filter = AudioCtx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(notes[noteIndex], AudioCtx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, AudioCtx.currentTime);

    gain.gain.setValueAtTime(1.25, AudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, AudioCtx.currentTime + 0.24);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(AudioCtx.destination);

    osc.start();
    osc.stop(AudioCtx.currentTime + 0.25);

    noteIndex = (noteIndex + 1) % notes.length;
  }, 220);
}

function stopBgMusic() {
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
  musicPlaying = false;
}

function conectarArduino() {
  alert('Conectando puerto Serie COM...');
}

// MÓDULO 05: CONDENSADOR DE DESCARGA
function setupCapacitorModule() {
  capacitorCharge = 0;
  capacitorPurgeCooldown = 0;
  capacitorPurgeCount = 0;
  const serialDigits = serialNum.replace(/\D/g, '').split('').reduce((sum, digit) => sum + Number(digit), 0);
  const resonanceScore = serialDigits + batteryCount + (pwrState ? 2 : 0);
  capacitorResonanceTarget = resonanceScore <= 5 ? 1 : resonanceScore <= 10 ? 2 : resonanceScore <= 15 ? 3 : 4;
  capacitorResonanceSelected = 1;
  document.querySelectorAll('.resonance-level').forEach((button, index) => {
    button.classList.toggle('selected', index === 0);
  });
  updateCapacitorUI();
}

function updateCapacitor() {
  if (!activeModuleIds.includes('capacitor') || solvedModules.capacitor || gameOver) return;

  capacitorCharge = Math.min(100, capacitorCharge + 0.65);
  capacitorPurgeCooldown = Math.max(0, capacitorPurgeCooldown - 1);
  updateCapacitorUI();
  if (capacitorCharge >= 100) triggerExplosion();
}

function updateCapacitorUI() {
  const bar = document.getElementById('capacitor-bar');
  const value = document.getElementById('capacitor-value');
  if (!bar || !value) return;
  bar.style.width = `${capacitorCharge}%`;
  value.innerText = `${Math.round(capacitorCharge)}%`;
  const track = bar.parentElement;
  track.setAttribute('aria-valuenow', Math.round(capacitorCharge));
  bar.classList.toggle('critical', capacitorCharge >= 75);
  const warning = document.getElementById('capacitor-warning');
  if (warning) {
    warning.classList.toggle('visible', activeModuleIds.includes('capacitor') && capacitorCharge >= 75 && !solvedModules.capacitor && !gameOver);
  }
  const cooldown = document.getElementById('capacitor-cooldown');
  if (cooldown) {
    const purgeStatus = capacitorPurgeCooldown > 0 ? `PURGA EN ${capacitorPurgeCooldown}s` : 'PURGA DISPONIBLE';
    cooldown.innerText = `${purgeStatus} | PURGAS ${capacitorPurgeCount}/3`;
  }
}

function purgeCapacitor() {
  if (!activeModuleIds.includes('capacitor') || solvedModules.capacitor || gameOver) return;
  if (capacitorPurgeCooldown > 0) return;

  capacitorCharge = Math.max(0, capacitorCharge - 25);
  capacitorPurgeCooldown = 10;
  capacitorPurgeCount++;
  updateCapacitorUI();
  playBeepSound(260, 0.12, 'sine', 1.25);
}

function fullyDischargeCapacitor() {
  if (!activeModuleIds.includes('capacitor') || solvedModules.capacitor || gameOver) return;

  if (capacitorCharge < 75 || batteryCount < 2) {
    addStrike();
    return;
  }
  capacitorCharge = 0;
  updateCapacitorUI();
  markModuleSolved('capacitor', 'st-capacitor');
}

function controlledDischargeCapacitor() {
  if (!activeModuleIds.includes('capacitor') || solvedModules.capacitor || gameOver) return;

  if (capacitorPurgeCount < 3 || capacitorCharge > 25) {
    addStrike();
    return;
  }

  capacitorCharge = 0;
  updateCapacitorUI();
  markModuleSolved('capacitor', 'st-capacitor');
}

function selectCapacitorResonance(level) {
  if (!activeModuleIds.includes('capacitor') || solvedModules.capacitor || gameOver) return;
  capacitorResonanceSelected = level;
  document.querySelectorAll('.resonance-level').forEach((button, index) => {
    button.classList.toggle('selected', index === level - 1);
  });
}

function resonantDischargeCapacitor() {
  if (!activeModuleIds.includes('capacitor') || solvedModules.capacitor || gameOver) return;

  if (capacitorResonanceSelected !== capacitorResonanceTarget) {
    addStrike();
    return;
  }

  capacitorCharge = 0;
  updateCapacitorUI();
  markModuleSolved('capacitor', 'st-capacitor');
}

// MÓDULO 06: SECUENCIA DE MEMORIA
function setupMemoryModule() {
  memoryRound = 0;
  memoryHistory = [];
  memoryDisplays = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4) + 1);
  nextMemoryRound();
}

function nextMemoryRound() {
  memoryDisplay = memoryDisplays[memoryRound];
  document.getElementById('memory-display').innerText = memoryDisplay;
  document.getElementById('memory-round').innerText = `RONDA ${memoryRound + 1}/4`;
  document.getElementById('memory-instruction').innerText = getMemoryInstruction();
}

function getMemoryInstruction() {
  if (memoryRound === 0) return 'Presiona el botón en la posición indicada por la pantalla.';
  if (memoryRound === 1) return 'Presiona el botón con la misma etiqueta de la Ronda 1.';
  if (memoryRound === 2) return 'Presiona la posición indicada por la tabla de la Ronda 3.';
  return 'Presiona el botón con la etiqueta indicada por la tabla final.';
}

function getMemoryExpectedButton() {
  if (memoryRound === 0) return memoryDisplay - 1;
  if (memoryRound === 1) return memoryHistory[0];
  if (memoryRound === 2) return [2, 0, 3, 1][memoryDisplay - 1];
  return [1, 3, 0, 2][memoryDisplay - 1];
}

function pressMemory(buttonIndex) {
  if (solvedModules.memory || gameOver) return;

  if (buttonIndex === getMemoryExpectedButton()) {
    memoryHistory.push(buttonIndex);
    memoryRound++;
    if (memoryRound === 4) {
      markModuleSolved('memory', 'st-memory');
    } else {
      nextMemoryRound();
    }
  } else {
    addStrike();
    memoryRound = 0;
    memoryHistory = [];
    nextMemoryRound();
  }
}

// MÓDULO 07: VÁLVULA DE PRESIÓN
function setupValveModule() {
  valveTarget = Math.max(1, Math.min(4, batteryCount + (pwrState ? 1 : 0)));
  valveSelected = 1;
  document.querySelectorAll('.valve-level').forEach((button, index) => {
    button.classList.toggle('selected', index === 0);
  });
  updateValveUI();
}

function selectValveLevel(level) {
  if (solvedModules.valve || gameOver) return;
  valveSelected = level;
  document.querySelectorAll('.valve-level').forEach((button, index) => {
    button.classList.toggle('selected', index === level - 1);
  });
  updateValveUI();
}

function updateValveUI() {
  const needle = document.getElementById('valve-needle');
  if (!needle) return;
  needle.style.transform = `rotate(${-90 + ((valveSelected - 1) / 3) * 180}deg)`;
}

function adjustValve() {
  if (solvedModules.valve || gameOver) return;
  updateValveUI();
  if (valveSelected === valveTarget) {
    markModuleSolved('valve', 'st-valve');
  } else {
    addStrike();
  }
}

// MÓDULO 08: COMUNICACIÓN / CABLEADO DE SEÑAL
function setupCommunicationModule() {
  const lastDigit = parseInt(serialNum.replace(/\D/g, '').slice(-1) || '0', 10);
  communicationMap = [0, 1, 2, 3];

  if (lastDigit % 2 === 0) communicationMap.reverse();
  if (pwrState) [communicationMap[1], communicationMap[2]] = [communicationMap[2], communicationMap[1]];
  if (batteryCount >= 2) communicationMap = communicationMap.map((target) => (target + 1) % 4);

  communicationConnections = [];
  communicationSource = null;
  document.querySelectorAll('.communication-terminal').forEach((terminal) => terminal.classList.remove('selected', 'connected', 'wrong'));
  renderCommunicationWires();
  document.getElementById('communication-status').innerText = 'SELECCIONA UNA SALIDA';
}

function selectCommunicationSource(sourceIndex) {
  if (solvedModules.communication || gameOver) return;
  communicationSource = sourceIndex;
  document.querySelectorAll('.communication-source').forEach((terminal, index) => terminal.classList.toggle('selected', index === sourceIndex));
  document.getElementById('communication-status').innerText = `SALIDA ${sourceIndex + 1} SELECCIONADA`;
}

function connectCommunicationTarget(targetIndex) {
  if (solvedModules.communication || gameOver || communicationSource === null) return;

  const sourceIndex = communicationSource;
  const sourceTerminal = document.getElementById(`com-source-${sourceIndex}`);
  const targetTerminal = document.getElementById(`com-target-${targetIndex}`);
  document.querySelectorAll('.communication-terminal').forEach((terminal) => terminal.classList.remove('selected', 'wrong'));

  if (communicationMap[sourceIndex] !== targetIndex || communicationConnections.some((connection) => connection.target === targetIndex)) {
    sourceTerminal.classList.add('wrong');
    targetTerminal.classList.add('wrong');
    communicationSource = null;
    document.getElementById('communication-status').innerText = 'CONEXIÓN RECHAZADA';
    addStrike();
    return;
  }

  communicationConnections.push({ source: sourceIndex, target: targetIndex });
  sourceTerminal.classList.add('connected');
  targetTerminal.classList.add('connected');
  renderCommunicationWires();
  communicationSource = null;
  document.getElementById('communication-status').innerText = `${communicationConnections.length}/4 CONEXIONES ESTABLES`;
}

function transmitCommunication() {
  if (solvedModules.communication || gameOver) return;
  if (communicationConnections.length === 4) {
    markModuleSolved('communication', 'st-communication');
  } else {
    addStrike();
    document.getElementById('communication-status').innerText = 'FALTAN CONEXIONES';
  }
}

function renderCommunicationWires() {
  const board = document.getElementById('communication-board');
  const svg = document.getElementById('communication-wire-layer');
  if (!board || !svg) return;

  const boardRect = board.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
  svg.innerHTML = '';

  communicationConnections.forEach((connection, index) => {
    const sourceRect = document.getElementById(`com-source-${connection.source}`).getBoundingClientRect();
    const targetRect = document.getElementById(`com-target-${connection.target}`).getBoundingClientRect();
    const startX = sourceRect.right - boardRect.left;
    const startY = sourceRect.top + sourceRect.height / 2 - boardRect.top;
    const endX = targetRect.left - boardRect.left;
    const endY = targetRect.top + targetRect.height / 2 - boardRect.top;
    const bend = Math.max(35, (endX - startX) * 0.45);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    path.setAttribute('d', `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`);
    path.setAttribute('class', `communication-wire wire-color-${index % 4}`);
    path.setAttribute('pathLength', '1');
    svg.appendChild(path);
  });
}

window.addEventListener('resize', renderCommunicationWires);