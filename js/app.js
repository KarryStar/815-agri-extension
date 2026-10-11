"use strict";
/* ================================================================
   815 农业推广学考研学习站
   数据来源：高启杰《农业推广学》(第3版) 考点大纲 / 背诵精华 / 名词解释汇总 / 2010-2026 真题
   ================================================================ */

/* ===== 工具 ===== */
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const store={get(k,d){try{return JSON.parse(localStorage.getItem("a815_"+k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem("a815_"+k,JSON.stringify(v))}catch(e){}}};
const STARS=s=>"★".repeat(s)+"☆".repeat(3-s);
const today=new Date();
const dDays=Math.ceil((new Date(2026,11,19)-today)/864e5);
$("#todayChip").textContent=(today.getMonth()+1)+"月"+today.getDate()+"日 · "+(dDays>0?"距考研 "+dDays+" 天":"考研进行中 · 加油！");

/* 题目稳定 ID：按章节+题干哈希，增删/插入题目不会导致本地进度错位 */
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=(h*33+s.charCodeAt(i))>>>0;return h.toString(36);}
const qid=(t,q)=>t+":"+hash(q.ch+"|"+q.q);

/* ===== 状态 ===== */
const state={
  view:"home",
  chapter:null, termQ:"", termFilter:"全部", termMode:"grid", termLearn:"全部",
  examYear:"全部", examType:"全部",
  quizTab:"choice", quizCh:"全部", quizDone:store.get("answers",{}),
  side:false
};

function parseHash(){
  const raw=location.hash.replace("#/","")||"home";
  const seg=raw.split("/");
  if(seg[0]==="chapter"){return {view:"chapter",chapter:+seg[1]||1};}
  return {view:seg[0],chapter:null};
}
function applyHash(){const p=parseHash();state.view=p.view;state.chapter=p.chapter;}

/* ===== 数据（分批注入） ===== */
const KP_KEY=window.DATA.kpkey, RELQ=window.DATA.relq;

/* 考点关键词映射（供真题/练习题→考点自动关联） */

/* 考点关联经典题：tag=真题(引用历年) / 原创(本站出题) */

/* ===== 考点关联 ===== */
function findKp(kws,ch){
  let best=null,bs=0;
  for(const c in KP_KEY){
    if(ch&&+c!==ch)continue;
    KP_KEY[c].forEach((arr,p)=>{
      arr.forEach(w=>{
        kws.forEach(k=>{
          if(!k||k.length<2)return;
          let s=0;
          if(k===w)s=100;
          else if(w.includes(k))s=w.length*2;
          else if(k.includes(w)&&w.length>=2)s=w.length;
          if(s>bs){bs=s;best={c:+c,p};}
        });
      });
    });
  }
  return best;
}
function kpChip(kp,extra){
  if(!kp)return "";
  const ch=DATA.chapters.find(x=>x.id===kp.c);if(!ch)return "";
  const pt=ch.points[kp.p];if(!pt)return "";
  const t=pt.t.replace(/[★☆]/g,"");
  return `<span class="kp-link" data-kp="${kp.c}-${kp.p}"><span class="dot"></span>考点：${esc(t)}${extra||""}<span class="kp-pop"><span class="kp-t">${esc(ch.no)} ${esc(t)}</span><span class="kp-q">${esc((pt.c||"").slice(0,72))}…</span><span class="kp-go">点击进入该考点 →</span></span></span>`;
}
function goKp(c,p){
  closeSide();
  state.chapter=c;
  const target="#/chapter/"+c;
  if(location.hash===target){render();}else{location.hash=target;}
  setTimeout(()=>{
    const el=$("#kp-"+c+"-"+p);
    if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.classList.add("flash");setTimeout(()=>el.classList.remove("flash"),1800);}
  },90);
}

/* ===== 渲染 ===== */
const NAV_MAIN=[
  {k:"home",t:"首页",icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>'},
  {k:"chapters",t:"章节学习",icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>'},
  {k:"terms",t:"名词解释",icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6M9 16h4M7 3h14v18H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" stroke-linejoin="round"/></svg>'},
  {k:"exams",t:"历年真题",icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18M3 9h18M3 13h18M3 17h12"/><circle cx="19" cy="17" r="2.5"/></svg>'},
  {k:"quiz",t:"自测练习",icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'}
];

function nav(){
  const done=store.get("chDone",{});
  $("#sideNav").innerHTML=`
    <div class="grp">主菜单</div>
    ${NAV_MAIN.map(m=>`<div class="item ${state.view===m.k?"on":""}" data-go="${m.k}">${m.icon}<span>${m.t}</span></div>`).join("")}
    <div class="grp">章节导航 · ${DATA.chapters.length} 章</div>
    ${DATA.chapters.map(c=>`<div class="item ${state.view==="chapter"&&state.chapter===c.id?"on":""}" data-go="chapter" data-id="${c.id}"><span class="no">${String(c.id).padStart(2,"0")}</span><span>${c.title}</span>${done[c.id]?'<span class="done">✓</span>':`<span class="star">${c.weight}</span>`}</div>`).join("")}`;
  $("#tabbar").innerHTML=NAV_MAIN.map(m=>`<a href="#/${m.k}" class="${state.view===m.k?"on":""}">${m.icon}<span>${m.t}</span></a>`).join("");
  updateProg();
}
function updateProg(){
  const done=store.get("chDone",{});const n=Object.keys(done).length;const total=DATA.chapters.length;
  $("#progBar").style.width=(n/total*100)+"%";
  $("#progTxt").textContent=`已完成 ${n} 章 · 共 ${total} 章 · ${(n/total*100)|0}%`;
}

/* ===== 视图容器 ===== */
const charts=[];
/* 视图身份：切换页面/章节/筛选时才回到顶部；答题、标记等局部交互不改变滚动位置 */
function viewKey(){
  const v=state.view;
  if(v==="chapter")return "chapter/"+state.chapter;
  if(v==="terms")return "terms/"+state.termFilter+"/"+state.termLearn+"/"+state.termMode;
  if(v==="exams")return "exams/"+state.examYear+"/"+state.examType;
  if(v==="quiz")return "quiz/"+state.quizTab+"/"+state.quizCh;
  return v;
}
let lastViewKey="";
function render(){
  charts.forEach(c=>{try{c.dispose()}catch(_){}});charts.length=0;
  const v=state.view;
  let html="";
  if(v==="home")html=viewHome();
  else if(v==="chapters")html=viewChapters();
  else if(v==="chapter")html=viewChapter();
  else if(v==="terms")html=viewTerms();
  else if(v==="exams")html=viewExams();
  else if(v==="quiz")html=viewQuiz();
  else html=viewHome();
  $("#content").innerHTML=html;
  $("#topTitle").textContent=titleOf(v);
  $("#topCrumb").textContent=crumbOf(v);
  nav();
  bind();
  const k=viewKey();
  if(k!==lastViewKey)window.scrollTo({top:0,left:0});
  lastViewKey=k;
  $("#fab").style.display=(window.scrollY>400&&window.innerWidth<=760)?"flex":"none";
  if(v==="home")setTimeout(drawCharts,30);
}
function titleOf(v){
  if(v==="home")return"首页";
  if(v==="chapters")return"章节学习";
  if(v==="chapter")return"第 "+state.chapter+" 章";
  if(v==="terms")return"名词解释 · "+DATA.terms.length+" 个";
  if(v==="exams")return"历年真题";
  if(v==="quiz")return"自测练习";
  return"首页";
}
function crumbOf(v){
  if(v==="chapter"){const c=DATA.chapters.find(x=>x.id===state.chapter);return c?c.no+" · "+c.title:"";}
  if(v==="terms")return"点击卡片翻面背诵";
  if(v==="quiz")return"即做即判 · 错题有解析";
  return"";
}

/* ===== 首页 ===== */
function viewHome(){
  const done=store.get("chDone",{});const n=Object.keys(done).length;
  const nYears=new Set(DATA.exams.map(e=>e.y)).size;
  const nQuiz=DATA.quiz.choice.length+DATA.quiz.judge.length+DATA.quiz.fill.length+DATA.quiz.essay.length;
  return `
  <div class="hero">
    <svg class="field" width="420" height="300" viewBox="0 0 420 300"><path d="M0 260 Q105 180 210 230 T420 210 V300 H0 Z" fill="#4C8C6A"/><path d="M0 280 Q105 210 210 250 T420 240 V300 H0 Z" fill="#2E6B4F"/><path d="M40 300 V210 c2-14 4-26 6-36 M120 300 v-80 c2-12 4-24 6-34 M200 300 v-60 c2-10 3-18 5-26 M290 300 v-70 c2-11 4-20 6-28 M360 300 v-60 c2-8 4-16 5-22" stroke="#C9963D" stroke-width="3" fill="none"/></svg>
    <div class="tag-line">JXAU · POSTGRADUATE EXAM · 815</div>
    <h1>农业推广学，零基础<br>也能系统上岸</h1>
    <p>面向完全没学过本学科的 27 考研考生：以江西农业大学考纲为主线，把 ${DATA.chapters.length} 章考点、${DATA.terms.length} 个名词解释、${nYears} 年真题、${nQuiz}+ 自测练习整理成一套可背诵、可刷题、可检验的学习系统。</p>
    <div class="hero-btns">
      <button class="btn pri" data-go="chapter" data-id="1">开始第一课 · 导论</button>
      <button class="btn ghost" data-go="quiz">立即自测</button>
      <button class="btn ghost" data-go="exams">看历年真题</button>
    </div>
  </div>

  <div class="stat-row">
    <div class="stat-box"><div class="n">${DATA.chapters.length}</div><div class="l">核心章节（考纲全章节）</div></div>
    <div class="stat-box gold"><div class="n">${DATA.terms.length}</div><div class="l">名词解释（含★考频标记）</div></div>
    <div class="stat-box red"><div class="n">${DATA.exams.length} 题</div><div class="l">真题收录（2010–2026）</div></div>
    <div class="stat-box"><div class="n">${DATA.quiz.choice.length+DATA.quiz.judge.length+DATA.quiz.fill.length+DATA.quiz.essay.length}+</div><div class="l">自测练习（选择/判断/填空/简答）</div></div>
  </div>

  <div class="section-t"><span class="en">零基础备考路线</span><span class="sub">按 4 阶段推进，每阶段目标明确</span></div>
  <hr class="divider">
  <div class="timeline">
    <div class="tl-item"><div class="t">阶段一<br>3–5 周</div><div class="axis"><span class="dot"></span></div><div class="c"><div class="tt">搭框架 · 通读教材</div><div class="d">按章节顺序过一遍 18 章：先读「章节概览」掌握考点，再看知识点卡片混脸熟，不强求背诵。每天 1–2 章，标记重点章节。</div><div class="p-t">目标：建立全书知识地图</div></div></div>
    <div class="tl-item"><div class="t">阶段二<br>3–4 周</div><div class="axis"><span class="dot"></span></div><div class="c"><div class="tt">背重点 · 名词与简答</div><div class="d">攻克「名词解释」全部 76 个卡片；对 ★★★ 知识点逐条背诵（本站在知识点卡片标注了考频星）。用真题检验：先做旧年份，感受出题风格。</div><div class="p-t">目标：名词解释拿到满分</div></div></div>
    <div class="tl-item"><div class="t">阶段三<br>2–3 周</div><div class="axis"><span class="dot"></span></div><div class="c"><div class="tt">刷真题 · 限时模拟</div><div class="d">主攻近 5 年真题：名词解释、简答、论述逐题手写；计算/案例题（如推广度、S 曲线、兰州百合）重点复盘。错题回到对应章节定位知识盲区。</div><div class="p-t">目标：简答论述形成答题框架</div></div></div>
    <div class="tl-item"><div class="t">阶段四<br>考前 2 周</div><div class="axis"><span class="dot"></span></div><div class="c"><div class="tt">查漏补缺 · 全真模拟</div><div class="d">自测练习三刷（选择/判断/填空），背诵卡随机抽背；对照「高频考点」榜单逐条自查，回归考纲读教材查漏。</div><div class="p-t">目标：高频考点无盲区</div></div></div>
  </div>

  <div class="section-t"><span class="en">考试概况</span><span class="sub">以考纲与近年真题整理</span></div>
  <hr class="divider">
  <div class="grid grid-2">
    <div class="card" style="padding:16px">
      <div class="chart-box" style="border:none;box-shadow:none;padding:0"><div class="tt">近年题型分值构成</div><div class="s">以 2025 年真题题型结构为代表（回忆版整理）</div><div class="cv" id="chartType"></div></div>
    </div>
    <div class="card" style="padding:16px">
      <div class="chart-box" style="border:none;box-shadow:none;padding:0"><div class="tt">高频考点 TOP 12</div><div class="s">按 2010–2026 真题出现频次统计</div><div class="cv" id="chartHot"></div></div>
    </div>
  </div>

  <div class="section-t"><span class="en">高分策略</span><span class="sub">从真题规律里总结</span></div>
  <hr class="divider">
  <div class="alert gold"><div class="ic">▲</div><div><b>规律一：名词解释重复率高。</b>农业推广、农业推广沟通、创新的采用与扩散、农业科技成果、农业推广经营服务、电子农务等几乎年年出现，76 个名词必须全背。</div></div>
  <div class="alert green" style="margin-top:10px"><div class="ic">◆</div><div><b>规律二：重点章节高度集中。</b>第二、三、四、五、七、九、十二、十六章为论述题高发区，务必把「简答/论述要点」逐条吃透。</div></div>
  <div class="alert red" style="margin-top:10px"><div class="ic">●</div><div><b>规律三：近年新增计算与案例。</b>2023 年起出现推广度计算、品种加权评分、案例材料分析（兰州百合）。复习时注意公式（推广度/推广率/推广指数）与「试验→示范→推广」程序的应用。</div></div>

  <div class="section-t"><span class="en">全部章节</span><span class="sub">${n}/${DATA.chapters.length} 章已完成 · 点击进入学习</span></div>
  <hr class="divider">
  <div class="ch-grid">
    ${DATA.chapters.map(c=>`
      <div class="ch-card ${done[c.id]?"done":""}" data-go="chapter" data-id="${c.id}">
        <span class="chk">✓</span>
        <div class="no">${c.no}</div>
        <div class="tt">${esc(c.title)}</div>
        <div class="meta"><span class="st">${c.weight}</span><span>${c.points.length} 个考点</span></div>
      </div>`).join("")}
  </div>
  <div style="height:10px"></div>`;
}

/* ===== 章节列表 ===== */
function viewChapters(){
  const done=store.get("chDone",{});
  return `
  <div class="section-t"><span class="en">章节学习</span><span class="sub">按考纲顺序，★ 为真题考频</span></div>
  <hr class="divider">
  <div class="ch-grid">
    ${DATA.chapters.map(c=>`
      <div class="ch-card ${done[c.id]?"done":""}" data-go="chapter" data-id="${c.id}">
        <span class="chk">✓</span>
        <div class="no">${c.no} · 建议 ${c.mins} 分钟</div>
        <div class="tt">${esc(c.title)}</div>
        <div class="meta"><span class="st">考频 ${c.weight}</span><span>难度 ${"●".repeat(c.diff)}${"○".repeat(5-c.diff)}</span></div>
        <div class="meta" style="margin-top:6px"><span class="badge green">${c.points.length} 考点</span><span class="badge gold">${(c.exam||[]).length} 年真题涉及</span></div>
      </div>`).join("")}
  </div>
  <div class="section-t"><span class="en">学习建议</span></div>
  <hr class="divider">
  <div class="details"><summary>优先顺序怎么排？</summary><div class="body">★★★★★ 章节（第一、二、三、四、五、七、九章）务必精读+背诵；★★★ 章节（六、八、十、十一、十二、十三、十四、十五、十六、十八）掌握常考点；★★ 章节（十七）了解政策法规框架即可。<br><br>复习顺序建议：①第一~四章（理论基石）→ ②五、七、九章（方法与成果，论述高发）→ ③十二、十三、十四、十五、十六章（管理与经营）→ ④六、八、十、十一、十八章（实务与工具）→ ⑤十七章（法规，考前速记）。</div></div>
  <div class="details"><summary>每天学多久合适？</summary><div class="body">专业课建议每天 1.5–2 小时。第一轮每章 1–2 天；名词解释每天 10 个新词 + 复习旧词；第二轮起每天 1 章知识点 + 20 道练习。零基础考生总投入约 120–150 小时可达背诵熟练。</div></div>`;
}

/* ===== 章节详情 ===== */
function viewChapter(){
  const c=DATA.chapters.find(x=>x.id===state.chapter);
  if(!c)return`<div class="empty">章节不存在</div>`;
  const done=store.get("chDone",{});
  return `
  <div class="section-t"><span class="en">${c.no} ${esc(c.title)}</span><span class="sub">考频 ${c.weight} · 难度 ${"●".repeat(c.diff)}${"○".repeat(5-c.diff)} · 建议 ${c.mins} 分钟</span></div>
  <hr class="divider">
  <div class="alert green"><div class="ic">◎</div><div><b>本章考查要求：</b>${esc(c.focus)}</div></div>
  ${c.tables&&c.tables.length?`<div class="section-t" style="margin-top:26px"><span class="en">对比速记</span><span class="sub">易混淆概念一表理清</span></div><hr class="divider">${c.tables.map(t=>{const colW=100/(t.head.length);return`<div class="tbl-wrap"><table class="tbl"><colgroup>${t.head.map(()=>`<col style="width:${colW}%">`).join("")}</colgroup><thead><tr>${t.head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r=>`<tr>${r.map(cell=>`<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}).join("")}`:""}
  <div class="section-t" style="margin-top:26px"><span class="en">核心考点</span><span class="sub">★ 数量对应真题考频，红条为必背</span></div>
  <hr class="divider">
  ${c.points.map((p,pi)=>`
    <div class="pt ${p.s>=3?"s3":p.s===2?"s2":""}" id="kp-${c.id}-${pi}">
      <div class="hd"><span class="tt">${esc(p.t)}</span>${p.s>=3?`<span class="badge red">必背</span>`:p.s===2?`<span class="badge gold">重点</span>`:`<span class="badge green">了解</span>`}<span class="st">${STARS(p.s)}</span></div>
      <div class="bd">${p.c}</div>
      ${p.tip?`<div class="tip"><b>助记 · </b>${p.tip}</div>`:""}
      ${RELQ[c.id+"-"+pi]?`<div class="relq">${RELQ[c.id+"-"+pi].map((r,ri)=>`
        <span class="rq" data-rq="${c.id}-${pi}-${ri}"><span class="tg ${r.tag==="真题"?"z":"o"}">${r.tag}</span>${r.y?r.y+" · ":""}${esc(r.q.slice(0,16))}${r.q.length>16?"…":""}<span class="kp-pop"><span class="kp-t">${r.tag==="真题"?"历年真题":"本站原创题"}${r.y?" · "+r.y:""}</span><div class="kp-q">${esc(r.q)}</div><div class="kp-a">${esc(r.a)}</div></span></span>`).join("")}</div>`:""}
    </div>`).join("")}
  <div class="section-t" style="margin-top:26px"><span class="en">真题回顾</span><span class="sub">本章知识点在历年真题中的考查记录</span></div>
  <hr class="divider">
  ${c.exam?`<div class="details"><summary>${c.exam.length} 条真题记录（点击展开）</summary><div class="body">${c.exam.map(e=>`<div style="margin:8px 0"><span class="badge gold">${e.y}</span> <span class="badge ${e.type==="论述"?"red":e.type==="简答"?"blue":"green"}">${e.type}</span> <span>${e.q}</span></div>`).join("")}</div></div>`:`<div class="empty">暂无直接真题记录</div>`}
  <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
    <button class="btn pri" id="chDoneBtn">${done[c.id]?"✓ 已完成本章（点击取消）":"标记本章已完成"}</button>
    <button class="btn ghost" data-go="quiz" data-qch="第${c.id}章">去本章自测</button>
    <button class="btn ghost" data-go="chapters">返回章节列表</button>
  </div>`;
}

/* ===== 名词解释 ===== */
function viewTerms(){
  const chs=[...new Set(DATA.terms.map(t=>t.ch))];
  const q=state.termQ.trim();
  const learned=store.get("termLearned",{});
  let list=DATA.terms.filter(t=>(state.termFilter==="全部"||t.ch===state.termFilter)
    &&(state.termLearn==="全部"||(state.termLearn==="已背")===!!learned[t.n])
    &&(!q||t.n.includes(q)||(t.d&&t.d.includes(q))));
  const nLearned=Object.keys(learned).length;
  return `
  <div class="section-t"><span class="en">名词解释 · ${list.length}/${DATA.terms.length}</span><span class="sub">已背 ${nLearned} 个 · 点击卡片翻面，翻面后可标记</span></div>
  <hr class="divider">
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
    <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="termQ" placeholder="搜索名词…" value="${esc(state.termQ)}"></div>
    <div class="mode-switch" style="margin:0">
      <button class="f ${state.termMode==="grid"?"on":""}" data-mode="grid">卡片模式</button>
      <button class="f ${state.termMode==="list"?"on":""}" data-mode="list">列表模式</button>
    </div>
  </div>
  <div class="filters">
    <button class="f ${state.termFilter==="全部"?"on":""}" data-termf="全部">全部</button>
    ${chs.map(c=>`<button class="f ${state.termFilter===c?"on":""}" data-termf="${c}">${c}</button>`).join("")}
  </div>
  <div class="filters" style="margin-bottom:14px">
    <button class="f ${state.termLearn==="全部"?"on":""}" data-learnf="全部">全部</button>
    <button class="f ${state.termLearn==="未背"?"on":""}" data-learnf="未背">未背</button>
    <button class="f ${state.termLearn==="已背"?"on":""}" data-learnf="已背">已背</button>
  </div>
  ${state.termMode==="grid"?`
  <div class="term-grid">
    ${list.map(t=>{const l=learned[t.n];return`
    <div class="tcard ${l?"learned":""}" data-term="${esc(t.n)}">
      <div class="inner">
        <div class="face front">${l?'<span class="lb">已背</span>':""}<div class="cn">${esc(t.n)}</div><div class="ch">第 ${t.ch} 章 · ${STARS(t.s||2)}</div></div>
        <div class="face back"><div class="d">${esc(t.d)}</div>${t.k?`<div class="k">关键词：${esc(t.k)}</div>`:""}<button class="mark ${l?"on":""}" data-term="${esc(t.n)}">${l?"已背 ✓ 点击取消":"标记为已背"}</button></div>
      </div>
    </div>`}).join("")}
  </div>`:`
  <div class="card" style="overflow:hidden">
    ${list.map(t=>{const l=learned[t.n];return`
    <div class="pt ${l?"s2":""}" style="border-radius:0;border-left:none;border-bottom:1px solid var(--line);margin-bottom:0;cursor:pointer" data-term="${esc(t.n)}" data-locked>
      <div class="hd"><span class="tt">${esc(t.n)}</span><span class="badge green">第 ${t.ch} 章</span>${l?`<span class="badge blue">已背</span>`:""}<span class="st">${STARS(t.s||2)}</span></div>
      <div class="bd" style="${l?"":"display:none"}">${esc(t.d)}</div>
    </div>`}).join("")}
  </div>`}
  ${list.length===0?`<div class="empty">没有匹配的名词，换个关键词试试</div>`:""}`;
}

/* ===== 真题 ===== */
function viewExams(){
  const years=[...new Set(DATA.exams.map(e=>e.y))].sort((a,b)=>b-a);
  const types=["全部","名词解释","填空","选择","简答","计算","论述","案例分析","情景模拟","综合"];
  let list=DATA.exams.filter(e=>(state.examYear==="全部"||e.y===state.examYear)&&(state.examType==="全部"||e.type===state.examType));
  return `
  <div class="section-t"><span class="en">历年真题 · ${list.length} 题</span><span class="sub">2010–2026 · 回忆版为主，点击题目展开</span></div>
  <hr class="divider">
  <div class="filters" style="margin-bottom:6px">
    <button class="f ${state.examYear==="全部"?"on":""}" data-examy="全部">全部年份</button>
    ${years.map(y=>`<button class="f ${state.examYear===y?"on":""}" data-examy="${y}">${y}</button>`).join("")}
  </div>
  <div class="filters">
    ${types.map(t=>`<button class="f ${state.examType===t?"on":""}" data-examt="${t}">${t}</button>`).join("")}
  </div>
  <div class="alert gold" style="margin-bottom:16px"><div class="ic">✎</div><div><b>使用建议：</b>先盲答再展开看答案要点；论述题对照「章节核心考点」检查自己是否答全了得分点。红色标签为高分值题型。</div></div>
  ${list.length?list.map(e=>`
  <div class="exam-card" data-expand>
    <div class="hd"><span class="y">${e.y}</span><span class="type">${e.type}</span><span class="q">${esc(e.q)}</span>${kpChip(findKp(e.k||[]))}<span class="arr">▾</span></div>
    <div class="bd">${e.ans?`<div class="ans"><b>答案要点：</b>${e.ans}</div>`:`<div class="hint">答案见对应章节核心考点（${
      (()=>{const m=e.q.match(/第[一二三四五六七八九十]+章/g);return m?m[0]:"见章节导航";})()
    }）</div>`}</div>
  </div>`).join(""):`<div class="empty">该筛选条件下暂无题目</div>`}`;
}

/* ===== 练习 ===== */
const qKeep=q=>state.quizCh==="全部"||q.ch===state.quizCh;
function viewQuiz(){
  const done=state.quizDone;
  const qz=DATA.quiz;
  const chs=[...new Set([...qz.choice,...qz.judge,...qz.fill,...qz.essay].map(q=>q.ch))]
    .sort((a,b)=>+a.replace(/\D/g,"")-+b.replace(/\D/g,""));
  const tabs=[["choice",`选择 ${qz.choice.filter(qKeep).length}`],["judge",`判断 ${qz.judge.filter(qKeep).length}`],["fill",`填空 ${qz.fill.filter(qKeep).length}`],["essay","简答背诵"]];
  return `
  <div class="section-t"><span class="en">自测练习</span><span class="sub">即做即判 · 答案带解析 · 进度本地保存</span></div>
  <hr class="divider">
  <div class="mode-switch">
    ${tabs.map(t=>`<button class="f ${state.quizTab===t[0]?"on":""}" data-quiztab="${t[0]}">${t[1]}</button>`).join("")}
  </div>
  <div class="filters">
    <button class="f ${state.quizCh==="全部"?"on":""}" data-qchf="全部">全部章节</button>
    ${chs.map(c=>`<button class="f ${state.quizCh===c?"on":""}" data-qchf="${c}">${c}</button>`).join("")}
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
    <button class="btn ghost small" id="resetQuiz">重置本模块答题记录</button>
    <span class="chip" id="quizScore"></span>
  </div>
  ${state.quizTab==="choice"?quizChoice(qz.choice,done):""}
  ${state.quizTab==="judge"?quizJudge(qz.judge,done):""}
  ${state.quizTab==="fill"?quizFill(qz.fill,done):""}
  ${state.quizTab==="essay"?quizEssay(qz.essay):""}`;
}
function quizChoice(list,done){
  if(!list.some(qKeep))return`<div class="empty">本章暂无选择题</div>`;
  return `<div class="grid grid-2">${list.map((q,i)=>{
    if(!qKeep(q))return"";
    const d=done[qid("c",q)]||{};const opts=q.o.map((o,oi)=>`<button class="opt ${d.sel===oi?"sel":""} ${d.sel!==undefined?(oi===q.a?"ok":(d.sel===oi?"no":"")):""}" data-opt="${i},${oi}">${esc(o)}</button>`).join("");
    const kp=findKp([q.q+(q.o||[]).join("")],+q.ch.replace(/\D/g,""));
    return `<div class="quiz-q"><div class="q-t"><span class="tag">${q.ch}</span>${esc(q.q)}${kpChip(kp)}</div>${opts}<div class="explain ${d.sel!==undefined?"show":""}"><b>解析：</b>${d.sel!==undefined?(d.sel===q.a?"回答正确。":"回答错误，正确答案是「"+esc(q.o[q.a])+"」。"):""}${esc(q.e)}</div></div>`;
  }).join("")}</div>`;
}
function quizJudge(list,done){
  if(!list.some(qKeep))return`<div class="empty">本章暂无判断题</div>`;
  return `${list.map((q,i)=>{
    if(!qKeep(q))return"";
    const d=done[qid("j",q)]||{};
    const kp=findKp([q.q],+q.ch.replace(/\D/g,""));
    return `<div class="quiz-q"><div class="q-t"><span class="tag">${q.ch}</span>${esc(q.q)}${kpChip(kp)}</div>
    <div class="judge-btns"><button class="${d.sel===1?"sel":""}" data-judge="${i},1">对 ✓</button><button class="${d.sel===0?"sel":""}" data-judge="${i},0">错 ✗</button></div>
    <div class="explain ${d.sel!==undefined?"show":""}"><b>解析：</b>${d.sel!==undefined?(d.sel===q.a?"回答正确。":"回答错误（正确答案："+(q.a?"对":"错")+"）。"):""}${esc(q.e)}</div></div>`;}).join("")}`;
}
function quizFill(list,done){
  if(!list.some(qKeep))return`<div class="empty">本章暂无填空题</div>`;
  return `${list.map((q,i)=>{
    if(!qKeep(q))return"";
    const d=done[qid("f",q)]||{};
    const kp=findKp([q.q+q.a],+q.ch.replace(/\D/g,""));
    return `<div class="quiz-q"><div class="q-t"><span class="tag">${q.ch}</span>${esc(q.q)}${kpChip(kp)}</div>
    <input class="fill-input" data-fill="${i}" placeholder="在空白处作答…" value="${esc(d.v||"")}" ${d.ok?"disabled":""}>
    <button class="btn small ghost" style="margin-top:8px" data-check="${i}">${d.ok?"已答对":"核对答案"}</button>
    <div class="fill-ans ${d.ok?"show":""}"><b>参考答案：</b>${esc(q.a)}　<b>解析：</b>${esc(q.e)}</div></div>`;}).join("")}`;
}
function quizEssay(list){
  if(!list.some(qKeep))return`<div class="empty">本章暂无简答背诵</div>`;
  return `${list.map((q,i)=>{if(!qKeep(q))return"";const kp=findKp([q.q],+q.ch.replace(/\D/g,""));
    return `
    <div class="quiz-q"><div class="q-t"><span class="tag">${q.ch}</span>${esc(q.q)}${kpChip(kp)}</div>
    <details class="details" style="border:none;background:var(--green-50)"><summary>查看答题要点</summary><div class="body">${esc(q.a)}</div></details></div>`;}).join("")}`;
}

/* ===== 事件绑定 ===== */
function closeSide(){$("#sidebar").classList.remove("open");$("#mask").classList.remove("show");}
function bind(){
  /* 全局导航 */
  $$("[data-go]").forEach(el=>el.addEventListener("click",()=>{
    const k=el.dataset.go;
    if(el.dataset.qch)state.quizCh=el.dataset.qch;
    const target=k==="chapter"?"#/chapter/"+el.dataset.id:"#/"+k;
    if(location.hash===target){applyHash();render();}
    else location.hash=target;
    closeSide();
  }));
  $("#menuBtn").addEventListener("click",()=>{state.side=true;$("#sidebar").classList.add("open");$("#mask").classList.add("show");});
  $("#mask").addEventListener("click",closeSide);
  /* 考点关联 */
  $$(".kp-link").forEach(el=>el.addEventListener("click",e=>{
    e.stopPropagation();const[c,p]=el.dataset.kp.split("-").map(Number);goKp(c,p);
  }));
  $$(".rq").forEach(el=>el.addEventListener("click",e=>{
    e.stopPropagation();
    $$(".rq.open").forEach(o=>{if(o!==el)o.classList.remove("open");});
    el.classList.toggle("open");
  }));
  /* 回到顶部 */
  const fab=$("#fab");fab.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
  /* 章节完成 */
  const cb=$("#chDoneBtn");
  if(cb)cb.addEventListener("click",()=>{
    const done=store.get("chDone",{});
    if(done[state.chapter])delete done[state.chapter];else done[state.chapter]=1;
    store.set("chDone",done);render();
  });
  /* 名词 */
  $$(".tcard").forEach(el=>el.addEventListener("click",()=>el.classList.toggle("flip")));
  $$(".tcard .mark").forEach(el=>el.addEventListener("click",e=>{
    e.stopPropagation();
    const t=el.dataset.term,learned=store.get("termLearned",{});
    learned[t]?delete learned[t]:learned[t]=1;store.set("termLearned",learned);render();
  }));
  $$("[data-term][data-locked]").forEach(el=>el.addEventListener("click",()=>{
    const t=el.dataset.term,learned=store.get("termLearned",{});
    learned[t]?delete learned[t]:learned[t]=1;store.set("termLearned",learned);render();
  }));
  const tq=$("#termQ");
  if(tq)tq.addEventListener("input",()=>{
    state.termQ=tq.value;render();
    const el=$("#termQ");
    if(el){el.focus();const n=el.value.length;try{el.setSelectionRange(n,n)}catch(_){}}
  });
  $$("[data-termf]").forEach(el=>el.addEventListener("click",()=>{
    state.termFilter=el.dataset.termf==="全部"?"全部":+el.dataset.termf;render();
  }));
  $$("[data-learnf]").forEach(el=>el.addEventListener("click",()=>{state.termLearn=el.dataset.learnf;render();}));
  $$("[data-mode]").forEach(el=>el.addEventListener("click",()=>{state.termMode=el.dataset.mode;render();}));
  /* 真题 */
  $$("[data-examy]").forEach(el=>el.addEventListener("click",()=>{state.examYear=el.dataset.examy;render();}));
  $$("[data-examt]").forEach(el=>el.addEventListener("click",()=>{state.examType=el.dataset.examt;render();}));
  $$("[data-expand]").forEach(el=>el.addEventListener("click",()=>el.classList.toggle("open")));
  /* 练习 */
  $$("[data-qchf]").forEach(el=>el.addEventListener("click",()=>{state.quizCh=el.dataset.qchf;render();}));
  $$("[data-opt]").forEach(el=>el.addEventListener("click",()=>{
    const [i,oi]=el.dataset.opt.split(",").map(Number);
    const q=DATA.quiz.choice[i];if(!q)return;
    const done=store.get("answers",{});done[qid("c",q)]={sel:oi};store.set("answers",done);state.quizDone=done;render();
  }));
  $$("[data-judge]").forEach(el=>el.addEventListener("click",()=>{
    const [i,v]=el.dataset.judge.split(",").map(Number);
    const q=DATA.quiz.judge[i];if(!q)return;
    const done=store.get("answers",{});done[qid("j",q)]={sel:v};store.set("answers",done);state.quizDone=done;render();
  }));
  $$("[data-check]").forEach(el=>el.addEventListener("click",()=>{
    const i=+el.dataset.check;const input=document.querySelector('[data-fill="'+i+'"]');const q=DATA.quiz.fill[i];
    if(!input||!q)return;
    const done=store.get("answers",{});
    const v=(input.value||"").trim();
    if(!v)return;
    const ok=q.a.split(/[、，,;；\/]/).some(k=>v.includes(k.replace(/[（）()]/g,"")))||v===q.a;
    done[qid("f",q)]={v,ok};store.set("answers",done);state.quizDone=done;render();
  }));
  $$("[data-fill]").forEach(el=>el.addEventListener("keydown",e=>{
    if(e.key==="Enter"){const btn=document.querySelector('[data-check="'+el.dataset.fill+'"]');btn&&btn.click();}
  }));
  $$("[data-quiztab]").forEach(el=>el.addEventListener("click",()=>{state.quizTab=el.dataset.quiztab;render();}));
  const rq=$("#resetQuiz");
  if(rq)rq.addEventListener("click",()=>{
    const map={choice:"c",judge:"j",fill:"f"};
    const p=map[state.quizTab];if(!p)return;
    const done=store.get("answers",{});
    Object.keys(done).forEach(k=>{if(k.startsWith(p+":"))delete done[k];});
    store.set("answers",done);state.quizDone=done;render();
  });
  updateQuizScore();
}

/* ===== 练习统计 ===== */
function updateQuizScore(){
  const el=$("#quizScore");if(!el)return;
  const done=store.get("answers",{});
  const total=DATA.quiz.choice.length+DATA.quiz.judge.length+DATA.quiz.fill.length;
  let ok=0;
  const tally=(t,list)=>list.forEach(q=>{const d=done[qid(t,q)];if(d&&(d.ok===true||d.sel===q.a))ok++;});
  tally("c",DATA.quiz.choice);tally("j",DATA.quiz.judge);tally("f",DATA.quiz.fill);
  el.textContent=`累计答对 ${ok} / ${total}`;
}

/* ===== 图表 ===== */
window.__redraw=drawCharts;
function drawCharts(){
  const hot=$("#chartHot"),tp=$("#chartType");
  if(!hot||!tp)return;
  if(typeof echarts!=="undefined"){
    const mk=(dom,opt)=>{
      let c=echarts.getInstanceByDom(dom);
      if(!c){c=echarts.init(dom);charts.push(c);}
      c.setOption(opt,true);
      return c;
    };
    const d=hotData();
    mk(hot,{
      grid:{left:96,right:30,top:10,bottom:30},
      xAxis:{type:"value",splitLine:{lineStyle:{color:"#EEE"}},axisLabel:{color:"#5A6B60",fontSize:11}},
      yAxis:{type:"category",data:d.map(x=>x.n),axisLabel:{color:"#24312B",fontSize:11.5},axisLine:{show:false},axisTick:{show:false}},
      series:[{type:"bar",data:d.map(x=>x.v),barWidth:13,itemStyle:{borderRadius:[0,6,6,0],color:(p)=>["#2E6B4F","#C9963D","#4C8C6A","#8FBFA4"][p.dataIndex%4]},label:{show:true,position:"right",color:"#5A6B60",fontSize:11}}],
      tooltip:{trigger:"axis",axisPointer:{type:"shadow"},confine:true}
    });
    mk(tp,{
      tooltip:{trigger:"item",confine:true},
      legend:{bottom:0,itemWidth:12,itemHeight:12,textStyle:{fontSize:11,color:"#5A6B60"}},
      series:[{type:"pie",radius:["42%","68%"],center:["50%","44%"],avoidLabelOverlap:true,
        itemStyle:{borderRadius:6,borderColor:"#fff",borderWidth:2},
        label:{show:false},emphasis:{scale:true},
        data:[
          {value:30,name:"名词解释 30 分",itemStyle:{color:"#2E6B4F"}},
          {value:28,name:"填空题 28 分",itemStyle:{color:"#4C8C6A"}},
          {value:15,name:"选择题 15 分",itemStyle:{color:"#8FBFA4"}},
          {value:38,name:"简答题 38 分",itemStyle:{color:"#C9963D"}},
          {value:39,name:"论述题 39 分（含计算案例）",itemStyle:{color:"#B84A3A"}}
        ]}]});
    return;
  }
  /* 无网降级：静态可视化 */
  if(hot){const d=hotData();hot.innerHTML=`<div class="tt">高频考点 TOP 12</div><div class="s">按 2010–2026 真题出现频次统计（降级静态版）</div>`+d.map(x=>`<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px"><span style="width:130px;text-align:right;flex:none">${esc(x.n)}</span><span style="flex:1;background:#E4EFE8;border-radius:4px;overflow:hidden"><i style="display:block;height:14px;width:${Math.max(8,x.v*100/d[0].v)}%;background:${["#2E6B4F","#C9963D","#4C8C6A","#8FBFA4"][0]};border-radius:4px"></i></span><span style="width:22px">${x.v}</span></div>`).join("");}
  if(tp){tp.innerHTML=`<div class="tt">近年题型分值构成</div><div class="s">以 2025 年真题题型结构为代表（降级静态版）</div>`+[
    ["名词解释 30 分","#2E6B4F"],["填空题 28 分","#4C8C6A"],["选择题 15 分","#8FBFA4"],["简答题 38 分","#C9963D"],["论述题 39 分","#B84A3A"]
  ].map(x=>`<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px"><span style="width:110px;flex:none">${x[0]}</span><span style="flex:1;background:#E4EFE8;border-radius:4px;overflow:hidden"><i style="display:block;height:14px;width:${x[0].includes("论述")?100:x[0].includes("简答")?97:x[0].includes("名词")?77:72}%;background:${x[1]};border-radius:4px"></i></span></div>`).join("");}
}
function hotData(){
  const m={};
  DATA.exams.forEach(e=>{e.k&&e.k.forEach(k=>{m[k]=(m[k]||0)+1});});
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([n,v])=>({n,v}));
}

/* ===== 路由 ===== */
window.addEventListener("hashchange",()=>{applyHash();render();});
window.addEventListener("resize",()=>{charts.forEach(c=>{try{c.resize()}catch(_){}});});
window.addEventListener("scroll",()=>{
  const f=$("#fab");if(!f)return;
  f.style.display=(window.scrollY>400&&window.innerWidth<=760)?"flex":"none";
},{passive:true});
/* 点击弹层外任意位置或按 Esc，关闭打开的关联题弹层 */
document.addEventListener("click",e=>{
  if(e.target instanceof Element&&!e.target.closest(".rq"))
    $$(".rq.open").forEach(el=>el.classList.remove("open"));
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")$$(".rq.open").forEach(el=>el.classList.remove("open"));
});

/* 启动 */
applyHash();
render();
