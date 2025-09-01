// 전체 앱 스크립트 (타이틀 추가, 단어암기 라벨 제거, 체크 아이콘 토글, 퀴즈 타이머 정리, 설명 라벨 + 기본 앱 fallback)
const $ = (sel, el=document) => el.querySelector(sel);
const app = document.getElementById('app');
const dock = document.getElementById('dock');
const DATA_URL = 'appData.json';
const VOCAB_URL = 'vocab.json';


// ▶ 홈 아이콘이 안 보일 때를 위한 기본 앱 구성 (fallback)
const DEFAULT_APPS = {
apps: [
{ id: 'vocab', title: '단어암기', emoji: '🧠' },
{ id: 'quiz', title: '퀴즈', emoji: '📝' },
{ id: 'sentence',title: '문장만들기', emoji: '🧩' },
{ id: 'review', title: '복습', emoji: '🔁' },
{ id: 'stats', title: '통계', emoji: '📊' },
{ id: 'settings',title: '설정', emoji: '⚙️' }
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
window.navigate=navigate;
