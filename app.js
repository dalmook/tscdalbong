// app.js 전체 코드 (단어암기 + 퀴즈 + 문장만들기)
// - 문장만들기 요구사항 구현:
//   1) vocab.json의 example / example_ko 사용
//   2) 한글 문장 제시, 아래에 한자(글자) 토큰을 섞어서 배치 → 클릭 순서대로 상단에 조립
//   3) 챕터별 3문제 랜덤
//   4) 시작점수 1000, 오답 -10, 최종 점수 = (현재점수 - 전체 경과초) (0 미만이면 0)
//   5) 점수 및 기록은 챕터별로 저장/표시 (quiz와 동일한 패턴)

const $ = (sel, el=document) => el.querySelector(sel);
const app = document.getElementById('app');
const dock = document.getElementById('dock');
const DATA_URL = 'appData.json';
const VOCAB_URL = 'vocab.json';

const LS_KEYS = {
  learned: 'vocab_learned',           // { [chapter]: { [hanzi]: true } }
  pos:     'vocab_position',          // { chapter: string, indexByChapter: { [chapter]: number } }
  qstats:  'quiz_stats',              // { [chapter]: { attempts,bestScore,lastScore,correct,total,lastAt } }
  sstats:  'sentence_stats'           // { [chapter]: { attempts,bestScore,lastScore,lastAt } }
};

function loadLS(key, fallback){
  try { const v = localStorage.getItem(key); return v? JSON.parse(v) : (fallback ?? null); }
  catch { return fallback ?? null; }
}
function saveLS(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

let APP_DATA = { apps: [], dock: [] };
let VOCAB_DATA = [];
let learned = loadLS(LS_KEYS.learned, {});
let pos = loadLS(LS_KEYS.pos, { chapter: 'chapter1', indexByChapter: {} });
let qstats = loadLS(LS_KEYS.qstats, {});
let sstats = loadLS(LS_KEYS.sstats, {});
let currentChapter = pos.chapter || 'chapter1';
let currentIndex = pos.indexByChapter?.[currentChapter] ?? 0;

// 상단 시계
function startClock() {
  const el = document.getElementById('clock');
  const fmt = n => String(n).padStart(2,'0');
  const tick = () => { const d = new Date(); el.textContent = `${fmt(d.getHours())}:${fmt(d.getMinutes())}`; };
  tick();
  setInterval(tick, 1000 * 30);
}

// 공통 스타일(퀴즈/문장 버튼 굵게 & 크게)
function ensureUIStyles(){
  if ($('#uiStyle')) return;
  const css = `
  .btn { padding: 14px 16px; font-size: 16px; font-weight: 700; border-width: 2px; }
  .q-options, .s-options { display:grid; gap:10px; margin-top:12px; grid-template-columns: repeat(2, 1fr); }
  .q-option, .s-option { min-height: 56px; font-size: 18px; font-weight: 800; border:2px solid rgba(255,255,255,0.08); border-radius:14px; }
  .q-option:active, .s-option:active { transform: translateY(1px); }
  .opt-correct { outline: 3px solid #36d399; }
  .opt-wrong { outline: 3px solid #ff6b6b; }
  #q-timer, #s-timer { font-weight: 800; }
  #q-stats, #s-stats { display:grid; gap:6px; margin-top:10px; color:#c9d2e1; }
  #q-stats b, #s-stats b { color:#fff; }
  .s-assembled { min-height: 48px; background:#1b2030; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px; font-size:22px; font-weight:800; letter-spacing:1px; }
  .s-prompt { font-size:18px; color:#cfd6e4; }
  `;
  const style = document.createElement('style');
  style.id = 'uiStyle';
  style.textContent = css;
  document.head.appendChild(style);
}

// 라우팅
function navigate(to) {
  if (!to || to === 'home') { history.replaceState({}, '', '#home'); renderHome(); }
  else { history.pushState({}, '', `#${to}`); renderSubscreen(to); }
}
window.addEventListener('popstate', () => {
  const id = location.hash.replace('#','') || 'home';
  if (id === 'home') renderHome(); else renderSubscreen(id);
});

// 홈 렌더링
function renderHome() {
  const grid = document.createElement('section');
  grid.className = 'home-grid';
  APP_DATA.apps.forEach(appItem => {
    const card = document.createElement('button');
    card.className = 'app-icon';
    card.setAttribute('aria-label', `${appItem.title} 열기`);
    card.innerHTML = `<span class="app-emoji">${appItem.emoji}</span><span class="app-title">${appItem.title}</span>`;
    card.addEventListener('click', () => navigate(appItem.id));
    grid.appendChild(card);
  });
  app.innerHTML = '';
  app.appendChild(grid);
}

// 도크 렌더링
function renderDock() {
  dock.innerHTML = '';
  APP_DATA.dock.forEach(id => {
    const item = APP_DATA.apps.find(a => a.id === id);
    if (!item) return;
    const btn = document.createElement('button');
    btn.className = 'dock-btn';
    btn.setAttribute('aria-label', `${item.title} 바로가기`);
    btn.textContent = item.emoji;
    btn.addEventListener('click', () => navigate(item.id));
    dock.appendChild(btn);
  });
}

// ------------------ 공통 유틸 ------------------
function chapters(){ return [...new Set(VOCAB_DATA.map(v => v.chapter))]; }
function wordsOf(ch){ return VOCAB_DATA.filter(v => v.chapter === ch); }
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function sample(arr, n){ const c=arr.slice(); shuffle(c); return c.slice(0, n); }
function ensureLearnedChapter(ch){ if(!learned[ch]) learned[ch] = {}; }
function setIndex(ch, idx){ pos.indexByChapter[ch] = idx; pos.chapter = ch; saveLS(LS_KEYS.pos, pos); }
function getIndex(ch){ return pos.indexByChapter?.[ch] ?? 0; }
function clampIndex(){ const len = wordsOf(currentChapter).length; if (len===0) currentIndex=0; else currentIndex = Math.min(Math.max(0,currentIndex), len-1); }
function calcProgress(ch){ const list = wordsOf(ch); if(!list.length) return {n:0, total:0, pct:0}; const p = learned[ch]||{}; const n = list.reduce((a,w)=> a + (p[w.hanzi] ? 1 : 0), 0); return { n, total: list.length, pct: Math.round(n/list.length*100) }; }

function speak(text, lang='zh-CN', rate=1){ if(!text) return; const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate; const v = speechSynthesis.getVoices().find(v=>v.lang?.toLowerCase().startsWith(lang.toLowerCase())); if(v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); }
function beep(){ try{ const ctx = new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(); const g=ctx.createGain(); o.type='square'; o.frequency.value=440; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.15, ctx.currentTime); o.start(); o.stop(ctx.currentTime+0.15); }catch(e){} }

// ------------------ 단어암기 ------------------
function renderVocab() {
  const chs = chapters();
  const list = wordsOf(currentChapter);
  clampIndex();
  setIndex(currentChapter, currentIndex); // 위치 저장

  const card = list[currentIndex];
  const prog = calcProgress(currentChapter);
  ensureLearnedChapter(currentChapter);
  const isKnown = card ? !!learned[currentChapter][card.hanzi] : false;

  const header = `
    <div class="sub-header">
      <button class="back" onclick="navigate('home')">← 홈</button>
      <div class="sub-title">단어암기</div>
      <select id="chapter-select" class="select" aria-label="챕터 선택">
        ${chs.map(ch => `<option value="${ch}" ${ch===currentChapter?'selected':''}>${ch}</option>`).join('')}
      </select>
      <span class="pill" id="progressPill">진도: ${prog.pct}% (${prog.n}/${prog.total})</span>
    </div>`;

  app.innerHTML = `
    <div class="subscreen">
      ${header}
      <section class="card vocab-card" id="vocabCard">
        ${card ? `
          <div class="front">
            <h2 class="hanzi">${card.hanzi}</h2>
            <p class="pinyin">[${card.pinyin}]</p>
            <p class="example">${card.example}</p>
          </div>
          <div class="back">
            <p class="meaning">${card.meaning}</p>
            <p class="example">${card.example_ko || ''}</p>
          </div>
        ` : '<p>이 챕터에 단어가 없습니다.</p>'}
      </section>

      <div class="controls">
        <button class="btn" onclick="speak('${card?card.hanzi:''}','zh-CN',1)">🔊 단어</button>
        <button class="btn" onclick="speak('${card?card.example:''}','zh-CN',0.8)">🔊 예문(0.8x)</button>
        <button class="btn" id="btnKnown">${isKnown ? '✅ 암기 해제' : '✅ 암기 완료'}</button>
      </div>

      <div class="controls">
        <button class="btn" onclick="prevCard()">← 이전</button>
        <button class="btn" id="flipBtn">앞/뒤</button>
        <button class="btn" onclick="nextCard()">다음 →</button>
      </div>
    </div>`;

  // 이벤트
  const cardEl = document.getElementById('vocabCard');
  if (cardEl) cardEl.addEventListener('click', ()=> cardEl.classList.toggle('flipped'));
  const flipBtn = document.getElementById('flipBtn');
  if (flipBtn) flipBtn.addEventListener('click', (e)=>{ e.stopPropagation(); cardEl.classList.toggle('flipped'); });

  const sel = document.getElementById('chapter-select');
  if (sel) sel.addEventListener('change', e => {
    currentChapter = e.target.value;
    currentIndex = getIndex(currentChapter); // 마지막 보던 위치 복원
    renderVocab();
  });

  const btnKnown = document.getElementById('btnKnown');
  if (btnKnown && card) btnKnown.addEventListener('click', ()=>{
    ensureLearnedChapter(currentChapter);
    learned[currentChapter][card.hanzi] = !learned[currentChapter][card.hanzi]; // 토글
    saveLS(LS_KEYS.learned, learned);
    renderVocab();
  });
}

function prevCard(){ if(currentIndex>0){ currentIndex--; setIndex(currentChapter, currentIndex); renderVocab(); } }
function nextCard(){ const list = wordsOf(currentChapter); if(currentIndex<list.length-1){ currentIndex++; setIndex(currentChapter, currentIndex); renderVocab(); } }

// ------------------ 퀴즈 ------------------
const QUIZ = {
  state: null,
  chapterStats(ch){
    const s = qstats[ch] || { attempts:0, bestScore:0, lastScore:0, correct:0, total:0, lastAt:null };
    const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    return { ...s, acc };
  },
  renderStatsPanel(ch){
    const s = QUIZ.chapterStats(ch);
    $('#q-stats').innerHTML = `
      <div>시도: <b>${s.attempts}</b>회</div>
      <div>최고점: <b>${s.bestScore}</b></div>
      <div>최근점: <b>${s.lastScore}</b></div>
      <div>정확도: <b>${s.acc}%</b> (${s.correct}/${s.total})</div>
      <div>최근일시: <b>${s.lastAt ? new Date(s.lastAt).toLocaleString() : '-'}</b></div>
    `;
  },
  createConfig(){
    ensureUIStyles();
    const chs = chapters();
    const header = `
      <div class=\"sub-header\">
        <button class=\"back\" onclick=\"navigate('home')\">← 홈</button>
        <div class=\"sub-title\">퀴즈 설정</div>
      </div>`;
    app.innerHTML = `
      <div class=\"subscreen\">
        ${header}
        <section class=\"card\">
          <label style=\"display:block;margin-bottom:10px;color:#9aa4b2;\">챕터</label>
          <select id=\"q-chapter\" class=\"select\">${chs.map(ch=>`<option value=\"${ch}\">${ch}</option>`).join('')}</select>
          <div id=\"q-stats\"></div>
          <div style=\"height:10px\"></div>
          <label style=\"display:block;margin-bottom:10px;color:#9aa4b2;\">모드</label>
          <label class=\"pill\"><input type=\"radio\" name=\"qmode\" value=\"hz2ko\" checked> 한자→뜻</label>
          <label class=\"pill\" style=\"margin-left:8px;\"><input type=\"radio\" name=\"qmode\" value=\"ko2hz\"> 뜻→한자</label>
          <div style=\"height:14px\"></div>
          <button class=\"btn\" id=\"q-start\">시작 (20문항)</button>
        </section>
      </div>`;

    const chSel = $('#q-chapter');
    const updateStats = ()=> QUIZ.renderStatsPanel(chSel.value);
    chSel.addEventListener('change', updateStats);
    updateStats(); // 초기 표시

    $('#q-start').addEventListener('click', ()=>{
      const chapter = chSel.value;
      const mode = [...document.querySelectorAll('input[name="qmode"]')].find(i=>i.checked).value;
      QUIZ.start({ chapter, mode });
    });
  },
  buildQuestions(chapter, mode){
    const pool = wordsOf(chapter);
    const items = pool.length <= 20 ? shuffle(pool.slice()) : sample(pool, 20);
    return items.map(target => {
      // 보기 4개 구성
      const wrongPool = pool.filter(v => v !== target);
      const distractors = sample(wrongPool, Math.min(3, wrongPool.length));
      let prompt, correct, options;
      if (mode === 'hz2ko') {
        prompt = `${target.hanzi} [${target.pinyin}]`;
        correct = target.meaning;
        options = shuffle([correct, ...distractors.map(d=>d.meaning)]).slice(0,4);
      } else {
        prompt = `${target.meaning}`;
        correct = target.hanzi;
        options = shuffle([correct, ...distractors.map(d=>d.hanzi)]).slice(0,4);
      }
      // 보기 중복 방지
      options = Array.from(new Set(options));
      while (options.length < 4 && wrongPool.length) {
        const extra = sample(wrongPool, 1)[0];
        options.push(mode==='hz2ko'? extra.meaning : extra.hanzi);
        options = Array.from(new Set(options));
      }
      options = shuffle(options);
      return { target, prompt, correct, options };
    });
  },
  start({ chapter, mode }){
    const questions = QUIZ.buildQuestions(chapter, mode);
    QUIZ.state = {
      chapter, mode, questions, idx: 0,
      score: 0,
      perLimit: 5, left: 5, timer: null,
      leftoverTotal: 0, locked: false,
      correctCount: 0
    };
    QUIZ.render();
    QUIZ.tickStart();
  },
  tickStart(){
    const s = QUIZ.state; if (!s) return;
    clearInterval(s.timer);
    s.left = s.perLimit;
    s.timer = setInterval(()=>{
      s.left -= 1; QUIZ.updateTimer();
      if (s.left <= 0) { clearInterval(s.timer); QUIZ.timeUp(); }
    }, 1000);
    QUIZ.updateTimer();
  },
  updateTimer(){ const el = $('#q-timer'); if (el && QUIZ.state) el.textContent = `${QUIZ.state.left}s`; },
  timeUp(){
    const s = QUIZ.state; if (!s || s.locked) return;
    s.locked = true;
    s.score -= 10; // 오답 처리
    beep();
    QUIZ.reveal(null);
    setTimeout(()=> QUIZ.next(), 700);
  },
  choose(value){
    const s = QUIZ.state; if (!s || s.locked) return;
    s.locked = true;
    const q = s.questions[s.idx];
    const correct = (value === q.correct);
    if (correct) {
      s.score += 10;
      s.leftoverTotal += s.left; // 남은 시간 누적
      s.correctCount += 1;
      speak(q.target.hanzi, 'zh-CN', 1);
    } else {
      s.score -= 10;
      beep();
    }
    clearInterval(s.timer);
    QUIZ.reveal(value);
    setTimeout(()=> QUIZ.next(), 650);
  },
  reveal(chosen){
    const q = QUIZ.state.questions[QUIZ.state.idx];
    const btns = [...document.querySelectorAll('.q-option')];
    btns.forEach(b=>{
      const val = b.getAttribute('data-val');
      if (val === q.correct) b.classList.add('opt-correct'); // 초록 테두리
      if (chosen && val === chosen && val !== q.correct) b.classList.add('opt-wrong');
      b.disabled = true;
    });
  },
  next(){
    const s = QUIZ.state; if (!s) return;
    s.idx++;
    if (s.idx >= s.questions.length) { return QUIZ.finish(); }
    s.locked = false; QUIZ.render(); QUIZ.tickStart();
  },
  finish(){
    const s = QUIZ.state; if (!s) return;
    const base = s.score;
    const finalScore = base * Math.max(0, s.leftoverTotal);
    clearInterval(s.timer);

    // --- 챕터별 기록 업데이트 ---
    const ch = s.chapter;
    const prev = qstats[ch] || { attempts:0, bestScore:0, lastScore:0, correct:0, total:0, lastAt:null };
    const totalQ = s.questions.length;
    const newStats = {
      attempts: prev.attempts + 1,
      bestScore: Math.max(prev.bestScore||0, finalScore),
      lastScore: finalScore,
      correct: (prev.correct || 0) + s.correctCount,
      total: (prev.total || 0) + totalQ,
      lastAt: new Date().toISOString()
    };
    qstats[ch] = newStats; saveLS(LS_KEYS.qstats, qstats);

    app.innerHTML = `
      <div class="subscreen">
        <div class="sub-header">
          <button class="back" onclick="QUIZ.createConfig()">← 설정</button>
          <div class="sub-title">결과</div>
          <span class="pill">정확도 이번: ${Math.round((s.correctCount/totalQ)*100)}%</span>
        </div>
        <section class="card">
          <p>챕터: <b>${s.chapter}</b> / 모드: <b>${s.mode==='hz2ko'?'한자→뜻':'뜻→한자'}</b></p>
          <p>기본점수: <b>${base}</b></p>
          <p>남은시간 합계: <b>${s.leftoverTotal}s</b></p>
          <hr style="opacity:.2; margin:10px 0;">
          <p style="font-size:20px; font-weight:800;">최종 점수: <span>${finalScore}</span></p>
          <div style="height:12px"></div>
          <div id="q-stats" class="card" style="margin-bottom:12px"></div>
          <button class="btn" id="q-retry">다시 풀기</button>
          <button class="btn" onclick="navigate('home')" style="margin-left:8px;">홈으로</button>
        </section>
      </div>`;

    $('#q-retry').addEventListener('click', ()=> QUIZ.start({ chapter: s.chapter, mode: s.mode }));
    // 결과 화면에서도 최신 기록 표시
    const statBox = document.getElementById('q-stats');
    if (statBox) statBox.outerHTML = `<div id=\"q-stats\" class=\"card\" style=\"margin-bottom:12px\">\n${(()=>{ const t=QUIZ.chapterStats(ch); return `
      <div>누적 시도: <b>${t.attempts}</b>회</div>
      <div>최고점: <b>${t.bestScore}</b></div>
      <div>최근점: <b>${t.lastScore}</b></div>
      <div>누적 정확도: <b>${t.acc}%</b> (${t.correct}/${t.total})</div>
      <div>최근일시: <b>${t.lastAt ? new Date(t.lastAt).toLocaleString() : '-'}</b></div>
    `;})()}\n</div>`;
  },
  render(){
    const s = QUIZ.state; const q = s.questions[s.idx];
    const header = `
      <div class="sub-header">
        <button class="back" onclick="QUIZ.createConfig()">← 설정</button>
        <div class="sub-title">퀴즈 (${s.idx+1}/${s.questions.length})</div>
        <span class="pill">점수: ${s.score}</span>
        <span class="pill" id="q-timer">${s.left}s</span>
      </div>`;

    app.innerHTML = `
      <div class="subscreen">
        ${header}
        <section class="card">
          <div class="q-prompt" style="font-size:22px; font-weight:800;">${q.prompt}</div>
          <div class="q-options">
            ${q.options.map(o=>`<button class="btn q-option" data-val="${o}">${o}</button>`).join('')}
          </div>
        </section>
      </div>`;

    [...document.querySelectorAll('.q-option')].forEach(b=> b.addEventListener('click', ()=> QUIZ.choose(b.getAttribute('data-val'))));
  }
};

// ------------------ 문장만들기 ------------------
const SENT = {
  state: null,
  chapterStats(ch){
    const s = sstats[ch] || { attempts:0, bestScore:0, lastScore:0, lastAt:null };
    return s;
  },
  renderStatsPanel(ch){
    const s = SENT.chapterStats(ch);
    $('#s-stats').innerHTML = `
      <div>시도: <b>${s.attempts||0}</b>회</div>
      <div>최고점: <b>${s.bestScore||0}</b></div>
      <div>최근점: <b>${s.lastScore||0}</b></div>
      <div>최근일시: <b>${s.lastAt ? new Date(s.lastAt).toLocaleString() : '-'}</b></div>
    `;
  },
  createConfig(){
    ensureUIStyles();
    const chs = chapters();
    const header = `
      <div class=\"sub-header\">
        <button class=\"back\" onclick=\"navigate('home')\">← 홈</button>
        <div class=\"sub-title\">문장만들기 설정</div>
      </div>`;
    app.innerHTML = `
      <div class=\"subscreen\">
        ${header}
        <section class=\"card\">
          <label style=\"display:block;margin-bottom:10px;color:#9aa4b2;\">챕터</label>
          <select id=\"s-chapter\" class=\"select\">${chs.map(ch=>`<option value=\"${ch}\">${ch}</option>`).join('')}</select>
          <div id=\"s-stats\"></div>
          <div style=\"height:14px\"></div>
          <button class=\"btn\" id=\"s-start\">시작 (3문제)</button>
        </section>
      </div>`;

    const chSel = $('#s-chapter');
    const updateStats = ()=> SENT.renderStatsPanel(chSel.value);
    chSel.addEventListener('change', updateStats);
    updateStats();

    $('#s-start').addEventListener('click', ()=>{
      const chapter = chSel.value;
      SENT.start({ chapter });
    });
  },
  tokenizeChinese(str){
    // 한자(중국어) 글자만 토큰으로 사용, 구두점/공백 제거
    const chars = (str || '').replace(/[\s，。！？、,.!?:；;“”\-—]/g,'').split('');
    return chars.filter(Boolean);
  },
  pickProblems(chapter){
    // vocab의 example/example_ko를 가져와 3문제 랜덤
    const pool = wordsOf(chapter).filter(v => v.example && v.example_ko);
    const uniqByEx = [];
    const seen = new Set();
    for (const v of pool) {
      const key = v.example + '|' + v.example_ko;
      if (!seen.has(key)) { seen.add(key); uniqByEx.push(v); }
    }
    const picked = sample(uniqByEx, Math.min(3, uniqByEx.length));
    return picked.map(v => {
      const answerTokens = SENT.tokenizeChinese(v.example);
      return {
        ko: v.example_ko,
        zh: v.example,
        tokens: shuffle(answerTokens.slice()),
        answer: answerTokens
      };
    });
  },
  start({ chapter }){
    const problems = SENT.pickProblems(chapter);
    SENT.state = {
      chapter,
      problems,
      idx: 0,
      score: 1000,
      startAt: Date.now(),
      assembled: [] // 선택된 토큰
    };
    SENT.render();
  },
  choose(token){
    const s = SENT.state; if (!s) return;
    const cur = s.problems[s.idx];
    const nextPos = s.assembled.length; // 다음에 놓일 위치
    const expected = cur.answer[nextPos];
    const btn = [...document.querySelectorAll('.s-option')].find(b=>b.textContent===token && !b.disabled);
    if (token === expected) {
      s.assembled.push(token);
      if (btn) btn.disabled = true;
    } else {
      s.score = Math.max(0, s.score - 10);
      if (btn) { btn.classList.add('opt-wrong'); setTimeout(()=> btn.classList.remove('opt-wrong'), 300); }
      beep();
      return; // 오답은 조립하지 않음
    }
    // 정답 완성 체크
    if (s.assembled.length === cur.answer.length) {
      setTimeout(()=> SENT.next(), 400);
    } else {
      SENT.updateAssembled();
    }
  },
  undo(){
    const s = SENT.state; if (!s) return;
    const last = s.assembled.pop();
    if (last !== undefined) {
      // 해당 토큰 버튼을 다시 활성화 (첫 번째 비활성화된 동일 토큰 복구)
      const btn = [...document.querySelectorAll('.s-option')].find(b=>b.textContent===last && b.disabled);
      if (btn) btn.disabled = false;
    }
    SENT.updateAssembled();
  },
  updateAssembled(){ const box = $('#s-assembled'); if (box && SENT.state){ box.textContent = SENT.state.assembled.join(''); } },
  next(){
    const s = SENT.state; if (!s) return;
    s.idx++;
    if (s.idx >= s.problems.length) return SENT.finish();
    s.assembled = [];
    SENT.render();
  },
  finish(){
    const s = SENT.state; if (!s) return;
    const elapsedSec = Math.round((Date.now() - s.startAt) / 1000);
    const finalScore = Math.max(0, s.score - elapsedSec);

    // 기록 저장
    const ch = s.chapter;
    const prev = sstats[ch] || { attempts:0, bestScore:0, lastScore:0, lastAt:null };
    const newS = {
      attempts: (prev.attempts||0) + 1,
      bestScore: Math.max(prev.bestScore||0, finalScore),
      lastScore: finalScore,
      lastAt: new Date().toISOString()
    };
    sstats[ch] = newS; saveLS(LS_KEYS.sstats, sstats);

    app.innerHTML = `
      <div class="subscreen">
        <div class="sub-header">
          <button class="back" onclick="SENT.createConfig()">← 설정</button>
          <div class="sub-title">문장만들기 결과</div>
          <span class="pill">경과: ${elapsedSec}s</span>
        </div>
        <section class="card">
          <p>챕터: <b>${ch}</b></p>
          <p>기본 점수(시작 1000, 오답 반영 후): <b>${s.score}</b></p>
          <p>시간 감점: <b>${elapsedSec}</b></p>
          <hr style="opacity:.2; margin:10px 0;">
          <p style="font-size:20px; font-weight:800;">최종 점수: <span>${finalScore}</span></p>
          <div style="height:12px"></div>
          <div id="s-stats" class="card" style="margin-bottom:12px"></div>
          <button class="btn" id="s-retry">다시 풀기</button>
          <button class="btn" onclick="navigate('home')" style="margin-left:8px;">홈으로</button>
        </section>
      </div>`;

    $('#s-retry').addEventListener('click', ()=> SENT.start({ chapter: ch }));
    // 최신 기록 표시
    const statBox = document.getElementById('s-stats');
    if (statBox) statBox.outerHTML = `<div id=\"s-stats\" class=\"card\" style=\"margin-bottom:12px\">\n${(()=>{ const t=SENT.chapterStats(ch); return `
      <div>누적 시도: <b>${t.attempts||0}</b>회</div>
      <div>최고점: <b>${t.bestScore||0}</b></div>
      <div>최근점: <b>${t.lastScore||0}</b></div>
      <div>최근일시: <b>${t.lastAt ? new Date(t.lastAt).toLocaleString() : '-'}</b></div>
    `;})()}\n</div>`;
  },
  render(){
    const s = SENT.state; const p = s.problems[s.idx];
    const header = `
      <div class="sub-header">
        <button class="back" onclick="SENT.createConfig()">← 설정</button>
        <div class="sub-title">문장만들기 (${s.idx+1}/${s.problems.length})</div>
        <span class="pill">점수: ${s.score}</span>
        <span class="pill" id="s-timer">진행중</span>
      </div>`;

    app.innerHTML = `
      <div class="subscreen">
        ${header}
        <section class="card">
          <div class="s-prompt">한국어: ${p.ko}</div>
          <div id="s-assembled" class="s-assembled"></div>
          <div class="s-options">
            ${p.tokens.map(t=>`<button class="btn s-option">${t}</button>`).join('')}
          </div>
          <div class="controls" style="margin-top:12px">
            <button class="btn" id="s-undo">← 되돌리기</button>
            <button class="btn" id="s-tts">🔊 중국어 문장 듣기</button>
          </div>
        </section>
      </div>`;

    $('#s-assembled').textContent = s.assembled.join('');
    [...document.querySelectorAll('.s-option')].forEach(b=> b.addEventListener('click', ()=> SENT.choose(b.textContent)));
    $('#s-undo').addEventListener('click', SENT.undo);
    $('#s-tts').addEventListener('click', ()=> speak(p.zh, 'zh-CN', 0.8));
  }
};

// ------------------ 기타 서브 화면 ------------------
const SUB_TEMPLATES = {
  vocab: () => { renderVocab(); return ''; },
  quiz: () => { QUIZ.createConfig(); },
  sentence: () => { SENT.createConfig(); },
  review: () => { app.innerHTML = `<div class="subscreen"><div class="sub-header"><button class="back" onclick="navigate('home')">← 홈</button><div class="sub-title">복습</div></div><section class="card"><p>SRS 요약 준비중</p></section></div>`; },
  stats: () => { app.innerHTML = `<div class="subscreen"><div class="sub-header"><button class="back" onclick="navigate('home')">← 홈</button><div class="sub-title">통계</div></div><section class="card"><p>통계 시각화 준비중</p></section></div>`; },
  settings: () => { app.innerHTML = `<div class="subscreen"><div class="sub-header"><button class="back" onclick="navigate('home')">← 홈</button><div class="sub-title">설정</div></div><section class="card"><p>설정 화면 준비중</p></section></div>`; }
};

function renderSubscreen(id) { if (id === 'vocab') return renderVocab(); const tpl = SUB_TEMPLATES[id]; if (!tpl) return navigate('home'); tpl(); }

// 데이터 로드
async function init(){
  try {
    const [resA, resV] = await Promise.all([
      fetch(DATA_URL, {cache:'no-store'}),
      fetch(VOCAB_URL, {cache:'no-store'})
    ]);
    APP_DATA = await resA.json();
    VOCAB_DATA = await resV.json();
  }catch(e){ console.error(e); }

  startClock();
  ensureUIStyles();
  renderDock();
  const initial = location.hash.replace('#','')||'home';
  if(initial==='vocab') renderVocab();
  else if(initial==='home') renderHome();
  else renderSubscreen(initial);
}

init();


window.navigate = navigate;
