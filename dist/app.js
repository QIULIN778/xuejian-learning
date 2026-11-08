const state = {
  data: null,
  view: "practice",
  role: "student",
  mode: loadMode(),
  meridian: "全部经脉",
  queue: [],
  current: null,
  options: [],
  answered: false,
  sessionIndex: 0,
  sessionCorrect: 0,
  stats: loadStats(),
  favorites: loadFavorites(),
};

const root = document.querySelector("#view-root");
const pageContext = document.querySelector("#page-context");
const imagePreloadCache = new Map();

function loadStats() {
  try {
    return window.XuejianReviewScheduler.normalize(JSON.parse(localStorage.getItem("xuejian-progress-v1")));
  } catch (_) {
    return window.XuejianReviewScheduler.normalize({});
  }
}

function writeLocalStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* 浏览器隐私模式下保留当前会话状态 */ }
}

function loadMode() {
  try {
    return localStorage.getItem("xuejian-practice-mode-v1") === "test" ? "test" : "learn";
  } catch (_) {
    return "learn";
  }
}

function loadFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem("xuejian-favorites-v1"));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function saveMode() {
  writeLocalStorage("xuejian-practice-mode-v1", state.mode);
}

function saveStats() {
  writeLocalStorage("xuejian-progress-v1", JSON.stringify(state.stats));
  fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: "demo", progress: state.stats }) }).catch(() => {});
  const count = document.querySelector("#wrong-count");
  if (count) count.textContent = state.data.points.filter((point) => isImageQuizEligible(point) && (state.stats.wrongIds.includes(point.id) || window.XuejianReviewScheduler.due(state.stats.review[point.id]))).length;
}

function saveFavorites() {
  writeLocalStorage("xuejian-favorites-v1", JSON.stringify(state.favorites));
  fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: "demo", favorites: state.favorites }) }).catch(() => {});
}

function toggleFavorite(pointId) {
  state.favorites = state.favorites.includes(pointId) ? state.favorites.filter((id) => id !== pointId) : [...state.favorites, pointId];
  saveFavorites();
  const button = document.querySelector("#favorite-toggle");
  if (button) {
    const active = state.favorites.includes(pointId);
    button.classList.toggle("active", active);
    button.textContent = active ? "★ 已收藏" : "☆ 收藏";
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function loadTeacherList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function saveTeacherList(key, value) {
  writeLocalStorage(key, JSON.stringify(value));
}

function createTeacherRecord(endpoint, storageKey, payload, type) {
  const record = { ...payload, id: `${type}-${Date.now()}`, createdAt: new Date().toISOString() };
  const records = loadTeacherList(storageKey);
  records.unshift(record);
  saveTeacherList(storageKey, records);
  fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) }).catch(() => {});
  return record;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function assetUrl(relativePath) {
  if (!relativePath) return "";
  if (window.location.protocol === "file:") {
    const currentPath = decodeURIComponent(window.location.pathname || "").replace(/\\/g, "/");
    if (currentPath.includes("/dist/") || currentPath.includes("/site-publish/")) {
      return "asset/" + relativePath.split("/").map(encodeURIComponent).join("/");
    }
    return "../../修改后版本/第二步_图片与解析优化版/" + relativePath.split("/").map(encodeURIComponent).join("/");
  }
  return "asset/" + relativePath.split("/").map(encodeURIComponent).join("/");
}

function preloadPointImage(point) {
  if (!point?.imagePath || imagePreloadCache.has(point.imagePath)) return;
  const image = new Image();
  imagePreloadCache.set(point.imagePath, image);
  image.decoding = "async";
  image.src = assetUrl(point.imagePath);
}

function imageMarkup(point, className = "", eager = false) {
  if (!point?.imagePath) {
    return `<div class="image-placeholder"><div><strong>图片正在整理</strong><span>本题先保留在资料库，完成图片审核后开放测试。</span></div></div>`;
  }
  const loading = eager ? "eager" : "lazy";
  const priority = eager ? "high" : "auto";
  return `<img class="${className}" src="${assetUrl(point.imagePath)}" alt="${escapeHtml(point.meridian)}${escapeHtml(point.name)}学习图" loading="${loading}" decoding="async" fetchpriority="${priority}" aria-busy="true" data-point-image="${escapeHtml(point.id)}" />`;
}

function bindImageEvents() {
  document.querySelectorAll("img[data-point-image]").forEach((image) => {
    const stage = image.closest(".image-stage, .point-detail-image");
    if (!stage) return;
    stage.classList.add("image-is-loading");
    if (!stage.querySelector(".image-loading-label")) stage.insertAdjacentHTML("beforeend", '<span class="image-loading-label" aria-live="polite">图片加载中…</span>');
    const markLoaded = () => {
      image.classList.add("is-loaded");
      image.setAttribute("aria-busy", "false");
      stage.classList.remove("image-is-loading");
      stage.querySelector(".image-loading-label")?.remove();
    };
    image.addEventListener("load", markLoaded, { once: true });
    image.addEventListener("error", () => {
      image.setAttribute("aria-busy", "false");
      stage.classList.remove("image-is-loading");
      stage.classList.add("image-load-error");
      const source = image.getAttribute("src") || "";
      stage.innerHTML = `<div class="image-placeholder"><div><strong>图片暂时加载失败</strong><span>请检查网络后重试；题库答案和解析仍可查看。</span><button class="ghost-button image-retry" type="button">重新加载图片</button></div></div>`;
      stage.querySelector(".image-retry")?.addEventListener("click", () => {
        stage.classList.remove("image-load-error");
        stage.innerHTML = `<img class="${escapeHtml(image.className)}" src="${escapeHtml(source)}" alt="${escapeHtml(image.alt)}" loading="eager" decoding="async" fetchpriority="high" aria-busy="true" data-point-image="${escapeHtml(image.dataset.pointImage || "")}" />`;
        bindImageEvents();
      }, { once: true });
    }, { once: true });
    if (image.complete && image.naturalWidth > 0) markLoaded();
  });
}

function imageReviewNote(point, hidden = false) {
  if (point && (point.id === "LI8" || point.id === "LI9")) return '<div id="image-review-note" class="image-review-note"><strong>原图说明</strong><span>这张抽象图没有前臂或穴位点，只用于穴名联想。</span><em>实际定位请以现代定位文字为准</em></div>';
  if (point?.imageUsage === "name_mnemonic_only" && hidden) return '<div id="image-review-note" class="image-review-note"><strong>穴名联想图</strong><span>这张图用于记名称，不显示可据以取穴的点位。</span><em>答题后查看标准定位</em></div>';
  if (hidden) return '<div id="image-review-note" class="image-review-note"><strong>测试模式</strong><span>提交答案后显示图片线索与原著依据。</span><em>先按教材定位作答</em></div>';
  const status = point?.imageMarkerStatus || "图中目标点/参照点状态待人工确认";
  const clue = point?.imageClue || point?.visualCue || "先确认身体部位，再观察图中唯一目标点。";
  const markerNote = point?.imageUsage === "name_mnemonic_only" ? "仅用于穴名联想；不能据图取穴" : /未登记|待人工复核|待确认/.test(status) ? "正式原图未叠加红/灰标记；请结合原图和定位复核" : status;
  return `<div id="image-review-note" class="image-review-note"><strong>看图提示</strong><span>${escapeHtml(clue)}</span><em>${escapeHtml(markerNote)}</em></div>`;
}

async function loadQuestionBank() {
  if (window.location.protocol === "file:") {
    return window.XUEJIAN_STATIC_DATA || window.__STATIC_DATA__;
  }
  try {
    const response = await fetch("/api/points");
    if (response.ok) return response.json();
  } catch (_) {
    // 静态托管版本没有 API 时，继续使用内置题库。
  }
  if (window.XUEJIAN_STATIC_DATA || window.__STATIC_DATA__) {
    return window.XUEJIAN_STATIC_DATA || window.__STATIC_DATA__;
  }
  throw new Error("题库接口不可用，且未找到静态题库");
}

function isImageQuizEligible(point) {
  return Boolean(point.imagePath && point.id !== "LI8" && point.id !== "LI9");
}

function currentPool() {
  if (state.view === "review") {
    const now = Date.now();
    return state.data.points.filter((point) => isImageQuizEligible(point) && (state.stats.wrongIds.includes(point.id) || window.XuejianReviewScheduler.due(state.stats.review[point.id], now)));
  }
  if (state.meridian === "全部经脉") return state.data.points.filter(isImageQuizEligible);
  return state.data.points.filter((point) => isImageQuizEligible(point) && point.meridian === state.meridian);
}

function makeOptions(answer) {
  const sameMeridian = state.data.points.filter((point) => point.id !== answer.id && point.meridian === answer.meridian);
  const meridianPoints = state.data.points.filter((point) => point.meridian === answer.meridian);
  const answerIndex = meridianPoints.findIndex((point) => point.id === answer.id);
  const nearby = answerIndex >= 0 ? meridianPoints.slice(Math.max(0, answerIndex - 2), answerIndex + 3).filter((point) => point.id !== answer.id) : [];
  const similarName = state.data.points.filter((point) => {
    if (point.id === answer.id) return false;
    const shared = [...answer.name].filter((char) => char.length > 0 && point.name.includes(char)).length;
    return shared > 0;
  });
  const others = state.data.points.filter((point) => point.id !== answer.id && point.meridian !== answer.meridian);
  const ordered = [...shuffle(nearby), ...shuffle(similarName), ...shuffle(sameMeridian), ...shuffle(others)];
  const distractors = [...new Map(ordered.map((point) => [point.id, point])).values()].slice(0, 3);
  return shuffle([answer, ...distractors]);
}

function startSession() {
  const pool = currentPool();
  state.queue = window.XuejianReviewScheduler.select(state.stats, pool, Math.min(10, pool.length));
  state.sessionIndex = 0;
  state.sessionCorrect = 0;
  state.sessionRetries = {};
  state.current = null;
  nextQuestion();
}

function nextQuestion() {
  if (!state.queue.length) {
    renderEmptyReview();
    return;
  }
  if (state.sessionIndex >= state.queue.length) {
    renderSessionComplete();
    return;
  }
  state.current = state.queue[state.sessionIndex];
  state.options = makeOptions(state.current);
  state.answered = false;
  renderPractice();
  preloadPointImage(state.queue[state.sessionIndex + 1]);
}

function selectAnswer(optionId) {
  if (state.answered || !state.current) return;
  state.answered = true;
  const isCorrect = optionId === state.current.id;
  window.XuejianReviewScheduler.record(state.stats, state.current.id, isCorrect);
  if (isCorrect) {
    state.sessionCorrect += 1;
  } else {
    const retries = state.sessionRetries[state.current.id] || 0;
    if (retries < 2) {
      state.sessionRetries[state.current.id] = retries + 1;
      state.queue.splice(Math.min(state.sessionIndex + 3, state.queue.length), 0, state.current);
    }
  }
  saveStats();
  document.querySelectorAll(".option-button").forEach((button) => {
    const id = button.dataset.id;
    button.disabled = true;
    if (id === state.current.id) button.classList.add("correct");
    if (id === optionId && !isCorrect) button.classList.add("wrong");
  });
  const feedback = document.querySelector("#feedback-panel");
  feedback.classList.add("visible");
  const reviewNote = document.querySelector("#image-review-note");
  if (reviewNote && state.mode === "test") reviewNote.outerHTML = imageReviewNote(state.current);
  feedback.querySelector(".feedback-title").className = `feedback-title ${isCorrect ? "good" : "bad"}`;
  feedback.querySelector(".feedback-title").textContent = isCorrect ? "答对了 · 线索已经连上" : `再看一眼 · 正确答案是 ${state.current.name}（累计错 ${state.stats.review[state.current.id].errors} 次）`;
  feedback.querySelector(".feedback-copy").textContent = state.current.imageClue || state.current.visualCue || "先确认身体部位，再观察图中唯一目标点。";
  feedback.querySelector(".explanation-copy").textContent = state.current.explanation || "这道题的解析正在整理中。";
  feedback.querySelector(".location-copy").textContent = state.current.locationText || "当前资料未提供结构化现代定位；请以教材和配套定位图复核。";
  feedback.querySelector(".memory-copy").textContent = state.current.memoryHint || "先定位身体部位，再用图中线索记忆。";
  feedback.querySelector(".source-copy").textContent = state.current.originalBasis || state.current.sourceExcerpt || "暂无原著摘录。";
  document.querySelector("#next-question").textContent = state.sessionIndex === state.queue.length - 1 ? "查看本组结果" : "下一题";
}

function renderPractice() {
  pageContext.textContent = state.view === "review" ? "错题复习" : "识图学习";
  const point = state.current;
  if (!point) return renderEmptyReview();
  const isReview = state.view === "review";
  const reviewCount = currentPool().length;
  const letters = ["A", "B", "C", "D"];
  const optionsHtml = state.options.map((option, index) => `
    <button class="option-button" data-id="${escapeHtml(option.id)}">
      <span class="option-letter">${letters[index]}</span><span>${escapeHtml(option.name)}</span>
    </button>
  `).join("");
  const image = imageMarkup(point, "question-image", true);
  root.innerHTML = `
    <div class="welcome-row">
      <div><div class="eyebrow">IMAGE-BASED LEARNING</div><h1>${isReview ? "把错过的穴位，再看一遍" : "让穴位记忆有画面"}</h1><p class="lead">${isReview ? `当前复习队列 ${reviewCount} 个穴位，答对后会自动移出待复习列表。` : state.mode === "learn" ? "从图像线索出发，先做选择，再用来源可追溯的原著摘录把位置和命名连起来。下廉、上廉原图缺点，留在图鉴中学习。" : "测试模式：只看图片和选项，完成作答后再查看解析。"}</p></div>
      <div class="session-controls">
        <select class="select-control" id="meridian-select" aria-label="选择经脉">${meridianOptions(true)}</select>
        <button class="ghost-button" id="mode-toggle" type="button">${state.mode === "learn" ? "学习模式" : "测试模式"}</button>
        ${isReview ? '<button class="ghost-button" id="leave-review" type="button">返回识图学习</button>' : ""}
        <button class="ghost-button" id="restart-session">换一组题</button>
      </div>
    </div>
    <div class="dashboard-grid">
      <section class="question-card">
        <div class="question-topline"><span class="section-kicker">${escapeHtml(point.meridian)} · ${state.mode === "test" ? "待作答" : escapeHtml(point.id)}</span><span class="question-index">${state.sessionIndex + 1} / ${state.queue.length}</span><button class="tiny-link ${state.favorites.includes(point.id) ? "active" : ""}" id="favorite-toggle" type="button" aria-pressed="${state.favorites.includes(point.id) ? "true" : "false"}">${state.favorites.includes(point.id) ? "★ 已收藏" : "☆ 收藏"}</button></div>
        ${isReview ? `<p class="special-instruction">本题累计答错 ${state.stats.review[point.id]?.errors || 0} 次；答对后按复习间隔再次出现。</p>` : ''}
        <div class="image-stage">${image}</div>
        ${imageReviewNote(point, state.mode === "test")}
        <div class="question-prompt"><h2>这张图对应哪个穴位？</h2><span class="hint-chip">${state.mode === "learn" ? "先看部位，再看线索" : "测试模式 · 提示已隐藏"}</span></div>
        <div class="options">${optionsHtml}</div>
        <div class="feedback-panel" id="feedback-panel">
          <div class="feedback-title"></div>
          <p class="feedback-copy"></p>
          <details open><summary>查看分层解析（来源可追溯）</summary><p class="explanation-copy"></p></details>
          <details><summary>现代定位 <span class="review-badge">${escapeHtml(point.locationStatus || "待复核")}</span></summary><p class="location-copy"></p></details>
          <details><summary>记忆提示</summary><p class="memory-copy"></p></details>
          <details><summary>原著依据</summary><p class="source-copy"></p></details>
        </div>
        <div class="next-row"><button class="primary-button" id="next-question">选择答案后继续</button></div>
      </section>
      ${renderSideColumn()}
    </div>
  `;
  bindPracticeEvents();
  bindImageEvents();
}

function renderSideColumn() {
  const total = state.stats.total;
  const accuracy = total ? Math.round((state.stats.correct / total) * 100) : 0;
  const quizCount = state.data.points.filter(isImageQuizEligible).length;
  const seen = state.data.points.filter((point) => isImageQuizEligible(point) && state.stats.seenIds.includes(point.id)).length;
  const degrees = Math.round(Math.min(100, (seen / quizCount) * 100) * 3.6);
  const topWrong = state.data.points.filter((point) => isImageQuizEligible(point) && (state.stats.review[point.id]?.errors || 0) > 0).sort((a, b) => (state.stats.review[b.id]?.errors || 0) - (state.stats.review[a.id]?.errors || 0)).slice(0, 3);
  const dueCount = state.data.points.filter((point) => isImageQuizEligible(point) && (state.stats.wrongIds.includes(point.id) || window.XuejianReviewScheduler.due(state.stats.review[point.id]))).length;
  return `
    <aside class="side-column">
      <section class="side-card">
        <div class="side-card-header"><h3>我的学习进度</h3><button class="tiny-link" data-view-link="teacher">查看数据</button></div>
        <div class="progress-ring"><div class="ring" style="background: conic-gradient(var(--coral) ${degrees}deg, #eee9df ${degrees}deg)"><span class="ring-number">${Math.round((seen / quizCount) * 100)}%</span></div><div class="progress-copy"><strong>${seen ? "继续保持" : "从第一题开始"}</strong><span>已接触 ${seen} / ${quizCount} 个可识图穴位<br />完成一组题就会留下学习记录</span></div></div>
        <div class="stat-row"><div class="stat-item"><strong>${total}</strong><span>累计答题</span></div><div class="stat-item"><strong>${accuracy}%</strong><span>正确率</span></div><div class="stat-item"><strong>${dueCount}</strong><span>待复习</span></div></div>
      </section>
      <section class="side-card"><div class="side-card-header"><h3>记忆复习节奏</h3><span class="feature-tag">间隔复习</span></div><p class="empty-note">答错题稍后重现；答对后按 1、3、7、14 天等间隔复习。错得越多，下次复习越早。</p><div class="review-timeline"><span>1 天</span><span>3 天</span><span>7 天</span><span>14 天</span></div></section>
      <section class="side-card"><div class="side-card-header"><h3>易错穴位</h3><button class="tiny-link" data-view-link="review">复习</button></div>${topWrong.length ? `<div class="memory-list">${topWrong.map((point) => `<div class="memory-item"><span class="memory-dot">${escapeHtml(point.id.replace(/\d/g, ""))}</span><div><strong>${escapeHtml(point.name)}</strong><span>${escapeHtml(point.meridian)}</span></div><em>错 ${state.stats.review[point.id].errors} 次</em></div>`).join("")}</div>` : `<div class="empty-note">做错的题目会自动出现在这里。</div>`}</section>
    </aside>
  `;
}

function meridianOptions(quizOnly = false) {
  const points = quizOnly ? state.data.points.filter(isImageQuizEligible) : state.data.points;
  return [`<option value="全部经脉">全部经脉 · ${points.length}</option>`, ...state.data.meridians.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} · ${points.filter((p) => p.meridian === name).length}</option>`)].join("");
}

function bindPracticeEvents() {
  document.querySelector("#meridian-select").value = state.meridian;
  document.querySelector("#meridian-select").addEventListener("change", (event) => { state.meridian = event.target.value; startSession(); });
  document.querySelector("#mode-toggle").addEventListener("click", () => {
    if (state.answered) return;
    state.mode = state.mode === "learn" ? "test" : "learn";
    saveMode();
    renderPractice();
  });
  const leaveReview = document.querySelector("#leave-review");
  if (leaveReview) leaveReview.addEventListener("click", () => setView("practice"));
  document.querySelector("#restart-session").addEventListener("click", startSession);
  document.querySelector("#favorite-toggle").addEventListener("click", () => toggleFavorite(state.current.id));
  document.querySelectorAll(".option-button").forEach((button) => button.addEventListener("click", () => selectAnswer(button.dataset.id)));
  document.querySelector("#next-question").addEventListener("click", () => { if (!state.answered) return; state.sessionIndex += 1; nextQuestion(); });
  document.querySelectorAll("[data-view-link]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewLink)));
}

function renderSessionComplete() {
  pageContext.textContent = state.view === "review" ? "错题复习" : "识图学习";
  const accuracy = state.queue.length ? Math.round((state.sessionCorrect / state.queue.length) * 100) : 0;
  root.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><h3>这一组完成了</h3><p>本组答对 ${state.sessionCorrect} / ${state.queue.length} 题，正确率 ${accuracy}%。错题已经自动加入复习队列。</p><div style="margin-top:18px"><button class="primary-button" id="restart-session">再来一组</button></div></div>`;
  document.querySelector("#restart-session").addEventListener("click", startSession);
}

function renderEmptyReview() {
  pageContext.textContent = "错题复习";
  root.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div><h3>暂时没有待复习穴位</h3><p>完成识图练习后，答错的穴位会自动出现在这里。先去做一组题，让系统了解你的学习节奏。</p><div style="margin-top:18px"><button class="primary-button" id="go-practice">开始练习</button></div></div>`;
  document.querySelector("#go-practice").addEventListener("click", () => setView("practice"));
}

function pointDetails(point) {
  if (!point) return `<div class="empty-note">请选择一个穴位查看详情。</div>`;
  const image = imageMarkup(point, "detail-image");
  return `<div class="point-detail-inner"><div class="point-detail-image">${image}</div><div><div class="section-kicker">${escapeHtml(point.meridian)} · ${escapeHtml(point.id)}</div><h3>${escapeHtml(point.name)}</h3><p class="detail-answer">正确答案：${escapeHtml(point.answerText || `${point.name}（${point.id}，${point.meridian}）`)}</p><p><strong>现代定位：</strong>${escapeHtml(point.locationText || "待复核")}</p><p><strong>图片线索：</strong>${escapeHtml(point.imageClue || point.visualCue || "")}</p><p><strong>图像审核：</strong>${escapeHtml(point.imageMarkerStatus || "目标点/参照点状态待人工确认")}</p><p><strong>记忆提示：</strong>${escapeHtml(point.memoryHint || "")}</p><details><summary>原著依据</summary><p>${escapeHtml(point.originalBasis || point.sourceExcerpt || "暂无摘录")}</p></details><div class="category-chips">${(point.specialCategories || []).map((item) => `<span class="feature-tag">${escapeHtml(item)}</span>`).join("") || "<span class=\"empty-note\">未登记特定穴分类</span>"}</div></div></div>`;
}

function renderPointsExplorer() {
  pageContext.textContent = "穴位图鉴";
  const meridian = state.meridian === "全部经脉" ? state.data.meridians[0] : state.meridian;
  const points = state.data.points.filter((point) => point.meridian === meridian);
  root.innerHTML = `<div class="feature-hero"><div><div class="eyebrow">POINT EXPLORER</div><h2>先看懂一条经脉，再记住穴位</h2><p>按经脉浏览同一套 309 个穴位资料；点击卡片查看图片、原著依据、现代定位和记忆提示。</p></div><div class="feature-orbit"><div class="orbit-core">穴</div></div></div><div class="explorer-toolbar"><select class="select-control" id="explorer-meridian">${meridianOptions()}</select><span class="feature-tag">静态资料版 · 不依赖实时 AI</span></div><div class="explorer-layout"><section class="point-list" id="point-list">${points.map((point) => `<button class="point-list-item" data-point-id="${escapeHtml(point.id)}"><strong>${escapeHtml(point.id)} · ${escapeHtml(point.name)}</strong><span>${escapeHtml((point.imageClue || point.visualCue || "").slice(0, 38))}</span></button>`).join("")}</section><section class="point-detail-card" id="point-detail">${pointDetails(points[0])}</section></div>`;
  document.querySelector("#explorer-meridian").value = meridian;
  bindImageEvents();
  document.querySelector("#explorer-meridian").addEventListener("change", (event) => { state.meridian = event.target.value; renderPointsExplorer(); });
  document.querySelectorAll(".point-list-item").forEach((button) => button.addEventListener("click", () => { const point = state.data.points.find((item) => item.id === button.dataset.pointId); document.querySelectorAll(".point-list-item").forEach((item) => item.classList.toggle("active", item === button)); document.querySelector("#point-detail").innerHTML = pointDetails(point); bindImageEvents(); }));
  const first = document.querySelector(".point-list-item");
  if (first) first.classList.add("active");
}

function renderMatchGame(selectedCategory = null) {
  pageContext.textContent = "穴位消消乐";
  const categories = Object.keys(state.data.categoryIndex || {}).filter((name) => (state.data.categoryIndex[name] || []).length >= 4);
  const category = categories.includes(selectedCategory) ? selectedCategory : (categories[0] || "五输穴");
  const ids = shuffle(state.data.categoryIndex?.[category] || []).slice(0, 12);
  const unique = [...new Set(ids)].slice(0, 12);
  const cards = shuffle(unique.map((id) => state.data.points.find((point) => point.id === id)).filter(Boolean));
  let selected = [];
  let matched = new Set();
  const categoryOptions = categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}（${state.data.categoryIndex[name].length}穴）</option>`).join("");
  root.innerHTML = `<div class="feature-hero"><div><div class="eyebrow">CATEGORY MATCH</div><h2>把特定穴分类，变成一场配对游戏</h2><p>先选择一个分类，再点击两个同类穴位配对。系统只使用题库已登记的分类，不把 AI 推测写入游戏规则。</p></div><div class="feature-orbit"><div class="orbit-core">连</div></div></div><div class="explorer-toolbar"><label class="match-category-picker">分类<select class="select-control" id="match-category">${categoryOptions}</select></label><span id="match-status" class="empty-note">已配对 0 / ${Math.floor(cards.length / 2)} 组</span><button class="ghost-button" id="match-reset" type="button">重新开局</button></div><section class="match-board" id="match-board">${cards.map((point) => `<button class="match-card" data-point-id="${escapeHtml(point.id)}"><strong>${escapeHtml(point.name)}</strong><span>${escapeHtml(point.id)} · ${escapeHtml(point.meridian.replace("经", ""))}</span></button>`).join("")}</section><section class="dashboard-card match-explain"><h3>${escapeHtml(category)}分类说明</h3><p>分类来源：平台统一特定穴登记表。配对成功后，可回到“穴位连点看”查看该穴位的原著依据、现代定位和图片线索。</p></section>`;
  const categorySelect = document.querySelector("#match-category");
  categorySelect.value = category;
  categorySelect.addEventListener("change", (event) => renderMatchGame(event.target.value));
  const status = document.querySelector("#match-status");
  document.querySelector("#match-reset").addEventListener("click", () => renderMatchGame(category));
  document.querySelectorAll(".match-card").forEach((button) => button.addEventListener("click", () => {
    if (matched.has(button.dataset.pointId) || selected.length >= 2) return;
    selected.push(button); button.classList.add("selected");
    if (selected.length < 2) return;
    const a = state.data.points.find((point) => point.id === selected[0].dataset.pointId);
    const b = state.data.points.find((point) => point.id === selected[1].dataset.pointId);
    const same = (a.specialCategories || []).some((item) => (b.specialCategories || []).includes(item));
    const attempted = selected;
    if (same) { attempted.forEach((item) => { item.classList.add("matched"); matched.add(item.dataset.pointId); }); }
    else { attempted.forEach((item) => item.classList.add("mismatch")); setTimeout(() => attempted.forEach((item) => { item.classList.remove("selected", "mismatch"); }), 500); }
    selected = [];
    status.textContent = `已配对 ${Math.floor(matched.size / 2)} / ${Math.floor(cards.length / 2)} 组`;
  }));
}

function renderFramework(view) {
  if (view === "atlas") return renderPointsExplorer();
  if (view === "points") return renderSpecialLinkGame();
  return renderSpecialMatchGame();
}

function renderTeacher() {
  pageContext.textContent = "教师看板";
  const accuracy = state.stats.total ? Math.round((state.stats.correct / state.stats.total) * 100) : 0;
  const seenPercent = Math.round((state.stats.seenIds.length / state.data.pointCount) * 100);
  const originalImages = state.data.points.filter((point) => point.imageStatus === "原始主图（保留）").length;
  const supplementImages = state.data.points.filter((point) => point.imageStatus === "补图（保留）").length;
  const reviewedImages = originalImages + supplementImages;
  const classes = loadTeacherList("xuejian-classes-v1");
  const assignments = loadTeacherList("xuejian-assignments-v1");
  const rows = state.data.meridians.map((name) => {
    const count = state.data.points.filter((p) => p.meridian === name).length;
    const seen = state.data.points.filter((p) => p.meridian === name && state.stats.seenIds.includes(p.id)).length;
    return `<tr><td>${escapeHtml(name)}</td><td>${count}</td><td><div class="bar-track"><div class="bar-fill" style="width:${count ? Math.round((seen / count) * 100) : 0}%"></div></div></td><td>${seen}/${count}</td></tr>`;
  }).join("");
  const classOptions = classes.length ? classes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("") : '<option value="">先创建班级</option>';
  const classRows = classes.length ? classes.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.grade || "未填写年级")} · ${new Date(item.createdAt).toLocaleDateString("zh-CN")}</span></li>`).join("") : '<li class="empty-note">还没有班级，先创建一个。</li>';
  const assignmentRows = assignments.length ? assignments.slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meridian || "全部经脉")} · ${escapeHtml(item.count || "10")} 题 · ${escapeHtml(item.className || "未指定班级")}</span></li>`).join("") : '<li class="empty-note">还没有作业，创建后会出现在这里。</li>';
  root.innerHTML = `<div class="dashboard-header"><div><div class="eyebrow">TEACHER CONSOLE</div><h2>班级学习概览</h2><p>教师端电脑和手机共用此页面；当前支持本地班级与作业演示，接入微信登录后替换为云端数据。</p></div><div class="dashboard-actions"><button class="ghost-button" id="export-progress">导出本地记录</button><button class="primary-button" id="back-student">进入学生练习</button></div></div><div class="dashboard-stats"><div class="dashboard-card"><span class="dash-label">题库穴位</span><strong class="dash-number">${state.data.pointCount}</strong><span class="dash-note">十二经脉已接入</span></div><div class="dashboard-card"><span class="dash-label">经脉数量</span><strong class="dash-number">${state.data.meridians.length}</strong><span class="dash-note">可按经脉布置练习</span></div><div class="dashboard-card"><span class="dash-label">当前答题</span><strong class="dash-number">${state.stats.total}</strong><span class="dash-note">本地演示记录</span></div><div class="dashboard-card"><span class="dash-label">正确率</span><strong class="dash-number">${accuracy}%</strong><span class="dash-note">接入班级后按学生统计</span></div></div><section class="dashboard-card teacher-workbench"><div class="side-card-header"><h3>班级与作业</h3><span class="feature-tag">${classes.length} 个班级 · ${assignments.length} 个作业</span></div><div class="teacher-form-grid"><form id="class-form" class="teacher-form"><strong>创建班级</strong><label>班级名称<input name="name" required placeholder="例如：针灸基础一班" /></label><label>年级或备注<input name="grade" placeholder="例如：2026 春季" /></label><button class="primary-button" type="submit">保存班级</button></form><form id="assignment-form" class="teacher-form"><strong>布置识图作业</strong><label>作业名称<input name="title" required placeholder="例如：手阳明大肠经复习" /></label><label>班级<select name="classId">${classOptions}</select></label><label>经脉<select name="meridian">${meridianOptions()}</select></label><label>题量<select name="count"><option>10</option><option>20</option><option>30</option></select></label><button class="primary-button" type="submit">保存作业</button></form></div><div class="teacher-lists"><div><h4>班级列表</h4><ul>${classRows}</ul></div><div><h4>最近作业</h4><ul>${assignmentRows}</ul></div></div></section><section class="dashboard-card table-card"><h3>十二经脉学习覆盖</h3><table class="meridian-table"><thead><tr><th>经脉</th><th>穴位数</th><th>覆盖进度</th><th>已学习</th></tr></thead><tbody>${rows}</tbody></table></section><section class="dashboard-card" style="margin-top:18px"><span class="dash-label">当前浏览器覆盖率</span><strong class="dash-number">${seenPercent}%</strong><span class="dash-note">正式版将替换为班级整体数据，并提供完成率、正确率、易错穴位和经脉对比。</span></section><section class="dashboard-card" style="margin-top:18px"><div class="side-card-header"><h3>正式图片版本</h3><span class="feature-tag">${escapeHtml(state.data.version)}</span></div><div class="stat-row" style="margin-top:0"><div class="stat-item"><strong>${originalImages}</strong><span>原始主图</span></div><div class="stat-item"><strong>${supplementImages}</strong><span>补图</span></div><div class="stat-item"><strong>${reviewedImages}/${state.data.pointCount}</strong><span>已纳入题库</span></div></div><p class="empty-note" style="margin-top:14px">当前正式题库不引用后续优化图和第三步试验图。</p></section>`;
  document.querySelector("#export-progress").addEventListener("click", exportLocalProgress);
  document.querySelector("#back-student").addEventListener("click", () => setView("practice"));
  document.querySelector("#class-form").addEventListener("submit", (event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); createTeacherRecord("/api/classes", "xuejian-classes-v1", { name: data.get("name"), grade: data.get("grade") }, "class"); renderTeacher(); });
  document.querySelector("#assignment-form").addEventListener("submit", (event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const classId = data.get("classId"); const classItem = classes.find((item) => item.id === classId); createTeacherRecord("/api/assignments", "xuejian-assignments-v1", { title: data.get("title"), classId, className: classItem?.name || "未指定班级", meridian: data.get("meridian"), count: data.get("count") }, "assignment"); renderTeacher(); });
}

function renderAdmin() {
  pageContext.textContent = "管理后台";
  const categoryCount = Object.keys(state.data.categoryIndex || {}).length;
  const isLocationPending = (point) => !String(point.locationStatus || "").includes("已填");
  const isImagePending = (point) => !String(point.imageMarkerStatus || "").includes("已确认");
  const pending = state.data.points.filter(isLocationPending).length;
  const filters = [{ value: "all", label: "全部检查" }, { value: "location", label: "现代定位待补齐" }, { value: "image", label: "图片标记待确认" }];
  let activeFilter = "all";
  try { activeFilter = sessionStorage.getItem("xuejian-admin-filter") || "all"; } catch (_) { activeFilter = "all"; }
  const matches = (point, filter) => filter === "all" ? (isLocationPending(point) || isImagePending(point)) : (filter === "location" ? isLocationPending(point) : isImagePending(point));
  const render = (filter) => {
    const queue = state.data.points.filter((point) => matches(point, filter));
    const rows = queue.slice(0, 24).map((point) => `<tr><td><strong>${escapeHtml(point.id)} · ${escapeHtml(point.name)}</strong><span class="table-subtext">${escapeHtml(point.meridian)}</span></td><td>${escapeHtml(point.locationStatus || "待复核")}</td><td>${escapeHtml(point.imageMarkerStatus || "待确认")}</td><td><span class="feature-tag">${escapeHtml(point.reviewStatus || "待审")}</span></td></tr>`).join("") || '<tr><td colspan="4" class="empty-note">当前筛选没有待审条目。</td></tr>';
    const optionHtml = filters.map((item) => `<option value="${item.value}" ${item.value === filter ? "selected" : ""}>${item.label}</option>`).join("");
    root.innerHTML = `<div class="dashboard-header"><div><div class="eyebrow">ADMIN CONSOLE</div><h2>题库与发布检查</h2><p>管理端与教师端共用响应式页面；当前为本地演示，不依赖实时 AI 或云端登录。</p></div><div class="dashboard-actions"><button class="ghost-button" id="admin-export">导出题库摘要</button><button class="primary-button" id="admin-student">进入学生练习</button></div></div><div class="dashboard-stats"><div class="dashboard-card"><span class="dash-label">题库条目</span><strong class="dash-number">${state.data.pointCount}</strong><span class="dash-note">309 个穴位</span></div><div class="dashboard-card"><span class="dash-label">来源摘录</span><strong class="dash-number">${state.data.points.filter((p) => p.originalBasis).length}</strong><span class="dash-note">全部可追溯</span></div><div class="dashboard-card"><span class="dash-label">特定穴分类</span><strong class="dash-number">${categoryCount}</strong><span class="dash-note">统一分类表</span></div><div class="dashboard-card"><span class="dash-label">定位复核</span><strong class="dash-number">${pending}</strong><span class="dash-note">待补齐定位</span></div></div><section class="dashboard-card" style="margin-top:18px"><div class="side-card-header"><h3>发布前固定检查</h3><span class="feature-tag">${escapeHtml(state.data.version)}</span></div><p class="empty-note">正式图片：${state.data.points.filter((p) => p.imageStatus === "原始主图（保留）").length} 张原始主图 + ${state.data.points.filter((p) => p.imageStatus === "补图（保留）").length} 张补图（神门、睛明、浮郄）。不引用第二步优化图或第三步试验图。</p><div class="category-chips">${Object.entries(state.data.categoryIndex || {}).map(([name, ids]) => `<span class="feature-tag">${escapeHtml(name)} ${ids.length}</span>`).join("")}</div></section><section class="dashboard-card table-card review-queue"><div class="side-card-header"><div><h3>人工复核队列</h3><p class="empty-note">共 ${queue.length} 条，当前展示前 ${Math.min(queue.length, 24)} 条；先复核现代定位和图片标记，不将 AI 推测写成原著依据。</p></div><label class="review-filter">筛选<select id="review-filter">${optionHtml}</select></label></div><table class="meridian-table"><thead><tr><th>穴位</th><th>现代定位</th><th>图片标记</th><th>解析状态</th></tr></thead><tbody>${rows}</tbody></table></section><section class="dashboard-card" style="margin-top:18px"><h3>审核规则</h3><p class="empty-note">原著依据、现代定位、图片线索和记忆提示分层显示；现代定位已按现行国家标准填入；图片标记仍需逐图确认，不能把 AI 推测写成原著观点。</p></section>`;
    document.querySelector("#admin-student").addEventListener("click", () => setView("practice"));
    document.querySelector("#review-filter").addEventListener("change", (event) => { try { sessionStorage.setItem("xuejian-admin-filter", event.target.value); } catch (_) {} render(event.target.value); });
    document.querySelector("#admin-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify({ version: state.data.version, pointCount: state.data.pointCount, categories: state.data.categoryIndex, reviewQueue: queue }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "xuejian-question-bank-summary.json"; anchor.click(); URL.revokeObjectURL(url);
    });
  };
  render(activeFilter);
}

function exportLocalProgress() {
  const payload = {
    exportedAt: new Date().toISOString(),
    datasetVersion: state.data.version,
    pointCount: state.data.pointCount,
    meridianCount: state.data.meridians.length,
    progress: state.stats,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `xuejian-progress-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  const button = document.querySelector("#export-progress");
  if (button) {
    button.textContent = "已导出记录";
    setTimeout(() => { button.textContent = "导出本地记录"; }, 1800);
  }
}

function setView(view) {
  if (typeof specialStop === "function") specialStop();
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  if (view === "teacher") { renderTeacher(); return; }
  if (view === "admin") { renderAdmin(); return; }
  if (view === "points" || view === "match" || view === "atlas") { renderFramework(view); return; }
  startSession();
}

function renderMeridianList() {
  const list = document.querySelector("#meridian-list");
  const counts = {};
  state.data.points.forEach((point) => { counts[point.meridian] = (counts[point.meridian] || 0) + 1; });
  list.innerHTML = `<button class="meridian-button active" data-meridian="全部经脉"><span>全部经脉</span><span class="meridian-count">${state.data.pointCount}</span></button>` + state.data.meridians.map((name) => `<button class="meridian-button" data-meridian="${escapeHtml(name)}"><span>${escapeHtml(name.replace("经", ""))}</span><span class="meridian-count">${counts[name]}</span></button>`).join("");
  list.querySelectorAll(".meridian-button").forEach((button) => button.addEventListener("click", () => { state.meridian = button.dataset.meridian; list.querySelectorAll(".meridian-button").forEach((b) => b.classList.toggle("active", b === button)); setView("practice"); }));
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
  document.querySelectorAll(".role-button").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".role-button").forEach((b) => { const active = b === button; b.classList.toggle("active", active); b.setAttribute("aria-pressed", active ? "true" : "false"); });
    state.role = button.dataset.role;
    if (state.role === "teacher") setView("teacher"); else if (state.role === "admin") setView("admin"); else setView("practice");
  }));
}

async function boot() {
  try {
    state.data = await loadQuestionBank();
    renderMeridianList();
    bindNavigation();
    saveStats();
    startSession();
  } catch (error) {
    root.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>题库加载失败</h3><p>请双击“启动穴见平台.bat”，或用浏览器打开 platform/public/index.html。</p></div>`;
    console.error(error);
  }
}

boot();
