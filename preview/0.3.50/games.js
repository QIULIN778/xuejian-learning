const gameCore = window.XuejianGameCore;
let currentGameScope = 'all';
let drawActiveLinks = () => {};
window.addEventListener('resize', () => drawActiveLinks());

function gameScopeOptions(selected) {
  const choices = [
    ['all', `全部穴位 · ${state.data.points.length}`],
    ...state.data.meridians.map((name) => [`meridian:${name}`, name]),
    ...Object.entries(state.data.categoryIndex || {})
      .filter(([, ids]) => ids.length >= 6)
      .map(([name, ids]) => [`category:${name}`, `${name} · ${ids.length}`]),
  ];
  return choices.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function newGameRound(scope) {
  currentGameScope = scope;
  return gameCore.roundPoints(state.data.points, scope, 6);
}

function gameResultMarkup(round, description) {
  return `<div class="game-result"><h3>本局完成</h3><p>${escapeHtml(description)}</p><div class="game-answer-list">${round.map((point) => `<details><summary>${escapeHtml(point.name)} · 查看答案解析</summary><p>${escapeHtml(point.explanation || '')}</p></details>`).join('')}</div><button class="primary-button game-next-round" type="button">换一组继续</button></div>`;
}

function gameToolbar(scope, status) {
  return `<div class="explorer-toolbar game-toolbar"><label>题目范围<select class="select-control game-scope" aria-label="选择题目范围">${gameScopeOptions(scope)}</select></label><span class="game-status" aria-live="polite">${escapeHtml(status)}</span><button class="ghost-button game-reset" type="button">重新开局</button></div>`;
}

function bindGameToolbar(render, scope) {
  root.querySelector('.game-scope').addEventListener('change', (event) => render(event.target.value));
  root.querySelector('.game-reset').addEventListener('click', () => render(scope));
}

function renderMemoryGame(scope = currentGameScope) {
  drawActiveLinks = () => {};
  pageContext.textContent = '穴位消消乐';
  const round = newGameRound(scope);
  if (round.length < 6) {
    root.innerHTML = '<div class="empty-state"><h3>这一范围的题目不足 6 个</h3><button class="primary-button" id="game-back">返回全部穴位</button></div>';
    root.querySelector('#game-back').addEventListener('click', () => renderMemoryGame('all'));
    return;
  }
  const deck = gameCore.memoryDeck(round);
  const byKey = new Map(deck.map((card) => [card.key, card]));
  let first = null;
  let locked = false;
  let attempts = 0;
  let mistakes = 0;
  const matched = new Set();
  root.innerHTML = `<div class="feature-hero"><div><div class="eyebrow">MEMORY PAIRS</div><h2>穴位消消乐</h2><p>翻开两张卡片，将同一穴位的“穴名”和“现代定位”配成一对。每局 6 对，不限时；错配的卡片会重新盖上。</p></div><div class="feature-orbit"><div class="orbit-core">配</div></div></div>${gameToolbar(scope, '已配对 0 / 6 · 尝试 0 次')}<section class="memory-board" aria-label="穴位消消乐卡片">${deck.map((card) => `<button class="memory-card" type="button" data-key="${escapeHtml(card.key)}" aria-label="未翻开的卡片"><span class="memory-back">?</span><small>点击翻开</small></button>`).join('')}</section><p class="game-message" aria-live="polite">先翻开一张卡片。</p><section id="game-results"></section>`;
  bindGameToolbar(renderMemoryGame, scope);
  const status = root.querySelector('.game-status');
  const message = root.querySelector('.game-message');
  function showCard(button, card) {
    button.classList.add('flipped');
    button.setAttribute('aria-label', `${card.kind === 'name' ? '穴名' : '现代定位'}：${card.label}`);
    button.innerHTML = `<span class="memory-kind">${card.kind === 'name' ? '穴名' : '现代定位'}</span><strong>${escapeHtml(card.label)}</strong>`;
  }
  function hideCard(button) {
    button.classList.remove('flipped', 'mismatch');
    button.setAttribute('aria-label', '未翻开的卡片');
    button.innerHTML = '<span class="memory-back">?</span><small>点击翻开</small>';
  }
  root.querySelectorAll('.memory-card').forEach((button) => button.addEventListener('click', () => {
    const card = byKey.get(button.dataset.key);
    if (locked || button.disabled || button === first) return;
    showCard(button, card);
    if (!first) { first = button; message.textContent = '再翻开一张，找出对应的穴名或定位。'; return; }
    attempts += 1;
    const previous = first;
    const previousCard = byKey.get(previous.dataset.key);
    first = null;
    if (gameCore.isPair(previousCard, card)) {
      previous.classList.add('matched');
      button.classList.add('matched');
      previous.disabled = true;
      button.disabled = true;
      matched.add(card.pointId);
      message.textContent = `配对正确：${round.find((point) => point.id === card.pointId).name}。`;
      if (matched.size === round.length) {
        root.querySelector('#game-results').innerHTML = gameResultMarkup(round, `共尝试 ${attempts} 次，错配 ${mistakes} 次。点击穴名可逐题查看解析。`);
        root.querySelector('.game-next-round').addEventListener('click', () => renderMemoryGame(scope));
      }
    } else {
      mistakes += 1;
      locked = true;
      previous.classList.add('mismatch');
      button.classList.add('mismatch');
      message.textContent = '不是同一穴位，稍后再试。';
      setTimeout(() => { hideCard(previous); hideCard(button); locked = false; }, 800);
    }
    status.textContent = `已配对 ${matched.size} / ${round.length} · 尝试 ${attempts} 次 · 错配 ${mistakes} 次`;
  }));
}

function renderLinkGame(scope = currentGameScope) {
  pageContext.textContent = '穴位连连看';
  const round = newGameRound(scope);
  if (round.length < 6) {
    root.innerHTML = '<div class="empty-state"><h3>这一范围的题目不足 6 个</h3><button class="primary-button" id="game-back">返回全部穴位</button></div>';
    root.querySelector('#game-back').addEventListener('click', () => renderLinkGame('all'));
    return;
  }
  const right = gameCore.shuffled(round);
  let selected = null;
  let mistakes = 0;
  const matched = [];
  root.innerHTML = `<div class="feature-hero"><div><div class="eyebrow">CONNECT THE POINTS</div><h2>穴位连连看</h2><p>先点左侧穴名，再点右侧对应的现代定位。配对正确会留下连线；答错可以重新选择。每局 6 对，不限时。</p></div><div class="feature-orbit"><div class="orbit-core">连</div></div></div>${gameToolbar(scope, '已连接 0 / 6 · 错配 0 次')}<section class="link-board" aria-label="穴位连连看"><svg class="link-lines" aria-hidden="true"></svg><div class="link-column"><h3>穴名</h3>${round.map((point) => `<button class="link-choice link-name" type="button" data-point-id="${escapeHtml(point.id)}" aria-pressed="false">${escapeHtml(point.name)}</button>`).join('')}</div><div class="link-column"><h3>现代定位</h3>${right.map((point) => `<button class="link-choice link-location" type="button" data-point-id="${escapeHtml(point.id)}">${escapeHtml(point.locationText)}</button>`).join('')}</div></section><p class="game-message" aria-live="polite">选择左侧的一个穴位。</p><section id="game-results"></section>`;
  bindGameToolbar(renderLinkGame, scope);
  const board = root.querySelector('.link-board');
  const status = root.querySelector('.game-status');
  const message = root.querySelector('.game-message');
  const svg = board.querySelector('.link-lines');
  const colors = ['#348979', '#bc7946', '#6f78b2', '#aa6588', '#5c90ad', '#92833d'];
  drawActiveLinks = () => {
    if (!board.isConnected) return;
    const box = board.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.innerHTML = '';
    matched.forEach((pair, index) => {
      const leftBox = pair.left.getBoundingClientRect();
      const rightBox = pair.right.getBoundingClientRect();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', leftBox.right - box.left);
      line.setAttribute('y1', leftBox.top + leftBox.height / 2 - box.top);
      line.setAttribute('x2', rightBox.left - box.left);
      line.setAttribute('y2', rightBox.top + rightBox.height / 2 - box.top);
      line.setAttribute('stroke', colors[index % colors.length]);
      line.setAttribute('stroke-width', '3');
      svg.appendChild(line);
    });
  };
  root.querySelectorAll('.link-name').forEach((button) => button.addEventListener('click', () => {
    if (button.disabled) return;
    if (selected) { selected.classList.remove('selected'); selected.setAttribute('aria-pressed', 'false'); }
    selected = button;
    button.classList.add('selected');
    button.setAttribute('aria-pressed', 'true');
    message.textContent = `已选择 ${button.textContent}，请点右侧定位。`;
  }));
  root.querySelectorAll('.link-location').forEach((button) => button.addEventListener('click', () => {
    if (button.disabled) return;
    if (!selected) { message.textContent = '请先选择左侧穴名。'; return; }
    if (selected.dataset.pointId === button.dataset.pointId) {
      selected.classList.remove('selected');
      selected.classList.add('matched');
      button.classList.add('matched');
      selected.setAttribute('aria-pressed', 'false');
      selected.disabled = true;
      button.disabled = true;
      matched.push({ left: selected, right: button });
      message.textContent = `连接正确：${selected.textContent}。`;
      selected = null;
      drawActiveLinks();
      if (matched.length === round.length) {
        root.querySelector('#game-results').innerHTML = gameResultMarkup(round, `6 对全部连接完成，错配 ${mistakes} 次。点击穴名可逐题查看解析。`);
        root.querySelector('.game-next-round').addEventListener('click', () => renderLinkGame(scope));
      }
    } else {
      mistakes += 1;
      button.classList.add('mismatch');
      setTimeout(() => button.classList.remove('mismatch'), 550);
      message.textContent = '定位不对应，请重新选择。';
    }
    status.textContent = `已连接 ${matched.length} / ${round.length} · 错配 ${mistakes} 次`;
  }));
}
