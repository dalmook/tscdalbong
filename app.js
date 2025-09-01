const $ = (sel, el=document) => el.querySelector(sel);
const app = document.getElementById('app');
const dock = document.getElementById('dock');
const DATA_URL = 'appData.json';
const VOCAB_URL = 'vocab.json';

// ▶ 홈 아이콘이 안 보일 때를 위한 기본 앱 구성 (fallback)
const DEFAULT_APPS = {
  apps: [
    { id: 'vocab',   title: '단어암기',   emoji: '🧠' },
    { id: 'quiz',    title: '퀴즈',       emoji: '📝' },
    { id: 'sentence',title: '문장만들기', emoji: '🧩' },
    { id: 'review',  title: '복습',       emoji: '🔁' },
    { id: 'stats',   title: '통계',       emoji: '📊' },
    { id: 'settings',title: '설정',       emoji: '⚙️' }
  ],
  dock: ['vocab','quiz','sentence','settings']
};

const LS_KEYS = { learned:'vocab_learned', pos:'vocab_position', qstats:'quiz_stats', sstats:'sentence_stats' };
function loadLS(k,f){ try{const v=localStorage.getItem(k);return v?JSON.parse(v):(f??null);}catch{return f??null;} }
function saveLS(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

let APP_DATA={apps:[],dock:[]}, VOCAB_DATA=[];
let learned=loadLS(LS_KEYS.learned,{});
let pos=loadLS(LS_KEYS.pos,{chapter:'chapter1',indexByChapter:{}});
let qstats=loadLS(LS_KEYS.qstats,{}), sstats=loadLS(LS_KEYS.sstats,{});
let currentChapter = pos.chapter||'chapter1';
let currentIndex = pos.indexByChapter?.[currentChapter] ?? 0;

// 전역 타이머 중단 (퀴즈/문장 이동 시 복귀 방지)
function stopAllTimers(){
  if (QUIZ.state?.timer){ clearInterval(QUIZ.state.timer); QUIZ.state.timer=null; }
  QUIZ.active=false;
}

// 시계
function startClock(){ const el=$('#clock'); const pad=n=>String(n).padStart(2,'0'); const tick=()=>{const d=new Date(); el.textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}`}; tick(); setInterval(tick, 1000*30); }

// 라우팅
function navigate(to){
  // 다른 화면으로 갈 때 타이머/자동복귀 방지
  if (to!== 'quiz') stopAllTimers();
  if (!to || to==='home'){ history.replaceState({},'', '#home'); renderHome(); }
  else { history.pushState({},'',`#${to}`); renderSubscreen(to); }
}
window.addEventListener('popstate',()=>{ const id=location.hash.replace('#','')||'home'; if(id==='home') renderHome(); else renderSubscreen(id); });

// 홈
function renderHome(){
  const grid=document.createElement('section'); grid.className='home-grid';
  APP_DATA.apps.forEach(a=>{ const b=document.createElement('button'); b.className='app-icon'; b.setAttribute('aria-label',`${a.title} 열기`); b.innerHTML=`<span class="app-emoji">${a.emoji}</span><span class="app-title">${a.title}</span>`; b.addEventListener('click',()=>navigate(a.id)); grid.appendChild(b); });
  app.innerHTML=''; app.appendChild(grid);
}
function renderDock(){ dock.innerHTML=''; APP_DATA.dock.forEach(id=>{ const i=APP_DATA.apps.find(a=>a.id===id); if(!i) return; const b=document.createElement('button'); b.className='dock-btn'; b.setAttribute('aria-label',`${i.title} 바로가기`); b.textContent=i.emoji; b.addEventListener('click',()=>navigate(i.id)); dock.appendChild(b); }); }

// 유틸
function chapters(){ return [...new Set(VOCAB_DATA.map(v=>v.chapter))]; }
function wordsOf(ch){ return VOCAB_DATA.filter(v=>v.chapter===ch); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function sample(a,n){ const c=a.slice(); shuffle(c); return c.slice(0,n); }
function ensureLearnedChapter(ch){ if(!learned[ch]) learned[ch]={}; }
function setIndex(ch,idx){ pos.indexByChapter[ch]=idx; pos.chapter=ch; saveLS(LS_KEYS.pos,pos); }
function getIndex(ch){ return pos.indexByChapter?.[ch] ?? 0; }
function clampIndex(){ const len=wordsOf(currentChapter).length; currentIndex = len? Math.min(Math.max(0,currentIndex), len-1) : 0; }
function calcProgress(ch){ const list=wordsOf(ch); if(!list.length) return {n:0,total:0,pct:0}; const p=learned[ch]||{}; const n=list.reduce((a,w)=>a+(p[w.hanzi]?1:0),0); return {n,total:list.length,pct:Math.round(n/list.length*100)}; }
function speak(text,{rate=1.0,lang='zh-CN'}={}){ if(!text) return; const u=new SpeechSynthesisUtterance(text); u.lang=lang; u.rate=rate; const v=speechSynthesis.getVoices().find(v=>v.lang?.toLowerCase().startsWith(lang.toLowerCase())); if(v) u.voice=v; speechSynthesis.cancel(); speechSynthesis.speak(u); }
function beep(){ try{ const c=new (window.AudioContext||window.webkitAudioContext)(); const o=c.createOscillator(), g=c.createGain(); o.type='square'; o.frequency.value=440; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(.15,c.currentTime); o.start(); o.stop(c.currentTime+.15);}catch(e){} }

/* ------------ 단어암기 (라벨 제거 & 체크 아이콘 토글) ------------ */
function renderVocab(){
  const chs=chapters(); const list=wordsOf(currentChapter); clampIndex(); setIndex(currentChapter,currentIndex);
  const card=list[currentIndex]; const prog=calcProgress(currentChapter); ensureLearnedChapter(currentChapter);
  const isKnown = card ? !!learned[currentChapter][card.hanzi] : false;

  // **요청: 상단 라벨(단어암기) 제거 → sub-title 생략**
  const header = `
    <div class="sub-header">
      <button class="back" onclick="navigate('home')">← 홈</button>
      <select id="chapter-select" class="select" aria-label="챕터 선택">
        ${chs.map(ch=>`<option value="${ch}" ${ch===currentChapter?'selected':''}>${ch}</option>`).join('')}
      </select>
      <span class="pill" id="progressPill">진도: ${prog.pct}% (${prog.n}/${prog.total})</span>
    </div>`;

  app.innerHTML = `
    <div class="subscreen">
      ${header}
      <section class="card vocab-card" id="vocabCard">
        ${card?`
          <div class="front">
            <div class="hanzi">${card.hanzi}</div>
            <div class="pinyin">${card.pinyin}</div>
            <div class="example">${card.example}</div>
          </div>
          <div class="back">
            <div class="meaning">${card.meaning}</div>
            <div class="example">${card.example_ko||''}</div>
          </div>`:'<p>이 챕터에 단어가 없습니다.</p>'}
      </section>

      <div class="controls">
        <button class="btn" id="ttsWord">🔊 단어</button>
        <button class="btn" id="ttsEx">🔊 예문(0.8x)</button>
        <button class="check-btn ${isKnown?'is-checked':''}" id="btnKnown" aria-label="암기여부"></button>
      </div>

      <div class="controls">
        <button class="btn" id="prev">← 이전</button>
        <button class="btn" id="flipBtn">앞/뒤</button>
        <button class="btn" id="next">다음 →</button>
      </div>
    </div>`;

  const cardEl=$('#vocabCard'); cardEl?.addEventListener('click',()=>cardEl.classList.toggle('flipped'));
  $('#flipBtn')?.addEventListener('click',ev=>{ev.stopPropagation(); cardEl?.classList.toggle('flipped');});
  $('#prev')?.addEventListener('click',()=>{ if(currentIndex>0){ currentIndex--; setIndex(currentChapter,currentIndex); renderVocab(); }});
  $('#next')?.addEventListener('click',()=>{ const len=wordsOf(currentChapter).length; if(currentIndex<len-1){ currentIndex++; setIndex(currentChapter,currentIndex); renderVocab(); }});
  $('#chapter-select')?.addEventListener('change',e=>{ currentChapter=e.target.value; currentIndex=getIndex(currentChapter); renderVocab(); });
  if(card){
    $('#ttsWord')?.addEventListener('click',ev=>{ev.stopPropagation(); speak(card.hanzi,{rate:1.0});});
    $('#ttsEx')?.addEventListener('click',ev=>{ev.stopPropagation(); speak(card.example,{rate:0.8});});
    $('#btnKnown')?.addEventListener('click',()=>{ ensureLearnedChapter(currentChapter); const now=!!learned[currentChapter][card.hanzi]; learned[currentChapter][card.hanzi]=!now; saveLS(LS_KEYS.learned,learned); renderVocab(); });
  }
}

/* -------------------- 퀴즈 -------------------- */
const QUIZ={ state:null, active:false,
  chapterStats(ch){ const s=qstats[ch]||{attempts:0,bestScore:0,lastScore:0,correct:0,total:0,lastAt:null}; const acc=s.total?Math.round((s.correct/s.total)*100):0; return {...s,acc}; },
  renderStatsPanel(ch){ const s=this.chapterStats(ch); $('#q-stats').innerHTML=`<div>시도: <b>${s.attempts}</b>회</div><div>최고점: <b>${s.bestScore}</b></div><div>최근점: <b>${s.lastScore}</b></div><div>정확도: <b>${s.acc}%</b> (${s.correct}/${s.total})</div><div>최근일시: <b>${s.lastAt?new Date(s.lastAt).toLocaleString():'-'}</b></div>`; },
  createConfig(){ this.active=false; const chs=chapters(); const header=`<div class=\"sub-header\"><button class=\"back\" onclick=\"navigate('home')\">← 홈</button><div class=\"sub-title\">퀴즈 설정</div></div>`; app.innerHTML=`<div class=\"subscreen\">${header}<section class=\"card\"><label style=\"display:block;margin-bottom:10px;color:#9aa4b2;\">챕터</label><select id=\"q-chapter\" class=\"select\">${chs.map(ch=>`<option value=\"${ch}\">${ch}</option>`).join('')}</select><div id=\"q-stats\"></div><div class=\"note\">점수 산정: 정답 +10 / 오답 -10, 각 문항 제한시간 5초, 남은시간 합계가 가중되어 <b>최종점수 = (정답·오답 합계 점수) × (남은시간 합계)</b></div><div style=\"height:12px\"></div><label style=\"display:block;margin-bottom:10px;color:#9aa4b2;\">모드</label><label class=\"pill\"><input type=\"radio\" name=\"qmode\" value=\"hz2ko\" checked> 한자→뜻</label><label class=\"pill\" style=\"margin-left:8px;\"><input type=\"radio\" name=\"qmode\" value=\"ko2hz\"> 뜻→한자</label><div style=\"height:14px\"></div><button class=\"btn\" id=\"q-start\">시작 (20문항)</button></section></div>`; const chSel=$('#q-chapter'); const update=()=>this.renderStatsPanel(chSel.value); chSel.addEventListener('change',update); update(); $('#q-start').addEventListener('click',()=>{ const chapter=chSel.value; const mode=[...document.querySelectorAll('input[name="qmode"]')].find(i=>i.checked).value; this.start({chapter,mode}); }); },
  buildQuestions(ch,mode){ const pool=wordsOf(ch); const items=pool.length<=20?shuffle(pool.slice()):sample(pool,20); return items.map(t=>{ const wrong=pool.filter(v=>v!==t); const ds=sample(wrong,Math.min(3,wrong.length)); let prompt,correct,options; if(mode==='hz2ko'){ prompt=`${t.hanzi} [${t.pinyin}]`; correct=t.meaning; options=shuffle([correct,...ds.map(d=>d.meaning)]).slice(0,4);} else { prompt=t.meaning; correct=t.hanzi; options=shuffle([correct,...ds.map(d=>d.hanzi)]).slice(0,4);} options=Array.from(new Set(options)); while(options.length<4&&wrong.length){ const ex=sample(wrong,1)[0]; options.push(mode==='hz2ko'?ex.meaning:ex.hanzi); options=Array.from(new Set(options)); } return {target:t,prompt,correct,options:shuffle(options)}; }); },
  start({chapter,mode}){ this.active=true; const qs=this.buildQuestions(chapter,mode); this.state={chapter,mode,questions:qs,idx:0,score:0,perLimit:5,left:5,timer:null,leftoverTotal:0,locked:false,correctCount:0}; this.render(); this.tickStart(); },
  tickStart(){ if(!this.active) return; const s=this.state; clearInterval(s.timer); s.left=s.perLimit; s.timer=setInterval(()=>{ if(!this.active){clearInterval(s.timer);return;} s.left-=1; this.updateTimer(); if(s.left<=0){ clearInterval(s.timer); this.timeUp(); } },1000); this.updateTimer(); },
  updateTimer(){ const el=$('#q-timer'); if(el&&this.state) el.textContent=`${this.state.left}s`; },
  timeUp(){ if(!this.active) return; const s=this.state; if(!s||s.locked) return; s.locked=true; s.score-=10; beep(); this.reveal(null); setTimeout(()=> this.next(), 700); },
  choose(val){ if(!this.active) return; const s=this.state; if(!s||s.locked) return; s.locked=true; const q=s.questions[s.idx]; const ok=(val===q.correct); if(ok){ s.score+=10; s.leftoverTotal+=s.left; s.correctCount+=1; speak(q.target.hanzi,{rate:1.0}); } else { s.score-=10; beep(); } clearInterval(s.timer); this.reveal(val); setTimeout(()=> this.next(), 650); },
  reveal(chosen){ const q=this.state.questions[this.state.idx]; const btns=[...document.querySelectorAll('.q-option')]; btns.forEach(b=>{ const v=b.getAttribute('data-val'); if(v===q.correct) b.classList.add('opt-correct'); if(chosen && v===chosen && v!==q.correct) b.classList.add('opt-wrong'); b.disabled=true; }); },
  next(){ if(!this.active) return; const s=this.state; s.idx++; if(s.idx>=s.questions.length) return this.finish(); s.locked=false; this.render(); this.tickStart(); },
  finish(){ this.active=false; const s=this.state; const base=s.score; const finalScore=base*Math.max(0,s.leftoverTotal); clearInterval(s.timer); const ch=s.chapter; const prev=qstats[ch]||{attempts:0,bestScore:0,lastScore:0,correct:0,total:0,lastAt:null}; const tq=s.questions.length; const ns={attempts:prev.attempts+1,bestScore:Math.max(prev.bestScore||0,finalScore),lastScore:finalScore,correct:(prev.correct||0)+s.correctCount,total:(prev.total||0)+tq,lastAt:new Date().toISOString()}; qstats[ch]=ns; saveLS(LS_KEYS.qstats,qstats); app.innerHTML=`<div class="subscreen"><div class="sub-header"><button class="back" onclick="QUIZ.createConfig()">← 설정</button><div class="sub-title">결과</div><span class="pill">정확도 이번: ${Math.round((s.correctCount/tq)*100)}%</span></div><section class="card"><p>챕터: <b>${s.chapter}</b> / 모드: <b>${s.mode==='hz2ko'?'한자→뜻':'뜻→한자'}</b></p><p>기본점수: <b>${base}</b></p><p>남은시간 합계: <b>${s.leftoverTotal}s</b></p><hr style=\"opacity:.2; margin:10px 0;\"><p style=\"font-size:20px; font-weight:800;\">최종 점수: <span>${finalScore}</span></p><div style=\"height:12px\"></div><div id=\"q-stats\" class=\"card\" style=\"margin-bottom:12px\"></div><button class=\"btn\" id=\"q-retry\">다시 풀기</button><button class=\"btn\" onclick=\"navigate('home')\" style=\"margin-left:8px;\">홈으로</button></section></div>`; $('#q-retry')?.addEventListener('click',()=>this.start({chapter:s.chapter,mode:s.mode})); const box=$('#q-stats'); if(box){ const t=this.chapterStats(ch); box.outerHTML=`<div id=\"q-stats\" class=\"card\" style=\"margin-bottom:12px\"> <div>누적 시도: <b>${t.attempts}</b>회</div><div>최고점: <b>${t.bestScore}</b></div><div>최근점: <b>${t.lastScore}</b></div><div>누적 정확도: <b>${t.acc}%</b> (${t.correct}/${t.total})</div><div>최근일시: <b>${t.lastAt?new Date(t.lastAt).toLocaleString():'-'}</b></div></div>`; }
  },
  render(){ const s=this.state, q=s.questions[s.idx]; const header=`<div class=\"sub-header\"><button class=\"back\" onclick=\"QUIZ.createConfig()\">← 설정</button><div class=\"sub-title\">퀴즈 (${s.idx+1}/${s.questions.length})</div><span class=\"pill\">점수: ${s.score}</span><span class=\"pill\" id=\"q-timer\">${s.left}s</span></div>`; app.innerHTML=`<div class=\"subscreen\">${header}<section class=\"card\"><div class=\"q-prompt\" style=\"font-size:22px; font-weight:800;\">${q.prompt}</div><div class=\"q-options\">${q.options.map(o=>`<button class=\"btn q-option\" data-val=\"${o}\">${o}</button>`).join('')}</div></section></div>`; [...document.querySelectorAll('.q-option')].forEach(b=> b.addEventListener('click',()=>this.choose(b.getAttribute('data-val')))); }
};

/* -------------------- 문장만들기 -------------------- */
const SENT={ state:null,
  chapterStats(ch){ return sstats[ch]||{attempts:0,bestScore:0,lastScore:0,lastAt:null}; },
  renderStatsPanel(ch){ const s=this.chapterStats(ch); $('#s-stats').innerHTML=`<div>시도: <b>${s.attempts||0}</b>회</div><div>최고점: <b>${s.bestScore||0}</b></div><div>최근점: <b>${s.lastScore||0}</b></div><div>최근일시: <b>${s.lastAt?new Date(s.lastAt).toLocaleString():'-'}</b></div>`; },
  createConfig(){ const chs=chapters(); const header=`<div class=\"sub-header\"><button class=\"back\" onclick=\"navigate('home')\">← 홈</button><div class=\"sub-title\">문장만들기 설정</div></div>`; app.innerHTML=`<div class=\"subscreen\">${header}<section class=\"card\"><label style=\"display:block;margin-bottom:10px;color:#9aa4b2;\">챕터</label><select id=\"s-chapter\" class=\"select\">${chs.map(ch=>`<option value=\"${ch}\">${ch}</option>`).join('')}</select><div id=\"s-stats\"></div><div class=\"note\">점수 산정: <b>시작 1000점</b>에서 오답마다 <b>-10점</b>, 세트 종료 시 <b>최종점수 = 현재점수 - 전체 경과초</b> (최소 0)</div><div style=\"height:14px\"></div><button class=\"btn\" id=\"s-start\">시작 (3문제)</button></section></div>`; const sel=$('#s-chapter'); const up=()=>this.renderStatsPanel(sel.value); sel.addEventListener('change',up); up(); $('#s-start').addEventListener('click',()=>this.start({chapter:sel.value})); },
  tokenizeChinese(str){ const chars=(str||'').replace(/[\s，。！？、,.!?:；;“”\-—]/g,'').split(''); return chars.filter(Boolean); },
  pickProblems(ch){ const pool=wordsOf(ch).filter(v=>v.example&&v.example_ko); const uniq=[], seen=new Set(); for(const v of pool){ const k=v.example+'|'+v.example_ko; if(!seen.has(k)){ seen.add(k); uniq.push(v);} } const picked=sample(uniq, Math.min(3, uniq.length)); return picked.map(v=>{ const ans=this.tokenizeChinese(v.example); return {ko:v.example_ko, zh:v.example, tokens:shuffle(ans.slice()), answer:ans}; }); },
  start({chapter}){ const problems=this.pickProblems(chapter); this.state={chapter,problems,idx:0,score:1000,startAt:Date.now(),assembled:[]}; this.render(); },
  choose(tok){ const s=this.state; const cur=s.problems[s.idx]; const pos=s.assembled.length; const exp=cur.answer[pos]; const btn=[...document.querySelectorAll('.s-option')].find(b=>b.textContent===tok && !b.disabled); if(tok===exp){ s.assembled.push(tok); if(btn) btn.disabled=true; } else { s.score=Math.max(0,s.score-10); if(btn){ btn.classList.add('opt-wrong'); setTimeout(()=>btn.classList.remove('opt-wrong'),300);} beep(); return; } if(s.assembled.length===cur.answer.length){ setTimeout(()=> this.next(), 400); } else { this.updateAssembled(); } },
  undo(){ const s=this.state; const last=s.assembled.pop(); if(last!==undefined){ const btn=[...document.querySelectorAll('.s-option')].find(b=>b.textContent===last && b.disabled); if(btn) btn.disabled=false; } this.updateAssembled(); },
  updateAssembled(){ const box=$('#s-assembled'); if(box&&this.state){ box.textContent=this.state.assembled.join(''); } },
  next(){ const s=this.state; s.idx++; if(s.idx>=s.problems.length) return this.finish(); s.assembled=[]; this.render(); },
  finish(){ const s=this.state; const elapsed=Math.round((Date.now()-s.startAt)/1000); const final=Math.max(0, s.score - elapsed); const ch=s.chapter; const prev=sstats[ch]||{attempts:0,bestScore:0,lastScore:0,lastAt:null}; const ns={attempts:(prev.attempts||0)+1,bestScore:Math.max(prev.bestScore||0,final),lastScore:final,lastAt:new Date().toISOString()}; sstats[ch]=ns; saveLS(LS_KEYS.sstats,sstats); app.innerHTML=`<div class=\"subscreen\"><div class=\"sub-header\"><button class=\"back\" onclick=\"SENT.createConfig()\">← 설정</button><div class=\"sub-title\">문장만들기 결과</div><span class=\"pill\">경과: ${elapsed}s</span></div><section class=\"card\"><p>챕터: <b>${ch}</b></p><p>기본 점수(오답 반영): <b>${s.score}</b></p><p>시간 감점: <b>${elapsed}</b></p><hr style=\"opacity:.2; margin:10px 0;\"><p style=\"font-size:20px; font-weight:800;\">최종 점수: <span>${final}</span></p><div style=\"height:12px\"></div><div id=\"s-stats\" class=\"card\" style=\"margin-bottom:12px\"></div><button class=\"btn\" id=\"s-retry\">다시 풀기</button><button class=\"btn\" onclick=\"navigate('home')\" style=\"margin-left:8px;\">홈으로</button></section></div>`; $('#s-retry')?.addEventListener('click',()=>this.start({chapter:ch})); const box=$('#s-stats'); if(box){ const t=this.chapterStats(ch); box.outerHTML=`<div id=\"s-stats\" class=\"card\" style=\"margin-bottom:12px\"> <div>누적 시도: <b>${t.attempts||0}</b>회</div><div>최고점: <b>${t.bestScore||0}</b></div><div>최근점: <b>${t.lastScore||0}</b></div><div>최근일시: <b>${t.lastAt?new Date(t.lastAt).toLocaleString():'-'}</b></div></div>`; }
  },
  render(){ const s=this.state, p=s.problems[s.idx]; const header=`<div class=\"sub-header\"><button class=\"back\" onclick=\"SENT.createConfig()\">← 설정</button><div class=\"sub-title\">문장만들기 (${s.idx+1}/${s.problems.length})</div><span class=\"pill\">점수: ${s.score}</span></div>`; app.innerHTML=`<div class=\"subscreen\">${header}<section class=\"card\"><div class=\"s-prompt\">한국어: ${p.ko}</div><div id=\"s-assembled\" class=\"s-assembled\"></div><div class=\"s-options\">${p.tokens.map(t=>`<button class=\"btn s-option\">${t}</button>`).join('')}</div><div class=\"controls\" style=\"margin-top:12px\"><button class=\"btn\" id=\"s-undo\">← 되돌리기</button><button class=\"btn\" id=\"s-tts\">🔊 중국어 문장 듣기</button></div></section></div>`; $('#s-assembled').textContent=s.assembled.join(''); [...document.querySelectorAll('.s-option')].forEach(b=> b.addEventListener('click',()=>this.choose(b.textContent))); $('#s-undo').addEventListener('click',()=>this.undo()); $('#s-tts').addEventListener('click',()=>speak(p.zh,{rate:0.8})); }
};

/* -------------------- 템플릿 라우트 -------------------- */
const SUB_TEMPLATES={ vocab:()=>{renderVocab();return'';}, quiz:()=>{QUIZ.createConfig();}, sentence:()=>{SENT.createConfig();}, review:()=>{app.innerHTML=`<div class=\"subscreen\"><div class=\"sub-header\"><button class=\"back\" onclick=\"navigate('home')\">← 홈</button><div class=\"sub-title\">복습</div></div><section class=\"card\"><p>SRS 요약 준비중</p></section></div>`;}, stats:()=>{app.innerHTML=`<div class=\"subscreen\"><div class=\"sub-header\"><button class=\"back\" onclick=\"navigate('home')\">← 홈</button><div class=\"sub-title\">통계</div></div><section class=\"card\"><p>통계 시각화 준비중</p></section></div>`;}, settings:()=>{app.innerHTML=`<div class=\"subscreen\"><div class=\"sub-header\"><button class=\"back\" onclick=\"navigate('home')\">← 홈</button><div class=\"sub-title\">설정</div></div><section class=\"card\"><p>설정 화면 준비중</p></section></div>`; } };
function renderSubscreen(id){ if(id==='vocab') return renderVocab(); const tpl=SUB_TEMPLATES[id]; if(!tpl) return navigate('home'); tpl(); }

// 초기화
async function init(){
  try{
    const [ra,rv]=await Promise.all([
      fetch(DATA_URL,{cache:'no-store'}),
      fetch(VOCAB_URL,{cache:'no-store'})
    ]);
    APP_DATA = await ra.json();
    VOCAB_DATA = await rv.json();
  }catch(e){ console.warn('데이터 로드 실패, 기본 앱으로 대체합니다.', e); }

  // ▶ appData.json이 없거나 비어있으면 기본 아이콘/도크 채우기
  if (!APP_DATA || !Array.isArray(APP_DATA.apps) || APP_DATA.apps.length === 0) {
    APP_DATA = DEFAULT_APPS;
  }
  if (!Array.isArray(APP_DATA.dock) || APP_DATA.dock.length === 0) {
    APP_DATA.dock = DEFAULT_APPS.dock;
  }

  startClock();
  renderDock();

  const initial=location.hash.replace('#','')||'home';
  if(initial==='home') renderHome(); else renderSubscreen(initial);
}
init();

// 외부 접근
window.navigate=navigate;
