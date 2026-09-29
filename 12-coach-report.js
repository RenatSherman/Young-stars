/* ============================================================
   12-coach-report.js
   Отчёт тренера: KPI, графики, тепловая карта, экспорт в PDF.
   Загружается после 11-dashboard-calendar.js.
   ============================================================ */

let coachReportMonth = null;

/* ===== Утилиты ===== */
function collectReportMonths() {
  const set = new Set();
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), 1);
  for (let i = -2; i <= 1; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => set.add(date.slice(0, 7)));
  });
  return Array.from(set).sort();
}

function getMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return `${months[m - 1]} ${y}`;
}

/* ===== Расчёт статистики за месяц ===== */
function computeCoachReportStats(month) {
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // Все сессии за месяц: собираем по groupId, чтобы не считать дубли
  const sessions = new Map(); // groupId (или solo_pid_date_time) -> { ... }
  const byDate = {};          // 'YYYY-MM-DD' -> count
  const byHour = {};          // 'HH' -> count
  const byDow  = [0,0,0,0,0,0,0]; // Пн..Вс
  const byWorkType = { 'Самостоятельная': 0, 'Индивидуальная с тренером': 0, 'В группе': 0, '—': 0 };
  const byPlayer = {};        // pid -> { fio, total:0, solo:0, ind:0, grp:0, minutes:0 }

  DB.players.forEach(p => {
    if (!p.calendar) return;
    if (!byPlayer[p.id]) byPlayer[p.id] = { fio: p.fio, total: 0, solo: 0, ind: 0, grp: 0 };

    Object.keys(p.calendar).forEach(date => {
      if (date.slice(0, 7) !== month) return;
      Object.keys(p.calendar[date]).forEach(time => {
        const c = p.calendar[date][time];
        if (!c.ex && !c.note) return;

        const gid = c.groupId || ('solo_' + p.id + '_' + date + '_' + time);
        if (!sessions.has(gid)) {
          sessions.set(gid, { date, time, ex: c.ex, wt: new Set(c.wt || []) });
          // глобальные счётчики — считаем один раз на сессию
          byDate[date] = (byDate[date] || 0) + 1;
          const hh = time.slice(0, 2);
          byHour[hh] = (byHour[hh] || 0) + 1;
          const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7; // Пн=0
          byDow[dow]++;

          const wtKeys = (c.wt || []);
          if (!wtKeys.length) byWorkType['—']++;
          else wtKeys.forEach(k => {
            if (byWorkType[k] !== undefined) byWorkType[k]++;
          });
        }

        // Личные счётчики игрока — по каждой записи
        byPlayer[p.id].total++;
        const wt = c.wt || [];
        if (wt.includes('Самостоятельная'))            byPlayer[p.id].solo++;
        if (wt.includes('Индивидуальная с тренером'))  byPlayer[p.id].ind++;
        if (wt.includes('В группе'))                   byPlayer[p.id].grp++;
      });
    });
  });

  const totalSessions = sessions.size;
  const totalPlayerSessions = Object.values(byPlayer).reduce((a, b) => a + b.total, 0);

  return {
    totalSessions,
    totalPlayerSessions,
    byDate,
    byHour,
    byDow,
    byWorkType,
    byPlayer,
    daysInMonth,
    year, monthNum
  };
}

/* ===== Рендер экрана отчёта ===== */
function renderCoachReport() {
  const el = document.getElementById('coach-report-content');
  if (!el) return;

  const months = collectReportMonths();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  if (!coachReportMonth || !months.includes(coachReportMonth)) {
    coachReportMonth = months.includes(currentMonth) ? currentMonth : months[months.length - 1];
  }

  el.innerHTML = `
    <div class="cr-toolbar no-print">
      <label>Месяц:</label>
      <select id="cr-month" onchange="onCoachReportMonthChange(this.value)">
        ${months.map(m => `<option value="${m}" ${m === coachReportMonth ? 'selected' : ''}>${getMonthLabel(m)}</option>`).join('')}
      </select>
      <button class="btn btn-red" onclick="exportCoachReportToPDF()">📄 Экспорт в PDF</button>
    </div>
    <div id="cr-body"></div>
  `;

  renderCoachReportBody();
}

function onCoachReportMonthChange(m) {
  coachReportMonth = m;
  renderCoachReportBody();
}

function renderCoachReportBody() {
  const body = document.getElementById('cr-body');
  if (!body) return;

  const stats = computeCoachReportStats(coachReportMonth);
  const monthLabel = getMonthLabel(coachReportMonth);

  // KPI
  const kpiHtml = `
    <div class="dash-grid">
      <div class="kpi"><div class="lbl">Всего тренировок</div><div class="val">${stats.totalSessions}</div><div class="sub">за ${monthLabel.toLowerCase()}</div></div>
      <div class="kpi red"><div class="lbl">Всего посещений</div><div class="val">${stats.totalPlayerSessions}</div><div class="sub">игрок × тренировка</div></div>
      <div class="kpi"><div class="lbl">Индивидуальных</div><div class="val">${stats.byWorkType['Индивидуальная с тренером'] || 0}</div><div class="sub">с тренером</div></div>
      <div class="kpi red"><div class="lbl">Групповых</div><div class="val">${stats.byWorkType['В группе'] || 0}</div><div class="sub">в группе</div></div>
      <div class="kpi"><div class="lbl">Самостоятельных</div><div class="val">${stats.byWorkType['Самостоятельная'] || 0}</div><div class="sub">без тренера</div></div>
      <div class="kpi red"><div class="lbl">Среднее в день</div><div class="val">${(stats.totalSessions / stats.daysInMonth).toFixed(1)}</div><div class="sub">тренировок в день</div></div>
    </div>
  `;

  // Тепловая карта: часы (строки) × дни недели (столбцы)
  const heatHtml = renderCoachHeatmap(stats);

  // Графики
  const chartsHtml = `
    <div class="cr-charts">
      <div class="cr-chart-card">
        <h3>Тренировки по дням месяца</h3>
        <div class="cr-chart-box"><canvas id="cr-chart-days"></canvas></div>
      </div>
      <div class="cr-chart-card">
        <h3>Распределение по формам работы</h3>
        <div class="cr-chart-box"><canvas id="cr-chart-wt"></canvas></div>
      </div>
      <div class="cr-chart-card">
        <h3>Нагрузка по дням недели</h3>
        <div class="cr-chart-box"><canvas id="cr-chart-dow"></canvas></div>
      </div>
      <div class="cr-chart-card">
        <h3>Распределение по часам суток</h3>
        <div class="cr-chart-box"><canvas id="cr-chart-hours"></canvas></div>
      </div>
    </div>
  `;

  // Таблица по игрокам
  const playersArr = Object.entries(stats.byPlayer)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.total - a.total);

  const playersTableHtml = playersArr.length
    ? `<div class="card" style="margin-top:20px">
        <h2>Активность по игрокам</h2>
        <div style="overflow-x:auto">
          <table class="cr-player-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Всего</th>
                <th>Индивидуально</th>
                <th>В группе</th>
                <th>Самостоятельно</th>
              </tr>
            </thead>
            <tbody>
              ${playersArr.map((p, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${escapeHtml(p.fio || '')}</strong></td>
                  <td><strong>${p.total}</strong></td>
                  <td>${p.ind}</td>
                  <td>${p.grp}</td>
                  <td>${p.solo}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`
    : '';

  body.innerHTML = kpiHtml + heatHtml + chartsHtml + playersTableHtml;

  // Рисуем графики
  drawCoachCharts(stats);
}

/* ===== Тепловая карта ===== */
function renderCoachHeatmap(stats) {
  const dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const hours = [];
  for (let h = 6; h <= 21; h++) hours.push(String(h).padStart(2, '0'));

  // Матрица: heat[dow][hour]
  const heat = Array.from({ length: 7 }, () => ({}));
  Object.entries(stats.byDate).forEach(([date, count]) => {
    const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7;
    // Найдём час для этой даты: суммируем по часам
    // (по факту в byDate только общее количество за день, поэтому распределим по byHour не совсем точно.
    //  Сделаем точнее: пробежимся по всем игрокам ещё раз — быстро)
    // Для простоты используем все часы, где есть записи в этот день.
    DB.players.forEach(p => {
      if (!p.calendar || !p.calendar[date]) return;
      Object.keys(p.calendar[date]).forEach(t => {
        const c = p.calendar[date][t];
        if (!c.ex && !c.note) return;
        const hh = t.slice(0, 2);
        heat[dow][hh] = (heat[dow][hh] || 0) + 1;
      });
    });
  });

  let max = 1;
  heat.forEach(row => Object.values(row).forEach(v => { if (v > max) max = v; }));

  const colorFor = v => {
    if (!v) return '#e6e8ea';
    const t = Math.min(1, v / max);
    // градиент от светло-зелёного к насыщенно-красному
    const r = Math.round(30 + t * 170);
    const g = Math.round(120 - t * 60);
    const b = Math.round(70 - t * 40);
    return `rgb(${r},${g},${b})`;
  };

  let html = '<div class="card"><h2>Тепловая карта нагрузки</h2>';
  html += '<div class="cr-heatmap">';

  html += '<div class="cr-heat-head"></div>';
  dayNames.forEach(d => { html += `<div class="cr-heat-head">${d}</div>`; });

  hours.forEach(h => {
    html += `<div class="cr-heat-time">${h}:00</div>`;
    for (let d = 0; d < 7; d++) {
      const v = heat[d][h] || 0;
      const color = colorFor(v);
      const fg = v ? '#fff' : 'transparent';
      html += `<div class="cr-heat-cell" style="background:${color};color:${fg}" title="${dayNames[d]} ${h}:00 — ${v}">${v || ''}</div>`;
    }
  });

  html += '</div></div>';
  return html;
}

/* ===== Графики ===== */
function drawCoachCharts(stats) {
  const { year, monthNum, daysInMonth } = stats;

  /* 1. Тренировки по дням месяца */
  const labels1 = [];
  const data1 = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    labels1.push(String(d));
    data1.push(stats.byDate[ds] || 0);
  }

  const ctx1 = document.getElementById('cr-chart-days');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'bar',
      data: { labels: labels1, datasets: [{
        label: 'Тренировок',
        data: data1,
        backgroundColor: '#154734',
        borderColor: '#154734',
        borderWidth: 1
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#5a6169' }, grid: { color: '#e8eaec' } },
          x: { ticks: { color: '#5a6169', autoSkip: true, maxRotation: 0 }, grid: { display: false } }
        }
      }
    });
  }

  /* 2. Формы работы — круговая */
  const wtLabels = [];
  const wtData = [];
  Object.entries(stats.byWorkType).forEach(([k, v]) => {
    if (v > 0 && k !== '—') {
      wtLabels.push(k);
      wtData.push(v);
    }
  });
  // Если есть «без формы работы» — тоже покажем
  if (stats.byWorkType['—'] > 0) {
    wtLabels.push('Без формы');
    wtData.push(stats.byWorkType['—']);
  }

  const ctx2 = document.getElementById('cr-chart-wt');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: wtLabels.length ? wtLabels : ['Нет данных'],
        datasets: [{
          data: wtData.length ? wtData : [1],
          backgroundColor: ['#f59e0b', '#C8102E', '#4f46e5', '#5a6169'],
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12 } }
        }
      }
    });
  }

  /* 3. Нагрузка по дням недели — линейный/radar */
  const dowLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const ctx3 = document.getElementById('cr-chart-dow');
  if (ctx3) {
    new Chart(ctx3, {
      type: 'bar',
      data: { labels: dowLabels, datasets: [{
        label: 'Тренировок',
        data: stats.byDow,
        backgroundColor: ['#154734','#1e5a44','#C8102E','#9a0c23','#5a6169','#f59e0b','#f59e0b'],
        borderColor: '#154734',
        borderWidth: 1
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#5a6169' }, grid: { color: '#e8eaec' } },
          x: { ticks: { color: '#5a6169' }, grid: { display: false } }
        }
      }
    });
  }

  /* 4. Распределение по часам — горизонтальная */
  const hours = [];
  for (let h = 6; h <= 21; h++) hours.push(String(h).padStart(2, '0'));
  const hourData = hours.map(h => stats.byHour[h] || 0);

  const ctx4 = document.getElementById('cr-chart-hours');
  if (ctx4) {
    new Chart(ctx4, {
      type: 'bar',
      data: { labels: hours.map(h => h + ':00'), datasets: [{
        label: 'Тренировок',
        data: hourData,
        backgroundColor: '#C8102E',
        borderColor: '#C8102E',
        borderWidth: 1
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#5a6169' }, grid: { color: '#e8eaec' } },
          x: { ticks: { color: '#5a6169', autoSkip: true, maxRotation: 45 }, grid: { display: false } }
        }
      }
    });
  }
}

/* ===== Экспорт отчёта в PDF ===== */
async function exportCoachReportToPDF() {
  const body = document.getElementById('cr-body');
  if (!body || !body.innerHTML.trim()) {
    alert('Нет данных для экспорта');
    return;
  }

  // Даём графикам дорисоваться (если не успели)
  await new Promise(r => setTimeout(r, 200));

  // Клонируем содержимое, чтобы убрать кнопки и снимок canvas
  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = `
    <div style="border-top:6px solid #C8102E;padding-top:10px;margin-bottom:14px">
      <div style="font-size:18px;font-weight:900;color:#154734;letter-spacing:1px;text-transform:uppercase">
        АК БАРС · Отчёт тренера
      </div>
      <div style="font-size:11px;color:#5a6169;margin-top:4px">
        Месяц: ${getMonthLabel(coachReportMonth)} · Сформировано: ${new Date().toLocaleString('ru-RU')}
      </div>
    </div>
    <div id="cr-print-body"></div>
  `;

  // Переносим HTML-содержимое без canvas — вместо них вставим картинки
  const printBody = stage.querySelector('#cr-print-body');
  printBody.innerHTML = body.innerHTML;

  // Заменяем канвасы на <img>
  const srcCanvases = body.querySelectorAll('canvas');
  const dstCanvases = printBody.querySelectorAll('canvas');
  srcCanvases.forEach((src, i) => {
    const dst = dstCanvases[i];
    if (!dst || !dst.parentElement) return;
    try {
      const img = document.createElement('img');
      img.src = src.toDataURL('image/png');
      img.style.width = '100%';
      img.style.maxWidth = '520px';
      img.style.display = 'block';
      img.style.margin = '0 auto';
      dst.parentElement.replaceChild(img, dst);
    } catch (e) { /* ignore */ }
  });

  try {
    await exportElementToPDF(stage, `Отчёт_тренера_${coachReportMonth}.pdf`, { orientation: 'p' });
  } finally {
    stage.innerHTML = '';
  }
}