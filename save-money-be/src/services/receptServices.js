const supabase = require("../../supabase");
const sendPushNotification = require("../utils/notifyUsersPushToken");

async function getAllReceipts(req, res) {
    try {
        // 1. Вземаме ID на текущия потребител от обекта на заявката
        // ТОВА Е КЛЮЧОВО - Уверете се, че вашето authentication middleware поставя userId тук
        const userId = req.user.id;

        if (!userId) {
            return res.status(401).json({ error: 'Потребителят не е автентикиран.' });
        }

        // 2. Вземаме всички budget_id, в които потребителят участва
        const { data: userBudgets, error: userBudgetsError } = await supabase
            .from('user_budgets')
            .select('budget_id')
            .eq('user_id', userId); // Филтрираме по user_id

        if (userBudgetsError) {
            console.error('Грешка при извличане на бюджети за потребителя:', userBudgetsError);
            return res.status(500).json({ error: userBudgetsError.message });
        }

        // Ако потребителят не участва в никакви бюджети, връщаме празен масив
        if (!userBudgets || userBudgets.length === 0) {
            return res.json([]);
        }

        // Извличаме само ID-тата на бюджетите
        const budgetIds = userBudgets.map(ub => ub.budget_id);

        // 3. Вземаме всички бележки, които принадлежат на тези бюджети,
        // и правим JOIN с таблицата 'budgets', за да вземем името на бюджета
        const { data: receiptsData, error: receiptsError } = await supabase
            .from('receipts')
            .select(`
          *,
          budgets (
            name,
            daily_limit
          )
        `)
            .in('budget_id', budgetIds); // Филтрираме бележките по budget_id

        if (receiptsError) {
            console.error('Грешка при извличане на бележки за бюджети:', receiptsError);
            return res.status(500).json({ error: receiptsError.message });
        }

        // 4. Групираме бележките по бюджет за по-лесна обработка във фронтенда
        // Резултатът ще бъде масив от обекти, където всеки обект е един бюджет
        // и съдържа масив от неговите бележки.
        const groupedReceipts = receiptsData.reduce((acc, receipt) => {
            const budgetId = receipt.budget_id;
            const budgetName = receipt.budgets ? receipt.budgets.name : 'Неизвестен бюджет'; // Вземаме името на бюджета
            const budgetDailyLimit = receipt.budgets.daily_limit

            if (!acc[budgetId]) {
                acc[budgetId] = {
                    id: budgetId,
                    name: budgetName,
                    budgetDailyLimit,
                    receipts: [],
                };
            }
            acc[budgetId].receipts.push(receipt);
            return acc;
        }, {});

        // Преобразуваме обекта в масив от бюджети за по-лесна итерация във фронтенда
        const result = Object.values(groupedReceipts);

        res.json(result); // Връщаме групираните данни
    } catch (err) {
        console.error('Грешка в getAllReceipts:', err);
        res.status(500).json({ error: 'Вътрешна сървърна грешка.' });
    }
}

async function getReceiptsByBudgetId(req, res) {
    const { budgetId } = req.params;

    if (!budgetId) {
        return res.status(400).json({ error: 'Missing budgetId in URL' });
    }

    try {
        const { data, error } = await supabase
            .from('receipts')
            .select('*')
            .eq('budget_id', budgetId);

        if (error) {
            return res.status(400).json({ error });
        }

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
    const { raw_code, budget_id, scanned_by, store_id } = req.body;
  
    try {
      const [receiptNumber, _, date, time, amountStr] = raw_code.split('*');
      const amount = parseFloat(amountStr);
  
      const { data: receiptData, error: insertError } = await supabase
        .from('receipts')
        .insert({
          budget_id,
          scanned_by,
          date,
          time,
          amount,
          raw_code,
          store_id,
        })
        .select()
        .single();
  
      if (insertError) return res.status(400).json({ error: insertError });
  
      // 👉 Вземаме името на бюджета
      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('name')
        .eq('id', budget_id)
        .single();
  
      const budgetName = budgetData?.name || 'Бюджет';
  
      if (budgetError) console.warn('⚠️ Грешка при вземане на име на бюджет:', budgetError);
  
      // 👉 Вземаме всички потребители, свързани с бюджета
      const { data: users, error: usersError } = await supabase
        .from('user_budgets')
        .select('user_id')
        .eq('budget_id', budget_id);
  
      if (usersError) console.warn('⚠️ Грешка при вземане на user_budgets:', usersError);
  
      const userIds = users.map(u => u.user_id);
  
      // 👉 Вземаме push токените им
      const { data: tokensData, error: tokensError } = await supabase
        .from('user_push_tokens')
        .select('token')
        .in('user_id', userIds);
  
      if (tokensError) console.warn('⚠️ Грешка при вземане на push токени:', tokensError);
  
      const tokens = tokensData.map(t => t.token);
  
      // 👉 Изпращаме push нотификация с име на бюджет и сума
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          'Нова бележка!',
          `Добавена е покупка за ${amount.toFixed(2)} лв в бюджета "${budgetName}".`
        );
      }
  
      res.json({ success: true, data: receiptData });
    } catch (err) {
      console.error('❌ Грешка в postReceipt:', err);
      res.status(500).json({ error: 'Invalid QR format or server error.' });
    }
  }
  


async function getLatestReceiptsForProfile(req, res) {
    const userId = req.user?.id;
    const { date } = req.query;


    if (!userId) {
        return res.status(401).json({ error: 'Неавторизиран достъп' });
    }

    // Започваме заявката
    let query = supabase
        .from("receipts")
        .select("*")
        .eq("scanned_by", userId);

    // Ако има подаден date, добавяме филтър по дата
    if (date) {
        query = query.eq("date", date);
    }

    // Добавяме сортиране и лимит
    const { data, error } = await query
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(3);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    return res.json({ receipts: data });
}


module.exports = {
    getAllReceipts,
    getSingleReceipt,
    postReceipt,
    getReceiptsByBudgetId,
    getLatestReceiptsForProfile
}