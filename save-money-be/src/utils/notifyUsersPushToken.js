const { Expo } = require('expo-server-sdk');
const expo = new Expo();

/**
 * Изпраща push нотификация до списък от Expo токени
 * @param {string[]} tokens - масив от валидни Expo push токени
 * @param {string} title - заглавие на нотификацията
 * @param {string} body - съдържание на нотификацията
 * @param {object} data - допълнителни данни за нотификацията (опционално)
 */
async function sendPushNotification(tokens, title, body, data = {}) {
  const messages = tokens
    .filter(token => Expo.isExpoPushToken(token))
    .map(token => ({
      to: token,
      sound: 'duck-quack.mp3',
      title,
      body,
      data,
    }));

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    return { success: true, sent: messages.length };
  } catch (err) {
    console.error('❌ Грешка при изпращане на push:', err);
    return { success: false, error: err };
  }
}

module.exports = sendPushNotification;