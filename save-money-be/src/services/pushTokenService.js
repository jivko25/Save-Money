const supabase = require("../../supabase");

async function savePushTokenFunction(token, userId) {
    const { error } = await supabase
        .from('user_push_tokens')
        .upsert({ user_id: userId, token }, { onConflict: ['user_id', 'token'] });

    if (error) {
        console.error('Грешка при запис на токен:', error);
        return res.status(500).json({ error: 'Неуспешно записване на токена' });
    }
}

async function deletePushTokenFunction(userId) {
    const { error } = await supabase
        .from('user_push_tokens')
        .delete()
        .match({ user_id: userId });

    if (error) {
        console.error('Грешка при изтриване на токен:', error);
        return res.status(500).json({ error: 'Вътрешна грешка' });
    }
}

async function savePushToken(req, res) {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) return res.status(400).json({ error: 'Липсва токен' });

    await savePushTokenFunction(token, userId)

    res.status(200).json({ success: true });
}

async function deletePushToken(req, res) {
    const userId = req.user.id;

    deletePushTokenFunction(userId)

    res.status(204).send();
}

module.exports = {
    savePushToken, deletePushToken, savePushTokenFunction, deletePushTokenFunction
}