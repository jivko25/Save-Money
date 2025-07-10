const supabase = require('../../supabase');
const sendPushNotification = require('../utils/notifyUsersPushToken');

/**
 * Изпраща нотификация за нова версия на приложението до всички потребители
 * @param {string} version - версия на приложението
 * @param {string} url - URL за изтегляне на новата версия
 */
async function notifyAppUpdate(version, url) {
    try {
        // Вземи всички push токени от всички потребители
        const { data: tokens, error: tokensError } = await supabase
            .from('user_push_tokens')
            .select('token');

        if (tokensError) {
            console.error('Грешка при извличане на токени:', tokensError);
            return { success: false, error: tokensError.message };
        }

        if (!tokens || tokens.length === 0) {
            return { success: false, error: 'Няма регистрирани push токени' };
        }

        const title = 'Нова версия е налична!';
        const body = `Достъпна е нова версия ${version} на приложението. Изтеглете я сега!`;

        // Подготви данни за нотификацията
        const data = {
            type: 'app_update',
            version: version,
            url: url,
            action: 'open_url'
        };

        // Изпрати нотификацията
        const pushTokens = tokens.map(token => token.token);
        const result = await sendPushNotification(pushTokens, title, body, data);

        return result;
    } catch (error) {
        console.error('Грешка при изпращане на нотификация за нова версия:', error);
        return { success: false, error: error.message };
    }
}

async function sendAppUpdateNotification(req, res) {
    try {
        const { version, url } = req.body;

        if (!version || !url) {
            return res.status(400).json({ 
                error: 'Липсват задължителни полета: version, url' 
            });
        }

        // Валидация на URL
        try {
            new URL(url);
        } catch (error) {
            return res.status(400).json({ 
                error: 'Невалиден URL формат' 
            });
        }

        const result = await notifyAppUpdate(version, url);

        if (result.success) {
            return res.status(200).json({ 
                success: true, 
                message: 'Нотификацията за нова версия е изпратена успешно',
                sent: result.sent,
                version,
                url
            });
        } else {
            return res.status(500).json({ 
                success: false, 
                error: result.error 
            });
        }
    } catch (error) {
        console.error('Грешка при изпращане на нотификация за нова версия:', error);
        return res.status(500).json({ error: 'Вътрешна грешка на сървъра' });
    }
}

module.exports = {
    notifyAppUpdate,
    sendAppUpdateNotification
}; 