const { Jimp } = require("jimp");
const QrCode = require('qrcode-reader');
const supabase = require('../../supabase');
const javascriptBarcodeReader = require('javascript-barcode-reader');


// Асинхронна функция за създаване на QR карта от качен файл (multipart form-data)
async function createQrCardFromMultipart(req, res) {
    // ID на текущия потребител от middleware-а за автентикация
    const user_id = req.user.id;

    // Вземаме име на картата от body-то на заявката
    const { name } = req.body;

    // Буферът с каченото изображение (ако няма, ще е undefined)
    const imageBuffer = req.file?.buffer;

    // Проверка дали е подадено име и изображение
    if (!name || !imageBuffer) {
        return res.status(400).json({ error: 'Липсва име или изображение' });
    }

    try {
        // Четем изображението с Jimp (библиотека за работа с изображения)
        const image = await Jimp.read(imageBuffer);

        // Създаваме нов обект за разчитане на QR код
        const qr = new QrCode();

        // Дефинираме callback функция, която се изпълнява след опит за разчитане
        qr.callback = async (err, value) => {
            // Ако не може да се разчете QR кода
            if (err || !value || !value.result) {
                return res.status(400).json({ error: 'QR кодът не можа да бъде разчетен' });
            }

            // Извличаме съдържанието от QR кода
            const qr_content = value.result;

            // Проверка в базата дали вече съществува карта със същото съдържание за този потребител
            const { data: existing, error: findErr } = await supabase
                .from('qr_cards')
                .select('*')
                .eq('user_id', user_id)
                .eq('qr_content', qr_content)
                .maybeSingle();

            // Ако има грешка при търсенето
            if (findErr) return res.status(500).json({ error: findErr.message });

            // Ако вече съществува карта с такъв QR код
            if (existing) return res.status(409).json({ error: 'Тази карта вече съществува' });

            // Ако не съществува — записваме нова карта в базата
            const { data, error } = await supabase
                .from('qr_cards')
                .insert([{ user_id, name, qr_content }])
                .select();

            // Ако има грешка при записа
            if (error) return res.status(500).json({ error: error.message });

            // Връщаме създадената карта като отговор
            res.json(data[0]);
        };

        // Стартираме декодирането на QR кода от изображението
        qr.decode(image.bitmap);

    } catch (e) {
        // Ако има грешка при четене или обработка на изображението
        console.log(e);
        res.status(500).json({ error: 'Грешка при обработка на изображението' });
    }
};

async function createBarcodeCard(req, res) {
    const user_id = req.user.id;
    const { name } = req.body;
    const imageBuffer = req.file?.buffer;

    if (!name || !imageBuffer) {
        return res.status(400).json({ error: 'Липсва име или изображение' });
    }

    try {
        // Зареждаме изображението с Jimp, за да го подготвим
        const image = await Jimp.read(imageBuffer);
        
        // Конвертираме изображението в Uint8ClampedArray с нужната форма за библиотеката
        const { data, bitmap } = image;
        const imageData = {
            data: new Uint8ClampedArray(data?.buffer),
            width: bitmap.width,
            height: bitmap.height,
        };

        // Четем баркода - по подразбиране "auto" формат
        const barcodeContent = await javascriptBarcodeReader({
            image: imageData,
            barcode: 'code-128', // или можеш да зададеш конкретен формат, ако знаеш
        });


        if (!barcodeContent) {
            return res.status(400).json({ error: 'Не беше намерен валиден баркод' });
        }

        // Проверка дали вече съществува
        const { data: existing, error: findErr } = await supabase
            .from('qr_cards')
            .select('*')
            .eq('user_id', user_id)
            .eq('qr_content', barcodeContent)
            .maybeSingle();

        if (findErr) return res.status(500).json({ error: findErr.message });
        if (existing) return res.status(409).json({ error: 'Тази карта вече съществува' });

        // Запис в базата с тип 'barcode'
        const { data: insertData, error: insertErr } = await supabase
            .from('qr_cards')
            .insert([{ user_id, name, qr_content: barcodeContent, type: 'barcode' }])
            .select();

        if (insertErr) return res.status(500).json({ error: insertErr.message });

        res.json(insertData[0]);
    } catch (e) {
        console.error('Грешка при обработка на баркода:', e);
        res.status(500).json({ error: 'Грешка при обработка на изображението' });
    }
}

async function getQrCardById(req, res) {
    const user_id = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
        .from('qr_cards')
        .select('*')
        .eq('id', id)
        .eq('user_id', user_id)
        .single();

    if (error || !data) {
        return res.status(404).json({ error: 'Картата не е намерена или не принадлежи на потребителя' });
    }

    res.json(data);
};

async function getAllQrCardsForUser(req, res) {
    const user_id = req.user.id;

    const { data, error } = await supabase
        .from('qr_cards')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json(data);
};

async function deleteQrCard(req, res) {
    const user_id = req.user.id;
    const { id } = req.params;

    // Уверяваме се, че картата е на текущия потребител
    const { data: existing, error: findErr } = await supabase
        .from('qr_cards')
        .select('id')
        .eq('id', id)
        .eq('user_id', user_id)
        .maybeSingle();

    if (findErr || !existing) {
        return res.status(404).json({ error: 'Картата не е намерена или не е ваша' });
    }

    const { error } = await supabase
        .from('qr_cards')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
};

module.exports = {
    createQrCardFromMultipart,
    createBarcodeCard,
    getQrCardById,
    getAllQrCardsForUser,
    deleteQrCard
}


