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

  // ---------- 렌더링 대상 ----------
  const todayList = document.getElementById("todayList");
  const favoriteList = document.getElementById("favoriteList");
  const favoriteEmpty = document.getElementById("favoriteEmpty");
  const favoriteCount = document.getElementById("favoriteCount");
  const streakText = document.getElementById("streakText");
  const todayDate = document.getElementById("todayDate");

  let sentencePool = [];
  let todaySentences = [];
  let favoriteIds = new Set();

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
    favoriteList.innerHTML = "";
    const favSentences = sentencePool.filter(s => favoriteIds.has(s.id));
    favSentences.forEach(s => favoriteList.appendChild(createSentenceCardEl(s)));
    favoriteEmpty.hidden = favSentences.length !== 0;
    favoriteCount.textContent = String(favSentences.length);
  }

  async function toggleFavorite(id) {
    if (favoriteIds.has(id)) {
      const { error } = await supabase.from("favorites").delete().eq("sentence_id", id);
      if (error) { console.error("즐겨찾기 해제 실패:", error.message); return; }
      favoriteIds.delete(id);
    } else {
      const { error } = await supabase.from("favorites").insert({ sentence_id: id });
      if (error) { console.error("즐겨찾기 추가 실패:", error.message); return; }
      favoriteIds.add(id);
    }
    renderToday();
    renderFavorites();
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
  async function updateStreak(today) {
    const { data, error } = await supabase.from("streak").select("*").eq("id", 1).single();
    if (error) {
      console.error("연속 방문일 조회 실패:", error.message);
      return 0;
    }
    let count = data.count;
    if (data.last_visit === today) {
      // 오늘 이미 방문함 - 변경 없음
    } else if (data.last_visit === addDays(today, -1)) {
      count += 1;
    } else {
      count = 1;
    }
    const { error: updateError } = await supabase
      .from("streak")
      .update({ count, last_visit: today })
      .eq("id", 1);
    if (updateError) console.error("연속 방문일 갱신 실패:", updateError.message);
    return count;
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    const today = getTodayDateString();
    todayDate.textContent = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", weekday: "long"
    });

    const [{ data: sentences, error: sentencesError }, { data: favorites, error: favoritesError }, streak] = await Promise.all([
      supabase.from("sentences").select("*").order("created_at", { ascending: true }),
      supabase.from("favorites").select("sentence_id"),
      updateStreak(today)
    ]);

    if (sentencesError) console.error("문장 불러오기 실패:", sentencesError.message);
    if (favoritesError) console.error("즐겨찾기 불러오기 실패:", favoritesError.message);

    sentencePool = sentences || [];
    favoriteIds = new Set((favorites || []).map(f => f.sentence_id));
    todaySentences = pickTodaySentences(today, sentencePool);

    streakText.textContent = streak + "일째 연속 방문 중";
    renderToday();
    renderFavorites();
  });
})();
