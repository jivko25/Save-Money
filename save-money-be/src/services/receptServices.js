const supabase = require("../../supabase");

async function getAllReceipts(req, res) {
    try {
        const { data, error } = await supabase.from('receipts').select('*');

        if (error) return res.status(400).json({ error });

        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
}

async function getSingleReceipt(req, res) {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', id)
            .single();

        if (error) return res.status(404).json({ error: 'Record not found' });

        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
}

async function postReceipt(req, res) {
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
}

module.exports = {
    getAllReceipts,
    getSingleReceipt,
    postReceipt
}