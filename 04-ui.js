/* ============================================================
   04-ui.js
   Навигация, уведомления, рендер игроков, дашборд, сравнение.
   Загружается после 03-sync.js.
   ============================================================ */

/* ===== Навигация ===== */
function goHome() {
  currentPlayerId = null;
  currentTab = 'tech';
  showScreen('players');
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');

  document.querySelectorAll('nav button').forEach(b => {
    if (b.dataset.screen) b.classList.toggle('active', b.dataset.screen === name);
  });

  if (name === 'players')    renderPlayers();
  if (name === 'exercises')  renderExercises();
  if (name === 'dashboard')  renderDashboard();
  if (name === 'compare')    renderCompare();
  if (name === 'report')     renderReport();

  document.getElementById('notif-panel').classList.remove('active');
  window.scrollTo(0, 0);
}

/* Навешивание обработчиков на кнопки меню */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav button').forEach(btn => {
    if (btn.dataset.screen) {
      btn.addEventListener('click', () => showScreen(btn.dataset.screen));
    }
  });
});

/* ===== Миграция старого формата календаря (по неделям → по датам) ===== */
function migrateCalendar(p) {
  if (!p.calendar) { p.calendar = {}; return; }
  const newCal = {};
  let needSave = false;

  Object.keys(p.calendar).forEach(k => {
    if (/^\d{4}-W\d+$/.test(k)) {
      const weekObj = p.calendar[k];
      Object.keys(weekObj).forEach(date => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          if (!newCal[date]) newCal[date] = {};
          Object.assign(newCal[date], weekObj[date]);
        }
      });
      needSave = true;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
      newCal[k] = p.calendar[k];
    }
  });

  p.calendar = newCal;
  if (needSave) saveDB();
}

/* ===== Уведомления ===== */
function collectNotifications() {
  const today = localDateStr(new Date());
  const weekAhead = localDateStr(new Date(Date.now() + 7 * 86400000));
  const items = [];

  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      Object.keys(p.calendar[date]).forEach(time => {
        const c = p.calendar[date][time];
        if (!c.ex && !c.note) return;

        if (date < today) {
          items.push({ type: 'overdue', date, time, ex: c.ex, note: c.note, who: p.fio, pid: p.id, label: 'Просрочено' });
        } else if (date === today) {
          items.push({ type: 'today', date, time, ex: c.ex, note: c.note, who: p.fio, pid: p.id, label: 'Сегодня' });
        } else if (date <= weekAhead) {
          items.push({ type: 'soon', date, time, ex: c.ex, note: c.note, who: p.fio, pid: p.id, label: 'Скоро' });
        }
      });
    });
  });

  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return items;
}

function updateNotifBadge() {
  const items = collectNotifications();
  const urgent = items.filter(i => i.type === 'overdue' || i.type === 'today').length;
  const badge = document.getElementById('notif-badge');
  if (urgent > 0) {
    badge.textContent = urgent;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotif(e) {
  e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  const items = collectNotifications();

  if (panel.classList.contains('active')) {
    panel.classList.remove('active');
    return;
  }

  if (!items.length) {
    panel.innerHTML = '<p class="subtitle" style="text-align:center;padding:20px 0">Нет уведомлений</p>';
  } else {
    panel.innerHTML = `<h3 style="margin-bottom:12px">Уведомления (${items.length})</h3>` +
      items.map(i => `<div class="notif-item ${i.type}" onclick="openPlayer('${i.pid}');toggleNotif(event)">
        <div class="n-title">${i.label} · ${escapeHtml(i.ex || '')}</div>
        <div class="n-meta">${formatDate(i.date)} ${i.time} · ${escapeHtml(i.who.split(' ')[0])}${i.note ? ' · ' + escapeHtml(i.note) : ''}</div>
      </div>`).join('');
  }
  panel.classList.add('active');
}

/* Закрытие панели уведомлений по клику вне */
document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  if (!panel.contains(e.target) && !e.target.closest('.notif-btn')) {
    panel.classList.remove('active');
  }
});

/* ===== Список игроков ===== */
function renderPlayers() {
  const el = document.getElementById('players-list');
  if (!DB.players.length) {
    el.innerHTML = '<div class="empty-state"><div class="big">🐯</div><p>Пока нет игроков.<br>Нажмите «Добавить игрока» или загрузите из Excel.</p></div>';
    return;
  }

  el.innerHTML = DB.players.map(p => {
    const avatarContent = p.photo
      ? `<img src="${p.photo}" alt="${escapeAttr(p.fio)}">`
      : (p.fio ? escapeHtml(p.fio[0]) : '?');

    return `
    <div class="player-tile" onclick="openPlayer('${p.id}')">
      <button class="tile-delete no-print" title="Удалить игрока" onclick="deletePlayerFromTile(event, '${p.id}')">🗑</button>
      <div class="player-avatar">${avatarContent}</div>
      <div class="player-info">
        <div class="name">${escapeHtml(p.fio || 'Без имени')}</div>
        <div class="meta">${escapeHtml(p.position || '')} · ${escapeHtml(p.team || '')}</div>
      </div>
      <div class="player-score">${overallScore(p)}</div>
    </div>`;
  }).join('');

  updateNotifBadge();
}

/* ===== Дашборд ===== */
function renderDashboard() {
  const el = document.getElementById('dashboard-content');
  if (!DB.players.length) {
    el.innerHTML = '<div class="empty-state"><div class="big">📊</div><p>Нет данных.</p></div>';
    return;
  }

  const n = DB.players.length;

  const avgField = f => {
    const v = DB.players.map(p => getCurrentScores(p)[f]).filter(x => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—';
  };

  const avgOverall = (() => {
    const v = DB.players.map(p => overallScore(p)).filter(x => x !== '—');
    return v.length ? (v.reduce((a, b) => a + Number(b), 0) / v.length).toFixed(1) : '—';
  })();

  const upcoming = collectNotifications().filter(i => i.type !== 'overdue').slice(0, 10);

  el.innerHTML = `
    <div class="dash-grid">
      <div class="kpi"><div class="lbl">Игроков</div><div class="val">${n}</div><div class="sub">в группе развития</div></div>
      <div class="kpi red"><div class="lbl">Средняя общая</div><div class="val">${avgOverall}</div><div class="sub">из 10 баллов</div></div>
      <div class="kpi"><div class="lbl">Техника</div><div class="val">${avgField('tehn')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi red"><div class="lbl">Физика</div><div class="val">${avgField('fiz')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi"><div class="lbl">Тактика</div><div class="val">${avgField('takt')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi red"><div class="lbl">Психология</div><div class="val">${avgField('psih')}</div><div class="sub">средняя по группе</div></div>
    </div>
    <div class="card"><h2>Сравнение игроков</h2>
      <div style="position:relative;height:380px"><canvas id="dash-radar"></canvas></div></div>
    <div class="card"><h2>Сводная таблица</h2>
      <div style="overflow-x:auto">
      <table><thead><tr><th>Игрок</th><th>Амплуа</th><th>Команда</th><th>Тех</th><th>Физ</th><th>Такт</th><th>Псих</th><th>Общая</th></tr></thead>
      <tbody>${DB.players.map(p => {
        const s = getCurrentScores(p);
        return `<tr style="cursor:pointer" onclick="openPlayer('${p.id}')">
        <td><strong>${escapeHtml(p.fio)}</strong></td><td>${escapeHtml(p.position || '')}</td><td>${escapeHtml(p.team || '')}</td>
        <td>${s.tehn != null ? s.tehn.toFixed(1) : '—'}</td>
        <td>${s.fiz != null ? s.fiz.toFixed(1) : '—'}</td>
        <td>${s.takt != null ? s.takt.toFixed(1) : '—'}</td>
        <td>${s.psih != null ? s.psih.toFixed(1) : '—'}</td>
        <td><strong style="color:var(--ak-green);font-family:var(--font-display)">${overallScore(p)}</strong></td></tr>`;
      }).join('')}
      </tbody></table></div></div>
    <div class="card red-top"><h2>Ближайшие тренировки</h2>
      ${upcoming.length ? upcoming.map(u => `<div class="upcoming" onclick="openPlayer('${u.pid}')">
        <div class="date">${formatDate(u.date)} · ${u.time}</div>
        <div class="what"><strong>${escapeHtml(u.ex || '')}</strong>${u.note ? ' · ' + escapeHtml(u.note) : ''}</div>
        <div class="who">${escapeHtml(u.who.split(' ')[0])}</div></div>`).join('') : '<p class="subtitle">Нет запланированных тренировок.</p>'}
    </div>
  `;

  const ctx = document.getElementById('dash-radar');
  if (ctx && n > 0) {
    const colors = ['#154734','#C8102E','#1e5a44','#9a0c23','#5a6169','#f59e0b'];
    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Техника','Физика','Тактика','Психология'],
        datasets: DB.players.map((p, i) => {
          const s = getCurrentScores(p);
          return {
            label: p.fio.split(' ')[0],
            data: [s.tehn, s.fiz, s.takt, s.psih],
            backgroundColor: colors[i % colors.length] + '22',
            borderColor: colors[i % colors.length],
            borderWidth: 2,
            pointBackgroundColor: colors[i % colors.length],
            pointRadius: 4
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { beginAtZero: true, max: 10, ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' }, grid: { color: '#C1C6C8' }, angleLines: { color: '#C1C6C8' }, pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' } } },
        plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 16 } } }
      }
    });
  }
}

/* ===== Сравнение игроков ===== */
function renderCompare() {
  const selA = document.getElementById('cmp-a');
  const selB = document.getElementById('cmp-b');
  if (!selA || !selB) return;

  const opts = DB.players.map(p => `<option value="${p.id}">${escapeHtml(p.fio)}</option>`).join('');
  const prevA = selA.value, prevB = selB.value;
  selA.innerHTML = opts; selB.innerHTML = opts;

  if (DB.players.length >= 1) selA.value = prevA || DB.players[0].id;
  if (DB.players.length >= 2) selB.value = prevB || DB.players[1].id;
  else if (DB.players.length === 1) selB.value = DB.players[0].id;

  const a = DB.players.find(p => p.id === selA.value);
  const b = DB.players.find(p => p.id === selB.value);
  if (!a || !b) return;

  const sa = getCurrentScores(a), sb = getCurrentScores(b);
  const ctx = document.getElementById('cmp-radar');
  if (ctx && ctx._chart) ctx._chart.destroy();
  if (ctx) {
    ctx._chart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Техника','Физика','Тактика','Психология'],
        datasets: [
          { label: a.fio.split(' ')[0], data: [sa.tehn, sa.fiz, sa.takt, sa.psih],
            backgroundColor: 'rgba(21,71,52,.2)', borderColor: '#154734', borderWidth: 3,
            pointBackgroundColor: '#154734', pointRadius: 5 },
          { label: b.fio.split(' ')[0], data: [sb.tehn, sb.fiz, sb.takt, sb.psih],
            backgroundColor: 'rgba(200,16,46,.2)', borderColor: '#C8102E', borderWidth: 3,
            pointBackgroundColor: '#C8102E', pointRadius: 5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { beginAtZero: true, max: 10, ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' }, grid: { color: '#C1C6C8' }, angleLines: { color: '#C1C6C8' }, pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' } } },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  const fields = [['Техника','tehn'],['Физика','fiz'],['Тактика','takt'],['Психология','psih']];
  document.getElementById('cmp-legend').innerHTML = fields.map(([lbl, f]) => {
    const av = sa[f] ?? 0, bv = sb[f] ?? 0;
    const diff = av - bv;
    const sign = diff > 0 ? '+' : '';
    return `<div class="score-item">
      <span class="lbl">${lbl}</span>
      <span class="bar"><span style="width:${av * 10}%;background:#154734"></span></span>
      <span class="val">${av ? av.toFixed(1) : '—'}</span>
      <span style="color:var(--ak-gray-dark);font-size:12px;min-width:40px;text-align:center;font-weight:900">VS</span>
      <span class="val" style="color:var(--ak-red)">${bv ? bv.toFixed(1) : '—'}</span>
      <span style="font-size:11px;font-weight:900;color:${diff >= 0 ? 'var(--ak-green)' : 'var(--ak-red)'};min-width:36px;text-align:right;font-family:var(--font-display)">${sign}${diff.toFixed(1)}</span>
    </div>`;
  }).join('');

  document.getElementById('cmp-table').innerHTML = `
    <h2>Сводка</h2>
    <table><thead><tr><th>Показатель</th><th>${escapeHtml(a.fio.split(' ')[0])}</th><th>${escapeHtml(b.fio.split(' ')[0])}</th><th>Разница</th></tr></thead>
      <tbody>
        <tr><td>Общая оценка</td><td><strong>${overallScore(a)}</strong></td><td><strong>${overallScore(b)}</strong></td>
          <td style="color:${(overallScore(a) - overallScore(b)) >= 0 ? 'var(--ak-green)' : 'var(--ak-red)'};font-weight:900">${(overallScore(a) - overallScore(b) >= 0 ? '+' : '')}${(overallScore(a) - overallScore(b)).toFixed(1)}</td></tr>
        <tr><td>Возраст</td><td>${computeAge(a) || '—'}</td><td>${computeAge(b) || '—'}</td><td>—</td></tr>
        <tr><td>Амплуа</td><td>${escapeHtml(a.position || '—')}</td><td>${escapeHtml(b.position || '—')}</td><td>—</td></tr>
        <tr><td>Рост / вес</td><td>${a.height || '—'} / ${a.weight || '—'}</td><td>${b.height || '—'} / ${b.weight || '—'}</td><td>—</td></tr>
        <tr><td>Команда</td><td>${escapeHtml(a.team || '—')}</td><td>${escapeHtml(b.team || '—')}</td><td>—</td></tr>
      </tbody></table>`;
}