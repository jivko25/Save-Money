const cron = require('node-cron');
const { scrapeBrouchuresLidl, scrapeBrouchuresKaufland, archiveExpiredBrochures, scrapeBrouchuresBilla } = require('../services/brochureService');

// Фалшиви req и res обекти
const fakeReq = {};
const fakeRes = {
    json: (data) => console.log('✅ Успех:', data),
    status: (code) => ({
        json: (err) => console.error(`❌ Грешка (${code}):`, err),
    }),
};

// Billa: сряда в 9:00
cron.schedule('0 9 * * 3', async () => {
    console.log('🕘 Стартира Billa скрейп');
    await scrapeBrouchuresBilla(fakeReq, fakeRes);
});

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

//For testing
cron.schedule('37 14 * * *', async () => {
    console.log('🕘 Стартира Kaufland скрейп');
    await scrapeBrouchuresKaufland(fakeReq, fakeRes);
}, {
    timezone: 'Europe/Sofia'
});

cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Стартиране на архивиране на изтекли брошури:', new Date().toLocaleString());
    try {
        await archiveExpiredBrochures(fakeReq, fakeRes);
    } catch (err) {
        console.error('❌ Грешка при изпълнение на архива:', err);
    }
}, {
    timezone: 'Europe/Sofia'
});