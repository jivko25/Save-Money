const {
  scrapeBrouchuresLidl,
  scrapeBrouchuresKaufland,
  scrapeBrouchuresBilla,
} = require('../src/services/brochureService');

const TIMEOUT_MS = 28 * 60 * 1000;

function createRes() {
  return {
    json: (data) => {
      console.log('✅ Успех:', data?.message || data);
    },
    status: (code) => ({
      json: (err) => {
        const message = err?.details || err?.error || JSON.stringify(err);
        if (code >= 400) {
          throw new Error(message);
        }
        console.log(message);
      },
    }),
  };
}

async function main() {
  console.log(
    '🚀 Стартира дневен скрейп:',
    new Date().toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' })
  );

  console.log('🔍 Скрейп Billa...');
  await scrapeBrouchuresBilla({}, createRes());

  console.log('🔍 Скрейп Lidl...');
  await scrapeBrouchuresLidl({}, createRes());

  console.log('🔍 Скрейп Kaufland...');
  await scrapeBrouchuresKaufland({}, createRes());

  console.log('✅ Скрейп завършен успешно.');
}

const timeout = setTimeout(() => {
  console.error('❌ Таймаут: скрейпът надвиши 28 минути.');
  process.exit(1);
}, TIMEOUT_MS);

main()
  .catch((err) => {
    console.error('❌ Грешка при скрейп:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(timeout);
  });
