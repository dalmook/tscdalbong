// 전체 앱 스크립트 (타이틀 추가, 단어암기 라벨 제거, 체크 아이콘 토글, 퀴즈 타이머 정리, 설명 라벨 + 기본 앱 fallback)
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
window.navigate=navigate;
