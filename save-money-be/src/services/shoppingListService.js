const vision = require('@google-cloud/vision');
const path = require('path');
const supabase = require('../../supabase');

const client = new vision.ImageAnnotatorClient({
    keyFilename: path.resolve(__dirname, '../../quack-scanner-85b31c63cee6.json'),
});

async function createShoppingList(req, res) {
    const { name, description = '' } = req.body;
    const userId = req.user.id;

    const { data, error } = await supabase
        .from('shopping_lists')
        .insert([{ name, description, created_by: userId }])
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
}

async function getShoppingLists(req, res) {
    const userId = req.user.id;

    const { data, error } = await supabase
        .from('shopping_list_members')
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
        .from('shopping_list_members')
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

        const insertData = [];

        for (const file of files) {
            const [result] = await client.textDetection({ image: { content: file.buffer } });
            const detections = result.textAnnotations;
            const text = detections.length > 0 ? detections[0].description.trim() : null;

            if (!text) continue;

            const name = extractNameFromText(text);
            const base64Image = file.buffer.toString('base64');

            insertData.push({
                shopping_list_id: shoppingListId,
                name,
                raw_text: text,
                image_base64: base64Image,
                quantity: 1,
                is_bought: false,
            });
        }

        if (insertData.length === 0) {
            return res.status(500).json({ error: 'No valid texts extracted' });
        }

        const { error } = await supabase.from('shopping_list_items').insert(insertData);

        if (error) throw error;

        res.status(201).json({ message: 'Items added successfully', count: insertData.length });
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
