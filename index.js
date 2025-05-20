require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(token, { polling: true });
const userMessages = new Map();
const userChoices = new Map(); // Хранение последнего выбора пользователя

// Обработка /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId,
    `*Создание ИИ-визуала для карточек товара*
    
Больше никакой аренды студий, съёмок и ожидания обработки фотографий по несколько недель. Используйте технологичные решения ИИ для создания продающего визуала в карточках товара.

*Создайте первый ИИ-визуал вашего товара абсолютно бесплатно!*`,
    { parse_mode: 'Markdown' });

  await bot.sendMessage(chatId,
    `*Маркетинговый ИИ-контент от креаторов*
    
Теперь на фото с вашим продуктом может присутствовать кто угодно. Даже леопард в кроссовках! Идеально для A/B тестов и персонализированных маркетинговых кампаний.

*Опишите свой запрос, и наши креаторы создадут невероятный контент!*`,
    { parse_mode: 'Markdown' });

  await bot.sendMessage(chatId,
    `*Мгновенная примерка товаров в дополненной реальности (AR)*

Функция AR-примерки на сайте помогает покупателям определиться с размером и цветом, снижает возвраты на 40% и увеличивает шанс покупки на 15%.

*Загрузите фото товара и получите готовое AR-решение.*`,
    { parse_mode: 'Markdown' });

  bot.sendMessage(chatId, 'Выберите действие:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Карточки товара', callback_data: 'product_cards' }],
        [{ text: 'Контент для СММ', callback_data: 'smm_content' }],
        [{ text: 'AR-примерка', callback_data: 'ar' }]
      ]
    }
  });
});

// Обработка выбора кнопок
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const username = query.from.username || `${query.from.first_name || ''} ${query.from.last_name || ''}`.trim();
  let choiceText = '';

  if (query.data === 'product_cards') {
    choiceText = 'Карточки товара';
    bot.sendMessage(chatId, 'Загрузите фото вашего товара и добавьте пожелания к визуалу');
  } else if (query.data === 'smm_content') {
    choiceText = 'Контент для СММ';
    bot.sendMessage(chatId, 'Загрузите фото вашего товара и добавьте пожелания для креатора');
  } else if (query.data === 'ar') {
    choiceText = 'AR-примерка';
    bot.sendMessage(chatId, 'Загрузите 6 фото вашего товара с разных ракурсов. Добавьте описание товара');
  }

  // Сохраняем выбор
  userChoices.set(chatId, choiceText);

  bot.answerCallbackQuery(query.id);
});

const mediaGroups = new Map();

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Пропуск команд
  if (msg.text && msg.text.startsWith('/')) return;

  // Ответ от админа пользователю
  if (String(chatId) === adminChatId && msg.reply_to_message) {
    const originalUserId = userMessages.get(msg.reply_to_message.message_id);
    if (originalUserId) {
      if (msg.text) {
        bot.sendMessage(originalUserId, msg.text);
      } else if (msg.photo) {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        bot.sendPhoto(originalUserId, photoId, { caption: msg.caption || 'Фото от администратора' });
      }
    }
    return;
  }

  // Пользовательское сообщение
  if (String(chatId) !== adminChatId) {
    const choice = userChoices.get(chatId) || 'Не выбрано';
    const username = msg.from.username || `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

    // === Альбом (группа фото)
    if (msg.media_group_id && msg.photo) {
      const groupId = msg.media_group_id;
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      const caption = msg.caption || 'Без описания';

      if (!mediaGroups.has(groupId)) {
        mediaGroups.set(groupId, {
          chatId,
          username,
          choice,
          items: [],
          timeout: null
        });
      }

      const group = mediaGroups.get(groupId);
      group.items.push({ photoId, caption });

      // Перезапуск таймера (если приходит новая часть альбома)
      clearTimeout(group.timeout);

      group.timeout = setTimeout(() => {
        const media = group.items.map((item, i) => ({
          type: 'photo',
          media: item.photoId,
          caption: i === 0 ? `📸 Фото от @${group.username || 'без имени'}\n\n*Выбор:* ${group.choice}\n\n*Описание:* ${item.caption}` : undefined,
          parse_mode: 'Markdown'
        }));

        bot.sendMediaGroup(adminChatId, media).then((sent) => {
          userMessages.set(sent[0].message_id, group.chatId);
        });

        bot.sendMessage(group.chatId, 'Спасибо! Мы обработаем ваш заказ и ответим в течение 1–2 дней.');

        mediaGroups.delete(groupId);
      }, 1500); // ждём 1.5 сек после последнего фото
      return;
    }

    // === Одиночное фото
    if (msg.photo) {
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      const caption = msg.caption || 'Без описания';

      bot.sendPhoto(adminChatId, photoId, {
        caption: `📸 Фото от @${username || 'без имени'}\n\n*Выбор:* ${choice}\n\n*Описание:* ${caption}`,
        parse_mode: 'Markdown'
      }).then(sentMsg => {
        userMessages.set(sentMsg.message_id, chatId);
      });

      bot.sendMessage(chatId, 'Спасибо! Мы обработаем ваш заказ и ответим в течение 1–2 дней.');
      return;
    }

    // === Текст
    if (msg.text) {
      bot.sendMessage(adminChatId,
        `📨 Сообщение от @${username || 'без имени'}\n\n*Выбор:* ${choice}\n\n*Текст:* ${msg.text}`, {
          parse_mode: 'Markdown'
        }).then(sentMsg => {
        userMessages.set(sentMsg.message_id, chatId);
      });

      bot.sendMessage(chatId, 'Спасибо! Мы обработаем ваше сообщение и ответим в течение 1–2 дней.');
    }
  }
});

