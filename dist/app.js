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
};

const root = document.querySelector("#view-root");
const pageContext = document.querySelector("#page-context");

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem("xuejian-progress-v1")) || { total: 0, correct: 0, wrongIds: [], seenIds: [] };
  } catch (_) {
    return { total: 0, correct: 0, wrongIds: [], seenIds: [] };
  }
}

function loadMode() {
  try {
    return localStorage.getItem("xuejian-practice-mode-v1") === "test" ? "test" : "learn";
  } catch (_) {
    return "learn";
  }
}

function saveMode() {
  localStorage.setItem("xuejian-practice-mode-v1", state.mode);
}

function saveStats() {
  localStorage.setItem("xuejian-progress-v1", JSON.stringify(state.stats));
  const count = document.querySelector("#wrong-count");
  if (count) count.textContent = state.stats.wrongIds.length;
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
    return "../../修改后版本/第二步_图片与解析优化版/" + relativePath.split("/").map(encodeURIComponent).join("/");
  }
  return "asset/" + relativePath.split("/").map(encodeURIComponent).join("/");
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

function currentPool() {
  if (state.view === "review") {
    return state.data.points.filter((point) => state.stats.wrongIds.includes(point.id));
  }
  if (state.meridian === "全部经脉") return state.data.points;
  return state.data.points.filter((point) => point.meridian === state.meridian);
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
  state.queue = shuffle(pool).slice(0, Math.min(10, pool.length));
  state.sessionIndex = 0;
  state.sessionCorrect = 0;
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
}

function selectAnswer(optionId) {
  if (state.answered || !state.current) return;
  state.answered = true;
  const isCorrect = optionId === state.current.id;
  state.stats.total += 1;
  state.stats.seenIds = [...new Set([...state.stats.seenIds, state.current.id])];
  if (isCorrect) {
    state.stats.correct += 1;
    state.sessionCorrect += 1;
    state.stats.wrongIds = state.stats.wrongIds.filter((id) => id !== state.current.id);
  } else if (!state.stats.wrongIds.includes(state.current.id)) {
    state.stats.wrongIds.push(state.current.id);
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
  feedback.querySelector(".feedback-title").className = `feedback-title ${isCorrect ? "good" : "bad"}`;
  feedback.querySelector(".feedback-title").textContent = isCorrect ? "答对了 · 线索已经连上" : `再看一眼 · 正确答案是 ${state.current.name}`;
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
  const reviewCount = state.data.points.filter((item) => state.stats.wrongIds.includes(item.id)).length;
  const letters = ["A", "B", "C", "D"];
  const optionsHtml = state.options.map((option, index) => `
    <button class="option-button" data-id="${escapeHtml(option.id)}">
      <span class="option-letter">${letters[index]}</span><span>${escapeHtml(option.name)}</span>
    </button>
  `).join("");
  const image = point.imagePath ? `<img src="${assetUrl(point.imagePath)}" alt="${escapeHtml(point.meridian)}穴位学习图" />` : `<div class="image-placeholder"><div><strong>图片正在整理</strong><span>本题先保留在资料库，完成图片审核后开放测试。</span></div></div>`;
  root.innerHTML = `
    <div class="welcome-row">
      <div><div class="eyebrow">IMAGE-BASED LEARNING</div><h1>${isReview ? "把错过的穴位，再看一遍" : "让穴位记忆有画面"}</h1><p class="lead">${isReview ? `当前复习队列 ${reviewCount} 个穴位，答对后会自动移出待复习列表。` : state.mode === "learn" ? "从图像线索出发，先做选择，再用 AI 辅助解析把位置和命名连起来。" : "测试模式：只看图片和选项，完成作答后再查看解析。"}</p></div>
      <div class="session-controls">
        <select class="select-control" id="meridian-select" aria-label="选择经脉">${meridianOptions()}</select>
        <button class="ghost-button" id="mode-toggle" type="button">${state.mode === "learn" ? "学习模式" : "测试模式"}</button>
        ${isReview ? '<button class="ghost-button" id="leave-review" type="button">返回识图学习</button>' : ""}
        <button class="ghost-button" id="restart-session">换一组题</button>
      </div>
    </div>
    <div class="dashboard-grid">
      <section class="question-card">
        <div class="question-topline"><span class="section-kicker">${escapeHtml(point.meridian)} · ${escapeHtml(point.id)}</span><span class="question-index">${state.sessionIndex + 1} / ${state.queue.length}</span></div>
        <div class="image-stage">${image}</div>
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
}

function renderSideColumn() {
  const total = state.stats.total;
  const accuracy = total ? Math.round((state.stats.correct / total) * 100) : 0;
  const seen = state.stats.seenIds.length;
  const degrees = Math.round(Math.min(100, (seen / state.data.pointCount) * 100) * 3.6);
  const topWrong = state.data.points.filter((point) => state.stats.wrongIds.includes(point.id)).slice(0, 3);
  return `
    <aside class="side-column">
      <section class="side-card">
        <div class="side-card-header"><h3>我的学习进度</h3><button class="tiny-link" data-view-link="teacher">查看数据</button></div>
        <div class="progress-ring"><div class="ring" style="background: conic-gradient(var(--coral) ${degrees}deg, #eee9df ${degrees}deg)"><span class="ring-number">${Math.round((seen / state.data.pointCount) * 100)}%</span></div><div class="progress-copy"><strong>${seen ? "继续保持" : "从第一题开始"}</strong><span>已接触 ${seen} / ${state.data.pointCount} 个穴位<br />完成一组题就会留下学习记录</span></div></div>
        <div class="stat-row"><div class="stat-item"><strong>${total}</strong><span>累计答题</span></div><div class="stat-item"><strong>${accuracy}%</strong><span>正确率</span></div><div class="stat-item"><strong>${state.stats.wrongIds.length}</strong><span>待复习</span></div></div>
      </section>
      <section class="side-card"><div class="side-card-header"><h3>待复习穴位</h3><button class="tiny-link" data-view-link="review">全部查看</button></div>${topWrong.length ? `<div class="memory-list">${topWrong.map((point) => `<div class="memory-item"><span class="memory-dot">${escapeHtml(point.id.replace(/\d/g, ""))}</span><div><strong>${escapeHtml(point.name)}</strong><span>${escapeHtml(point.meridian)}</span></div><em>待复习</em></div>`).join("")}</div>` : `<div class="empty-note">做错的题目会自动出现在这里。</div>`}</section>
    </aside>
  `;
}

function meridianOptions() {
  return [`<option value="全部经脉">全部经脉 · ${state.data.pointCount}</option>`, ...state.data.meridians.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} · ${state.data.points.filter((p) => p.meridian === name).length}</option>`)].join("");
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
  const image = point.imagePath ? `<img class="detail-image" src="${assetUrl(point.imagePath)}" alt="${escapeHtml(point.name)}学习图" />` : "";
  return `<div class="point-detail-inner"><div class="point-detail-image">${image}</div><div><div class="section-kicker">${escapeHtml(point.meridian)} · ${escapeHtml(point.id)}</div><h3>${escapeHtml(point.name)}</h3><p class="detail-answer">正确答案：${escapeHtml(point.answerText || `${point.name}（${point.id}，${point.meridian}）`)}</p><p><strong>现代定位：</strong>${escapeHtml(point.locationText || "待复核")}</p><p><strong>图片线索：</strong>${escapeHtml(point.imageClue || point.visualCue || "")}</p><p><strong>记忆提示：</strong>${escapeHtml(point.memoryHint || "")}</p><details><summary>原著依据</summary><p>${escapeHtml(point.originalBasis || point.sourceExcerpt || "暂无摘录")}</p></details><div class="category-chips">${(point.specialCategories || []).map((item) => `<span class="feature-tag">${escapeHtml(item)}</span>`).join("") || "<span class=\"empty-note\">未登记特定穴分类</span>"}</div></div></div>`;
}

function renderPointsExplorer() {
  pageContext.textContent = "穴位连点看";
  const meridian = state.meridian === "全部经脉" ? state.data.meridians[0] : state.meridian;
  const points = state.data.points.filter((point) => point.meridian === meridian);
  root.innerHTML = `<div class="feature-hero"><div><div class="eyebrow">POINT EXPLORER</div><h2>先看懂一条经脉，再记住穴位</h2><p>按经脉浏览同一套 309 个穴位资料；点击卡片查看图片、原著依据、现代定位和记忆提示。</p></div><div class="feature-orbit"><div class="orbit-core">穴</div></div></div><div class="explorer-toolbar"><select class="select-control" id="explorer-meridian">${meridianOptions()}</select><span class="feature-tag">静态资料版 · 不依赖实时 AI</span></div><div class="explorer-layout"><section class="point-list" id="point-list">${points.map((point) => `<button class="point-list-item" data-point-id="${escapeHtml(point.id)}"><strong>${escapeHtml(point.id)} · ${escapeHtml(point.name)}</strong><span>${escapeHtml((point.imageClue || point.visualCue || "").slice(0, 38))}</span></button>`).join("")}</section><section class="point-detail-card" id="point-detail">${pointDetails(points[0])}</section></div>`;
  document.querySelector("#explorer-meridian").value = meridian;
  document.querySelector("#explorer-meridian").addEventListener("change", (event) => { state.meridian = event.target.value; renderPointsExplorer(); });
  document.querySelectorAll(".point-list-item").forEach((button) => button.addEventListener("click", () => { const point = state.data.points.find((item) => item.id === button.dataset.pointId); document.querySelectorAll(".point-list-item").forEach((item) => item.classList.toggle("active", item === button)); document.querySelector("#point-detail").innerHTML = pointDetails(point); }));
  const first = document.querySelector(".point-list-item");
  if (first) first.classList.add("active");
}

function renderMatchGame() {
  pageContext.textContent = "穴位消消乐";
  const categories = Object.keys(state.data.categoryIndex || {}).filter((name) => (state.data.categoryIndex[name] || []).length >= 4);
  const category = categories[0] || "五输穴";
  const second = categories[1] || category;
  const ids = [...shuffle(state.data.categoryIndex?.[category] || []).slice(0, 6), ...shuffle(state.data.categoryIndex?.[second] || []).slice(0, 6)];
  const unique = [...new Set(ids)].slice(0, 12);
  const cards = shuffle(unique.map((id) => state.data.points.find((point) => point.id === id)).filter(Boolean));
  let selected = [];
  let matched = new Set();
  root.innerHTML = `<div class="feature-hero"><div><div class="eyebrow">CATEGORY MATCH</div><h2>把特定穴分类，变成一场配对游戏</h2><p>点击两个穴位，系统按题库登记的同一类别判断是否配对。第一版只使用静态分类，不加入多人竞技和复杂动画。</p></div><div class="feature-orbit"><div class="orbit-core">连</div></div></div><div class="explorer-toolbar"><span class="feature-tag">${escapeHtml(category)} · ${escapeHtml(second)}</span><span id="match-status" class="empty-note">已配对 0 / ${Math.floor(cards.length / 2)} 组</span></div><section class="match-board" id="match-board">${cards.map((point) => `<button class="match-card" data-point-id="${escapeHtml(point.id)}"><strong>${escapeHtml(point.name)}</strong><span>${escapeHtml(point.id)} · ${escapeHtml(point.meridian.replace("经", ""))}</span></button>`).join("")}</section><section class="dashboard-card match-explain"><h3>分类说明</h3><p>分类来源：平台统一特定穴登记表。点开配对成功的卡片，可回到“穴位连点看”查看原著依据和定位。</p></section>`;
  const status = document.querySelector("#match-status");
  document.querySelectorAll(".match-card").forEach((button) => button.addEventListener("click", () => {
    if (matched.has(button.dataset.pointId) || selected.length >= 2) return;
    selected.push(button); button.classList.add("selected");
    if (selected.length < 2) return;
    const a = state.data.points.find((point) => point.id === selected[0].dataset.pointId);
    const b = state.data.points.find((point) => point.id === selected[1].dataset.pointId);
    const same = (a.specialCategories || []).some((item) => (b.specialCategories || []).includes(item));
    if (same) { selected.forEach((item) => { item.classList.add("matched"); matched.add(item.dataset.pointId); }); }
    else { selected.forEach((item) => item.classList.add("mismatch")); setTimeout(() => selected.forEach((item) => { item.classList.remove("selected", "mismatch"); }), 500); }
    selected = [];
    status.textContent = `已配对 ${Math.floor(matched.size / 2)} / ${Math.floor(cards.length / 2)} 组`;
  }));
}

function renderFramework(view) {
  if (view === "points") return renderPointsExplorer();
  return renderMatchGame();
}

function renderTeacher() {
  pageContext.textContent = "教师看板";
  const accuracy = state.stats.total ? Math.round((state.stats.correct / state.stats.total) * 100) : 0;
  const seenPercent = Math.round((state.stats.seenIds.length / state.data.pointCount) * 100);
  const originalImages = state.data.points.filter((point) => point.imageStatus === "原始主图（保留）").length;
  const supplementImages = state.data.points.filter((point) => point.imageStatus === "补图（保留）").length;
  const reviewedImages = originalImages + supplementImages;
  const rows = state.data.meridians.map((name) => {
    const count = state.data.points.filter((p) => p.meridian === name).length;
    const seen = state.data.points.filter((p) => p.meridian === name && state.stats.seenIds.includes(p.id)).length;
    return `<tr><td>${escapeHtml(name)}</td><td>${count}</td><td><div class="bar-track"><div class="bar-fill" style="width:${count ? Math.round((seen / count) * 100) : 0}%"></div></div></td><td>${seen}/${count}</td></tr>`;
  }).join("");
  root.innerHTML = `<div class="dashboard-header"><div><div class="eyebrow">TEACHER CONSOLE</div><h2>班级学习概览</h2><p>本地原型使用当前浏览器学习记录展示统计结构，接入微信登录后替换为班级数据。</p></div><div class="dashboard-actions"><button class="ghost-button" id="export-progress">导出本地记录</button><button class="primary-button" id="back-student">进入学生练习</button></div></div><div class="dashboard-stats"><div class="dashboard-card"><span class="dash-label">题库穴位</span><strong class="dash-number">${state.data.pointCount}</strong><span class="dash-note">十二经脉已接入</span></div><div class="dashboard-card"><span class="dash-label">经脉数量</span><strong class="dash-number">${state.data.meridians.length}</strong><span class="dash-note">可按经脉布置练习</span></div><div class="dashboard-card"><span class="dash-label">当前答题</span><strong class="dash-number">${state.stats.total}</strong><span class="dash-note">本地演示记录</span></div><div class="dashboard-card"><span class="dash-label">正确率</span><strong class="dash-number">${accuracy}%</strong><span class="dash-note">接入班级后按学生统计</span></div></div><section class="dashboard-card table-card"><h3>十二经脉学习覆盖</h3><table class="meridian-table"><thead><tr><th>经脉</th><th>穴位数</th><th>覆盖进度</th><th>已学习</th></tr></thead><tbody>${rows}</tbody></table></section><section class="dashboard-card" style="margin-top:18px"><span class="dash-label">当前浏览器覆盖率</span><strong class="dash-number">${seenPercent}%</strong><span class="dash-note">正式版将替换为班级整体数据，并提供完成率、正确率、易错穴位和经脉对比。</span></section><section class="dashboard-card" style="margin-top:18px"><div class="side-card-header"><h3>正式图片版本</h3><span class="feature-tag">${escapeHtml(state.data.version)}</span></div><div class="stat-row" style="margin-top:0"><div class="stat-item"><strong>${originalImages}</strong><span>原始主图</span></div><div class="stat-item"><strong>${supplementImages}</strong><span>补图</span></div><div class="stat-item"><strong>${reviewedImages}/${state.data.pointCount}</strong><span>已纳入题库</span></div></div><p class="empty-note" style="margin-top:14px">当前正式题库不引用后续优化图和第三步试验图。</p></section>`;
  document.querySelector("#export-progress").addEventListener("click", exportLocalProgress);
  document.querySelector("#back-student").addEventListener("click", () => setView("practice"));
}

function renderAdmin() {
  pageContext.textContent = "管理后台";
  const categoryCount = Object.keys(state.data.categoryIndex || {}).length;
  const pending = state.data.points.filter((point) => point.locationStatus !== "审阅稿摘录·待人工复核").length;
  root.innerHTML = `<div class="dashboard-header"><div><div class="eyebrow">ADMIN CONSOLE</div><h2>题库与发布检查</h2><p>管理端与教师端共用响应式页面；当前为本地演示，不依赖实时 AI 或云端登录。</p></div><div class="dashboard-actions"><button class="ghost-button" id="admin-export">导出题库摘要</button><button class="primary-button" id="admin-student">进入学生练习</button></div></div><div class="dashboard-stats"><div class="dashboard-card"><span class="dash-label">题库条目</span><strong class="dash-number">${state.data.pointCount}</strong><span class="dash-note">309 个穴位</span></div><div class="dashboard-card"><span class="dash-label">来源摘录</span><strong class="dash-number">${state.data.points.filter((p) => p.originalBasis).length}</strong><span class="dash-note">全部可追溯</span></div><div class="dashboard-card"><span class="dash-label">特定穴分类</span><strong class="dash-number">${categoryCount}</strong><span class="dash-note">统一分类表</span></div><div class="dashboard-card"><span class="dash-label">定位复核</span><strong class="dash-number">${pending}</strong><span class="dash-note">需人工复核项</span></div></div><section class="dashboard-card" style="margin-top:18px"><div class="side-card-header"><h3>发布前固定检查</h3><span class="feature-tag">${escapeHtml(state.data.version)}</span></div><p class="empty-note">正式图片：${state.data.points.filter((p) => p.imageStatus === "原始主图（保留）").length} 张原始主图 + ${state.data.points.filter((p) => p.imageStatus === "补图（保留）").length} 张补图（神门、睛明、浮郄）。不引用第二步优化图或第三步试验图。</p><div class="category-chips">${Object.entries(state.data.categoryIndex || {}).map(([name, ids]) => `<span class="feature-tag">${escapeHtml(name)} ${ids.length}</span>`).join("")}</div></section><section class="dashboard-card" style="margin-top:18px"><h3>审核规则</h3><p class="empty-note">原著依据、现代定位、图片线索和记忆提示分层显示；缺少结构化定位时明确标记待复核，不能把 AI 推测写成原著观点。</p></section>`;
  document.querySelector("#admin-student").addEventListener("click", () => setView("practice"));
  document.querySelector("#admin-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ version: state.data.version, pointCount: state.data.pointCount, categories: state.data.categoryIndex }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "xuejian-question-bank-summary.json"; anchor.click(); URL.revokeObjectURL(url);
  });
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
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  if (view === "teacher") { renderTeacher(); return; }
  if (view === "admin") { renderAdmin(); return; }
  if (view === "points" || view === "match") { renderFramework(view); return; }
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
    document.querySelectorAll(".role-button").forEach((b) => b.classList.toggle("active", b === button));
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
