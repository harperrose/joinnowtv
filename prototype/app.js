/* Noli ripple prototype.
   Behaviour follows the live study at nolie-ripple-prototype.netlify.app
   (build noted in that page as app.js?v=114):

   Voice — browser SpeechRecognition for words, plus a separate microphone
   level meter. The live LiveResponse class does not use speech synthesis.
   Silence of 2100ms after at least 280ms of voice finishes a listening turn.
   If recognition is blocked, the glow still follows the microphone.

   Figma — the live page never calls the Figma API. Layout is a 390×844 frame
   scaled the way app.js fit() scales it, and figma-controls.css pins the
   round mic at left 157, top 703 (center 195, 741). Pill mic styles opt out
   of that anchor, which is what these frames use.

   Eyes — still photographs only. The live welcome portrait video is not used,
   so there is no gaze loop and no blink. */

const FRAME_W = 390;
const FRAME_H = 844;
const FIGMA_MIC = { left: 157, top: 703, size: 76, centerX: 195, centerY: 741 };
const SILENCE_MS = 2100;
const MIN_VOICE_MS = 280;
const ORDER = ['hero', 'sorted', 'mirror', 'listen', 'mira', 'home'];

const PALETTES = {
  listen: { top: '#f6f1ee', a: '#cbb8f6', b: '#b89af2', c: '#ddc8fb', floor: 0.62 },
  mira: { top: '#f7f1ee', a: '#f0d0c0', b: '#e7c2ae', c: '#f6e4d8', floor: 0.58 },
  home: { top: '#f7f3ef', a: '#e4d4f6', b: '#d9c6f3', c: '#efe4fb', floor: 0.72 },
  rest: { top: '#f7f3ef', a: '#f7f3ef', b: '#f7f3ef', c: '#f7f3ef', floor: 1 }
};

const phone = document.querySelector('#phone');
const wrap = document.querySelector('#phone-wrap');
const canvas = document.querySelector('#glow');
const ctx = canvas.getContext('2d', { alpha: true });
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const announcement = document.querySelector('#announcement');

const screens = [...document.querySelectorAll('.screen')];
let screen = 'hero';
let topGlow = true;
let mood = 'great';
let editing = false;

const voice = {
  listening: false,
  level: 0,
  visual: 0,
  voicedMs: 0,
  lastSpeech: 0,
  started: 0,
  text: '',
  stream: null,
  context: null,
  analyser: null,
  source: null,
  recognition: null,
  generation: 0,
  raf: 0,
  silenceTimer: 0
};

function announce(text) {
  announcement.textContent = text;
}

function fit() {
  const mobile = window.innerWidth <= 650;
  const scale = mobile
    ? Math.min((window.innerWidth - 24) / FRAME_W, (window.innerHeight - 88) / FRAME_H)
    : Math.max(0.1, Math.min(1, (window.innerHeight - 96) / FRAME_H));
  wrap.style.width = `${FRAME_W * scale}px`;
  wrap.style.height = `${FRAME_H * scale}px`;
  phone.style.transform = `scale(${scale})`;
  phone.style.setProperty('--frame-offset', '0px');
  phone.dataset.figmaMic = `${FIGMA_MIC.left},${FIGMA_MIC.top},${FIGMA_MIC.size}`;
}

function show(next, { speak = false } = {}) {
  if (!ORDER.includes(next)) return;
  if (next === screen) {
    if (speak) startVoice();
    return;
  }
  if (!speak) stopVoice();
  screen = next;
  phone.dataset.screen = next;
  for (const el of screens) {
    const on = el.dataset.screen === next;
    el.classList.toggle('is-current', on);
    el.inert = !on;
    el.setAttribute('aria-hidden', String(!on));
  }
  paintTranscript();
  setNotes('');
  if (speak) startVoice();
}

function hex(value) {
  const n = value.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

let painted = { ...PALETTES.rest };
function palette() {
  if (screen === 'listen' || screen === 'mira' || screen === 'home') return PALETTES[screen];
  return PALETTES.rest;
}

function mix(a, b, t) {
  return a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function drawGlow(now) {
  const target = palette();
  const keys = ['top', 'a', 'b', 'c'];
  const next = { floor: painted.floor + (target.floor - painted.floor) * 0.08 };
  for (const key of keys) {
    const from = hex(painted[key] || target[key]);
    const to = hex(target[key]);
    const mixed = mix(from, to, reduced.matches ? 1 : 0.08);
    next[key] = `#${mixed.map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }
  painted = next;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = painted.top;
  ctx.fillRect(0, 0, w, h);
  if (screen !== 'listen' && screen !== 'mira' && screen !== 'home') return;

  const t = reduced.matches ? 0 : now / 1000;
  const level = voice.visual;
  const reach = topGlow ? 1 : 0.35;
  const blobs = [
    { color: painted.a, x: 0.22 + Math.sin(t * 0.31) * 0.08, y: 0.86 + Math.cos(t * 0.23) * 0.03, r: 0.62 + level * 0.22 },
    { color: painted.b, x: 0.72 + Math.cos(t * 0.27) * 0.1, y: 0.78 + Math.sin(t * 0.19) * 0.04, r: 0.5 + level * 0.18 },
    { color: painted.c, x: 0.48 + Math.sin(t * 0.17) * 0.12, y: 0.94, r: 0.7 + level * 0.16 }
  ];
  const quiet = 0.55 + level * 0.4;
  for (const blob of blobs) {
    const radius = blob.r * w * reach;
    const gradient = ctx.createRadialGradient(blob.x * w, blob.y * h, radius * 0.05, blob.x * w, blob.y * h, radius);
    gradient.addColorStop(0, rgba(hex(blob.color), quiet));
    gradient.addColorStop(1, rgba(hex(blob.color), 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }
  if (!reduced.matches && topGlow) {
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 80; i++) {
      const x = (Math.sin(i * 12.9898 + t) * 0.5 + 0.5) * w;
      const y = (0.55 + (i % 20) / 40) * h;
      ctx.fillStyle = i % 2 ? '#fff' : '#000';
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
  }
}

function tick(now) {
  voice.visual += (voice.level - voice.visual) * (voice.level > voice.visual ? 0.35 : 0.12);
  phone.style.setProperty('--pill-level', voice.visual.toFixed(3));
  drawGlow(now);
  if (voice.listening) watchSilence(now);
  requestAnimationFrame(tick);
}

function watchSilence(now) {
  if (!voice.listening || voice.voicedMs < MIN_VOICE_MS) return;
  if (now - voice.lastSpeech < SILENCE_MS) return;
  if (screen === 'listen') finishListening();
  else settleVoice();
}

function setTranscript(text) {
  voice.text = String(text || '').replace(/\s+/g, ' ').trim();
  paintTranscript();
}

function paintTranscript() {
  for (const id of ['listen-transcript', 'mira-transcript']) {
    const node = document.querySelector(`#${id}`);
    const previous = node.dataset.value || '';
    if (voice.text === previous) continue;
    node.dataset.value = voice.text;
    node.replaceChildren();
    if (!voice.text) continue;
    const words = voice.text.split(' ');
    const old = previous ? previous.split(' ') : [];
    words.forEach((word, index) => {
      const span = document.createElement('span');
      span.className = 'live-word';
      span.textContent = word;
      if (old[index] === word || reduced.matches) span.style.animation = 'none';
      node.append(span);
    });
  }
}

function setNotes(text) {
  const message = text || '';
  document.querySelector('#listen-note').textContent = screen === 'listen' ? message : '';
  document.querySelector('#mira-note').textContent = screen === 'mira' ? message : '';
  if (message) announce(message);
}

function setListening(on) {
  voice.listening = on;
  phone.dataset.state = on ? 'listening' : 'idle';
  for (const id of ['listen-mic', 'mira-mic']) {
    const button = document.querySelector(`#${id}`);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Stop microphone' : 'Start speaking');
  }
}

const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

function startRecognition() {
  if (!Recognition) {
    setNotes('This browser can’t transcribe speech. The glow still follows your voice.');
    return;
  }
  const generation = ++voice.generation;
  const recognition = new Recognition();
  voice.recognition = recognition;
  recognition.lang = document.documentElement.lang || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let current = '';
  const valid = () => voice.listening && generation === voice.generation && voice.recognition === recognition;
  recognition.onresult = event => {
    if (!valid()) return;
    current = Array.from(event.results, result => result[0]?.transcript || '').join(' ').replace(/\s+/g, ' ').trim();
    setTranscript(current);
    setNotes('');
  };
  recognition.onerror = event => {
    if (!valid() || event.error === 'no-speech' || event.error === 'aborted') return;
    const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? 'Allow speech recognition to show your words. The glow still follows your voice.'
      : event.error === 'network'
        ? 'Voice text couldn’t connect. Check your connection and tap the mic again.'
        : event.error === 'language-not-supported'
          ? 'This browser can’t transcribe this language. The glow still follows your voice.'
          : 'Voice text paused. Tap the mic again to retry.';
    stopRecognition();
    setNotes(message);
  };
  recognition.onend = () => {
    if (!valid()) return;
    voice.recognition = null;
    setTimeout(() => {
      if (voice.listening && generation === voice.generation) startRecognition();
    }, 350);
  };
  try { recognition.start(); }
  catch { setNotes('Voice text couldn’t start. Tap the mic again to retry.'); }
}

function stopRecognition() {
  voice.generation++;
  const recognition = voice.recognition;
  voice.recognition = null;
  try { recognition?.stop(); } catch { /* already ended */ }
}

async function startMeter() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setNotes('Microphone capture is not available in this browser.');
    return;
  }
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) {
    setNotes('This browser cannot capture audio.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    if (!voice.listening) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    voice.stream = stream;
    voice.context = context;
    voice.analyser = analyser;
    voice.source = source;
    const samples = new Float32Array(analyser.fftSize);
    const pump = () => {
      if (!voice.listening || voice.analyser !== analyser) return;
      analyser.getFloatTimeDomainData(samples);
      let square = 0;
      for (const value of samples) square += value * value;
      const rms = Math.sqrt(square / samples.length);
      const level = Math.min(1, Math.max(0, (rms - 0.0015) * 25));
      const voiced = rms >= 0.0045;
      voice.level = level;
      if (voiced) {
        voice.voicedMs += 1000 * samples.length / context.sampleRate;
        voice.lastSpeech = performance.now();
      }
      voice.raf = requestAnimationFrame(pump);
    };
    pump();
  } catch {
    setNotes('Allow the microphone so the colour can follow your voice.');
  }
}

function stopMeter() {
  cancelAnimationFrame(voice.raf);
  try { voice.source?.disconnect(); } catch { /* already stopped */ }
  voice.stream?.getTracks().forEach(track => track.stop());
  if (voice.context && voice.context.state !== 'closed') voice.context.close().catch(() => {});
  voice.stream = null;
  voice.context = null;
  voice.analyser = null;
  voice.source = null;
  voice.level = 0;
}

function startVoice() {
  if (voice.listening) return;
  voice.voicedMs = 0;
  voice.lastSpeech = performance.now();
  voice.started = voice.lastSpeech;
  setListening(true);
  setNotes('');
  startRecognition();
  startMeter();
  announce('Listening.');
}

function stopVoice() {
  if (!voice.listening && !voice.recognition) {
    setListening(false);
    return;
  }
  setListening(false);
  stopRecognition();
  stopMeter();
}

function finishListening() {
  const said = voice.text;
  stopVoice();
  show('mira');
  announce(said ? 'Reply kept. Mira has your words.' : 'Listening finished.');
}

function settleVoice() {
  stopVoice();
}

function toggleVoice() {
  if (voice.listening) {
    if (screen === 'listen' && voice.voicedMs >= MIN_VOICE_MS) finishListening();
    else stopVoice();
    return;
  }
  startVoice();
}

function setGlow(on) {
  topGlow = on;
  for (const id of ['glow-toggle', 'mira-glow']) {
    document.querySelector(`#${id}`).setAttribute('aria-pressed', String(on));
  }
}

document.querySelectorAll('[data-go]').forEach(button => {
  button.addEventListener('click', () => {
    const next = button.dataset.go;
    show(next);
  });
});

document.querySelector('#listen-mic').addEventListener('click', toggleVoice);
document.querySelector('#mira-mic').addEventListener('click', toggleVoice);
document.querySelector('#listen-close').addEventListener('click', () => { stopVoice(); show('mirror'); });
document.querySelector('#mira-close').addEventListener('click', () => { stopVoice(); show('home'); });
document.querySelector('#glow-toggle').addEventListener('click', () => setGlow(!topGlow));
document.querySelector('#mira-glow').addEventListener('click', () => setGlow(!topGlow));

document.querySelector('#ask-mira').addEventListener('click', () => show('mira'));
document.querySelector('#ask-label').addEventListener('click', () => show('mira'));
document.querySelector('#home-mic').addEventListener('click', () => show('listen', { speak: true }));

document.querySelectorAll('.moods button').forEach(button => {
  button.addEventListener('click', () => {
    mood = button.dataset.mood;
    document.querySelectorAll('.moods button').forEach(other => {
      other.setAttribute('aria-pressed', String(other === button));
    });
  });
});

document.querySelector('#edit-routine').addEventListener('click', () => {
  editing = !editing;
  document.querySelector('#routine').dataset.editing = String(editing);
  document.querySelector('#edit-routine').textContent = editing ? 'Done' : 'Edit';
});

document.querySelectorAll('.tabbar button').forEach(button => {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    if (tab === 'mira') { show('mira'); return; }
    if (tab === 'routine') {
      show('home');
      document.querySelector('#routine').scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'nearest' });
    }
    if (screen !== 'home' && tab === 'home') show('home');
    document.querySelectorAll('.tabbar button').forEach(other => {
      if (other === button && tab !== 'mira') other.setAttribute('aria-current', 'page');
      else other.removeAttribute('aria-current');
    });
    if (tab === 'mira') {
      document.querySelector('.tabbar button[data-tab="home"]').setAttribute('aria-current', 'page');
    }
  });
});

addEventListener('keydown', event => {
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.target.closest('input, textarea')) return;
  const index = ORDER.indexOf(screen);
  if (event.key === 'ArrowRight' && index < ORDER.length - 1) {
    event.preventDefault();
    show(ORDER[index + 1]);
  } else if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault();
    stopVoice();
    show(ORDER[index - 1]);
  }
});

addEventListener('resize', fit);
fit();
screens.forEach(el => {
  const on = el.dataset.screen === 'hero';
  el.inert = !on;
  el.setAttribute('aria-hidden', String(!on));
});
requestAnimationFrame(tick);
