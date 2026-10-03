/* ============================================================
   05b-player-calendar.js
   Календарь игрока в карточке:
   - месячная сетка (отображается всегда — даже без тренировок)
   - клик по дню → редактируемая модалка с отметкой факта
   - для «частично» / «не выполнено» обязателен комментарий
   - сохранение идёт через saveBlockFact() из 06-plan.js

   Разбиение 05-player.js:
     05a-player-core.js       — ядро карточки (уже создан)
     05b-player-calendar.js   ← этот файл
     05c-player-tables.js     — таблицы и графики
   ============================================================ */

/* ===== Состояние выбранного месяца ===== */
let playerCalMonth = null;

/* Локальные копии хелперов — чтобы не зависеть от порядка загрузки скриптов */
function collectPlayerPlanMonthsLocal(p) {
  const set = new Set();
  if (!p || !p.calendar) return [];
  Object.keys(p.calendar).forEach(date => {
    const day = p.calendar[date];
    if (!Array.isArray(day) || !day.length) return;
    set.add(date.slice(0, 7));
  });
  return Array.from(set).sort();
}

function monthLabelFromKeyLocal(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_RU[m - 1]} ${y}`;
}

/* ===== Заготовка вкладки ===== */

function renderPlayerCalendarTab(p) {
  return `<div class="card">
    <h2>Календарь тренировок игрока</h2>
    <p class="subtitle" style="margin-top:-8px">Тренировки назначаются в «Календаре тренера». Здесь отображаются автоматически. Можно отметить факт прямо здесь.</p>
    <div id="player-calendar-content"></div>
  </div>`;
}

/* ===== Основной рендер ===== */

function renderPlayerCalendarContent(p) {
  const el = document.getElementById('player-calendar-content');
  if (!el) return;

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const months = collectPlayerPlanMonthsLocal(p);
  const hasAny = months.length > 0;

  // Валидация playerCalMonth — строка YYYY-MM, иначе текущий месяц
  if (!playerCalMonth || !/^\d{4}-\d{2}$/.test(playerCalMonth)) {
    playerCalMonth = hasAny ? months[months.length - 1] : currentMonth;
  }

  const [year, month] = playerCalMonth.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    playerCalMonth = currentMonth;
    const [y2, m2] = playerCalMonth.split('-').map(Number);
    renderPlayerCalendarContentInner(el, p, months, currentMonth, y2, m2);
    return;
  }

  renderPlayerCalendarContentInner(el, p, months, currentMonth, year, month);
}

function renderPlayerCalendarContentInner(el, p, months, currentMonth, year, month) {
  let selectMonths = months.slice();
  if (!selectMonths.includes(currentMonth)) selectMonths.push(currentMonth);
  if (!selectMonths.includes(playerCalMonth)) selectMonths.push(playerCalMonth);
  selectMonths = Array.from(new Set(selectMonths)).sort();

  const hasAny = months.length > 0;

  el.innerHTML = `
    <div class="player-cal-toolbar">
      <div class="cc-nav">
        <button class="cc-nav-btn" onclick="playerCalShiftMonth('${p.id}', -1)">‹</button>
        <div class="cc-month-title">${MONTH_NAMES_RU[month - 1]} ${year}</div>
        <button class="cc-nav-btn" onclick="playerCalShiftMonth('${p.id}', 1)">›</button>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="playerCalGoToday('${p.id}')">Текущий месяц</button>
      <select class="player-cal-month-select" onchange="onPlayerCalMonthChange('${p.id}', this.value)">
        ${selectMonths.map(m => `<option value="${m}" ${m === playerCalMonth ? 'selected' : ''}>${monthLabelFromKeyLocal(m)}</option>`).join('')}
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

/* ===== Навигация по месяцам ===== */

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

/* ===== Сетка месяца ===== */

function renderPlayerMonthGrid(p, year, month) {
  const grid = document.getElementById('player-month-grid');
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

/* Цвет плашки в зависимости от формата работы */
function playerBlockColor(b) {
  const f = b.format || '';
  if (f === 'В группе') return WORK_TYPE_COLORS['В группе'];
  if (f === 'Индивидуальная с тренером') return WORK_TYPE_COLORS['Индивидуальная с тренером'];
  if (f === 'Самостоятельная') return WORK_TYPE_COLORS['Самостоятельная'];
  return '#5a6169';
}

/* ============================================================
   МОДАЛКА ДНЯ: список блоков + отметка факта
   ============================================================ */

let __playerDayFactCtx = null;

function openPlayerDaySessions(pid, ds) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  const day = (p.calendar && p.calendar[ds]) || [];
  const sessions = Array.isArray(day) ? day : [];
  const title = formatDateFull(ds);

  // Собираем блоки
  const blocks = [];
  sessions.forEach(sess => {
    (sess.blocks || []).forEach((b, bi) => {
      blocks.push({
        sessionId: sess.id,
        sessionName: sess.name || '',
        blockIndex: bi,
        complex: b.complex || '',
        format: b.format || '',
        startTime: b.startTime || '',
        duration: Number(b.duration) || 0,
        note: b.note || '',
        fact: b.fact || '',
        comment: b.comment || ''
      });
    });
  });

  if (!blocks.length) {
    openModal(`<h3>${escapeHtml(title)}</h3>
      <p class="subtitle" style="text-align:center;padding:20px 0">На этот день блоков нет.</p>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn-ghost btn" onclick="closeModal()">Закрыть</button>
      </div>`);
    return;
  }

  const rowsHtml = blocks.map((b, i) => {
    const end = minutesToTime(timeToMinutes(b.startTime) + b.duration);
    const factOptions = FACT_OPTIONS.map(f => {
      const sel = (f.value === (b.fact || '')) ? 'selected' : '';
      return `<option value="${f.value}" ${sel}>${f.label}</option>`;
    }).join('');
    const needComment = (b.fact === 'partial' || b.fact === 'notdone');
    const factCls = factClass(b.fact);
    return `<div class="pde-block" data-block-index="${i}">
      <div class="pde-block-head">
        <span class="pde-block-time">${escapeHtml(b.startTime)}–${end} · ${b.duration} мин</span>
        ${b.sessionName ? `<span class="pde-block-session">${escapeHtml(b.sessionName)}</span>` : ''}
      </div>
      <div class="pde-block-name">${escapeHtml(b.complex || '—')} · ${escapeHtml(b.format || '—')}</div>
      <div class="pde-block-fields">
        <select class="pde-fact ${factCls}" onchange="onPlayerDayFactChange(${i}, this.value)">
          ${factOptions}
        </select>
        <input class="pde-comment" type="text" placeholder="${needComment ? 'Комментарий (обязательно)' : 'Комментарий'}"
               value="${escapeAttr(b.comment || '')}"
               oninput="onPlayerDayFactComment(${i}, this.value)"
               style="display:${needComment ? 'block' : 'none'}">
      </div>
    </div>`;
  }).join('');

  // Локальный контекст для модалки
  __playerDayFactCtx = {
    pid, ds,
    blocks: blocks.map(b => ({ ...b }))
  };

  openModal(`<h3>${escapeHtml(title)}</h3>
    <p class="subtitle" style="margin-top:-8px">Можно отметить факт прямо здесь.</p>
    <div class="pde-list">${rowsHtml}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="savePlayerDayFact()">Сохранить факт</button>
      <button class="btn-ghost btn" onclick="closeModal()">Закрыть</button>
    </div>`);
}

function onPlayerDayFactChange(i, value) {
  if (!__playerDayFactCtx || !__playerDayFactCtx.blocks[i]) return;
  const b = __playerDayFactCtx.blocks[i];
  b.fact = value;

  const wrap = document.querySelector(`.pde-block[data-block-index="${i}"]`);
  if (!wrap) return;

  const inp = wrap.querySelector('.pde-comment');
  if (inp) {
    const need = (value === 'partial' || value === 'notdone');
    inp.style.display = need ? 'block' : 'none';
    inp.placeholder = need ? 'Комментарий (обязательно)' : 'Комментарий';
  }

  const sel = wrap.querySelector('.pde-fact');
  if (sel) {
    sel.classList.remove('done', 'partial', 'notdone');
    if (value === 'done') sel.classList.add('done');
    else if (value === 'partial') sel.classList.add('partial');
    else if (value === 'notdone') sel.classList.add('notdone');
  }
}

function onPlayerDayFactComment(i, value) {
  if (!__playerDayFactCtx || !__playerDayFactCtx.blocks[i]) return;
  __playerDayFactCtx.blocks[i].comment = value;
}

function savePlayerDayFact() {
  const ctx = __playerDayFactCtx;
  if (!ctx) return;

  // Валидация: для «частично» и «не выполнено» обязателен комментарий
  for (let i = 0; i < ctx.blocks.length; i++) {
    const b = ctx.blocks[i];
    if ((b.fact === 'partial' || b.fact === 'notdone') && !(b.comment || '').trim()) {
      alert(`Блок #${i + 1}: для «${factLabel(b.fact)}» обязателен комментарий`);
      return;
    }
  }

  // Сохраняем через общий хелпер (определён в 06-plan.js)
  if (typeof saveBlockFact !== 'function') {
    alert('Ошибка: saveBlockFact не найдена. Проверьте порядок подключения скриптов.');
    return;
  }

  ctx.blocks.forEach(b => {
    saveBlockFact(ctx.pid, ctx.ds, b.sessionId, b.blockIndex, b.fact, b.comment);
  });

  const pid = ctx.pid;
  __playerDayFactCtx = null;
  closeModal();

  // Перерисовываем сетку месяца с обновлённым фактом
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCalendarContent(p);
  toast('Факт сохранён');
}