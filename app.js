const $ = (id) => document.getElementById(id);

const views = { home: $("viewHome"), lesson: $("viewLesson"), parents: $("viewParents") };
function showView(name){ Object.values(views).forEach(v => v.classList.remove("active")); views[name].classList.add("active"); }

const LS = {
  get(k, fb){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }catch{ return fb; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};

const state = {
  lessons: [],
  todayLesson: null,
  stepIndex: 0,
  steps: ["teach","gameA","gameB","reward"],
  progress: LS.get("kudo_progress",{ streak:0, lastDay:null, doneCount:0, mastered:{}, stickers:[] }),
  settings: LS.get("kudo_settings",{ dailyLimit:5, age:5 })
};

function todayKey(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function ensureStreak(){
  const t = todayKey();
  const last = state.progress.lastDay;
  if(!last){ state.progress.lastDay = t; LS.set("kudo_progress", state.progress); return; }
  if(last === t) return;

  const lastDate = new Date(last + "T00:00:00");
  const nowDate  = new Date(t + "T00:00:00");
  const diffDays = Math.round((nowDate - lastDate) / (1000*60*60*24));
  if(diffDays !== 1) state.progress.streak = 0;
  state.progress.lastDay = t;
  LS.set("kudo_progress", state.progress);
}

function updateHomeUI(){
  ensureStreak();
  $("streakNum").textContent = String(state.progress.streak);
  $("minutesLeft").textContent = String(state.settings.dailyLimit);
  $("wordsMastered").textContent = String(Object.keys(state.progress.mastered).length);
  renderStickers();
}

function renderStickers(){
  const grid = $("stickerGrid");
  grid.innerHTML = "";
  const stickers = state.progress.stickers || [];
  for(let i=0;i<12;i++){
    const el = document.createElement("div");
    el.className = "sticker" + (stickers[i] ? "" : " locked");
    el.textContent = stickers[i] ? stickers[i] : "🔒";
    grid.appendChild(el);
  }
}

function pickTodayLesson(){
  const t = todayKey();
  let seed = 0;
  for(const ch of t) seed = (seed*31 + ch.charCodeAt(0)) >>> 0;
  const idx = seed % state.lessons.length;
  state.todayLesson = state.lessons[idx];
}

function setProgressBar(){
  const pct = Math.round((state.stepIndex) / (state.steps.length) * 100);
  $("progressBar").style.width = `${pct}%`;
}

function speakWord(word){
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function stepHint(step){
  if(step==="teach") return "Nghe và nhìn";
  if(step==="gameA") return "Nghe và chọn đúng";
  if(step==="gameB") return "Kéo thả đúng chỗ";
  if(step==="reward") return "Nhận sticker!";
  return "";
}

function renderStep(){
  const lesson = state.todayLesson;
  $("chipCategory").textContent = lesson.category;
  $("lessonWord").textContent = lesson.word;
  $("lessonHint").textContent = stepHint(state.steps[state.stepIndex]);
  setProgressBar();

  const stage = $("stage");
  stage.innerHTML = "";

  const step = state.steps[state.stepIndex];
  if(step==="teach") renderTeach(stage, lesson);
  if(step==="gameA") renderGameA(stage, lesson);
  if(step==="gameB") renderGameB(stage, lesson);
  if(step==="reward") renderReward(stage, lesson);
}

function renderTeach(stage, lesson){
  const box = document.createElement("div");
  box.className = "bigObject";
  box.innerHTML = `<div class="emoji">${lesson.emoji}</div><div class="sub">Replay để nghe: <b>${lesson.word}</b></div>`;
  stage.appendChild(box);

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = "Replay 2 lần rồi bấm Next 🙂";
  stage.appendChild(toast);

  setTimeout(() => speakWord(lesson.word), 350);
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playDing(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    o.stop(ctx.currentTime + 0.13);
  }catch{}
}
function playBuzz(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "square"; o.frequency.value = 140;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.10);
    o.stop(ctx.currentTime + 0.11);
  }catch{}
}

function nextStep(){
  if(state.stepIndex < state.steps.length - 1){
    state.stepIndex++;
    renderStep();
  }
}

function renderGameA(stage, lesson){
  const prompt = document.createElement("div");
  prompt.className = "toast";
  prompt.textContent = "Nghe và chạm đúng hình!";
  stage.appendChild(prompt);

  const choices = shuffle([{word:lesson.word, emoji:lesson.emoji, correct:true}, ...lesson.distractors.map(d=>({...d, correct:false}))]).slice(0,3);
  const grid = document.createElement("div");
  grid.className = "cardGrid";

  let locked = false;
  choices.forEach(c=>{
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `<div class="emoji">${c.emoji}</div><div class="label">${c.word}</div>`;
    btn.addEventListener("click", ()=>{
      if(locked) return;
      locked = true;
      if(c.correct){
        btn.classList.add("good"); playDing();
        setTimeout(()=>{ locked=false; nextStep(); }, 600);
      }else{
        btn.classList.add("bad"); playBuzz();
        setTimeout(()=>{
          const correctBtn = [...grid.querySelectorAll(".choice")].find(x=>x.textContent.includes(lesson.word));
          if(correctBtn) correctBtn.classList.add("good");
          locked = false;
        }, 600);
      }
    });
    grid.appendChild(btn);
  });

  stage.appendChild(grid);
  setTimeout(()=>speakWord(lesson.word), 350);
}

function renderGameB(stage, lesson){
  const prompt = document.createElement("div");
  prompt.className = "toast";
  prompt.textContent = `Kéo đúng: ${lesson.word}`;
  stage.appendChild(prompt);

  const wrap = document.createElement("div");
  wrap.className = "dragRow";

  const drop = document.createElement("div");
  drop.className = "dropZone";
  drop.innerHTML = `<div style="text-align:center"><div style="font-size:42px">🎯</div><div class="muted">Thả <b>${lesson.word}</b> vào đây</div></div>`;

  drop.addEventListener("dragover", (e)=>{ e.preventDefault(); drop.classList.add("active"); });
  drop.addEventListener("dragleave", ()=>drop.classList.remove("active"));
  drop.addEventListener("drop", (e)=>{
    e.preventDefault(); drop.classList.remove("active");
    const data = e.dataTransfer.getData("text/plain");
    if(data === lesson.word){
      drop.innerHTML = `<div style="text-align:center"><div style="font-size:72px">${lesson.emoji}</div><div style="font-weight:900">Great!</div></div>`;
      playDing();
      setTimeout(()=>nextStep(), 650);
    }else{
      playBuzz();
    }
  });

  const dragBox = document.createElement("div");
  dragBox.className = "draggables";

  const items = shuffle([{word:lesson.word, emoji:lesson.emoji}, ...lesson.distractors.map(d=>({word:d.word, emoji:d.emoji}))]).slice(0,4);
  items.forEach(it=>{
    const d = document.createElement("div");
    d.className = "dragItem";
    d.draggable = true;
    d.textContent = it.emoji;
    d.title = it.word;
    d.addEventListener("dragstart",(e)=>{ e.dataTransfer.setData("text/plain", it.word); });
    dragBox.appendChild(d);
  });

  wrap.appendChild(drop);
  wrap.appendChild(dragBox);
  stage.appendChild(wrap);

  setTimeout(()=>speakWord(lesson.word), 350);
}

function awardSticker(lesson){
  const stickers = state.progress.stickers || [];
  if(stickers.includes(lesson.emoji)) return;
  for(let i=0;i<12;i++){
    if(!stickers[i]){ stickers[i] = lesson.emoji; break; }
  }
  state.progress.stickers = stickers;
  LS.set("kudo_progress", state.progress);
}

function finishLesson(){
  const id = state.todayLesson.id;
  state.progress.doneCount = (state.progress.doneCount||0) + 1;
  state.progress.mastered[id] = true;

  const t = todayKey();
  const completedKey = "kudo_completed_" + t;
  if(!LS.get(completedKey, false)){
    state.progress.streak = (state.progress.streak||0) + 1;
    LS.set(completedKey, true);
  }
  LS.set("kudo_progress", state.progress);
}

function renderReward(stage, lesson){
  const box = document.createElement("div");
  box.className = "bigObject";
  box.innerHTML = `<div class="emoji">🎉</div><div class="sub">Hoàn thành! Nhận sticker: <b>${lesson.emoji}</b></div>`;
  stage.appendChild(box);

  const btn = document.createElement("button");
  btn.className = "btn primary big";
  btn.textContent = "Nhận sticker & về Home";
  btn.addEventListener("click", ()=>{
    awardSticker(lesson);
    finishLesson();
    showView("home");
    updateHomeUI();
  });
  stage.appendChild(btn);
}

function syncParentsUI(){
  $("dailyLimit").value = String(state.settings.dailyLimit||5);
  $("age").value = String(state.settings.age||5);
  $("pStreak").textContent = String(state.progress.streak||0);
  $("pDone").textContent = String(state.progress.doneCount||0);
  $("pLast").textContent = state.progress.lastDay || "—";
}

function wireUI(){
  $("btnStart").addEventListener("click", ()=>{
    state.stepIndex = 0;
    showView("lesson");
    renderStep();
  });
  $("btnReplay").addEventListener("click", ()=> speakWord(state.todayLesson.word));
  $("btnNext").addEventListener("click", ()=> nextStep());

  $("btnParents").addEventListener("click", ()=>{ showView("parents"); syncParentsUI(); });
  $("btnCloseParents").addEventListener("click", ()=>{ showView("home"); updateHomeUI(); });

  $("btnSaveParents").addEventListener("click", ()=>{
    state.settings.dailyLimit = Number($("dailyLimit").value);
    state.settings.age = Number($("age").value);
    LS.set("kudo_settings", state.settings);
    showView("home");
    updateHomeUI();
  });

  $("btnReset").addEventListener("click", ()=>{
    if(confirm("Reset toàn bộ tiến độ?")){
      localStorage.clear();
      location.reload();
    }
  });
}

async function loadLessons(){
  const res = await fetch("lessons.json");
  state.lessons = await res.json();
  pickTodayLesson();
}

(async function init(){
  wireUI();
  state.settings = LS.get("kudo_settings", state.settings);
  state.progress = LS.get("kudo_progress", state.progress);
  await loadLessons();
  updateHomeUI();
  showView("home");
})();