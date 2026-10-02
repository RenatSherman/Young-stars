/* ============================================================
   08-pdf.js
   Экспорт в PDF: универсальный рендер, карточка игрока (полная
   и краткая), диаграммы в PDF.
   Загружается после 07-calendar.js.
   ============================================================ */

/* ===== Универсальный экспорт DOM-элемента в PDF ===== */
async function exportElementToPDF(element, filename, options = {}) {
  const { jsPDF } = window.jspdf;
  const orientation = options.orientation || 'p';
  const hideSelectors = options.hideSelectors || [];

  const hidden = [];
  hideSelectors.forEach(sel => {
    element.querySelectorAll(sel).forEach(el => {
      hidden.push({ el, display: el.style.display });
      el.style.display = 'none';
    });
  });

  const prevMaxHeight = [];
  element.querySelectorAll('.accordion-body').forEach(el => {
    prevMaxHeight.push({ el, v: el.style.maxHeight });
    el.style.maxHeight = 'none';
  });

  await new Promise(r => setTimeout(r, 80));

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff'
  });

  hidden.forEach(({ el, display }) => { el.style.display = display; });
  prevMaxHeight.forEach(({ el, v }) => { el.style.maxHeight = v; });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableWidth = pageWidth - margin * 2;
  const imgWidth = usableWidth;
  const imgHeight = canvas.height * imgWidth / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
  heightLeft -= (pageHeight - margin * 2);

  while (heightLeft > 0) {
    pdf.addPage();
    position = margin - (imgHeight - heightLeft);
    pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
    heightLeft -= (pageHeight - margin * 2);
  }

  pdf.save(filename);
}

/* ===== Замена canvas на <img> ===== */
function snapshotCanvases(container) {
  container.querySelectorAll('canvas').forEach(canvas => {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.width = canvas.style.width || canvas.width + 'px';
      img.style.height = canvas.style.height || canvas.height + 'px';
      img.style.display = 'block';
      img.style.maxWidth = '100%';
      canvas.parentElement.replaceChild(img, canvas);
    } catch (e) {
      console.warn('canvas snapshot error', e);
    }
  });
}

/* ===== HTML-шаблон карточки игрока для PDF ===== */
function buildPlayerPDFHTML(p, short) {
  const s = getCurrentScores(p);
  const sEnd = getEndScores(p);
  const age = computeAge(p);

  const headStyle = 'background:#154734;color:#fff;padding:8px 12px;font-size:13px;font-weight:bold;letter-spacing:1px;margin:16px 0 10px 0;text-transform:uppercase;';
  const thStyle = 'background:#154734;color:#fff;padding:6px 8px;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.5px;';
  const tdStyle = 'padding:5px 8px;border-bottom:1px solid #d4d8da;font-size:11px;vertical-align:top;';
  const labelStyle = 'font-size:9px;color:#5a6169;text-transform:uppercase;letter-spacing:.5px;font-weight:bold;';
  const valueStyle = 'font-size:12px;color:#1a1d20;padding:2px 0 4px 0;border-bottom:1px solid #d4d8da;';

  let html = `
    <div style="border-top:6px solid #C8102E;padding-top:10px;margin-bottom:12px">
      <div style="font-size:18px;font-weight:900;color:#154734;letter-spacing:1px;text-transform:uppercase">АК БАРС · КАРТОЧКА ИГРОКА</div>
      <div style="font-size:10px;color:#5a6169;margin-top:4px">Сформировано: ${new Date().toLocaleString('ru-RU')}</div>
    </div>
    <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:14px">
      <div style="width:130px;flex-shrink:0">
        ${p.photo ? `<img src="${p.photo}" style="width:130px;height:170px;object-fit:cover;border:2px solid #154734;border-radius:4px">` : `<div style="width:130px;height:170px;background:#e6e8ea;border:2px solid #154734;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#5a6169;font-size:12px">ФОТО</div>`}
      </div>
      <div style="flex:1">
        <div style="font-size:17px;font-weight:900;color:#154734;margin-bottom:3px">${escapeHtml(p.fio || '')}</div>
        <div style="font-size:11px;color:#5a6169;margin-bottom:8px">${escapeHtml(p.team || '')} · ${escapeHtml(p.city || '')}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px 16px">
          <div><div style="${labelStyle}">Дата рождения</div><div style="${valueStyle}">${escapeHtml(p.birthDay || '')} ${escapeHtml(p.birthMonth || '')} ${escapeHtml(p.birthYear || '')}</div></div>
          <div><div style="${labelStyle}">Возраст</div><div style="${valueStyle}">${age || '—'}</div></div>
          <div><div style="${labelStyle}">Рост</div><div style="${valueStyle}">${escapeHtml(p.height || '—')} см</div></div>
          <div><div style="${labelStyle}">Вес</div><div style="${valueStyle}">${escapeHtml(p.weight || '—')} кг</div></div>
          <div><div style="${labelStyle}">Амплуа</div><div style="${valueStyle}">${escapeHtml(p.position || '—')}</div></div>
          <div><div style="${labelStyle}">Хват</div><div style="${valueStyle}">${escapeHtml(p.grip || '—')}</div></div>
          <div><div style="${labelStyle}">Первая школа</div><div style="${valueStyle}">${escapeHtml(p.firstSchool || '—')}</div></div>
          <div><div style="${labelStyle}">Город</div><div style="${valueStyle}">${escapeHtml(p.city || '—')}</div></div>
        </div>
      </div>
    </div>
  `;

  if (!short && p.characteristic) {
    html += `<div style="${headStyle}">Краткая характеристика</div>
      <div style="font-size:11px;line-height:1.5;background:#e6e8ea;padding:10px;border-radius:4px">${escapeHtml(p.characteristic)}</div>`;
  }

  html += `<div style="${headStyle}">Профиль навыков</div>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="width:280px;height:280px;position:relative;flex-shrink:0">
        <canvas id="pdf-radar-current" width="280" height="280"></canvas>
      </div>
      <div style="flex:1;min-width:220px">
        ${scoreDisplay('Техника', s.tehn, '')}
        ${scoreDisplay('Физика', s.fiz, '')}
        ${scoreDisplay('Тактика', s.takt, '')}
        ${scoreDisplay('Психология', s.psih, '')}
        <div style="margin-top:8px;padding:12px;background:#154734;color:#fff;border-radius:4px;text-align:center;border-bottom:4px solid #C8102E">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;opacity:.85;font-weight:900">Общая оценка</div>
          <div style="font-size:28px;font-weight:900">${overallScore(p)}</div>
        </div>
      </div>
    </div>`;

  html += `<div style="${headStyle};background:#C8102E">Динамика: начало сезона → конец сезона</div>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="width:280px;height:280px;position:relative;flex-shrink:0">
        <canvas id="pdf-radar-dynamics" width="280" height="280"></canvas>
      </div>
      <div style="flex:1;min-width:220px">
        ${scoreDisplay('Техника (конец)', sEnd.tehn, '')}
        ${scoreDisplay('Физика (конец)', sEnd.fiz, '')}
        ${scoreDisplay('Тактика (конец)', sEnd.takt, '')}
        ${scoreDisplay('Психология (конец)', sEnd.psih, '')}
        <div style="margin-top:8px;padding:12px;background:#C8102E;color:#fff;border-radius:4px;text-align:center">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;opacity:.9;font-weight:900">Общая (конец)</div>
          <div style="font-size:28px;font-weight:900">${overallScoreEnd(p)}</div>
        </div>
      </div>
    </div>`;

  if (!short) {
    /* Техника */
    html += `<div style="${headStyle}">Техническая оснащённость</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${thStyle}">Раздел</th>
          <th style="${thStyle}">Подраздел</th>
          <th style="${thStyle}">Критерий</th>
          <th style="${thStyle}">Начало</th>
          <th style="${thStyle}">Середина</th>
          <th style="${thStyle}">Конец</th>
        </tr></thead>
        <tbody>
          ${(p.techDetail || []).map(r => `<tr>
            <td style="${tdStyle}">${escapeHtml(r.group || '')}</td>
            <td style="${tdStyle}">${escapeHtml(r.sub || '')}</td>
            <td style="${tdStyle}">${escapeHtml(r.name || '')}</td>
            <td style="${tdStyle}">${r.start ?? ''}</td>
            <td style="${tdStyle}">${r.mid ?? ''}</td>
            <td style="${tdStyle}">${r.end ?? ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    /* Физ / Такт / Псих — заголовки «Начало / Середина / Конец» (данные в start/plan/fact) */
    html += `<div style="${headStyle}">Физ / Такт / Псих</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${thStyle}">Раздел</th>
          <th style="${thStyle}">Подраздел</th>
          <th style="${thStyle}">Критерий</th>
          <th style="${thStyle}">Начало</th>
          <th style="${thStyle}">Середина</th>
          <th style="${thStyle}">Конец</th>
        </tr></thead>
        <tbody>
          ${(p.otherDetail || []).map(r => `<tr>
            <td style="${tdStyle}">${escapeHtml(r.group || '')}</td>
            <td style="${tdStyle}">${escapeHtml(r.sub || '')}</td>
            <td style="${tdStyle}">${escapeHtml(r.name || '')}</td>
            <td style="${tdStyle}">${r.start ?? ''}</td>
            <td style="${tdStyle}">${r.plan ?? ''}</td>
            <td style="${tdStyle}">${r.fact ?? ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    /* Тесты */
    const cols = getTestColumns();
    html += `<div style="${headStyle}">Тесты</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${thStyle}">Дата</th>
          ${cols.map(c => `<th style="${thStyle}">${escapeHtml(c.label)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${(p.tests || []).map(t => `<tr>
            <td style="${tdStyle}">${escapeHtml(t.date || '')}</td>
            ${cols.map(c => `<td style="${tdStyle}">${escapeHtml(t[c.key] || '')}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>`;

    /* План развития */
    const plans = (p.developmentPlans || []);
    if (plans.length) {
      html += `<div style="${headStyle}">План развития</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="${thStyle}">Навык</th>
            <th style="${thStyle}">Текущая</th>
            <th style="${thStyle}">Цель</th>
            <th style="${thStyle}">Срок</th>
            <th style="${thStyle}">Комплекс(ы)</th>
            <th style="${thStyle}">Факт</th>
            <th style="${thStyle}">Комментарий</th>
          </tr></thead>
          <tbody>
            ${plans.map(g => {
              const opt = (typeof getSkillOptionByRef === 'function') ? getSkillOptionByRef(p, g.section, g.index) : null;
              const label = opt ? opt.label : (g.skillLabel || '—');
              const cur = opt ? (opt.currentStart ?? '') : '';
              const complexes = Array.isArray(g.complexes) ? g.complexes.join(', ') : '';
              return `<tr>
                <td style="${tdStyle}">${escapeHtml(label)}</td>
                <td style="${tdStyle}">${cur}</td>
                <td style="${tdStyle}">${g.target ?? ''}</td>
                <td style="${tdStyle}">${escapeHtml(g.deadline || '')}</td>
                <td style="${tdStyle}">${escapeHtml(complexes)}</td>
                <td style="${tdStyle}">${factLabel(g.fact)}</td>
                <td style="${tdStyle}">${escapeHtml(g.comment || '')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }
  }

  /* Статистика — всегда */
  if (p.stats && p.stats.length) {
    html += `<div style="${headStyle}">Статистика</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${thStyle}">Клуб / турнир</th>
          <th style="${thStyle}">Игры</th>
          <th style="${thStyle}">Голы</th>
          <th style="${thStyle}">Передачи</th>
          <th style="${thStyle}">Очки</th>
          <th style="${thStyle}">+/-</th>
        </tr></thead>
        <tbody>
          ${p.stats.map(s => {
            if (s.season && !s.club) return `<tr><td colspan="6" style="${tdStyle};background:#154734;color:#fff;font-weight:bold">${escapeHtml(s.season)}</td></tr>`;
            return `<tr>
              <td style="${tdStyle}">${escapeHtml(s.club || '')}</td>
              <td style="${tdStyle}">${s.games ?? ''}</td>
              <td style="${tdStyle}">${s.goals ?? ''}</td>
              <td style="${tdStyle}">${s.assists ?? ''}</td>
              <td style="${tdStyle}">${s.points ?? ''}</td>
              <td style="${tdStyle}">${s.plus ?? ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  return html;
}

/* ===== Радары в PDF-превью ===== */
function drawPDFRadars(container, p) {
  const s = getCurrentScores(p);
  const e = getEndScores(p);

  const ctx1 = container.querySelector('#pdf-radar-current');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'radar',
      data: {
        labels: ['Техника', 'Физика', 'Тактика', 'Психология'],
        datasets: [{
          label: 'Профиль',
          data: [s.tehn, s.fiz, s.takt, s.psih],
          backgroundColor: 'rgba(21,71,52,.2)',
          borderColor: '#154734',
          borderWidth: 3,
          pointBackgroundColor: '#C8102E',
          pointBorderColor: '#fff',
          pointRadius: 6,
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          r: {
            beginAtZero: true, max: 10,
            ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' },
            grid: { color: '#C1C6C8' },
            angleLines: { color: '#C1C6C8' },
            pointLabels: { font: { size: 12, weight: '900' }, color: '#154734' }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  const ctx2 = container.querySelector('#pdf-radar-dynamics');
  if (ctx2) {
    const hasEnd = [e.tehn, e.fiz, e.takt, e.psih].some(v => v != null);
    const datasets = [{
      label: 'Начало сезона',
      data: [s.tehn, s.fiz, s.takt, s.psih],
      backgroundColor: 'rgba(21,71,52,.15)',
      borderColor: '#154734',
      borderWidth: 3,
      pointBackgroundColor: '#154734',
      pointRadius: 5
    }];
    if (hasEnd) datasets.push({
      label: 'Конец сезона',
      data: [e.tehn, e.fiz, e.takt, e.psih],
      backgroundColor: 'rgba(200,16,46,.15)',
      borderColor: '#C8102E',
      borderWidth: 3,
      pointBackgroundColor: '#C8102E',
      pointRadius: 5
    });

    new Chart(ctx2, {
      type: 'radar',
      data: { labels: ['Техника', 'Физика', 'Тактика', 'Психология'], datasets },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          r: {
            beginAtZero: true, max: 10,
            ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' },
            grid: { color: '#C1C6C8' },
            angleLines: { color: '#C1C6C8' },
            pointLabels: { font: { size: 12, weight: '900' }, color: '#154734' }
          }
        },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
      }
    });
  }
}

/* ===== Экспорт полной карточки игрока в PDF ===== */
async function exportPlayerToPDF(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) { alert('Игрок не найден'); return; }

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = buildPlayerPDFHTML(p, false);

  await new Promise(r => setTimeout(r, 60));
  drawPDFRadars(stage, p);
  await new Promise(r => setTimeout(r, 300));
  snapshotCanvases(stage);

  try {
    await exportElementToPDF(stage, `Карточка_${(p.fio || '').replace(/\s+/g, '_')}.pdf`, { orientation: 'p' });
  } finally {
    stage.innerHTML = '';
  }
}

/* ===== Экспорт краткой карточки игрока в PDF ===== */
async function exportPlayerToShortPDF(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) { alert('Игрок не найден'); return; }

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = buildPlayerPDFHTML(p, true);

  await new Promise(r => setTimeout(r, 60));
  drawPDFRadars(stage, p);
  await new Promise(r => setTimeout(r, 300));
  snapshotCanvases(stage);

  try {
    await exportElementToPDF(stage, `Карточка_${(p.fio || '').replace(/\s+/g, '_')}_кратко.pdf`, { orientation: 'p' });
  } finally {
    stage.innerHTML = '';
  }
}