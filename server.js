const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const webpush = require('web-push');

const VAPID_PUBLIC_KEY = 'BBvh44fl9I5XDzI6F26gRCgeLLf0NW0PX-SNG0CNd2bSP3jNydtSqgGTvcNCuD_fZgB_xRF7Ocy8x-v97LPU-fU';
const VAPID_PRIVATE_KEY = '3a385c-q0YOyjTSL23-3tyvzGsSNQTstXV0unSqh0mI';

webpush.setVapidDetails(
  'mailto:admin@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const subscriptions = [];
const activeReminders = new Map();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

app.post('/subscribe', (req, res) => {
  const { subscription } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription data' });
  }

  const exists = subscriptions.some((item) => item.endpoint === subscription.endpoint);
  if (!exists) {
    subscriptions.push(subscription);
  }

  return res.status(201).json({ success: true });
});

app.post('/unsubscribe', (req, res) => {
  const { subscription } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription data' });
  }

  const index = subscriptions.findIndex((item) => item.endpoint === subscription.endpoint);
  if (index !== -1) {
    subscriptions.splice(index, 1);
  }

  return res.status(200).json({ success: true });
});

function cancelReminder(taskId) {
  const entry = activeReminders.get(taskId);
  if (!entry) {
    return;
  }

  clearTimeout(entry.timerId);
  activeReminders.delete(taskId);
}

async function sendReminderNotification(task) {
  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title: 'PlanDo: напоминание',
    body: `Не забудьте: ${task.text}`,
    data: { taskId: task.id, text: task.text },
    actions: [{ action: 'snooze', title: 'Отложить на 5 минут' }]
  });

  await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(subscription, payload).catch((error) => {
        if (error.statusCode === 410 || error.statusCode === 404) {
          const index = subscriptions.findIndex((item) => item.endpoint === subscription.endpoint);
          if (index !== -1) {
            subscriptions.splice(index, 1);
          }
        }
        console.error('Push send failed:', error);
      })
    )
  );
}

function scheduleReminder(task) {
  cancelReminder(task.id);

  const reminderTime = Number(task.reminder);
  if (!reminderTime || Number.isNaN(reminderTime)) {
    return;
  }

  const delay = reminderTime - Date.now();

  if (delay <= 0) {
    sendReminderNotification(task).catch((error) => console.error('Ошибка отправки уведомления:', error));
    return;
  }

  const timerId = setTimeout(async () => {
    activeReminders.delete(task.id);
    await sendReminderNotification(task);
  }, delay);

  activeReminders.set(task.id, { task, timerId });
}

app.post('/schedule-reminder', (req, res) => {
  const { id, text, reminder } = req.body;

  if (!id || !text || !reminder) {
    return res.status(400).json({ error: 'Invalid reminder data' });
  }

  const task = {
    id,
    text,
    reminder: Number(reminder)
  };

  scheduleReminder(task);

  return res.status(200).json({ success: true });
});

app.post('/postpone-reminder', (req, res) => {
  const { taskId } = req.body;

  if (!taskId) {
    return res.status(400).json({ error: 'Invalid task identifier' });
  }

  const entry = activeReminders.get(taskId);
  if (!entry) {
    return res.status(404).json({ error: 'Reminder not found' });
  }

  const newReminderTime = Date.now() + 5 * 60 * 1000;
  entry.task.reminder = newReminderTime;
  scheduleReminder(entry.task);

  return res.status(200).json({ success: true, reminder: newReminderTime });
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('newTask', async (task) => {
    socket.broadcast.emit('taskAdded', task);
    await sendPushNotification(task);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

async function sendPushNotification(task) {
  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title: 'PlanDo',
    body: `Новая задача: ${task.text}`,
    data: { taskId: task.id }
  });

  await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(subscription, payload).catch((error) => {
        if (error.statusCode === 410 || error.statusCode === 404) {
          const index = subscriptions.findIndex((item) => item.endpoint === subscription.endpoint);
          if (index !== -1) {
            subscriptions.splice(index, 1);
          }
        }
        console.error('Push send failed:', error);
      })
    )
  );
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
  console.log(`VAPID public key: ${VAPID_PUBLIC_KEY}`);
});
