// 전체 앱 스크립트 (타이틀 추가, 단어암기 라벨 제거, 체크 아이콘 토글, 퀴즈 타이머 정리, 설명 라벨)
const $ = (sel, el=document) => el.querySelector(sel);
const app = document.getElementById('app');
const dock = document.getElementById('dock');
const DATA_URL = 'appData.json';
const VOCAB_URL = 'vocab.json';


const LS_KEYS = {
learned:'vocab_learned', pos:'vocab_position', qstats:'quiz_stats', sstats:'sentence_stats'
};
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
window.navigate=navigate;
