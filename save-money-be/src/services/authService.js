const supabase = require('../../supabase');

async function register(req, res) {
    const { email, password, displayName } = req.body; // <--- Приемаме displayName

    if (!displayName) {
        return res.status(400).json({ error: 'Показваното име (display name) е задължително.' });
    }

    try {
        // Използваме 'data' опцията на signUp за допълнителни метаданни
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { // <--- Използваме 'options' обект за допълнителни данни
                data: {
                    display_name: displayName, // <--- Запазваме display name
                    // Може да добавите и други дефолтни данни тук, ако е необходимо
                },
            },
        });

        if (error) {
            // Supabase често връща грешки като "User already registered" или "Invalid email"
            return res.status(400).json({ error: error.message });
        }

        // Ако искаш да върнеш потребителските данни веднага, те са в data.user
        // Но при signUp с потвърждение по имейл, data.user може да е null, докато не се потвърди
        res.status(201).json({ message: 'Регистрацията е успешна. Моля, потвърдете имейла си.', user: data.user });
    } catch (err) {
        console.error('Грешка при регистрация на сървъра:', err);
        res.status(500).json({ error: 'Вътрешна сървърна грешка при регистрация.' });
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
