const VOCAB_URL = 'vocab.json';
let VOCAB_DATA = [];
let currentChapter = 'chapter1';
let currentIndex = 0;
let learned = {}; // {chapter1: {0:true,1:false,...}}

// 단어암기 화면 렌더링
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

  app.innerHTML = `
    <div class="subscreen">
      ${header}
      <div class="card vocab-card" onclick="flipCard()">
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
        <button onclick="markLearned()">암기완료</button>
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

// 카드 앞/뒤 전환
function flipCard() {
  $('.vocab-card').classList.toggle('flipped');
}

// 이전/다음 카드
function prevCard(){ if(currentIndex>0){ currentIndex--; renderVocab(); } }
function nextCard(){
  const words = VOCAB_DATA.filter(v=>v.chapter===currentChapter);
  if(currentIndex<words.length-1){ currentIndex++; renderVocab(); }
}

// 암기 완료 표시
function markLearned(){
  if(!learned[currentChapter]) learned[currentChapter] = {};
  learned[currentChapter][currentIndex] = true;
  nextCard();
}

// TTS
function speak(text, lang='zh-CN', rate=1){
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  speechSynthesis.speak(u);
}

// 초기 데이터 로드 확장
async function init(){
  try {
    const res = await fetch(DATA_URL);
    APP_DATA = await res.json();
    const vres = await fetch(VOCAB_URL);
    VOCAB_DATA = await vres.json();
  }catch(e){ console.error(e); }

  startClock();
  renderDock();
  const initial = location.hash.replace('#','')||'home';
  if(initial==='vocab') renderVocab();
  else if(initial==='home') renderHome();
  else renderSubscreen(initial);
}

// SUB_TEMPLATES.vocab 교체
SUB_TEMPLATES.vocab = () => {
  renderVocab();
  return ''; // 이미 renderVocab에서 DOM을 교체함
};
