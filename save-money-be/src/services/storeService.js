const supabase = require("../../supabase");

async function getAllStores(req, res) {
    try {
        const { data, error } = await supabase
            .from('stores')
            .select('id, name, logo')
            .order('name', { ascending: true });

        if (error) {
            console.error('Грешка при взимане на магазини:', error);
            return res.status(500).json({ error: error.message });
        }

        res.json(data);
    } catch (err) {
        console.error('Вътрешна грешка:', err);
        res.status(500).json({ error: 'Вътрешна сървърна грешка' });
    }
}

module.exports = {
    getAllStores
}