/* ============================================
   English Institute PWA — app.js
   التنقل، النطق الصوتي، الاختبارات، وحفظ التقدم
   ============================================ */

"use strict";

/* ---------- الحالة العامة ---------- */
const state = {
  book: null,
  currentLesson: null,
  quizIndex: 0,
  quizScore: 0,
  progress: { completed: {}, points: 0, streak: { lastDay: null, count: 0 } }
};

const STORAGE_KEY = "eip_progress_v1";
const THEME_KEY = "eip_theme";

/* ---------- عناصر DOM ---------- */
const $ = (sel) => document.querySelector(sel);
const homeView = $("#homeView");
const lessonView = $("#lessonView");
const backBtn = $("#backBtn");
const themeToggle = $("#themeToggle");
const themeIcon = $("#themeIcon");
const progressFill = $("#overallProgress");
const progressText = $("#progressText");

/* ---------- التحميل الأولي ---------- */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  loadTheme();
  loadProgress();
  bindGlobalEvents();

  try {
    const res = await fetch("data/book1.json");
    if (!res.ok) throw new Error("تعذر تحميل بيانات الكتاب");
    state.book = (await res.json()).book;
    renderHome();
    updateOverallProgress();
  } catch (err) {
    homeView.innerHTML = `<div class="result-card"><div class="result-emoji">⚠️</div>
      <h3>حدث خطأ في التحميل</h3><p>${err.message}</p></div>`;
  }

  registerSW();
}

/* ---------- الأحداث العامة ---------- */
function bindGlobalEvents() {
  backBtn.addEventListener("click", showHome);
  themeToggle.addEventListener("click", toggleTheme);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

/* ---------- الوضع الليلي / النهاري ---------- */
function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.dataset.theme = saved;
  themeIcon.textContent = saved === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  themeIcon.textContent = next === "dark" ? "☀️" : "🌙";
}

/* ---------- التقدم (localStorage) ---------- */
function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) state.progress = saved;
  } catch { /* بيانات تالفة — نبدأ من الصفر */ }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function markCompleted(lessonId, score) {
  const p = state.progress;
  const alreadyDone = !!p.completed[lessonId];
  p.completed[lessonId] = { score, doneAt: Date.now() };
  if (!alreadyDone) p.points += 10 + score; // 10 نقاط إتمام + نقاط الاختبار

  // السلسلة اليومية (Streak)
  const today = new Date().toDateString();
  if (p.streak.lastDay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    p.streak.count = p.streak.lastDay === yesterday ? p.streak.count + 1 : 1;
    p.streak.lastDay = today;
  }
  saveProgress();
}

/* ---------- عرض الوحدات (الصفحة الرئيسية) ---------- */
function renderHome() {
  homeView.innerHTML = "";

  state.book.units.forEach((unit) => {
    const card = document.createElement("div");
    card.className = "unit-card";

    const doneCount = unit.lessons.filter((l) => state.progress.completed[l.id]).length;

    card.innerHTML = `
      <div class="unit-header">
        <div class="unit-badge">${unit.number}</div>
        <div>
          <h2>Unit ${unit.number}: ${unit.title}</h2>
          <p>${unit.titleAr} • ${doneCount}/${unit.lessons.length} دروس مكتملة</p>
        </div>
      </div>
      <div class="lesson-list"></div>
    `;

    const list = card.querySelector(".lesson-list");
    unit.lessons.forEach((lesson) => {
      const isDone = !!state.progress.completed[lesson.id];
      const item = document.createElement("button");
      item.className = "lesson-item";
      item.innerHTML = `
        <div class="lesson-info">
          <strong>${lesson.title}</strong>
          <span>${lesson.titleAr}</span>
        </div>
        <span class="lesson-status">${isDone ? "✅" : "⬜"}</span>
      `;
      item.addEventListener("click", () => openLesson(lesson));
      list.appendChild(item);
    });

    homeView.appendChild(card);
  });
}

/* ---------- فتح درس ---------- */
function openLesson(lesson) {
  state.currentLesson = lesson;
  state.quizIndex = 0;
  state.quizScore = 0;

  $("#lessonTitle").textContent = `${lesson.title} — ${lesson.titleAr}`;
  $("#lessonSubtitle").textContent = `Unit من Book 1`;

  renderLearnTab();
  renderQuizTab();
  renderTasksTab();
  switchTab("learn");

  homeView.classList.add("hidden");
  lessonView.classList.remove("hidden");
  backBtn.classList.remove("hidden");
  window.scrollTo(0, 0);
}

function showHome() {
  lessonView.classList.add("hidden");
  homeView.classList.remove("hidden");
  backBtn.classList.add("hidden");
  renderHome();
  updateOverallProgress();
}

/* ---------- التبويبات ---------- */
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name)
  );
  ["learn", "quiz", "tasks"].forEach((n) =>
    $(`#tab-${n}`).classList.toggle("hidden", n !== name)
  );
}

/* ---------- تبويب الشرح والمفردات ---------- */
function renderLearnTab() {
  const lesson = state.currentLesson;
  const panel = $("#tab-learn");

  let html = `<h3 class="section-title">🗣️ المفردات — اضغط 🔊 للاستماع</h3>`;

  lesson.vocabulary.forEach((v, i) => {
    html += `
      <div class="vocab-card">
        <div>
          <span class="en">${v.en}</span>
          <span style="margin:0 8px;color:var(--text-muted)">—</span>
          <span>${v.ar}</span>
          <span class="vocab-example en">"${v.example}"</span>
        </div>
        <button class="speak-btn" data-say="${escapeAttr(v.en)}" aria-label="استمع">🔊</button>
      </div>`;
  });

  html += `<h3 class="section-title">📐 القواعد</h3>`;
  lesson.grammar.forEach((g) => {
    html += `
      <div class="grammar-card">
        <h4>${g.title}</h4>
        <p>${g.explanation}</p>
        <div class="example-box en">${g.example}</div>
      </div>`;
  });

  panel.innerHTML = html;

  panel.querySelectorAll(".speak-btn").forEach((btn) => {
    btn.addEventListener("click", () => speak(btn.dataset.say));
  });
}

function escapeAttr(s) {
  return s.replace(/"/g, "&quot;");
}

/* ---------- النطق الصوتي (Web Speech API) ---------- */
function speak(text) {
  if (!("speechSynthesis" in window)) {
    showToast("⚠️ متصفحك لا يدعم النطق الصوتي");
    return;
  }
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 0.85; // أبطأ قليلاً للطلاب
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  if (voices.length) utter.voice = voices[0];
  speechSynthesis.speak(utter);
}
speechSynthesis.onvoiceschanged = () => {}; // تفعيل تحميل الأصوات

/* ---------- تبويب الاختبار ---------- */
function renderQuizTab() {
  state.quizIndex = 0;
  state.quizScore = 0;
  showQuestion();
}

function showQuestion() {
  const lesson = state.currentLesson;
  const quiz = lesson.quiz;
  const panel = $("#tab-quiz");
  const q = quiz[state.quizIndex];
  const total = quiz.length;

  let html = `
    <div class="quiz-meta">
      <span>السؤال ${state.quizIndex + 1} من ${total}</span>
      <span>النقاط: ${state.quizScore}</span>
    </div>
    <div class="quiz-question">
      <h3>${q.q}</h3>
      ${q.qEn ? `<div class="en" style="font-size:1.1rem;margin:6px 0">${q.qEn}</div>` : ""}
  `;

  q.options.forEach((opt, i) => {
    html += `<button class="option-btn" data-opt="${i}">
      <span class="en">${opt}</span>
    </button>`;
  });

  html += `<div class="quiz-feedback hidden" id="feedback"></div></div>
    <div class="quiz-nav" id="quizNav"></div>`;

  panel.innerHTML = html;

  panel.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(parseInt(btn.dataset.opt)));
  });
}

function handleAnswer(selected) {
  const q = state.currentLesson.quiz[state.quizIndex];
  const panel = $("#tab-quiz");
  const buttons = panel.querySelectorAll(".option-btn");
  const feedback = $("#feedback");
  const nav = $("#quizNav");
  const isCorrect = selected === q.answer;

  buttons.forEach((b) => (b.disabled = true));
  buttons[q.answer].classList.add("correct");
  if (!isCorrect) buttons[selected].classList.add("wrong");
  if (isCorrect) state.quizScore++;

  feedback.classList.remove("hidden", "ok", "no");
  feedback.classList.add(isCorrect ? "ok" : "no");
  feedback.innerHTML = `
    <strong>${isCorrect ? "✔ إجابة صحيحة! أحسنت 🎉" : "✘ إجابة خاطئة"}</strong><br>
    ${q.explanation}`;

  if (isCorrect) speak("Correct!");

  const isLast = state.quizIndex === state.currentLesson.quiz.length - 1;
  nav.innerHTML = `
    ${!isLast
      ? `<button class="btn btn-primary" id="nextQ">السؤال التالي ←</button>`
      : `<button class="btn btn-primary" id="finishQuiz">إنهاء الاختبار 🏁</button>`}
  `;

  if (!isLast) {
    $("#nextQ").addEventListener("click", () => { state.quizIndex++; showQuestion(); });
  } else {
    $("#finishQuiz").addEventListener("click", showResult);
  }
  nav.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showResult() {
  const quiz = state.currentLesson.quiz;
  const total = quiz.length;
  const score = state.quizScore;
  const percent = Math.round((score / total) * 100);
  const isPass = percent >= 60;

  markCompleted(state.currentLesson.id, score);

  const emoji = percent === 100 ? "🏆" : percent >= 80 ? "🌟" : isPass ? "👍" : "💪";
  const msg = percent === 100 ? "علامة كاملة! ممتاز!"
    : percent >= 80 ? "أداء رائع جداً!"
    : isPass ? "نجحت! يمكنك تحسين نتيجتك بالمراجعة."
    : "لا بأس، راجع الدرس وحاول مرة أخرى.";

  $("#tab-quiz").innerHTML = `
    <div class="result-card">
      <div class="result-emoji">${emoji}</div>
      <h3>${isPass ? "أحسنت! لقد أكملت الدرس" : "انتهى الاختبار"}</h3>
      <div class="result-score">${score} / ${total}</div>
      <p>${msg}</p>
      <div class="quiz-nav">
        <button class="btn btn-primary" id="retryQuiz">🔄 إعادة الاختبار</button>
        <button class="btn btn-ghost" id="backHome">🏠 القائمة الرئيسية</button>
      </div>
    </div>`;

  $("#retryQuiz").addEventListener("click", renderQuizTab);
  $("#backHome").addEventListener("click", showHome);
  updateOverallProgress();
}

/* ---------- تبويب المهام والتقدم ---------- */
function renderTasksTab() {
  const lesson = state.currentLesson;
  const p = state.progress;
  const record = p.completed[lesson.id];
  const allLessons = state.book.units.flatMap((u) => u.lessons);
  const totalLessons = allLessons.length;
  const doneLessons = allLessons.filter((l) => p.completed[l.id]).length;

  $("#tab-tasks").innerHTML = `
    <div class="points-box">
      <div style="font-size:.85rem">⭐ مجموع نقاطك</div>
      <div class="points-num">${p.points}</div>
    </div>

    <div class="streak-box">
      <span>🔥 أيام الدراسة المتتالية</span>
      <span class="fire"><strong>${p.streak.count}</strong> يوم</span>
    </div>

    <h3 class="section-title">📋 مهام هذا الدرس</h3>

    <div class="task-card">
      <span class="task-icon">🗣️</span>
      <div><strong>استمع وردّد المفردات</strong><span>اضغط على أزرار 🔊 في تبويب الشرح</span></div>
      <span class="done" style="margin-right:auto">${record ? "✅" : "⬜"}</span>
    </div>

    <div class="task-card">
      <span class="task-icon">📐</span>
      <div><strong>راجع قواعد الدرس</strong><span>اقرأ الشرح وافهم الأمثلة</span></div>
      <span class="done" style="margin-right:auto">${record ? "✅" : "⬜"}</span>
    </div>

    <div class="task-card">
      <span class="task-icon">📝</span>
      <div><strong>اجتز الاختبار (60%+)</strong>
      <span>${record ? `أفضل نتيجة: ${record.score}/${lesson.quiz.length}` : "لم يتم بعد"}</span></div>
      <span class="done" style="margin-right:auto">${record ? "✅" : "⬜"}</span>
    </div>

    <h3 class="section-title">📊 تقدّمك العام في Book 1</h3>
    <div class="unit-card">
      <p style="font-size:.88rem;margin-bottom:8px">
        أكملت <strong>${doneLessons}</strong> من <strong>${totalLessons}</strong> دروساً
      </p>
      <div class="progress-track"><div class="progress-fill" style="width:${Math.round((doneLessons / totalLessons) * 100)}%"></div></div>
    </div>
  `;
}

/* ---------- شريط التقدم العام ---------- */
function updateOverallProgress() {
  if (!state.book) return;
  const all = state.book.units.flatMap((u) => u.lessons);
  const done = all.filter((l) => state.progress.completed[l.id]).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  progressFill.style.width = pct + "%";
  progressText.textContent = pct + "%";
}

/* ---------- Toast ---------- */
let toastTimer;
function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ---------- تسجيل Service Worker ---------- */
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
