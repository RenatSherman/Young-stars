/* ============================================================
   06-plan.js
   План / факт игрока:
   - календарная сетка месяца (как в «Календаре тренера»)
   - в дне видно: есть ли блоки, их количество
   - клик по дню → модалка со списком блоков этого дня
   - клик по блоку → окно отметки факта
   - нижняя панель: объём по плану, выполнено, частично, не выполнено
   ============================================================ */

function renderPlan(p) {
  return `<div class="card">
    <h2>План / факт</h2>
    <p class="subtitle" style="margin-top:-8px">
      Данные автоматически берутся из «Календаря тренера». Кликните по дню — откроется список блоков.
    </p>
    <div id="plan-content"></div>
  </div>`;
}

function renderPlanContent(p) {
  const el = document.getElementById('plan-content');
  if (!el) return;

  const months = collectPlayerPlanMonths(p);
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const hasAny = months.length > 0;

  if (!currentPlanMonth || (hasAny && !months.includes(currentPlanMonth))) {
    currentPlanMonth = hasAny ? months[months.length - 1] : currentMonth;
  }

  const [year, month] = currentPlanMonth.split('-').map(Number);

  let selectMonths = months.slice();
  if (!selectMonths.includes(currentMonth)) selectMonths.push(currentMonth);
  selectMonths = Array.from(new Set(selectMonths)).sort();

  const stats = computePlayerMonthStats(p, currentPlanMonth) || {
    total: 0, done: 0, partial: 0, notdone: 0, volume: 0, completion: 0
  };

  el.innerHTML = `
    <div class="player-cal-toolbar">
      <div class="cc-nav">
        <button class="cc-nav-btn" onclick="planCalShiftMonth('${p.id}', -1)">‹</button>
        <div class="cc-month-title">${MONTH_NAMES_RU[month - 1]} ${year}</div>
        <button class="cc-nav-btn" onclick="planCalShiftMonth('${p.id}', 1)">›</button>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="planCalGoToday('${p.id}')">Текущий месяц</button>
      <select class="player-cal-month-select" onchange="onPlanCalMonthChange('${p.id}', this.value)">
        ${selectMonths.map(m => `<option value="${m}" ${m === currentPlanMonth ? 'selected' : ''}>${monthLabelFromKey(m)}</option>`).join('')}
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
        <div class="cc-month-grid" id="plan-month-grid"></div>
      </div>
    </div>
    ${hasAny ? '' : `<p class="subtitle" style="margin-top:12px;text-align:center">У игрока пока нет блоков. Назначьте их в «Календаре тренера» — они появятся здесь автоматически.</p>`}
    ${renderPlanSummaryBlock(stats)}
  `;

  renderPlanMonthGrid(p, year, month);
}

function collectPlayerPlanMonths(p) {
  const set = new Set();
  if (!p.calendar) return [];
  Object.keys(p.calendar).forEach(date => {
    const day = p.calendar[date];
    if (!Array.isArray(day) || !day.length) return;
    set.add(date.slice(0, 7));
  });
  return Array.from(set).sort();
}

function monthLabelFromKey(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_RU[m - 1]} ${y}`;
}

function planCalShiftMonth(pid, delta) {
  const [y, m] = currentPlanMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  currentPlanMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlanContent(p);
}
function planCalGoToday(pid) {
  const today = new Date();
  currentPlanMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlanContent(p);
}
function onPlanCalMonthChange(pid, month) {
  currentPlanMonth = month;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlanContent(p);
}

function renderPlanMonthGrid(p, year, month) {
  const grid = document.getElementById('plan-month-grid');
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
    sessions.forEach(sess => (sess.blocks || []).forEach(b => allBlocks.push(b)));
    const visible = allBlocks.slice(0, 3);

    html += `<div class="cc-day ${isOther ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
                  onclick="openPlanDay('${p.id}','${ds}')">
      <div class="cc-day-head">
        <span class="cc-day-num ${isToday ? 'today-badge' : ''}">${d.getDate()}</span>
        ${allBlocks.length ? `<span class="cc-day-total">${allBlocks.length}</span>` : ''}
      </div>
      <div class="cc-day-bars">
        ${visible.map(b => {
          const color = planBlockColor(b);
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

function planBlockColor(b) {
  const f = b.format || '';
  if (f === 'В группе') return WORK_TYPE_COLORS['В группе'];
  if (f === 'Индивидуальная с тренером') return WORK_TYPE_COLORS['Индивидуальная с тренером'];
  if (f === 'Самостоятельная') return WORK_TYPE_COLORS['Самостоятельная'];
  return '#5a6169';
}

function openPlanDay(pid, ds) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  const day = (p.calendar && p.calendar[ds]) || [];
  const sessions = Array.isArray(day) ? day : [];

  const blocks = [];
  sessions.forEach(sess => {
    (sess.blocks || []).forEach((b, bi) => {
      blocks.push({
        sessionId: sess.id,
        blockIndex: bi,
        sessionName: sess.name || '',
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

  const title = formatDateFull(ds);

  if (!blocks.length) {
    openModal(`<h3>${escapeHtml(title)}</h3>
      <p class="subtitle" style="text-align:center;padding:20px 0">На этот день блоков нет.</p>
      <div class="btn-row">
        <button class="btn-ghost btn" onclick="closeModal()">Закрыть</button>
      </div>`);
    return;
  }

  const totalMin = blocks.reduce((acc, b) => acc + b.duration, 0);
  const totalDone = blocks.filter(b => b.fact === 'done').length;
  const totalPartial = blocks.filter(b => b.fact === 'partial').length;
  const totalNot = blocks.filter(b => b.fact === 'notdone').length;

  const listHtml = blocks.map((b, idx) => {
    const color = planBlockColor(b);
    const end = minutesToTime(timeToMinutes(b.startTime) + b.duration);
    const factText = b.fact ? factLabel(b.fact) : '—';
    const factCls = factClass(b.fact);
    return `<div class="cc-sess-item" style="border-left-color:${color}">
      <div class="cc-sess-main" onclick="openPlanBlockDetails('${pid}','${ds}',${idx})">
        <div class="cc-sess-time">${escapeHtml(b.startTime)}–${end} · ${b.duration} мин</div>
        <div class="cc-sess-name">${escapeHtml(b.complex || 'Блок')}</div>
        <div class="cc-sess-meta">${escapeHtml(b.format || '—')}</div>
        <div class="cc-sess-meta" style="margin-top:4px">
          Факт: <span class="pcs-fact ${factCls}" style="display:inline-block;padding:1px 10px;font-size:11px">${escapeHtml(factText)}</span>
        </div>
        ${b.comment ? `<div class="cc-sess-note">Примечание: ${escapeHtml(b.comment)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  openModal(`<h3>${escapeHtml(title)}</h3>
    <div class="plan-day-summary">
      <span class="badge">Всего блоков: ${blocks.length}</span>
      <span class="badge">Объём: ${totalMin} мин</span>
      <span class="badge done">Выполнено: ${totalDone}</span>
      <span class="badge partial">Частично: ${totalPartial}</span>
      <span class="badge notdone">Не выполнено: ${totalNot}</span>
    </div>
    <div class="cc-day-list">${listHtml}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn-ghost btn" onclick="closeModal()">Закрыть</button>
    </div>`);
}

function openPlanBlockDetails(pid, ds, idxInDay) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  const day = (p.calendar && p.calendar[ds]) || [];
  const sessions = Array.isArray(day) ? day : [];

  const blocks = [];
  sessions.forEach(sess => {
    (sess.blocks || []).forEach((b, bi) => {
      blocks.push({ sessionId: sess.id, blockIndex: bi, b });
    });
  });

  const entry = blocks[idxInDay];
  if (!entry) return;
  const b = entry.b;

  const curFact = b.fact || '';
  const curComment = b.comment || '';
  const end = minutesToTime(timeToMinutes(b.startTime) + (Number(b.duration) || 0));

  openModal(`<h3>${escapeHtml(b.complex || 'Блок')}</h3>
    <p class="subtitle" style="margin-top:-8px">
      ${escapeHtml(formatDateFull(ds))} · ${escapeHtml(b.startTime || '')}–${end} · ${Number(b.duration) || 0} мин
    </p>

    <div class="plan-block-details">
      <div class="pbd-row"><div class="pbd-lbl">Комплекс</div><div class="pbd-val">${escapeHtml(b.complex || '—')}</div></div>
      <div class="pbd-row"><div class="pbd-lbl">Формат работы</div><div class="pbd-val">${escapeHtml(b.format || '—')}</div></div>
      <div class="pbd-row"><div class="pbd-lbl">План</div><div class="pbd-val">${escapeHtml(b.startTime || '')}–${end}</div></div>
      <div class="pbd-row"><div class="pbd-lbl">Объём</div><div class="pbd-val">${Number(b.duration) || 0} мин</div></div>
      ${b.note ? `<div class="pbd-row"><div class="pbd-lbl">Примечание к плану</div><div class="pbd-val">${escapeHtml(b.note)}</div></div>` : ''}
    </div>

    <div class="field" style="margin-top:16px"><label>Факт выполнения</label>
      <select id="fm-fact" onchange="onFactChange()">
        <option value="" ${curFact === '' ? 'selected' : ''}>— не отмечено —</option>
        <option value="done" ${curFact === 'done' ? 'selected' : ''}>Выполнено</option>
        <option value="partial" ${curFact === 'partial' ? 'selected' : ''}>Выполнено частично</option>
        <option value="notdone" ${curFact === 'notdone' ? 'selected' : ''}>Не выполнено</option>
      </select>
    </div>

    <div class="field" id="fm-comment-wrap" style="display:none">
      <label>Комментарий <span style="color:var(--ak-red)">*</span></label>
      <textarea id="fm-comment" rows="3" placeholder="Что именно не выполнено и почему">${escapeHtml(curComment)}</textarea>
    </div>

    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="savePlanFact('${pid}','${ds}',${idxInDay})">Сохранить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);

  setTimeout(onFactChange, 0);
}

function onFactChange() {
  const v = document.getElementById('fm-fact')?.value || '';
  const wrap = document.getElementById('fm-comment-wrap');
  if (!wrap) return;
  if (v === 'partial' || v === 'notdone') wrap.style.display = 'block';
  else wrap.style.display = 'none';
}

function savePlanFact(pid, ds, idxInDay) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  const day = (p.calendar && p.calendar[ds]) || [];
  const sessions = Array.isArray(day) ? day : [];
  const blocks = [];
  sessions.forEach(sess => {
    (sess.blocks || []).forEach((b, bi) => {
      blocks.push({ sessionId: sess.id, blockIndex: bi, b });
    });
  });

  const entry = blocks[idxInDay];
  if (!entry) { alert('Блок не найден'); return; }

  const fact = document.getElementById('fm-fact').value;
  const comment = (document.getElementById('fm-comment').value || '').trim();

  if ((fact === 'partial' || fact === 'notdone') && !comment) {
    alert('Для этого варианта обязательно укажите комментарий');
    return;
  }

  let saved = false;
  sessions.forEach(sess => {
    if (sess.id !== entry.sessionId) return;
    if (!Array.isArray(sess.blocks)) return;
    const b = sess.blocks[entry.blockIndex];
    if (!b) return;
    b.fact = fact;
    b.comment = comment;
    saved = true;
  });

  if (!saved) { alert('Не удалось сохранить'); return; }

  saveDB();
  closeModal();
  renderPlanContent(p);
}

function renderPlanSummaryBlock(stats) {
  return `
    <div class="plan-summary" style="margin-top:16px">
      <div class="plan-summary-item">
        <div class="lbl">Объём по плану</div>
        <div class="val">${stats.volume} <small>мин</small></div>
      </div>
      <div class="plan-summary-item">
        <div class="lbl">Выполнено</div>
        <div class="val" style="color:#1e7a3f">${stats.done}</div>
      </div>
      <div class="plan-summary-item">
        <div class="lbl">Частично</div>
        <div class="val" style="color:#b8860b">${stats.partial}</div>
      </div>
      <div class="plan-summary-item red">
        <div class="lbl">Не выполнено</div>
        <div class="val">${stats.notdone}</div>
      </div>
      <div class="plan-summary-item red">
        <div class="lbl">% выполнения</div>
        <div class="val">${stats.completion}%</div>
      </div>
    </div>`;
}

/* ============================================================
   ОТЧЁТ ПО ИГРОКАМ
   ============================================================ */
function collectAllPlanMonths() {
  const set = new Set();
  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      const day = p.calendar[date];
      if (Array.isArray(day) && day.length) set.add(date.slice(0, 7));
    });
  });
  return Array.from(set).sort();
}

function computePlayerMonthStats(p, month) {
  if (!p.calendar) return null;
  let total = 0, done = 0, partial = 0, notdone = 0, volume = 0;
  const items = [];
  Object.keys(p.calendar).forEach(date => {
    if (date.slice(0, 7) !== month) return;
    const day = p.calendar[date];
    if (!Array.isArray(day)) return;
    day.forEach(sess => {
      (sess.blocks || []).forEach(b => {
        total++;
        volume += Number(b.duration) || 0;
        if (b.fact === 'done') done++;
        else if (b.fact === 'partial') partial++;
        else if (b.fact === 'notdone') notdone++;
        items.push({
          date, complex: b.complex || '', format: b.format || '',
          startTime: b.startTime || '', duration: Number(b.duration) || 0,
          fact: b.fact || '', comment: b.comment || ''
        });
      });
    });
  });
  if (!total) return { total: 0, done: 0, partial: 0, notdone: 0, volume: 0, items, completion: 0 };
  const completion = Math.round((done + partial * 0.5) / total * 100);
  return { total, done, partial, notdone, volume, items, completion };
}

function computeAllPlayersMonthStats(month) {
  let total = 0, done = 0, partial = 0, notdone = 0;
  DB.players.forEach(p => {
    const st = computePlayerMonthStats(p, month);
    if (!st) return;
    total += st.total; done += st.done; partial += st.partial; notdone += st.notdone;
  });
  const overall = total ? Math.round((done + partial * 0.5) / total * 100) : 0;
  return { total, done, partial, notdone, overall };
}

function renderReport() {
  const months = collectAllPlanMonths();
  const monthSel = document.getElementById('report-month');
  const playerSel = document.getElementById('report-player-filter');
  if (!monthSel || !playerSel) return;

  if (!months.length) {
    document.getElementById('report-content').innerHTML = '<div class="empty-state"><div class="big">📄</div><p>Нет данных для отчёта.</p></div>';
    return;
  }

  const prevMonth = reportMonth;
  monthSel.innerHTML = months.map(m => `<option value="${m}">${monthLabelFromKey(m)}</option>`).join('');
  reportMonth = (prevMonth && months.includes(prevMonth)) ? prevMonth : months[months.length - 1];
  monthSel.value = reportMonth;

  const prevPlayer = playerSel.value;
  playerSel.innerHTML = '<option value="">Все игроки</option>' +
    DB.players.map(p => `<option value="${p.id}">${escapeHtml(p.fio)}</option>`).join('');
  if (prevPlayer) playerSel.value = prevPlayer;

  const filterPid = playerSel.value;
  const month = reportMonth;
  const allStats = computeAllPlayersMonthStats(month);

  let html = `
    <div class="card">
      <h2>Сводка по месяцу «${escapeHtml(monthLabelFromKey(month))}»</h2>
      <div class="dash-grid">
        <div class="kpi"><div class="lbl">Всего блоков</div><div class="val">${allStats.total}</div></div>
        <div class="kpi"><div class="lbl">Выполнено</div><div class="val" style="color:#1e7a3f">${allStats.done}</div></div>
        <div class="kpi"><div class="lbl">Частично</div><div class="val" style="color:#b8860b">${allStats.partial}</div></div>
        <div class="kpi red"><div class="lbl">Не выполнено</div><div class="val">${allStats.notdone}</div></div>
        <div class="kpi red"><div class="lbl">Общий % выполнения</div><div class="val">${allStats.overall}%</div></div>
      </div>
    </div>`;

  const players = filterPid ? DB.players.filter(p => p.id === filterPid) : DB.players;

  players.forEach(p => {
    const st = computePlayerMonthStats(p, month);
    if (!st || !st.total) return;

    const rows = st.items.map(it => {
      const factCls = it.fact === 'done' ? 'fact-done'
                   : it.fact === 'partial' ? 'fact-partial'
                   : it.fact === 'notdone' ? 'fact-notdone'
                   : '';
      return `<tr class="${factCls}">
        <td>${formatDate(it.date)}</td>
        <td>${escapeHtml(it.complex || '')}</td>
        <td>${escapeHtml(it.format || '')}</td>
        <td>${it.duration}</td>
        <td>${factLabel(it.fact)}</td>
        <td>${escapeHtml(it.comment || '')}</td>
      </tr>`;
    }).join('');

    html += `
      <div class="report-player">
        <h3>${escapeHtml(p.fio)}</h3>
        <div class="meta">${escapeHtml(p.team || '')} · ${escapeHtml(p.position || '')}</div>
        <div class="report-summary">
          <span class="badge done">Выполнено: ${st.done}</span>
          <span class="badge partial">Частично: ${st.partial}</span>
          <span class="badge notdone">Не выполнено: ${st.notdone}</span>
          <span class="badge">Всего: ${st.total}</span>
          <span class="badge">Объём: ${st.volume} мин</span>
        </div>
        <div class="report-progress"><span style="width:${st.completion}%"></span></div>
        <div style="font-size:12px;font-weight:700;color:var(--ak-green);margin-bottom:10px">Выполнение: ${st.completion}%</div>
        <table class="report-table">
          <thead><tr><th>Дата</th><th>Комплекс</th><th>Формат</th><th>Мин</th><th>Факт</th><th>Примечание</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  });

  document.getElementById('report-content').innerHTML = html;
}

async function exportReportToPDF() {
  const content = document.getElementById('report-content');
  if (!content || !content.innerHTML.trim()) {
    alert('Нет данных для экспорта');
    return;
  }
  await exportElementToPDF(content, `Отчёт_${reportMonth || 'месяц'}.pdf`, {
    orientation: 'p',
    hideSelectors: ['.no-print']
  });
}