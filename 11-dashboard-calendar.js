/* ============================================================
   11-dashboard-calendar.js
   Календарь тренера:
   - ячейка дня = одна ТРЕНИРОВКА (даже если внутри несколько блоков)
   - клик по дню → модалка со списком тренировок дня
   - клик по тренировке → редактор с блоками
   - кнопка «Отметить факт» → модалка отметки (гибрид):
       * по умолчанию блок = «Выполнено» у всех присутствующих
       * исключения точечно: чекбокс присутствия + селект факта + комментарий
   ============================================================ */

/* ===== Месячная сетка ===== */
function renderCoachCalendar() {
  const el = document.getElementById('coach-calendar-content');
  if (!el) return;

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  if (!coachCalMonth) coachCalMonth = currentMonth;

  const [year, month] = coachCalMonth.split('-').map(Number);

  el.innerHTML = `
    <div class="card cc-toolbar-card">
      <div class="cc-toolbar">
        <div class="cc-nav">
          <button class="cc-nav-btn" onclick="coachCalShiftMonth(-1)" title="Предыдущий месяц">‹</button>
          <div class="cc-month-title">${MONTH_NAMES_RU[month - 1]} ${year}</div>
          <button class="cc-nav-btn" onclick="coachCalShiftMonth(1)" title="Следующий месяц">›</button>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="coachCalToday()">Текущий месяц</button>
        <button class="btn btn-sm" onclick="openNewSessionForDate(localDateStr(new Date()))">+ Тренировка</button>
        <div class="cc-legend">
          <span><span class="cc-dot cc-dot-self"></span> Самостоятельная</span>
          <span><span class="cc-dot cc-dot-ind"></span> Индивидуальная</span>
          <span><span class="cc-dot cc-dot-grp"></span> В группе</span>
        </div>
      </div>
    </div>
    <div class="card cc-month-card">
      <div class="cc-month-wrap">
        <div class="cc-month-head">
          ${DOW_SHORT_RU.map((d, i) => `<div class="cc-dow-head ${i >= 5 ? 'weekend' : ''}">${d}</div>`).join('')}
        </div>
        <div class="cc-month-grid" id="cc-month-grid"></div>
      </div>
    </div>
  `;

  renderCoachMonthGrid(year, month);
}

function coachCalShiftMonth(delta) {
  const [y, m] = coachCalMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  coachCalMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderCoachCalendar();
}

function coachCalToday() {
  const today = new Date();
  coachCalMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  renderCoachCalendar();
}

function renderCoachMonthGrid(year, month) {
  const grid = document.getElementById('cc-month-grid');
  if (!grid) return;

  const first = new Date(year, month - 1, 1);
  let dow = first.getDay(); if (dow === 0) dow = 7;
  const firstMonday = new Date(year, month - 1, 1 - (dow - 1));

  const today = localDateStr(new Date());
  const days = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(firstMonday);
    d.setDate(firstMonday.getDate() + i);
    days.push(d);
  }
  while (days.length > 35) {
    const lastWeek = days.slice(-7);
    if (lastWeek.every(d => d.getMonth() !== (month - 1))) {
      days.length = days.length - 7;
    } else break;
  }

  let html = '';
  days.forEach(d => {
    const ds = localDateStr(d);
    const isOther = d.getMonth() !== (month - 1);
    const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
    const isToday = ds === today;

    const sessions = collectDaySessions(ds);
    const total = sessions.length;
    const visible = sessions.slice(0, 3);

    html += `<div class="cc-day ${isOther ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
                  onclick="openDaySessions('${ds}')">
      <div class="cc-day-head">
        <span class="cc-day-num ${isToday ? 'today-badge' : ''}">${d.getDate()}</span>
        ${total ? `<span class="cc-day-total">${total}</span>` : ''}
      </div>
      <div class="cc-day-bars">
        ${visible.map(sess => {
          const color = sessionColor(sess);
          const label = sess.name || (sess.blocks[0] && sess.blocks[0].complex) || 'Тренировка';
          const t = sessionFirstTime(sess);
          return `<div class="cc-day-bar" style="background:${color}">
            ${t ? `<span class="cc-bar-time">${escapeHtml(t)}</span>` : ''}
            <span class="cc-bar-label">${escapeHtml(label)}</span>
          </div>`;
        }).join('')}
        ${sessions.length > 3 ? `<div class="cc-more">+${sessions.length - 3} ещё</div>` : ''}
      </div>
    </div>`;
  });

  grid.innerHTML = html;
}

function sessionFirstTime(sess) {
  if (!sess || !Array.isArray(sess.blocks) || !sess.blocks.length) return '';
  return sess.blocks[0].startTime || '';
}

/* ===== Сбор тренировок за день ===== */
function collectDaySessions(ds) {
  const map = new Map();

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!Array.isArray(day)) return;
    day.forEach(sess => {
      if (!sess) return;
      const key = sess.id || (sess.groupId ? sess.groupId + '|' + ds : ('solo_' + p.id + '_' + ds + '_' + (sess.name || '')));
      if (!map.has(key)) {
        map.set(key, {
          id: sess.id,
          groupId: sess.groupId,
          name: sess.name || '',
          note: sess.note || '',
          blocks: Array.isArray(sess.blocks) ? sess.blocks.map(b => ({ ...b })) : [],
          players: []
        });
      }
      const entry = map.get(key);
      if (!entry.players.find(x => x.id === p.id)) {
        entry.players.push({ id: p.id, fio: p.fio });
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    const ta = sessionFirstTime(a);
    const tb = sessionFirstTime(b);
    return (ta || '').localeCompare(tb || '');
  });
}

function sessionColor(sess) {
  const set = new Set();
  (sess.blocks || []).forEach(b => { if (b.format) set.add(b.format); });
  if (set.has('В группе')) return WORK_TYPE_COLORS['В группе'];
  if (set.has('Индивидуальная с тренером')) return WORK_TYPE_COLORS['Индивидуальная с тренером'];
  if (set.has('Самостоятельная')) return WORK_TYPE_COLORS['Самостоятельная'];
  return '#5a6169';
}

function sessionTotalMinutes(sess) {
  return (sess.blocks || []).reduce((acc, b) => acc + (Number(b.duration) || 0), 0);
}

function sessionTimeRange(sess) {
  if (!sess.blocks || !sess.blocks.length) return '';
  const sorted = sess.blocks
    .filter(b => b.startTime)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  if (!sorted.length) return '';
  const firstStart = sorted[0].startTime;
  const last = sorted[sorted.length - 1];
  const end = minutesToTime(timeToMinutes(last.startTime) + (Number(last.duration) || 0));
  return `${firstStart}–${end}`;
}

/* ============================================================
   МОДАЛКА ДНЯ
   ============================================================ */
function openDaySessions(ds) {
  const sessions = collectDaySessions(ds);
  const title = formatDateFull(ds);

  const listHtml = sessions.length
    ? sessions.map((s, i) => {
        const color = sessionColor(s);
        const total = sessionTotalMinutes(s);
        const range = sessionTimeRange(s);
        const blocksLine = s.blocks.length
          ? s.blocks.map(b => `${b.complex || 'Блок'} (${b.format || '—'}, ${b.duration || 0} мин)`).join(' · ')
          : '—';
        // Считаем статус факта
        const facts = computeSessionFactsSummary(s, ds);
        const factHtml = `
          <span class="cc-fact-pill done">✓ ${facts.done}</span>
          <span class="cc-fact-pill partial">~ ${facts.partial}</span>
          <span class="cc-fact-pill notdone">✗ ${facts.notdone}</span>
          ${facts.unmarked ? `<span class="cc-fact-pill unmarked">? ${facts.unmarked}</span>` : ''}
        `;
        return `<div class="cc-sess-item" style="border-left-color:${color}">
          <div class="cc-sess-main">
            <div class="cc-sess-time">${escapeHtml(range)} · ${total} мин</div>
            <div class="cc-sess-name">${escapeHtml(s.name || 'Тренировка')}</div>
            <div class="cc-sess-meta">${escapeHtml(blocksLine)}</div>
            <div class="cc-sess-meta" style="margin-top:4px">${s.players.length} ${plural(s.players.length, 'игрок', 'игрока', 'игроков')} · ${factHtml}</div>
            ${s.note ? `<div class="cc-sess-note">${escapeHtml(s.note)}</div>` : ''}
          </div>
          <div class="cc-sess-actions">
            <button class="cc-sess-fact" title="Отметить факт" onclick="openSessionFactModal('${ds}', ${i}, event)">✓ Отметить</button>
            <button class="cc-sess-edit" title="Редактировать тренировку" onclick="openSessionEditor('${ds}', ${i}, event)">✎</button>
            <button class="cc-sess-del" title="Удалить тренировку" onclick="deleteSessionFromDay('${ds}', ${i}, event)">🗑</button>
          </div>
        </div>`;
      }).join('')
    : '<p class="subtitle" style="text-align:center;padding:20px 0">На этот день тренировок нет.</p>';

  openModal(`<h3>${escapeHtml(title)}</h3>
    <div class="cc-day-list">${listHtml}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="openNewSessionForDate('${ds}')">+ Добавить тренировку</button>
      <button class="btn-ghost btn" onclick="closeModal()">Закрыть</button>
    </div>`);
}

/* Подсчёт факта по тренировке (суммарно по всем игрокам и блокам) */
function computeSessionFactsSummary(sess, ds) {
  let done = 0, partial = 0, notdone = 0, unmarked = 0;
  const sessionId = sess.id;

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!Array.isArray(day)) return;
    day.forEach(s => {
      if (s.id !== sessionId) return;
      (s.blocks || []).forEach(b => {
        if (b.fact === 'done') done++;
        else if (b.fact === 'partial') partial++;
        else if (b.fact === 'notdone') notdone++;
        else unmarked++;
      });
    });
  });

  return { done, partial, notdone, unmarked };
}

/* ============================================================
   РЕДАКТОР ТРЕНИРОВКИ (с блоками)
   ============================================================ */
let __sessionEditContext = null;

function openSessionEditor(ds, idx, ev) {
  if (ev) ev.stopPropagation();
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  __sessionEditContext = {
    ds,
    isEdit: true,
    originalId: s.id,
    originalGroupId: s.groupId,
    originalBlocks: s.blocks.map(b => ({ ...b })),
    name: s.name || '',
    note: s.note || '',
    playerIds: s.players.map(p => p.id),
    blocks: s.blocks.length ? s.blocks.map(b => ({
      complex: b.complex || '',
      format: b.format || '',
      startTime: b.startTime || '18:00',
      duration: Number(b.duration) || 60,
      note: b.note || '',
      fact: b.fact || '',
      comment: b.comment || ''
    })) : [newEmptyBlock()]
  };

  renderSessionForm();
}

function openNewSessionForDate(ds) {
  __sessionEditContext = {
    ds,
    isEdit: false,
    originalId: null,
    originalGroupId: null,
    originalBlocks: null,
    name: '',
    note: '',
    playerIds: [],
    blocks: [newEmptyBlock()]
  };
  renderSessionForm();
}

function newEmptyBlock() {
  return {
    complex: '',
    format: '',
    startTime: '18:00',
    duration: 60,
    note: '',
    fact: '',
    comment: ''
  };
}

function renderSessionForm() {
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const allBlocks = Array.from(new Set(DB.exercises.map(g => g.group)));

  syncFormToContext();

  const blocksHtml = ctx.blocks.map((b, i) => renderBlockEditor(b, i, allBlocks)).join('');
  const playersHtml = renderCoachGroupedPlayers(DB.players, ctx.playerIds);

  openModal(`<h3>${ctx.isEdit ? 'Редактирование тренировки' : 'Новая тренировка'}</h3>
    <p class="subtitle" style="margin-top:-8px">${escapeHtml(formatDateFull(ctx.ds))}</p>

    <div class="field"><label>Дата</label>
      <input type="date" id="cs-date" value="${escapeAttr(ctx.ds)}"></div>

    <div class="field"><label>Название тренировки (необязательно)</label>
      <input id="cs-name" value="${escapeAttr(ctx.name || '')}" placeholder="Например: Ледовая, ОФП, Игровая"></div>

    <div class="field"><label>Примечание к тренировке</label>
      <input id="cs-note" value="${escapeAttr(ctx.note || '')}" placeholder="акцент на ногах и т.п."></div>

    <div class="field">
      <label>Блоки тренировки</label>
      <div id="cs-blocks-list">${blocksHtml}</div>
      <div style="margin-top:8px">
        <button type="button" class="btn btn-sm btn-ghost" onclick="addBlockToForm()">+ Добавить блок</button>
      </div>
    </div>

    <div class="field"><label>Игроки (можно несколько)</label>
      <div class="group-tools">
        <input type="text" id="cs-search" placeholder="Поиск по ФИО или команде…" oninput="filterCoachGroupPlayers('cs-grp-list','cs-search')">
        <button type="button" onclick="expandAllCoachTeams('cs-grp-list', true)">Развернуть все</button>
        <button type="button" onclick="expandAllCoachTeams('cs-grp-list', false)">Свернуть все</button>
        <button type="button" onclick="clearCoachGroupSelection('cs-grp-list')">Снять все</button>
      </div>
      <div class="group-list" id="cs-grp-list">${playersHtml}</div>
    </div>

    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveSessionFromForm()">Сохранить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);

  setTimeout(() => {
    document.querySelectorAll('#cs-grp-list .cc-grp-player').forEach(cb => {
      if (ctx.playerIds.includes(cb.value)) cb.checked = true;
    });
  }, 0);
}

function renderBlockEditor(block, idx, allBlocks) {
  const complexOptions = ['<option value="">— не выбрано —</option>']
    .concat(allBlocks.map(v => `<option value="${escapeAttr(v)}" ${block.complex === v ? 'selected' : ''}>${escapeHtml(v)}</option>`))
    .join('');

  const formatOptions = ['<option value="">— не выбрано —</option>']
    .concat(WORK_TYPES.map(v => `<option value="${escapeAttr(v)}" ${block.format === v ? 'selected' : ''}>${escapeHtml(v)}</option>`))
    .join('');

  const startT = block.startTime || '18:00';
  const dur = Number(block.duration) || 60;
  const endT = minutesToTime(timeToMinutes(startT) + dur);

  return `<div class="cc-block-editor" data-block-index="${idx}">
    <div class="cc-block-head">
      <span class="cc-block-num">Блок #${idx + 1}</span>
      <button type="button" class="cc-block-del" title="Удалить блок" onclick="removeBlockFromForm(${idx})">🗑</button>
    </div>

    <div class="field">
      <label>Комплекс упражнений (из справочника)</label>
      <select class="blk-complex" data-block-index="${idx}" onchange="onBlockFieldChange(${idx},'complex',this.value)">${complexOptions}</select>
    </div>

    <div class="field">
      <label>Формат работы</label>
      <select class="blk-format" data-block-index="${idx}" onchange="onBlockFieldChange(${idx},'format',this.value)">${formatOptions}</select>
    </div>

    <div class="cc-time-row">
      <div class="field"><label>Время начала</label>
        <input type="time" class="blk-start" data-block-index="${idx}" value="${escapeAttr(startT)}" onchange="onBlockStartChange(${idx}, this.value)"></div>
      <div class="field"><label>Продолжительность, мин</label>
        <input type="number" min="1" max="600" class="blk-dur" data-block-index="${idx}" value="${dur}" onchange="onBlockDurationChange(${idx}, this.value)"></div>
      <div class="field"><label>Окончание</label>
        <div class="cc-block-end" id="cs-block-end-${idx}">${endT}</div></div>
    </div>

    <div class="field">
      <label>Примечание к блоку</label>
      <input class="blk-note" data-block-index="${idx}" value="${escapeAttr(block.note || '')}" placeholder="например: акцент на ногах" onchange="onBlockFieldChange(${idx},'note',this.value)">
    </div>
  </div>`;
}

function syncFormToContext() {
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const dateEl = document.getElementById('cs-date');
  if (dateEl) ctx.ds = dateEl.value;
  const nameEl = document.getElementById('cs-name');
  if (nameEl) ctx.name = nameEl.value.trim();
  const noteEl = document.getElementById('cs-note');
  if (noteEl) ctx.note = noteEl.value.trim();

  const playerIds = [];
  document.querySelectorAll('#cs-grp-list .cc-grp-player:checked').forEach(cb => playerIds.push(cb.value));
  ctx.playerIds = playerIds;

  document.querySelectorAll('.cc-block-editor').forEach(el => {
    const i = parseInt(el.dataset.blockIndex);
    const b = ctx.blocks[i];
    if (!b) return;
    const complex = el.querySelector('.blk-complex')?.value;
    const format  = el.querySelector('.blk-format')?.value;
    const start   = el.querySelector('.blk-start')?.value;
    const dur     = el.querySelector('.blk-dur')?.value;
    const note    = el.querySelector('.blk-note')?.value;
    if (complex !== undefined) b.complex = complex;
    if (format  !== undefined) b.format  = format;
    if (start   !== undefined) b.startTime = start;
    if (dur     !== undefined) b.duration = Number(dur) || 0;
    if (note    !== undefined) b.note = note;
  });
}

function onBlockFieldChange(idx, field, value) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[idx]) return;
  ctx.blocks[idx][field] = value;
}
function onBlockStartChange(idx, value) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[idx]) return;
  ctx.blocks[idx].startTime = value;
  updateBlockEndPreview(idx);
}
function onBlockDurationChange(idx, value) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[idx]) return;
  ctx.blocks[idx].duration = Math.max(1, Number(value) || 1);
  updateBlockEndPreview(idx);
}
function updateBlockEndPreview(idx) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[idx]) return;
  const el = document.getElementById('cs-block-end-' + idx);
  if (!el) return;
  const b = ctx.blocks[idx];
  el.textContent = minutesToTime(timeToMinutes(b.startTime) + (Number(b.duration) || 0));
}

function addBlockToForm() {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const last = ctx.blocks[ctx.blocks.length - 1];
  let startTime = '18:00';
  let duration = 60;
  if (last) {
    startTime = minutesToTime(timeToMinutes(last.startTime || '18:00') + (Number(last.duration) || 0));
    duration = Number(last.duration) || 60;
  }
  ctx.blocks.push({
    complex: '', format: '', startTime, duration, note: '', fact: '', comment: ''
  });
  renderSessionForm();
}

function removeBlockFromForm(idx) {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  if (ctx.blocks.length <= 1) {
    ctx.blocks[0] = {
      complex: '', format: '', startTime: '18:00', duration: 60, note: '', fact: '', comment: ''
    };
  } else {
    ctx.blocks.splice(idx, 1);
  }
  renderSessionForm();
}

/* ===== Сохранение тренировки ===== */
function saveSessionFromForm() {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const ds = ctx.ds;
  if (!ds) { alert('Укажите дату'); return; }

  const validBlocks = [];
  for (let i = 0; i < ctx.blocks.length; i++) {
    const b = ctx.blocks[i];
    const hasAny = (b.complex || '').trim() || (b.format || '').trim() || (b.note || '').trim();
    if (!hasAny) continue;

    if (!b.startTime) { alert(`Блок #${i + 1}: укажите время начала`); return; }
    if (!b.duration || Number(b.duration) <= 0) { alert(`Блок #${i + 1}: укажите продолжительность`); return; }

    validBlocks.push({
      id: (b.id) || uid('blk'),
      complex: (b.complex || '').trim(),
      format: b.format || '',
      startTime: b.startTime,
      duration: Number(b.duration),
      note: (b.note || '').trim(),
      fact: b.fact || '',
      comment: b.comment || ''
    });
  }

  if (!validBlocks.length) { alert('Добавьте хотя бы один блок'); return; }
  if (!ctx.playerIds.length) { alert('Выберите хотя бы одного игрока'); return; }

  const newSession = {
    id: ctx.originalId || uid('sess'),
    name: (ctx.name || '').trim(),
    note: (ctx.note || '').trim(),
    groupId: ctx.originalGroupId || (ctx.playerIds.length > 1 ? uid('grp') : null),
    blocks: validBlocks
  };

  if (ctx.isEdit) {
    DB.players.forEach(p => {
      if (!p.calendar) return;
      Object.keys(p.calendar).forEach(date => {
        const day = p.calendar[date];
        if (!Array.isArray(day)) return;
        p.calendar[date] = day.filter(s => !sessionMatchesOriginal(s, ctx.originalId, ctx.originalGroupId, ctx.originalBlocks));
        if (!p.calendar[date].length) delete p.calendar[date];
      });
    });
  }

  ctx.playerIds.forEach(pid => {
    const p = DB.players.find(x => x.id === pid);
    if (!p) return;
    if (!p.calendar) p.calendar = {};
    if (!p.calendar[ds]) p.calendar[ds] = [];
    p.calendar[ds] = p.calendar[ds].filter(s => s.id !== newSession.id);
    p.calendar[ds].push({
      id: newSession.id,
      name: newSession.name,
      note: newSession.note,
      groupId: newSession.groupId,
      blocks: newSession.blocks.map(b => ({ ...b }))
    });
  });

  saveDB();
  closeModal();
  __sessionEditContext = null;
  renderCoachCalendar();
  updateNotifBadge();
  toast(ctx.isEdit ? 'Тренировка обновлена' : `Тренировка назначена: ${ctx.playerIds.length} ${plural(ctx.playerIds.length, 'игрок', 'игрока', 'игроков')}`);
}

function sessionMatchesOriginal(s, originalId, originalGroupId, originalBlocks) {
  if (!s) return false;
  if (originalId && s.id && s.id === originalId) return true;
  if (originalGroupId && s.groupId && s.groupId === originalGroupId) return true;
  if (originalBlocks && Array.isArray(s.blocks) && s.blocks.length && originalBlocks.length) {
    const a = s.blocks[0], b = originalBlocks[0];
    return (a.startTime || '') === (b.startTime || '')
        && (a.complex || '')   === (b.complex || '')
        && (a.format || '')    === (b.format || '');
  }
  return false;
}

function deleteSessionFromDay(ds, idx, ev) {
  if (ev) ev.stopPropagation();
  if (!confirm('Удалить тренировку у всех игроков?')) return;

  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  DB.players.forEach(p => {
    if (!p.calendar || !p.calendar[ds]) return;
    const arr = p.calendar[ds];
    if (!Array.isArray(arr)) return;
    p.calendar[ds] = arr.filter(x => !sessionMatchesOriginal(x, s.id, s.groupId, s.blocks));
    if (!p.calendar[ds].length) delete p.calendar[ds];
  });

  saveDB();
  closeModal();
  renderCoachCalendar();
  updateNotifBadge();
}

/* ============================================================
   МОДАЛКА ОТМЕТКИ ФАКТА (гибрид)
   ============================================================ */

let __factModalState = null;

function openSessionFactModal(ds, sessionIdx, ev) {
  if (ev) ev.stopPropagation();
  const sessions = collectDaySessions(ds);
  const s = sessions[sessionIdx];
  if (!s) return;

  // Соберём игроков этой тренировки + их блоки
  const playersData = [];

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!Array.isArray(day)) return;
    const thisSession = day.find(x => x.id === s.id);
    if (!thisSession) return;
    playersData.push({
      id: p.id,
      fio: p.fio,
      team: p.team || '',
      blocks: (thisSession.blocks || []).map(b => ({
        fact: b.fact || '',
        comment: b.comment || ''
      }))
    });
  });

  __factModalState = {
    ds,
    sessionId: s.id,
    session: {
      name: s.name || '',
      blocks: s.blocks.map(b => ({ ...b }))
    },
    players: playersData
  };

  renderFactModal();
}

function renderFactModal() {
  const st = __factModalState;
  if (!st) return;

  const s = st.session;
  const playersCount = st.players.length;
  const blocksCount = s.blocks.length;

  // Блоки: селект «Факт по умолчанию» (без исключений)
  const blocksHtml = s.blocks.map((b, bi) => {
    const end = minutesToTime(timeToMinutes(b.startTime) + (Number(b.duration) || 0));
    const opts = FACT_OPTIONS.map(f => {
      const sel = (f.value === (b.fact || 'done')) ? 'selected' : '';
      return `<option value="${f.value}" ${sel}>${f.label}</option>`;
    }).join('');
    return `<div class="fm-block">
      <div class="fm-block-head">
        <span class="fm-block-num">Блок #${bi + 1}</span>
        <span class="fm-block-time">${escapeHtml(b.startTime || '')}–${end} · ${Number(b.duration) || 0} мин</span>
      </div>
      <div class="fm-block-name">${escapeHtml(b.complex || '—')} · ${escapeHtml(b.format || '—')}</div>
      <div class="field" style="margin:0">
        <label>Факт по умолчанию</label>
        <select class="fm-block-fact" data-block-index="${bi}" onchange="onFactModalBlockChange(${bi}, this.value)">
          ${opts}
        </select>
      </div>
      <div class="field fm-block-comment-wrap" data-block-index="${bi}" style="margin-top:8px;display:${(b.fact === 'partial' || b.fact === 'notdone') ? 'block' : 'none'}">
        <label>Комментарий к блоку (для «частично» / «не выполнено»)</label>
        <input class="fm-block-comment" data-block-index="${bi}" value="${escapeAttr(b.comment || '')}" placeholder="причина или детали">
      </div>
    </div>`;
  }).join('');

  // Игроки: чекбокс присутствия + (если снят) — исключение
  const playersHtml = st.players.map((p, pi) => {
    const rowsHtml = p.blocks.map((bl, bi) => {
      const blockName = s.blocks[bi] ? (s.blocks[bi].complex || 'Блок #' + (bi + 1)) : ('Блок #' + (bi + 1));
      const factOpts = FACT_OPTIONS.map(f => {
        const sel = (f.value === (bl.fact || '')) ? 'selected' : '';
        return `<option value="${f.value}" ${sel}>${f.label}</option>`;
      }).join('');
      return `<div class="fm-player-block" data-player-index="${pi}" data-block-index="${bi}">
        <div class="fm-player-block-name">${escapeHtml(blockName)}</div>
        <div class="fm-player-block-fields">
          <select class="fm-player-fact" onchange="onFactModalPlayerChange(${pi},${bi}, this.value)">
            <option value="">— по умолчанию —</option>
            ${factOpts}
          </select>
          <input class="fm-player-comment" value="${escapeAttr(bl.comment || '')}" placeholder="комментарий"
                 oninput="onFactModalPlayerComment(${pi},${bi}, this.value)"
                 style="display:${(bl.fact === 'partial' || bl.fact === 'notdone') ? 'block' : 'none'}">
        </div>
      </div>`;
    }).join('');

    const wasPresent = p.blocks.some(bl => bl.fact !== ''); // если хоть что-то отмечено — считаем, что был
    const present = p.blocks.every(bl => !bl.fact) ? true : wasPresent; // по умолчанию — присутствует

    return `<div class="fm-player" data-player-index="${pi}">
      <div class="fm-player-head">
        <label class="fm-player-present">
          <input type="checkbox" ${present ? 'checked' : ''} onchange="onFactModalPresent(${pi}, this.checked)">
          <span class="fm-player-fio">${escapeHtml(p.fio)}</span>
          ${p.team ? `<span class="fm-player-team">${escapeHtml(p.team)}</span>` : ''}
        </label>
        <button type="button" class="fm-player-toggle" onclick="toggleFactPlayer(${pi}, this)">
          <span class="fm-toggle-caret">▾</span>
        </button>
      </div>
      <div class="fm-player-body" id="fm-player-body-${pi}" style="display:none">
        ${rowsHtml}
      </div>
    </div>`;
  }).join('');

  openModal(`
    <h3>Отметка факта</h3>
    <p class="subtitle" style="margin-top:-8px">
      ${escapeHtml(st.session.name || 'Тренировка')} · ${escapeHtml(formatDateFull(st.ds))}
      · ${playersCount} ${plural(playersCount, 'игрок', 'игрока', 'игроков')} · ${blocksCount} ${plural(blocksCount, 'блок', 'блока', 'блоков')}
    </p>

    <div class="fm-toolbar">
      <button type="button" class="btn btn-sm" onclick="factModalBulkSet('done')">✓ Всё выполнено</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="factModalBulkSet('partial')">~ Частично</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="factModalBulkSet('notdone')">✗ Не выполнено</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="factModalBulkClear()">Сбросить</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="factModalExpandAll()">Развернуть всех</button>
    </div>

    <div class="fm-section">
      <h4>Факт по умолчанию (для всех, у кого не указано исключение)</h4>
      <div class="fm-blocks">${blocksHtml}</div>
    </div>

    <div class="fm-section">
      <h4>Игроки</h4>
      <p class="subtitle" style="margin-top:0;margin-bottom:8px">По умолчанию все присутствуют и получают «факт по умолчанию». Разверните игрока, чтобы задать индивидуальный факт.</p>
      <div class="fm-players">${playersHtml}</div>
    </div>

    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveSessionFact()">Сохранить</button>
      <button class="btn-ghost btn" onclick="closeFactModal()">Отмена</button>
    </div>
  `);
}

/* ---- Взаимодействие с модалкой ---- */

function onFactModalBlockChange(bi, value) {
  const st = __factModalState;
  if (!st || !st.session.blocks[bi]) return;
  st.session.blocks[bi].fact = value;
  const wrap = document.querySelector(`.fm-block-comment-wrap[data-block-index="${bi}"]`);
  if (wrap) wrap.style.display = (value === 'partial' || value === 'notdone') ? 'block' : 'none';
}

function onFactModalPlayerChange(pi, bi, value) {
  const st = __factModalState;
  if (!st || !st.players[pi]) return;
  if (!st.players[pi].blocks[bi]) return;
  st.players[pi].blocks[bi].fact = value;
  const el = document.querySelector(`.fm-player[data-player-index="${pi}"] .fm-player-block[data-block-index="${bi}"] .fm-player-comment`);
  if (el) el.style.display = (value === 'partial' || value === 'notdone') ? 'block' : 'none';
}

function onFactModalPlayerComment(pi, bi, value) {
  const st = __factModalState;
  if (!st || !st.players[pi] || !st.players[pi].blocks[bi]) return;
  st.players[pi].blocks[bi].comment = value;
}

function onFactModalPresent(pi, checked) {
  const st = __factModalState;
  if (!st || !st.players[pi]) return;
  // Если сняли галочку — обнуляем все блоки игрока (отсутствовал)
  if (!checked) {
    st.players[pi].blocks.forEach(b => { b.fact = 'notdone'; b.comment = 'Отсутствовал'; });
    // Обновим UI
    const el = document.querySelector(`.fm-player[data-player-index="${pi}"]`);
    if (el) {
      el.querySelectorAll('.fm-player-fact').forEach(sel => { sel.value = 'notdone'; });
      el.querySelectorAll('.fm-player-comment').forEach(inp => {
        inp.value = 'Отсутствовал';
        inp.style.display = 'block';
      });
    }
  } else {
    // Вернули галочку — очищаем индивидуальные отметки
    st.players[pi].blocks.forEach(b => { b.fact = ''; b.comment = ''; });
    const el = document.querySelector(`.fm-player[data-player-index="${pi}"]`);
    if (el) {
      el.querySelectorAll('.fm-player-fact').forEach(sel => { sel.value = ''; });
      el.querySelectorAll('.fm-player-comment').forEach(inp => {
        inp.value = '';
        inp.style.display = 'none';
      });
    }
  }
}

function toggleFactPlayer(pi, btn) {
  const body = document.getElementById('fm-player-body-' + pi);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (btn) btn.classList.toggle('open', !open);
}

function factModalExpandAll() {
  __factModalState && __factModalState.players.forEach((_, pi) => {
    const body = document.getElementById('fm-player-body-' + pi);
    if (body) body.style.display = 'block';
    const btn = document.querySelector(`.fm-player[data-player-index="${pi}"] .fm-player-toggle`);
    if (btn) btn.classList.add('open');
  });
}

/* Массовые кнопки: применить факт ко всем блокам по умолчанию */
function factModalBulkSet(fact) {
  const st = __factModalState;
  if (!st) return;
  st.session.blocks.forEach((b, bi) => {
    b.fact = fact;
    b.comment = '';
    const sel = document.querySelector(`.fm-block-fact[data-block-index="${bi}"]`);
    if (sel) sel.value = fact;
    const wrap = document.querySelector(`.fm-block-comment-wrap[data-block-index="${bi}"]`);
    if (wrap) wrap.style.display = (fact === 'partial' || fact === 'notdone') ? 'block' : 'none';
  });
}

function factModalBulkClear() {
  const st = __factModalState;
  if (!st) return;
  st.session.blocks.forEach((b, bi) => {
    b.fact = '';
    b.comment = '';
    const sel = document.querySelector(`.fm-block-fact[data-block-index="${bi}"]`);
    if (sel) sel.value = '';
    const wrap = document.querySelector(`.fm-block-comment-wrap[data-block-index="${bi}"]`);
    if (wrap) wrap.style.display = 'none';
  });
  st.players.forEach((p, pi) => {
    p.blocks.forEach((bl, bi) => {
      bl.fact = '';
      bl.comment = '';
      const sel = document.querySelector(`.fm-player[data-player-index="${pi}"] .fm-player-block[data-block-index="${bi}"] .fm-player-fact`);
      if (sel) sel.value = '';
      const inp = document.querySelector(`.fm-player[data-player-index="${pi}"] .fm-player-block[data-block-index="${bi}"] .fm-player-comment`);
      if (inp) { inp.value = ''; inp.style.display = 'none'; }
    });
  });
}

function closeFactModal() {
  __factModalState = null;
  closeModal();
}

/* ===== Сохранение отметки ===== */
function saveSessionFact() {
  const st = __factModalState;
  if (!st) return;

  // Валидация: для «частично» и «не выполнено» обязателен комментарий
  for (let bi = 0; bi < st.session.blocks.length; bi++) {
    const b = st.session.blocks[bi];
    if ((b.fact === 'partial' || b.fact === 'notdone') && !(b.comment || '').trim()) {
      alert(`Блок #${bi + 1}: для «${factLabel(b.fact)}» укажите комментарий`);
      return;
    }
  }
  for (let pi = 0; pi < st.players.length; pi++) {
    const p = st.players[pi];
    for (let bi = 0; bi < p.blocks.length; bi++) {
      const bl = p.blocks[bi];
      if (bl.fact && (bl.fact === 'partial' || bl.fact === 'notdone') && !(bl.comment || '').trim()) {
        alert(`Игрок ${p.fio}, блок #${bi + 1}: укажите комментарий для «${factLabel(bl.fact)}»`);
        return;
      }
    }
  }

  const ds = st.ds;
  const sessionId = st.sessionId;

  // Применяем: каждому игроку — либо его исключение, либо факт по умолчанию блока
  st.players.forEach(pd => {
    const p = DB.players.find(x => x.id === pd.id);
    if (!p || !p.calendar || !p.calendar[ds]) return;
    const sess = p.calendar[ds].find(x => x.id === sessionId);
    if (!sess || !Array.isArray(sess.blocks)) return;

    sess.blocks.forEach((b, bi) => {
      const defaultFact = st.session.blocks[bi] ? (st.session.blocks[bi].fact || '') : '';
      const defaultComment = st.session.blocks[bi] ? (st.session.blocks[bi].comment || '') : '';
      const ex = pd.blocks[bi] || {};
      if (ex.fact) {
        b.fact = ex.fact;
        b.comment = (ex.comment || '').trim();
      } else {
        b.fact = defaultFact;
        b.comment = (defaultComment || '').trim();
      }
    });
  });

  saveDB();
  closeFactModal();
  openDaySessions(ds); // перерисовать модалку дня с обновлённой статистикой
  renderCoachCalendar();
  updateNotifBadge();
  toast('Факт сохранён');
}

/* ============================================================
   ГРУППИРОВАННЫЙ СПИСОК ИГРОКОВ (для редактора тренировки)
   ============================================================ */
function renderCoachGroupedPlayers(players, preselectedIds) {
  const selected = new Set(preselectedIds || []);
  const groups = {};
  players.forEach(p => {
    const key = (p.team || '').trim() || '— Без команды —';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  const teamNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ru'));

  return teamNames.map(team => {
    const list = groups[team].slice().sort((a, b) => (a.fio || '').localeCompare(b.fio || '', 'ru'));
    const safeId = 'cteam-' + team.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '-' + Math.random().toString(36).slice(2, 6);
    return `<div class="group-team" data-team="${escapeAttr(team)}" id="${safeId}">
      <div class="group-team-head" onclick="toggleCoachTeam('${safeId}', event)">
        <span class="arrow">▶</span>
        <span>${escapeHtml(team)}</span>
        <span class="count">${list.length}</span>
        <span class="team-actions" onclick="event.stopPropagation()">
          <button type="button" onclick="selectCoachTeam('${safeId}', true)">Все</button>
          <button type="button" onclick="selectCoachTeam('${safeId}', false)">Никто</button>
        </span>
      </div>
      <div class="group-team-body">
        ${list.map(o => `<label>
          <input type="checkbox" class="cc-grp-player" value="${o.id}" ${selected.has(o.id) ? 'checked' : ''}>
          <span>${escapeHtml(o.fio)}${o.position ? ' <span style="color:var(--ak-gray-dark);font-size:11px">· ' + escapeHtml(o.position) + '</span>' : ''}</span>
        </label>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleCoachTeam(teamId, event) {
  if (event) event.stopPropagation();
  const el = document.getElementById(teamId);
  if (!el) return;
  el.classList.toggle('open');
}
function expandAllCoachTeams(listId, open) {
  document.querySelectorAll('#' + listId + ' .group-team').forEach(el => el.classList.toggle('open', open));
}
function selectCoachTeam(teamId, checked) {
  const el = document.getElementById(teamId);
  if (!el) return;
  el.querySelectorAll('.cc-grp-player').forEach(cb => { cb.checked = checked; });
}
function clearCoachGroupSelection(listId) {
  document.querySelectorAll('#' + listId + ' .cc-grp-player').forEach(cb => { cb.checked = false; });
}
function filterCoachGroupPlayers(listId, searchId) {
  const q = (document.getElementById(searchId)?.value || '').trim().toLowerCase();
  const list = document.getElementById(listId);
  if (!list) return;

  list.querySelectorAll('.group-team').forEach(teamEl => {
    const teamName = (teamEl.dataset.team || '').toLowerCase();
    let visibleInTeam = 0;
    teamEl.querySelectorAll('.group-team-body label').forEach(lbl => {
      const text = lbl.innerText.toLowerCase();
      const match = !q || teamName.includes(q) || text.includes(q);
      lbl.style.display = match ? 'flex' : 'none';
      if (match) visibleInTeam++;
    });
    teamEl.style.display = visibleInTeam ? 'block' : 'none';
    if (q && visibleInTeam) teamEl.classList.add('open');
  });
}