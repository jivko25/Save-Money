const { scrapeBrouchuresLidl, scrapeBrouchuresKaufland, scrapeBrouchuresBilla } = require('../src/services/brochureService');

function is9amInSofiaNow() {
  try {
    const now = new Date();
    const hourStr = new Intl.DateTimeFormat('bg-BG', {
      timeZone: 'Europe/Sofia',
      hour: '2-digit',
      hour12: false,
    }).format(now);
    const hour = parseInt(hourStr, 10);
    return hour === 9;
  } catch (e) {
    // Ако по някаква причина конверсията се провали, не пускаме скрипта
    console.error('Time zone check failed:', e.message);
    return false;
  }
}

module.exports = async (req, res) => {
  console.log('Cron: /api/cron/daily-scrape invoked at', new Date().toISOString());

  if (!is9amInSofiaNow()) {
    res.statusCode = 204;
    res.end('Skipped: not 09:00 Europe/Sofia');
    return;
  }

  try {
    console.log('🔍 Скрейп Billa...');
    await scrapeBrouchuresBilla();

    console.log('🔍 Скрейп Lidl...');
    await scrapeBrouchuresLidl();

    console.log('🔍 Скрейп Kaufland...');
    await scrapeBrouchuresKaufland();

    console.log('✅ Скрейп завършен успешно (cron).');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Скрейп завършен успешно' }));
  } catch (err) {
    console.error('❌ Грешка при скрейп (cron):', err.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Грешка при скрейп (cron)' }));
  }
};

