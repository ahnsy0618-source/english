(function () {
  "use strict";

  // ---------- storage helpers ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable/full - fail silently, in-memory state still works for this session */
    }
  }
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

  // ---------- 문장 풀 ----------
  // NOTE: 출처는 특정 영상이 아닌 채널 홈(안정적으로 존재가 확인되는 링크)으로 연결한다.
  const SENTENCE_POOL = [
    { id: "s01", en: "Could you walk me through this report by tomorrow morning?", source: { label: "Business English Pod", url: "https://www.youtube.com/@BusinessEnglishPod" } },
    { id: "s02", en: "I'll follow up with the client after the meeting.", source: { label: "Business English Pod", url: "https://www.youtube.com/@BusinessEnglishPod" } },
    { id: "s03", en: "Let's touch base again once the numbers are finalized.", source: { label: "Business English Pod", url: "https://www.youtube.com/@BusinessEnglishPod" } },
    { id: "s04", en: "Sorry to interrupt, but could I add one more point?", source: { label: "BBC Learning English", url: "https://www.youtube.com/@bbclearningenglish" } },
    { id: "s05", en: "I really appreciate you taking the time to explain this.", source: { label: "BBC Learning English", url: "https://www.youtube.com/@bbclearningenglish" } },
    { id: "s06", en: "Would it be possible to reschedule our call to next week?", source: { label: "BBC Learning English", url: "https://www.youtube.com/@bbclearningenglish" } },
    { id: "s07", en: "How was your weekend? Did you get some rest?", source: { label: "Speak English with Vanessa", url: "https://www.youtube.com/@SpeakEnglishWithVanessa" } },
    { id: "s08", en: "I'm still getting used to the new system, but it's going well.", source: { label: "Speak English with Vanessa", url: "https://www.youtube.com/@SpeakEnglishWithVanessa" } },
    { id: "s09", en: "Let me double-check the figures before I send this out.", source: { label: "Speak English with Vanessa", url: "https://www.youtube.com/@SpeakEnglishWithVanessa" } },
    { id: "s10", en: "Thanks for your patience while we sort this out.", source: { label: "English with Lucy", url: "https://www.youtube.com/@EnglishwithLucy" } },
    { id: "s11", en: "I'll loop you in on the email thread.", source: { label: "English with Lucy", url: "https://www.youtube.com/@EnglishwithLucy" } },
    { id: "s12", en: "Can we push the deadline back by a couple of days?", source: { label: "English with Lucy", url: "https://www.youtube.com/@EnglishwithLucy" } },
    { id: "s13", en: "I'll get back to you as soon as I hear anything.", source: { label: "Rachel's English", url: "https://www.youtube.com/@rachelsenglish" } },
    { id: "s14", en: "It was great meeting you. Let's stay in touch.", source: { label: "Rachel's English", url: "https://www.youtube.com/@rachelsenglish" } },
    { id: "s15", en: "Just to confirm, the meeting starts at 9 sharp, right?", source: { label: "Rachel's English", url: "https://www.youtube.com/@rachelsenglish" } }
  ];

  function pickTodaySentenceIds(dateString) {
    const seed = hashString(dateString);
    const pool = SENTENCE_POOL.map(s => s.id);
    const picked = [];
    let cursor = seed;
    while (picked.length < 3 && pool.length > 0) {
      cursor = (cursor * 1103515245 + 12345) >>> 0;
      const idx = cursor % pool.length;
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  function getSentenceById(id) {
    return SENTENCE_POOL.find(s => s.id === id);
  }

  // ---------- 연속 방문일 ----------
  function updateStreak(today) {
    const lastVisit = load("ed.streak.lastVisit", null);
    let streak = load("ed.streak.count", 0);
    if (lastVisit === today) {
      // 오늘 이미 방문함 - 변경 없음
    } else if (lastVisit === addDays(today, -1)) {
      streak += 1;
    } else {
      streak = 1;
    }
    save("ed.streak.lastVisit", today);
    save("ed.streak.count", streak);
    return streak;
  }

  // ---------- 오늘의 문장 ----------
  function getTodaySentences(today) {
    let ids = load("ed.today.sentenceIds", null);
    const storedDate = load("ed.today.date", null);
    if (storedDate !== today || !Array.isArray(ids) || ids.length !== 3) {
      ids = pickTodaySentenceIds(today);
      save("ed.today.date", today);
      save("ed.today.sentenceIds", ids);
    }
    return ids.map(getSentenceById).filter(Boolean);
  }

  // ---------- 즐겨찾기 ----------
  let favorites = load("ed.favorites", []);
  function isFavorite(id) {
    return favorites.includes(id);
  }
  function toggleFavorite(id) {
    if (isFavorite(id)) {
      favorites = favorites.filter(f => f !== id);
    } else {
      favorites.push(id);
    }
    save("ed.favorites", favorites);
    renderToday();
    renderFavorites();
  }

  // ---------- 렌더링 ----------
  const todayList = document.getElementById("todayList");
  const favoriteList = document.getElementById("favoriteList");
  const favoriteEmpty = document.getElementById("favoriteEmpty");
  const favoriteCount = document.getElementById("favoriteCount");
  const streakText = document.getElementById("streakText");
  const todayDate = document.getElementById("todayDate");

  let todaySentences = [];

  function createSentenceCardEl(sentence) {
    const li = document.createElement("li");
    li.className = "sentence-card";
    li.dataset.id = sentence.id;

    const body = document.createElement("div");
    body.className = "sentence-card__body";

    const en = document.createElement("span");
    en.className = "sentence-card__en";
    en.textContent = sentence.en;
    body.appendChild(en);

    const source = document.createElement("span");
    source.className = "sentence-card__source";
    const link = document.createElement("a");
    link.href = sentence.source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "출처: " + sentence.source.label;
    source.appendChild(link);
    body.appendChild(source);

    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "star-btn" + (isFavorite(sentence.id) ? " is-active" : "");
    starBtn.textContent = isFavorite(sentence.id) ? "★" : "☆";
    starBtn.setAttribute("aria-label", "즐겨찾기 " + (isFavorite(sentence.id) ? "해제" : "추가"));

    li.appendChild(body);
    li.appendChild(starBtn);
    return li;
  }

  function renderToday() {
    todayList.innerHTML = "";
    todaySentences.forEach(s => todayList.appendChild(createSentenceCardEl(s)));
  }

  function renderFavorites() {
    favoriteList.innerHTML = "";
    const favSentences = favorites.map(getSentenceById).filter(Boolean);
    favSentences.forEach(s => favoriteList.appendChild(createSentenceCardEl(s)));
    favoriteEmpty.hidden = favSentences.length !== 0;
    favoriteCount.textContent = String(favSentences.length);
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

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", () => {
    const today = getTodayDateString();
    todayDate.textContent = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", weekday: "long"
    });
    const streak = updateStreak(today);
    streakText.textContent = streak + "일째 연속 방문 중 🔥";
    todaySentences = getTodaySentences(today);
    renderToday();
    renderFavorites();
  });
})();
