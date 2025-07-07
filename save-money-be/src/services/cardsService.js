const { Jimp } = require("jimp");
const QrCode = require('qrcode-reader');
import BarcodeReader from 'barcode-reader';
const supabase = require('../../supabase');


async function createQrCardFromMultipart(req, res) {
    const user_id = req.user.id;
    const { name } = req.body;
    const imageBuffer = req.file?.buffer;

    if (!name || !imageBuffer) {
        return res.status(400).json({ error: 'Липсва име или изображение' });
    }

    try {
        const image = await Jimp.read(imageBuffer);
        const qr = new QrCode();

        qr.callback = async (err, value) => {
            if (err || !value || !value.result) {
                return res.status(400).json({ error: 'QR кодът не можа да бъде разчетен' });
            }

            const qr_content = value.result;

            // Проверка дали вече съществува
            const { data: existing, error: findErr } = await supabase
                .from('qr_cards')
                .select('*')
                .eq('user_id', user_id)
                .eq('qr_content', qr_content)
                .maybeSingle();

            if (findErr) return res.status(500).json({ error: findErr.message });
            if (existing) return res.status(409).json({ error: 'Тази карта вече съществува' });

            // Запис
            const { data, error } = await supabase
                .from('qr_cards')
                .insert([{ user_id, name, qr_content }])
                .select();

            if (error) return res.status(500).json({ error: error.message });
            res.json(data[0]);
        };

        qr.decode(image.bitmap);

    } catch (e) {
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
      const image = await Jimp.read(imageBuffer);
  
      BarcodeReader(image.bitmap, async (err, result) => {
        if (err) {
          console.error('Barcode read error:', err);
          return res.status(400).json({ error: 'Баркодът не можа да бъде разчетен' });
        }
  
        if (!result) {
          return res.status(400).json({ error: 'Не беше намерен валиден баркод' });
        }
  
        const barcode_content = result;
  
        // Проверка дали вече съществува
        const { data: existing, error: findErr } = await supabase
          .from('qr_cards')
          .select('*')
          .eq('user_id', user_id)
          .eq('qr_content', barcode_content)
          .maybeSingle();
  
        if (findErr) return res.status(500).json({ error: findErr.message });
        if (existing) return res.status(409).json({ error: 'Тази карта вече съществува' });
  
        // Запис в базата с тип 'barcode'
        const { data, error } = await supabase
          .from('qr_cards')
          .insert([{ user_id, name, qr_content: barcode_content, type: 'barcode' }])
          .select();
  
        if (error) return res.status(500).json({ error: error.message });
  
        res.json(data[0]);
      });
    } catch (e) {
      console.error(e);
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


