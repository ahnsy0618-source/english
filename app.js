(function () {
  "use strict";

  // ---------- supabase ----------
  const SUPABASE_URL = "https://ymeuefmwyhwdzxcgahwg.supabase.co";
  const SUPABASE_KEY = "sb_publishable_kC2IOG8jvAwCM1Dklk7A1w_r7rkfxj_";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ---------- date helpers ----------
  function getTodayDateString() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }
  function addDays(dateString, days) {
    const d = new Date(dateString + "T00:00:00");
    d.setDate(d.getDate() + days);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }
  function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  function pickTodaySentences(dateString, pool) {
    const seed = hashString(dateString);
    const remaining = pool.slice();
    const picked = [];
    let cursor = seed;
    while (picked.length < 3 && remaining.length > 0) {
      cursor = (cursor * 1103515245 + 12345) >>> 0;
      const idx = cursor % remaining.length;
      picked.push(remaining.splice(idx, 1)[0]);
    }
    return picked;
  }

  // ---------- 인증 ----------
  const authScreen = document.getElementById("authScreen");
  const appShell = document.getElementById("appShell");
  const authForm = document.getElementById("authForm");
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const authSubmit = document.getElementById("authSubmit");
  const authMessage = document.getElementById("authMessage");
  const signOutBtn = document.getElementById("signOutBtn");

  let currentUser = null;

  function showAuthMessage(text, isSuccess) {
    authMessage.textContent = text;
    authMessage.hidden = false;
    authMessage.classList.toggle("is-success", !!isSuccess);
  }

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authMessage.hidden = true;
    const email = authEmail.value.trim();
    const password = authPassword.value;
    authSubmit.disabled = true;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      showAuthMessage(err.message, false);
    } finally {
      authSubmit.disabled = false;
    }
  });

  signOutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  // ---------- 렌더링 대상 ----------
  const todayList = document.getElementById("todayList");
  const favoriteList = document.getElementById("favoriteList");
  const favoriteEmpty = document.getElementById("favoriteEmpty");
  const favoriteCount = document.getElementById("favoriteCount");
  const streakText = document.getElementById("streakText");
  const todayDate = document.getElementById("todayDate");
  const quizArea = document.getElementById("quizArea");
  const quizScoreEl = document.getElementById("quizScore");
  const favoritePagination = document.getElementById("favoritePagination");
  const favoritePageLabel = document.getElementById("favoritePageLabel");
  const mistakeList = document.getElementById("mistakeList");
  const mistakeEmpty = document.getElementById("mistakeEmpty");
  const mistakeCount = document.getElementById("mistakeCount");
  const mistakePagination = document.getElementById("mistakePagination");
  const mistakePageLabel = document.getElementById("mistakePageLabel");
  const ddayBadge = document.getElementById("ddayBadge");
  const ddayText = document.getElementById("ddayText");
  const ddayEditor = document.getElementById("ddayEditor");
  const examDateInput = document.getElementById("examDateInput");
  const examDateSave = document.getElementById("examDateSave");

  const PAGE_SIZE = 3;

  let sentencePool = [];
  let todaySentences = [];
  let favoriteIds = new Set();
  let favoritePage = 0;
  let mistakeIds = new Set();
  let mistakePage = 0;
  let examDate = null;
  let quizSentence = null;
  let quizRevealed = false;
  let quizScore = { correct: 0, total: 0 };

  function createSentenceCardEl(sentence, index) {
    const li = document.createElement("li");
    li.className = "sentence-card";
    li.dataset.id = sentence.id;

    const body = document.createElement("div");
    body.className = "sentence-card__body";

    const en = document.createElement("span");
    en.className = "sentence-card__en";
    if (typeof index === "number") {
      const badge = document.createElement("span");
      badge.className = "sentence-card__index";
      badge.textContent = String(index + 1);
      en.appendChild(badge);
    }
    en.appendChild(document.createTextNode(sentence.en));
    body.appendChild(en);

    if (sentence.ko) {
      const ko = document.createElement("span");
      ko.className = "sentence-card__ko";
      ko.textContent = sentence.ko;
      body.appendChild(ko);
    }

    const source = document.createElement("span");
    source.className = "sentence-card__source";
    const link = document.createElement("a");
    link.href = sentence.source_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "출처: " + sentence.source_label;
    source.appendChild(link);
    body.appendChild(source);

    const isFav = favoriteIds.has(sentence.id);
    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "star-btn" + (isFav ? " is-active" : "");
    starBtn.textContent = isFav ? "★" : "☆";
    starBtn.setAttribute("aria-label", "즐겨찾기 " + (isFav ? "해제" : "추가"));

    li.appendChild(body);
    li.appendChild(starBtn);
    return li;
  }

  function renderToday() {
    todayList.innerHTML = "";
    todaySentences.forEach((s, i) => todayList.appendChild(createSentenceCardEl(s, i)));
  }

  function renderFavorites() {
    const favSentences = sentencePool.filter(s => favoriteIds.has(s.id));
    favoriteEmpty.hidden = favSentences.length !== 0;
    favoriteCount.textContent = String(favSentences.length);

    const totalPages = Math.max(1, Math.ceil(favSentences.length / PAGE_SIZE));
    if (favoritePage > totalPages - 1) favoritePage = totalPages - 1;
    if (favoritePage < 0) favoritePage = 0;

    const start = favoritePage * PAGE_SIZE;
    const pageItems = favSentences.slice(start, start + PAGE_SIZE);

    favoriteList.innerHTML = "";
    pageItems.forEach(s => favoriteList.appendChild(createSentenceCardEl(s)));

    favoritePagination.hidden = favSentences.length <= PAGE_SIZE;
    favoritePageLabel.textContent = (favoritePage + 1) + " / " + totalPages;
    favoritePagination.querySelector('[data-page-action="prev"]').disabled = favoritePage === 0;
    favoritePagination.querySelector('[data-page-action="next"]').disabled = favoritePage >= totalPages - 1;
  }

  favoritePagination.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page-action]");
    if (!btn) return;
    favoritePage += btn.dataset.pageAction === "prev" ? -1 : 1;
    renderFavorites();
  });

  // ---------- 오답노트 ----------
  function renderMistakes() {
    const mistakeSentences = sentencePool.filter(s => mistakeIds.has(s.id));
    mistakeEmpty.hidden = mistakeSentences.length !== 0;
    mistakeCount.textContent = String(mistakeSentences.length);

    const totalPages = Math.max(1, Math.ceil(mistakeSentences.length / PAGE_SIZE));
    if (mistakePage > totalPages - 1) mistakePage = totalPages - 1;
    if (mistakePage < 0) mistakePage = 0;

    const start = mistakePage * PAGE_SIZE;
    const pageItems = mistakeSentences.slice(start, start + PAGE_SIZE);

    mistakeList.innerHTML = "";
    pageItems.forEach(s => mistakeList.appendChild(createSentenceCardEl(s)));

    mistakePagination.hidden = mistakeSentences.length <= PAGE_SIZE;
    mistakePageLabel.textContent = (mistakePage + 1) + " / " + totalPages;
    mistakePagination.querySelector('[data-page-action="prev"]').disabled = mistakePage === 0;
    mistakePagination.querySelector('[data-page-action="next"]').disabled = mistakePage >= totalPages - 1;
  }

  mistakePagination.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page-action]");
    if (!btn) return;
    mistakePage += btn.dataset.pageAction === "prev" ? -1 : 1;
    renderMistakes();
  });

  mistakeList.addEventListener("click", (e) => {
    const btn = e.target.closest(".star-btn");
    if (!btn) return;
    toggleFavorite(btn.closest(".sentence-card").dataset.id);
  });

  async function recordQuizResult(sentenceId, isCorrect) {
    if (!currentUser) return;
    if (isCorrect) {
      const { error } = await supabase.from("mistakes").delete().eq("sentence_id", sentenceId);
      if (error) { console.error("오답노트 제거 실패:", error.message); return; }
      mistakeIds.delete(sentenceId);
    } else {
      const { error } = await supabase.from("mistakes").upsert({ sentence_id: sentenceId, user_id: currentUser.id });
      if (error) { console.error("오답노트 추가 실패:", error.message); return; }
      mistakeIds.add(sentenceId);
    }
    renderMistakes();
  }

  // ---------- 복습 퀴즈 (즐겨찾기 재활용, 한→영 작문 연습) ----------
  let quizUserAnswer = "";
  let quizIsCorrect = false;
  const QUIZ_MATCH_THRESHOLD = 0.8;

  function normalizeAnswer(s) {
    return s
      .toLowerCase()
      .replace(/[.,!?;:"']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function levenshteinDistance(a, b) {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dist = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
    for (let j = 0; j < cols; j++) dist[0][j] = j;
    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dist[i][j] = Math.min(
          dist[i - 1][j] + 1,
          dist[i][j - 1] + 1,
          dist[i - 1][j - 1] + cost
        );
      }
    }
    return dist[rows - 1][cols - 1];
  }

  function isCloseEnough(userAnswer, correctAnswer) {
    const a = normalizeAnswer(userAnswer);
    const b = normalizeAnswer(correctAnswer);
    if (!a) return false;
    if (a === b) return true;
    const maxLen = Math.max(a.length, b.length);
    const similarity = 1 - levenshteinDistance(a, b) / maxLen;
    return similarity >= QUIZ_MATCH_THRESHOLD;
  }

  function pickQuizSentence(favSentences) {
    const candidates = quizSentence
      ? favSentences.filter(s => s.id !== quizSentence.id)
      : favSentences;
    const pool = candidates.length > 0 ? candidates : favSentences;
    quizSentence = pool[Math.floor(Math.random() * pool.length)];
    quizRevealed = false;
    quizUserAnswer = "";
  }

  function renderQuiz() {
    const favSentences = sentencePool.filter(s => favoriteIds.has(s.id));
    quizScoreEl.textContent = quizScore.correct + "/" + quizScore.total;
    quizArea.innerHTML = "";

    if (favSentences.length === 0) {
      quizSentence = null;
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.innerHTML = '<span class="empty-state__icon">🧠</span>즐겨찾기한 문장이 있어야 퀴즈를 풀 수 있어요. 문장에 ★ 표시를 해보세요.';
      quizArea.appendChild(empty);
      return;
    }

    if (!quizSentence || !favoriteIds.has(quizSentence.id)) {
      pickQuizSentence(favSentences);
    }

    const card = document.createElement("div");
    card.className = "quiz-card";

    const label = document.createElement("p");
    label.className = "quiz-card__label";
    label.textContent = "이 문장을 영어로 말해보세요";
    card.appendChild(label);

    const prompt = document.createElement("p");
    prompt.className = "quiz-card__prompt";
    prompt.textContent = quizSentence.ko || "(번역 없음)";
    card.appendChild(prompt);

    const actions = document.createElement("div");
    actions.className = "quiz-actions";

    if (!quizRevealed) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "quiz-input";
      input.placeholder = "영어로 입력해보세요";
      input.autocomplete = "off";
      card.appendChild(input);

      const revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.className = "btn btn-primary";
      revealBtn.dataset.action = "reveal";
      revealBtn.textContent = "정답 확인";
      actions.appendChild(revealBtn);
    } else {
      const verdict = document.createElement("p");
      verdict.className = "quiz-verdict " + (quizIsCorrect ? "quiz-verdict--correct" : "quiz-verdict--wrong");
      verdict.textContent = quizIsCorrect ? "✅ 정답이에요!" : "❌ 아쉬워요, 다시 도전해봐요";
      card.appendChild(verdict);

      if (quizUserAnswer) {
        const userAnswer = document.createElement("p");
        userAnswer.className = "quiz-user-answer";
        userAnswer.innerHTML = '내가 쓴 문장: <em></em>';
        userAnswer.querySelector("em").textContent = quizUserAnswer;
        card.appendChild(userAnswer);
      }

      const answer = document.createElement("p");
      answer.className = "quiz-card__answer";
      answer.textContent = quizSentence.en;
      card.appendChild(answer);

      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "btn btn-primary";
      nextBtn.dataset.action = "next";
      nextBtn.textContent = "다음 문제";
      actions.appendChild(nextBtn);
    }

    card.appendChild(actions);
    quizArea.appendChild(card);

    if (!quizRevealed) card.querySelector(".quiz-input").focus();
  }

  quizArea.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const favSentences = sentencePool.filter(s => favoriteIds.has(s.id));
    if (btn.dataset.action === "reveal") {
      const input = quizArea.querySelector(".quiz-input");
      quizUserAnswer = input ? input.value.trim() : "";
      quizIsCorrect = isCloseEnough(quizUserAnswer, quizSentence.en);
      quizScore.total += 1;
      if (quizIsCorrect) quizScore.correct += 1;
      quizRevealed = true;
      recordQuizResult(quizSentence.id, quizIsCorrect);
      renderQuiz();
    } else if (btn.dataset.action === "next") {
      pickQuizSentence(favSentences);
      renderQuiz();
    }
  });
  quizArea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("quiz-input")) {
      e.preventDefault();
      const revealBtn = quizArea.querySelector('button[data-action="reveal"]');
      if (revealBtn) revealBtn.click();
    }
  });

  async function toggleFavorite(id) {
    if (!currentUser) return;
    if (favoriteIds.has(id)) {
      const { error } = await supabase.from("favorites").delete().eq("sentence_id", id);
      if (error) { console.error("즐겨찾기 해제 실패:", error.message); return; }
      favoriteIds.delete(id);
    } else {
      const { error } = await supabase.from("favorites").insert({ sentence_id: id, user_id: currentUser.id });
      if (error) { console.error("즐겨찾기 추가 실패:", error.message); return; }
      favoriteIds.add(id);
    }
    renderToday();
    renderFavorites();
    renderMistakes();
    renderQuiz();
  }

  todayList.addEventListener("click", (e) => {
    const btn = e.target.closest(".star-btn");
    if (!btn) return;
    toggleFavorite(btn.closest(".sentence-card").dataset.id);
  });
  favoriteList.addEventListener("click", (e) => {
    const btn = e.target.closest(".star-btn");
    if (!btn) return;
    toggleFavorite(btn.closest(".sentence-card").dataset.id);
  });

  // ---------- 연속 방문일 (Supabase) ----------
  async function updateStreak(today, userId) {
    const { data, error } = await supabase.from("streak").select("*").eq("user_id", userId).maybeSingle();
    if (error) {
      console.error("연속 방문일 조회 실패:", error.message);
      return 0;
    }
    let count;
    if (!data) {
      count = 1;
    } else if (data.last_visit === today) {
      count = data.count;
    } else if (data.last_visit === addDays(today, -1)) {
      count = data.count + 1;
    } else {
      count = 1;
    }
    const { error: upsertError } = await supabase
      .from("streak")
      .upsert({ user_id: userId, count, last_visit: today });
    if (upsertError) console.error("연속 방문일 갱신 실패:", upsertError.message);
    return count;
  }

  // ---------- D-Day (Supabase) ----------
  function renderDday(today) {
    if (!examDate) {
      ddayText.textContent = "오픽 시험일 설정";
      return;
    }
    const diffDays = Math.round(
      (new Date(examDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000
    );
    if (diffDays > 0) ddayText.textContent = "D-" + diffDays;
    else if (diffDays === 0) ddayText.textContent = "D-DAY";
    else ddayText.textContent = "D+" + Math.abs(diffDays);
  }

  ddayBadge.addEventListener("click", () => {
    examDateInput.value = examDate || "";
    ddayBadge.hidden = true;
    ddayEditor.hidden = false;
    examDateInput.focus();
  });

  examDateSave.addEventListener("click", async () => {
    if (!currentUser) return;
    const value = examDateInput.value;
    if (!value) return;
    const { error } = await supabase.from("settings").upsert({ user_id: currentUser.id, exam_date: value });
    if (error) { console.error("시험일 저장 실패:", error.message); return; }
    examDate = value;
    ddayEditor.hidden = true;
    ddayBadge.hidden = false;
    renderDday(getTodayDateString());
  });

  // ---------- 앱 로드 (로그인 이후) ----------
  async function loadApp(user) {
    const today = getTodayDateString();
    todayDate.textContent = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", weekday: "long"
    });

    const [
      { data: sentences, error: sentencesError },
      { data: favorites, error: favoritesError },
      { data: mistakes, error: mistakesError },
      { data: settings, error: settingsError },
      streak
    ] = await Promise.all([
      supabase.from("sentences").select("*").order("created_at", { ascending: true }),
      supabase.from("favorites").select("sentence_id"),
      supabase.from("mistakes").select("sentence_id"),
      supabase.from("settings").select("exam_date").eq("user_id", user.id).maybeSingle(),
      updateStreak(today, user.id)
    ]);

    if (sentencesError) console.error("문장 불러오기 실패:", sentencesError.message);
    if (favoritesError) console.error("즐겨찾기 불러오기 실패:", favoritesError.message);
    if (mistakesError) console.error("오답노트 불러오기 실패:", mistakesError.message);
    if (settingsError) console.error("설정 불러오기 실패:", settingsError.message);

    sentencePool = sentences || [];
    favoriteIds = new Set((favorites || []).map(f => f.sentence_id));
    mistakeIds = new Set((mistakes || []).map(m => m.sentence_id));
    examDate = settings ? settings.exam_date : null;
    todaySentences = pickTodaySentences(today, sentencePool);
    favoritePage = 0;
    mistakePage = 0;
    quizSentence = null;
    quizRevealed = false;
    quizScore = { correct: 0, total: 0 };

    streakText.textContent = streak + "일째 연속 방문 중";
    renderDday(today);
    renderToday();
    renderFavorites();
    renderMistakes();
    renderQuiz();
  }

  // ---------- init ----------
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      currentUser = session.user;
      authScreen.hidden = true;
      appShell.hidden = false;
      loadApp(currentUser);
    } else {
      currentUser = null;
      appShell.hidden = true;
      authScreen.hidden = false;
      authForm.reset();
    }
  });
})();
