/* ============================================================
   06-plan.js
   План / факт, отчёт по итогу месяца.
   Загружается после 05-player.js.
   ============================================================ */

/* ===== Контейнер вкладки «План / факт» ===== */
function renderPlan(p) {
  return `<div class="card">
    <h2>План / факт</h2>
    <div id="plan-content"></div>
  </div>`;
}

/* ===== Содержимое вкладки «План / факт» ===== */
function renderPlanContent(p) {
  const el = document.getElementById('plan-content');
  if (!el) return;

  const months = Object.keys(p.plans || {});
  if (!months.length) {
    el.innerHTML = `<p class="subtitle">Нет данных.</p>
      <button class="btn" onclick="addMonth('${p.id}')">+ Добавить месяц</button>`;
    return;
  }

  if (!currentPlanMonth || !months.includes(currentPlanMonth)) {
    currentPlanMonth = months[0];
  }
  const month = currentPlanMonth;
  const plan = p.plans[month];
  const week = currentPlanWeek;

  const weekSuffix = 'w' + week;
  const planKey = weekSuffix + 'p';
  const volKey  = weekSuffix + 'v';
  const factKey = weekSuffix + 'f';
  const noteKey = weekSuffix + 'n';
  const wtypeKey = weekSuffix + 'wt';

  const allBlocks = Array.from(new Set(DB.exercises.map(g => g.group)));

  let rows = '';
  (plan.rows || []).forEach((r, i) => {
    const curPlan = r[planKey] || '';
    const isCustom = curPlan && !allBlocks.includes(curPlan);

    let selectHtml = `<select class="cell plan-select" onchange="onPlanBlockSelect('${p.id}','${escapeAttr(month)}',${i},'${planKey}', this)">
      <option value="">— не выбрано —</option>`;
    allBlocks.forEach(v => {
      selectHtml += `<option value="${escapeAttr(v)}" ${v === curPlan ? 'selected' : ''}>${escapeHtml(v)}</option>`;
    });
    if (isCustom) {
      selectHtml += `<option value="${escapeAttr(curPlan)}" selected>${escapeHtml(curPlan)}</option>`;
    }
    selectHtml += `</select>`;

    const wt = Array.isArray(r[wtypeKey]) ? r[wtypeKey] : [];
    const wtHtml = WORK_TYPES.map(t => {
      const checked = wt.includes(t) ? 'checked' : '';
      return `<label><input type="checkbox" ${checked} onchange="toggleWorkType('${p.id}','${escapeAttr(month)}',${i},'${wtypeKey}', this.value)" value="${escapeAttr(t)}"> ${escapeHtml(t)}</label>`;
    }).join('');

    const factVal = r[factKey] || '';
    const factCls = factClass(factVal);
    const factHtml = `<select class="fact-select ${factCls}" onchange="updatePlanFact('${p.id}','${escapeAttr(month)}',${i},'${factKey}', this.value)">
      ${FACT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === factVal ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
    </select>`;

    rows += `<tr>
      <td>${escapeHtml(r.group || '')}</td>
      <td>${escapeHtml(r.sub || '')}</td>
      <td><div class="worktype-cell">${wtHtml}</div></td>
      <td>
        ${selectHtml}
        <input class="cell plan-manual" style="margin-top:4px;display:${isCustom ? 'block' : 'none'}"
               value="${isCustom ? escapeAttr(curPlan) : ''}"
               placeholder="Своё название"
               onchange="updatePlan('${p.id}','${escapeAttr(month)}',${i},'${planKey}',this.value)">
      </td>
      <td><input class="cell" type="number" min="0" value="${r[volKey] || ''}" onchange="updatePlan('${p.id}','${escapeAttr(month)}',${i},'${volKey}',this.value)"></td>
      <td>${factHtml}</td>
      <td><textarea class="cell" rows="1" onchange="updatePlan('${p.id}','${escapeAttr(month)}',${i},'${noteKey}',this.value)">${escapeHtml(r[noteKey] || '')}</textarea></td>
    </tr>`;
  });

  el.innerHTML = `
    <div class="plan-controls no-print">
      <label>Месяц:</label>
      <select id="plan-month-select" onchange="onPlanMonthChange('${p.id}', this.value)">
        ${months.map(m => `<option value="${escapeAttr(m)}" ${m === month ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-ghost" onclick="addMonth('${p.id}')">+ месяц</button>
      <button class="btn btn-sm btn-red" onclick="deleteMonth('${p.id}','${escapeAttr(month)}')">🗑 удалить месяц</button>
      <label style="margin-left:auto">Неделя:</label>
      <div class="week-buttons" id="plan-weeks">
        ${[1,2,3,4,5].map(w => `<button class="${week === w ? 'active' : ''}" onclick="onPlanWeekChange('${p.id}',${w})">Неделя ${w}</button>`).join('')}
      </div>
    </div>
    <div style="overflow-x:auto">
      <table class="plan-table">
        <colgroup>
          <col class="col-section">
          <col class="col-element">
          <col class="col-worktype">
          <col class="col-plan">
          <col class="col-vol">
          <col class="col-fact">
          <col class="col-note">
        </colgroup>
        <thead>
          <tr>
            <th>Раздел</th>
            <th>Элемент</th>
            <th>Форма работы</th>
            <th>План (блок) · Неделя ${week}</th>
            <th>Объём, мин</th>
            <th>Факт</th>
            <th>Примечание</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ===== Обработчики плана ===== */
function onPlanBlockSelect(pid, month, i, f, selectEl) {
  const val = selectEl.value;
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.plans[month]) return;
  p.plans[month].rows[i][f] = val;
  saveDB();

  const manual = selectEl.parentElement.querySelector('.plan-manual');
  if (manual) {
    const exists = [...selectEl.options].some(o => o.value === val && o.textContent === val);
    if (val && !exists) {
      manual.style.display = 'block';
      manual.value = val;
    } else {
      manual.style.display = 'none';
      manual.value = '';
    }
  }
}

function updatePlanFact(pid, month, i, key, value) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.plans[month]) return;
  p.plans[month].rows[i][key] = value;
  saveDB();
  const sel = document.querySelector(`select.fact-select[onchange*="updatePlanFact('${pid}','${month}',${i},'${key}'"]`);
  if (sel) {
    sel.classList.remove('done', 'partial', 'notdone');
    const cls = factClass(value);
    if (cls) sel.classList.add(cls);
  }
}

function toggleWorkType(pid, month, i, key, value) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.plans[month]) return;
  const row = p.plans[month].rows[i];
  if (!Array.isArray(row[key])) row[key] = [];
  const idx = row[key].indexOf(value);
  if (idx >= 0) row[key].splice(idx, 1);
  else row[key].push(value);
  saveDB();
}

function onPlanMonthChange(pid, month) {
  currentPlanMonth = month;
  currentPlanWeek = 1;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlanContent(p);
}

function onPlanWeekChange(pid, week) {
  currentPlanWeek = parseInt(week);
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlanContent(p);
}

function updatePlan(pid, m, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.plans[m]) return;
  p.plans[m].rows[i][f] = v;
  saveDB();
}

function deleteMonth(pid, month) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.plans[month]) return;
  if (!confirm(`Удалить месяц «${month}» со всеми данными?`)) return;

  delete p.plans[month];
  const months = Object.keys(p.plans);
  currentPlanMonth = months.length ? months[0] : null;
  currentPlanWeek = 1;
  saveDB();

  const savedTab = currentTab;
  renderPlayerCard(p);
  currentTab = savedTab;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === savedTab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + savedTab));
}

function addMonth(pid) {
  const p = DB.players.find(x => x.id === pid);
  const name = prompt('Название месяца (например, «Октябрь 2026»):');
  if (!name || !name.trim()) return;

  const rows = p.techDetail.map(t => ({
    group: t.group, sub: t.sub,
    w1p: '', w1v: '', w1f: '', w1n: '', w1wt: [],
    w2p: '', w2v: '', w2f: '', w2n: '', w2wt: [],
    w3p: '', w3v: '', w3f: '', w3n: '', w3wt: [],
    w4p: '', w4v: '', w4f: '', w4n: '', w4wt: [],
    w5p: '', w5v: '', w5f: '', w5n: '', w5wt: []
  }));

  p.plans[name.trim()] = { weeks: [], rows };
  currentPlanMonth = name.trim();
  currentPlanWeek = 1;
  saveDB();

  const savedTab = currentTab;
  renderPlayerCard(p);
  currentTab = savedTab;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === savedTab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + savedTab));
}

/* ============================================================
   ОТЧЁТ ПО МЕСЯЦУ
   ============================================================ */

function collectAllPlanMonths() {
  const set = new Set();
  DB.players.forEach(p => {
    if (p.plans) Object.keys(p.plans).forEach(m => set.add(m));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
}

function computePlayerMonthStats(p, month) {
  const plan = p.plans && p.plans[month];
  if (!plan) return null;

  let total = 0, done = 0, partial = 0, notdone = 0, volumePlan = 0;
  const items = [];
  const weeks = [1, 2, 3, 4, 5];

  weeks.forEach(w => {
    const planKey = 'w' + w + 'p';
    const volKey  = 'w' + w + 'v';
    const factKey = 'w' + w + 'f';
    const wtKey   = 'w' + w + 'wt';

    (plan.rows || []).forEach(r => {
      const planText = (r[planKey] || '').trim();
      const wt = Array.isArray(r[wtKey]) ? r[wtKey] : [];
      const factVal = r[factKey] || '';
      const vol = Number(r[volKey]) || 0;

      if (!planText && !vol && !factVal && !wt.length) return;

      total++;
      if (factVal === 'done') done++;
      else if (factVal === 'partial') partial++;
      else if (factVal === 'notdone') notdone++;
      volumePlan += vol;

      items.push({
        week: w,
        group: r.group || '',
        sub: r.sub || '',
        plan: planText,
        wt,
        volume: vol,
        fact: factVal
      });
    });
  });

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

  if (!months.length) {
    document.getElementById('report-content').innerHTML = '<div class="empty-state"><div class="big">📄</div><p>Нет планов для отчёта.</p></div>';
    return;
  }

  monthSel.innerHTML = months.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('');
  if (!reportMonth || !months.includes(reportMonth)) reportMonth = months[0];
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
      <h2>Сводка по месяцу «${escapeHtml(month)}»</h2>
      <div class="dash-grid">
        <div class="kpi"><div class="lbl">Всего пунктов</div><div class="val">${allStats.total}</div></div>
        <div class="kpi"><div class="lbl">Выполнено</div><div class="val" style="color:#1e7a3f">${allStats.done}</div></div>
        <div class="kpi"><div class="lbl">Частично</div><div class="val" style="color:#b8860b">${allStats.partial}</div></div>
        <div class="kpi red"><div class="lbl">Не выполнено</div><div class="val">${allStats.notdone}</div></div>
        <div class="kpi red"><div class="lbl">Общий % выполнения</div><div class="val">${allStats.overall}%</div></div>
      </div>
    </div>`;

  const players = filterPid ? DB.players.filter(p => p.id === filterPid) : DB.players;
  const anyData = players.some(p => p.plans && p.plans[month]);

  if (!anyData) {
    html += '<div class="empty-state"><div class="big">📄</div><p>У выбранных игроков нет данных за этот месяц.</p></div>';
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
          <td>Неделя ${it.week}</td>
          <td>${escapeHtml(it.group)}</td>
          <td>${escapeHtml(it.sub)}</td>
          <td>${escapeHtml(it.plan)}</td>
          <td>${escapeHtml(it.wt.join(', '))}</td>
          <td>${it.volume || ''}</td>
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
            <span class="badge">Всего пунктов: ${st.total}</span>
            <span class="badge">Объём по плану: ${st.volumePlan} мин</span>
          </div>
          <div class="report-progress"><span style="width:${st.completion}%"></span></div>
          <div style="font-size:12px;font-weight:700;color:var(--ak-green);margin-bottom:10px">Выполнение: ${st.completion}%</div>
          ${st.items.length ? `<table class="report-table">
            <thead><tr><th>Неделя</th><th>Раздел</th><th>Элемент</th><th>План</th><th>Форма работы</th><th>Объём, мин</th><th>Факт</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : '<p class="subtitle">Нет записей.</p>'}
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