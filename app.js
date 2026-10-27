/* Voice Design Agent
 * Speech in:  Web Speech API (SpeechRecognition)
 * Speech out: speechSynthesis
 * Design:     SVG canvas controlled by a small rule-based command parser
 * No libraries or API keys required.
 */

(() => {
  'use strict';

  /* ---------- State ---------- */
  const W = 800, H = 500;
  const state = { objects: [], bg: '#ffffff', selectedId: null, nextId: 1 };
  const history = [];
  let speakReplies = true;

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const micBtn = $('micBtn');
  const statusEl = $('status');
  const heardEl = $('heard');
  const logEl = $('log');
  const textForm = $('textForm');
  const textInput = $('textInput');

  /* ---------- Vocabulary ---------- */
  const COLORS = {
    red: '#e63946', orange: '#fb8500', yellow: '#ffd60a', green: '#2a9d4b',
    blue: '#2f6fed', purple: '#7b2cbf', pink: '#ff6fb5', brown: '#8b5a2b',
    black: '#111111', white: '#ffffff', gray: '#8d99ae', grey: '#8d99ae',
    teal: '#1fa7a8', cyan: '#22d3ee', navy: '#14213d', gold: '#d4a017',
    lime: '#a3e635', magenta: '#d81b8c', maroon: '#7f1d1d', beige: '#e8d9b5'
  };
  const SHAPES = ['circle', 'square', 'rectangle', 'triangle', 'star', 'heart'];
  const SHAPE_ALIASES = { box: 'square', rect: 'rectangle', oval: 'circle', ball: 'circle', dot: 'circle' };
  const SIZES = { tiny: 40, small: 60, little: 60, medium: 90, big: 130, large: 130, huge: 190, giant: 190 };
  const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

  /* ---------- Helpers ---------- */
  const snapshot = () => {
    history.push(JSON.stringify({ objects: state.objects, bg: state.bg, selectedId: state.selectedId, nextId: state.nextId }));
    if (history.length > 50) history.shift();
  };

  const undo = () => {
    const prev = history.pop();
    if (!prev) return false;
    Object.assign(state, JSON.parse(prev));
    render();
    return true;
  };

  const selected = () => state.objects.find((o) => o.id === state.selectedId) || null;
  const findColor = (text) => Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(text));
  const findShape = (text) => {
    for (const s of SHAPES) if (new RegExp(`\\b${s}s?\\b`).test(text)) return s;
    for (const [alias, s] of Object.entries(SHAPE_ALIASES)) if (new RegExp(`\\b${alias}\\b`).test(text)) return s;
    return null;
  };
  const findSize = (text) => Object.keys(SIZES).find((s) => new RegExp(`\\b${s}\\b`).test(text));
  const findAmount = (text, fallback) => {
    const m = text.match(/\b(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    for (const [w, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${w}\\b`).test(text)) return n;
    return fallback;
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function positionFromWords(text) {
    let x = W / 2, y = H / 2;
    if (/\bleft\b/.test(text)) x = W * 0.22;
    if (/\bright\b/.test(text)) x = W * 0.78;
    if (/\b(top|upper|above)\b/.test(text)) y = H * 0.22;
    if (/\b(bottom|lower|below)\b/.test(text)) y = H * 0.78;
    // small jitter so repeated shapes do not stack perfectly
    if (x === W / 2 && y === H / 2 && state.objects.length) {
      x += (Math.random() - 0.5) * 160;
      y += (Math.random() - 0.5) * 120;
    }
    return { x, y };
  }

  /* ---------- Rendering ---------- */
  const NS = 'http://www.w3.org/2000/svg';

  function starPoints(r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(rad * Math.cos(a)).toFixed(1)},${(rad * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  }

  function shapeElement(o) {
    const s = o.size;
    let el;
    switch (o.type) {
      case 'circle':
        el = document.createElementNS(NS, 'circle'); el.setAttribute('r', s / 2); break;
      case 'square':
        el = document.createElementNS(NS, 'rect');
        el.setAttribute('x', -s / 2); el.setAttribute('y', -s / 2);
        el.setAttribute('width', s); el.setAttribute('height', s);
        el.setAttribute('rx', s * 0.04); break;
      case 'rectangle':
        el = document.createElementNS(NS, 'rect');
        el.setAttribute('x', -s * 0.75); el.setAttribute('y', -s * 0.45);
        el.setAttribute('width', s * 1.5); el.setAttribute('height', s * 0.9);
        el.setAttribute('rx', s * 0.04); break;
      case 'triangle':
        el = document.createElementNS(NS, 'polygon');
        el.setAttribute('points', `0,${-s / 2} ${s / 2},${s / 2} ${-s / 2},${s / 2}`); break;
      case 'star':
        el = document.createElementNS(NS, 'polygon'); el.setAttribute('points', starPoints(s / 2)); break;
      case 'heart': {
        el = document.createElementNS(NS, 'path');
        const k = s / 100;
        el.setAttribute('d', 'M0 35 C-60 -5 -40 -50 0 -20 C40 -50 60 -5 0 35 Z');
        el.setAttribute('transform', `scale(${k * 1.1})`);
        el.dataset.scaled = '1';
        break;
      }
      case 'text':
        el = document.createElementNS(NS, 'text');
        el.textContent = o.text;
        el.setAttribute('text-anchor', 'middle');
        el.setAttribute('dominant-baseline', 'middle');
        el.setAttribute('font-size', s * 0.6);
        el.setAttribute('font-family', 'system-ui, sans-serif');
        el.setAttribute('font-weight', '700');
        break;
    }
    el.setAttribute('fill', o.color);
    return el;
  }

  function render() {
    canvas.innerHTML = '';
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', state.bg);
    bg.addEventListener('click', () => { state.selectedId = null; render(); });
    canvas.appendChild(bg);

    state.objects.forEach((o) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'shape');
      g.setAttribute('transform', `translate(${o.x} ${o.y}) rotate(${o.rot})`);
      g.appendChild(shapeElement(o));
      g.addEventListener('click', (e) => { e.stopPropagation(); state.selectedId = o.id; render(); });
      canvas.appendChild(g);

      if (o.id === state.selectedId) {
        const box = g.getBBox();
        const outline = document.createElementNS(NS, 'rect');
        outline.setAttribute('class', 'selected-outline');
        outline.setAttribute('x', box.x - 6); outline.setAttribute('y', box.y - 6);
        outline.setAttribute('width', box.width + 12); outline.setAttribute('height', box.height + 12);
        g.appendChild(outline);
      }
    });
  }

  /* ---------- Command parser ---------- */
  function addObject(type, text, raw) {
    const color = findColor(text) || 'blue';
    const sizeWord = findSize(text);
    const pos = positionFromWords(text);
    const o = {
      id: state.nextId++, type, color: COLORS[color], size: SIZES[sizeWord] || 90,
      x: pos.x, y: pos.y, rot: 0, text: ''
    };
    if (type === 'text') {
      const m = raw.match(/\btext\s+(?:that says\s+|saying\s+|says\s+|of\s+)?(.+)$/i) || raw.match(/\b(?:write|type)\s+(.+)$/i);
      let content = m ? m[1].trim() : 'Hello';
      content = content.replace(/\b(in|on the|at the)\s+(red|orange|yellow|green|blue|purple|pink|brown|black|white|gray|grey|teal|cyan|navy|gold|lime|magenta|maroon|beige)\b.*$/i, '').trim();
      o.text = content || 'Hello';
      o.size = SIZES[sizeWord] || 70;
      if (!findColor(text)) o.color = '#111111';
      // text color is only the explicit "<color> text" phrase
      const tc = raw.toLowerCase().match(/\b(red|orange|yellow|green|blue|purple|pink|brown|black|white|gray|grey|teal|cyan|navy|gold|lime|magenta|maroon|beige)\s+text\b/);
      if (tc) o.color = COLORS[tc[1]];
      else if (findColor(text)) o.color = '#111111';
    }
    snapshot();
    state.objects.push(o);
    state.selectedId = o.id;
    render();
    return type === 'text' ? `Added the text “${o.text}”.` : `Added a ${sizeWord ? sizeWord + ' ' : ''}${color} ${type}.`;
  }

  function handle(raw) {
    const text = raw.toLowerCase().replace(/[.,!?]/g, '').trim();
    if (!text) return 'I did not catch that.';

    if (/^(help|what can (you|i) do|what can i say)/.test(text)) {
      return 'Try: draw a big red circle, make it green, move it left, rotate it, change the background to navy, or undo.';
    }
    if (/\bundo\b|\bgo back\b/.test(text)) return undo() ? 'Undone.' : 'Nothing to undo.';
    if (/\b(clear|reset|start over|wipe)\b/.test(text) && /\b(everything|all|canvas|it|over|design)?\b/.test(text) && !/\bcolor\b/.test(text)) {
      snapshot(); state.objects = []; state.selectedId = null; state.bg = '#ffffff'; render();
      return 'Canvas cleared.';
    }

    // Background
    if (/\b(background|canvas)\b/.test(text)) {
      const c = findColor(text);
      if (c) { snapshot(); state.bg = COLORS[c]; render(); return `Background is now ${c}.`; }
      return 'Which color should the background be?';
    }

    // Delete
    if (/\b(delete|remove|erase|get rid of)\b/.test(text)) {
      const sel = selected();
      if (!sel) return 'Nothing is selected. Click a shape first.';
      snapshot();
      state.objects = state.objects.filter((o) => o.id !== sel.id);
      state.selectedId = state.objects.length ? state.objects[state.objects.length - 1].id : null;
      render();
      return 'Deleted.';
    }

    // Duplicate
    if (/\b(duplicate|copy|clone)\b/.test(text)) {
      const sel = selected();
      if (!sel) return 'Select something first and I will duplicate it.';
      snapshot();
      const dup = { ...sel, id: state.nextId++, x: clamp(sel.x + 40, 0, W), y: clamp(sel.y + 40, 0, H) };
      state.objects.push(dup); state.selectedId = dup.id; render();
      return 'Duplicated.';
    }

    // Add
    if (/\b(add|draw|create|make|put|insert|place|give me)\b/.test(text) || findShape(text) || /\btext\b/.test(text)) {
      if (/\b(add|draw|create|put|insert|place|give me)\b/.test(text) || /\bmake (a|an|me)\b/.test(text) ||
          (!selected() && (findShape(text) || /\btext\b/.test(text)))) {
        if (/\btext\b/.test(text) && !findShape(text.replace(/\btext\b.*/, ''))) return addObject('text', text, raw);
        const shape = findShape(text);
        if (shape) return addObject(shape, text, raw);
      }
    }

    // Everything below acts on the selected object
    const sel = selected();

    // Select by shape or color description, e.g. "select the red circle"
    if (/\b(select|pick|choose|focus)\b/.test(text)) {
      const shape = findShape(text), c = findColor(text);
      const match = [...state.objects].reverse().find((o) =>
        (!shape || o.type === shape) && (!c || o.color === COLORS[c]));
      if (match) { state.selectedId = match.id; render(); return 'Selected.'; }
      return 'I could not find that shape.';
    }

    // Color change
    const color = findColor(text);
    if (color && /\b(make|color|colour|change|turn|paint|set|fill)\b/.test(text)) {
      if (!sel) return 'Nothing is selected. Click a shape or add one first.';
      snapshot(); sel.color = COLORS[color]; render();
      return `Changed to ${color}.`;
    }

    // Size
    if (/\b(bigger|larger|grow|enlarge|increase)\b/.test(text)) {
      if (!sel) return 'Nothing is selected.';
      snapshot(); sel.size = clamp(sel.size * 1.3, 20, 400); render(); return 'Made it bigger.';
    }
    if (/\b(smaller|shrink|reduce|decrease)\b/.test(text)) {
      if (!sel) return 'Nothing is selected.';
      snapshot(); sel.size = clamp(sel.size / 1.3, 20, 400); render(); return 'Made it smaller.';
    }
    const sz = findSize(text);
    if (sz && /\b(make|set|resize)\b/.test(text) && sel) {
      snapshot(); sel.size = SIZES[sz]; render(); return `Made it ${sz}.`;
    }

    // Rotate
    if (/\b(rotate|spin|turn|tilt)\b/.test(text)) {
      if (!sel) return 'Nothing is selected.';
      snapshot();
      const deg = findAmount(text, 45) * (/\b(left|counter|anticlockwise)\b/.test(text) ? -1 : 1);
      sel.rot = (sel.rot + (Math.abs(deg) <= 10 && /\b\d+\b/.test(text) === false ? 45 : deg)) % 360;
      render();
      return 'Rotated.';
    }

    // Move
    if (/\b(move|shift|push|nudge|slide|go)\b/.test(text)) {
      if (!sel) return 'Nothing is selected.';
      const step = /\b(a lot|far)\b/.test(text) ? 200 : /\b(little|bit|slightly)\b/.test(text) ? 30 : 80;
      snapshot();
      if (/\bleft\b/.test(text)) sel.x = clamp(sel.x - step, 0, W);
      else if (/\bright\b/.test(text)) sel.x = clamp(sel.x + step, 0, W);
      else if (/\b(up|top)\b/.test(text)) sel.y = clamp(sel.y - step, 0, H);
      else if (/\b(down|bottom)\b/.test(text)) sel.y = clamp(sel.y + step, 0, H);
      else if (/\bcenter|middle\b/.test(text)) { sel.x = W / 2; sel.y = H / 2; }
      else { history.pop(); return 'Which direction? Left, right, up, or down.'; }
      render();
      return 'Moved.';
    }

    return `Sorry, I did not understand “${raw}”. Say “help” for ideas.`;
  }

  /* ---------- Chat log + speech out ---------- */
  function addMsg(who, text) {
    const d = document.createElement('div');
    d.className = `msg ${who}`;
    d.textContent = text;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function speak(text) {
    if (!speakReplies || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }

  function runCommand(raw) {
    addMsg('user', raw);
    const reply = handle(raw);
    addMsg('agent', reply);
    speak(reply);
  }

  /* ---------- Speech in ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;

  function setListening(on) {
    listening = on;
    micBtn.classList.toggle('listening', on);
    micBtn.setAttribute('aria-pressed', String(on));
    micBtn.setAttribute('aria-label', on ? 'Stop listening' : 'Start listening');
    statusEl.textContent = on ? 'Listening…' : 'Tap the mic and speak';
  }

  if (SR) {
    recognition = new SR();
    recognition.lang = 'en-NZ';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => { setListening(false); };
    recognition.onerror = (e) => {
      setListening(false);
      statusEl.textContent = e.error === 'not-allowed'
        ? 'Microphone blocked. Allow mic access and try again.'
        : `Mic error: ${e.error}`;
    };
    recognition.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      heardEl.textContent = final || interim;
      if (final) {
        runCommand(final.trim());
        heardEl.textContent = '';
      }
    };
  } else {
    micBtn.disabled = true;
    micBtn.style.opacity = 0.4;
    statusEl.textContent = 'Speech recognition is not supported in this browser. Use the text box.';
  }

  micBtn.addEventListener('click', () => {
    if (!recognition) return;
    window.speechSynthesis && window.speechSynthesis.cancel();
    if (listening) recognition.stop();
    else { try { recognition.start(); } catch (_) { /* already started */ } }
  });

  /* ---------- Other UI ---------- */
  textForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = textInput.value.trim();
    if (!v) return;
    textInput.value = '';
    runCommand(v);
  });

  $('undoBtn').addEventListener('click', () => addMsg('agent', undo() ? 'Undone.' : 'Nothing to undo.'));
  $('clearBtn').addEventListener('click', () => runCommand('clear everything'));
  $('muteBtn').addEventListener('click', (e) => {
    speakReplies = !speakReplies;
    e.target.textContent = `Voice replies: ${speakReplies ? 'on' : 'off'}`;
    if (!speakReplies) window.speechSynthesis && window.speechSynthesis.cancel();
  });

  $('exportBtn').addEventListener('click', () => {
    const prev = state.selectedId;
    state.selectedId = null; render();
    const xml = new XMLSerializer().serializeToString(canvas);
    state.selectedId = prev; render();
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'design.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement !== textInput && recognition) {
      e.preventDefault();
      micBtn.click();
    }
  });

  /* ---------- Init ---------- */
  render();
  addMsg('agent', 'Hi! Tap the mic (or press Space) and tell me what to design. Say “help” for ideas.');
})();
