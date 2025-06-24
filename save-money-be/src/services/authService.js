const supabase = require('../../supabase');

async function register(req, res) {
    const { email, password } = req.body;

    try {
        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) return res.status(400).json({ error: error.message });

        res.status(201).json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
}

async function login(req, res) {
    const { email, password } = req.body;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) return res.status(401).json({ error: error.message });

        res.status(200).json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during login.' });
    }
}

// Middleware за защита на роути
async function verifySession(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = data.user; // прикачваме потребителя към заявката
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Authentication failed.' });
    }
}

module.exports = {
    register,
    login,
    verifySession
};
