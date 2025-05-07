const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const supabase = require('./supabase');

const app = express();
const PORT = 3000;

app.use(cors()); // позволява заявки от различни домейни (например от телефона)
app.use(bodyParser.json()); // за да може да чете JSON от тялото на заявката

app.get('/api/test', (req, res) => {
  res.json('test')
})

// POST endpoint за QR данните
app.post('/qr', (req, res) => {
  const { data } = req.body;

  if (!data) {
    return res.status(400).json({ error: 'No data provided' });
  }

  console.log('QR код получен:', data);

  // Тук можеш да запишеш в база, лог файл или да върнеш обработка
  res.status(200).json({ message: 'QR кодът е получен успешно', received: data });
});

app.post('/api/scan', async (req, res) => {
    const { raw_code, budget_id, scanned_by } = req.body;
  
    try {
      const [receiptNumber, _, date, time, amountStr] = raw_code.split('*');
      const amount = parseFloat(amountStr);
  
      const { data, error } = await supabase.from('receipts').insert({
        budget_id,
        scanned_by,
        date,
        time,
        amount,
        raw_code,
      });
  
      if (error) return res.status(400).json({ error });
  
      res.json({ success: true, data });
    } catch (err) {
        console.log(err);
        
      res.status(500).json({ error: 'Invalid QR format or server error.' });
    }
  });

app.listen(PORT, () => {
  console.log(`Сървърът работи на http://localhost:${PORT}`);
});

export default app;
