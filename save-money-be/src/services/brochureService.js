const puppeteer = require('puppeteer');
const axios = require('axios');
const supabase = require('../../supabase');

const BUCKET = 'brochures';


async function scrapeBrouchuresLidl(req, res) {
    const url = 'https://www.lidl.bg/c/broshura/s10020060';
    const store = 'Lidl';
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // 🔍 Вземаме всички линкове към брошури
        await page.waitForSelector('a.flyer', { timeout: 10000 });
        const flyerLinks = await page.$$eval('a.flyer', links =>
            links.map(a => a.href).filter(href => href.includes('/broshura/'))
        );

        const uniqueFlyers = [...new Set(flyerLinks)];

        const results = [];

        for (const flyerLink of uniqueFlyers) {
            const match = flyerLink.match(/broshura\/([^\/]+)\//);
            if (!match || !match[1]) {
                console.warn('⚠️ Пропусната брошура (няма дата):', flyerLink);
                continue;
            }

            const datePart = match[1];
            const menuUrl = `https://www.lidl.bg/l/bg/broshura/${datePart}/view/menu/page/1`;

            const brochurePage = await browser.newPage();

            try {
                await brochurePage.goto(menuUrl, { waitUntil: 'networkidle2', timeout: 60000 });

                await brochurePage.waitForSelector('section.menu', { visible: true, timeout: 15000 });
                await brochurePage.waitForSelector('a.menu-item__button[href$=".pdf"]', { visible: true, timeout: 15000 });

                const pdfUrl = await brochurePage.$eval('a.menu-item__button[href$=".pdf"]', a => a.href);
                if (!pdfUrl) {
                    console.warn('⚠️ Пропусната брошура (няма PDF):', menuUrl);
                    await brochurePage.close();
                    continue;
                }

                // Проверка в базата
                const { data: existing, error: checkError } = await supabase
                    .from('brochures')
                    .select('id')
                    .eq('pdf_url', pdfUrl)
                    .maybeSingle();

                if (checkError) throw checkError;
                if (existing) {
                    await brochurePage.close();
                    continue;
                }

                const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
                const fileBuffer = Buffer.from(pdfRes.data);
                const today = new Date().toISOString().slice(0, 10);
                const fileName = `${store.toLowerCase()}_${today}_${Math.random().toString(36).slice(2, 6)}.pdf`;

                const { error: uploadError } = await supabase.storage
                    .from(BUCKET)
                    .upload(fileName, fileBuffer, {
                        contentType: 'application/pdf',
                        upsert: false,
                    });

                if (uploadError) {
                    if (uploadError.message.includes('The resource already exists')) {
                        await brochurePage.close();
                        continue;
                    }
                    throw uploadError;
                }

                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);

                const { error: dbError } = await supabase.from('brochures').insert([{
                    store_name: store,
                    source_url: menuUrl,
                    pdf_url: pdfUrl,
                    file_name: fileName,
                    uploaded_at: new Date(),
                    expires_at: expiresAt,
                }]);

                if (dbError) throw dbError;

                results.push({ fileName, pdfUrl });
                await brochurePage.close();
            } catch (errInner) {
                console.warn('❌ Пропусната поради грешка:', menuUrl, errInner.message);
                await brochurePage.close();
            }
        }

        await browser.close();

        return res.json({
            message: '✅ Всички брошури са обработени.',
            total: results.length,
            files: results,
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error('❌ Lidl scraper error:', err.message);
        return res.status(500).json({
            error: 'Грешка при скрейпване или качване.',
            details: err.message,
        });
    }
}

function transformKauflandUrl(rawUrl) {
    if (!rawUrl.includes('/ar/')) return null;
    return rawUrl.replace('/ar/', '/view/flyer/page/1');
}

async function scrapeBrouchuresKaufland(req, res) {
    const url = 'https://www.kaufland.bg/broshuri.html';
    const store = 'Kaufland';
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('a.m-flyer-tile__link', { timeout: 15000 });

        const rawUrls = await page.$$eval('a.m-flyer-tile__link', links =>
            links.map(a => a.href).filter(href => href.includes('/ar/'))
        );

        const uniqueUrls = [...new Set(rawUrls)];

        const results = [];

        for (const rawUrl of uniqueUrls) {
            const firstBrochureUrl = transformKauflandUrl(rawUrl);
            if (!firstBrochureUrl) {
                console.warn('⚠️ Прескачане на невалиден URL:', rawUrl);
                continue;
            }

            const page2 = await browser.newPage();

            await page2.goto(firstBrochureUrl, { waitUntil: 'networkidle2' });

            const menuUrl = firstBrochureUrl.replace('/view/flyer/page/1', '/view/menu/page/1');

            await page2.goto(menuUrl, { waitUntil: 'networkidle2' });

            try {
                await page2.waitForSelector('a.menu-item__button[href$=".pdf"]', {
                    visible: true,
                    timeout: 15000,
                });

                const pdfUrl = await page2.$eval('a.menu-item__button[href$=".pdf"]', a => a.href);
                if (!pdfUrl) throw new Error('Не е намерен линк към PDF файла.');

                // 🔍 Проверка в базата дали този PDF вече съществува
                const { data: existing, error: checkError } = await supabase
                    .from('brochures')
                    .select('id')
                    .eq('pdf_url', pdfUrl)
                    .maybeSingle();

                if (checkError) throw checkError;
                if (existing) {
                    await page2.close();
                    continue;
                }

                const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
                const fileBuffer = Buffer.from(pdfRes.data);

                const today = new Date().toISOString().slice(0, 10);
                const fileName = `${store.toLowerCase()}_${today}_${Math.random().toString(36).slice(2, 6)}.pdf`;

                const { error: uploadError } = await supabase.storage
                    .from(BUCKET)
                    .upload(fileName, fileBuffer, {
                        contentType: 'application/pdf',
                        upsert: false,
                    });

                if (uploadError) {
                    if (uploadError.message.includes('The resource already exists')) {
                        await page2.close();
                        continue;
                    }
                    throw uploadError;
                }

                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);

                const { error: dbError } = await supabase.from('brochures').insert([{
                    store_name: store,
                    source_url: menuUrl,
                    pdf_url: pdfUrl,
                    file_name: fileName,
                    uploaded_at: new Date(),
                    expires_at: expiresAt,
                }]);

                if (dbError) throw dbError;

                results.push({ fileName, pdfUrl });
                await page2.close();
            } catch (innerErr) {
                console.warn('❌ Пропускане на брошура:', menuUrl, innerErr.message);
                await page2.close();
            }
        }

        await browser.close();

        return res.json({
            message: '✅ Всички брошури са обработени.',
            total: results.length,
            files: results,
        });

    } catch (err) {
        if (browser) await browser.close();
        console.error('❌ Kaufland scraper error:', err.message);
        return res.status(500).json({ error: 'Грешка при скрейпване или качване.', details: err.message });
    }
}

async function scrapeBrouchuresBilla(req, res) {
    const url = 'https://www.billa.bg/promocii/sedmichna-broshura';
    const store = 'Billa';
    let browser;
  
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
  
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2' });
  
      // Изчакваме малко, защото има iframe и динамично зареждане
      await new Promise(resolve => setTimeout(resolve, 5000));
  
      // Достъп до iframe, където се намира линка
      const iframeElement = await page.$('iframe');
      if (!iframeElement) {
        throw new Error('Не намерих iframe с id "publitas-iframe"');
      }
      const iframe = await iframeElement.contentFrame();
  
      if (!iframe) {
        throw new Error('Не мога да взема contentFrame на iframe');
      }
  
      // Изчакваме бутона за сваляне на PDF
      await iframe.waitForSelector('a#downloadAsPdf[href$=".pdf"]', { timeout: 10000 });
  
      // Взимаме линка на PDF
      const pdfUrl = await iframe.$eval('a#downloadAsPdf', el => el.href);
      if (!pdfUrl) {
        throw new Error('Не намерих линк към PDF');
      }
  
      // Проверяваме дали вече имаме тази брошура в базата
      const { data: existing, error: checkError } = await supabase
        .from('brochures')
        .select('id')
        .eq('pdf_url', pdfUrl)
        .maybeSingle();
  
      if (checkError) throw checkError;
  
      if (existing) {
        await browser.close();
        return res.json({
          message: 'Брошурата вече съществува в базата.',
          pdfUrl,
        });
      }
  
      // Сваляме PDF файла
      const pdfRes = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
      const fileBuffer = Buffer.from(pdfRes.data);
      const today = new Date().toISOString().slice(0, 10);
      const fileName = `${store.toLowerCase()}_${today}_${Math.random().toString(36).slice(2, 6)}.pdf`;
  
      // Качваме в Supabase bucket
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, fileBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        });
  
      if (uploadError) {
        if (uploadError.message.includes('The resource already exists')) {
          await browser.close();
          return res.json({
            message: 'Файлът вече съществува в bucket-а.',
            pdfUrl,
          });
        }
        throw uploadError;
      }
  
      // Запис в базата
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
  
      const { error: dbError } = await supabase.from('brochures').insert([{
        store_name: store,
        source_url: url,
        pdf_url: pdfUrl,
        file_name: fileName,
        uploaded_at: new Date(),
        expires_at: expiresAt,
      }]);
  
      if (dbError) throw dbError;
  
      await browser.close();
  
      return res.json({
        message: 'Брошурата е успешно свалена и записана.',
        fileName,
        pdfUrl,
      });
    } catch (err) {
      if (browser) await browser.close();
      console.error('❌ Billa scraper error:', err.message);
      return res.status(500).json({
        error: 'Грешка при скрейпване или качване.',
        details: err.message,
      });
    }
  }

async function archiveExpiredBrochures(req, res) {
    try {
        const now = new Date().toISOString();

        // 1. Намираме всички, които са изтекли и още не са архивирани
        const { data: expired, error } = await supabase
            .from('brochures')
            .select('id')
            .lt('expires_at', now)
            .eq('archived', false);

        if (error) throw error;

        if (!expired || expired.length === 0) {
            return res.json({ message: 'Няма изтекли брошури за архивиране.' });
        }

        const ids = expired.map(b => b.id);

        // 2. Обновяваме колоната archived на true за намерените записи
        const { error: updateError } = await supabase
            .from('brochures')
            .update({ archived: true })
            .in('id', ids);

        if (updateError) throw updateError;

        return res.json({
            message: 'Успешно архивирани изтеклите брошури.',
            count: ids.length,
            archivedIds: ids,
        });

    } catch (err) {
        console.error('Грешка при архивиране:', err.message);
        return res.status(500).json({ error: 'Грешка при архивиране.', details: err.message });
    }
}

async function getAllBrochures(req, res) {
    try {
        const { store, archived } = req.query;

        let query = supabase
            .from('brochures')
            .select('*')
            .order('uploaded_at', { ascending: false });

        // По подразбиране скрива архивираните
        if (archived !== 'true') {
            query = query.eq('archived', false);
        }

        // Филтър по магазин (по частично съвпадение, case-insensitive)
        if (store) {
            query = query.ilike('store_name', `%${store}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.json({ brochures: data });
    } catch (err) {
        console.error('❌ Грешка при getAllBrochures:', err.message);
        return res.status(500).json({ error: 'Грешка при взимане на брошурите.', details: err.message });
    }
}

// Взима брошура по ID
async function getBrochureById(req, res) {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('brochures')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // не е намерен запис
                return res.status(404).json({ error: 'Брошурата не е намерена.' });
            }
            throw error;
        }

        return res.json({ brochure: data });
    } catch (err) {
        console.error('❌ Грешка при getBrochureById:', err.message);
        return res.status(500).json({ error: 'Грешка при взимане на брошурата.', details: err.message });
    }
}

module.exports = {
    getAllBrochures,
    getBrochureById,
};



module.exports = { scrapeBrouchuresLidl, scrapeBrouchuresKaufland, archiveExpiredBrochures, getBrochureById, getAllBrochures, scrapeBrouchuresBilla };
