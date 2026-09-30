/* ============================================================
   04-ui.js
   Навигация, бургер-меню, уведомления, рендер игроков,
   дашборд. Работает с новым форматом календаря.
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
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');

  document.querySelectorAll('nav button[data-screen]').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });

  if (name === 'players')        renderPlayers();
  if (name === 'exercises')      renderExercises();
  if (name === 'dashboard')      renderDashboard();
  if (name === 'report')         renderReport();
  if (name === 'coach-calendar') renderCoachCalendar();
  if (name === 'coach-report')   renderCoachReport();

  closeMobileNav();
  document.getElementById('notif-panel').classList.remove('active');
  window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav button[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
});

/* ===== Бургер-меню ===== */
function toggleMobileNav(e) {
  if (e) e.stopPropagation();
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.classList.toggle('open');
}

function closeMobileNav() {
  const nav = document.getElementById('main-nav');
  if (nav) nav.classList.remove('open');
}

document.addEventListener('click', e => {
  const nav = document.getElementById('main-nav');
  if (!nav || !nav.classList.contains('open')) return;
  if (e.target.closest('#main-nav') || e.target.closest('#burger-btn')) return;
  closeMobileNav();
});

/* ============================================================
   МИГРАЦИЯ СТАРОГО ФОРМАТА КАЛЕНДАРЯ
   ============================================================
   Старый формат: p.calendar[date][time] = { ex, note, wt[], groupId }
   Новый формат:  p.calendar[date] = [ { id, name, timeStart, timeEnd,
                                         block, workTypes[], note,
                                         playerIds[], groupId } ]

   Всё, что было в старой структуре, группируем по groupId (если есть)
   или по одной записи = одна тренировка.
   ============================================================ */
function migrateCalendar(p) {
  if (!p.calendar) { p.calendar = {}; return; }

  let needSave = false;

  /* Старый формат — вложенные часы '06:00', '06:15' и т. д. */
  const isOldFormat = Object.values(p.calendar).some(day => {
    if (!day || Array.isArray(day)) return false;
    return Object.keys(day).some(k => /^\d{2}:\d{2}$/.test(k));
  });

  /* Также может быть промежуточный формат: p.calendar['2026-W36'] */
  const hasWeekKeys = Object.keys(p.calendar).some(k => /^\d{4}-W\d+$/.test(k));

  if (hasWeekKeys) {
    const newCal = {};
    Object.keys(p.calendar).forEach(k => {
      if (/^\d{4}-W\d+$/.test(k)) {
        const weekObj = p.calendar[k];
        Object.keys(weekObj).forEach(date => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            newCal[date] = weekObj[date];
          }
        });
      } else {
        newCal[k] = p.calendar[k];
      }
    });
    p.calendar = newCal;
    needSave = true;
  }

  if (!isOldFormat) return;

  const newCal = {};

  Object.keys(p.calendar).forEach(date => {
    const day = p.calendar[date];
    if (!day) return;
    if (Array.isArray(day)) { newCal[date] = day; return; }

    /* Группируем записи по groupId */
    const groups = {};
    Object.keys(day).forEach(time => {
      const c = day[time];
      if (!c || (!c.ex && !c.note && (!c.wt || !c.wt.length))) return;
      const key = c.groupId || ('old_' + time + '_' + Math.random().toString(36).slice(2, 6));
      if (!groups[key]) {
        groups[key] = {
          id: uid('sess'),
          name: c.ex || '',
          timeStart: time,
          timeEnd: time,
          block: c.ex || '',
          workTypes: Array.isArray(c.wt) ? c.wt.slice() : [],
          note: c.note || '',
          playerIds: [p.id],
          groupId: c.groupId || null
        };
      } else {
        const start = timeToMinutes(groups[key].timeStart);
        const now = timeToMinutes(time);
        if (now < start) groups[key].timeStart = time;
        const end = timeToMinutes(groups[key].timeEnd);
        if (now > end) groups[key].timeEnd = time;
        if (c.note) groups[key].note = c.note;
        (c.wt || []).forEach(w => { if (!groups[key].workTypes.includes(w)) groups[key].workTypes.push(w); });
      }
    });

    newCal[date] = Object.values(groups);
    needSave = true;
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
      const day = p.calendar[date];
      if (!Array.isArray(day)) return;
      day.forEach(sess => {
        if (!sess || (!sess.name && !sess.note)) return;
        const time = sess.timeStart || '';
        const ex = sess.name || sess.block || '';
        const who = p.fio;
        const pid = p.id;

        if (date < today) {
          items.push({ type: 'overdue', date, time, ex, note: sess.note, who, pid, label: 'Просрочено' });
        } else if (date === today) {
          items.push({ type: 'today', date, time, ex, note: sess.note, who, pid, label: 'Сегодня' });
        } else if (date <= weekAhead) {
          items.push({ type: 'soon', date, time, ex, note: sess.note, who, pid, label: 'Скоро' });
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
  if (!badge) return;
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

document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (!panel.contains(e.target) && !e.target.closest('.notif-btn')) {
    panel.classList.remove('active');
  }
});

/* ===== Список игроков ===== */
function renderPlayers() {
  const el = document.getElementById('players-list');
  if (!el) return;
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
  if (!el) return;

  if (!DB.players.length) {
    el.innerHTML = `
      <div class="card">
        <div class="empty-state"><div class="big">📊</div><p>Нет данных.</p></div>
      </div>
      <div class="card">
        <h2>Быстрые переходы</h2>
        <div class="btn-row" style="margin:0">
          <button class="btn" onclick="showScreen('coach-calendar')">📅 Календарь тренера</button>
          <button class="btn btn-red" onclick="showScreen('coach-report')">📊 Отчёт тренера</button>
        </div>
      </div>`;
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
    <div class="card" style="border-top-color:var(--ak-red)">
      <h2>Быстрые переходы</h2>
      <div class="btn-row" style="margin:0">
        <button class="btn" onclick="showScreen('coach-calendar')">📅 Календарь тренера</button>
        <button class="btn btn-red" onclick="showScreen('coach-report')">📊 Отчёт тренера</button>
        <button class="btn btn-ghost" onclick="showScreen('report')">📄 Отчёт по игрокам</button>
      </div>
    </div>

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