/* ============================================================
   07-calendar.js
   Календарь тренировок + справочник упражнений.
   Загружается после 06-plan.js.
   ============================================================ */

/* ============================================================
   КАЛЕНДАРЬ
   ============================================================ */

function renderCalendar(p) {
  return `<div class="card"><h2>Календарь тренировок</h2>
    <p class="subtitle no-print" style="margin-top:-8px">Выберите месяц и неделю. Клик по ячейке — назначить упражнение.</p>
    <div class="cal-controls no-print">
      <label style="font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:.8px;font-family:var(--font-display);color:var(--ak-green)">Месяц:</label>
      <input type="month" id="cal-month" value="${currentCalMonth}" onchange="onCalMonthChange('${p.id}')">
      <div class="week-buttons" id="cal-weeks">
        ${[1,2,3,4,5].map(w => {
          const dates = getWeekDates(parseInt(currentCalMonth.slice(0, 4)), parseInt(currentCalMonth.slice(5, 7)) - 1, w);
          const range = `${dates[0].getDate()}.${String(dates[0].getMonth() + 1).padStart(2, '0')}–${dates[6].getDate()}.${String(dates[6].getMonth() + 1).padStart(2, '0')}`;
          return `<button class="${currentCalWeek === w ? 'active' : ''}" onclick="onCalWeekChange('${p.id}',${w})">Неделя ${w}<span class="wd">${range}</span></button>`;
        }).join('')}
      </div>
    </div>
    <div class="acc-outer">
      <div class="calendar-grid" id="cal-grid"></div>
    </div>
  </div>`;
}

function onCalMonthChange(pid) {
  const input = document.getElementById('cal-month');
  currentCalMonth = input.value;
  currentCalWeek = 1;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCard(p);
}

function onCalWeekChange(pid, w) {
  currentCalWeek = w;
  document.querySelectorAll('#cal-weeks button').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('#cal-weeks button');
  if (btns[w - 1]) btns[w - 1].classList.add('active');
  renderCalendarGrid(DB.players.find(x => x.id === pid));
}

/* Возвращает 7 дат (Пн..Вс) для указанной недели месяца */
function getWeekDates(year, month, weekNum) {
  const first = new Date(year, month, 1);
  let dow = first.getDay();
  if (dow === 0) dow = 7;
  const firstMonday = new Date(year, month, 1 - (dow - 1));
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function renderCalendarGrid(p) {
  const grid = document.getElementById('cal-grid');
  if (!grid || !p) return;

  const [year, month] = currentCalMonth.split('-').map(Number);
  const dates = getWeekDates(year, month - 1, currentCalWeek);
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const today = localDateStr(new Date());

  let head = '<div class="cal-head"><div class="dow">Время</div></div>';
  dates.forEach((d, i) => {
    const dateStr = localDateStr(d);
    const isToday = dateStr === today;
    const isOtherMonth = d.getMonth() !== (month - 1);
    const isWeekend = i >= 5;
    head += `<div class="cal-head ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}" style="${isOtherMonth ? 'opacity:.55' : ''}">
      <div class="dow">${dayNames[i]}</div>
      <div class="dnum">${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}</div>
    </div>`;
  });

  const hours = [];
  for (let h = 6; h <= 21; h++) {
    ['00', '15', '30', '45'].forEach(m => hours.push(`${String(h).padStart(2, '0')}:${m}`));
  }

  let body = '';
  hours.forEach(h => {
    body += `<div class="cal-time">${h}</div>`;
    dates.forEach(d => {
      const dateStr = localDateStr(d);
      const cell = (p.calendar && p.calendar[dateStr] && p.calendar[dateStr][h]) || null;
      const hasNote = cell && cell.note && cell.note.trim();
      const cls = cell ? ((cell.groupId ? 'group ' : 'filled ') + (hasNote ? 'has-note' : '')) : '';
      const txt = cell ? escapeHtml(cell.ex || '') : '';
      const fullTitle = cell ? `${cell.ex || ''}${cell.wt && cell.wt.length ? ' [' + cell.wt.join(', ') + ']' : ''}${hasNote ? ' • ' + cell.note : ''}` : '';
      const cellDow = d.getDay();
      const isWeekendCell = (cellDow === 0 || cellDow === 6);
      body += `<div class="cal-cell ${cls} ${isWeekendCell ? 'weekend' : ''}" onclick="editCalendar('${p.id}','${dateStr}','${h}')" title="${escapeAttr(fullTitle)}"><span class="note-dot"></span>${txt}</div>`;
    });
  });

  grid.innerHTML = head + body;
}

function editCalendar(pid, date, time) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  if (!p.calendar) p.calendar = {};
  if (!p.calendar[date]) p.calendar[date] = {};
  const cur = p.calendar[date][time] || { ex: '', note: '', wt: [] };

  const allBlocks = Array.from(new Set(DB.exercises.map(g => g.group)));

  let options = '<option value="">— не выбрано —</option>';
  allBlocks.forEach(v => {
    options += `<option value="${escapeAttr(v)}" ${cur.ex === v ? 'selected' : ''}>${escapeHtml(v)}</option>`;
  });

  const isCustomEx = cur.ex && !allBlocks.includes(cur.ex);

  const wtArr = Array.isArray(cur.wt) ? cur.wt : [];
  const wtHtml = WORK_TYPES.map(t => {
    const checked = wtArr.includes(t);
    return `<label class="wt-chip ${checked ? 'checked' : ''}" onclick="this.classList.toggle('checked')">
      <input type="checkbox" class="cal-wt" value="${escapeAttr(t)}" ${checked ? 'checked' : ''}>
      <span class="dot"></span>
      <span>${escapeHtml(t)}</span>
    </label>`;
  }).join('');

  const otherPlayers = DB.players.filter(x => x.id !== pid);
  const groupHtml = otherPlayers.length
    ? `<div class="field">
        <label>Применить также к другим игрокам (групповая тренировка)</label>
        <div class="group-tools">
          <input type="text" id="grp-search" placeholder="Поиск по ФИО или команде…" oninput="filterGroupPlayers()">
          <button type="button" onclick="expandAllTeams(true)">Развернуть все</button>
          <button type="button" onclick="expandAllTeams(false)">Свернуть все</button>
          <button type="button" onclick="clearGroupSelection()">Снять все</button>
        </div>
        <div class="group-list" id="grp-list">
          ${renderGroupedPlayers(otherPlayers)}
        </div>
      </div>`
    : '';

  openModal(`<h3>${formatDateFull(date)} · ${time}</h3>
    <div class="field"><label>Блок (из справочника)</label><select id="cal-ex">${options}</select></div>
    <div class="field"><label>Своё название блока (если нужно)</label>
      <input id="cal-ex-manual" value="${isCustomEx ? escapeAttr(cur.ex) : ''}" placeholder="оставьте пустым, если выбрали из списка"></div>
    <div class="field"><label>Форма работы</label>
      <div class="wt-chips">${wtHtml}</div>
    </div>
    <div class="field"><label>Примечание (заполняется вручную)</label>
      <input id="cal-note" value="${escapeAttr(cur.note || '')}" placeholder="например: акцент на ногах"></div>
    ${groupHtml}
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveCalendar('${pid}','${date}','${time}')">Сохранить</button>
      <button class="btn btn-red" onclick="clearCalendar('${pid}','${date}','${time}')">Очистить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
}

function saveCalendar(pid, date, time) {
  const p = DB.players.find(x => x.id === pid);
  const sel = document.getElementById('cal-ex').value;
  const man = document.getElementById('cal-ex-manual').value.trim();
  const ex = man || sel;
  const note = (document.getElementById('cal-note').value || '').trim();
  const wt = [];
  document.querySelectorAll('.cal-wt:checked').forEach(cb => wt.push(cb.value));

  const targets = [pid];
  document.querySelectorAll('.grp-player:checked').forEach(cb => targets.push(cb.value));

  if (!ex && !note && !wt.length) {
    targets.forEach(tid => {
      const tp = DB.players.find(x => x.id === tid);
      if (tp.calendar && tp.calendar[date]) delete tp.calendar[date][time];
    });
    saveDB(); closeModal(); renderCalendarGrid(p); updateNotifBadge();
    return;
  }

  const groupId = targets.length > 1 ? 'g_' + Date.now() : undefined;
  targets.forEach(tid => {
    const tp = DB.players.find(x => x.id === tid);
    if (!tp.calendar) tp.calendar = {};
    if (!tp.calendar[date]) tp.calendar[date] = {};
    tp.calendar[date][time] = { ex: ex || '', note: note || '', wt, groupId };
  });

  saveDB();
  closeModal();
  renderCalendarGrid(p);
  updateNotifBadge();
  if (targets.length > 1) toast(`Назначено ${targets.length} игрокам`);
}

function clearCalendar(pid, date, time) {
  const p = DB.players.find(x => x.id === pid);
  if (p.calendar && p.calendar[date]) delete p.calendar[date][time];
  saveDB(); closeModal(); renderCalendarGrid(p); updateNotifBadge();
}

/* ============================================================
   ГРУППОВОЙ ВЫБОР ИГРОКОВ В МОДАЛКЕ
   ============================================================ */

function renderGroupedPlayers(players) {
  const groups = {};
  players.forEach(p => {
    const key = (p.team || '').trim() || '— Без команды —';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  const teamNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ru'));
  return teamNames.map(team => {
    const list = groups[team].slice().sort((a, b) => (a.fio || '').localeCompare(b.fio || '', 'ru'));
    const safeId = 'team-' + team.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '-' + Math.random().toString(36).slice(2, 6);
    return `<div class="group-team" data-team="${escapeAttr(team)}" id="${safeId}">
      <div class="group-team-head" onclick="toggleTeam('${safeId}', event)">
        <span class="arrow">▶</span>
        <span>${escapeHtml(team)}</span>
        <span class="count">${list.length}</span>
        <span class="team-actions" onclick="event.stopPropagation()">
          <button type="button" onclick="selectTeam('${safeId}', true)">Все</button>
          <button type="button" onclick="selectTeam('${safeId}', false)">Никто</button>
        </span>
      </div>
      <div class="group-team-body">
        ${list.map(o => `<label>
          <input type="checkbox" class="grp-player" value="${o.id}">
          <span>${escapeHtml(o.fio)}${o.position ? ' <span style="color:var(--ak-gray-dark);font-size:11px">· ' + escapeHtml(o.position) + '</span>' : ''}</span>
        </label>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleTeam(teamId, event) {
  if (event) event.stopPropagation();
  const el = document.getElementById(teamId);
  if (!el) return;
  el.classList.toggle('open');
}

function expandAllTeams(open) {
  document.querySelectorAll('#grp-list .group-team').forEach(el => {
    el.classList.toggle('open', open);
  });
}

function selectTeam(teamId, checked) {
  const el = document.getElementById(teamId);
  if (!el) return;
  el.querySelectorAll('.grp-player').forEach(cb => { cb.checked = checked; });
}

function clearGroupSelection() {
  document.querySelectorAll('#grp-list .grp-player').forEach(cb => { cb.checked = false; });
}

function filterGroupPlayers() {
  const q = (document.getElementById('grp-search')?.value || '').trim().toLowerCase();
  const list = document.getElementById('grp-list');
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

/* ============================================================
   СПРАВОЧНИК УПРАЖНЕНИЙ
   ============================================================ */

function renderExercises() {
  const el = document.getElementById('exercises-list');
  if (!DB.exercises.length) {
    el.innerHTML = '<div class="empty-state"><div class="big">📋</div><p>Справочник пуст.</p></div>';
    updateToggleAllBtn();
    return;
  }

  el.innerHTML = DB.exercises.map(g => {
    const isOpen = openAccordions.has(g.id);
    const itemCount = g.items.length;
    return `
      <div class="accordion ${isOpen ? 'open' : ''}" data-gid="${g.id}">
        <button class="accordion-header" onclick="toggleAccordion('${g.id}')">
          <span class="title-wrap">
            <span class="arrow">▶</span>
            <span>${escapeHtml(g.group)}</span>
            <span class="count">${itemCount} ${plural(itemCount, 'упражнение', 'упражнения', 'упражнений')}</span>
          </span>
          <span class="group-actions no-print" onclick="event.stopPropagation()">
            <button class="btn-icon" title="Добавить упражнение" onclick="addExercise('${g.id}')">+</button>
            <button class="btn-icon red" title="Удалить группу" onclick="deleteGroup('${g.id}')">🗑</button>
          </span>
        </button>
        <div class="accordion-body" onclick="event.stopPropagation()">
          <div class="accordion-inner">
            ${itemCount ? g.items.map((it, i) => {
              const link = g.links && g.links[i] ? g.links[i] : '';
              return `<div class="ex-item">
                <span class="num">${i + 1}.</span>
                <span class="txt" contenteditable="true" onblur="renameExercise('${g.id}', ${i}, this.innerText)">${escapeHtml(it)}</span>
                ${link
                  ? `<a href="${escapeAttr(link)}" target="_blank">▶ смотреть</a>`
                  : `<a href="#" onclick="editExerciseLink('${g.id}',${i});return false">🔗 видео</a>`}
                <span class="item-actions no-print">
                  <button class="btn-icon" title="Редактировать ссылку" onclick="editExerciseLink('${g.id}',${i})">✎</button>
                  <button class="btn-icon red" title="Удалить" onclick="deleteExercise('${g.id}',${i})">×</button>
                </span>
              </div>`;
            }).join('') : '<div class="accordion-empty">В группе пока нет упражнений</div>'}
          </div>
          <div class="accordion-footer no-print">
            <button class="btn btn-sm" onclick="addExercise('${g.id}')">+ Добавить упражнение</button>
          </div>
        </div>
      </div>`;
  }).join('');

  updateToggleAllBtn();
}

function toggleAccordion(gid) {
  if (openAccordions.has(gid)) openAccordions.delete(gid);
  else openAccordions.add(gid);
  const el = document.querySelector(`.accordion[data-gid="${gid}"]`);
  if (el) el.classList.toggle('open', openAccordions.has(gid));
  updateToggleAllBtn();
}

function toggleAllAccordions() {
  const allOpen = DB.exercises.length > 0 && DB.exercises.every(g => openAccordions.has(g.id));
  if (allOpen) {
    openAccordions.clear();
    document.querySelectorAll('.accordion').forEach(a => a.classList.remove('open'));
  } else {
    DB.exercises.forEach(g => openAccordions.add(g.id));
    document.querySelectorAll('.accordion').forEach(a => a.classList.add('open'));
  }
  updateToggleAllBtn();
}

function updateToggleAllBtn() {
  const btn = document.getElementById('toggle-all-btn');
  if (!btn) return;
  const allOpen = DB.exercises.length > 0 && DB.exercises.every(g => openAccordions.has(g.id));
  btn.textContent = allOpen ? 'Свернуть все' : 'Развернуть все';
}

function addGroup() {
  openModal(`<h3>Новая группа упражнений</h3>
    <div class="field"><label>Название группы</label>
      <input id="ng-name" placeholder="Например: Торможение 1" autofocus></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveNewGroup()">Создать</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('ng-name')?.focus(), 100);
}

function saveNewGroup() {
  const name = document.getElementById('ng-name').value.trim();
  if (!name) { alert('Введите название группы'); return; }
  if (DB.exercises.some(g => g.group.toLowerCase() === name.toLowerCase())) {
    if (!confirm('Группа с таким названием уже есть. Создать ещё одну?')) return;
  }
  const id = 'ex_' + Date.now();
  DB.exercises.push({ id, group: name, items: [], links: {} });
  openAccordions.add(id);
  saveDB(); closeModal(); renderExercises();
}

function deleteGroup(gid) {
  const g = DB.exercises.find(x => x.id === gid);
  if (!g) return;
  if (!confirm(`Удалить группу «${g.group}» со всеми упражнениями?`)) return;
  DB.exercises = DB.exercises.filter(x => x.id !== gid);
  openAccordions.delete(gid);
  saveDB(); renderExercises();
}

function addExercise(groupId) {
  const g = groupId ? DB.exercises.find(x => x.id === groupId) : null;
  const groupOptions = DB.exercises.map(x => `<option value="${x.id}" ${g && x.id === g.id ? 'selected' : ''}>${escapeHtml(x.group)}</option>`).join('');

  openModal(`<h3>Новое упражнение</h3>
    ${g ? `<p style="color:var(--ak-gray-dark);font-size:13px;margin-bottom:12px">Группа: <strong>${escapeHtml(g.group)}</strong></p>`
        : `<div class="field"><label>Группа</label><select id="ne-group">${groupOptions}</select></div>`}
    <div class="field"><label>Название упражнения</label>
      <textarea id="ne-name" rows="3" placeholder="Описание упражнения" autofocus></textarea></div>
    <div class="field"><label>Ссылка на видео (необязательно)</label>
      <input id="ne-link" placeholder="https://..."></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveNewExercise('${groupId || ''}')">Добавить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('ne-name')?.focus(), 100);
}

function saveNewExercise(groupId) {
  const name = document.getElementById('ne-name').value.trim();
  if (!name) { alert('Введите название упражнения'); return; }

  let g;
  if (groupId) g = DB.exercises.find(x => x.id === groupId);
  else {
    const sel = document.getElementById('ne-group');
    if (!sel || !sel.value) { alert('Выберите группу'); return; }
    g = DB.exercises.find(x => x.id === sel.value);
  }
  if (!g) { alert('Группа не найдена'); return; }

  g.items.push(name);
  if (!g.links) g.links = {};
  const link = document.getElementById('ne-link').value.trim();
  if (link) g.links[g.items.length - 1] = link;

  openAccordions.add(g.id);
  saveDB(); closeModal(); renderExercises();
}

function renameExercise(gid, idx, newName) {
  const g = DB.exercises.find(x => x.id === gid);
  if (!g) return;
  newName = newName.trim();
  if (!newName || newName === g.items[idx]) return;
  g.items[idx] = newName;
  saveDB();
}

function deleteExercise(gid, idx) {
  const g = DB.exercises.find(x => x.id === gid);
  if (!g) return;
  if (!confirm(`Удалить упражнение «${g.items[idx].substring(0, 60)}...»?`)) return;

  g.items.splice(idx, 1);
  if (g.links) {
    const newLinks = {};
    Object.keys(g.links).forEach(k => {
      const ki = parseInt(k);
      if (ki < idx) newLinks[ki] = g.links[k];
      else if (ki > idx) newLinks[ki - 1] = g.links[k];
    });
    g.links = newLinks;
  }
  saveDB(); renderExercises();
}

function editExerciseLink(gid, idx) {
  const g = DB.exercises.find(x => x.id === gid);
  if (!g) return;
  const cur = (g.links && g.links[idx]) || '';
  openModal(`<h3>Ссылка на видео</h3>
    <p style="color:var(--ak-gray-dark);font-size:13px;margin-bottom:12px">${escapeHtml(g.items[idx])}</p>
    <div class="field"><label>URL</label>
      <input id="ex-link" value="${escapeAttr(cur)}" placeholder="https://..." autofocus></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveExerciseLink('${gid}',${idx})">Сохранить</button>
      <button class="btn btn-red" onclick="deleteExerciseLink('${gid}',${idx})">Удалить ссылку</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('ex-link')?.focus(), 100);
}

function saveExerciseLink(gid, idx) {
  const g = DB.exercises.find(x => x.id === gid);
  if (!g.links) g.links = {};
  g.links[idx] = document.getElementById('ex-link').value.trim();
  saveDB(); closeModal(); renderExercises();
}

function deleteExerciseLink(gid, idx) {
  const g = DB.exercises.find(x => x.id === gid);
  if (g.links) delete g.links[idx];
  saveDB(); closeModal(); renderExercises();
}