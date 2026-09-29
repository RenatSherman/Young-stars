/* ============================================================
   11-dashboard-calendar.js
   Календарь тренера: сводная сетка по всем игрокам,
   назначение тренировок нескольким игрокам, поповер со списком.
   Загружается после 09-excel.js.
   ============================================================ */

/* Состояние */
let coachCalMonth = null;
let coachCalWeek  = null;

/* ===== Сбор всех месяцев, где есть календарь или текущий ===== */
function collectCalendarMonths() {
  const set = new Set();
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), 1);

  for (let i = -1; i <= 1; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => set.add(date.slice(0, 7)));
  });

  return Array.from(set).sort();
}

/* ===== Главная функция ===== */
function renderCoachCalendar() {
  const el = document.getElementById('coach-calendar-content');
  if (!el) return;

  const months = collectCalendarMonths();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  if (!coachCalMonth) coachCalMonth = months.includes(currentMonth) ? currentMonth : months[0];
  if (!coachCalWeek)  coachCalWeek  = getCurrentWeekNumber(today);

  const [year, month] = coachCalMonth.split('-').map(Number);
  const dates = getWeekDates(year, month - 1, coachCalWeek);

  const rangeLabel = `${fmtDayMonth(dates[0])} — ${fmtDayMonth(dates[6], true)}`;

  el.innerHTML = `
    <div class="card" style="padding:16px 20px">
      <div class="cc-toolbar">
        <button class="cc-nav" onclick="coachCalShiftWeek(-1)" title="Предыдущая неделя">‹</button>
        <div class="cc-range">${rangeLabel}</div>
        <button class="cc-nav" onclick="coachCalShiftWeek(1)" title="Следующая неделя">›</button>
        <button class="btn btn-sm btn-ghost" onclick="coachCalToday()">Текущая неделя</button>
        <button class="btn btn-sm" onclick="editCoachCalendar('', '')">+ Назначить тренировку</button>
        <div class="cc-legend">
          <span><span class="cc-dot cc-dot-self"></span> Самостоятельно</span>
          <span><span class="cc-dot cc-dot-ind"></span> Индивидуально</span>
          <span><span class="cc-dot cc-dot-grp"></span> Группа</span>
        </div>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="cc-grid" id="cc-grid"></div>
    </div>`;

  renderCoachCalendarGrid(dates);
}

function fmtDayMonth(d, withYear = false) {
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  return withYear ? `${day}.${mon}.${d.getFullYear()}` : `${day}.${mon}`;
}

function getCurrentWeekNumber(d) {
  const [year, month] = [d.getFullYear(), d.getMonth()];
  const first = new Date(year, month, 1);
  let dow = first.getDay(); if (dow === 0) dow = 7;
  const firstMonday = new Date(year, month, 1 - (dow - 1));
  const diff = Math.floor((d - firstMonday) / (7 * 24 * 3600 * 1000));
  return Math.max(1, Math.min(5, diff + 1));
}

function coachCalShiftWeek(delta) {
  let w = coachCalWeek + delta;
  if (w < 1) {
    const [y, m] = coachCalMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    coachCalMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    coachCalWeek = 5;
  } else if (w > 5) {
    const [y, m] = coachCalMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    coachCalMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    coachCalWeek = 1;
  } else {
    coachCalWeek = w;
  }
  renderCoachCalendar();
}

function coachCalToday() {
  const today = new Date();
  coachCalMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  coachCalWeek  = getCurrentWeekNumber(today);
  renderCoachCalendar();
}

/* ===== Сетка ===== */
function renderCoachCalendarGrid(dates) {
  const grid = document.getElementById('cc-grid');
  if (!grid) return;

  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const today = localDateStr(new Date());

  let minHour = 6, maxHour = 21;
  dates.forEach(d => {
    const ds = localDateStr(d);
    DB.players.forEach(p => {
      if (!p.calendar || !p.calendar[ds]) return;
      Object.keys(p.calendar[ds]).forEach(t => {
        const h = parseInt(t.slice(0, 2));
        if (h < minHour) minHour = h;
        if (h > maxHour) maxHour = h;
      });
    });
  });

  let head = '<div class="cc-head cc-head-time">Время</div>';
  dates.forEach((d, i) => {
    const ds = localDateStr(d);
    const isToday = ds === today;
    head += `<div class="cc-head ${isToday ? 'today' : ''}">
      <div class="cc-dow">${dayNames[i]}</div>
      <div class="cc-dnum">${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}</div>
    </div>`;
  });
  grid.innerHTML = head;

  for (let h = minHour; h <= maxHour; h++) {
    const hh = String(h).padStart(2, '0');
    grid.insertAdjacentHTML('beforeend', `<div class="cc-time">${hh}:00</div>`);

    dates.forEach(d => {
      const ds = localDateStr(d);
      const cell = buildCoachCellData(ds, hh);
      grid.insertAdjacentHTML('beforeend', renderCoachCell(ds, hh, cell));
    });
  }
}

/* Собираем данные по всем игрокам за конкретный час */
function buildCoachCellData(ds, hh) {
  const sessions = {};

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!day) return;
    ['00', '15', '30', '45'].forEach(mm => {
      const t = `${hh}:${mm}`;
      const c = day[t];
      if (!c || (!c.ex && !c.note)) return;

      const gid = c.groupId || ('solo_' + p.id + '_' + t);
      if (!sessions[gid]) {
        sessions[gid] = {
          groupId: c.groupId || null,
          label: c.ex || '',
          note: c.note || '',
          time: t,
          players: [],
          wt: new Set(c.wt || [])
        };
      }
      sessions[gid].players.push({ id: p.id, fio: p.fio });
      (c.wt || []).forEach(w => sessions[gid].wt.add(w));
    });
  });

  return Object.values(sessions);
}

/* Ячейка */
function renderCoachCell(ds, hh, sessions) {
  if (!sessions.length) {
    return `<div class="cc-cell" onclick="editCoachCalendar('${ds}','${hh}:00')">
      <span class="cc-empty-add">+</span>
    </div>`;
  }

  const s = sessions[0];
  const wtClass = s.wt.has('В группе') ? 'grp'
                : s.wt.has('Индивидуальная с тренером') ? 'ind'
                : 'self';
  const playerCount = s.players.length;
  const popupId = `cc-pop-${ds}-${hh}`.replace(/[^a-zA-Z0-9-]/g, '_');

  return `<div class="cc-cell cc-filled cc-${wtClass}" onclick="editCoachCalendar('${ds}','${hh}:00')">
    <div class="cc-pill">
      <span class="cc-pill-label">${escapeHtml(s.label || 'Тренировка')}</span>
      <span class="cc-pill-count" onclick="event.stopPropagation();toggleCoachPopover('${popupId}', event)">👥 ${playerCount}</span>
    </div>
    <div class="cc-popover" id="${popupId}">
      <div class="cc-popover-title">${escapeHtml(s.label || 'Тренировка')} · ${s.time}</div>
      <ul class="cc-popover-list">
        ${s.players.map(pl => `<li onclick="event.stopPropagation();openPlayer('${pl.id}')">${escapeHtml(pl.fio)}</li>`).join('')}
      </ul>
      ${s.note ? `<div class="cc-popover-note">${escapeHtml(s.note)}</div>` : ''}
      <div class="cc-popover-actions">
        <button class="btn btn-sm" onclick="event.stopPropagation();editCoachCalendar('${ds}','${hh}:00')">Редактировать</button>
      </div>
    </div>
  </div>`;
}

function toggleCoachPopover(id, ev) {
  ev.stopPropagation();
  document.querySelectorAll('.cc-popover.active').forEach(el => {
    if (el.id !== id) el.classList.remove('active');
  });
  const el = document.getElementById(id);
  if (el) el.classList.toggle('active');
}
document.addEventListener('click', () => {
  document.querySelectorAll('.cc-popover.active').forEach(el => el.classList.remove('active'));
});

/* ===== Модалка ===== */
function editCoachCalendar(date, time) {
  const isNew = !date || !time;

  let cur = { ex: '', note: '', wt: [], players: [] };

  if (!isNew) {
    const sessions = buildCoachCellData(date, time.slice(0, 2));
    const s = sessions.find(x => x.time === time) || sessions[0];
    if (s) {
      cur.ex = s.label;
      cur.note = s.note;
      cur.wt = Array.from(s.wt);
      cur.players = s.players.map(p => p.id);
    }
  }

  const allBlocks = Array.from(new Set(DB.exercises.map(g => g.group)));

  let options = '<option value="">— не выбрано —</option>';
  allBlocks.forEach(v => {
    options += `<option value="${escapeAttr(v)}" ${cur.ex === v ? 'selected' : ''}>${escapeHtml(v)}</option>`;
  });

  const wtArr = cur.wt;
  const wtHtml = WORK_TYPES.map(t => {
    const checked = wtArr.includes(t);
    return `<label class="wt-chip ${checked ? 'checked' : ''}" onclick="this.classList.toggle('checked')">
      <input type="checkbox" class="cal-wt" value="${escapeAttr(t)}" ${checked ? 'checked' : ''}>
      <span class="dot"></span>
      <span>${escapeHtml(t)}</span>
    </label>`;
  }).join('');

  const playersHtml = renderCoachGroupedPlayers(DB.players, cur.players);

  openModal(`<h3>${isNew ? 'Новая тренировка' : `Тренировка · ${formatDateFull(date)} · ${time}`}</h3>
    ${isNew ? `
      <div class="field"><label>Дата</label><input type="date" id="cc-date" value="${localDateStr(new Date())}"></div>
      <div class="field"><label>Время</label><input type="time" id="cc-time" value="18:00"></div>` : ''}
    <div class="field"><label>Название тренировки (коротко)</label>
      <input id="cc-label" value="${escapeAttr(cur.ex || '')}" placeholder="Например: Ледовая, ОФП, Игровая"></div>
    <div class="field"><label>Блок упражнений (из справочника)</label><select id="cc-ex">${options}</select></div>
    <div class="field"><label>Форма работы</label>
      <div class="wt-chips">${wtHtml}</div>
    </div>
    <div class="field"><label>Примечание</label>
      <input id="cc-note" value="${escapeAttr(cur.note || '')}" placeholder="акцент на ногах и т.п."></div>
    <div class="field"><label>Игроки (можно несколько)</label>
      <div class="group-tools">
        <input type="text" id="cc-grp-search" placeholder="Поиск по ФИО или команде…" oninput="filterCoachGroupPlayers()">
        <button type="button" onclick="expandAllCoachTeams(true)">Развернуть все</button>
        <button type="button" onclick="expandAllCoachTeams(false)">Свернуть все</button>
        <button type="button" onclick="clearCoachGroupSelection()">Снять все</button>
      </div>
      <div class="group-list" id="cc-grp-list">
        ${playersHtml}
      </div>
    </div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveCoachCalendar('${date}','${time}')">Сохранить</button>
      ${!isNew ? `<button class="btn btn-red" onclick="clearCoachCalendar('${date}','${time}')">Удалить тренировку</button>` : ''}
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
}

/* Группированный список игроков для модалки календаря тренера */
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

/* ===== Сохранение / удаление ===== */
function saveCoachCalendar(date, time) {
  const isNew = !date || !time;

  let realDate = date, realTime = time;
  if (isNew) {
    realDate = document.getElementById('cc-date').value;
    realTime = document.getElementById('cc-time').value;
    if (!realDate || !realTime) { alert('Укажите дату и время'); return; }
    // приводим время к HH:00
    realTime = realTime.slice(0, 2) + ':00';
  }

  const labelFromField = document.getElementById('cc-label').value.trim();
  const blockFromSelect = document.getElementById('cc-ex').value;
  const label = labelFromField || blockFromSelect || '';
  const note = (document.getElementById('cc-note').value || '').trim();

  const wt = [];
  document.querySelectorAll('.cal-wt:checked').forEach(cb => wt.push(cb.value));

  const targets = [];
  document.querySelectorAll('.cc-grp-player:checked').forEach(cb => targets.push(cb.value));

  if (!targets.length) { alert('Выберите хотя бы одного игрока'); return; }
  if (!label && !note && !wt.length) { alert('Заполните название или форму работы'); return; }

  // Если редактируем существующую — сначала очистим у всех игроков
  // старые записи с этого же слота, чтобы не осталось дублей
  if (!isNew) {
    DB.players.forEach(p => {
      if (p.calendar && p.calendar[realDate] && p.calendar[realDate][realTime]) {
        delete p.calendar[realDate][realTime];
      }
    });
  }

  const groupId = targets.length > 1 ? ('g_' + Date.now()) : undefined;

  targets.forEach(tid => {
    const p = DB.players.find(x => x.id === tid);
    if (!p) return;
    if (!p.calendar) p.calendar = {};
    if (!p.calendar[realDate]) p.calendar[realDate] = {};
    p.calendar[realDate][realTime] = { ex: label, note, wt, groupId };
  });

  saveDB();
  closeModal();
  renderCoachCalendar();
  updateNotifBadge();
  toast(`Тренировка назначена ${targets.length === 1 ? 'игроку' : targets.length + ' игрокам'}`);
}

function clearCoachCalendar(date, time) {
  if (!confirm('Удалить тренировку у всех игроков в этом слоте?')) return;

  DB.players.forEach(p => {
    if (p.calendar && p.calendar[date] && p.calendar[date][time]) {
      delete p.calendar[date][time];
      if (!Object.keys(p.calendar[date]).length) delete p.calendar[date];
    }
  });

  saveDB();
  closeModal();
  renderCoachCalendar();
  updateNotifBadge();
}