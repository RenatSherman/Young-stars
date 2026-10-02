/* ============================================================
   05-player.js
   БД, оценки, карточка игрока, техника, физ/такт/псих,
   статистика, тесты, графики, календарь игрока (месячная сетка).
   ============================================================ */

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  scheduleSync();
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('akbars_hockey_v1');
  if (raw) { try { DB = JSON.parse(raw); } catch (e) { console.error(e); } }
  if (!DB.players)   DB.players = [];
  if (!DB.exercises) DB.exercises = [];
  if (!DB.meta)      DB.meta = {};
  DB.players.forEach(p => {
    migrateCalendar(p);
    if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
  });
}

function seedDemoData() {
  if (DB.players.length > 0 || DB.exercises.length > 0) return;
  DB.exercises = [
    { id: 'ex_posadka1', group: 'Посадка 1', items: ['Прокат в посадке на двух ногах (лицом)', 'Прокат в посадке на правой ноге (лицом)'] },
    { id: 'ex_ottalk1',  group: 'Отталкивания 1', items: ['Отталкивание внутренним ребром', 'Отталкивание внешним ребром'] },
    { id: 'ex_fonar1',   group: 'Фонарики 1', items: ['Фонарики', 'Полуфонарики правой ногой'] }
  ];
  saveDB();
}

function computeScores(p, mode) {
  if (!p || !p.techDetail || !p.otherDetail) return { tehn: null, fiz: null, takt: null, psih: null };
  const isEnd = mode === 'end';
  const techCol = isEnd ? 'end' : 'start';
  const otherCol = isEnd ? 'fact' : 'start';
  const avgOf = arr => {
    const vals = arr.filter(v => v != null && v !== '' && !isNaN(Number(v)));
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null;
  };
  const tehn = avgOf(p.techDetail.map(r => r[techCol]));
  const groupAvg = g => avgOf(p.otherDetail.filter(r => r.group === g).map(r => r[otherCol]));
  return { tehn, fiz: groupAvg('Физические качества'), takt: groupAvg('Тактические навыки'), psih: groupAvg('Психологические характеристики') };
}
function getCurrentScores(p) { return computeScores(p, 'start'); }
function getEndScores(p)     { return computeScores(p, 'end'); }
function overallScore(p) {
  const s = getCurrentScores(p);
  const vals = [s.tehn, s.fiz, s.takt, s.psih].filter(v => v != null);
  if (!vals.length) return '—';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}
function overallScoreEnd(p) {
  const s = getEndScores(p);
  const vals = [s.tehn, s.fiz, s.takt, s.psih].filter(v => v != null);
  if (!vals.length) return '—';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function addPlayer() {
  openModal(`<h3>Новый игрок</h3>
    <div class="field"><label>ФИО</label><input id="np-fio" autofocus></div>
    <div class="field"><label>Команда</label><input id="np-team" placeholder="Ак Барс 2012"></div>
    <div class="field"><label>Город</label><input id="np-city" placeholder="Казань"></div>
    <div class="field"><label>Амплуа</label><select id="np-pos"><option>Нападающий</option><option>Защитник</option><option>Вратарь</option></select></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveNewPlayer()">Создать</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('np-fio')?.focus(), 100);
}

function saveNewPlayer() {
  const fio = document.getElementById('np-fio').value.trim();
  if (!fio) { alert('Введите ФИО'); return; }
  DB.players.push({
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    fio,
    birthDay: '', birthMonth: '', birthYear: '',
    height: '', weight: '',
    team: document.getElementById('np-team').value,
    city: document.getElementById('np-city').value,
    firstSchool: '',
    position: document.getElementById('np-pos').value,
    grip: 'Правый', photo: '', characteristic: '',
    techDetail: defaultTechDetail(),
    otherDetail: defaultOtherDetail(),
    plans: {}, calendar: {}, stats: [], tests: [],
    developmentPlans: []
  });
  saveDB(); closeModal(); renderPlayers();
  toast(`Игрок «${fio}» добавлен`);
}

function confirmDeletePlayer(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  const scoresCount = (p.techDetail || []).filter(r => r.start != null || r.end != null).length
                    + (p.otherDetail || []).filter(r => r.start != null || r.fact != null).length;
  const calCount = p.calendar
    ? Object.values(p.calendar).reduce((acc, day) => acc + (Array.isArray(day) ? day.reduce((s, sess) => s + (Array.isArray(sess.blocks) ? sess.blocks.length : 0), 0) : 0), 0)
    : 0;
  const statsCount = (p.stats || []).filter(s => s.club || s.season).length;
  const testsCount = (p.tests || []).filter(t => t.date).length;
  const devCount = (p.developmentPlans || []).length;
  const hasData = scoresCount + calCount + statsCount + testsCount + devCount > 0;
  const lastName = (p.fio || '').trim().split(/\s+/)[0] || '';
  const needConfirm = hasData && lastName;

  openModal(`
    <h3 style="color:var(--ak-red-dark)">Удаление игрока</h3>
    <div class="danger-box">
      <h4>⚠ Внимание</h4>
      <p>Вы собираетесь удалить игрока:</p>
      <p style="font-weight:900;font-size:16px;color:var(--ak-green);margin:8px 0;font-family:var(--font-display);text-transform:uppercase">${escapeHtml(p.fio)}</p>
      ${hasData ? `
        <p>Вместе с ним будут удалены:</p>
        <ul>
          ${scoresCount ? `<li>${scoresCount} ${plural(scoresCount, 'оценка', 'оценки', 'оценок')} навыков</li>` : ''}
          ${calCount ? `<li>${calCount} ${plural(calCount, 'блок', 'блока', 'блоков')} в календаре</li>` : ''}
          ${statsCount ? `<li>${statsCount} ${plural(statsCount, 'строка', 'строки', 'строк')} статистики</li>` : ''}
          ${testsCount ? `<li>${testsCount} ${plural(testsCount, 'тест', 'теста', 'тестов')}</li>` : ''}
          ${devCount ? `<li>${devCount} ${plural(devCount, 'цель', 'цели', 'целей')} развития</li>` : ''}
        </ul>
        <p><strong>Действие необратимо.</strong> Рекомендуем сначала экспортировать данные игрока в PDF.</p>
      ` : '<p>У игрока пока нет данных. Удаление безопасно.</p>'}
    </div>
    ${needConfirm ? `
      <div class="field">
        <label>Для подтверждения введите фамилию игрока: <strong>${escapeHtml(lastName)}</strong></label>
        <input id="del-confirm" placeholder="${escapeAttr(lastName)}" autocomplete="off">
      </div>
    ` : ''}
    <div class="btn-row" style="margin-top:16px">
      <button class="btn btn-red" id="del-final-btn" onclick="doDeletePlayer('${pid}')" ${needConfirm ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>🗑 Удалить навсегда</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
      <button class="btn btn-ghost" onclick="closeModal();exportPlayerToPDF('${pid}')" style="margin-left:auto">📄 Сначала экспорт</button>
    </div>
  `);

  if (needConfirm) {
    setTimeout(() => {
      const inp = document.getElementById('del-confirm');
      const btn = document.getElementById('del-final-btn');
      inp.focus();
      inp.addEventListener('input', () => {
        const ok = inp.value.trim().toLowerCase() === lastName.toLowerCase();
        btn.disabled = !ok;
        btn.style.opacity = ok ? '1' : '.5';
        btn.style.cursor = ok ? 'pointer' : 'not-allowed';
      });
    }, 100);
  }
}
function doDeletePlayer(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  DB.players = DB.players.filter(x => x.id !== pid);
  saveDB(); closeModal();
  currentPlayerId = null;
  showScreen('players'); renderPlayers(); updateNotifBadge();
  toast(`Игрок «${p.fio}» удалён`);
}
function deletePlayerFromTile(event, pid) { event.stopPropagation(); confirmDeletePlayer(pid); }

function openPlayer(id) {
  currentPlayerId = id;
  currentTab = 'tech';
  const p = DB.players.find(x => x.id === id);
  if (!p) return;
  currentPlanMonth = null;
  playerCalMonth = null;
  showScreen('player');
  renderPlayerCard(p);
}

function renderPlayerCard(p) {
  const el = document.getElementById('player-card');
  if (!el) return;
  const s = getCurrentScores(p);
  const sEnd = getEndScores(p);
  const age = computeAge(p);

  el.innerHTML = `
    <div class="card"><div class="passport">
      <div>
        <div class="passport-photo">${p.photo ? `<img src="${p.photo}">` : 'ФОТО'}</div>
        <div style="margin-top:12px;text-align:center" class="no-print">
          <button class="btn btn-sm btn-ghost" onclick="uploadPhoto('${p.id}')">Загрузить фото</button></div>
      </div>
      <div>
        <h1 contenteditable="true" onblur="updateField('${p.id}','fio',this.innerText)" style="outline:none;border-radius:4px;padding:2px 4px">${escapeHtml(p.fio)}</h1>
        <p class="subtitle">${escapeHtml(p.team)} · ${escapeHtml(p.city)}</p>
        <div class="passport-fields">
          <div class="field"><label>День рождения</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','birthDay',this.innerText);updateAgeDisplay('${p.id}')">${escapeHtml(p.birthDay)}</div></div>
          <div class="field"><label>Месяц</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','birthMonth',this.innerText);updateAgeDisplay('${p.id}')">${escapeHtml(p.birthMonth)}</div></div>
          <div class="field"><label>Год</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','birthYear',this.innerText);updateAgeDisplay('${p.id}')">${escapeHtml(p.birthYear)}</div></div>
          <div class="field"><label>Возраст</label><div class="value readonly" id="age-field-${p.id}">${age || '—'}</div></div>
          <div class="field"><label>Рост (см)</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','height',this.innerText)">${escapeHtml(p.height)}</div></div>
          <div class="field"><label>Вес (кг)</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','weight',this.innerText)">${escapeHtml(p.weight)}</div></div>
          <div class="field"><label>Команда</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','team',this.innerText)">${escapeHtml(p.team)}</div></div>
          <div class="field"><label>Город</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','city',this.innerText)">${escapeHtml(p.city)}</div></div>
          <div class="field"><label>Первая школа</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','firstSchool',this.innerText)">${escapeHtml(p.firstSchool)}</div></div>
          <div class="field"><label>Амплуа</label><select class="value" style="border:none;background:transparent" onchange="updateField('${p.id}','position',this.value)">
            ${['Нападающий','Защитник','Вратарь'].map(o => `<option ${p.position === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="field"><label>Хват</label><select class="value" style="border:none;background:transparent" onchange="updateField('${p.id}','grip',this.value)">
            ${['Правый','Левый'].map(o => `<option ${p.grip === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="char-block"><label>Краткая характеристика</label>
            <div class="value" contenteditable="true" onblur="updateField('${p.id}','characteristic',this.innerText)">${escapeHtml(p.characteristic)}</div></div>
        </div>
      </div>
    </div></div>

    <div class="card"><h2>Профиль навыков</h2>
      <p class="subtitle" style="margin-top:-8px">Оценки рассчитываются автоматически как средние по разделам</p>
      <div class="radar-wrap">
        <div class="radar-box"><canvas id="radar-${p.id}"></canvas></div>
        <div class="scores-legend">
          ${scoreDisplay('Техника', s.tehn, 'среднее по «Технике»')}
          ${scoreDisplay('Физика', s.fiz, 'раздел «Физические качества»')}
          ${scoreDisplay('Тактика', s.takt, 'раздел «Тактические навыки»')}
          ${scoreDisplay('Психология', s.psih, 'раздел «Психологические характеристики»')}
          <div style="margin-top:8px;padding:14px;background:var(--ak-green);color:#fff;border-radius:4px;text-align:center;border-bottom:4px solid var(--ak-red)">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;opacity:.85;font-family:var(--font-display);font-weight:900">Общая оценка</div>
            <div style="font-size:32px;font-weight:900;font-family:var(--font-display)">${overallScore(p)}</div></div>
        </div>
      </div>
    </div>

    <div class="card red-top"><h2>Динамика: начало сезона → конец сезона</h2>
      <div class="radar-wrap">
        <div class="radar-box"><canvas id="radar2-${p.id}"></canvas></div>
        <div class="scores-legend">
          ${scoreDisplay('Техника (конец)', sEnd.tehn, 'столбец «Конец»')}
          ${scoreDisplay('Физика (конец)', sEnd.fiz, 'столбец «Факт»')}
          ${scoreDisplay('Тактика (конец)', sEnd.takt, 'столбец «Факт»')}
          ${scoreDisplay('Психология (конец)', sEnd.psih, 'столбец «Факт»')}
          <div style="margin-top:8px;padding:14px;background:var(--ak-red);color:#fff;border-radius:4px;text-align:center">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;opacity:.9;font-family:var(--font-display);font-weight:900">Общая (конец)</div>
            <div style="font-size:32px;font-weight:900;font-family:var(--font-display)">${overallScoreEnd(p)}</div></div>
        </div>
      </div>
    </div>

    <div class="tabs no-print">
      <button data-tab="tech" class="${currentTab === 'tech' ? 'active' : ''}">Техника</button>
      <button data-tab="other" class="${currentTab === 'other' ? 'active' : ''}">Физ / Такт / Псих</button>
      <button data-tab="development" class="${currentTab === 'development' ? 'active' : ''}">План развития</button>
      <button data-tab="calendar" class="${currentTab === 'calendar' ? 'active' : ''}">Календарь</button>
      <button data-tab="stats" class="${currentTab === 'stats' ? 'active' : ''}">Статистика</button>
      <button data-tab="tests" class="${currentTab === 'tests' ? 'active' : ''}">Тесты</button>
      <button data-tab="charts" class="${currentTab === 'charts' ? 'active' : ''}">Графики</button>
    </div>

    <div id="tab-tech" class="tab-content ${currentTab === 'tech' ? 'active' : ''}">${renderTechTable(p)}</div>
    <div id="tab-other" class="tab-content ${currentTab === 'other' ? 'active' : ''}">${renderOtherTable(p)}</div>
    <div id="tab-development" class="tab-content ${currentTab === 'development' ? 'active' : ''}">${renderDevelopmentPlan(p)}</div>
    <div id="tab-calendar" class="tab-content ${currentTab === 'calendar' ? 'active' : ''}">${renderPlayerCalendarTab(p)}</div>
    <div id="tab-stats" class="tab-content ${currentTab === 'stats' ? 'active' : ''}">${renderStats(p)}</div>
    <div id="tab-tests" class="tab-content ${currentTab === 'tests' ? 'active' : ''}">${renderTests(p)}</div>
    <div id="tab-charts" class="tab-content ${currentTab === 'charts' ? 'active' : ''}">${renderTestCharts(p)}</div>
  `;

  el.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      el.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      el.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'charts')      drawTestCharts(p);
      if (btn.dataset.tab === 'calendar')    renderPlayerCalendarContent(p);
      if (btn.dataset.tab === 'development') renderDevelopmentPlanContent(p);
    });
  });

  drawRadar(p);
  drawRadarCompare(p);
  if (currentTab === 'charts')      drawTestCharts(p);
  if (currentTab === 'calendar')    renderPlayerCalendarContent(p);
  if (currentTab === 'development') renderDevelopmentPlanContent(p);
}

function updateField(playerId, field, val) {
  const p = DB.players.find(x => x.id === playerId);
  if (!p || p[field] === val) return;
  p[field] = val;
  saveDB();
}
function scoreDisplay(label, val, hint) {
  const v = val != null ? val : 0;
  return `<div class="score-item">
    <span class="lbl">${label}</span>
    <span class="bar"><span style="width:${v * 10}%"></span></span>
    <span class="val">${val != null ? val.toFixed(1) : '—'}</span>
    <span class="hint">${hint || ''}</span>
  </div>`;
}
function drawRadar(p) {
  const ctx = document.getElementById('radar-' + p.id);
  if (!ctx) return;
  const s = getCurrentScores(p);
  new Chart(ctx, {
    type: 'radar',
    data: { labels: ['Техника','Физика','Тактика','Психология'],
      datasets: [{ label: p.fio, data: [s.tehn, s.fiz, s.takt, s.psih],
        backgroundColor: 'rgba(21,71,52,.2)', borderColor: '#154734', borderWidth: 3,
        pointBackgroundColor: '#C8102E', pointBorderColor: '#fff', pointRadius: 6, pointHoverRadius: 8, pointBorderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { r: { beginAtZero: true, max: 10, ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' }, grid: { color: '#C1C6C8' }, angleLines: { color: '#C1C6C8' }, pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' } } },
      plugins: { legend: { display: false } } }
  });
}
function drawRadarCompare(p) {
  const ctx = document.getElementById('radar2-' + p.id);
  if (!ctx) return;
  const s = getCurrentScores(p);
  const e = getEndScores(p);
  const hasEnd = [e.tehn, e.fiz, e.takt, e.psih].some(v => v != null);
  const datasets = [{ label: 'Начало сезона', data: [s.tehn, s.fiz, s.takt, s.psih],
    backgroundColor: 'rgba(21,71,52,.15)', borderColor: '#154734', borderWidth: 3,
    pointBackgroundColor: '#154734', pointRadius: 5 }];
  if (hasEnd) datasets.push({ label: 'Конец сезона', data: [e.tehn, e.fiz, e.takt, e.psih],
    backgroundColor: 'rgba(200,16,46,.15)', borderColor: '#C8102E', borderWidth: 3,
    pointBackgroundColor: '#C8102E', pointRadius: 5 });
  new Chart(ctx, {
    type: 'radar',
    data: { labels: ['Техника','Физика','Тактика','Психология'], datasets },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { r: { beginAtZero: true, max: 10, ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' }, grid: { color: '#C1C6C8' }, angleLines: { color: '#C1C6C8' }, pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' } } },
      plugins: { legend: { position: 'bottom' } } }
  });
}

/* ============================================================
   ВКЛАДКА «КАЛЕНДАРЬ» В КАРТОЧКЕ ИГРОКА
   ============================================================ */
let playerCalMonth = null;

function renderPlayerCalendarTab(p) {
  return `<div class="card">
    <h2>Календарь тренировок игрока</h2>
    <p class="subtitle" style="margin-top:-8px">Тренировки назначаются в «Календаре тренера». Здесь отображаются автоматически.</p>
    <div id="player-calendar-content"></div>
  </div>`;
}

function renderPlayerCalendarContent(p) {
  const el = document.getElementById('player-calendar-content');
  if (!el) return;

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const months = collectPlayerPlanMonths(p);
  const hasAny = months.length > 0;

  if (!playerCalMonth || (hasAny && !months.includes(playerCalMonth))) {
    playerCalMonth = hasAny ? months[months.length - 1] : currentMonth;
  }

  const [year, month] = playerCalMonth.split('-').map(Number);

  let selectMonths = months.slice();
  if (!selectMonths.includes(currentMonth)) selectMonths.push(currentMonth);
  selectMonths = Array.from(new Set(selectMonths)).sort();

  el.innerHTML = `
    <div class="player-cal-toolbar">
      <div class="cc-nav">
        <button class="cc-nav-btn" onclick="playerCalShiftMonth('${p.id}', -1)">‹</button>
        <div class="cc-month-title">${MONTH_NAMES_RU[month - 1]} ${year}</div>
        <button class="cc-nav-btn" onclick="playerCalShiftMonth('${p.id}', 1)">›</button>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="playerCalGoToday('${p.id}')">Текущий месяц</button>
      <select class="player-cal-month-select" onchange="onPlayerCalMonthChange('${p.id}', this.value)">
        ${selectMonths.map(m => `<option value="${m}" ${m === playerCalMonth ? 'selected' : ''}>${monthLabelFromKey(m)}</option>`).join('')}
      </select>
      <div class="cc-legend">
        <span><span class="cc-dot cc-dot-self"></span> Самостоятельная</span>
        <span><span class="cc-dot cc-dot-ind"></span> Индивидуальная</span>
        <span><span class="cc-dot cc-dot-grp"></span> В группе</span>
      </div>
    </div>
    <div class="cc-month-card">
      <div class="cc-month-wrap">
        <div class="cc-month-head">
          ${DOW_SHORT_RU.map((d, i) => `<div class="cc-dow-head ${i >= 5 ? 'weekend' : ''}">${d}</div>`).join('')}
        </div>
        <div class="cc-month-grid" id="player-month-grid"></div>
      </div>
    </div>
    ${hasAny ? '' : `<p class="subtitle" style="margin-top:12px;text-align:center">У игрока пока нет тренировок. Назначьте их в «Календаре тренера» — они появятся здесь автоматически.</p>`}
  `;

  renderPlayerMonthGrid(p, year, month);
}

function playerCalShiftMonth(pid, delta) {
  const [y, m] = playerCalMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  playerCalMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCalendarContent(p);
}
function playerCalGoToday(pid) {
  const today = new Date();
  playerCalMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCalendarContent(p);
}
function onPlayerCalMonthChange(pid, month) {
  playerCalMonth = month;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCalendarContent(p);
}

function renderPlayerMonthGrid(p, year, month) {
  const grid = document.getElementById('player-month-grid');
  if (!grid) return;
  const first = new Date(year, month - 1, 1);
  let dow = first.getDay(); if (dow === 0) dow = 7;
  const firstMonday = new Date(year, month - 1, 1 - (dow - 1));
  const today = localDateStr(new Date());
  const days = [];
  for (let i = 0; i < 42; i++) { const d = new Date(firstMonday); d.setDate(firstMonday.getDate() + i); days.push(d); }
  while (days.length > 35) {
    const lastWeek = days.slice(-7);
    if (lastWeek.every(d => d.getMonth() !== (month - 1))) days.length -= 7;
    else break;
  }

  let html = '';
  days.forEach(d => {
    const ds = localDateStr(d);
    const isOther = d.getMonth() !== (month - 1);
    const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
    const isToday = ds === today;
    const day = (p.calendar && p.calendar[ds]) || [];
    const sessions = Array.isArray(day) ? day : [];
    const allBlocks = [];
    sessions.forEach(sess => (sess.blocks || []).forEach(b => allBlocks.push({ ...b, sessionId: sess.id })));
    const visible = allBlocks.slice(0, 3);

    html += `<div class="cc-day ${isOther ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
                  onclick="openPlayerDaySessions('${p.id}','${ds}')">
      <div class="cc-day-head">
        <span class="cc-day-num ${isToday ? 'today-badge' : ''}">${d.getDate()}</span>
        ${allBlocks.length ? `<span class="cc-day-total">${allBlocks.length}</span>` : ''}
      </div>
      <div class="cc-day-bars">
        ${visible.map(b => {
          const color = playerBlockColor(b);
          return `<div class="cc-day-bar" style="background:${color}">
            ${b.startTime ? `<span class="cc-bar-time">${escapeHtml(b.startTime)}</span>` : ''}
            <span class="cc-bar-label">${escapeHtml(b.complex || 'Блок')}</span>
          </div>`;
        }).join('')}
        ${allBlocks.length > 3 ? `<div class="cc-more">+${allBlocks.length - 3} ещё</div>` : ''}
      </div>
    </div>`;
  });
  grid.innerHTML = html;
}

function playerBlockColor(b) {
  const f = b.format || '';
  if (f === 'В группе') return WORK_TYPE_COLORS['В группе'];
  if (f === 'Индивидуальная с тренером') return WORK_TYPE_COLORS['Индивидуальная с тренером'];
  if (f === 'Самостоятельная') return WORK_TYPE_COLORS['Самостоятельная'];
  return '#5a6169';
}

function openPlayerDaySessions(pid, ds) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  const day = (p.calendar && p.calendar[ds]) || [];
  const sessions = Array.isArray(day) ? day : [];
  const allBlocks = [];
  sessions.forEach(sess => (sess.blocks || []).forEach(b => allBlocks.push(b)));
  const title = formatDateFull(ds);

  const listHtml = allBlocks.length
    ? allBlocks.map(b => {
        const color = playerBlockColor(b);
        const end = minutesToTime(timeToMinutes(b.startTime) + (Number(b.duration) || 0));
        const fact = b.fact ? factLabel(b.fact) : '—';
        const factCls = factClass(b.fact);
        return `<div class="cc-sess-item" style="border-left-color:${color}">
          <div class="cc-sess-main">
            <div class="cc-sess-time">${escapeHtml(b.startTime || '')}–${end} · ${Number(b.duration) || 0} мин</div>
            <div class="cc-sess-name">${escapeHtml(b.complex || 'Блок')}</div>
            <div class="cc-sess-meta">${escapeHtml(b.format || '—')}</div>
            <div class="cc-sess-meta" style="margin-top:4px">Факт: <span class="pcs-fact ${factCls}" style="display:inline-block;padding:1px 8px;font-size:11px">${escapeHtml(fact)}</span></div>
            ${b.comment ? `<div class="cc-sess-note">Примечание: ${escapeHtml(b.comment)}</div>` : ''}
          </div>
        </div>`;
      }).join('')
    : '<p class="subtitle" style="text-align:center;padding:20px 0">На этот день блоков нет.</p>';

  openModal(`<h3>${escapeHtml(title)}</h3>
    <div class="cc-day-list">${listHtml}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn-ghost btn" onclick="closeModal()">Закрыть</button>
    </div>`);
}

/* ===== ТЕХНИКА ===== */
function renderTechTable(p) {
  let rows = '', lastGroup = '', lastSub = '';
  p.techDetail.forEach((r, i) => {
    const g = r.group !== lastGroup ? `<td rowspan="${countGroup(p.techDetail, r.group)}" style="font-weight:900;color:var(--ak-green);vertical-align:top;font-family:var(--font-display);font-size:11px;letter-spacing:.3px;text-transform:uppercase">${r.group}</td>` : '';
    const s = r.sub !== lastSub ? `<td style="font-weight:600;color:var(--ak-gray-dark);font-size:12px">${r.sub}</td>` : '<td></td>';
    rows += `<tr>${g}${s}<td>${i + 1}</td>
      <td><span class="editable-name" contenteditable="true" onblur="updateTechName('${p.id}',${i},'name',this.innerText)">${escapeHtml(r.name)}</span></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.start ?? ''}" onchange="updateTech('${p.id}',${i},'start',this.value)"></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.mid ?? ''}" onchange="updateTech('${p.id}',${i},'mid',this.value)"></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.end ?? ''}" onchange="updateTech('${p.id}',${i},'end',this.value)"></td></tr>`;
    lastGroup = r.group; lastSub = r.sub;
  });
  return `<div class="card"><h2>Техническая оснащённость</h2>
    <p class="subtitle" style="margin-top:-8px">Названия критериев редактируются кликом</p>
    <div style="overflow-x:auto"><table><thead><tr><th>Раздел</th><th>Подраздел</th><th>№</th><th>Критерий</th><th>Начало</th><th>Середина</th><th>Конец</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}
function countGroup(a, g) { return a.filter(x => x.group === g).length; }
function updateTech(pid, i, f, v) { const p = DB.players.find(x => x.id === pid); p.techDetail[i][f] = v === '' ? null : Number(v); saveDB(); refreshProfile(pid); }
function updateTechName(pid, i, f, v) { const p = DB.players.find(x => x.id === pid); v = v.trim(); if (!v || p.techDetail[i][f] === v) return; p.techDetail[i][f] = v; saveDB(); }

/* ===== ФИЗ/ТАКТ/ПСИХ ===== */
function renderOtherTable(p) {
  let rows = '', lastGroup = '', lastSub = '';
  p.otherDetail.forEach((r, i) => {
    const g = r.group !== lastGroup ? `<td rowspan="${countGroup(p.otherDetail, r.group)}" style="font-weight:900;color:var(--ak-green);vertical-align:top;font-family:var(--font-display);font-size:11px;letter-spacing:.3px;text-transform:uppercase">${r.group}</td>` : '';
    const s = r.sub !== lastSub && r.sub ? `<td style="font-weight:600;color:var(--ak-gray-dark);font-size:12px">${r.sub}</td>` : '<td></td>';
    rows += `<tr>${g}${s}<td>${i + 1}</td>
      <td><span class="editable-name" contenteditable="true" onblur="updateOtherName('${p.id}',${i},'name',this.innerText)">${escapeHtml(r.name)}</span></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.start ?? ''}" onchange="updateOther('${p.id}',${i},'start',this.value)"></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.plan ?? ''}" onchange="updateOther('${p.id}',${i},'plan',this.value)"></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.fact ?? ''}" onchange="updateOther('${p.id}',${i},'fact',this.value)"></td></tr>`;
    lastGroup = r.group; lastSub = r.sub;
  });
  return `<div class="card"><h2>Физические, тактические и психологические характеристики</h2>
    <p class="subtitle" style="margin-top:-8px">Названия критериев редактируются кликом</p>
    <div style="overflow-x:auto"><table><thead><tr><th>Раздел</th><th>Подраздел</th><th>№</th><th>Критерий</th><th>Начало</th><th>План</th><th>Факт</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}
function updateOther(pid, i, f, v) { const p = DB.players.find(x => x.id === pid); p.otherDetail[i][f] = v === '' ? null : Number(v); saveDB(); refreshProfile(pid); }
function updateOtherName(pid, i, f, v) { const p = DB.players.find(x => x.id === pid); v = v.trim(); if (!v || p.otherDetail[i][f] === v) return; p.otherDetail[i][f] = v; saveDB(); }

function refreshProfile(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  const scrollY = window.scrollY;
  const savedTab = currentTab;
  renderPlayerCard(p);
  currentTab = savedTab;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === savedTab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + savedTab));
  window.scrollTo(0, scrollY);
}

/* ===== СТАТИСТИКА ===== */
function renderStats(p) {
  let rows = p.stats.map((s, i) => {
    if (s.season && !s.club) return `<tr class="section-row"><td colspan="7">${escapeHtml(s.season)}</td></tr>`;
    return `<tr>
      <td><input class="cell" value="${escapeAttr(s.club || '')}" onchange="updateStat('${p.id}',${i},'club',this.value)"></td>
      <td><input class="cell" type="number" value="${s.games ?? ''}" onchange="updateStat('${p.id}',${i},'games',this.value)"></td>
      <td><input class="cell" type="number" value="${s.goals ?? ''}" onchange="updateStat('${p.id}',${i},'goals',this.value)"></td>
      <td><input class="cell" type="number" value="${s.assists ?? ''}" onchange="updateStat('${p.id}',${i},'assists',this.value)"></td>
      <td><input class="cell" type="number" value="${s.points ?? ''}" onchange="updateStat('${p.id}',${i},'points',this.value)"></td>
      <td><input class="cell" type="number" value="${s.plus ?? ''}" onchange="updateStat('${p.id}',${i},'plus',this.value)"></td>
      <td class="no-print"><button class="btn btn-sm btn-ghost" onclick="removeStat('${p.id}',${i})">×</button></td></tr>`;
  }).join('');
  return `<div class="card"><h2>Статистика матчей</h2>
    <div class="btn-row no-print">
      <button class="btn btn-sm" onclick="addStat('${p.id}')">+ Строка</button>
      <button class="btn btn-sm btn-ghost" onclick="addStatSection('${p.id}')">+ Раздел</button>
    </div>
    <div style="overflow-x:auto"><table><thead><tr><th>Клуб / турнир</th><th>Игры</th><th>Голы</th><th>Передачи</th><th>Очки</th><th>+/-</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}
function updateStat(pid, i, f, v) { const p = DB.players.find(x => x.id === pid); p.stats[i][f] = (f === 'club' || f === 'season') ? v : (v === '' ? '' : Number(v)); saveDB(); }
function addStat(pid) { const p = DB.players.find(x => x.id === pid); p.stats.push({ season: '', club: '', games: '', goals: '', assists: '', points: '', plus: '' }); saveDB(); refreshProfile(pid); }
function addStatSection(pid) { const p = DB.players.find(x => x.id === pid); const name = prompt('Название раздела:'); if (!name) return; p.stats.push({ season: name, club: '', games: '', goals: '', assists: '', points: '', plus: '' }); saveDB(); refreshProfile(pid); }
function removeStat(pid, i) { const p = DB.players.find(x => x.id === pid); p.stats.splice(i, 1); saveDB(); refreshProfile(pid); }

/* ===== ТЕСТЫ ===== */
function renderTests(p) {
  const cols = getTestColumns();
  const headHtml = `<th>Дата</th>` + cols.map(c => `<th><span class="editable-name" contenteditable="true" onblur="renameTestColumn('${c.key}', this.innerText)">${escapeHtml(c.label)}</span></th>`).join('') + `<th class="no-print"></th>`;
  let rows = (p.tests || []).map((t, i) => {
    const cells = cols.map(c => `<td><input class="cell" value="${escapeAttr(t[c.key] || '')}" onchange="updateTest('${p.id}',${i},'${c.key}',this.value)"></td>`).join('');
    return `<tr>
      <td><input class="cell" type="date" value="${t.date || ''}" onchange="updateTest('${p.id}',${i},'date',this.value)"></td>
      ${cells}
      <td class="no-print"><button class="btn btn-sm btn-ghost" onclick="removeTest('${p.id}',${i})">×</button></td></tr>`;
  }).join('');
  return `<div class="card"><h2>Тесты</h2>
    <p class="subtitle" style="margin-top:-8px">Названия столбцов редактируются кликом.</p>
    <div class="btn-row no-print">
      <button class="btn btn-sm" onclick="addTest('${p.id}')">+ Тест</button>
      <button class="btn btn-sm btn-ghost" onclick="resetTestColumns()">↺ Сбросить названия столбцов</button>
    </div>
    <div style="overflow-x:auto"><table><thead><tr>${headHtml}</tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}
function renameTestColumn(key, newLabel) {
  newLabel = (newLabel || '').trim();
  if (!newLabel) return;
  if (!Array.isArray(DB.testColumns) || !DB.testColumns.length) DB.testColumns = DEFAULT_TEST_COLUMNS.map(c => ({ ...c }));
  const col = DB.testColumns.find(c => c.key === key);
  if (col && col.label !== newLabel) { col.label = newLabel; saveDB(); }
}
function resetTestColumns() { if (!confirm('Сбросить названия столбцов тестов на стандартные?')) return; DB.testColumns = DEFAULT_TEST_COLUMNS.map(c => ({ ...c })); saveDB(); if (currentPlayerId) refreshProfile(currentPlayerId); }
function updateTest(pid, i, f, v) { const p = DB.players.find(x => x.id === pid); p.tests[i][f] = v; saveDB(); }
function addTest(pid) { const p = DB.players.find(x => x.id === pid); if (!p.tests) p.tests = []; const newRow = { date: '' }; getTestColumns().forEach(c => newRow[c.key] = ''); p.tests.push(newRow); saveDB(); refreshProfile(pid); }
function removeTest(pid, i) { const p = DB.players.find(x => x.id === pid); p.tests.splice(i, 1); saveDB(); refreshProfile(pid); }

/* ===== ГРАФИКИ ТЕСТОВ ===== */
function renderTestCharts(p) {
  return `<div class="card"><h2>Динамика тестов</h2>
    <p class="subtitle" style="margin-top:-8px">Линейные графики по датам замеров</p>
    <div class="chart-grid">
      <div><h3>Вертикальный прыжок (см)</h3><div class="chart-box"><canvas id="ch-vertical-${p.id}"></canvas></div></div>
      <div><h3>Спринт 30 м (с)</h3><div class="chart-box"><canvas id="ch-sprint-${p.id}"></canvas></div></div>
      <div><h3>Жим лёжа 5ПМ (кг)</h3><div class="chart-box"><canvas id="ch-bench-${p.id}"></canvas></div></div>
      <div><h3>Присед 5ПМ (кг)</h3><div class="chart-box"><canvas id="ch-squat-${p.id}"></canvas></div></div>
      <div><h3>Подтягивания (раз)</h3><div class="chart-box"><canvas id="ch-pullups-${p.id}"></canvas></div></div>
      <div><h3>Общий прогресс</h3><div class="chart-box"><canvas id="ch-overall-${p.id}"></canvas></div></div>
    </div></div>`;
}
function drawTestCharts(p) {
  const tests = (p.tests || []).filter(t => t.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  const labels = tests.map(t => formatDate(t.date));
  const num = v => v === '' || v == null ? null : Number(v);
  const makeChart = (id, data, label, color, reverse = false) => {
    const ctx = document.getElementById(id); if (!ctx) return;
    new Chart(ctx, { type: 'line',
      data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: color + '22', borderWidth: 3, tension: .3, fill: true, pointBackgroundColor: color, pointRadius: 5, pointHoverRadius: 7, spanGaps: true }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: !reverse, reverse, grid: { color: '#e8eaec' }, ticks: { color: '#5a6169' } }, x: { grid: { display: false }, ticks: { color: '#5a6169' } } } } });
  };
  makeChart('ch-vertical-' + p.id, tests.map(t => num(t.vertical)), 'Прыжок, см', '#154734');
  makeChart('ch-sprint-' + p.id,   tests.map(t => num(t.sprint)),   'Спринт, с', '#C8102E', true);
  makeChart('ch-bench-' + p.id,    tests.map(t => num(t.bench)),    'Жим, кг', '#1e5a44');
  makeChart('ch-squat-' + p.id,    tests.map(t => num(t.squat)),    'Присед, кг', '#9a0c23');
  makeChart('ch-pullups-' + p.id,  tests.map(t => num(t.pullups)),  'Подтягивания', '#5a6169');
  const overall = tests.map(t => {
    const vals = [];
    if (num(t.vertical)) vals.push(Math.min(100, num(t.vertical) / 80 * 100));
    if (num(t.sprint))   vals.push(Math.min(100, (5 - num(t.sprint)) / 2 * 100));
    if (num(t.bench))    vals.push(Math.min(100, num(t.bench) / 120 * 100));
    if (num(t.squat))    vals.push(Math.min(100, num(t.squat) / 150 * 100));
    if (num(t.pullups))  vals.push(Math.min(100, num(t.pullups) / 20 * 100));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  makeChart('ch-overall-' + p.id, overall, 'Общий прогресс, %', '#C8102E');
}

function uploadPhoto(pid) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const max = 400;
        let w = img.width, h = img.height;
        if (w > h) { if (w > max) { h = h * max / w; w = max; } } else { if (h > max) { w = w * max / h; h = max; } }
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const p = DB.players.find(x => x.id === pid);
        p.photo = c.toDataURL('image/jpeg', 0.8);
        saveDB(); refreshProfile(pid);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function defaultTechDetail() {
  return [
    ['Катание','Посадка','Ноги'],['Катание','Посадка','Спина'],['Катание','Посадка','Руки'],['Катание','Посадка','Голова'],
    ['Катание','Отталкивания','Посадка'],['Катание','Отталкивания','Длина шага'],['Катание','Отталкивания','Прокат'],
    ['Катание','Рёбра/виражи','Внутренние грани'],['Катание','Рёбра/виражи','Внешние грани'],['Катание','Рёбра/виражи','Виражи'],['Катание','Рёбра/виражи','Сбросы'],['Катание','Рёбра/виражи','Переступания'],
    ['Катание','Торможение','Внешние грани'],['Катание','Торможение','Внутренние грани'],
    ['Контроль шайбы','Ведение','Одной рукой'],['Контроль шайбы','Ведение','Двумя руками'],['Контроль шайбы','Обводка','Широкая'],['Контроль шайбы','Обводка','Короткая'],
    ['Передачи','Удобная','Пас по льду'],['Передачи','Удобная','Подкидка'],['Передачи','Удобная','Приём'],
    ['Передачи','Неудобная','Пас по льду'],['Передачи','Неудобная','Подкидка'],['Передачи','Неудобная','Приём'],
    ['Броски','Кистевой','Точность'],['Броски','Кистевой','Сила'],['Броски','Короткий','Точность'],['Броски','Короткий','Сила'],
    ['Броски','Щелчок','Точность'],['Броски','Щелчок','Сила'],['Броски','В касание','Точность'],['Броски','В касание','Сила']
  ].map(([group, sub, name]) => ({ group, sub, name, start: null, mid: null, end: null }));
}
function defaultOtherDetail() {
  return [
    ['Физические качества','Сила','Общая'],['Физические качества','Сила','Взрывная'],
    ['Физические качества','Быстрота','Частота'],['Физические качества','Быстрота','Скорость'],
    ['Физические качества','Выносливость','Общая'],['Физические качества','Выносливость','Специальная'],
    ['Тактические навыки','Игра в атаке','Открывания'],['Тактические навыки','Игра в атаке','Удержание'],
    ['Тактические навыки','Игра в обороне','Отбор'],['Тактические навыки','Игра в обороне','Опека'],
    ['Тактические навыки','Игра в неравных составах','Большинство'],['Тактические навыки','Игра в неравных составах','Меньшинство'],
    ['Психологические характеристики','','Эмоциональная стабильность'],
    ['Психологические характеристики','','Трудовая этика'],
    ['Психологические характеристики','','Спортивная активность']
  ].map(([group, sub, name]) => ({ group, sub, name, start: null, plan: null, fact: null }));
}