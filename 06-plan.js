/* ============================================================
   06-plan.js
   План / факт — формируется АВТОМАТИЧЕСКИ из календаря тренера.
   Группировка по формам работы, авто-объём из времени с/до.
   Факт и примечание редактируются вручную.
   Загружается после 05-player.js.
   ============================================================ */

/* ===== Контейнер вкладки ===== */
function renderPlan(p) {
  return `<div class="card">
    <h2>План / факт</h2>
    <p class="subtitle" style="margin-top:-8px">
      Формируется автоматически из «Календаря тренера». Здесь можно отметить факт выполнения и добавить примечание.
    </p>
    <div id="plan-content"></div>
  </div>`;
}

/* ===== Содержимое ===== */
function renderPlanContent(p) {
  const el = document.getElementById('plan-content');
  if (!el) return;

  const months = collectPlayerPlanMonths(p);
  if (!months.length) {
    el.innerHTML = `<p class="subtitle">В календаре тренера ещё нет тренировок для этого игрока.</p>
      <button class="btn" onclick="showScreen('coach-calendar')">📅 Перейти в календарь тренера</button>`;
    return;
  }

  if (!currentPlanMonth || !months.includes(currentPlanMonth)) {
    currentPlanMonth = months[months.length - 1];
  }

  const month = currentPlanMonth;
  const summary = computePlanSummary(p, month);

  el.innerHTML = `
    <div class="plan-controls no-print">
      <label>Месяц:</label>
      <select id="plan-month-select" onchange="onPlanMonthChange('${p.id}', this.value)">
        ${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthLabelFromKey(m)}</option>`).join('')}
      </select>
    </div>
    ${renderPlanSummaryBlock(summary)}
    ${renderPlanTable(p, month, summary)}
  `;
}

/* ===== Месяцы, где есть тренировки у игрока ===== */
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

/* ===== Сводка по формам работы ===== */
function computePlanSummary(p, month) {
  const summary = {
    'Самостоятельная':           { count: 0, minutes: 0 },
    'Индивидуальная с тренером': { count: 0, minutes: 0 },
    'В группе':                  { count: 0, minutes: 0 },
    '_total':                    { count: 0, minutes: 0 }
  };
  const items = [];

  if (!p.calendar) return { summary, items, month };

  Object.keys(p.calendar).forEach(date => {
    if (date.slice(0, 7) !== month) return;
    const day = p.calendar[date];
    if (!Array.isArray(day)) return;

    day.forEach(sess => {
      if (!sess) return;
      const dur = computeSessionDuration(sess);
      const wt = Array.isArray(sess.workTypes) ? sess.workTypes : [];
      const factVal = sess.fact || '';
      const note = sess.note || '';

      items.push({
        date,
        timeStart: sess.timeStart || '',
        timeEnd: sess.timeEnd || '',
        duration: dur,
        name: sess.name || sess.block || '',
        block: sess.block || '',
        workTypes: wt,
        fact: factVal,
        note
      });

      summary._total.count++;
      summary._total.minutes += dur;

      if (!wt.length) {
        // без формы — учтём только в общей сумме
      } else {
        wt.forEach(w => {
          if (summary[w]) {
            summary[w].count++;
            summary[w].minutes += dur;
          }
        });
      }
    });
  });

  items.sort((a, b) => (a.date + a.timeStart).localeCompare(b.date + b.timeStart));
  return { summary, items, month };
}

function computeSessionDuration(sess) {
  if (!sess) return 0;
  const t1 = timeToMinutes(sess.timeStart);
  const t2 = timeToMinutes(sess.timeEnd);
  return Math.max(0, t2 - t1);
}

/* ===== Блок сводки ===== */
function renderPlanSummaryBlock(summary) {
  const card = (label, obj, red) => `
    <div class="plan-summary-item ${red ? 'red' : ''}">
      <div class="lbl">${escapeHtml(label)}</div>
      <div class="val">${obj.count} <small>трен. · ${obj.minutes} мин</small></div>
    </div>`;

  return `
    <div class="plan-summary">
      ${card('Самостоятельная',           summary['Самостоятельная'])}
      ${card('Индивидуальная с тренером', summary['Индивидуальная с тренером'], true)}
      ${card('В группе',                  summary['В группе'])}
      ${card('Всего',                     summary._total, true)}
    </div>`;
}

/* ===== Таблица плана ===== */
function renderPlanTable(p, month, summary) {
  if (!summary.items.length) {
    return `<p class="subtitle">За этот месяц нет тренировок.</p>`;
  }

  const rows = summary.items.map((it, idx) => {
    const factVal = it.fact || '';
    const factCls = factClass(factVal);
    const wtStr = it.workTypes.length ? it.workTypes.join(', ') : '—';

    return `<tr>
      <td>${formatDate(it.date)}</td>
      <td>${escapeHtml(it.timeStart)}–${escapeHtml(it.timeEnd)}</td>
      <td>${escapeHtml(it.name || it.block || '')}</td>
      <td>${escapeHtml(wtStr)}</td>
      <td>${it.duration}</td>
      <td>
        <select class="fact-select ${factCls}" onchange="updateSessionFact('${p.id}','${it.date}','${idx}', this.value)">
          ${FACT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === factVal ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select>
      </td>
      <td>
        <textarea class="cell" rows="1" onchange="updateSessionNote('${p.id}','${it.date}','${idx}', this.value)">${escapeHtml(it.note || '')}</textarea>
      </td>
    </tr>`;
  }).join('');

  return `
    <div style="overflow-x:auto;margin-top:16px">
      <table class="plan-table">
        <colgroup>
          <col style="width:90px">
          <col style="width:120px">
          <col>
          <col style="width:180px">
          <col style="width:70px">
          <col style="width:160px">
          <col>
        </colgroup>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Время</th>
            <th>Тренировка</th>
            <th>Форма работы</th>
            <th>Мин</th>
            <th>Факт</th>
            <th>Примечание</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ===== Редактирование факта и примечания ===== */
function updateSessionFact(pid, date, idx, value) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.calendar[date]) return;
  const day = p.calendar[date];
  if (!Array.isArray(day)) return;

  // idx — индекс в отфильтрованном списке summary.items, но нам нужен исходный объект
  // Проще: пересобрать через summary и сопоставить по времени/названию
  const summary = computePlanSummary(p, currentPlanMonth);
  const target = summary.items[idx];
  if (!target) return;

  const src = day.find(s =>
    (s.timeStart || '') === target.timeStart &&
    (s.name || s.block || '') === (target.name || target.block || '')
  );
  if (!src) return;
  src.fact = value;
  saveDB();

  const sel = document.querySelector(`select.fact-select[onchange*="updateSessionFact('${pid}','${date}',${idx}'"]`);
  if (sel) {
    sel.classList.remove('done', 'partial', 'notdone');
    const cls = factClass(value);
    if (cls) sel.classList.add(cls);
  }
}

function updateSessionNote(pid, date, idx, value) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.calendar[date]) return;
  const day = p.calendar[date];
  if (!Array.isArray(day)) return;

  const summary = computePlanSummary(p, currentPlanMonth);
  const target = summary.items[idx];
  if (!target) return;

  const src = day.find(s =>
    (s.timeStart || '') === target.timeStart &&
    (s.name || s.block || '') === (target.name || target.block || '')
  );
  if (!src) return;
  src.note = value;
  saveDB();
}

function onPlanMonthChange(pid, month) {
  currentPlanMonth = month;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlanContent(p);
}

/* ============================================================
   ОТЧЁТ ПО МЕСЯЦУ (по игрокам)
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
  const sum = computePlanSummary(p, month);
  const items = sum.items;
  if (!items.length) return null;

  let done = 0, partial = 0, notdone = 0, volumePlan = 0;
  items.forEach(it => {
    volumePlan += it.duration;
    if (it.fact === 'done') done++;
    else if (it.fact === 'partial') partial++;
    else if (it.fact === 'notdone') notdone++;
  });

  const total = items.length;
  const completion = total ? Math.round((done + partial * 0.5) / total * 100) : 0;
  return { total, done, partial, notdone, volumePlan, items, completion };
}

function computeAllPlayersMonthStats(month) {
  let total = 0, done = 0, partial = 0, notdone = 0;
  DB.players.forEach(p => {
    const st = computePlayerMonthStats(p, month);
    if (!st) return;
    total += st.total;
    done += st.done;
    partial += st.partial;
    notdone += st.notdone;
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
    document.getElementById('report-content').innerHTML = '<div class="empty-state"><div class="big">📄</div><p>Нет тренировок для отчёта.</p></div>';
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
        <div class="kpi"><div class="lbl">Всего тренировок</div><div class="val">${allStats.total}</div></div>
        <div class="kpi"><div class="lbl">Выполнено</div><div class="val" style="color:#1e7a3f">${allStats.done}</div></div>
        <div class="kpi"><div class="lbl">Частично</div><div class="val" style="color:#b8860b">${allStats.partial}</div></div>
        <div class="kpi red"><div class="lbl">Не выполнено</div><div class="val">${allStats.notdone}</div></div>
        <div class="kpi red"><div class="lbl">Общий % выполнения</div><div class="val">${allStats.overall}%</div></div>
      </div>
    </div>`;

  const players = filterPid ? DB.players.filter(p => p.id === filterPid) : DB.players;
  const anyData = players.some(p => p.calendar && Object.keys(p.calendar).some(d => d.slice(0, 7) === month && Array.isArray(p.calendar[d]) && p.calendar[d].length));

  if (!anyData) {
    html += '<div class="empty-state"><div class="big">📄</div><p>У выбранных игроков нет тренировок за этот месяц.</p></div>';
  } else {
    players.forEach(p => {
      const st = computePlayerMonthStats(p, month);
      if (!st) return;

      const rows = st.items.map(it => {
        const factCls = it.fact === 'done' ? 'fact-done'
                     : it.fact === 'partial' ? 'fact-partial'
                     : it.fact === 'notdone' ? 'fact-notdone'
                     : '';
        return `<tr class="${factCls}">
          <td>${formatDate(it.date)}</td>
          <td>${escapeHtml(it.timeStart)}–${escapeHtml(it.timeEnd)}</td>
          <td>${escapeHtml(it.name || it.block || '')}</td>
          <td>${escapeHtml(it.workTypes.join(', '))}</td>
          <td>${it.duration}</td>
          <td>${factLabel(it.fact)}</td>
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
            <span class="badge">Объём: ${st.volumePlan} мин</span>
          </div>
          <div class="report-progress"><span style="width:${st.completion}%"></span></div>
          <div style="font-size:12px;font-weight:700;color:var(--ak-green);margin-bottom:10px">Выполнение: ${st.completion}%</div>
          ${st.items.length ? `<table class="report-table">
            <thead><tr><th>Дата</th><th>Время</th><th>Тренировка</th><th>Форма работы</th><th>Мин</th><th>Факт</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : ''}
        </div>`;
    });
  }
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