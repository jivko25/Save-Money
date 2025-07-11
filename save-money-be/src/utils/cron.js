const cron = require('node-cron');
const {
    scrapeBrouchuresLidl,
    scrapeBrouchuresKaufland,
    scrapeBrouchuresBilla,
    archiveExpiredBrochures,
} = require('../services/brochureService');

// Фалшиви req и res обекти
const fakeReq = {};
const fakeRes = {
    json: (data) => console.log('✅ Успех:', data),
    status: (code) => ({
        json: (err) => console.error(`❌ Грешка (${code}):`, err),
    }),
};

// 🕗 Ежедневна задача в 8:00 сутринта
cron.schedule('0 8 * * *', async () => {
    console.log('🚀 Стартира ежедневен скрейп в 8:00:', new Date().toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' }));
    try {
        console.log('🔍 Скрейп Billa...');
        await scrapeBrouchuresBilla(fakeReq, fakeRes);

        console.log('🔍 Скрейп Lidl...');
        await scrapeBrouchuresLidl(fakeReq, fakeRes);

        console.log('🔍 Скрейп Kaufland...');
        await scrapeBrouchuresKaufland(fakeReq, fakeRes);

        // console.log('📦 Архивиране на изтекли...');
        // await archiveExpiredBrochures(fakeReq, fakeRes);

        console.log('✅ Скрейп и архивиране завършени успешно.');
    } catch (err) {
        console.error('❌ Грешка при изпълнение на дневната задача:', err.message);
    }
}, {
    timezone: 'Europe/Sofia',
});
