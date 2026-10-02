/* ============================================================
   06b-report.js
   Отчёт по итогам месяца (экран «Отчёт по игрокам»).
   Считает по блокам календаря игрока.
   Загружается после 06-plan.js.
   ============================================================ */

/* ---------- Сбор доступных месяцев ---------- */

function collectAllPlanMonths() {
  const set = new Set();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      const day = p.calendar[date];
      if (Array.isArray(day) && day.length) set.add(date.slice(0, 7));
    });
  });

  // Всегда добавляем текущий месяц, даже если тренировок нет
  set.add(currentMonth);

  return Array.from(set).sort();
}

/* ---------- Подсчёт по игроку за месяц ---------- */

function computePlayerMonthStats(p, month) {
  if (!p || !p.calendar) {
    return { total: 0, done: 0, partial: 0, notdone: 0, volume: 0, items: [], completion: 0 };
  }
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
          date,
          complex: b.complex || '',
          format: b.format || '',
          startTime: b.startTime || '',
          duration: Number(b.duration) || 0,
          fact: b.fact || '',
          comment: b.comment || ''
        });
      });
    });
  });

  const completion = total ? Math.round((done + partial * 0.5) / total * 100) : 0;
  return { total, done, partial, notdone, volume, items, completion };
}

function computeAllPlayersMonthStats(month) {
  let total = 0, done = 0, partial = 0, notdone = 0;
  DB.players.forEach(p => {
    const st = computePlayerMonthStats(p, month);
    total += st.total;
    done += st.done;
    partial += st.partial;
    notdone += st.notdone;
  });
  const overall = total ? Math.round((done + partial * 0.5) / total * 100) : 0;
  return { total, done, partial, notdone, overall };
}

/* ---------- Главный рендер экрана ---------- */

function renderReport() {
  const monthSel = document.getElementById('report-month');
  const playerSel = document.getElementById('report-player-filter');
  const content = document.getElementById('report-content');
  if (!content) return;

  const months = collectAllPlanMonths();

  // Селект месяца
  if (monthSel) {
    const prev = monthSel.value || reportMonth;
    monthSel.innerHTML = months.map(m => `<option value="${m}">${monthLabelFromKey(m)}</option>`).join('');
    reportMonth = (prev && months.includes(prev)) ? prev : months[months.length - 1];
    monthSel.value = reportMonth;
  } else {
    // Если вдруг селекта нет — берём последний месяц
    if (!reportMonth) reportMonth = months[months.length - 1];
  }

  // Селект игрока
  if (playerSel) {
    const prevPlayer = playerSel.value;
    playerSel.innerHTML = '<option value="">Все игроки</option>' +
      DB.players.map(p => `<option value="${p.id}">${escapeHtml(p.fio)}</option>`).join('');
    if (prevPlayer && DB.players.some(p => p.id === prevPlayer)) playerSel.value = prevPlayer;
  }

  const month = reportMonth;
  const filterPid = playerSel ? playerSel.value : '';
  const allStats = computeAllPlayersMonthStats(month);

  // KPI-сводка
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

  // Карточки по игрокам
  const players = filterPid ? DB.players.filter(p => p.id === filterPid) : DB.players;
  let renderedPlayers = 0;

  players.forEach(p => {
    const st = computePlayerMonthStats(p, month);
    if (!st || !st.total) return; // пропускаем игроков без данных в этом месяце
    renderedPlayers++;

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

  // Если ни у кого нет данных за этот месяц — показываем осмысленную заглушку
  if (renderedPlayers === 0) {
    html += `
      <div class="card">
        <div class="empty-state">
          <div class="big">📄</div>
          <p>За «${escapeHtml(monthLabelFromKey(month))}» тренировок нет.<br>
          Назначьте их в «Календаре тренера» — отчёт появится автоматически.</p>
        </div>
      </div>`;
  }

  content.innerHTML = html;
}

/* ---------- Экспорт в PDF ---------- */

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

/* ---------- Хелпер: метка месяца по ключу YYYY-MM ---------- */

function monthLabelFromKey(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_RU[m - 1]} ${y}`;
}