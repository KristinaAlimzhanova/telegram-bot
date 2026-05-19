const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('Не задан BOT_TOKEN в переменных окружения');
}

const bot = new TelegramBot(token, { polling: true });
const db = new sqlite3.Database('./appeals.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS appeals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      message_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'Здравствуйте! Я помогу зарегистрировать ваше обращение и подготовить ответ. Напишите ваш запрос в следующем сообщении.'
  );
});

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildProfessionalReply(text) {
  return [
    'Спасибо за ваше обращение.',
    `Мы зафиксировали ваш запрос: "${text}".`,
    'Наши специалисты уже анализируют информацию и подготовят дальнейшие шаги в ближайшее время.',
    'Если потребуется дополнительная информация, мы обязательно свяжемся с вами.',
  ].join('\n');
}

bot.on('message', (msg) => {
  const text = msg.text?.trim();

  if (!text || text.startsWith('/')) {
    return;
  }

  const telegramId = msg.from.id;
  const username = msg.from.username || null;
  const firstName = msg.from.first_name || null;
  const nowIso = new Date().toISOString();

  db.get(
    `SELECT created_at FROM appeals
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [telegramId],
    (selectError, row) => {
      if (selectError) {
        console.error('Ошибка чтения БД:', selectError);
        bot.sendMessage(msg.chat.id, 'Произошла ошибка при обработке обращения. Попробуйте позже.');
        return;
      }

      db.run(
        `INSERT INTO appeals (telegram_id, username, first_name, message_text, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [telegramId, username, firstName, text, nowIso],
        (insertError) => {
          if (insertError) {
            console.error('Ошибка записи в БД:', insertError);
            bot.sendMessage(msg.chat.id, 'Произошла ошибка при сохранении обращения. Попробуйте позже.');
            return;
          }

          if (!row) {
            bot.sendMessage(msg.chat.id, 'Ваше обращение зарегистрировано.');
          } else {
            bot.sendMessage(
              msg.chat.id,
              `Вы уже обращались ранее. Последнее обращение было: ${formatDate(row.created_at)}.`
            );
          }

          bot.sendMessage(msg.chat.id, buildProfessionalReply(text));
        }
      );
    }
  );
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
