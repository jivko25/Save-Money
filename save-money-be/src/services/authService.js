const supabase = require('../../supabase');
const { savePushTokenFunction, deletePushTokenFunction } = require('./pushTokenService');

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
  const { email, password, pushToken } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return res.status(401).json({ error: error.message });

    if (pushToken) {
      savePushTokenFunction(pushToken, data.user.id);
      data.pushToken = pushToken;
    }

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

async function getMe(req, res) {
  const refreshToken = req.headers.authorization?.replace('Bearer ', '');

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is missing.' });
  }

  try {
    // Създаваме currentSession обект с refresh_token
    const currentSession = {
      refresh_token: refreshToken,
    };

    // Извикваме refreshSession от supabase.auth
    const { data, error } = await supabase.auth.refreshSession(currentSession);

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    if (!data.session) {
      return res.status(401).json({ error: 'Failed to refresh session.' });
    }

    const user = data.session.user;

    // Вземаме допълнителни потребителски данни, примерно от таблицата profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.warn('Error fetching profile:', profileError.message);
    }

    return res.status(200).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        display_name: profile?.display_name || null,
      },
    });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Server error during session refresh.' });
  }
}

async function logout(req, res) {
  try {
    const userId = req.user?.id; // приемаме, че middleware verifySession вече прикачи user
    if (!userId) {
      return res.status(401).json({ error: 'Потребителят не е автентикиран.' });
    }

    // Изтриваме всички push токени на този потребител (или конкретен токен, ако подадеш)
    await deletePushTokenFunction(userId)

    // Също така може да изтриеш сесията в supabase (ако искаш да направиш пълно логаут)
    await supabase.auth.signOut();

    res.status(200).json({ message: 'Изходът е успешен, пуш токените са изтрити.' });
  } catch (err) {
    console.error('Грешка при logout:', err);
    res.status(500).json({ error: 'Вътрешна сървърна грешка при logout.' });
  }
}

module.exports = {
  register,
  login,
  verifySession,
  getMe,
  logout
};
