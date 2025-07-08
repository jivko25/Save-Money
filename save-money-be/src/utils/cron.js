const cron = require('node-cron');
const { scrapeBrouchuresLidl, scrapeBrouchuresKaufland } = require('../services/brochureService');

// Фалшиви req и res обекти
const fakeReq = {};
const fakeRes = {
    json: (data) => console.log('✅ Успех:', data),
    status: (code) => ({
        json: (err) => console.error(`❌ Грешка (${code}):`, err),
    }),
};

// Lidl: четвъртък в 9:00
cron.schedule('0 9 * * 4', async () => {
    console.log('🕘 Стартира Lidl скрейп');
    await scrapeBrouchuresLidl(fakeReq, fakeRes);
});

// Kaufland: петък в 9:00
cron.schedule('0 9 * * 5', async () => {
    console.log('🕘 Стартира Kaufland скрейп');
    await scrapeBrouchuresKaufland(fakeReq, fakeRes);
});

cron.schedule('35 14 * * *', () => {
    console.log('🔥 Задачата се изпълни в 14:35 БГ време!');
}, {
    timezone: 'Europe/Sofia'
});