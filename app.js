// 간단한 해시 기반 라우팅 + JSON 기반 홈 그리드 렌더링
const $ = (sel, el=document) => el.querySelector(sel);
const app = document.getElementById('app');
const dock = document.getElementById('dock');
const DATA_URL = 'appData.json';
let APP_DATA = { apps: [], dock: [] };

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

// 서브 화면 템플릿 (플레이스홀더)
const SUB_TEMPLATES = {
  vocab: () => `
    <div class="subscreen">
      <div class="sub-header">
        <button class="back" onclick="navigate('home')">← 홈</button>
        <div class="sub-title">단어암기</div>
      </div>
      <section class="card">
        <p>여기에 단어 카드 뷰어를 붙일 수 있어요. (좌우 스와이프, 난이도 표시, 발음 버튼 등)</p>
      </section>
    </div>
  `,
  quiz: () => `
    <div class="subscreen">
      <div class="sub-header">
        <button class="back" onclick="navigate('home')">← 홈</button>
        <div class="sub-title">퀴즈</div>
      </div>
      <section class="card">
        <p>객관식/주관식 퀴즈 영역. (타이머, 진행도, 정답 애니메이션 등)</p>
      </section>
    </div>
  `,
  sentence: () => `
    <div class="subscreen">
      <div class="sub-header">
        <button class="back" onclick="navigate('home')">← 홈</button>
        <div class="sub-title">문장만들기</div>
      </div>
      <section class="card">
        <p>드래그로 단어 순서 맞추기/빈칸 채우기 등 구성 예정.</p>
      </section>
    </div>
  `,
  review: () => `
    <div class="subscreen">
      <div class="sub-header">
        <button class="back" onclick="navigate('home')">← 홈</button>
        <div class="sub-title">복습</div>
      </div>
      <section class="card">
        <p>스페이스드 리피티션(SRS) 스케줄 요약 표시.</p>
      </section>
    </div>
  `,
  stats: () => `
    <div class="subscreen">
      <div class="sub-header">
        <button class="back" onclick="navigate('home')">← 홈</button>
        <div class="sub-title">통계</div>
      </div>
      <section class="card">
        <p>학습 시간/정답률/약점 단원 시각화.</p>
      </section>
    </div>
  `,
  settings: () => `
    <div class="subscreen">
      <div class="sub-header">
        <button class="back" onclick="navigate('home')">← 홈</button>
        <div class="sub-title">설정</div>
      </div>
      <section class="card">
        <label style="display:block; margin-bottom:10px;">
          <span style="display:block; margin-bottom:6px; color:#9aa4b2;">테마</span>
          <select id="theme-select">
            <option value="dark">어두운 테마</option>
            <option value="light">밝은 테마</option>
          </select>
        </label>
        <button id="save-settings" class="back">저장</button>
      </section>
    </div>
  `
};

function renderSubscreen(id) {
  const tpl = SUB_TEMPLATES[id];
  if (!tpl) return navigate('home');
  app.innerHTML = tpl();

  if (id === 'settings') {
    $('#save-settings').addEventListener('click', () => alert('저장 완료(예시)'));
  }
}

// 데이터 로드
async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    APP_DATA = await res.json();
  } catch (e) {
    console.warn('appData.json 로드 실패. 기본값으로 진행합니다.', e);
  }

  startClock();
  renderDock();

  const initial = location.hash.replace('#','') || 'home';
  if (initial === 'home') renderHome(); else renderSubscreen(initial);
}

init();

// 전역에서 navigate 접근 가능하도록(인라인 핸들러 용)
window.navigate = navigate;
