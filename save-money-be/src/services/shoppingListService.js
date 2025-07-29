const vision = require('@google-cloud/vision');
const supabase = require('../../supabase');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenAI } = require('@google/genai');

const client = new vision.ImageAnnotatorClient({
    credentials: {
        type: process.env.GOOGLE_TYPE,
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Връща реален нов ред
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: process.env.GOOGLE_AUTH_URI,
        token_uri: process.env.GOOGLE_TOKEN_URI,
        auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
        client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
        universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
    }
});

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

function extractJsonFromMarkdown(text) {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (!match) throw new Error("No valid JSON block found");
    return JSON.parse(match[1]);
}

async function processTextWithGemini(rawText) {
    const prompt = `
    Извлечи структурирана информация от следния неструктуриран OCR текст.
    
    Върни САМО валиден JSON обект с полетата:
    - product: Името на продукта. Ако няма име, върне null.
    - brand: Марката. Ако няма марка, върне null.
    - weight: Грамаж или количество, ако има. Ако няма, върне null.
    
    Не добавяй обяснения, без markdown, без "Изход:" — само валиден JSON.
    
    Входен текст:
    "${rawText}"
    `;
    
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    
    const jsonText = extractJsonFromMarkdown(response.text);
    console.log(jsonText);
    return jsonText;
}

async function createShoppingList(req, res) {
    const { name } = req.body;
    const userId = req.user.id;

    try {
        // 1. Вмъкваме новия списък и връщаме създадения ред
        const { data: listData, error: listError } = await supabase
            .from('shopping_lists')
            .insert([{ name, created_by: userId }])
            .select()
            .single();

        if (listError) throw listError;

        // 2. Вмъкваме запис в user_shopping_lists за връзка на потребителя със списъка
        const { error: userListError } = await supabase
            .from('user_shopping_lists')
            .insert([{
                user_id: userId,
                shopping_list_id: listData.id,
                role: 'member',
            }]);

        if (userListError) throw userListError;

        // 3. Връщаме създадения списък
        res.status(201).json(listData);

    } catch (error) {
        console.error('Error creating shopping list:', error);
        res.status(500).json({ error: error.message });
    }
}


async function getShoppingLists(req, res) {
    const userId = req.user.id;

    const { data, error } = await supabase
        .from('user_shopping_lists')
        .select('shopping_list_id, shopping_lists(*)')
        .eq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });

    const lists = data.map((entry) => entry.shopping_lists);
    res.json(lists);
}

async function getShoppingListById(req, res) {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
        .from('user_shopping_lists')
        .select('shopping_lists(*)')
        .eq('user_id', userId)
        .eq('shopping_list_id', id)
        .single();

    if (error || !data) return res.status(403).json({ error: 'Not authorized or list not found' });

    res.json(data.shopping_lists);
}

async function updateShoppingList(req, res) {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user.id;

    const { data, error } = await supabase
        .from('shopping_lists')
        .update({ name, description })
        .eq('id', id)
        .eq('created_by', userId)
        .select()
        .single();

    if (error || !data) return res.status(403).json({ error: 'Update failed or not authorized' });

    res.json(data);
}

async function deleteShoppingList(req, res) {
    const { id } = req.params;
    const userId = req.user.id;

    const { error } = await supabase
        .from('shopping_lists')
        .delete()
        .eq('id', id)
        .eq('created_by', userId);

    if (error) return res.status(500).json({ error: error.message });
    res.status(204).end();
}

async function inviteUserToShoppingList(req, res) {
    const { email, listId } = req.body;
    const invitedBy = req.user.id;

    // Увери се, че текущият потребител е създателят на списъка
    const { data: list, error: listError } = await supabase
        .from('shopping_lists')
        .select('id')
        .eq('id', listId)
        .eq('created_by', invitedBy)
        .single();

    if (listError || !list) {
        return res.status(403).json({ error: 'You are not the owner of this list' });
    }

    // Намери потребителя по email
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

    if (userError || !user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Провери дали вече е в списъка
    const { data: existing } = await supabase
        .from('user_shopping_lists')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('shopping_list_id', listId)
        .maybeSingle();

    if (existing) {
        return res.status(409).json({ error: 'User already has access to this list' });
    }

    // Добави го като "member"
    const { error: insertError } = await supabase
        .from('user_shopping_lists')
        .insert({
            user_id: user.id,
            shopping_list_id: listId,
            role: 'member',
        });

    if (insertError) {
        return res.status(500).json({ error: insertError.message });
    }

    res.status(200).json({ message: 'User successfully added to list' });
}

async function addItemsToList(req, res) {
    try {
        const { user } = req;
        const { shoppingListId } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        // Проверка за достъп
        const { data: access, error: accessError } = await supabase
            .from('user_shopping_lists')
            .select('user_id')
            .eq('shopping_list_id', shoppingListId)
            .eq('user_id', user.id)
            .single();

        if (accessError || !access) {
            return res.status(403).json({ error: 'Not authorized to add items to this list' });
        }

        const insertData = await Promise.all(
            files.map(async (file) => {
                // OCR
                const [result] = await client.textDetection({ image: { content: file.buffer } });
                const detections = result.textAnnotations;
                const text = detections.length > 0 ? detections[0].description.trim() : null;

                if (!text) return null;

                const ext = path.extname(file.originalname || '') || '.jpg';
                const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase()) ? ext : '.jpg';
                const uniqueFileName = `item-${uuidv4()}${safeExt}`;
                const filePath = uniqueFileName;

                console.log('Uploading image to:', filePath);

                const { error: uploadError, data: uploadData } = await supabase.storage
                    .from('shopping.list.item.images')
                    .upload(filePath, file.buffer, {
                        contentType: file.mimetype,
                        upsert: false,
                    });

                if (uploadError) {
                    console.error('Image upload error:', uploadError.message);
                    return null;
                }

                // Получаване на публичния URL
                const { data: publicUrlData } = supabase.storage
                    .from('shopping.list.item.images')
                    .getPublicUrl(filePath);

                const imageUrl = publicUrlData?.publicUrl;
                const name = text;


                if (uploadError) {
                    console.error('Image upload error:', uploadError.message);
                    return null;
                }

                // const { data: publicUrlData } = supabase.storage
                //     .from('shopping.list.item.images')
                //     .getPublicUrl(uniqueFileName);

                const jsonText = await processTextWithGemini(text).then(res => JSON.stringify(res));
                return {
                    shopping_list_id: shoppingListId,
                    name,
                    raw_text: text,
                    json_text: jsonText,
                    image_url: publicUrlData.publicUrl,
                    quantity: 1,
                    is_bought: false,
                };
            })
        );

        const validItems = insertData.filter(Boolean);

        if (validItems.length === 0) {
            return res.status(400).json({ error: 'No valid texts extracted or image uploads failed' });
        }

        const { error } = await supabase.from('shopping_list_items').insert(validItems);
        if (error) throw error;

        res.status(201).json({ message: 'Items added successfully', count: validItems.length });
    } catch (error) {
        console.error('Error adding items from images:', error.message);
        res.status(500).json({ error: 'Failed to process uploaded images' });
    }
}


async function getItemsByShoppingListId(req, res) {
    try {
        const { shoppingListId } = req.params;
        const { data, error } = await supabase
            .from('shopping_list_items')
            .select('*')
            .eq('shopping_list_id', shoppingListId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get items error:', error.message);
        res.status(500).json({ error: 'Unable to fetch items' });
    }
};

// 👇 Взимане на един айтъм
async function getItemById(req, res) {
    try {
        const { itemId } = req.params;
        const { data, error } = await supabase
            .from('shopping_list_items')
            .select('*')
            .eq('id', itemId)
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get item error:', error.message);
        res.status(500).json({ error: 'Unable to fetch item' });
    }
};

// 👇 Редакция на айтъм
async function updateItem(req, res) {
    try {
        const { itemId } = req.params;
        const { name, quantity, is_bought } = req.body;

        const { data, error } = await supabase
            .from('shopping_list_items')
            .update({ name, quantity, is_bought })
            .eq('id', itemId)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update item error:', error.message);
        res.status(500).json({ error: 'Unable to update item' });
    }
};

// 👇 Изтриване на айтъм
async function deleteItem(req, res) {
    try {
        const { itemId } = req.params;

        const { error } = await supabase
            .from('shopping_list_items')
            .delete()
            .eq('id', itemId);

        if (error) throw error;

        res.status(204).send();
    } catch (error) {
        console.error('Delete item error:', error.message);
        res.status(500).json({ error: 'Unable to delete item' });
    }
};

module.exports = {
    shoppingListCrud: {
        createShoppingList,
        getShoppingLists,
        getShoppingListById,
        updateShoppingList,
        deleteShoppingList,
    },
    shoppingListRoles: {
        inviteUserToShoppingList,
    },
    itemsCrud: {
        addItemsToList,
        getItemsByShoppingListId,
        getItemById,
        updateItem,
        deleteItem
    }
};
