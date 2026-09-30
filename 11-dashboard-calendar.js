/* ============================================================
   11-dashboard-calendar.js
   Календарь тренера — месячная сетка по принципу Google Calendar.
   Индикаторы тренировок в ячейке, клик по дню → модалка списка.
   Назначение тренировок нескольким игрокам сразу.
   Загружается после 09-excel.js.
   ============================================================ */

/* ===== Главная функция ===== */
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
          <span><span class="cc-dot cc-dot-self"></span> Самостоятельно</span>
          <span><span class="cc-dot cc-dot-ind"></span> Индивидуально</span>
          <span><span class="cc-dot cc-dot-grp"></span> В группе</span>
        </div>
      </div>
    </div>
    <div class="card cc-month-card">
      <div class="cc-month-head">
        ${DOW_SHORT_RU.map((d, i) => `<div class="cc-dow-head ${i >= 5 ? 'weekend' : ''}">${d}</div>`).join('')}
      </div>
      <div class="cc-month-grid" id="cc-month-grid"></div>
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

/* ===== Сетка месяца ===== */
function renderCoachMonthGrid(year, month) {
  const grid = document.getElementById('cc-month-grid');
  if (!grid) return;

  const first = new Date(year, month - 1, 1);
  let dow = first.getDay(); if (dow === 0) dow = 7;
  const firstMonday = new Date(year, month - 1, 1 - (dow - 1));

  const today = localDateStr(new Date());
  const days = [];

  // 6 недель максимум, но если хватит 5 — оставим 5
  for (let i = 0; i < 42; i++) {
    const d = new Date(firstMonday);
    d.setDate(firstMonday.getDate() + i);
    days.push(d);
  }
  // Обрезаем лишнюю 6-ю неделю, если она вся в следующем месяце
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

    const daySessions = collectDaySessions(ds);
    const totalSessions = daySessions.length;

    const visibleBars = daySessions.slice(0, 3);

    html += `<div class="cc-day ${isOther ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
                  onclick="openDaySessions('${ds}')">
      <div class="cc-day-head">
        <span class="cc-day-num ${isToday ? 'today-badge' : ''}">${d.getDate()}</span>
        ${totalSessions ? `<span class="cc-day-total">${totalSessions}</span>` : ''}
      </div>
      <div class="cc-day-bars">
        ${visibleBars.map(sess => {
          const color = sessionColor(sess);
          const label = sess.name || sess.block || 'Тренировка';
          const t = sess.timeStart ? `${sess.timeStart}` : '';
          return `<div class="cc-day-bar" style="background:${color}">
            ${t ? `<span class="cc-bar-time">${escapeHtml(t)}</span>` : ''}
            <span class="cc-bar-label">${escapeHtml(label)}</span>
          </div>`;
        }).join('')}
        ${daySessions.length > 3 ? `<div class="cc-more">+${daySessions.length - 3} ещё</div>` : ''}
      </div>
    </div>`;
  });

  grid.innerHTML = html;
}

/* ===== Собираем тренировки конкретного дня ===== */
function collectDaySessions(ds) {
  const map = new Map();

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!Array.isArray(day)) return;
    day.forEach(sess => {
      if (!sess) return;
      const key = sess.id || (sess.groupId ? sess.groupId + '|' + (sess.timeStart || '') : ('solo_' + p.id + '_' + (sess.timeStart || '') + '_' + (sess.name || '')));
      if (!map.has(key)) {
        map.set(key, {
          id: sess.id,
          groupId: sess.groupId,
          name: sess.name || sess.block || '',
          block: sess.block || '',
          timeStart: sess.timeStart || '',
          timeEnd: sess.timeEnd || '',
          workTypes: Array.isArray(sess.workTypes) ? sess.workTypes.slice() : [],
          note: sess.note || '',
          players: []
        });
      }
      map.get(key).players.push({ id: p.id, fio: p.fio });
    });
  });

  return Array.from(map.values()).sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || ''));
}

/* ===== Цвет по форме работы ===== */
function sessionColor(sess) {
  const wt = sess.workTypes || [];
  if (wt.includes('В группе')) return WORK_TYPE_COLORS['В группе'];
  if (wt.includes('Индивидуальная с тренером')) return WORK_TYPE_COLORS['Индивидуальная с тренером'];
  if (wt.includes('Самостоятельная')) return WORK_TYPE_COLORS['Самостоятельная'];
  return '#5a6169';
}

/* ============================================================
   МОДАЛКА ДНЯ — список тренировок
   ============================================================ */
function openDaySessions(ds) {
  const sessions = collectDaySessions(ds);
  const title = formatDateFull(ds);

  const listHtml = sessions.length
    ? sessions.map((s, i) => {
        const color = sessionColor(s);
        const wt = s.workTypes.join(', ') || '—';
        return `<div class="cc-sess-item" style="border-left-color:${color}">
          <div class="cc-sess-main" onclick="openSessionEditor('${ds}', ${i})">
            <div class="cc-sess-time">${escapeHtml(s.timeStart)}–${escapeHtml(s.timeEnd)}</div>
            <div class="cc-sess-name">${escapeHtml(s.name || s.block || 'Тренировка')}</div>
            <div class="cc-sess-meta">${escapeHtml(wt)} · ${s.players.length} ${plural(s.players.length, 'игрок', 'игрока', 'игроков')}</div>
            ${s.note ? `<div class="cc-sess-note">${escapeHtml(s.note)}</div>` : ''}
          </div>
          <button class="cc-sess-del" title="Удалить тренировку" onclick="deleteSessionFromDay('${ds}', ${i}, event)">🗑</button>
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

/* ============================================================
   РЕДАКТОР ТРЕНИРОВКИ
   ============================================================ */

/* Сохраняем между вызовами для точного сопоставления при сохранении */
let __sessionEditContext = null;

/* Открыть редактор существующей тренировки (по индексу из списка дня) */
function openSessionEditor(ds, idx) {
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  __sessionEditContext = { ds, original: s };
  openSessionForm({
    ds,
    name: s.name,
    block: s.block,
    timeStart: s.timeStart,
    timeEnd: s.timeEnd,
    workTypes: s.workTypes,
    note: s.note,
    playerIds: s.players.map(p => p.id),
    isEdit: true
  });
}

/* Открыть форму новой тренировки на дату */
function openNewSessionForDate(ds) {
  __sessionEditContext = { ds, original: null };
  openSessionForm({
    ds,
    name: '',
    block: '',
    timeStart: '18:00',
    timeEnd: '19:00',
    workTypes: [],
    note: '',
    playerIds: [],
    isEdit: false
  });
}

/* Общая форма */
function openSessionForm({ ds, name, block, timeStart, timeEnd, workTypes, note, playerIds, isEdit }) {
  const allBlocks = Array.from(new Set(DB.exercises.map(g => g.group)));

  let options = '<option value="">— не выбрано —</option>';
  allBlocks.forEach(v => {
    options += `<option value="${escapeAttr(v)}" ${block === v ? 'selected' : ''}>${escapeHtml(v)}</option>`;
  });

  const wtArr = workTypes || [];
  const wtHtml = WORK_TYPES.map(t => {
    const checked = wtArr.includes(t);
    return `<label class="wt-chip ${checked ? 'checked' : ''}" onclick="toggleWtChip(this, event)">
      <input type="checkbox" class="cal-wt" value="${escapeAttr(t)}" ${checked ? 'checked' : ''}>
      <span class="dot"></span>
      <span>${escapeHtml(t)}</span>
    </label>`;
  }).join('');

  const playersHtml = renderCoachGroupedPlayers(DB.players, playerIds || []);

  openModal(`<h3>${isEdit ? 'Редактирование тренировки' : 'Новая тренировка'}</h3>
    <p class="subtitle" style="margin-top:-8px">${escapeHtml(formatDateFull(ds))}</p>

    <div class="field"><label>Дата</label>
      <input type="date" id="cc-date" value="${escapeAttr(ds)}"></div>

    <div class="cc-time-row">
      <div class="field"><label>Время с</label>
        <input type="time" id="cc-time-start" value="${escapeAttr(timeStart)}"></div>
      <div class="field"><label>Время до</label>
        <input type="time" id="cc-time-end" value="${escapeAttr(timeEnd)}"></div>
    </div>

    <div class="field"><label>Название тренировки (коротко)</label>
      <input id="cc-name" value="${escapeAttr(name || '')}" placeholder="Например: Ледовая, ОФП, Игровая"></div>

    <div class="field"><label>Блок упражнений (из справочника)</label>
      <select id="cc-block">${options}</select></div>

    <div class="field"><label>Форма работы</label>
      <div class="wt-chips">${wtHtml}</div>
    </div>

    <div class="field"><label>Примечание</label>
      <input id="cc-note" value="${escapeAttr(note || '')}" placeholder="акцент на ногах и т.п."></div>

    <div class="field"><label>Игроки (можно несколько)</label>
      <div class="group-tools">
        <input type="text" id="cc-grp-search" placeholder="Поиск по ФИО или команде…" oninput="filterCoachGroupPlayers()">
        <button type="button" onclick="expandAllCoachTeams(true)">Развернуть все</button>
        <button type="button" onclick="expandAllCoachTeams(false)">Свернуть все</button>
        <button type="button" onclick="clearCoachGroupSelection()">Снять все</button>
      </div>
      <div class="group-list" id="cc-grp-list">${playersHtml}</div>
    </div>

    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveSessionFromForm()">Сохранить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
}

/* ===== Починка чипов формы работы ===== */
function toggleWtChip(labelEl, ev) {
  if (ev) {
    // Не мешаем браузеру самому менять :checked, если клик был по <input>
    // но всё равно переключаем визуал по состоянию input
  }
  const input = labelEl.querySelector('input.cal-wt');
  if (!input) return;
  // Дать браузеру обработать клик, потом синхронизировать
  setTimeout(() => {
    labelEl.classList.toggle('checked', input.checked);
  }, 0);
}

/* ===== Сохранение тренировки ===== */
function saveSessionFromForm() {
  const ds = document.getElementById('cc-date').value;
  if (!ds) { alert('Укажите дату'); return; }

  const timeStart = document.getElementById('cc-time-start').value || '18:00';
  const timeEnd   = document.getElementById('cc-time-end').value   || '19:00';

  if (timeToMinutes(timeEnd) <= timeToMinutes(timeStart)) {
    alert('Время окончания должно быть позже начала');
    return;
  }

  const name = document.getElementById('cc-name').value.trim();
  const block = document.getElementById('cc-block').value;
  const note = (document.getElementById('cc-note').value || '').trim();

  const wt = [];
  document.querySelectorAll('#modal-content .cal-wt:checked').forEach(cb => wt.push(cb.value));

  const playerIds = [];
  document.querySelectorAll('#cc-grp-list .cc-grp-player:checked').forEach(cb => playerIds.push(cb.value));

  if (!playerIds.length) { alert('Выберите хотя бы одного игрока'); return; }
  if (!name && !block && !note && !wt.length) {
    alert('Заполните название, блок или форму работы');
    return;
  }

  const ctx = __sessionEditContext || {};
  const original = ctx.original;

  const newSession = {
    id: original && original.id ? original.id : uid('sess'),
    name,
    block,
    timeStart,
    timeEnd,
    workTypes: wt,
    note,
    groupId: original && original.groupId ? original.groupId : (playerIds.length > 1 ? uid('grp') : null)
  };

  /* 1. Удаляем старые записи этой тренировки у всех игроков (если редактируем) */
  if (original && ctx.ds) {
    removeSessionFromAllPlayers(original, ctx.ds);
  }
  /* 1b. Если редактирование с переносом на другую дату — удалим и с прежней даты */
  if (original && ctx.ds && ctx.ds !== ds) {
    removeSessionFromAllPlayers(original, ctx.ds);
  }

  /* 2. Добавляем новую запись всем выбранным игрокам */
  playerIds.forEach(pid => {
    const p = DB.players.find(x => x.id === pid);
    if (!p) return;
    if (!p.calendar) p.calendar = {};
    if (!p.calendar[ds]) p.calendar[ds] = [];

    /* Если редактировали у конкретного игрока, но у него уже есть запись с этим id,
       удалим её перед добавлением */
    p.calendar[ds] = p.calendar[ds].filter(s => s.id !== newSession.id);
    p.calendar[ds].push({ ...newSession });
  });

  saveDB();
  closeModal();
  renderCoachCalendar();
  updateNotifBadge();
  toast(original ? 'Тренировка обновлена' : `Тренировка назначена: ${playerIds.length} ${plural(playerIds.length, 'игрок', 'игрока', 'игроков')}`);
}

/* Удалить тренировку (по контексту оригинала) у всех игроков */
function removeSessionFromAllPlayers(original, ds) {
  if (!original || !ds) return;
  DB.players.forEach(p => {
    if (!p.calendar || !p.calendar[ds]) return;
    const arr = p.calendar[ds];
    if (!Array.isArray(arr)) return;
    p.calendar[ds] = arr.filter(s => !sameSession(s, original));
    if (!p.calendar[ds].length) delete p.calendar[ds];
  });
}

function sameSession(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.groupId && b.groupId && a.groupId === b.groupId) return true;
  return (
    (a.name || a.block || '') === (b.name || b.block || '') &&
    (a.timeStart || '') === (b.timeStart || '') &&
    (a.timeEnd || '')   === (b.timeEnd || '')
  );
}

/* ===== Удаление из модалки дня ===== */
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
    p.calendar[ds] = arr.filter(x => !sameSession(x, s));
    if (!p.calendar[ds].length) delete p.calendar[ds];
  });

  saveDB();
  closeModal();
  renderCoachCalendar();
  updateNotifBadge();
}

/* ============================================================
   ГРУППИРОВАННЫЙ СПИСОК ИГРОКОВ
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
function expandAllCoachTeams(open) {
  document.querySelectorAll('#cc-grp-list .group-team').forEach(el => el.classList.toggle('open', open));
}
function selectCoachTeam(teamId, checked) {
  const el = document.getElementById(teamId);
  if (!el) return;
  el.querySelectorAll('.cc-grp-player').forEach(cb => { cb.checked = checked; });
}
function clearCoachGroupSelection() {
  document.querySelectorAll('#cc-grp-list .cc-grp-player').forEach(cb => { cb.checked = false; });
}
function filterCoachGroupPlayers() {
  const q = (document.getElementById('cc-grp-search')?.value || '').trim().toLowerCase();
  const list = document.getElementById('cc-grp-list');
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