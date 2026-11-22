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
  selectedOptionId: null,
};

const root = document.querySelector("#view-root");
const pageContext = document.querySelector("#page-context");
const imagePreloadCache = new Map();
let apiAvailable = false;

function syncToLocalApi(endpoint, payload) {
  if (!apiAvailable) return;
  fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then((response) => { if (!response.ok) apiAvailable = false; })
    .catch(() => { apiAvailable = false; });
}

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

const ISSUE_REPORT_KEY = "xuejian-issue-reports-v1";
const ISSUE_TYPES = ["图片与穴位不对应", "答案或选项有误", "解析或定位有误", "图片加载问题", "其他问题"];

function loadIssueReports() {
  try {
    const saved = JSON.parse(localStorage.getItem(ISSUE_REPORT_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item === "object" && item.pointId && item.createdAt) : [];
  } catch (_) { return []; }
}

function createIssueReport(point, type, description) {
  const detail = String(description || "").trim().slice(0, 1000);
  if (!point?.id || !ISSUE_TYPES.includes(type) || !detail) throw new Error("请选择问题类型并填写具体情况。");
  const versionLabel = document.querySelector(".version-chip")?.textContent || "";
  const device = typeof navigator === "undefined" ? {} : {
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    network: navigator.connection?.effectiveType || "unknown",
    online: navigator.onLine,
  };
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: "local_only",
    module: "image_quiz",
    pointId: point.id,
    pointName: point.name,
    meridian: point.meridian,
    imagePath: point.imagePath || "",
    answerId: point.id,
    selectedOptionId: state.answered ? state.selectedOptionId : null,
    issueType: type,
    description: detail,
    releaseVersion: versionLabel.match(/\d+\.\d+\.\d+/)?.[0] || "unknown",
    datasetVersion: state.data?.version || "unknown",
    practiceMode: state.mode,
    pagePath: window.location.pathname || "",
    viewport: { width: window.innerWidth || 0, height: window.innerHeight || 0 },
    device,
  };
}

function saveIssueReport(report) {
  const reports = loadIssueReports();
  reports.push(report);
  localStorage.setItem(ISSUE_REPORT_KEY, JSON.stringify(reports));
  return reports.length;
}

function exportIssueReports() {
  const reports = loadIssueReports();
  if (!reports.length) return false;
  const blob = new Blob([JSON.stringify({ format: "xuejian-issue-reports-v1", exportedAt: new Date().toISOString(), reports }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `xuejian-issue-reports-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
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
  const payload = JSON.stringify(state.stats);
  let saved = false;
  try {
    localStorage.setItem("xuejian-progress-v1", payload);
    saved = localStorage.getItem("xuejian-progress-v1") === payload;
  } catch (_) { saved = false; }
  syncToLocalApi("/api/progress", { userId: "demo", progress: state.stats });
  refreshReviewBadge();
  return saved;
}

function specialReviewItems(now = Date.now()) {
  if (!state.data || !window.XuejianSpecialGameCore) return [];
  try {
    const saved = JSON.parse(localStorage.getItem("xuejian-special-mistakes-v1") || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return [];
    const points = new Map(window.XuejianSpecialGameCore.gamePool(state.data).map((point) => [point.id, point]));
    return Object.entries(saved).flatMap(([id, item]) => {
      const point = points.get(id);
      if (!point || !item || !Number.isInteger(item.errors) || item.errors < 1 || !Number.isFinite(item.dueAt) || item.dueAt < 0 || item.dueAt > 8.64e15) return [];
      return [{ point, errors: item.errors, dueAt: item.dueAt, due: item.dueAt <= now }];
    }).sort((a, b) => Number(b.due) - Number(a.due) || b.errors - a.errors || a.dueAt - b.dueAt);
  } catch (_) { return []; }
}

function refreshReviewBadge() {
  const count = document.querySelector("#wrong-count");
  if (!count || !state.data) return;
  const activeImageWrong = state.data.points.filter((point) => state.stats.wrongIds.includes(point.id)).length;
  count.textContent = String(activeImageWrong + specialReviewItems().length);
}

function saveFavorites() {
  writeLocalStorage("xuejian-favorites-v1", JSON.stringify(state.favorites));
  syncToLocalApi("/api/favorites", { userId: "demo", favorites: state.favorites });
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
  syncToLocalApi(endpoint, record);
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
      return "image-cache/" + relativePath.replace(/\.[^.]+$/, ".webp").split("/").map(encodeURIComponent).join("/");
    }
    const point = state.data?.points?.find((item) => item.imagePath === relativePath);
    const folder = point && ["HT7", "BL1", "BL38"].includes(point.id) ? "第二步_图片与解析优化版" : "第一步_题库内容修订版";
    return "../../修改后版本/" + folder + "/" + relativePath.split("/").map(encodeURIComponent).join("/");
  }
  return "image-cache/" + relativePath.replace(/\.[^.]+$/, ".webp").split("/").map(encodeURIComponent).join("/");
}

function originalAssetUrl(relativePath) {
  if (window.location.protocol === "file:" && !/\/(dist|site-publish)\//.test(window.location.pathname)) {
    const point = state.data?.points?.find((item) => item.imagePath === relativePath);
    const folder = point && ["HT7", "BL1", "BL38"].includes(point.id) ? "第二步_图片与解析优化版" : "第一步_题库内容修订版";
    return "../../修改后版本/" + folder + "/" + relativePath.split("/").map(encodeURIComponent).join("/");
  }
  const prefix = window.location.pathname.includes("/preview/") ? "../../asset/" : "asset/";
  return prefix + relativePath.split("/").map(encodeURIComponent).join("/");
}

function preloadPointImage(point) {
  if (!point?.imagePath || imagePreloadCache.has(point.imagePath)) return;
  const image = new Image();
  imagePreloadCache.set(point.imagePath, image);
  image.decoding = "async";
  image.addEventListener("error", () => imagePreloadCache.delete(point.imagePath), { once: true });
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

let imageViewerPreviousFocus = null;
let imageViewerBodyOverflow = "";

function closeImageViewer() {
  const viewer = document.querySelector("#image-viewer");
  if (!viewer || viewer.hidden) return;
  viewer.hidden = true;
  document.body.style.overflow = imageViewerBodyOverflow;
  imageViewerPreviousFocus?.focus?.();
  imageViewerPreviousFocus = null;
}

function openImageViewer(source) {
  if (!source.complete || !source.naturalWidth) return;
  let viewer = document.querySelector("#image-viewer");
  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "image-viewer";
    viewer.className = "image-viewer";
    viewer.hidden = true;
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", "查看原始学习图片");
    viewer.innerHTML = '<div class="image-viewer-panel"><div class="image-viewer-toolbar"><span class="image-viewer-caption"></span><div class="image-viewer-actions"><button type="button" data-image-zoom="out" aria-label="缩小图片">−</button><button type="button" data-image-zoom="reset">适屏</button><button type="button" data-image-zoom="in" aria-label="放大图片">＋</button><button type="button" class="image-viewer-close" aria-label="关闭图片">关闭</button></div></div><div class="image-viewer-scroll"><img alt="" /></div><p class="image-viewer-note">可放大并拖动查看原图；图片定位仍以教材文字为准。</p></div>';
    viewer.querySelector(".image-viewer-close").addEventListener("click", closeImageViewer);
    viewer.addEventListener("click", (event) => { if (event.target === viewer) closeImageViewer(); });
    viewer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeImageViewer(); }
      if (event.key !== "Tab") return;
      const buttons = [...viewer.querySelectorAll("button:not(:disabled)")];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.body.append(viewer);
  }
  imageViewerPreviousFocus = document.activeElement;
  imageViewerBodyOverflow = document.body.style.overflow;
  const image = viewer.querySelector("img");
  const scroll = viewer.querySelector(".image-viewer-scroll");
  const baseWidth = Math.max(1, Math.min(source.naturalWidth, window.innerWidth - 44,
    source.naturalWidth * (window.innerHeight - 150) / source.naturalHeight));
  let zoom = 1;
  const applyZoom = () => {
    image.style.width = `${Math.round(baseWidth * zoom)}px`;
    viewer.querySelector('[data-image-zoom="out"]').disabled = zoom <= 1;
    viewer.querySelector('[data-image-zoom="in"]').disabled = zoom >= 3;
  };
  const originalPoint = state.data?.points?.find((point) => point.id === source.dataset.pointImage);
  image.src = originalPoint ? originalAssetUrl(originalPoint.imagePath) : (source.currentSrc || source.src);
  image.alt = source.alt;
  viewer.querySelector(".image-viewer-caption").textContent = `${source.alt} · 原图 ${source.naturalWidth}×${source.naturalHeight}`;
  viewer.querySelectorAll("[data-image-zoom]").forEach((button) => {
    button.onclick = () => {
      zoom = button.dataset.imageZoom === "reset" ? 1 : Math.max(1, Math.min(3, zoom + (button.dataset.imageZoom === "in" ? .5 : -.5)));
      applyZoom();
    };
  });
  applyZoom();
  scroll.scrollTo(0, 0);
  viewer.hidden = false;
  document.body.style.overflow = "hidden";
  viewer.querySelector(".image-viewer-close").focus();
}

function bindImageEvents() {
  document.querySelectorAll("img[data-point-image]").forEach((image) => {
    if (image.dataset.imageBound === "true") return;
    const stage = image.closest(".image-stage, .point-detail-image");
    if (!stage) return;
    image.dataset.imageBound = "true";
    stage.classList.add("image-is-loading");
    let settled = false;
    let slowTimer = null;
    if (!stage.querySelector(".image-loading-label")) stage.insertAdjacentHTML("beforeend", '<span class="image-loading-label" aria-live="polite">图片加载中…</span>');
    const retryImage = () => {
      if (settled && !stage.classList.contains("image-load-error")) return;
      settled = true;
      clearTimeout(slowTimer);
      stage.classList.remove("image-load-error", "image-is-loading");
      const source = (image.getAttribute("src") || "").replace(/([?&])retry=\d+$/, "");
      const retrySource = source + (source.includes("?") ? "&" : "?") + "retry=" + Date.now();
      stage.innerHTML = `<img class="${escapeHtml(image.className)}" src="${escapeHtml(retrySource)}" alt="${escapeHtml(image.alt)}" loading="eager" decoding="async" fetchpriority="high" aria-busy="true" data-point-image="${escapeHtml(image.dataset.pointImage || "")}" />`;
      bindImageEvents();
    };
    const markLoaded = () => {
      if (settled) return;
      settled = true;
      clearTimeout(slowTimer);
      image.classList.add("is-loaded");
      image.setAttribute("aria-busy", "false");
      stage.classList.remove("image-is-loading");
      stage.querySelector(".image-loading-label")?.remove();
      stage.querySelector(".image-slow-note")?.remove();
      if (!stage.querySelector(".image-expand")) {
        const expand = document.createElement("button");
        expand.type = "button";
        expand.className = "image-expand";
        expand.textContent = "放大查看";
        expand.setAttribute("aria-label", `放大查看${image.alt}`);
        expand.addEventListener("click", () => openImageViewer(image));
        stage.append(expand);
      }
      if (image.classList.contains("question-image") && state.current?.id === image.dataset.pointImage) {
        preloadPointImage(state.queue[state.sessionIndex + 1]);
      }
    };
    image.addEventListener("load", markLoaded, { once: true });
    const markFailed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(slowTimer);
      image.setAttribute("aria-busy", "false");
      stage.classList.remove("image-is-loading");
      stage.classList.add("image-load-error");
      if (image.dataset.imageFallback !== "original") {
        const point = state.data?.points?.find((item) => item.id === image.dataset.pointImage);
        if (point) {
          stage.innerHTML = `<img class="${escapeHtml(image.className)}" src="${escapeHtml(originalAssetUrl(point.imagePath))}" alt="${escapeHtml(image.alt)}" loading="eager" decoding="async" fetchpriority="high" aria-busy="true" data-point-image="${escapeHtml(point.id)}" data-image-fallback="original" />`;
          bindImageEvents();
          return;
        }
      }
      stage.innerHTML = `<div class="image-placeholder"><div><strong>图片暂时加载失败</strong><span>请检查网络后重试；题库答案和解析仍可查看。</span><button class="ghost-button image-retry" type="button">重新加载图片</button></div></div>`;
      stage.querySelector(".image-retry")?.addEventListener("click", retryImage, { once: true });
    };
    image.addEventListener("error", markFailed, { once: true });
    if (image.complete) {
      if (image.naturalWidth > 0) markLoaded();
      else markFailed();
    } else if (image.classList.contains("question-image")) {
      slowTimer = setTimeout(() => {
        if (settled || stage.isConnected === false || !stage.contains(image)) return;
        stage.querySelector(".image-loading-label")?.remove();
        stage.insertAdjacentHTML("beforeend", '<div class="image-slow-note" role="status"><span>图片加载较慢，可以继续等待或重试</span><button class="ghost-button image-slow-retry" type="button">重新加载</button></div>');
        stage.querySelector(".image-slow-retry")?.addEventListener("click", retryImage, { once: true });
      }, 10000);
    }
  });
}

function imageReviewNote(point, hidden = false) {
  if (point?.imageQuestionApproved) return `<div id="image-review-note" class="image-review-note"><strong>原图辅助题</strong><span>请依据题干中的标准定位选择。原图已获准配题，但图中点位和文字不能作为取穴依据。</span><em>答题后查看图像说明</em></div>`;
  if (point?.imageUsage === "image_mismatch_hold") return `<div id="image-review-note" class="image-review-note"><strong>原图待核</strong><span>${escapeHtml(point.imageMarkerStatus || "图文有疑点")}，已暂停该图的识图出题。</span><em>请按标准定位文字学习</em></div>`;
  if (point && (point.id === "LI8" || point.id === "LI9")) return '<div id="image-review-note" class="image-review-note"><strong>原图说明</strong><span>这张抽象图没有前臂或穴位点，只用于穴名联想。</span><em>实际定位请以现代定位文字为准</em></div>';
  if (point?.imageUsage === "name_mnemonic_only" && hidden) return '<div id="image-review-note" class="image-review-note"><strong>穴名联想图</strong><span>这张图用于记名称，不显示可据以取穴的点位。</span><em>答题后查看标准定位</em></div>';
  if (point?.imageUsage === "location_method_only" && hidden) return '<div id="image-review-note" class="image-review-note"><strong>区域或经脉示意</strong><span>这张图只展示大致区域、手法或经脉关系，未标出可直接取穴的目标点。</span><em>答题后查看标准定位</em></div>';
  if (hidden) return '<div id="image-review-note" class="image-review-note"><strong>测试模式</strong><span>提交答案后显示图片线索与原著依据。</span><em>先按教材定位作答</em></div>';
  const clue = point?.imageClue || point?.visualCue || "先确认身体部位，再观察图中唯一目标点。";
  return `<div id="image-review-note" class="image-review-note"><strong>看图提示</strong><span>${escapeHtml(clue)}</span><em>${escapeHtml(studentImageUse(point))}</em></div>`;
}

function studentImageUse(point) {
  if (point?.imageQuestionApproved) return "原图已用于标准定位辨穴题；图中点位或文字不能作为取穴依据。";
  if (point?.imageUsage === "image_mismatch_hold") return "原图图文或点位有矛盾，暂停识图出题；请按标准定位文字学习。";
  if (point?.id === "LI8" || point?.id === "LI9") return "原图没有穴位点，仅供穴名联想；请按标准定位学习。";
  if (point?.imageUsage === "name_mnemonic_only") return "仅用于穴名联想，不能据图取穴；请按标准定位学习。";
  if (point?.imageUsage === "location_method_only") return "仅展示大致区域、手法或经脉关系，不能据图直接取穴；请按标准定位学习。";
  return "图片用于辅助辨认，取穴位置以标准定位为准。";
}

async function loadQuestionBank() {
  if (window.location.protocol === "file:") {
    return window.XUEJIAN_STATIC_DATA || window.__STATIC_DATA__;
  }
  try {
    const response = await fetch("/api/points");
    if (response.ok) {
      apiAvailable = true;
      return response.json();
    }
  } catch (_) {
    // 静态托管版本没有 API 时，继续使用内置题库。
  }
  if (window.XUEJIAN_STATIC_DATA || window.__STATIC_DATA__) {
    return window.XUEJIAN_STATIC_DATA || window.__STATIC_DATA__;
  }
  throw new Error("题库接口不可用，且未找到静态题库");
}

function isImageQuizEligible(point) {
  return Boolean(point.imagePath && (point.imageQuestionApproved && point.imageQuestionPrompt || point.id !== "LI8" && point.id !== "LI9" && point.imageUsage !== "image_mismatch_hold"));
}

function currentPool() {
  if (state.view === "review") {
    return state.data.points.filter((point) => isImageQuizEligible(point) && state.stats.wrongIds.includes(point.id));
  }
  if (state.meridian === "全部经脉") return state.data.points.filter(isImageQuizEligible);
  return state.data.points.filter((point) => isImageQuizEligible(point) && point.meridian === state.meridian);
}

function imageReviewItems() {
  return state.data.points.map((point) => {
    const record = state.stats.review[point.id];
    const errors = Number(record?.errors) || 0;
    if (errors < 1 || !state.stats.wrongIds.includes(point.id)) return null;
    const eligible = isImageQuizEligible(point);
    const nextAt = Number(record.dueAt);
    const dueAt = Number.isFinite(nextAt) && nextAt > 0 && nextAt <= 8.64e15 ? nextAt : 0;
    return { point, errors, eligible, due: eligible && (window.XuejianReviewScheduler.due(record)), dueAt };
  }).filter(Boolean).sort((a, b) => Number(b.due) - Number(a.due) || b.errors - a.errors || a.point.id.localeCompare(b.point.id));
}

function renderImageReview() {
  const items = imageReviewItems();
  const due = items.filter((item) => item.due).length;
  const renderItem = ({ point, errors, eligible, due: isDue, dueAt }) => {
    const timing = !eligible ? "暂停识图，可在图鉴查看" : isDue ? "现在可复习" : dueAt ? `下次 ${escapeHtml(new Date(dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }))}` : "按间隔稍后复习";
    return `<div class="special-review-item"><div><strong>${escapeHtml(point.name)} <small>${escapeHtml(point.id)}</small></strong><span>${escapeHtml(point.meridian)} · 本轮错 ${errors} 次</span><em>${timing}</em></div></div>`;
  };
  const first = items.slice(0, 6).map(renderItem).join("");
  const remaining = items.slice(6);
  const more = remaining.length ? `<details class="special-review-more-details"><summary>查看其余 ${remaining.length} 个识图错题及错误次数</summary><div class="special-review-list">${remaining.map(renderItem).join("")}</div></details>` : "";
  const list = items.length ? `<div class="special-review-list">${first}</div>${more}` : '<p class="special-review-empty">目前没有待纠正的识图错题；答错后会立即出现在这里。</p>';
  return `<section class="special-review-panel" aria-label="识图错题库"><div class="special-review-heading"><div><span class="section-kicker">第一研习室 · 识图复习</span><h2>识图错题库</h2><p>答错立即入库；在这里答对后移除，再次答错才重新入库。所有在库题可随时重练。</p></div><span class="special-review-total">${due} 个到期 · ${items.length} 个待纠正</span></div>${list}</section>`;
}

function renderSpecialReviewItem({ point, errors, due: isDue, dueAt }) {
  const timing = isDue ? "现在可复习" : `下次 ${escapeHtml(new Date(dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }))}`;
  return `<div class="special-review-item"><div><strong>${escapeHtml(point.name)} <small>${escapeHtml(point.id)}</small></strong><span>${escapeHtml(point.meridian)} · 医学错配累计 ${errors} 次</span><em>${timing}</em></div><button type="button" data-special-meridian="${escapeHtml(point.meridian)}">练习本经</button></div>`;
}

function renderSpecialReview() {
  const items = specialReviewItems();
  const due = items.filter((item) => item.due).length;
  const first = items.slice(0, 6).map(renderSpecialReviewItem).join("");
  const remaining = items.slice(6);
  const more = remaining.length ? `<details class="special-review-more-details"><summary>查看其余 ${remaining.length} 个错配穴位及错误次数</summary><div class="special-review-list">${remaining.map(renderSpecialReviewItem).join("")}</div></details>` : "";
  const list = items.length ? `<div class="special-review-list">${first}</div>${more}` : '<p class="special-review-empty">目前没有连连看医学错配。答错身份后，这里会显示每穴累计次数和复习时间。</p>';
  return `<section class="special-review-panel" aria-label="连连看医学错配复习"><div class="special-review-heading"><div><span class="section-kicker">第二研习室 · 身份复习</span><h2>连连看错配记录</h2><p>与识图错题分开记录；路线受阻和消消乐试探不算医学错题。</p></div><span class="special-review-total">${due} 个到期 · ${items.length} 个曾错配</span></div>${list}<button type="button" class="ghost-button" id="open-special-review">进入连连看学习</button></section>`;
}

function bindSpecialReview() {
  const open = document.querySelector("#open-special-review");
  if (open) open.addEventListener("click", () => setView("points"));
  document.querySelectorAll("[data-special-meridian]").forEach((button) => button.addEventListener("click", () => {
    const meridian = button.dataset.specialMeridian;
    setView("points");
    renderSpecialLinkGame("meridian", meridian, "learn");
  }));
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
  state.selectedOptionId = null;
  renderPractice();
}

function selectAnswer(optionId) {
  if (state.answered || !state.current) return;
  state.answered = true;
  state.selectedOptionId = optionId;
  const isCorrect = optionId === state.current.id;
  window.XuejianReviewScheduler.record(state.stats, state.current.id, isCorrect);
  if (isCorrect && state.view === "review") {
    window.XuejianReviewScheduler.resolve(state.stats, state.current.id);
    state.queue = state.queue.filter((item, index) => index <= state.sessionIndex || item.id !== state.current.id);
  }
  if (isCorrect) {
    state.sessionCorrect += 1;
  } else {
    const retries = state.sessionRetries[state.current.id] || 0;
    if (retries < 2) {
      state.sessionRetries[state.current.id] = retries + 1;
      state.queue.splice(Math.min(state.sessionIndex + 3, state.queue.length), 0, state.current);
    }
  }
  const saved = saveStats();
  document.querySelectorAll(".option-button").forEach((button) => {
    const id = button.dataset.id;
    button.disabled = true;
    if (id === state.current.id) button.classList.add("correct");
    if (id === optionId && !isCorrect) button.classList.add("wrong");
  });
  const feedback = document.querySelector("#feedback-panel");
  feedback.classList.add("visible");
  if (state.view === "review") {
    const list = document.querySelector('[aria-label="识图错题库"]');
    if (list) list.outerHTML = renderImageReview();
    const lead = document.querySelector('.welcome-row .lead');
    if (lead) {
      const active = currentPool();
      const due = active.filter((point) => window.XuejianReviewScheduler.due(state.stats.review[point.id])).length;
      lead.textContent = `错题库 ${active.length} 个，其中 ${due} 个到期；全部可随时重练，答对即移除。`;
    }
  }
  const saveWarning = feedback.querySelector("#progress-save-warning");
  if (saveWarning) saveWarning.hidden = saved;
  const reviewNote = document.querySelector("#image-review-note");
  if (reviewNote && state.mode === "test") reviewNote.outerHTML = imageReviewNote(state.current);
  feedback.querySelector(".feedback-title").className = `feedback-title ${isCorrect ? "good" : "bad"}`;
  feedback.querySelector(".feedback-title").textContent = isCorrect ? state.view === "review" ? "答对了 · 已从错题库移除" : state.stats.wrongIds.includes(state.current.id) ? "答对了 · 此题仍在错题库，请到错题复习中巩固" : "答对了 · 线索已经连上" : `再看一眼 · 正确答案是 ${state.current.name}（已入错题库，本轮错 ${state.stats.review[state.current.id].errors} 次）`;
  feedback.querySelector(".feedback-copy").textContent = state.current.imageQuestionExplanation || state.current.imageClue || state.current.visualCue || "先确认身体部位，再观察图中唯一目标点。";
  feedback.querySelector(".explanation-copy").textContent = state.current.explanation || "这道题的解析正在整理中。";
  feedback.querySelector(".location-copy").textContent = state.current.locationText || "当前资料未提供结构化现代定位；请以教材和配套定位图复核。";
  feedback.querySelector(".memory-copy").textContent = state.current.memoryHint || "先定位身体部位，再用图中线索记忆。";
  feedback.querySelector(".source-copy").textContent = `${state.current.sourceAnchor || state.current.sourceExcerpt || "暂无释名依据。"} 来源：${state.current.sourceReference || "题库资料"}`;
  document.querySelector("#next-question").textContent = state.sessionIndex === state.queue.length - 1 ? "查看本组结果" : "下一题";
  if (window.matchMedia("(max-width: 720px)").matches) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => feedback.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    }));
  }
}

function renderPractice() {
  pageContext.textContent = state.view === "review" ? "错题复习" : "识图学习";
  const point = state.current;
  if (!point) return renderEmptyReview();
  const isReview = state.view === "review";
  const reviewCount = currentPool().length;
  const reviewDue = isReview ? currentPool().filter((item) => window.XuejianReviewScheduler.due(state.stats.review[item.id])).length : 0;
  const letters = ["A", "B", "C", "D"];
  const optionsHtml = state.options.map((option, index) => `
    <button class="option-button" data-id="${escapeHtml(option.id)}">
      <span class="option-letter">${letters[index]}</span><span>${escapeHtml(option.name)}</span>
    </button>
  `).join("");
  const image = imageMarkup(point, "question-image", true);
  root.innerHTML = `
    <div class="welcome-row">
      <div><div class="eyebrow">第一研习室 · 图谱识记</div><h1>${isReview ? "重看旧题，温故知新" : "循图辨穴，识其所在"}</h1><p class="lead">${isReview ? `错题库 ${reviewCount} 个，其中 ${reviewDue} 个到期；全部可随时重练，答对即移除。` : state.mode === "learn" ? "先读题干，再结合原图或标准定位作答；答后对照解析与图片用途说明。" : "测试模式：按题干作答，完成后再查看解析与原图说明。"}</p></div>
      <div class="folio-illustration" aria-hidden="true"><span class="folio-track"><i></i><i></i><i></i><i></i><i></i></span><span class="folio-seal">识<br>穴</span></div>
      <div class="session-controls">
        <select class="select-control" id="meridian-select" aria-label="选择经脉">${meridianOptions(true)}</select>
        <div class="practice-mode-switch" role="group" aria-label="答题模式"><span>答题模式</span><button type="button" data-practice-mode="learn" class="${state.mode === "learn" ? "active" : ""}" aria-pressed="${state.mode === "learn"}">学习模式<small>答后看解析</small></button><button type="button" data-practice-mode="test" class="${state.mode === "test" ? "active" : ""}" aria-pressed="${state.mode === "test"}">测试模式<small>先独立作答</small></button></div>
        ${isReview ? '<button class="ghost-button" id="leave-review" type="button">返回识图学习</button>' : ""}
        <button class="ghost-button" id="restart-session">换一组题（记录保留）</button>
      </div>
    </div>
    ${isReview ? renderImageReview() : ''}
    <div class="dashboard-grid">
      <section class="question-card">
        <div class="question-topline"><span class="section-kicker">${escapeHtml(point.meridian)} · ${state.mode === "test" ? "待作答" : escapeHtml(point.id)}</span><span class="question-index">${state.sessionIndex + 1} / ${state.queue.length}</span><button class="tiny-link ${state.favorites.includes(point.id) ? "active" : ""}" id="favorite-toggle" type="button" aria-pressed="${state.favorites.includes(point.id) ? "true" : "false"}">${state.favorites.includes(point.id) ? "★ 已收藏" : "☆ 收藏"}</button></div>
        ${isReview ? `<p class="special-instruction">本轮已错 ${state.stats.review[point.id]?.errors || 0} 次；本次答对就从错题库移除。</p>` : ''}
        <div class="question-prompt"><h2>${escapeHtml(point.imageQuestionPrompt || "这张图对应哪个穴位？")}</h2><span class="hint-chip">${point.imageQuestionApproved ? "标准定位辨穴 · 原图辅助" : state.mode === "learn" ? "先看部位，再看线索" : "测试模式 · 提示已隐藏"}</span></div>
        <div class="image-stage">${image}</div>
        ${imageReviewNote(point, state.mode === "test")}

        <div class="options">${optionsHtml}</div>
        <div class="feedback-panel" id="feedback-panel">
          <div class="feedback-title"></div>
          <p id="progress-save-warning" role="alert" hidden>本次答题记录未能保存到浏览器。请关闭无痕模式，检查网站存储权限后重试。</p>
          <p class="feedback-copy"></p>
          <details open><summary>查看分层解析（来源可追溯）</summary><p class="explanation-copy"></p></details>
          <details><summary>现代定位 <span class="review-badge">${escapeHtml(point.locationStatus || "待复核")}</span></summary><p class="location-copy"></p></details>
          <details><summary>记忆提示</summary><p class="memory-copy"></p></details>
          <details><summary>释名依据</summary><p class="source-copy"></p></details>
        </div>
        <details class="issue-report" id="issue-report">
          <summary>这题有问题？记录反馈</summary>
          <p>记录会附本题编号、图片路径、版本和浏览器设备信息。仅保存在当前浏览器，不会自动发给教师；导出后请自行发送，截图需另附。</p>
          <form id="issue-form">
            <label>问题类型<select name="issueType" required>${ISSUE_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}</select></label>
            <label>具体情况<textarea name="description" rows="3" maxlength="1000" required placeholder="例如：图中标记与该穴定位不一致；请说明看到的画面和预期。"></textarea></label>
            <div class="issue-report-actions"><button class="primary-button" type="submit">保存在本机</button><button class="ghost-button" id="issue-export" type="button"${loadIssueReports().length ? "" : " disabled"}>导出本机反馈（<span id="issue-count">${loadIssueReports().length}</span> 条）</button></div>
          </form>
          <p class="issue-report-status" id="issue-status" role="status" aria-live="polite"></p>
        </details>
        <div class="next-row"><button class="primary-button" id="next-question">选择答案后继续</button></div>
      </section>
      ${renderSideColumn()}
    </div>
    ${isReview ? renderSpecialReview() : ''}
  `;
  bindPracticeEvents();
  if (isReview) bindSpecialReview();
  bindImageEvents();
}

function renderSideColumn() {
  const total = state.stats.total;
  const accuracy = total ? Math.round((state.stats.correct / total) * 100) : 0;
  const quizCount = state.data.points.filter(isImageQuizEligible).length;
  const seen = state.data.points.filter((point) => isImageQuizEligible(point) && state.stats.seenIds.includes(point.id)).length;
  const degrees = Math.round(Math.min(100, (seen / quizCount) * 100) * 3.6);
  const topWrong = state.data.points.filter((point) => isImageQuizEligible(point) && state.stats.wrongIds.includes(point.id)).sort((a, b) => (state.stats.review[b.id]?.errors || 0) - (state.stats.review[a.id]?.errors || 0)).slice(0, 3);
  const dueCount = state.data.points.filter((point) => isImageQuizEligible(point) && state.stats.wrongIds.includes(point.id) && window.XuejianReviewScheduler.due(state.stats.review[point.id])).length;
  return `
    <aside class="side-column">
      <section class="side-card">
        <div class="side-card-header"><h3>我的学习进度</h3><button class="tiny-link" data-view-link="teacher">查看数据</button></div>
        <div class="progress-ring"><div class="ring" style="background: conic-gradient(var(--coral) ${degrees}deg, #eee9df ${degrees}deg)"><span class="ring-number">${Math.round((seen / quizCount) * 100)}%</span></div><div class="progress-copy"><strong>${seen ? "继续保持" : "从第一题开始"}</strong><span>已接触 ${seen} / ${quizCount} 个练习穴位<br />完成一组题就会留下学习记录</span></div></div>
        <div class="stat-row"><div class="stat-item"><strong>${total}</strong><span>累计答题</span></div><div class="stat-item"><strong>${accuracy}%</strong><span>正确率</span></div><div class="stat-item"><strong>${dueCount}</strong><span>待复习</span></div></div>
      </section>
      <section class="side-card"><div class="side-card-header"><h3>记忆复习节奏</h3><span class="feature-tag">间隔复习</span></div><p class="empty-note">答错立即进入错题库；在错题库答对即移除。答对后的间隔抽题节奏仍按表现调整。</p><div class="review-timeline"><span>1 天</span><span>3 天</span><span>7 天</span><span>14 天</span></div></section>
      <section class="side-card"><div class="side-card-header"><h3>易错穴位</h3><button class="tiny-link" data-view-link="review">复习</button></div>${topWrong.length ? `<div class="memory-list">${topWrong.map((point) => `<div class="memory-item"><span class="memory-dot">${escapeHtml(point.id.replace(/\d/g, ""))}</span><div><strong>${escapeHtml(point.name)}</strong><span>${escapeHtml(point.meridian)}</span></div><em>本轮错 ${state.stats.review[point.id].errors} 次</em></div>`).join("")}</div>` : `<div class="empty-note">做错的题目会自动出现在这里。</div>`}</section>
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
  document.querySelectorAll("[data-practice-mode]").forEach((button) => button.addEventListener("click", () => {
    if (state.answered || state.mode === button.dataset.practiceMode) return;
    state.mode = button.dataset.practiceMode;
    saveMode();
    renderPractice();
  }));
  const leaveReview = document.querySelector("#leave-review");
  if (leaveReview) leaveReview.addEventListener("click", () => setView("practice"));
  document.querySelector("#restart-session").addEventListener("click", startSession);
  document.querySelector("#favorite-toggle").addEventListener("click", () => toggleFavorite(state.current.id));
  document.querySelector("#issue-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const status = document.querySelector("#issue-status");
    const form = event.currentTarget;
    try {
      const fields = new FormData(form);
      const report = createIssueReport(state.current, fields.get("issueType"), fields.get("description"));
      const count = saveIssueReport(report);
      status.textContent = `已在本浏览器保存 ${report.pointId} 的反馈。请导出文件自行发送给教师；尚未自动提交。`;
      document.querySelector("#issue-count").textContent = String(count);
      document.querySelector("#issue-export").disabled = false;
      form.querySelector("textarea").value = "";
    } catch (error) {
      status.textContent = `未能保存反馈：${error.message || "浏览器存储不可用"}。请复制文字另行记录。`;
    }
  });
  document.querySelector("#issue-export").addEventListener("click", () => {
    if (exportIssueReports()) document.querySelector("#issue-status").textContent = "反馈文件已开始下载；请自行发送给教师，平台不会自动上传。";
  });
  document.querySelectorAll(".option-button").forEach((button) => button.addEventListener("click", () => selectAnswer(button.dataset.id)));
  document.querySelector("#next-question").addEventListener("click", () => { if (!state.answered) return; state.sessionIndex += 1; nextQuestion(); });
  document.querySelectorAll("[data-view-link]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewLink)));
}

function renderSessionComplete() {
  pageContext.textContent = state.view === "review" ? "错题复习" : "识图学习";
  const accuracy = state.queue.length ? Math.round((state.sessionCorrect / state.queue.length) * 100) : 0;
  root.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><h3>这一组完成了</h3><p>本组答对 ${state.sessionCorrect} / ${state.queue.length} 题，正确率 ${accuracy}%。${state.view === "review" ? "在错题库答对的穴位已移除；仍答错的穴位继续留在库中。" : "答错的穴位进入错题库；在错题复习中答对后移除。"}</p><div style="margin-top:18px"><button class="primary-button" id="restart-session">再来一组</button></div></div>${state.view === "review" ? renderImageReview() + renderSpecialReview() : ''}`;
  document.querySelector("#restart-session").addEventListener("click", startSession);
  if (state.view === "review") bindSpecialReview();
}

function renderEmptyReview() {
  pageContext.textContent = "错题复习";
  root.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div><h3>当前没有待纠正的识图错题</h3><p>答错立即入库；在错题复习中答对后移除，下次答错再重新入库。</p><div style="margin-top:18px"><button class="primary-button" id="go-practice">开始练习</button></div></div>${renderImageReview()}${renderSpecialReview()}`;
  document.querySelector("#go-practice").addEventListener("click", () => setView("practice"));
  bindSpecialReview();
}

function pointDetails(point) {
  if (!point) return `<div class="empty-note">请选择一个穴位查看详情。</div>`;
  const image = imageMarkup(point, "detail-image");
  return `<div class="point-detail-inner"><div class="point-detail-image">${image}</div><div><div class="section-kicker">${escapeHtml(point.meridian)} · ${escapeHtml(point.id)}</div><h3>${escapeHtml(point.name)}</h3><p class="detail-answer">正确答案：${escapeHtml(point.answerText || `${point.name}（${point.id}，${point.meridian}）`)}</p><p><strong>现代定位：</strong>${escapeHtml(point.locationText || "待复核")}</p><p><strong>图片线索：</strong>${escapeHtml(point.imageClue || point.visualCue || "")}</p><p><strong>图片用途：</strong>${escapeHtml(studentImageUse(point))}</p><p><strong>记忆提示：</strong>${escapeHtml(point.memoryHint || "")}</p><details><summary>释名依据</summary><p>${escapeHtml(point.sourceAnchor || point.sourceExcerpt || "暂无释名依据")}</p><p class="source-reference">来源：${escapeHtml(point.sourceReference || "题库资料")}</p></details><div class="category-chips">${(point.specialCategories || []).map((item) => `<span class="feature-tag">${escapeHtml(item)}</span>`).join("") || "<span class=\"feature-tag\">十二经穴</span>"}</div></div></div>`;
}

function renderPointsExplorer() {
  pageContext.textContent = "穴位图鉴";
  const meridian = state.meridian === "全部经脉" ? state.data.meridians[0] : state.meridian;
  const points = state.data.points.filter((point) => point.meridian === meridian);
  root.innerHTML = `<div class="feature-hero"><div><div class="eyebrow">经穴图鉴 · 十二经脉</div><h2>先看懂一条经脉，再记住穴位</h2><p>按经脉浏览同一套 309 个穴位资料；点击卡片查看图片、原著依据、现代定位和记忆提示。</p></div><div class="feature-orbit"><div class="orbit-core">穴</div></div></div><div class="explorer-toolbar"><select class="select-control" id="explorer-meridian">${meridianOptions()}</select><span class="feature-tag">十二经 · 309 穴</span></div><div class="explorer-layout"><section class="point-list" id="point-list">${points.map((point) => `<button class="point-list-item" data-point-id="${escapeHtml(point.id)}"><strong>${escapeHtml(point.id)} · ${escapeHtml(point.name)}</strong><span>${escapeHtml((point.imageClue || point.visualCue || "").slice(0, 38))}</span></button>`).join("")}</section><section class="point-detail-card" id="point-detail">${pointDetails(points[0])}</section></div>`;
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
  root.innerHTML = `<div class="feature-hero"><div><div class="eyebrow">CATEGORY MATCH</div><h2>把特定穴分类，变成一场配对游戏</h2><p>先选择一个分类，再点击两个同类穴位配对。系统只使用题库已登记的分类，不把 未核实的内容写入游戏规则。</p></div><div class="feature-orbit"><div class="orbit-core">连</div></div></div><div class="explorer-toolbar"><label class="match-category-picker">分类<select class="select-control" id="match-category">${categoryOptions}</select></label><span id="match-status" class="empty-note">已配对 0 / ${Math.floor(cards.length / 2)} 组</span><button class="ghost-button" id="match-reset" type="button">重新开局</button></div><section class="match-board" id="match-board">${cards.map((point) => `<button class="match-card" data-point-id="${escapeHtml(point.id)}"><strong>${escapeHtml(point.name)}</strong><span>${escapeHtml(point.id)} · ${escapeHtml(point.meridian.replace("经", ""))}</span></button>`).join("")}</section><section class="dashboard-card match-explain"><h3>${escapeHtml(category)}分类说明</h3><p>分类来源：平台统一特定穴登记表。配对成功后，可回到“穴位连点看”查看该穴位的原著依据、现代定位和图片线索。</p></section>`;
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

const TEACHER_ISSUE_INBOX_KEY = "xuejian-teacher-issue-inbox-v1";

function loadTeacherIssueInbox() {
  try {
    const records = JSON.parse(localStorage.getItem(TEACHER_ISSUE_INBOX_KEY) || "[]");
    return Array.isArray(records) ? records.filter((item) => item && item.id && item.pointId) : [];
  } catch (_) { return []; }
}

function renderTeacherIssueInbox() {
  const api = window.XuejianIssueInbox;
  const records = loadTeacherIssueInbox();
  const pending = records.filter((item) => item.intakeStatus === 'pending').length;
  const rows = records.slice().reverse().slice(0, 100).map((item) => `<tr>
    <td><strong>${escapeHtml(item.pointId)} · ${escapeHtml(item.pointName)}</strong><span class="table-subtext">${escapeHtml(item.meridian)} · ${escapeHtml(item.module || '')}</span></td>
    <td><strong>${escapeHtml(item.issueType || '未分类')}</strong><span class="table-subtext">${escapeHtml(item.description)}</span><span class="table-subtext">正确编号 ${escapeHtml(item.answerId || item.pointId)} · 所选 ${escapeHtml(item.selectedOptionId || '未作答')}</span><span class="table-subtext">${escapeHtml(item.imagePath)}</span></td>
    <td><span class="table-subtext">${escapeHtml(item.releaseVersion || '未知版本')}</span><span class="table-subtext">${escapeHtml(item.deviceLabel || '设备未记录')}</span></td>
    <td><select data-issue-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.pointId)} 处理状态"><option value="pending"${item.intakeStatus === 'pending' ? ' selected' : ''}>待处理</option><option value="in_review"${item.intakeStatus === 'in_review' ? ' selected' : ''}>处理中</option><option value="resolved"${item.intakeStatus === 'resolved' ? ' selected' : ''}>已处理</option></select></td>
  </tr>`).join('') || '<tr><td colspan="4" class="empty-note">尚未手动导入学生反馈。</td></tr>';
  root.insertAdjacentHTML('beforeend', `<section class="dashboard-card teacher-issue-inbox">
    <div class="side-card-header"><div><h3>学生问题反馈 · 手动导入</h3><p class="empty-note">本机 ${records.length} 条，待处理 ${pending} 条。学生复制或导出后需主动发送；导入只保存在当前教师浏览器，不代表在线接收或专业审核。</p></div><button class="ghost-button" id="teacher-issue-export" type="button"${records.length ? '' : ' disabled'}>导出本机处理清单</button></div>
    <div class="teacher-issue-import"><label>选择网页导出的 JSON 文件<input id="teacher-issue-file" type="file" accept=".json,application/json" /></label><label>或粘贴小程序复制的 JSON<textarea id="teacher-issue-paste" rows="3" placeholder="粘贴学生主动发送的反馈 JSON"></textarea></label><button class="primary-button" id="teacher-issue-import" type="button">导入粘贴内容</button></div>
    <p class="issue-report-status" id="teacher-issue-status" role="status" aria-live="polite"></p>
    <div class="teacher-issue-table"><table class="meridian-table"><thead><tr><th>穴位</th><th>问题</th><th>版本与设备</th><th>处理状态</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${records.length > 100 ? '<p class="empty-note">仅展示最近 100 条；原记录仍保存在本机。</p>' : ''}
  </section>`);
  const status = root.querySelector('#teacher-issue-status');
  root.querySelector('#teacher-issue-export').addEventListener('click', () => {
    try {
      const body = api.serializeWorklist(loadTeacherIssueInbox());
      const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `xuejian-teacher-issues-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      status.textContent = '处理清单已导出为 JSON；文件仍需自行妥善保存。';
    } catch (error) { status.textContent = error.message || '导出失败。'; }
  });
  const importText = (text) => {
    try {
      const parsed = api.parseExport(text, state.data.points);
      const result = api.merge(loadTeacherIssueInbox(), parsed);
      localStorage.setItem(TEACHER_ISSUE_INBOX_KEY, JSON.stringify(result.records));
      renderTeacher();
      root.querySelector('#teacher-issue-status').textContent = `本机新增 ${result.added} 条，重复跳过 ${result.duplicates} 条；尚未同步到服务器。`;
    } catch (error) { status.textContent = error.message || '导入失败，请核对文件。'; }
  };
  root.querySelector('#teacher-issue-import').addEventListener('click', () => importText(root.querySelector('#teacher-issue-paste').value));
  root.querySelector('#teacher-issue-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { status.textContent = '文件超过 1 MB，未导入。'; return; }
    try { importText(await file.text()); } catch (_) { status.textContent = '文件读取失败，未导入。'; }
  });
  root.querySelectorAll('[data-issue-id]').forEach((select) => select.addEventListener('change', () => {
    try {
      const next = api.changeStatus(loadTeacherIssueInbox(), select.dataset.issueId, select.value);
      localStorage.setItem(TEACHER_ISSUE_INBOX_KEY, JSON.stringify(next));
      renderTeacher();
      root.querySelector('#teacher-issue-status').textContent = '处理状态已保存在本机；尚未同步给学生。';
    } catch (error) { status.textContent = error.message || '状态保存失败。'; }
  }));
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
  root.innerHTML = `<div class="dashboard-header"><div><div class="eyebrow">教师端 · 班级管理</div><h2>班级学习概览</h2><p>创建班级、安排识图练习，并查看学习覆盖情况。当前记录保存在本机。</p></div><div class="dashboard-actions"><button class="ghost-button" id="export-progress">导出本地记录</button><button class="primary-button" id="back-student">进入学生练习</button></div></div><div class="dashboard-stats"><div class="dashboard-card"><span class="dash-label">题库穴位</span><strong class="dash-number">${state.data.pointCount}</strong><span class="dash-note">十二经脉已接入</span></div><div class="dashboard-card"><span class="dash-label">经脉数量</span><strong class="dash-number">${state.data.meridians.length}</strong><span class="dash-note">可按经脉布置练习</span></div><div class="dashboard-card"><span class="dash-label">当前答题</span><strong class="dash-number">${state.stats.total}</strong><span class="dash-note">仅此设备的答题记录</span></div><div class="dashboard-card"><span class="dash-label">正确率</span><strong class="dash-number">${accuracy}%</strong><span class="dash-note">仅此设备的正确率</span></div></div><section class="dashboard-card teacher-workbench"><div class="side-card-header"><h3>班级与作业</h3><span class="feature-tag">${classes.length} 个班级 · ${assignments.length} 个作业</span></div><div class="teacher-form-grid"><form id="class-form" class="teacher-form"><strong>创建班级</strong><label>班级名称<input name="name" required placeholder="例如：针灸基础一班" /></label><label>年级或备注<input name="grade" placeholder="例如：2026 春季" /></label><button class="primary-button" type="submit">保存班级</button></form><form id="assignment-form" class="teacher-form"><strong>布置识图作业</strong><label>作业名称<input name="title" required placeholder="例如：手阳明大肠经复习" /></label><label>班级<select name="classId">${classOptions}</select></label><label>经脉<select name="meridian">${meridianOptions()}</select></label><label>题量<select name="count"><option>10</option><option>20</option><option>30</option></select></label><button class="primary-button" type="submit">保存作业</button></form></div><div class="teacher-lists"><div><h4>班级列表</h4><ul>${classRows}</ul></div><div><h4>最近作业</h4><ul>${assignmentRows}</ul></div></div></section><section class="dashboard-card table-card"><h3>十二经脉学习覆盖</h3><table class="meridian-table"><thead><tr><th>经脉</th><th>穴位数</th><th>覆盖进度</th><th>已学习</th></tr></thead><tbody>${rows}</tbody></table></section><section class="dashboard-card" style="margin-top:18px"><span class="dash-label">当前浏览器覆盖率</span><strong class="dash-number">${seenPercent}%</strong><span class="dash-note">这里显示当前设备的学习记录；班级汇总功能尚未接入。</span></section><section class="dashboard-card" style="margin-top:18px"><div class="side-card-header"><h3>题库图片</h3><span class="feature-tag">${escapeHtml(state.data.version)}</span></div><div class="stat-row" style="margin-top:0"><div class="stat-item"><strong>${originalImages}</strong><span>原始主图</span></div><div class="stat-item"><strong>${supplementImages}</strong><span>补图</span></div><div class="stat-item"><strong>${reviewedImages}/${state.data.pointCount}</strong><span>已纳入题库</span></div></div><p class="empty-note" style="margin-top:14px">当前练习图片来自已确认的原始资料图和三张补图。</p></section>`;
  renderTeacherIssueInbox();
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
  let page = 0;
  let selectedId = "";
  let reviewNotes = {};
  try { reviewNotes = JSON.parse(localStorage.getItem("xuejian-admin-review-notes-v1") || "{}"); } catch (_) { reviewNotes = {}; }
  if (!reviewNotes || Array.isArray(reviewNotes) || typeof reviewNotes !== "object") reviewNotes = {};
  let activeFilter = "all";
  try { activeFilter = sessionStorage.getItem("xuejian-admin-filter") || "all"; } catch (_) { activeFilter = "all"; }
  const matches = (point, filter) => filter === "all" ? (isLocationPending(point) || isImagePending(point)) : (filter === "location" ? isLocationPending(point) : isImagePending(point));
  const render = (filter) => {
    const queue = state.data.points.filter((point) => matches(point, filter));
    const pageCount = Math.max(1, Math.ceil(queue.length / 24));
    page = Math.min(page, pageCount - 1);
    const pageRows = queue.slice(page * 24, (page + 1) * 24);
    if (!pageRows.some((point) => point.id === selectedId)) selectedId = pageRows[0]?.id || "";
    const selectedPoint = pageRows.find((point) => point.id === selectedId);
    const rows = pageRows.map((point) => `<tr><td><button type="button" class="admin-point-link${point.id === selectedId ? " active" : ""}" data-admin-point="${escapeHtml(point.id)}">${escapeHtml(point.id)} · ${escapeHtml(point.name)}</button><span class="table-subtext">${escapeHtml(point.meridian)}</span></td><td>${escapeHtml(point.locationStatus || "待复核")}</td><td>${escapeHtml(point.imageMarkerStatus || "待确认")}</td><td><span class="feature-tag">${reviewNotes[point.id] ? "已记疑点" : escapeHtml(point.reviewStatus || "待审")}</span></td></tr>`).join("") || '<tr><td colspan="4" class="empty-note">当前筛选没有待审条目。</td></tr>';
    const optionHtml = filters.map((item) => `<option value="${item.value}" ${item.value === filter ? "selected" : ""}>${item.label}</option>`).join("");
    root.innerHTML = `<div class="dashboard-header"><div><div class="eyebrow">题库管理 · 内容检查</div><h2>题库与发布检查</h2><p>查看题库来源、审核队列与发布前检查。当前记录保存在本机。</p></div><div class="dashboard-actions"><button class="ghost-button" id="admin-export">导出题库摘要</button><button class="primary-button" id="admin-student">进入学生练习</button></div></div><div class="dashboard-stats"><div class="dashboard-card"><span class="dash-label">题库条目</span><strong class="dash-number">${state.data.pointCount}</strong><span class="dash-note">309 个穴位</span></div><div class="dashboard-card"><span class="dash-label">来源摘录</span><strong class="dash-number">${state.data.points.filter((p) => p.originalBasis).length}</strong><span class="dash-note">全部可追溯</span></div><div class="dashboard-card"><span class="dash-label">特定穴分类</span><strong class="dash-number">${categoryCount}</strong><span class="dash-note">统一分类表</span></div><div class="dashboard-card"><span class="dash-label">定位复核</span><strong class="dash-number">${pending}</strong><span class="dash-note">待补齐定位</span></div></div><section class="dashboard-card" style="margin-top:18px"><div class="side-card-header"><h3>发布前固定检查</h3><span class="feature-tag">${escapeHtml(state.data.version)}</span></div><p class="empty-note">正式图片：${state.data.points.filter((p) => p.imageStatus === "原始主图（保留）").length} 张原始主图 + ${state.data.points.filter((p) => p.imageStatus === "补图（保留）").length} 张补图（神门、睛明、浮郄）。不引用第二步优化图或第三步试验图。</p><div class="category-chips">${Object.entries(state.data.categoryIndex || {}).map(([name, ids]) => `<span class="feature-tag">${escapeHtml(name)} ${ids.length}</span>`).join("")}</div></section><section class="dashboard-card table-card review-queue"><div class="side-card-header"><div><h3>人工复核队列</h3><p class="empty-note">共 ${queue.length} 条，当前展示前 ${Math.min(queue.length, 24)} 条；先复核现代定位和图片标记，不将 未核实的内容写成原著依据。</p></div><label class="review-filter">筛选<select id="review-filter">${optionHtml}</select></label></div><table class="meridian-table"><thead><tr><th>穴位</th><th>现代定位</th><th>图片标记</th><th>解析状态</th></tr></thead><tbody>${rows}</tbody></table></section><section class="dashboard-card" style="margin-top:18px"><h3>审核规则</h3><p class="empty-note">原著依据、现代定位、图片线索和记忆提示分层显示；现代定位已按现行国家标准填入；图片标记仍需逐图确认，不能把 未核实的内容写成原著观点。</p></section>`;
    const workbench = selectedPoint ? `<div class="admin-review-workbench"><div class="admin-review-image point-detail-image">${imageMarkup(selectedPoint, "detail-image")}</div><div class="admin-review-copy"><div class="section-kicker">${escapeHtml(selectedPoint.meridian)} · ${escapeHtml(selectedPoint.id)}</div><h4>${escapeHtml(selectedPoint.name)}</h4><p><strong>现代定位：</strong>${escapeHtml(selectedPoint.locationText || "")}</p><p><strong>图片线索：</strong>${escapeHtml(selectedPoint.imageClue || "")}</p><p><strong>图片标记待核：</strong>${escapeHtml(selectedPoint.imageMarkerStatus || "")}</p><p><strong>图片用途：</strong>${escapeHtml(studentImageUse(selectedPoint))}</p><details><summary>原著原始材料</summary><p>${escapeHtml(selectedPoint.originalBasis || "")}</p></details><label for="admin-review-note">本机核查备注</label><textarea id="admin-review-note" rows="3" placeholder="记录要对照的红点、参照点或解析疑点；保存备注不代表专业审核通过。">${escapeHtml(reviewNotes[selectedPoint.id]?.note || "")}</textarea><div class="admin-review-actions"><button type="button" class="primary-button" id="admin-review-save">保存备注</button><span class="empty-note">仅保存在本机，可随题库摘要导出。</span></div></div></div>` : "";
    root.querySelector(".review-queue .empty-note").textContent = `共 ${queue.length} 条，当前展示第 ${queue.length ? page * 24 + 1 : 0}–${Math.min(queue.length, (page + 1) * 24)} 条。选择穴位查看题库原图和定位，记录疑点后导出。`;
    root.querySelector(".review-queue").insertAdjacentHTML("beforeend", `<div class="admin-queue-pager"><span>第 ${page + 1} / ${pageCount} 页 · ${queue.length ? page * 24 + 1 : 0}–${Math.min(queue.length, (page + 1) * 24)} / ${queue.length} 条</span><div><button type="button" class="ghost-button" id="admin-previous"${page === 0 ? " disabled" : ""}>上一页</button><button type="button" class="ghost-button" id="admin-next"${page >= pageCount - 1 ? " disabled" : ""}>下一页</button></div></div>${workbench}`);
    bindImageEvents();
    root.querySelectorAll("[data-admin-point]").forEach((button) => button.addEventListener("click", () => { selectedId = button.dataset.adminPoint; render(filter); }));
    root.querySelector("#admin-previous").addEventListener("click", () => { page -= 1; render(filter); });
    root.querySelector("#admin-next").addEventListener("click", () => { page += 1; render(filter); });
    root.querySelector("#admin-review-save")?.addEventListener("click", () => {
      const note = root.querySelector("#admin-review-note").value.trim();
      if (note) reviewNotes[selectedId] = { note, updatedAt: new Date().toISOString() };
      else delete reviewNotes[selectedId];
      writeLocalStorage("xuejian-admin-review-notes-v1", JSON.stringify(reviewNotes));
      render(filter);
    });
    document.querySelector("#admin-student").addEventListener("click", () => setView("practice"));
    document.querySelector("#review-filter").addEventListener("change", (event) => { page = 0; try { sessionStorage.setItem("xuejian-admin-filter", event.target.value); } catch (_) {} render(event.target.value); });
    document.querySelector("#admin-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify({ version: state.data.version, pointCount: state.data.pointCount, categories: state.data.categoryIndex, reviewQueue: queue, localReviewNotes: reviewNotes }, null, 2)], { type: "application/json" });
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

function renderPortal() {
  pageContext.textContent = "平台导览";
  const imagePoints = state.data.points.filter(isImageQuizEligible);
  const imageCount = imagePoints.length;
  const seenIds = new Set(Array.isArray(state.stats.seenIds) ? state.stats.seenIds : []);
  const seenCount = imagePoints.filter((point) => seenIds.has(point.id)).length;
  const imageDue = imagePoints.filter((point) => state.stats.wrongIds.includes(point.id) && window.XuejianReviewScheduler.due(state.stats.review[point.id])).length;
  const dueCount = imageDue + specialReviewItems().filter((item) => item.due).length;
  const accuracy = state.stats.total ? Math.round(state.stats.correct / state.stats.total * 100) : 0;
  const coverage = imageCount ? Math.round(seenCount / imageCount * 100) : 0;
  root.innerHTML = `
    <div class="portal-page">
      <section class="portal-hero" aria-labelledby="portal-title">
        <div class="portal-hero-copy">
          <div class="eyebrow">循经知微 · 学生研习入口</div>
          <h1 id="portal-title">把穴位学明白。</h1>
          <p>识图、连线、三消，三种练习共用十二经 ${state.data.pointCount} 穴题库。先看规则和提示，再动手练，最后回到逐题解析。</p>
          <button class="primary-button portal-start" type="button" data-go-view="practice">开始识图研习</button>
        </div>
        <div class="portal-hero-figure" aria-hidden="true"><div class="portal-meridian-disc"><span>经</span><span>络</span><small>十二经 · 穴位研习</small></div></div>
      </section>
      <section class="portal-study-desk" aria-labelledby="portal-desk-title">
        <div class="portal-desk-intro"><div class="eyebrow">本机研习书案</div><h2 id="portal-desk-title">从上次学到的地方，接着往前走。</h2><p>记录只保存在当前浏览器；换设备后不会自动同步。</p></div>
        <div class="portal-desk-progress"><div class="portal-desk-measure"><span>已见识图穴位</span><strong>${seenCount}<small> / ${imageCount}</small></strong></div><progress value="${seenCount}" max="${imageCount}" aria-label="已见识图穴位 ${seenCount}，共 ${imageCount}"></progress><span class="portal-desk-footnote">题库覆盖 ${coverage}% · 累计作答 ${state.stats.total} 题 · 正确率 ${accuracy}%</span></div>
        <div class="portal-desk-review"><span>下一步</span><strong>${dueCount ? `${dueCount} 道待复习` : "继续研习"}</strong><p>${dueCount ? "识图错题与连线身份错配已列入复习。" : "从图谱开始，也可以先试一局新手关。"}</p><button type="button" data-go-view="${dueCount ? "review" : "practice"}">${dueCount ? "进入错题复习" : "开始识图研习"}<span aria-hidden="true">↗</span></button></div>
      </section>
      <section class="portal-section" aria-labelledby="portal-room-title">
        <div class="portal-section-heading"><div><div class="eyebrow">三间研习室</div><h2 id="portal-room-title">选一种方式开始</h2></div><p>每个模块都有自己的规则与反馈，学习记录留在当前浏览器。</p></div>
        <div class="portal-room-grid">
          <button class="portal-room portal-room-image" type="button" data-go-view="practice"><span class="portal-room-number">01 / 图谱</span><strong>识图研习</strong><span>结合题库图片与题干辨穴，再对照定位、图像线索与释名。</span><em>${imageCount} 道辨穴练习题 · 间隔复习 →</em></button>
          <button class="portal-room portal-room-link" type="button" data-go-view="points"><span class="portal-room-number">02 / 经脉</span><strong>经穴连线</strong><span>把穴名连到正确的特定穴身份，路线最多转两次弯。</span><em>规则与新手关 →</em></button>
          <button class="portal-room portal-room-match" type="button" data-go-view="match"><span class="portal-room-number">03 / 棋局</span><strong>特定穴棋局</strong><span>选定井、荥、输、经、合等类别，用三消练分类。</span><em>规则与新手关 →</em></button>
        </div>
      </section>
      <section class="portal-section portal-lower" aria-label="学习路径与访问入口">
        <div class="portal-path"><div class="eyebrow">学习路径</div><h2>看规则，做练习，再复习</h2><ol><li><b>01</b><span>选经脉或关卡，先读规则与提示</span></li><li><b>02</b><span>完成题目或游戏，查看即时反馈</span></li><li><b>03</b><span>核对解析、标准定位和图片用途</span></li><li><b>04</b><span>按间隔复习计划重做易错穴位</span></li></ol><button class="ghost-button" type="button" data-go-view="review">查看错题复习</button></div>
        <div class="portal-access"><div class="eyebrow">访问方式</div><h2>电脑与手机，同一网页</h2><p>手机浏览器或微信内打开下方网址，即可使用网页版；学习记录目前只保存在本机浏览器，尚未跨设备同步。</p><div class="portal-qr-wrap"><img class="portal-qr" src="portal-qr.svg" width="188" height="188" alt="扫码打开循经知微网页版" loading="lazy" /><span>扫码打开网页版</span></div><a href="https://qiulin778.github.io/xuejian-learning/" target="_blank" rel="noopener noreferrer">qiulin778.github.io/xuejian-learning/</a><p class="portal-candidate">微信小程序已有候选代码，仍待 AppID、合法域名与真机验收。上方是网页版二维码，不是小程序码。</p><div class="portal-role-links"><button type="button" data-go-view="teacher">教师看板 · 本机演示</button><button type="button" data-go-view="admin">管理后台 · 本机演示</button></div></div>
      </section>
    </div>`;
  root.querySelectorAll("[data-go-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.goView)));
}

function setView(view) {
  if (typeof specialStop === "function") specialStop();
  state.view = view;
  window.scrollTo(0, 0);
  document.body.dataset.view = view;
  state.role = view === "teacher" || view === "admin" ? view : "student";
  document.querySelectorAll(".role-button").forEach((button) => {
    const active = button.dataset.role === state.role;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  if (view === "home") { renderPortal(); return; }
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
  document.querySelector("#portal-trigger").addEventListener("click", () => setView("home"));
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
    document.querySelector('[data-view="practice"] .nav-pill').textContent = String(state.data.points.filter(isImageQuizEligible).length);
    document.body.dataset.view = "practice";
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
