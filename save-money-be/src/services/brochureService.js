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
        console.log(`🔎 Намерени брошури: ${uniqueFlyers.length}`);

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
            console.log('🧭 Навигираме към:', menuUrl);

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
                    console.log('🔁 Пропусната (вече в базата):', pdfUrl);
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
                        console.log('📦 Вече съществува:', fileName);
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
        console.log(`🔎 Намерени брошури: ${uniqueUrls.length}`);

        const results = [];

        for (const rawUrl of uniqueUrls) {
            const firstBrochureUrl = transformKauflandUrl(rawUrl);
            if (!firstBrochureUrl) {
                console.warn('⚠️ Прескачане на невалиден URL:', rawUrl);
                continue;
            }

            const page2 = await browser.newPage();

            console.log('🧭 Трансформиран URL за брошура:', firstBrochureUrl);
            await page2.goto(firstBrochureUrl, { waitUntil: 'networkidle2' });

            const menuUrl = firstBrochureUrl.replace('/view/flyer/page/1', '/view/menu/page/1');

            console.log('🧭 URL за менюто:', menuUrl);
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
                    console.log('🔁 Пропусната - вече съществува в базата:', pdfUrl);
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
                        console.log('📦 Вече съществува:', fileName);
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


module.exports = { scrapeBrouchuresLidl, scrapeBrouchuresKaufland };
