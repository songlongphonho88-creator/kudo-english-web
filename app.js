/* Kudo English – PRO+ v2
   - Topic playlist + level filter
   - Learn (media) -> Quiz
   - Library: search + play any word
   - Parents report: streak, learned, wrong stats
*/

const $ = (id) => document.getElementById(id);
const STORE_KEY = "kudo_english_state_v2";

const DEFAULT_STATE = {
  learnedIds: [],
  lastLearnDate: null,
  streak: 0,
  goalMin: 5,
  voiceURI: "",
  ttsRate: 0.9,

  stickersUnlocked: 0,

  // daily session
  sessionMinutesToday: 0,

  // topic progress
  lastTopic: "all",
  lastLevel: "all",

  // analytics
  wrongCounts: {},     // { wordId: number }
  correctCounts: {},   // { wordId: number }
};

let lessons = [];
let state = loadState();

let current = null;
let replayCount = 0;

let voices = [];
const STICKER_TOTAL = 12;
const STICKER_MILESTONES = [1,2,3,5,8,12,16,20,25,30,40,50];
const stickerIcons = ["🐵","⭐","🚀","🍎","🎈","🏆","🌈","🧸","🍌","🎮","🧠","🎁"];

init();

async function init(){
  bindUI();
  renderStickerGrid();
  await loadLessons();
  initSpeech();

  updateDailyCounters();
  populateTopicSelects();
  applySavedFilters();
  renderDashboard();
  renderLibrary();
}

/* ---------- DATA ---------- */
async function loadLessons(){
  try{
    const res = await fetch("./lessons.json", { cache:"no-store" });
    if(!res.ok) throw new Error("Cannot fetch lessons.json");
    lessons = await res.json();
    lessons = Array.isArray(lessons) ? lessons.filter(Boolean) : [];
    $("dashHint").textContent = lessons.length ? `Đã nạp ${lessons.length} từ.` : "⚠️ lessons.json rỗng.";
  } catch(e){
    lessons = [];
    $("dashHint").textContent = "⚠️ Không tải được lessons.json.";
  }
}

function normalizeTopic(t){
  if(!t) return "other";
  return String(t).trim().toLowerCase();
}

function getTopics(){
  const set = new Set(lessons.map(l => normalizeTopic(l.topic || l.category)));
  const topics = Array.from(set).filter(Boolean).sort();
  topics.unshift("all");
  return topics;
}

function filterLessonsBy(topic, level){
  const t = normalizeTopic(topic);
  const lv = String(level || "all");
  return lessons.filter(l => {
    const lt = normalizeTopic(l.topic || l.category);
    const okT = (t === "all") || (lt === t);
    const okL = (lv === "all") || (String(l.level || 1) === lv);
    return okT && okL;
  });
}

/* ---------- UI BIND ---------- */
function bindUI(){
  $("btnStart").addEventListener("click", startFlow);

  $("btnReplay").addEventListener("click", () => {
    if(!current) return;
    speak(current.word);
    replayCount++;
    renderCoach();
  });

  $("btnNext").addEventListener("click", () => {
    if(!current) return;
    showQuizForCurrent();
  });

  $("btnBackDash").addEventListener("click", () => {
    showDashboard();
  });

  $("btnQuizReplay").addEventListener("click", () => {
    if(!current) return;
    speak(current.word);
  });

  $("btnContinue").addEventListener("click", () => {
    nextWord();
  });

  $("topicSelect").addEventListener("change", () => {
    state.lastTopic = $("topicSelect").value;
    saveState();
    renderDashboard();
  });

  $("levelSelect").addEventListener("change", () => {
    state.lastLevel = $("levelSelect").value;
    saveState();
    renderDashboard();
  });

  // Library
  $("btnLibrary").addEventListener("click", openLibrary);
  $("btnCloseLibrary").addEventListener("click", closeLibrary);
  $("libraryBackdrop").addEventListener("click", closeLibrary);
  $("libTopicSelect").addEventListener("change", renderLibrary);
  $("libSearch").addEventListener("input", renderLibrary);

  // Parents
  $("btnParents").addEventListener("click", openParents);
  $("btnCloseModal").addEventListener("click", closeParents);
  $("modalBackdrop").addEventListener("click", closeParents);

  $("btnSaveSettings").addEventListener("click", () => {
    state.goalMin = Number($("goalSelect").value || 5);
    state.voiceURI = $("voiceSelect").value || "";
    state.ttsRate = Number($("rateRange").value || 0.9);
    saveState();
    renderDashboard();
    closeParents();
  });

  $("btnReset").addEventListener("click", () => {
    const ok = confirm("Reset toàn bộ tiến trình? (streak, từ đã học, sticker, thống kê sai)");
    if(!ok) return;
    const keep = { goalMin: state.goalMin, voiceURI: state.voiceURI, ttsRate: state.ttsRate };
    state = { ...DEFAULT_STATE, ...keep, lastTopic:"all", lastLevel:"all" };
    saveState();
    renderStickerGrid();
    renderDashboard();
    showDashboard();
    alert("Đã reset xong.");
  });
}

/* ---------- DASHBOARD ---------- */
function showDashboard(){
  $("dashCard").classList.remove("hidden");
  $("stickerCard").classList.remove("hidden");
  $("lessonCard").classList.add("hidden");
  $("quizCard").classList.add("hidden");
}

function renderDashboard(){
  $("statStreak").textContent = String(state.streak || 0);
  $("statGoalMin").textContent = String(state.goalMin || 5);
  $("statLearned").textContent = String(state.learnedIds?.length || 0);

  const learned = state.learnedIds?.length || 0;
  const total = lessons.length || 0;

  const minToday = Number(state.sessionMinutesToday || 0).toFixed(1);
  const goal = Number(state.goalMin || 5);

  // Topic progress info
  const topic = $("topicSelect").value || state.lastTopic || "all";
  const level = $("levelSelect").value || state.lastLevel || "all";
  const pool = filterLessonsBy(topic, level);
  const learnedSet = new Set(state.learnedIds);
  const learnedInPool = pool.filter(l => learnedSet.has(l.id)).length;

  $("dashHint").textContent =
    total
      ? `Tổng: ${learned}/${total} từ • Hôm nay: ~${minToday}/${goal} phút • Chủ đề: ${learnedInPool}/${pool.length}`
      : `Hôm nay: ~${minToday}/${goal} phút`;

  renderStickerGrid();
}

/* ---------- TOPICS ---------- */
function populateTopicSelects(){
  const topics = getTopics();

  // dashboard select
  $("topicSelect").innerHTML = topics.map(t => `<option value="${t}">${t === "all" ? "Tất cả chủ đề" : t}</option>`).join("");
  // library select
  $("libTopicSelect").innerHTML = topics.map(t => `<option value="${t}">${t === "all" ? "Tất cả chủ đề" : t}</option>`).join("");
}

function applySavedFilters(){
  $("topicSelect").value = state.lastTopic || "all";
  $("levelSelect").value = state.lastLevel || "all";
  $("libTopicSelect").value = state.lastTopic || "all";
}

/* ---------- FLOW ---------- */
function startFlow(){
  if(!lessons.length) return;

  updateDailyCounters();

  state.lastTopic = $("topicSelect").value || "all";
  state.lastLevel = $("levelSelect").value || "all";
  saveState();

  current = pickNextLesson(state.lastTopic, state.lastLevel);
  replayCount = 0;

  showLessonCard(current);
  speak(current.word);
}

function nextWord(){
  current = pickNextLesson(state.lastTopic, state.lastLevel);
  replayCount = 0;

  showLessonCard(current);
  speak(current.word);
}

function pickNextLesson(topic, level){
  const pool = filterLessonsBy(topic, level);
  const source = pool.length ? pool : lessons;

  const learnedSet = new Set(state.learnedIds);
  const unlearned = source.filter(l => l?.id && !learnedSet.has(l.id));

  const finalPool = unlearned.length ? unlearned : source;
  const idx = Math.floor(Math.random() * finalPool.length);
  return finalPool[idx];
}

/* ---------- LESSON UI ---------- */
function showLessonCard(lesson){
  $("dashCard").classList.add("hidden");
  $("stickerCard").classList.add("hidden");
  $("quizCard").classList.add("hidden");
  $("lessonCard").classList.remove("hidden");

  $("pillCategory").textContent = `${lesson.category || "Category"} • ${normalizeTopic(lesson.topic || lesson.category)} • L${lesson.level || 1}`;
  $("lessonWord").textContent = lesson.word || "Word";
  $("lessonMeta").textContent = "Nghe và nhìn";
  $("replayWord").textContent = lesson.word || "Word";

  // Media: image if exists, else emoji
  const mediaBox = $("mediaBox");
  mediaBox.innerHTML = "";
  if(lesson.image){
    const img = document.createElement("img");
    img.src = lesson.image;
    img.alt = lesson.word || "word";
    img.onerror = () => {
      mediaBox.innerHTML = `<div class="bigEmoji">${lesson.emoji || "🙂"}</div>`;
    };
    mediaBox.appendChild(img);
  } else {
    mediaBox.innerHTML = `<div class="bigEmoji">${lesson.emoji || "🙂"}</div>`;
  }

  // Example
  const ex = lesson.example ? `💬 ${lesson.example}` : "";
  $("exampleLine").textContent = ex;

  // Topic progress
  const pool = filterLessonsBy(state.lastTopic, state.lastLevel);
  const learnedSet = new Set(state.learnedIds);
  const learnedInPool = pool.filter(l => learnedSet.has(l.id)).length;
  $("topicProgress").textContent = `${learnedInPool}/${pool.length || 0}`;

  renderCoach();
}

function renderCoach(){
  const need = Math.max(0, 2 - replayCount);
  $("coachBox").textContent = need > 0
    ? `Replay ${need} lần rồi bấm Next 🙂`
    : `Tốt! Bấm Next để làm Quiz ✅`;
}

/* ---------- QUIZ ---------- */
function showQuizForCurrent(){
  $("lessonCard").classList.add("hidden");
  $("quizCard").classList.remove("hidden");

  $("quizCategory").textContent = `${current.category || "Category"} • Quiz`;
  $("quizWord").textContent = current.word || "Word";

  $("resultBox").classList.add("hidden");
  $("btnContinue").classList.add("hidden");

  buildOptions(current);
}

function buildOptions(lesson){
  const optionsEl = $("options");
  optionsEl.innerHTML = "";

  const correct = (lesson.word || "").trim();
  const distractors = Array.isArray(lesson.distractors) ? lesson.distractors : [];
  const wrongWords = distractors.map(d => (d?.word ? String(d.word).trim() : "")).filter(Boolean).slice(0,2);

  while(wrongWords.length < 2){
    const candidate = lessons[Math.floor(Math.random() * lessons.length)];
    const w = candidate?.word?.trim();
    if(w && w !== correct && !wrongWords.includes(w)) wrongWords.push(w);
    if(lessons.length < 3) break;
  }

  const optionWords = shuffle([correct, ...wrongWords]).slice(0,3);

  optionWords.forEach(word => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.textContent = word;
    btn.addEventListener("click", () => onAnswer(btn, word, correct));
    optionsEl.appendChild(btn);
  });
}

function onAnswer(buttonEl, chosen, correct){
  const all = Array.from(document.querySelectorAll(".option"));
  all.forEach(b => b.disabled = true);

  const isCorrect = chosen === correct;

  all.forEach(b => {
    if(b.textContent === correct) b.classList.add("correct");
  });
  if(!isCorrect) buttonEl.classList.add("wrong");

  const resultBox = $("resultBox");
  resultBox.classList.remove("hidden");
  resultBox.textContent = isCorrect ? "🎉 Đúng rồi! Tuyệt!" : `❌ Chưa đúng. Đáp án đúng là: ${correct}`;

  // analytics
  if(isCorrect){
    incMap(state.correctCounts, current.id);
    markLearned(current);
  } else {
    incMap(state.wrongCounts, current.id);
  }

  saveState();
  $("btnContinue").classList.remove("hidden");
}

/* ---------- PROGRESS + STICKERS ---------- */
function markLearned(lesson){
  if(!lesson?.id) return;

  if(!state.learnedIds.includes(lesson.id)){
    state.learnedIds.push(lesson.id);
  }

  // time heuristic
  state.sessionMinutesToday = Number(state.sessionMinutesToday || 0) + 0.5;

  // stickers
  const learnedCount = state.learnedIds.length;
  const unlockCount = STICKER_MILESTONES.filter(m => learnedCount >= m).length;
  if(unlockCount > state.stickersUnlocked){
    state.stickersUnlocked = unlockCount;
    renderStickerGrid();
    $("stickerHint").textContent = `🎁 Bạn vừa mở sticker #${unlockCount}!`;
  }
}

function renderStickerGrid(){
  const grid = $("stickerGrid");
  if(!grid) return;
  grid.innerHTML = "";

  const unlocked = Math.min(state.stickersUnlocked || 0, STICKER_TOTAL);
  for(let i=1;i<=STICKER_TOTAL;i++){
    const el = document.createElement("div");
    el.className = "sticker";
    el.textContent = i <= unlocked ? (stickerIcons[i-1] || "⭐") : "🔒";
    grid.appendChild(el);
  }

  const learnedCount = state.learnedIds?.length || 0;
  const nextMilestone = STICKER_MILESTONES.find(m => m > learnedCount);
  $("stickerHint").textContent = nextMilestone
    ? `Còn ${nextMilestone - learnedCount} từ nữa để mở sticker tiếp theo.`
    : `Bạn đã mở hết sticker hiện có!`;

  // update dash hint too
  renderDashboard();
}

/* ---------- DAILY STREAK ---------- */
function updateDailyCounters(){
  const today = yyyy_mm_dd(new Date());
  const last = state.lastLearnDate;

  if(!last){
    state.lastLearnDate = today;
    state.streak = 1;
    state.sessionMinutesToday = 0;
    saveState();
    return;
  }

  if(last === today) return;

  const diff = dayDiff(last, today);
  state.streak = diff === 1 ? (Number(state.streak || 0) + 1) : 1;

  state.lastLearnDate = today;
  state.sessionMinutesToday = 0;
  saveState();
}

/* ---------- LIBRARY ---------- */
function openLibrary(){
  $("libraryModal").classList.remove("hidden");
  $("libTopicSelect").value = state.lastTopic || "all";
  $("libSearch").value = "";
  renderLibrary();
}
function closeLibrary(){
  $("libraryModal").classList.add("hidden");
}
function renderLibrary(){
  const topic = $("libTopicSelect").value || "all";
  const q = ($("libSearch").value || "").trim().toLowerCase();

  const pool = filterLessonsBy(topic, "all");
  const list = pool.filter(l => {
    if(!q) return true;
    const w = (l.word || "").toLowerCase();
    const c = (l.category || "").toLowerCase();
    const t = normalizeTopic(l.topic || "");
    return w.includes(q) || c.includes(q) || t.includes(q);
  });

  const learnedSet = new Set(state.learnedIds);
  const box = $("libList");
  box.innerHTML = "";

  if(!list.length){
    box.innerHTML = `<div class="libItem"><div class="muted">Không có kết quả.</div></div>`;
    return;
  }

  list.slice(0, 120).forEach(l => {
    const item = document.createElement("div");
    item.className = "libItem";

    const left = document.createElement("div");
    left.className = "libLeft";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = learnedSet.has(l.id) ? "✅ learned" : "🆕 new";

    const title = document.createElement("div");
    title.innerHTML = `<b>${l.word}</b> <span class="muted">• ${l.category || ""}</span>`;

    left.appendChild(badge);
    left.appendChild(title);

    const btn = document.createElement("button");
    btn.className = "btn btnPrimary";
    btn.textContent = "Play";
    btn.addEventListener("click", () => {
      closeLibrary();
      // set filters to that topic for continuity
      state.lastTopic = normalizeTopic(l.topic || l.category) || "all";
      state.lastLevel = "all";
      $("topicSelect").value = state.lastTopic;
      $("levelSelect").value = "all";
      saveState();

      current = l;
      replayCount = 0;
      showLessonCard(current);
      speak(current.word);
    });

    item.appendChild(left);
    item.appendChild(btn);
    box.appendChild(item);
  });
}

/* ---------- PARENTS REPORT ---------- */
function openParents(){
  $("parentsModal").classList.remove("hidden");

  $("goalSelect").value = String(state.goalMin || 5);
  $("rateRange").value = String(state.ttsRate || 0.9);

  voices = window.speechSynthesis?.getVoices?.() || voices;
  fillVoiceSelect();

  renderReport();
}
function closeParents(){
  $("parentsModal").classList.add("hidden");
}

function renderReport(){
  const learned = state.learnedIds?.length || 0;
  const total = lessons.length || 0;

  // Top wrong words
  const wrongPairs = Object.entries(state.wrongCounts || {});
  wrongPairs.sort((a,b) => (b[1]||0) - (a[1]||0));
  const topWrong = wrongPairs.slice(0,5).map(([id,count]) => {
    const w = lessons.find(x => x.id === id)?.word || id;
    return `• ${w}: sai ${count} lần`;
  }).join("\n");

  const minToday = Number(state.sessionMinutesToday || 0).toFixed(1);
  const goal = Number(state.goalMin || 5);

  $("reportBox").textContent =
`Streak: ${state.streak || 0}
Hôm nay: ~${minToday}/${goal} phút
Tổng đã học: ${learned}/${total} từ

Top từ hay sai:
${topWrong || "• Chưa có dữ liệu sai 🙂"}`;
}

/* ---------- TTS ---------- */
function initSpeech(){
  const tryLoad = () => {
    voices = window.speechSynthesis?.getVoices?.() || [];
    if(voices.length) fillVoiceSelect();
  };
  tryLoad();
  window.speechSynthesis?.addEventListener?.("voiceschanged", tryLoad);

  // init selects
  $("goalSelect").value = String(state.goalMin || 5);
  $("rateRange").value = String(state.ttsRate || 0.9);
}

function fillVoiceSelect(){
  const sel = $("voiceSelect");
  sel.innerHTML = "";

  const en = voices.filter(v => (v.lang || "").toLowerCase().startsWith("en"));
  const list = en.length ? en : voices;

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Auto (khuyến nghị)";
  sel.appendChild(opt0);

  list.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(opt);
  });

  sel.value = state.voiceURI || "";
}

function speak(text){
  if(!text) return;
  try{
    const synth = window.speechSynthesis;
    if(!synth) return;
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = Number(state.ttsRate || 0.9);
    utter.pitch = 1.0;
    utter.volume = 1.0;

    if(state.voiceURI && voices.length){
      const v = voices.find(x => x.voiceURI === state.voiceURI);
      if(v) utter.voice = v;
    } else {
      const en = voices.find(v => (v.lang||"").toLowerCase().startsWith("en"));
      if(en) utter.voice = en;
    }

    synth.speak(utter);
  } catch {}
}

/* ---------- STORAGE ---------- */
function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
function saveState(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

/* ---------- UTILS ---------- */
function incMap(map, key){
  if(!key) return;
  map[key] = Number(map[key] || 0) + 1;
}
function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function yyyy_mm_dd(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function dayDiff(fromYYYYMMDD, toYYYYMMDD){
  const a = new Date(fromYYYYMMDD + "T00:00:00");
  const b = new Date(toYYYYMMDD + "T00:00:00");
  return Math.round((b - a) / (1000*60*60*24));
}
