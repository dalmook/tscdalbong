// app.js 전체 코드 (단어암기 카드 + localStorage 저장)

const $ = (sel, el=document) => el.querySelector(sel);
const app = document.getElementById('app');
const dock = document.getElementById('dock');
const DATA_URL = 'appData.json';
const VOCAB_URL = 'vocab.json';
let APP_DATA = { apps: [], dock: [] };
let VOCAB_DATA = [];
let currentChapter = 'chapter1';
let currentIndex = 0;
let learned = {}; // {chapter: {index: true}}

// localStorage 저장/로드
function loadLearned(){
  try { learned = JSON.parse(localStorage.getItem('learnedProgress')) || {}; }
  catch { learned = {}; }
}
function saveLearned(){
  localStorage.setItem('learnedProgress', JSON.stringify(learned));
}

// 상단 시계
function startClock() {
  const el = document.getElementById('clock');
  const fmt = n => String(n).padStart(2,'0');
  const tick = () => {
    const d = new Date();
    el.textContent = `${fmt(d.getHours())}:${fmt(d.getMinutes())}`;
  };
  tick();
  setInterval(tick, 1000 * 30);
}

// 라우팅
function navigate(to) {
  if (!to || to === 'home') {
    history.replaceState({}, '', '#home');
    renderHome();
  } else {
    history.pushState({}, '', `#${to}`);
    renderSubscreen(to);
  }
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

// ------------------ 단어암기 ------------------
function renderVocab() {
  const chapters = [...new Set(VOCAB_DATA.map(v => v.chapter))];
  const words = VOCAB_DATA.filter(v => v.chapter === currentChapter);

  const header = `
    <div class="sub-header">
      <button class="back" onclick="navigate('home')">← 홈</button>
      <div class="sub-title">단어암기 (${currentChapter})</div>
    </div>
    <select id="chapter-select">
      ${chapters.map(ch => `<option value="${ch}" ${ch===currentChapter?'selected':''}>${ch}</option>`).join('')}
    </select>
  `;

  const cardData = words[currentIndex];
  if (!cardData) {
    app.innerHTML = header + `<p>이 챕터에 단어가 없습니다.</p>`;
    return;
  }

  const progress = Object.values(learned[currentChapter]||{}).filter(v=>v).length;
  const total = words.length;
  const isLearned = learned[currentChapter]?.[currentIndex] || false;

  app.innerHTML = `
    <div class="subscreen">
      ${header}
      <div class="card vocab-card ${isLearned? 'done':''}" onclick="flipCard()">
        <div class="front">
          <h2>${cardData.hanzi}</h2>
          <p>[${cardData.pinyin}]</p>
          <p style="margin-top:10px; font-size:14px; color:#aaa;">예문: ${cardData.example}</p>
        </div>
        <div class="back">
          <p>${cardData.meaning}</p>
          <p style="margin-top:10px; font-size:14px; color:#aaa;">(${cardData.example_ko})</p>
        </div>
      </div>
      <div class="controls">
        <button onclick="speak('${cardData.hanzi}','zh-CN',1)">단어 읽기</button>
        <button onclick="speak('${cardData.example}','zh-CN',0.8)">예문 읽기</button>
        <button onclick="markLearned()">${isLearned? '암기취소':'암기완료'}</button>
      </div>
      <div class="nav">
        <button onclick="prevCard()">← 이전</button>
        <span>${currentIndex+1}/${total} (진도: ${progress}/${total})</span>
        <button onclick="nextCard()">다음 →</button>
      </div>
    </div>
  `;

  $('#chapter-select').addEventListener('change', e => {
    currentChapter = e.target.value;
    currentIndex = 0;
    renderVocab();
  });
}

function flipCard() {
  $('.vocab-card').classList.toggle('flipped');
}

function prevCard(){ if(currentIndex>0){ currentIndex--; renderVocab(); } }
function nextCard(){
  const words = VOCAB_DATA.filter(v=>v.chapter===currentChapter);
  if(currentIndex<words.length-1){ currentIndex++; renderVocab(); }
}

function markLearned(){
  if(!learned[currentChapter]) learned[currentChapter] = {};
  const cur = learned[currentChapter][currentIndex] || false;
  learned[currentChapter][currentIndex] = !cur;
  saveLearned();
  renderVocab();
}

function speak(text, lang='zh-CN', rate=1){
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  speechSynthesis.speak(u);
}

// ------------------ 기타 서브 화면 ------------------
const SUB_TEMPLATES = {
  vocab: () => { renderVocab(); return ''; },
  quiz: () => {
    app.innerHTML = `<div class="subscreen"><p>퀴즈 화면 준비중</p></div>`;
  },
  sentence: () => {
    app.innerHTML = `<div class="subscreen"><p>문장만들기 준비중</p></div>`;
  },
  review: () => {
    app.innerHTML = `<div class="subscreen"><p>복습 화면 준비중</p></div>`;
  },
  stats: () => {
    app.innerHTML = `<div class="subscreen"><p>통계 화면 준비중</p></div>`;
  },
  settings: () => {
    app.innerHTML = `<div class="subscreen"><p>설정 화면 준비중</p></div>`;
  }
};

function renderSubscreen(id) {
  if (id === 'vocab') return renderVocab();
  const tpl = SUB_TEMPLATES[id];
  if (!tpl) return navigate('home');
  tpl();
}

// 데이터 로드
async function init(){
  try {
    const res = await fetch(DATA_URL);
    APP_DATA = await res.json();
    const vres = await fetch(VOCAB_URL);
    VOCAB_DATA = await vres.json();
  }catch(e){ console.error(e); }

  loadLearned();
  startClock();
  renderDock();
  const initial = location.hash.replace('#','')||'home';
  if(initial==='vocab') renderVocab();
  else if(initial==='home') renderHome();
  else renderSubscreen(initial);
}

init();

window.navigate = navigate;
