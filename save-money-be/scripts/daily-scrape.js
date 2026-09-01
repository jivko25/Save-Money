const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Липсват SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY. Локално попълни save-money-be/.env; в GitHub Actions ги добави като repository secrets (Settings → Secrets and variables → Actions).'
  );
  process.exit(1);
}

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
