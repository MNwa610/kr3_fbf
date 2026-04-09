/**
 * Учебный TODO-менеджер для практик 13–14.
 *
 * Что уже реализовано в шаблоне:
 * 1. Добавление, удаление и переключение статуса задач.
 * 2. Хранение задач в localStorage.
 * 3. Вывод статистики по задачам.
 * 4. Регистрация Service Worker.
 * 5. Поддержка установки PWA в Chromium-браузерах.
 * 6. Отдельная подсказка по установке в Safari.
 * 7. Случайные мотивационные цитаты в футере.
 *
 * Что оставлено студентам:
 * - редактирование задачи;
 * - фильтрация списка;
 * - подтверждение удаления;
 * - улучшение кэширования в Service Worker;
 * - более продуманная обработка обновлений PWA.
 */

// =========================================================
// DOM-элементы интерфейса
// =========================================================

const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const taskList = document.getElementById('taskList');
const taskStats = document.getElementById('taskStats');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const networkStatus = document.getElementById('networkStatus');
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const installHint = document.getElementById('installHint');
const filterAllBtn = document.getElementById('filterAllBtn');
const filterActiveBtn = document.getElementById('filterActiveBtn');
const filterCompletedBtn = document.getElementById('filterCompletedBtn');
const quoteText = document.getElementById('quoteText');
const newQuoteBtn = document.getElementById('newQuoteBtn');
const enablePushBtn = document.getElementById('enablePushBtn');
const disablePushBtn = document.getElementById('disablePushBtn');

// =========================================================
// Константы приложения
// =========================================================

/**
 * Ключ, под которым массив задач лежит в localStorage.
 * Если поменять ключ, приложение начнёт читать и сохранять данные
 * уже в другую запись хранилища.
 */
const STORAGE_KEY = 'practice_13_14_todos_v2';

/**
 * Массив цитат для нижнего блока.
 * Это небольшой пример клиентской динамики без обращения к серверу.
 */
const planningQuotes = [
  'Хороший план сегодня лучше идеального плана завтра.',
  'Планирование экономит время, которое иначе уходит на исправление хаоса.',
  'Большая цель достигается через маленькие запланированные шаги.',
  'Порядок в делах начинается с ясности следующего шага.',
  'Последовательность важнее разового вдохновения.',
  'План — это не ограничение, а инструмент управления неопределённостью.',
  'Когда задача записана, она перестаёт шуметь в голове.',
  'Хорошая система побеждает временный порыв.'
];

/**
 * В этой переменной будет временно храниться событие beforeinstallprompt.
 * Оно нужно для ручного показа системного диалога установки PWA.
 *
 * Значение будет равно:
 * - null, если установка сейчас недоступна;
 * - объекту события, если браузер разрешил показать install-prompt.
 */
let deferredInstallPrompt = null;
const PUSH_SUBSCRIPTION_KEY = 'practice_13_14_push_subscription';
const VAPID_PUBLIC_KEY = 'BBvh44fl9I5XDzI6F26gRCgeLLf0NW0PX-SNG0CNd2bSP3jNydtSqgGTvcNCuD_fZgB_xRF7Ocy8x-v97LPU-fU';
let socket = null;

// =========================================================
// Работа с localStorage
// =========================================================

/**
 * Безопасно читает массив задач из localStorage.
 *
 * Почему здесь try/catch:
 * - строка в localStorage может оказаться повреждённой;
 * - JSON.parse выбросит ошибку при некорректном содержимом;
 * - интерфейс не должен полностью падать из-за одной ошибки хранения.
 */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Не удалось прочитать задачи из localStorage:', error);
    return [];
  }
}

/**
 * Сохраняет массив задач в localStorage.
 *
 * @param {Array} tasks - массив объектов задач.
 */
function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// =========================================================
// Вспомогательные функции
// =========================================================

/**
 * Генерирует простой уникальный идентификатор задачи.
 * Для учебного приложения этого достаточно.
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Обновляет статус сети в интерфейсе.
 * navigator.onLine даёт базовую информацию, которой хватает для учебной демонстрации.
 */
function updateNetworkStatus() {
  const isOnline = navigator.onLine;

  networkStatus.textContent = isOnline ? 'Онлайн' : 'Офлайн';
  networkStatus.classList.toggle('badge--success', isOnline);
  networkStatus.classList.toggle('badge--offline', !isOnline);
}

/**
 * Возвращает случайную цитату и выводит её в футер.
 */
function showRandomQuote() {
  const randomIndex = Math.floor(Math.random() * planningQuotes.length);
  quoteText.textContent = planningQuotes[randomIndex];
}

/**
 * Формирует DOM-элемент для одной задачи.
 * Здесь выбран вариант именно с созданием DOM-узлов,
 * чтобы код был нагляднее и безопаснее для разбора.
 */
function createTaskElement(task) {
  const li = document.createElement('li');
  li.className = 'task-item';
  li.dataset.id = task.id;

  const leftPart = document.createElement('div');
  leftPart.className = 'task-item__left';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.completed;
  checkbox.dataset.action = 'toggle';
  checkbox.setAttribute('aria-label', 'Отметить задачу выполненной');

  const text = document.createElement('span');
  text.className = 'task-item__text';
  text.textContent = task.text;

  if (task.completed) {
    text.classList.add('task-item__text--completed');
  }

  leftPart.appendChild(checkbox);
  leftPart.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'task-item__actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'button button--secondary button--small';
  editBtn.textContent = 'Редактировать';
  editBtn.dataset.action = 'edit';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'button button--danger button--small';
  deleteBtn.textContent = 'Просто удали это!';
  deleteBtn.dataset.action = 'delete';

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  li.appendChild(leftPart);
  li.appendChild(actions);

  return li;
}

/**
 * Перерисовывает блок статистики.
 */
function updateStats(tasks) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const active = total - completed;

  taskStats.textContent = `Всего: ${total} | Активных: ${active} | Выполненных: ${completed}`;
}

/**
 * Полная перерисовка списка задач.
 * Для учебного проекта это допустимый и понятный подход.
 */
let currentFilter = 'all';

function filterTasks(tasks) {
  switch (currentFilter) {
    case 'active':
      return tasks.filter((task) => !task.completed);
    case 'completed':
      return tasks.filter((task) => task.completed);
    default:
      return tasks;
  }
}

function updateFilterButtons() {
  const buttons = [filterAllBtn, filterActiveBtn, filterCompletedBtn];

  buttons.forEach((button) => {
    if (!button) return;
    button.classList.toggle('filter-button--active', button.dataset.filter === currentFilter);
  });
}

function renderTasks() {
  const tasks = loadTasks();
  const visibleTasks = filterTasks(tasks);
  taskList.innerHTML = '';

  if (visibleTasks.length === 0) {
    const emptyState = document.createElement('li');
    emptyState.className = 'empty-state';
    emptyState.textContent = tasks.length === 0
      ? 'Пока задач нет. Добавьте первую запись.'
      : currentFilter === 'completed'
        ? 'Нет выполненных задач для показа.'
        : currentFilter === 'active'
          ? 'Нет активных задач для показа.'
          : 'Нет задач для показа.';
    taskList.appendChild(emptyState);
    updateStats(tasks);
    updateFilterButtons();
    return;
  }

  visibleTasks.forEach((task) => {
    taskList.appendChild(createTaskElement(task));
  });

  updateStats(tasks);
  updateFilterButtons();
}

function setFilter(filter) {
  currentFilter = filter;
  renderTasks();
}

function editTask(taskId, newText) {
  const normalizedText = newText.trim();

  if (!normalizedText) {
    return;
  }

  const updated = loadTasks().map((task) => {
    if (task.id === taskId) {
      return {
        ...task,
        text: normalizedText
      };
    }

    return task;
  });

  saveTasks(updated);
  renderTasks();
}

// =========================================================
// Бизнес-логика TODO-списка
// =========================================================

/**
 * Добавляет новую задачу.
 *
 * @param {string} text - текст задачи.
 */
function addTask(text) {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return;
  }

  const tasks = loadTasks();

  const newTask = {
    id: generateId(),
    text: normalizedText,
    completed: false,
    createdAt: new Date().toISOString()
  };

  tasks.unshift(newTask);
  saveTasks(tasks);
  renderTasks();

  if (socket && socket.connected) {
    socket.emit('newTask', newTask);
  }
}

function handleTaskListClick(event) {
  const action = event.target.dataset.action;
  const taskId = event.target.closest('li')?.dataset.id;

  if (!action || !taskId) {
    return;
  }

  if (action === 'toggle') {
    toggleTask(taskId);
    return;
  }

  if (action === 'delete') {
    deleteTask(taskId);
    return;
  }

  if (action === 'edit') {
    const tasks = loadTasks();
    const task = tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    const newText = window.prompt('Измените текст задачи:', task.text);

    if (newText === null) {
      return;
    }

    editTask(taskId, newText);
  }
}

/**
 * Переключает статус задачи по id.
 */
function toggleTask(taskId) {
  const updated = loadTasks().map((task) => {
    if (task.id === taskId) {
      return {
        ...task,
        completed: !task.completed
      };
    }

    return task;
  });

  saveTasks(updated);
  renderTasks();
}

/**
 * Удаляет задачу по id.
 * Подтверждение специально не добавлено: это TODO для студентов.
 */
function deleteTask(taskId) {
  const confirmed = window.confirm('Вы точно хотите удалить эту задачу?');

  if (!confirmed) {
    return;
  }

  const updated = loadTasks().filter((task) => task.id !== taskId);
  saveTasks(updated);
  renderTasks();
}

/**
 * Удаляет все выполненные задачи.
 */
function clearCompletedTasks() {
  const completedTasks = loadTasks().filter((task) => task.completed);

  if (completedTasks.length === 0) {
    return;
  }

  const confirmed = window.confirm('Удалить все отмеченные как выполненные задачи?');

  if (!confirmed) {
    return;
  }

  const updated = loadTasks().filter((task) => !task.completed);
  saveTasks(updated);
  renderTasks();
}

// =========================================================
// Установка PWA
// =========================================================

/**
 * Определяет, запущено ли приложение уже в standalone-режиме.
 * Это полезно, чтобы не показывать кнопку установки там,
 * где приложение уже установлено и открыто как отдельное окно.
 */
function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/**
 * Обновляет текст подсказки по установке.
 * В Chromium мы можем показать собственную кнопку установки,
 * а в Safari остаётся сценарий через меню браузера.
 */
function updateInstallHint() {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isStandaloneMode()) {
    installHint.textContent = 'Приложение уже запущено в standalone-режиме.';
    if (installBtn) {
      installBtn.hidden = true;
    }
    if (installBanner) {
      installBanner.hidden = true;
    }
    return;
  }

  if (installBanner) {
    installBanner.hidden = deferredInstallPrompt === null;
  }

  if (isSafari) {
    installHint.textContent = 'Safari: для установки используйте File → Add to Dock.';
  } else if (deferredInstallPrompt) {
    installHint.textContent = 'Нажмите кнопку, чтобы установить PWA в отдельном окне.';
  } else {
    installHint.textContent = 'Chrome / Edge: установка становится доступной после загрузки страницы.';
  }
}

/**
 * Событие beforeinstallprompt поддерживается в Chromium.
 * Здесь мы перехватываем стандартный prompt, сохраняем событие
 * и показываем свою кнопку установки в интерфейсе.
 */
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;

  if (installBtn && !isStandaloneMode()) {
    installBtn.hidden = false;
  }

  if (installBanner) {
    installBanner.hidden = false;
  }

  updateInstallHint();
});

/**
 * Нажатие на кнопку установки.
 */
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;
    console.log('Результат установки PWA:', choiceResult.outcome);

    deferredInstallPrompt = null;
    installBtn.hidden = true;
    if (installBanner) {
      installBanner.hidden = true;
    }
    updateInstallHint();
  });
}

/**
 * Если приложение установлено, скрываем кнопку.
 */
window.addEventListener('appinstalled', () => {
  console.log('PWA успешно установлено.');
  deferredInstallPrompt = null;

  if (installBtn) {
    installBtn.hidden = true;
  }
  if (installBanner) {
    installBanner.hidden = true;
  }

  updateInstallHint();
});

// =========================================================
// Регистрация Service Worker
// =========================================================

/**
 * Регистрируем Service Worker только там, где технология поддерживается.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker не поддерживается в данном браузере.');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker зарегистрирован:', registration.scope);
      await initPushSubscriptionState();
      createSocketConnection();
    } catch (error) {
      console.error('Ошибка регистрации Service Worker:', error);
    }
  });
}

function createSocketConnection() {
  if (!window.io) {
    console.warn('Socket.IO не загружен.');
    return;
  }

  socket = io();

  socket.on('connect', () => {
    console.log('Socket.IO подключение установлено.');
  });

  socket.on('taskAdded', (task) => {
    showTaskToast(task);
  });
}

function showTaskToast(task) {
  alert(`Новое событие: добавлена задача «${task.text}».`);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push-уведомления не поддерживаются этим браузером.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    await fetch('/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ subscription })
    });

    localStorage.setItem(PUSH_SUBSCRIPTION_KEY, 'subscribed');
    await updatePushButtons();
    alert('Вы успешно подписаны на уведомления.');
  } catch (error) {
    console.error('Ошибка подписки на push:', error);
    alert('Не удалось подписаться на уведомления.');
  }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push-уведомления не поддерживаются этим браузером.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      await updatePushButtons();
      return;
    }

    await fetch('/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ subscription })
    });

    await subscription.unsubscribe();
    localStorage.removeItem(PUSH_SUBSCRIPTION_KEY);
    await updatePushButtons();
    alert('Уведомления отключены.');
  } catch (error) {
    console.error('Ошибка отписки от push:', error);
    alert('Не удалось отключить уведомления.');
  }
}

async function updatePushButtons() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  const subscribed = Boolean(subscription);

  if (enablePushBtn) {
    enablePushBtn.disabled = subscribed;
  }
  if (disablePushBtn) {
    disablePushBtn.disabled = !subscribed;
  }
}

async function initPushSubscriptionState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (enablePushBtn) enablePushBtn.disabled = true;
    if (disablePushBtn) disablePushBtn.disabled = true;
    return;
  }

  try {
    await navigator.serviceWorker.ready;
    await updatePushButtons();
  } catch (error) {
    console.error('Не удалось получить состояние push-подписки:', error);
  }
}

// =========================================================
// Инициализация приложения
// =========================================================


// =========================================================
// Обработчики событий
// =========================================================

/**
 * Отправка формы добавления задачи.
 */
taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addTask(taskInput.value);
  taskForm.reset();
  taskInput.focus();
});

/**
 * Делегирование кликов по списку задач.
 * Это удобнее, чем навешивать обработчики на каждую кнопку отдельно.
 */
// =========================================================
// Инициализация
// =========================================================

function setupEventListeners() {
  taskForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addTask(taskInput.value);
    taskForm.reset();
    taskInput.focus();
  });

  taskList.addEventListener('click', handleTaskListClick);
  taskList.addEventListener('change', (event) => {
    const target = event.target;

    if (target.dataset.action !== 'toggle') {
      return;
    }

    const taskItem = target.closest('.task-item');
    if (!taskItem) {
      return;
    }

    toggleTask(taskItem.dataset.id);
  });

  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener('click', clearCompletedTasks);
  }

  if (filterAllBtn) {
    filterAllBtn.dataset.filter = 'all';
    filterAllBtn.addEventListener('click', () => setFilter('all'));
  }

  if (filterActiveBtn) {
    filterActiveBtn.dataset.filter = 'active';
    filterActiveBtn.addEventListener('click', () => setFilter('active'));
  }

  if (filterCompletedBtn) {
    filterCompletedBtn.dataset.filter = 'completed';
    filterCompletedBtn.addEventListener('click', () => setFilter('completed'));
  }

  if (newQuoteBtn) {
    newQuoteBtn.addEventListener('click', showRandomQuote);
  }

  if (enablePushBtn) {
    enablePushBtn.addEventListener('click', subscribeToPush);
  }

  if (disablePushBtn) {
    disablePushBtn.addEventListener('click', unsubscribeFromPush);
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
}

async function init() {
  setupEventListeners();
  updateNetworkStatus();
  updateInstallHint();
  showRandomQuote();
  renderTasks();
  registerServiceWorker();
}

init();
