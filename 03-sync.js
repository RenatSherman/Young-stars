/* ============================================================
   03-sync.js
   Supabase: авторизация, синхронизация данных, статус.
   Загружается после 02-utils.js.
   ============================================================ */

/* ===== Индикатор статуса синхронизации ===== */
function setSyncStatus(status, text) {
  const el = document.getElementById('sync-status');
  const txt = document.getElementById('sync-text');
  if (!el || !txt) return;
  el.classList.remove('ok', 'saving', 'error', 'offline');
  el.classList.add(status);
  txt.textContent = text;
}

/* ===== Планирование синхронизации (debounce 1.5 сек) ===== */
function scheduleSync() {
  if (!currentUser) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  setSyncStatus('saving', 'Сохранение…');
  syncTimeout = setTimeout(() => { pushToCloud(); }, 1500);
}

/* ===== Отправка данных в облако ===== */
async function pushToCloud() {
  if (!currentUser) return;
  if (!navigator.onLine) { setSyncStatus('offline', 'Оффлайн'); return; }
  if (isSyncing) return;

  isSyncing = true;
  try {
    const { error } = await sb
      .from('coach_data')
      .upsert({
        user_id: currentUser.id,
        players: DB.players,
        exercises: DB.exercises,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;

    lastSyncedAt = new Date();
    setSyncStatus('ok', 'Синхр. ' + lastSyncedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
  } catch (err) {
    console.error('Sync error:', err);
    setSyncStatus('error', 'Ошибка синхр.');
  } finally {
    isSyncing = false;
  }
}

/* ===== Загрузка данных из облака ===== */
async function pullFromCloud() {
  if (!currentUser) return false;
  setSyncStatus('saving', 'Загрузка…');

  try {
    const { data, error } = await sb
      .from('coach_data')
      .select('players, exercises, updated_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      DB.players = data.players || [];
      DB.exercises = data.exercises || [];
      DB.players.forEach(p => migrateCalendar(p));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
      setSyncStatus('ok', 'Загружено');
      return true;
    } else {
      await pushToCloud();
      return true;
    }
  } catch (err) {
    console.error('Pull error:', err);
    setSyncStatus('error', 'Ошибка загрузки');
    return false;
  }
}

/* ===== Ручная синхронизация ===== */
async function manualSync() {
  await pullFromCloud();
  await pushToCloud();
  renderPlayers();
  updateNotifBadge();
  if (currentPlayerId) {
    const p = DB.players.find(x => x.id === currentPlayerId);
    if (p) renderPlayerCard(p);
  }
}

/* ===== Принудительная отправка ===== */
async function forceUpload() {
  if (!confirm('Загрузить ВСЕ локальные данные в облако? Данные в облаке будут перезаписаны.')) return;
  await pushToCloud();
  alert('Локальные данные отправлены в облако');
}

/* ===== Принудительная загрузка ===== */
async function forceDownload() {
  if (!confirm('Скачать данные из облака? Все локальные изменения будут потеряны.')) return;
  await pullFromCloud();
  renderPlayers();
  updateNotifBadge();
  if (currentPlayerId) {
    const p = DB.players.find(x => x.id === currentPlayerId);
    if (p) renderPlayerCard(p);
  }
  alert('Данные загружены из облака');
}

/* ===== Переключение вкладок вход/регистрация ===== */
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-form-login').style.display = (tab === 'login') ? 'block' : 'none';
  document.getElementById('auth-form-register').style.display = (tab === 'register') ? 'block' : 'none';
  document.getElementById('auth-error').classList.remove('active');
  document.getElementById('auth-info').classList.remove('active');
}

/* ===== Сообщения на экране авторизации ===== */
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('active');
  document.getElementById('auth-info').classList.remove('active');
}

function showAuthInfo(msg) {
  const el = document.getElementById('auth-info');
  el.textContent = msg;
  el.classList.add('active');
  document.getElementById('auth-error').classList.remove('active');
}

function setAuthLoading(on) {
  document.getElementById('auth-loading').classList.toggle('active', on);
  document.getElementById('auth-form-login').style.display = on ? 'none' : 'block';
  document.getElementById('auth-form-register').style.display = 'none';
  document.querySelector('.auth-tabs').style.display = on ? 'none' : 'flex';
}

/* ===== Вход ===== */
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) { showAuthError('Введите email и пароль'); return; }

  document.getElementById('auth-error').classList.remove('active');
  setAuthLoading(true);

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    await onAuthorized();
  } catch (err) {
    setAuthLoading(false);
    const msg = String(err.message || err);
    let human = msg;
    if (/invalid login credentials/i.test(msg)) {
      human = 'Неверный email или пароль. Проверьте раскладку клавиатуры, Caps Lock и подтверждение email.';
    } else if (/email not confirmed/i.test(msg)) {
      human = 'Email не подтверждён. Подтвердите адрес в письме или отключите подтверждение в Supabase.';
    } else if (/failed to fetch|network/i.test(msg)) {
      human = 'Нет соединения с сервером. Проверьте интернет.';
    }
    showAuthError(human);
  }
}

/* ===== Регистрация ===== */
async function doRegister() {
  const email = document.getElementById('reg-email').value.trim();
  const p1 = document.getElementById('reg-password').value;
  const p2 = document.getElementById('reg-password2').value;

  if (!email || !p1) { showAuthError('Введите email и пароль'); return; }
  if (p1.length < 6) { showAuthError('Пароль должен быть минимум 6 символов'); return; }
  if (p1 !== p2) { showAuthError('Пароли не совпадают'); return; }

  document.getElementById('auth-error').classList.remove('active');
  setAuthLoading(true);

  try {
    const { data, error } = await sb.auth.signUp({ email, password: p1 });
    if (error) throw error;

    if (data.user && data.session) {
      currentUser = data.user;
      await onAuthorized();
    } else {
      setAuthLoading(false);
      showAuthInfo('Аккаунт создан. Проверьте email для подтверждения.');
    }
  } catch (err) {
    setAuthLoading(false);
    showAuthError('Ошибка регистрации: ' + (err.message || err));
  }
}

/* ===== Выход ===== */
async function doLogout() {
  if (!confirm('Выйти из аккаунта?')) return;
  await sb.auth.signOut();
  currentUser = null;
  document.getElementById('auth-screen').classList.add('active');
  document.querySelector('header').style.display = 'none';
  document.querySelector('main').style.display = 'none';
  switchAuthTab('login');
}

/* ===== После успешной авторизации ===== */
async function onAuthorized() {
  document.getElementById('auth-screen').classList.remove('active');
  document.querySelector('header').style.display = 'flex';
  document.querySelector('main').style.display = 'block';

  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('data-email').textContent = currentUser.email;

  const loaded = await pullFromCloud();
  if (!loaded) await pushToCloud();

  seedDemoData();
  renderPlayers();
  updateNotifBadge();
  setInterval(updateNotifBadge, 60000);
}

/* ===== Инициализация авторизации при загрузке ===== */
async function initAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      await onAuthorized();
    } else {
      document.querySelector('header').style.display = 'none';
      document.querySelector('main').style.display = 'none';
    }
  } catch (err) {
    console.error('Auth init error:', err);
    document.querySelector('header').style.display = 'none';
    document.querySelector('main').style.display = 'none';
  }
}

/* ===== Онлайн/оффлайн ===== */
window.addEventListener('online', () => {
  isOnline = true;
  if (currentUser) pushToCloud();
});
window.addEventListener('offline', () => {
  isOnline = false;
  setSyncStatus('offline', 'Оффлайн');
});