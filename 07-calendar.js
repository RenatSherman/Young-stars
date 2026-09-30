/* ============================================================
   07-calendar.js
   Календарь игрока (список тренировок по дням) + справочник.
   Загружается после 06-plan.js.
   ============================================================ */

/* ===== Календарь игрока ===== */
function renderCalendar(p) {
  return `<div class="card">
    <h2>Календарь игрока</h2>
    <p class="subtitle" style="margin-top:-8px">Тренировки назначаются в «Календаре тренера».</p>
    <div id="player-calendar-content"></div>
  </div>`;
}

function renderCalendarGrid(p) {
  const el = document.getElementById('player-calendar-content');
  if (!el || !p) return;

  if (!p.calendar || !Object.keys(p.calendar).length) {
    el.innerHTML = '<p class="subtitle">Пока нет тренировок.</p>';
    return;
  }

  const dates = Object.keys(p.calendar).sort();
  let html = '<div class="player-cal-list">';

  dates.forEach(date => {
    const day = p.calendar[date];
    if (!Array.isArray(day) || !day.length) return;

    html += `<div class="player-cal-day">
      <div class="player-cal-date">${formatDateFull(date)}</div>
      <div class="player-cal-sessions">`;

    day.forEach((sess, idx) => {
      const wt = (sess.workTypes || []).join(', ');
      html += `<div class="player-cal-session">
        <div class="pcs-time">${escapeHtml(sess.timeStart || '')}–${escapeHtml(sess.timeEnd || '')}</div>
        <div class="pcs-name">${escapeHtml(sess.name || sess.block || '')}</div>
        <div class="pcs-wt">${escapeHtml(wt)}</div>
        ${sess.note ? `<div class="pcs-note">${escapeHtml(sess.note)}</div>` : ''}
      </div>`;
    });

    html += `</div></div>`;
  });

  html += '</div>';
  el.innerHTML = html;
}

/* ============================================================
   СПРАВОЧНИК УПРАЖНЕНИЙ
   ============================================================ */

function renderExercises() {
  const el = document.getElementById('exercises-list');
  if (!el) return;
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