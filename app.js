/* Kudo English – PRO v1 (client-only)
   Files used: lessons.json (array)
   Features: Learn -> Quiz, TTS, streak, goal minutes, stickers, parents mode
*/

const $ = (id) => document.getElementById(id);

const STORE_KEY = "kudo_english_state_v1";

const DEFAULT_STATE = {
  learnedIds: [],        // ids learned
  lastLearnDate: null,   // YYYY-MM-DD
  streak: 0,
  goalMin: 5,
  voiceURI: "",
  ttsRate: 0.9,
  stickersUnlocked: 0,   // count
  // Session
  sessionStartTs: null,
  sessionMinutesToday: 0,
};

let lessons = [];
let state = loadState();

let current = null; // current lesson object
let replayCount = 0;

let voices = [];
let speechReady = false;

const STICKER_TOTAL = 12;
const STICKER_MILESTONES = [1,2,3,5,8,12,16,20,25,30,40,50]; // unlock by learned count

// ---------- INIT ----------
init();

async function init(){
  bindUI();
  renderStickerGrid();
  await loadLessons();
  initSpeech();

  // update dashboard
  updateDailyCounters();
  renderDashboard();

  // Auto: if user already started session today, keep
  if (!state.sessionStartTs) state.sessionStartTs = Date.now();
  saveState();
}

async function loadLessons(){
  try{
    const res = await fetch("./lessons.json", { cache: "no-store" });
    if(!res.ok) throw new Error("Cannot fetch lessons.json");
    lessons = await res.json();

    // Basic sanitize
    lessons = (Array.isArray(lessons) ? lessons : []).filter(Boolean);

    if(lessons.length === 0){
      $("dashHint").textContent = "⚠️ lessons.json rỗng hoặc sai định dạng.";
    } else {
      $("dashHint").textContent = `Đã nạp ${lessons.length} từ.`;
    }
  } catch(e){
    $("dashHint").textContent = "⚠️ Không tải được lessons.json. Kiểm tra file có nằm ở root repo và đúng tên.";
    lessons = [];
  }
}

function bindUI(){
  $("btnStart").addEventListener("click", startFlow);

  $("btnReplay").addEventListener("click", () => {
    if(!current) return;
    speak(current.word);
    replayCount++;
    renderCoach();
  });

  $("btnNext").addEventListener("click", () => {
    // move to quiz after user has seen word
    if(!current) return;
    showQuizForCurrent();
  });

  $("btnQuizReplay").addEventListener("click", () => {
    if(!current) return;
    speak(current.word);
  });

  $("btnContinue").addEventListener("click", () => {
    // after quiz completed
    nextWord();
  });

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
    const ok = confirm("Reset toàn bộ tiến trình? (streak, từ đã học, sticker)");
    if(!ok) return;
    state = { ...DEFAULT_STATE, goalMin: state.goalMin, voiceURI: state.voiceURI, ttsRate: state.ttsRate };
    saveState();
    renderStickerGrid();
    renderDashboard();
    hideLessonAndQuiz();
    alert("Đã reset xong.");
  });
}

// ---------- FLOW ----------
function startFlow(){
  if(lessons.length === 0) return;

  // ensure daily state
  updateDailyCounters();

  // pick next lesson not learned, else random
  current = pickNextLesson();
  replayCount = 0;

  showLessonCard(current);
  speak(current.word);
}

function nextWord(){
  // after finishing one quiz
  current = pickNextLesson();
  replayCount = 0;
  showLessonCard(current);
  speak(current.word);
}

function pickNextLesson(){
  const learnedSet = new Set(state.learnedIds);
  const unlearned = lessons.filter(l => l && l.id && !learnedSet.has(l.id));
  const pool = unlearned.length ? unlearned : lessons;

  // Prefer variety: shuffle and pick
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

function showLessonCard(lesson){
  $("lessonCard").classList.remove("hidden");
  $("quizCard").classList.add("hidden");

  $("pillCategory").textContent = lesson.category || "Category";
  $("lessonWord").textContent = lesson.word || "Word";
  $("lessonEmoji").textContent = lesson.emoji || "🙂";
  $("replayWord").textContent = lesson.word || "Word";
  renderCoach();
}

function showQuizForCurrent(){
  $("lessonCard").classList.add("hidden");
  $("quizCard").classList.remove("hidden");

  $("quizCategory").textContent = (current.category || "Category") + " • Quiz";
  $("quizWord").textContent = current.word || "Word";

  $("resultBox").classList.add("hidden");
  $("btnContinue").classList.add("hidden");

  buildOptions(current);
}

function hideLessonAndQuiz(){
  $("lessonCard").classList.add("hidden");
  $("quizCard").classList.add("hidden");
}

function renderCoach(){
  const need = Math.max(0, 2 - replayCount);
  if(need > 0){
    $("coachBox").textContent = `Replay ${need} lần rồi bấm Next 🙂`;
  } else {
    $("coachBox").textContent = `Tốt! Bấm Next để làm Quiz ✅`;
  }
}

// ---------- QUIZ ----------
function buildOptions(lesson){
  const optionsEl = $("options");
  optionsEl.innerHTML = "";

  const correct = (lesson.word || "").trim();
  const distractors = Array.isArray(lesson.distractors) ? lesson.distractors : [];
  const wrongWords = distractors
    .map(d => (d && d.word ? String(d.word).trim() : ""))
    .filter(Boolean)
    .slice(0, 2);

  // Fallback if not enough distractors
  while(wrongWords.length < 2){
    const candidate = lessons[Math.floor(Math.random() * lessons.length)];
    const w = candidate?.word?.trim();
    if(w && w !== correct && !wrongWords.includes(w)) wrongWords.push(w);
    if(lessons.length < 3) break;
  }

  const optionWords = shuffle([correct, ...wrongWords]).slice(0, 3);

  optionWords.forEach(word => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.textContent = word;
    btn.addEventListener("click", () => onAnswer(btn, word, correct));
    optionsEl.appendChild(btn);
  });
}

function onAnswer(buttonEl, chosen, correct){
  // lock all options
  const all = Array.from(document.querySelectorAll(".option"));
  all.forEach(b => b.disabled = true);

  const isCorrect = chosen === correct;

  // mark
  all.forEach(b => {
    if(b.textContent === correct) b.classList.add("correct");
  });
  if(!isCorrect) buttonEl.classList.add("wrong");

  // result
  const resultBox = $("resultBox");
  resultBox.classList.remove("hidden");
  resultBox.textContent = isCorrect ? "🎉 Đúng rồi! Tuyệt!" : `❌ Chưa đúng. Đáp án đúng là: ${correct}`;

  // Update learning progress when quiz answered (count as learned only if correct)
  if(isCorrect) markLearned(current);

  $("btnContinue").classList.remove("hidden");
}

// ---------- PROGRESS / STREAK / STICKERS ----------
function markLearned(lesson){
  if(!lesson?.id) return;

  if(!state.learnedIds.includes(lesson.id)){
    state.learnedIds.push(lesson.id);
  }

  // Add “minutes today” approximate: 0.5 min per word (simple heuristic)
  // and keep within goal context
  state.sessionMinutesToday = Number(state.sessionMinutesToday || 0) + 0.5;

  // Stickers
  const learnedCount = state.learnedIds.length;
  const unlockCount = STICKER_MILESTONES.filter(m => learnedCount >= m).length;
  if(unlockCount > state.stickersUnlocked){
    state.stickersUnlocked = unlockCount;
    renderStickerGrid();
    $("stickerHint").textContent = `🎁 Bạn vừa mở sticker #${unlockCount}!`;
  }

  saveState();
  renderDashboard();
}

function updateDailyCounters(){
  const today = yyyy_mm_dd(new Date());
  const last = state.lastLearnDate;

  if(!last){
    // first time
    state.lastLearnDate = today;
    state.streak = 1;
    state.sessionMinutesToday = 0;
    state.sessionStartTs = Date.now();
    saveState();
    return;
  }

  if(last === today){
    // same day: nothing
    return;
  }

  // different day: evaluate streak
  const diff = dayDiff(last, today);
  if(diff === 1){
    state.streak = (state.streak || 0) + 1;
  } else {
    state.streak = 1;
  }

  state.lastLearnDate = today;
  state.sessionMinutesToday = 0;
  state.sessionStartTs = Date.now();
  saveState();
}

function renderDashboard(){
  $("statStreak").textContent = String(state.streak || 0);
  $("statGoalMin").textContent = String(state.goalMin || 5);
  $("statLearned").textContent = String(state.learnedIds?.length || 0);

  const learned = state.learnedIds?.length || 0;
  const total = lessons.length || 0;

  const minToday = Number(state.sessionMinutesToday || 0).toFixed(1);
  const goal = Number(state.goalMin || 5);

  $("dashHint").textContent =
    total
      ? `Tiến độ: ${learned}/${total} từ • Hôm nay: ~${minToday}/${goal} phút`
      : `Hôm nay: ~${minToday}/${goal} phút`;

  renderStickerGrid();
}

function renderStickerGrid(){
  const grid = $("stickerGrid");
  if(!grid) return;
  grid.innerHTML = "";

  const unlocked = Math.min(state.stickersUnlocked || 0, STICKER_TOTAL);

  // Simple sticker set
  const stickerIcons = ["🐵","⭐","🚀","🍎","🎈","🏆","🌈","🧸","🍌","🎮","🧠","🎁"];

  for(let i=1;i<=STICKER_TOTAL;i++){
    const el = document.createElement("div");
    el.className = "sticker";
    const isOpen = i <= unlocked;
    el.textContent = isOpen ? (stickerIcons[i-1] || "⭐") : "🔒";
    grid.appendChild(el);
  }

  const learnedCount = state.learnedIds?.length || 0;
  const nextMilestone = STICKER_MILESTONES.find(m => m > learnedCount);
  $("stickerHint").textContent = nextMilestone
    ? `Còn ${nextMilestone - learnedCount} từ nữa để mở sticker tiếp theo.`
    : `Bạn đã mở hết sticker hiện có!`;
}

// ---------- TTS ----------
function initSpeech(){
  // voices can be async; refresh a few times
  const tryLoad = () => {
    voices = window.speechSynthesis?.getVoices?.() || [];
    if(voices.length){
      speechReady = true;
      fillVoiceSelect();
    }
  };

  tryLoad();
  window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
    tryLoad();
  });

  // Fill settings defaults
  $("goalSelect").value = String(state.goalMin || 5);
  $("rateRange").value = String(state.ttsRate || 0.9);
}

function fillVoiceSelect(){
  const sel = $("voiceSelect");
  if(!sel) return;
  sel.innerHTML = "";

  // Prefer EN voices
  const en = voices.filter(v => (v.lang || "").toLowerCase().startsWith("en"));
  const list = en.length ? en : voices;

  // Add default option
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

    // Choose voice if selected
    if(state.voiceURI && voices.length){
      const v = voices.find(x => x.voiceURI === state.voiceURI);
      if(v) utter.voice = v;
    } else {
      // try best EN voice
      const en = voices.find(v => (v.lang||"").toLowerCase().startsWith("en"));
      if(en) utter.voice = en;
    }

    synth.speak(utter);
  } catch(e){
    // ignore
  }
}

// ---------- PARENTS MODAL ----------
function openParents(){
  $("parentsModal").classList.remove("hidden");
  $("goalSelect").value = String(state.goalMin || 5);
  $("rateRange").value = String(state.ttsRate || 0.9);

  // ensure voices shown
  voices = window.speechSynthesis?.getVoices?.() || voices;
  fillVoiceSelect();
}

function closeParents(){
  $("parentsModal").classList.add("hidden");
}

// ---------- STORAGE ----------
function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {}
}

// ---------- HELPERS ----------
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
  const ms = b - a;
  return Math.round(ms / (1000*60*60*24));
}
