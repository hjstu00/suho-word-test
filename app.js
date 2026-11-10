// 수호의 글자 친구들 — 화면 4개: 시작 → 낱말 고르기(첫 글자 줄 + 가로 카드) → 퍼즐(글자 틀) → 뜻
// 퍼즐 조각 규칙(한글 음절·자모, 영어 파닉스)은 rules.js
import { slug, initial, units, INDEX } from './rules.js';

const app = document.getElementById('app');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TITLE = '수호의 글자 친구들';
const UI = {
  ko: { home: '처음으로', list: '낱말 고르기', again: '다시 듣기', next: '다음 낱말', index: '첫 글자', replay: '다시 보기' },
  en: { home: 'Start', list: 'Words', again: 'Listen again', next: 'Next word', index: 'First letter', replay: 'Watch again' },
};
const HINT_MS = 7000; // 가만히 있으면 이만큼 뒤 글자 하나가 통통 튀며 부른다
let DATA, SOUNDS, lang = 'ko', scene = 0, order = [], lastI = null, greeted = false;

// ---- 소리: 녹음 파일, 없으면 기기 음성 ----
// 목소리도 배경 음악과 같은 Web Audio로 튼다: iPad에서 <audio>와 Web Audio를 같이 쓰면 한쪽이 멈춘다(제이커 인사가 끊김)
let actx, voice = null, finishCurrent = null;
function audioCtx() {
  actx ||= new (window.AudioContext || window.webkitAudioContext)();
  actx.resume().catch(() => {});
  return actx;
}
function stopAudio() {
  try { voice?.stop(); } catch { /* 이미 끝남 */ }
  voice = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  finishCurrent?.(false);
}
function speak(text, l, finish) {
  if (!text || !('speechSynthesis' in window)) return finish(true);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = l === 'ko' ? 'ko-KR' : 'en-US';
  u.rate = 0.9;
  u.onend = u.onerror = () => finish(true);
  speechSynthesis.speak(u);
}
function play(path, text, l = lang) {
  stopAudio();
  return new Promise(resolve => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      finishCurrent = null;
      resolve(ok);
    };
    finishCurrent = finish;
    let c;
    try { c = audioCtx(); } catch { return speak(text, l, finish); }
    fetch(`audio/${path}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => new Promise((ok, no) => c.decodeAudioData(b, ok, no)))
      .then(buf => {
        if (settled) return;
        const s = c.createBufferSource();
        s.buffer = buf;
        s.connect(c.destination);
        s.onended = () => finish(true);
        voice = s;
        s.start();
      })
      .catch(() => { if (!settled) speak(text, l, finish); }); // 파일이 없으면 기기 음성
  });
}
// 짧은 효과음: 녹음 없이 브라우저에서 합성 [주파수, 시작초, 길이초]
const SFX = {
  nope: [[392, 0, .16], [311, .14, .32]],
  cheer: [[523, 0, .14], [659, .11, .14], [784, .22, .14], [1047, .33, .4]],
  pop: [[880, 0, .08]], // 소리 없는 글자(묵음 e)
};
function sfx(notes) {
  try {
    audioCtx();
    const t0 = actx.currentTime;
    for (const [f, s, d] of notes) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + s);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
      o.connect(g).connect(actx.destination);
      o.start(t0 + s);
      o.stop(t0 + s + d + 0.05);
    }
  } catch { /* 효과음은 없어도 진행 */ }
}
// 배경 음악: audio/music/bg.mp3 를 처음 누른 순간부터 모든 화면에서 작게 반복. 파일이 없으면 조용히 넘어간다.
// Web Audio로 튼다: iPad는 <audio>를 하나만 틀어(목소리가 나오면 음악이 멈춤) 음량도 못 바꾸기 때문.
// iPad는 화면을 누르기 전에는 소리를 못 내므로 앱을 연 순간이 아니라 첫 누름에 시작한다.
const BGM_VOLUME = 0.1;
if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iPad 무음 스위치에도 들리게 (Safari 17+)
const bgFile = fetch('audio/music/bg.mp3').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
let bgStarted = false;
async function music() {
  if (document.hidden) return;
  try {
    audioCtx(); // 누를 때마다 깨운다 (앱을 다시 열면 iPad가 소리를 재워 둠)
    if (bgStarted) return;
    bgStarted = true;
    const buf = await bgFile.then(b => b && new Promise((ok, no) => actx.decodeAudioData(b, ok, no)));
    if (!buf) return;
    const gain = actx.createGain();
    gain.gain.value = BGM_VOLUME;
    gain.connect(actx.destination);
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    src.start();
  } catch { /* 음악은 없어도 진행 */ }
}
for (const ev of ['touchend', 'click', 'keydown']) addEventListener(ev, music, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) actx?.suspend(); else actx?.resume().catch(() => {}); });
const sayWord = w => play(`${lang}/${slug(lang, w)}.wav`, w);
const sayPhrase = k => play(`${lang}/p-${k}.wav`, DATA.phrases[lang][k]);
const saySnd = snd => snd.path ? play(snd.path, snd.text) : (stopAudio(), sfx(SFX.pop), wait(250));

// ---- 진도 (예전 낱말 공사장 앱과 같은 키라 iPad에 남은 ✓를 이어 쓴다) ----
const doneKey = () => `suho-done-${lang}`;
function doneSet() {
  try { return new Set(JSON.parse(localStorage.getItem(doneKey()) || '[]')); } catch { return new Set(); }
}
function markDone(word) {
  const s = doneSet();
  s.add(word);
  try { localStorage.setItem(doneKey(), JSON.stringify([...s])); } catch { /* 저장 못 해도 계속 */ }
}

const esc = s => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const pic = row => row[3]
  ? `<img class="pic" src="img/${row[3]}" alt="">`
  : `<span class="pic emoji" aria-hidden="true">${row[2]}</span>`;
const friends = (text, cls = '') => [...text].map((c, k) => c === ' '
  ? '<span class="gap"></span>'
  : `<span class="friend c${k % 6} ${cls}" style="--d:${k}">${esc(c)}</span>`).join('');
const wait = ms => new Promise(r => setTimeout(r, ms));
const newScene = () => { stopAudio(); return ++scene; };

// ---- S01 시작 ----
function intro() {
  newScene();
  const imgs = ['excavator', 'breaker', 'bulldozer', 'loader', 'forklift', 'tower-crane', 'dump-truck', 'roller', 'tesla'];
  app.innerHTML = `<section class="screen intro">
    <h1 class="title awake" aria-label="${TITLE}">${friends(TITLE, 'dance')}</h1>
    <div class="parade" aria-hidden="true"><div class="parade-track">${imgs.map(n => `<img src="img/${n}.jpg" alt="">`).join('')}</div></div>
    <div class="row">
      <button class="btn big" data-lang="ko">한글</button>
      <button class="btn big alt" data-lang="en">English</button>
      <button class="btn big rock-go">🔨 바위 깨기</button>
    </div></section>`;
  app.querySelector('.rock-go').onclick = () => { lang = 'ko'; document.documentElement.lang = 'ko'; rocks(); };
  app.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
    lang = b.dataset.lang;
    document.documentElement.lang = lang;
    order = DATA[lang].map((_, i) => i).sort((a, b) => DATA[lang][a][1].localeCompare(DATA[lang][b][1], lang));
    lastI = null;
    picker();
    sayPhrase(greeted ? 'pick' : 'hello');
    greeted = true;
  });
}

// ---- S02 낱말 고르기: 첫 글자 줄 + 가로로 넘기는 카드 ----
function picker() {
  newScene();
  const done = doneSet();
  const have = new Set(order.map(i => initial(lang, DATA[lang][i][1])));
  app.innerHTML = `<section class="screen picker">
    <div class="bar">
      <button class="btn icon home" aria-label="${UI[lang].home}">🏠</button>
      <nav class="index" aria-label="${UI[lang].index}">${INDEX[lang].map(ch =>
        `<button class="idx" data-ch="${ch}" ${have.has(ch) ? '' : 'disabled'}>${ch}</button>`).join('')}</nav>
    </div>
    <div class="belt" role="list">${order.map(i => {
      const r = DATA[lang][i];
      return `<button class="btn card" role="listitem" data-i="${i}" data-ini="${initial(lang, r[1])}" aria-label="${esc(r[1])}">
        ${pic(r)}<span class="label">${esc(r[1])}</span>
        ${done.has(r[1]) ? '<span class="done" aria-label="완성">✓</span>' : ''}</button>`;
    }).join('')}</div></section>`;
  const belt = app.querySelector('.belt');
  const cards = [...belt.children];
  const idxs = [...app.querySelectorAll('.idx')];
  const centerOf = card => card.offsetLeft + card.offsetWidth / 2 - belt.clientWidth / 2;
  const mark = () => { // 가운데 카드의 첫 글자를 줄에서 표시
    const mid = belt.scrollLeft + belt.clientWidth / 2;
    const c = cards.find(x => x.offsetLeft + x.offsetWidth > mid) || cards.at(-1);
    idxs.forEach(b => b.setAttribute('aria-current', String(b.dataset.ch === c.dataset.ini)));
  };
  let ticking = false;
  belt.onscroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; mark(); }); } };
  app.querySelector('.home').onclick = intro;
  idxs.forEach(b => b.onclick = () => {
    const c = cards.find(x => x.dataset.ini === b.dataset.ch);
    belt.scrollTo({ left: centerOf(c), behavior: reduced ? 'auto' : 'smooth' });
  });
  cards.forEach(c => c.onclick = () => puzzle(+c.dataset.i));
  const back = cards.find(c => +c.dataset.i === lastI);
  if (back) belt.scrollLeft = centerOf(back);
  mark();
}

// ---- S03 퍼즐: 낱말 모양 글자 틀 + 위아래로 흩어진 글자 친구 ----
// 한글은 음절 블록 또는 자모(초성·중성·종성 칸이 다 차면 음절로 합쳐짐), 영어는 글자마다 파닉스 소리
function puzzle(i) {
  const my = newScene();
  lastI = i;
  const row = DATA[lang][i], word = row[1];
  const { mode, tokens } = units(lang, row, SOUNDS);
  const per = mode === 'letter' ? 0.62 : 1.05;
  const width = tokens.reduce((a, t) => a + (t.sep ? 0.4 : per), 0);
  const tall = mode === 'jamo' ? 5 : 4.2; // 자모 틀은 두세 줄이라 더 낮춘다
  const fs = Math.round(Math.max(60, Math.min(230, (Math.min(innerWidth, 1200) - 60) / width, (innerHeight - 150) / tall)));
  const ps = mode === 'jamo' ? Math.round(fs * 0.7) : fs; // 조각 글자 크기 (자모는 틀보다 조금 크게)
  const slotHtml = (ch, k, p = '', role = '') =>
    `<span class="slot ${role}" data-ch="${esc(ch)}" data-k="${k}" data-p="${p}">${esc(ch)}</span>`;
  app.innerHTML = `<section class="screen puzzle ${mode}" style="--fs:${fs}px;--ps:${ps}px">
    <div class="bar">
      <button class="btn icon back" aria-label="${UI[lang].list}">◀</button><span class="spacer"></span>
      <button class="btn icon again" aria-label="${UI[lang].again}">🔊</button></div>
    <div class="yard top"></div>
    <div class="stencil" aria-label="${esc(word)}">${tokens.map((t, k) => t.sep
      ? (t.sep === ' ' ? '<span class="gap"></span>' : `<span class="fixed">${esc(t.sep)}</span>`)
      : t.parts ? `<span class="syl ${t.layout}" data-k="${k}">${t.parts.map((p, n) => slotHtml(p.ch, k, n, p.role)).join('')}</span>`
      : slotHtml(t.ch, k)).join('')}</div>
    <div class="yard bottom"></div></section>`;
  const stencil = app.querySelector('.stencil');
  const slots = [...stencil.querySelectorAll('.slot')];
  const yards = [...app.querySelectorAll('.yard')];
  const sndOf = el => el.dataset.p === '' ? tokens[el.dataset.k].snd : tokens[el.dataset.k].parts[el.dataset.p].snd;
  app.querySelector('.back').onclick = picker;
  app.querySelector('.again').onclick = () => sayWord(word);
  let chosen = null, toldAgain = false, finished = false;

  // 조각: 글자(또는 자모)마다 하나. 위아래 마당에 번갈아, 서로 덜 겹치게
  const bits = tokens.flatMap((t, k) => t.sep ? [] : t.parts ? t.parts.map(p => ({ ch: p.ch, snd: p.snd })) : [{ ch: t.ch, snd: t.snd }]);
  const shuffled = bits.map((b, k) => ({ ...b, k, r: Math.random() })).sort((a, b) => a.r - b.r);
  const taken = [[], []];
  const els = shuffled.map((bit, n) => {
    const yard = yards[n % 2];
    const b = document.createElement('button');
    b.className = `friend piece c${bit.k % 6}`;
    b.textContent = bit.ch;
    b.dataset.ch = bit.ch;
    b.snd = bit.snd;
    b.setAttribute('aria-label', bit.ch);
    yard.append(b);
    const W = Math.max(0, yard.clientWidth - b.offsetWidth), H = Math.max(0, yard.clientHeight - b.offsetHeight);
    let best = null;
    for (let t = 0; t < 60; t++) {
      const q = { x: Math.random() * W, y: Math.random() * H };
      const d = Math.min(...taken[n % 2].map(o => Math.hypot(o.x - q.x, o.y - q.y)), Infinity);
      if (!best || d > best.d) best = { ...q, d };
      if (d > b.offsetWidth * 1.4) break;
    }
    taken[n % 2].push(best);
    b.style.left = `${best.x}px`;
    b.style.top = `${best.y}px`;
    return b;
  });

  // 시작: 낱말을 읽어 주고, 글자 친구들이 양옆에서 달려 들어온다
  els.forEach((b, n) => { b.style.transition = 'none'; b.style.transform = `translateX(${n % 2 ? '' : '-'}110vw)`; });
  (async () => {
    await wait(50);
    els.forEach((b, n) => {
      b.style.transition = `transform .8s cubic-bezier(.3, 1.2, .5, 1) ${n * 0.09}s`;
      b.style.transform = '';
    });
    await sayWord(word);
    if (scene !== my) return;
    els.forEach(b => { b.style.transition = ''; wire(b); });
    poke();
  })();

  // 힌트: 한동안 손대지 않으면 남은 글자 하나가 눈을 뜨고 튄다
  let idle = 0;
  function poke() { clearTimeout(idle); idle = setTimeout(hint, HINT_MS); }
  function hint() {
    if (scene !== my || finished) return;
    const left = els.filter(b => b.isConnected && !b.disabled && !b.classList.contains('dragging') && !b.classList.contains('chosen'));
    const b = left[Math.floor(Math.random() * left.length)];
    if (b) {
      wake(b, true);
      b.classList.remove('hint'); b.offsetWidth; b.classList.add('hint');
      setTimeout(() => { if (!b.classList.contains('chosen') && !b.classList.contains('dragging')) wake(b, false); }, 1300);
    }
    poke();
  }
  app.querySelector('.puzzle').addEventListener('pointerdown', poke);

  function wake(b, on) {
    b.classList.toggle('awake', on);
    if (on) { b.style.animation = 'none'; b.offsetWidth; b.style.animation = ''; }
  }
  function choose(b) {
    if (chosen) { chosen.classList.remove('chosen'); wake(chosen, false); }
    chosen = b === chosen ? null : b;
    if (chosen) { chosen.classList.add('chosen'); wake(chosen, true); saySnd(chosen.snd); }
    stencil.classList.toggle('choosing', !!chosen);
  }
  const centre = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function nearest(x, y, test) {
    let best = null;
    for (const sl of slots) {
      if (sl.classList.contains('filled') || !test(sl)) continue;
      const [cx, cy] = centre(sl), d = Math.hypot(cx - x, cy - y);
      if (d < ps * 0.8 && (!best || d < best.d)) best = { sl, d };
    }
    return best?.sl;
  }
  function nope(el) {
    el.classList.remove('shake'); el.offsetWidth; el.classList.add('shake');
    sfx(SFX.nope);
    if (!toldAgain) { toldAgain = true; sayPhrase('again'); }
  }
  function place(b, sl) {
    if (chosen === b) choose(null);
    const [bx, by] = centre(b), [sx, sy] = centre(sl);
    const colour = [...b.classList].find(c => /^c\d$/.test(c));
    b.disabled = true;
    b.style.transition = 'transform .25s ease-out';
    b.style.transform = `translate(${sx - bx + (parseFloat(b.dataset.dx) || 0)}px, ${sy - by + (parseFloat(b.dataset.dy) || 0)}px)`;
    sl.classList.add('filled', colour);
    sl.style.color = 'transparent';
    setTimeout(() => { b.remove(); sl.style.color = ''; sl.classList.add('hop'); }, 250);
    // 자모: 한 음절의 칸이 다 차면 음절 글자로 합쳐지며 음절을 읽는다
    const syl = sl.closest('.syl');
    const whole = syl && [...syl.children].every(x => x.classList.contains('filled'));
    if (whole) setTimeout(() => compose(syl, colour), 300);
    if (slots.every(x => x.classList.contains('filled'))) complete();
    else saySnd(whole ? tokens[syl.dataset.k].snd : sndOf(sl));
  }
  function compose(syl, colour) {
    if (!syl.isConnected) return;
    const t = tokens[syl.dataset.k];
    const one = document.createElement('span');
    one.className = `slot filled composed ${colour} hop`;
    one.dataset.k = syl.dataset.k;
    one.dataset.p = '';
    one.textContent = t.ch;
    syl.replaceWith(one);
  }
  function wire(b) {
    b.onclick = () => { if (!b.disabled) choose(b); };
    b.onkeydown = e => { // 키보드: Enter·Space는 맞는 칸에 바로
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const sl = slots.find(x => !x.classList.contains('filled') && x.dataset.ch === b.dataset.ch);
      if (sl) place(b, sl);
    };
    b.onpointerdown = e => {
      if (b.disabled || e.button > 0) return;
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      b.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 12) return;
        if (!moved) { moved = true; choose(null); b.classList.add('dragging'); wake(b, true); saySnd(b.snd); }
        b.dataset.dx = dx; b.dataset.dy = dy;
        b.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
      };
      const up = ev => {
        b.removeEventListener('pointermove', move);
        b.removeEventListener('pointerup', up);
        b.removeEventListener('pointercancel', up);
        if (!moved) return; // 눌렀다 뗀 것은 click이 처리
        b.classList.remove('dragging');
        b.onclick = null;
        setTimeout(() => { if (!b.disabled) b.onclick = () => choose(b); }, 0); // 끌기 뒤 따라오는 click 무시
        const [x, y] = centre(b);
        const sl = nearest(x, y, s => s.dataset.ch === b.dataset.ch);
        if (sl) { b.style.transform = `translate(${b.dataset.dx}px, ${b.dataset.dy}px)`; return place(b, sl); }
        b.dataset.dx = b.dataset.dy = 0;
        b.style.transform = '';
        wake(b, false);
        if (ev.type === 'pointerup' && nearest(x, y, () => true)) nope(b);
      };
      b.addEventListener('pointermove', move);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    };
  }
  slots.forEach(sl => sl.onclick = () => {
    if (!chosen || sl.classList.contains('filled')) return;
    if (sl.dataset.ch === chosen.dataset.ch) place(chosen, sl);
    else nope(sl);
  });

  // 완성: 환호 → 글자(음절)마다 뛰며 소리 → 낱말 (영어는 k-a-t, cat 처럼 소리를 이어 읽는 연습)
  async function complete() {
    if (finished) return;
    finished = true;
    clearTimeout(idle);
    await wait(300);
    sfx(SFX.cheer);
    await wait(700);
    stencil.classList.add('awake');
    for (const [k, t] of tokens.entries()) {
      if (t.sep) continue;
      if (scene !== my) return;
      const el = stencil.querySelector(`.slot[data-k="${k}"][data-p=""]`) || stencil.querySelector(`.syl[data-k="${k}"]`);
      el.classList.add('friend');
      el.classList.remove('hop'); el.offsetWidth; el.classList.add('hop');
      await saySnd(t.snd);
    }
    if (scene !== my) return;
    if (tokens.filter(t => !t.sep).length > 1 || lang === 'en') await sayWord(word); // 한 음절 낱말(곰)은 방금 읽었다
    if (scene !== my) return;
    markDone(word);
    meaning(i);
  }
}

// ---- S04 뜻: 낱말 + 그림이 달려 들어오고 글자 친구들이 춤춘다 ----
function meaning(i) {
  const my = newScene();
  const row = DATA[lang][i];
  app.innerHTML = `<section class="screen meaning">
    <div class="bar"><button class="btn icon list" aria-label="${UI[lang].list}">🏠</button>
      <span class="spacer"><button class="word-btn" aria-label="${esc(row[1])} ${UI[lang].again}">${esc(row[1])}</button></span>
      <button class="btn icon replay" aria-label="${UI[lang].replay}">↻</button></div>
    <div class="stage">${pic(row)}<div class="cheer" aria-hidden="true">${friends(lang === 'ko' ? row[1] : row[1].toLowerCase(), 'dance')}</div>
      <p class="sentence">${esc(row[4])}</p></div>
    <button class="btn next-arrow" aria-label="${UI[lang].next}">▶</button></section>`;
  app.querySelector('.list').onclick = picker;
  app.querySelector('.word-btn').onclick = () => sayWord(row[1]);
  const next = () => puzzle(order[(order.indexOf(i) + 1) % order.length]);
  const sentence = () => play(`${lang}/${slug(lang, row[1])}-s.wav`, row[4]);
  app.querySelector('.sentence').onclick = sentence;
  app.querySelector('.next-arrow').onclick = next;
  app.querySelector('.replay').onclick = () => { // 그림 등장부터 다시
    const p = app.querySelector('.stage .pic');
    p.style.animation = 'none'; p.offsetWidth; p.style.animation = '';
    sentence();
  };
  // 밀기: 왼쪽으로 밀면 다음 낱말, 오른쪽으로 밀면 낱말 고르기
  const screen = app.querySelector('.meaning');
  let sx = null;
  screen.onpointerdown = e => { sx = e.target.closest('button') ? null : e.clientX; };
  screen.onpointerup = e => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (dx < -60) next(); else if (dx > 60) picker();
  };
  (async () => {
    await sayPhrase('great');
    if (scene === my) sentence();
  })();
}

// ---- 미션: 브레이커 바위 깨기 ----
// 반장이 부른 소리 글자(쾅·쿵…)가 새겨진 바위를 세 번 두드려 깨면 부품이 나온다. 부품 5개를 모으면 끝.
// 틀린 바위는 깨지지 않고 제 글자를 읽어 준 뒤 다시 부른다. 틀린 글자는 곧 다시 나온다.
const ROCK_WORDS = ['쾅', '쿵', '퍽', '뚝', '붕', '탕']; // 중장비 소리 한 글자 (받침 있는 것 위주로 첫 읽기)
const PARTS = ['🔩', '⚙️', '🛞', '🔧', '💎'];
const HITS = 3;
const ROCK_SAY = { // 녹음 파일이 없으면 기기 음성으로 읽는다 (나중에 make_audio.py로 p-rock*.wav 생성)
  hello: '바위 속에 부품이 숨어 있어. 브레이커로 바위를 깨 보자!',
  find: '바위를 찾아서 깨 줘!',
  done: '부품을 다 모았어! 최고야!',
};
const rockSay = k => play(`ko/p-rock-${k}.wav`, ROCK_SAY[k]);
function thud(strong) { // 브레이커 두드리는 소리: 짧은 잡음 + 낮은 음
  try {
    audioCtx();
    const t0 = actx.currentTime, len = 0.22;
    const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * len), actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let n = 0; n < d.length; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / d.length, 3);
    const src = actx.createBufferSource(), lp = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = buf;
    lp.type = 'lowpass';
    lp.frequency.value = strong ? 900 : 500;
    g.gain.value = strong ? 0.9 : 0.6;
    src.connect(lp).connect(g).connect(actx.destination);
    src.start(t0);
    sfx([[strong ? 70 : 110, 0, .15]]);
  } catch { /* 효과음은 없어도 진행 */ }
}
const pickOne = (arr, not = []) => { const a = arr.filter(x => !not.includes(x)); return a[Math.floor(Math.random() * a.length)]; };

function rocks() {
  const my = newScene();
  app.innerHTML = `<section class="screen mission">
    <div class="bar">
      <button class="btn icon home" aria-label="처음으로">🏠</button><span class="spacer"></span>
      <div class="tray" aria-label="모은 부품">${PARTS.map(() => '<span class="part-slot"></span>').join('')}</div>
      <span class="spacer"></span>
      <button class="btn icon again" aria-label="다시 듣기">🔊</button></div>
    <div class="site"><img class="machine" src="img/breaker.jpg" alt="브레이커"><div class="pile"></div></div></section>`;
  const site = app.querySelector('.site'), pile = app.querySelector('.pile'), machine = app.querySelector('.machine');
  const tray = [...app.querySelectorAll('.part-slot')];
  app.querySelector('.home').onclick = intro;
  let got = 0, target = null, retry = null, prev = null, busy = false, at = null, idle = 0;

  const M = () => machine.offsetWidth;
  function park() {
    at = null;
    machine.style.setProperty('--flip', '1');
    machine.style.left = `${site.clientWidth * 0.02}px`;
    machine.style.top = '0px';
  }
  // 정 끝(그림의 왼쪽 아래 15%, 78%)이 바위 윗면에 닿게 옮긴다. 오른쪽 바위는 좌우를 뒤집어 화면 밖으로 안 나가게
  function moveTo(rock) {
    if (at === rock) return Promise.resolve();
    at = rock;
    const m = M(), cx = rock.offsetLeft + rock.offsetWidth / 2, flip = cx > site.clientWidth / 2;
    machine.style.setProperty('--flip', flip ? '-1' : '1');
    machine.style.left = `${cx - (flip ? 0.85 : 0.15) * m}px`;
    machine.style.top = `${pile.offsetTop + rock.offsetTop + rock.offsetHeight * 0.34 - 0.78 * m}px`;
    return wait(reduced ? 0 : 380);
  }
  async function prompt() {
    await sayWord(target);
    if (scene === my) await rockSay('find');
  }
  function poke() { clearTimeout(idle); idle = setTimeout(hint, HINT_MS); }
  function hint() {
    if (scene !== my) return;
    const r = pile.querySelector(`.rock[data-ch="${target}"]:not(.broken)`);
    if (r) { r.classList.remove('hint'); r.offsetWidth; r.classList.add('hint'); prompt(); }
    poke();
  }
  app.querySelector('.again').onclick = () => { poke(); prompt(); };

  function round() {
    if (scene !== my) return;
    target = retry && retry !== prev ? retry : pickOne(ROCK_WORDS, [prev]);
    if (target === retry) retry = null;
    prev = target;
    const n = got < 2 ? 2 : 3; // 처음 두 판은 바위 2개
    const words = [target];
    while (words.length < n) words.push(pickOne(ROCK_WORDS, words));
    words.sort(() => Math.random() - 0.5);
    pile.style.setProperty('--n', n);
    pile.innerHTML = words.map(w => `<button class="rock" data-ch="${w}" data-hits="0" aria-label="${w} 바위">
      <img class="half l" src="img/rock.jpg" alt=""><img class="half r" src="img/rock.jpg" alt="">
      <svg class="crack" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="100" d="M52 33 L46 45 L56 55 L44 64 L50 72"/></svg>
      <span class="carve">${w}</span></button>`).join('');
    park();
    pile.querySelectorAll('.rock').forEach(r => r.onclick = () => hit(r));
    poke();
    prompt();
  }

  async function hit(rock) {
    if (busy || scene !== my || rock.classList.contains('broken')) return;
    busy = true;
    poke();
    await moveTo(rock);
    if (scene !== my) return;
    machine.classList.remove('jab'); machine.offsetWidth; machine.classList.add('jab');
    rock.classList.remove('shake'); rock.offsetWidth; rock.classList.add('shake');
    const right = rock.dataset.ch === target;
    thud(right);
    busy = false;
    if (!right) { // 깨지지 않는다: 이 바위 글자를 읽어 주고 다시 부른다. 그 글자는 곧 다시 나온다
      retry = target;
      await sayWord(rock.dataset.ch);
      if (scene !== my) return;
      await wait(250);
      if (scene === my) prompt();
      return;
    }
    const hits = +rock.dataset.hits + 1;
    rock.dataset.hits = hits;
    if (hits < HITS) return;
    busy = true;
    clearTimeout(idle);
    stopAudio();
    rock.classList.add('broken');
    sfx(SFX.cheer);
    await wait(500);
    if (scene !== my) return;
    await sayWord(target);
    if (scene !== my) return;
    await givePart(rock);
    if (scene !== my) return;
    busy = false;
    if (got === PARTS.length) return finish();
    sayPhrase('great');
    await wait(1400);
    round();
  }

  async function givePart(rock) { // 부품이 바위 자리에서 위 부품 상자로 날아간다
    const slot = tray[got], r = rock.getBoundingClientRect(), s = slot.getBoundingClientRect();
    const p = document.createElement('span');
    p.className = 'flying-part';
    p.textContent = PARTS[got];
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + r.height / 2}px`;
    document.body.append(p);
    p.offsetWidth;
    p.style.transform = `translate(${s.left + s.width / 2 - r.left - r.width / 2}px, ${s.top + s.height / 2 - r.top - r.height / 2}px) scale(.6)`;
    await wait(reduced ? 0 : 700);
    p.remove();
    slot.textContent = PARTS[got];
    slot.classList.add('got', 'hop');
    got++;
  }

  async function finish() {
    pile.innerHTML = `<div class="mission-done"><div class="cheer">${friends('최고야', 'dance')}</div>
      <div class="row"><button class="btn big again-go">↻ 또 깨기</button><button class="btn big alt home-go">🏠</button></div></div>`;
    park();
    machine.classList.add('dance');
    pile.querySelector('.again-go').onclick = rocks;
    pile.querySelector('.home-go').onclick = intro;
    rockSay('done');
  }

  (async () => {
    park();
    await rockSay('hello');
    if (scene === my) round();
  })();
}

[DATA, SOUNDS] = await Promise.all(['words.json', 'sounds.json'].map(async f => (await fetch(f)).json()));
intro();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js');
}
