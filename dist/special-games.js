const specialCore = window.XuejianSpecialGameCore;
let specialSession = null;
const specialDescriptions = {
  '五输穴': '十二经在肘、膝以下各有井、荥、输、经、合五穴。',
  '井': '五输穴之井穴；本局找出三个不同经脉的井穴。',
  '荥': '五输穴之荥穴；本局找出三个不同经脉的荥穴。',
  '输': '五输穴之输穴；阴经输穴同时也是本经原穴。',
  '经': '五输穴之经穴；本局找出三个经穴。',
  '合': '五输穴之合穴；本局找出三个合穴。',
  '原穴': '十二经各有一原穴；六阴经原穴兼本经输穴。',
  '络穴': '本题库练习十二经络穴，不涵盖十五络穴的全部成员。',
  '郄穴': '本题库练习十二经郄穴，不涵盖十六郄穴的全部成员。',
};
function specialStop() { if (specialSession?.timer) clearInterval(specialSession.timer); specialSession = null; }
function specialSaved(result) {
  try {
    const key = 'xuejian-special-games-v1';
    const old = JSON.parse(localStorage.getItem(key) || '[]');
    old.unshift({ ...result, at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(old.slice(0, 100)));
  } catch (_) { /* private browsing can still play */ }
}
function specialMedicalMistake(point, label) {
  try {
    const key = 'xuejian-special-mistakes-v1';
    const old = JSON.parse(localStorage.getItem(key) || '{}');
    const id = point.id, now = Date.now();
    old[id] = { pointId: id, label, errors: (old[id]?.errors || 0) + 1, streak: 0, dueAt: now + 10 * 60 * 1000, lastAt: new Date(now).toISOString() };
    localStorage.setItem(key, JSON.stringify(old));
  } catch (_) { /* local storage is optional */ }
}
function specialMedicalSuccess(point, label) {
  try {
    const key = 'xuejian-special-mistakes-v1', old = JSON.parse(localStorage.getItem(key) || '{}'), item = old[point.id];
    if (!item) return;
    const streak = Math.min(6, (item.streak || 0) + 1), days = [1, 3, 7, 14, 30, 60][streak - 1];
    old[point.id] = { ...item, label, streak, dueAt: Date.now() + Math.max(60 * 60 * 1000, days * 86400000 / (1 + item.errors * 0.5)) };
    localStorage.setItem(key, JSON.stringify(old));
  } catch (_) { /* local storage is optional */ }
}
function specialPriorityIds() {
  try {
    const old = JSON.parse(localStorage.getItem('xuejian-special-mistakes-v1') || '{}');
    return Object.values(old).filter((item) => item.dueAt <= Date.now()).sort((a, b) => b.errors - a.errors).map((item) => item.pointId);
  } catch (_) { return []; }
}
function specialMotionDelay() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
}
function specialFeedback(session) {
  const fx = session.fx;
  if (!fx || Date.now() >= fx.until) return '';
  return `<div class="special-feedback ${fx.kind}" aria-hidden="true"><div class="special-feedback-copy"><strong>${escapeHtml(fx.title)}</strong><span>${escapeHtml(fx.detail)}</span></div>${Array.from({ length: 7 }, () => '<i></i>').join('')}</div>`;
}
function specialTimer(session, redraw) {
  if (session.mode !== 'challenge') return;
  session.timer = setInterval(() => {
    if (specialSession !== session || session.done || session.locked || document.hidden || state.view !== session.view) return;
    session.remaining -= 1;
    if (session.remaining <= 0) { session.remaining = 0; session.done = true; specialSaved({ game: session.view, chapter: session.chapter || session.target, score: Math.max(0, session.score), completed: false }); }
    redraw();
  }, 1000);
}
function specialModes(session) {
  return `<label>模式<select id="special-mode" class="select-control"><option value="learn"${session.mode === 'learn' ? ' selected' : ''}>不限时学习</option><option value="challenge"${session.mode === 'challenge' ? ' selected' : ''}>180 秒挑战</option></select></label>`;
}
function specialResults(session, points, description) {
  const unique = [...new Map(points.map((p) => [p.id, p])).values()];
  return `<section class="game-result"><h3>${session.remaining === 0 && session.mode === 'challenge' ? '时间到' : '本局完成'}</h3><p>${escapeHtml(description)}</p>${session.mode === 'challenge' ? `<p>挑战得分：${Math.max(0, session.score + (session.done && session.remaining > 0 ? session.remaining : 0))}</p>` : ''}<div class="game-answer-list">${unique.map((p) => `<details><summary>${escapeHtml(p.name)} · ${escapeHtml(specialCore.identity(p))}</summary><p>${escapeHtml(p.explanation || '')}</p></details>`).join('')}</div><button type="button" class="primary-button" id="special-again">换一局继续</button></section>`;
}
function specialInlineExplanation(points) {
  if (!points || !points.length) return '';
  const unique = [...new Map(points.map((point) => [point.id, point])).values()];
  return `<div class="game-answer-list">${unique.map((point) => `<details><summary>${escapeHtml(point.name)} · ${escapeHtml(specialCore.identity(point))} · 查看解析</summary><p>${escapeHtml(point.explanation || '')}</p></details>`).join('')}</div>`;
}
function renderSpecialMatchGame(target = '五输穴', mode = 'learn', tutorial = false) {
  if (tutorial) { target = '井'; mode = 'learn'; }
  specialStop();
  state.view = 'match';
  document.body.dataset.view = 'match';
  pageContext.textContent = '特定穴消消乐';
  const session = { view: 'match', target, mode, tutorial, board: specialCore.makeMatchBoard(state.data, target), selected: -1, moves: 0, invalid: 0, hints: 0, remaining: mode === 'challenge' ? 180 : null, score: 0, done: false, locked: false, fx: null, rulesOpen: window.matchMedia('(min-width: 721px)').matches, seen: new Map(), exposed: new Map(), lastExplained: [], message: tutorial ? '新手关：依次点击高亮的两格，完成一次“井穴”三消。' : '先选一格，再选相邻格；凑齐三个本类穴位。', hint: [] };
  if (tutorial) session.hint = specialCore.validSwaps(session.board, target)[0];
  session.board.forEach((point) => session.exposed.set(point.id, point));
  specialSession = session;
  function paint() {
    if (specialSession !== session) return;
    const example = state.data.points.find((p) => specialCore.hasCategory(p, target));
    root.innerHTML = `<div class="feature-hero special-hero"><div><div class="eyebrow">SPECIAL ACUPOINT MATCH 3</div><h2>特定穴消消乐</h2><p>交换相邻穴名，横向或纵向凑出三个不同的目标类穴位即可消除。完成 6 次有效消除。</p></div></div>
      <details class="special-rules"${session.rulesOpen ? ' open' : ''}><summary>怎么玩？先看这 4 步</summary><ol><li>选一个目标类别，例如“井穴”。棋子上只写穴名，需要你判断类别。</li><li>依次点击相邻的两格，让它们交换位置。</li><li>横排或竖排凑齐 3 个不同的本类穴位就会消除；其他类别不算。</li><li>正式关消除 6 次通关。学习不限时，挑战限 180 秒；不确定时点“提示”。</li></ol></details>
      <div class="explorer-toolbar game-toolbar special-controls"><label>目标类别<select id="special-target" class="select-control">${specialCore.TARGETS.map((name) => `<option value="${name}"${name === target ? ' selected' : ''}>${name === '络穴' || name === '郄穴' ? `十二经${name}` : name}</option>`).join('')}</select></label>${specialModes(session)}<button type="button" class="ghost-button" id="special-tutorial">${tutorial ? '退出新手关' : '先玩新手关'}</button><button type="button" class="ghost-button" id="special-hint">提示 ${mode === 'challenge' ? `${3 - session.hints}/3` : ''}</button><button type="button" class="ghost-button" id="special-reset">重新开局</button></div>
      <p class="special-instruction">${escapeHtml(specialDescriptions[target])} 示例：${escapeHtml(example.name)}（${escapeHtml(specialCore.identity(example))}）。</p>
      <p class="game-status">${tutorial ? '新手关' : '有效消除'} ${session.moves}/${tutorial ? 1 : 6} · 无效交换 ${session.invalid} · 已见 ${session.exposed.size} 穴${mode === 'challenge' ? ` · 剩余 ${session.remaining} 秒 · ${Math.max(0, session.score)} 分` : ''}</p>
      <div class="special-board-wrap"><div class="special-match-board" aria-label="特定穴三消棋盘">${session.board.map((p, index) => `<button type="button" class="special-tile${index === session.selected ? ' selected' : ''}${session.hint.includes(index) ? ' hinted' : ''}${session.fx?.cells?.includes(index) ? ` ${session.fx.kind === 'clearing' ? 'clearing' : session.fx.kind === 'invalid' ? 'invalid' : 'entering'}` : ''}" data-index="${index}" aria-label="${escapeHtml(p.name)}">${escapeHtml(p.name)}</button>`).join('')}</div>${specialFeedback(session)}</div>
      <p class="game-message" aria-live="polite">${escapeHtml(session.message)}</p>
      ${specialInlineExplanation(session.lastExplained)}
      ${session.done ? specialResults(session, [...session.exposed.values()], `有效消除 ${session.moves} 次，无效交换 ${session.invalid} 次，接触 ${session.exposed.size} 穴，提示 ${session.hints} 次。`) : ''}`;
    root.querySelector('.special-rules').ontoggle = (e) => { session.rulesOpen = e.target.open; };
    root.querySelector('#special-target').onchange = (e) => renderSpecialMatchGame(e.target.value, mode);
    root.querySelector('#special-mode').onchange = (e) => renderSpecialMatchGame(target, e.target.value);
    root.querySelector('#special-tutorial').onclick = () => renderSpecialMatchGame(tutorial ? '五输穴' : '井', 'learn', !tutorial);
    root.querySelector('#special-reset').onclick = () => renderSpecialMatchGame(target, mode, tutorial);
    root.querySelector('#special-hint').onclick = () => {
      if (session.done || session.locked || mode === 'challenge' && session.hints >= 3) return;
      const move = specialCore.validSwaps(session.board, target)[0];
      session.hint = move || []; session.hints += 1;
      if (mode === 'challenge') session.score -= 30;
      session.message = move ? '高亮的两格交换后能形成目标类三消。' : '正在重排棋盘。';
      paint();
    };
    root.querySelectorAll('.special-tile').forEach((button) => button.onclick = () => {
      if (session.done || session.locked) return;
      const index = Number(button.dataset.index);
      if (tutorial && !session.hint.includes(index)) { session.message = '新手关先按高亮提示操作。'; paint(); return; }
      if (session.selected < 0 || !specialCore.adjacent(session.selected, index)) {
        session.selected = index; session.fx = null; session.message = '请再选相邻的一格。'; paint(); return;
      }
      const from = session.selected;
      const result = specialCore.resolveMatch(session.board, from, index, target, state.data, [...session.exposed.keys()]);
      session.selected = -1; session.hint = [];
      if (!result.valid) {
        session.invalid += 1; session.lastExplained = [];
        if (mode === 'challenge') session.score -= 10;
        session.message = `未组成三个不同的${target}，交换已撤回。`;
        session.fx = { kind: 'invalid', title: '再试一次', detail: '还没凑成三个目标穴位', cells: [from, index], until: Date.now() + 650 };
        paint(); return;
      }
      const preview = session.board.slice();
      [preview[from], preview[index]] = [preview[index], preview[from]];
      const cells = [...new Set(specialCore.matchLines(preview, target).filter((line) => line.includes(from) || line.includes(index)).flat())];
      const earned = 100 + Math.max(0, result.firstCount - 3) * 25 + result.cascadeGroups * 25;
      session.board = preview; session.locked = true;
      session.fx = { kind: 'clearing', title: result.cascadeRounds ? `连击 ×${result.cascadeRounds + 1}` : '三消成功！', detail: mode === 'challenge' ? `+${earned} 分` : `${result.firstCount} 穴消除`, cells, until: Date.now() + 1000 };
      session.message = `消除成功，${result.firstCount} 个${target}正在消除。`;
      paint();
      setTimeout(() => {
        if (specialSession !== session) return;
        session.board = result.board; session.moves += 1; session.locked = false;
        session.board.forEach((point) => session.exposed.set(point.id, point));
        if (mode === 'challenge') session.score += earned;
        result.cleared.filter((p) => !session.seen.has(p.id)).forEach((p) => session.seen.set(p.id, p));
        result.cleared.forEach((p) => specialMedicalSuccess(p, target));
        session.lastExplained = result.cleared;
        session.message = `消除成功：${result.cleared.slice(0, 4).map((p) => `${p.name}（${specialCore.identity(p)}）`).join('、')}${result.cascadeRounds ? `；连击 ${result.cascadeRounds} 轮` : ''}`;
        if (session.moves >= (tutorial ? 1 : 6)) { session.done = true; session.message = tutorial ? '新手关完成！你已学会交换相邻穴名并凑齐三个井穴。' : session.message; if (!tutorial) specialSaved({ game: 'match', chapter: target, score: Math.max(0, session.score + (session.remaining || 0)), completed: true, seenIds: [...session.seen.keys()] }); }
        session.fx = { kind: 'settling', title: session.done ? '闯关成功！' : result.cascadeGroups ? '连击加分！' : '漂亮！', detail: session.done ? '完成本关' : `${session.moves}/${tutorial ? 1 : 6} 次有效消除`, cells, until: Date.now() + 1000 };
        paint();
      }, specialMotionDelay());
    });
    if (session.done) root.querySelector('#special-again').onclick = () => renderSpecialMatchGame(tutorial ? '五输穴' : target, tutorial ? 'learn' : mode);
  }
  specialTimer(session, paint); paint();
}
function renderSpecialLinkGame(chapter = 'meridian', value = null, mode = 'learn', tutorial = false) {
  if (tutorial) { chapter = 'meridian'; value = state.data.meridians[0]; mode = 'learn'; }
  specialStop();
  state.view = 'points';
  document.body.dataset.view = 'points';
  pageContext.textContent = '特定穴连连看';
  if (!value) value = chapter === 'meridian' ? state.data.meridians[0] : '井';
  const pairs = specialCore.linkPairs(state.data, chapter, value, Math.random, specialPriorityIds()).slice(0, tutorial ? 3 : undefined);
  const session = { view: 'points', chapter, value, mode, tutorial, pairs, board: specialCore.makeLinkBoard(pairs), selected: -1, matched: 0, wrong: 0, blocked: 0, hints: 0, remaining: mode === 'challenge' ? 180 : null, score: 0, done: false, locked: false, fx: null, rulesOpen: window.matchMedia('(min-width: 721px)').matches, message: tutorial ? '新手关：先点高亮穴名，再点高亮身份。' : '先选穴名，再选特定穴身份。', mistakes: new Set(), hint: [], line: null, lastExplained: [] };
  if (tutorial) { const link = specialCore.legalLinks(session.board)[0]; session.hint = [link.a, link.b]; }
  specialSession = session;
  function paint() {
    if (specialSession !== session) return;
    const values = chapter === 'meridian' ? state.data.meridians : specialCore.TARGETS.slice(1);
    root.innerHTML = `<div class="feature-hero special-hero"><div><div class="eyebrow">SPECIAL ACUPOINT LINK</div><h2>特定穴连连看</h2><p>穴名连接其特定穴身份。连线不得穿过棋子，最多转两次弯；可从棋盘外侧绕行。</p></div></div>
      <details class="special-rules"${session.rulesOpen ? ' open' : ''}><summary>怎么玩？先看这 4 步</summary><ol><li>先点一块穴名，再点它的正确身份，例如“少商”连“井穴”。</li><li>两块之间的线不能穿过其他棋子，最多拐两次弯；棋盘外缘也能绕。</li><li>身份选错会给解析；身份正确但路线被挡，请先消除别的配对。</li><li>消完所有配对通关。单经脉有 7 或 8 对，跨经同类有 6 对。</li></ol></details>
      <div class="explorer-toolbar game-toolbar special-controls"><label>关卡<select id="link-chapter" class="select-control"><option value="meridian"${chapter === 'meridian' ? ' selected' : ''}>单经脉</option><option value="category"${chapter === 'category' ? ' selected' : ''}>跨经脉同类</option></select></label><label>范围<select id="link-value" class="select-control">${values.map((item) => `<option value="${escapeHtml(item)}"${item === value ? ' selected' : ''}>${escapeHtml(item === '络穴' || item === '郄穴' ? `十二经${item}` : item)}</option>`).join('')}</select></label>${specialModes(session)}<button type="button" class="ghost-button" id="special-tutorial">${tutorial ? '退出新手关' : '先玩新手关'}</button><button type="button" class="ghost-button" id="special-hint">提示 ${mode === 'challenge' ? `${3 - session.hints}/3` : ''}</button><button type="button" class="ghost-button" id="special-reset">重新开局</button></div>
      <p class="special-instruction">${chapter === 'meridian' ? '本经的井、荥、输、经、合、原、络、郄；阴经输穴兼原穴为同一对。' : `跨经脉辨认${value}穴，每条经脉只出现一个正确身份。`}</p>
      <p class="game-status">已连接 ${session.matched}/${pairs.length} · 医学错配 ${session.wrong} · 路线受阻 ${session.blocked}${mode === 'challenge' ? ` · 剩余 ${session.remaining} 秒 · ${Math.max(0, session.score)} 分` : ''}</p>
      <div class="special-link-wrap"><div class="special-link-board" aria-label="特定穴路径连连看">${session.board.map((tile, index) => `<button type="button" class="special-tile${!tile ? ' empty' : ''}${index === session.selected ? ' selected' : ''}${session.hint.includes(index) ? ' hinted' : ''}${session.fx?.cells?.includes(index) ? ` ${session.fx.kind === 'linking' ? 'connecting' : 'invalid'}` : ''}" data-index="${index}" ${!tile ? 'disabled' : ''}>${tile ? escapeHtml(tile.label) : ''}</button>`).join('')}</div><svg class="special-link-line" aria-hidden="true"></svg>${specialFeedback(session)}</div>
      <p class="game-message" aria-live="polite">${escapeHtml(session.message)}</p>
      ${specialInlineExplanation(session.lastExplained)}
      ${session.done ? specialResults(session, pairs.map((pair) => pair.point), `连接 ${session.matched} 对，医学错配 ${session.wrong} 次，路线受阻 ${session.blocked} 次，提示 ${session.hints} 次。`) : ''}`;
    root.querySelector('.special-rules').ontoggle = (e) => { session.rulesOpen = e.target.open; };
    root.querySelector('#link-chapter').onchange = (e) => renderSpecialLinkGame(e.target.value, null, mode);
    root.querySelector('#link-value').onchange = (e) => renderSpecialLinkGame(chapter, e.target.value, mode);
    root.querySelector('#special-mode').onchange = (e) => renderSpecialLinkGame(chapter, value, e.target.value);
    root.querySelector('#special-tutorial').onclick = () => renderSpecialLinkGame('meridian', null, 'learn', !tutorial);
    root.querySelector('#special-reset').onclick = () => renderSpecialLinkGame(chapter, value, mode, tutorial);
    root.querySelector('#special-hint').onclick = () => {
      if (session.done || session.locked || mode === 'challenge' && session.hints >= 3) return;
      const link = specialCore.legalLinks(session.board)[0];
      if (!link) { session.board = specialCore.reshuffleLinkBoard(session.board); session.message = '无路可连，剩余棋子已重排。'; }
      else { session.hint = [link.a, link.b]; session.message = '高亮的两块可以正确连接。'; }
      session.hints += 1; if (mode === 'challenge') session.score -= 30; paint();
    };
    root.querySelectorAll('.special-tile:not(.empty)').forEach((button) => button.onclick = () => {
      if (session.done || session.locked) return;
      const index = Number(button.dataset.index), tile = session.board[index];
      if (tutorial && !session.hint.includes(index)) { session.message = '新手关先按高亮的两块操作。'; paint(); return; }
      if (tile.kind === 'name') { session.selected = index; session.fx = null; session.message = `已选${tile.label}，请选择它的特定穴身份。`; paint(); return; }
      if (session.selected < 0) { session.message = '请先选择穴名。'; paint(); return; }
      const nameTile = session.board[session.selected], nameIndex = session.selected;
      session.hint = [];
      if (nameTile.id !== tile.id) {
        const point = pairs.find((pair) => pair.id === nameTile.id).point;
        session.lastExplained = [point];
        session.wrong += 1; session.mistakes.add(point.id); if (mode === 'challenge') session.score -= 20;
        specialMedicalMistake(point, pairs.find((pair) => pair.id === point.id).label);
        session.message = `${point.name}的正确身份是${pairs.find((pair) => pair.id === point.id).label}；请重新连接。`;
        session.fx = { kind: 'invalid', title: '身份不符', detail: `正确身份：${pairs.find((pair) => pair.id === point.id).label}`, cells: [nameIndex, index], until: Date.now() + 850 };
      } else {
        const path = specialCore.pathBetween(session.board, nameIndex, index);
        if (!path) { session.blocked += 1; session.message = '医学身份正确，但路线被棋子挡住；最多只能转两次弯。'; session.fx = { kind: 'blocked', title: '路线被挡', detail: '先消除其他配对', cells: [nameIndex, index], until: Date.now() + 850 }; }
        else {
          const point = pairs.find((pair) => pair.id === tile.id).point;
          session.line = path; session.selected = -1; session.locked = true;
          session.fx = { kind: 'linking', title: '连线正确！', detail: `${point.name} · ${specialCore.identity(point)}`, cells: [nameIndex, index], until: Date.now() + 1100 };
          session.message = `连线正确：${point.name}（${specialCore.identity(point)}）。`;
          paint();
          setTimeout(() => {
            if (specialSession !== session) return;
            session.board[nameIndex] = null; session.board[index] = null; session.matched += 1; session.locked = false; session.line = null;
            if (mode === 'challenge') session.score += 100;
            session.lastExplained = [point];
            specialMedicalSuccess(point, pairs.find((pair) => pair.id === tile.id).label);
            session.message = `连接正确：${point.name}（${specialCore.identity(point)}）。`;
            if (session.matched === pairs.length) { session.done = true; if (tutorial) session.message = '新手关完成！你已学会穴名连身份，以及最多两次转弯的路径规则。'; else specialSaved({ game: 'link', chapter: `${chapter}:${value}`, score: Math.max(0, session.score + (session.remaining || 0)), completed: true, wrongIds: [...session.mistakes] }); }
            else if (!specialCore.legalLinks(session.board).length) { session.board = specialCore.reshuffleLinkBoard(session.board); session.message += ' 剩余棋子无路可连，已自动重排。'; }
            if (tutorial && !session.done) { const next = specialCore.legalLinks(session.board)[0]; session.hint = [next.a, next.b]; }
            session.fx = { kind: 'settling', title: session.done ? '闯关成功！' : '配对完成！', detail: session.done ? '完成本关' : `${session.matched}/${pairs.length} 对已连接${mode === 'challenge' ? ' · +100 分' : ''}`, cells: [], until: Date.now() + 950 };
            paint();
          }, specialMotionDelay() + 100);
          return;
        }
      }
      paint();
    });
    if (session.line) {
      const wrap = root.querySelector('.special-link-wrap'), tiles = [...wrap.querySelectorAll('.special-tile')];
      const box = wrap.getBoundingClientRect(), first = tiles[0].getBoundingClientRect(), second = tiles[1].getBoundingClientRect(), lower = tiles[4].getBoundingClientRect();
      const dx = second.left - first.left, dy = lower.top - first.top;
      const x0 = first.left + first.width / 2 - box.left, y0 = first.top + first.height / 2 - box.top;
      const svg = wrap.querySelector('svg'); svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      const points = session.line.map(([y, x]) => `${x0 + (x - 1) * dx},${y0 + (y - 1) * dy}`).join(' ');
      svg.innerHTML = `<polyline class="special-drawn-line" pathLength="100" points="${points}" fill="none" stroke="#3b9f7b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (session.done) root.querySelector('#special-again').onclick = () => renderSpecialLinkGame(chapter, value, mode);
  }
  specialTimer(session, paint); paint();
}
