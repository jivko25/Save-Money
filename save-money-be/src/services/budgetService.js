const supabase = require('../../supabase');
const { generateInviteCode } = require('../utils/generateId');

async function createBudget(req, res) {
    const userId = req.user?.id;
    const { name, description, displayName } = req.body;

    if (!name || !userId) {
        return res.status(400).json({ error: 'Missing name or userId' });
    }

    const invite_code = generateInviteCode(8);

    // 1. Създай бюджета
    const { data: budget, error: budgetError } = await supabase
        .from('budgets')
        .insert([{ name, created_by: userId, invite_code, description }])
        .select()
        .single();

    if (budgetError) {
        return res.status(500).json({ error: budgetError.message });
    }

    // 2. Добави създателя в user_budgets като owner
    const { error: userBudgetError } = await supabase
        .from('user_budgets')
        .insert([{ user_id: userId, budget_id: budget.id, role: 'owner', display_name: displayName }]);

    if (userBudgetError) {
        return res.status(500).json({ error: userBudgetError.message });
    }

    return res.status(201).json({ budget });
}

async function updateBudget(req, res) {
    const userId = req.user?.id;
    const { budgetId } = req.params;
    const { name, description, displayName } = req.body;

    if (!budgetId || !userId) {
        return res.status(400).json({ error: 'Missing budgetId or userId' });
    }

    // 1. Обнови самия бюджет
    const { error: budgetError } = await supabase
        .from('budgets')
        .update({ name, description })
        .eq('id', budgetId)
        .eq('created_by', userId); // само създателят може да редактира

    if (budgetError) {
        return res.status(500).json({ error: budgetError.message });
    }

    // 2. Ако има подадено displayName, обнови го в user_budgets
    if (displayName) {
        const { error: userBudgetError } = await supabase
            .from('user_budgets')
            .update({ display_name: displayName })
            .eq('user_id', userId)
            .eq('budget_id', budgetId);

        if (userBudgetError) {
            return res.status(500).json({ error: userBudgetError.message });
        }
    }

    return res.status(200).json({ message: 'Бюджетът е обновен успешно.' });
}

async function getBudgetsForCurrentUser(req, res) {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'Неавторизиран достъп – липсва userId в токена' });
    }

    const { data, error } = await supabase
        .from("user_budgets")
        .select("budget_id, role, budgets(*)")
        .eq("user_id", userId);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const budgets = [];

    for (const item of data) {
        const budget = item.budgets;

        // Вземи касови бележки
        const { data: receipts, error: receiptsError } = await supabase
            .from("receipts")
            .select("amount, created_at")
            .eq("budget_id", budget.id);

        if (receiptsError) {
            return res.status(500).json({ error: receiptsError.message });
        }

        // Изчисли тотал и последна дата
        const totalAmount = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
        const lastReceiptDate = receipts.reduce((latest, r) => {
            const date = new Date(r.created_at);
            return date > latest ? date : latest;
        }, new Date(0));

        // Вземи броя на потребителите в този бюджет
        const { count: userCount, error: userCountError } = await supabase
            .from("user_budgets")
            .select("*", { count: "exact", head: true }) // само брой
            .eq("budget_id", budget.id);

        if (userCountError) {
            return res.status(500).json({ error: userCountError.message });
        }

        budgets.push({
            ...budget,
            totalAmount,
            lastReceiptDate: receipts.length > 0 ? lastReceiptDate.toISOString() : null,
            userCount
        });
    }

    return res.json({ budgets });
}

async function getBudgetSummary(req, res) {
    const userId = req.user?.id;
    const { budgetId } = req.params;
    const { search = '', min, max } = req.query;

    if (!userId) {
        return res.status(401).json({ error: 'Неавторизиран' });
    }

    if (!budgetId) {
        return res.status(400).json({ error: 'Липсва budgetId' });
    }

    const { data: membership, error: membershipErr } = await supabase
        .from('user_budgets')
        .select('*')
        .eq('user_id', userId)
        .eq('budget_id', budgetId)
        .maybeSingle();

    if (membershipErr) {
        return res.status(500).json({ error: 'Грешка при проверка на членство' });
    }

    if (!membership) {
        return res.status(403).json({ error: 'Нямате достъп до този бюджет' });
    }

    const { data: members, error: membersError } = await supabase
        .from('user_budgets')
        .select('user_id, display_name')
        .eq('budget_id', budgetId);

    if (membersError) {
        return res.status(500).json({ error: 'Грешка при извличане на членове' });
    }

    const nameMap = {};
    members.forEach((m) => {
        nameMap[m.user_id] = m.display_name || 'Неизвестен';
    });

    // Вземаме бележките
    const { data: receipts, error: receiptsError } = await supabase
        .from('receipts')
        .select('id, amount, scanned_by, date, time, created_at')
        .eq('budget_id', budgetId)
        .order('date', { ascending: false })
        .order('time', { ascending: false });

    if (receiptsError) {
        return res.status(500).json({ error: 'Грешка при извличане на бележки' });
    }

    // Обогатяване с име и филтриране
    const enrichedReceipts = receipts
        .map((r) => ({
            id: r.id,
            amount: parseFloat(r.amount),
            scanned_by: r.scanned_by,
            displayName: nameMap[r.scanned_by] || 'Неизвестен',
            created_at: r.created_at,
            date: r.date
        }))
        .filter((r) => {
            const matchesName = r.displayName.toLowerCase().includes(search.toLowerCase());
            const matchesMin = isNaN(parseFloat(min)) || r.amount >= parseFloat(min);
            const matchesMax = isNaN(parseFloat(max)) || r.amount <= parseFloat(max);
            return matchesName && matchesMin && matchesMax;
        });

    // Групиране на разходите по потребител
    const resultMap = {};
    enrichedReceipts.forEach((r) => {
        const uid = r.scanned_by;
        if (!resultMap[uid]) {
            resultMap[uid] = {
                userId: uid,
                displayName: nameMap[uid] || 'Неизвестен',
                total: 0,
            };
        }
        resultMap[uid].total += isNaN(r.amount) ? 0 : r.amount;
    });

    const summary = Object.values(resultMap);
    const totalSpent = summary.reduce((acc, u) => acc + u.total, 0);

    return res.json({
        users: summary,
        totalSpent,
        receipts: enrichedReceipts,
    });
}

async function getBudgetById(req, res) {
    const budgetId = req.params.budgetId;

    if (!budgetId) {
        return res.status(400).json({ error: 'Missing budgetId' });
    }

    const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("id", budgetId)
        .single();

    if (error) {
        return res.status(404).json({ error: error.message });
    }

    return res.json({ budget: data });
}

async function deleteBudget(req, res) {
    const budgetId = req.params.budgetId;

    if (!budgetId) {
        return res.status(400).json({ error: 'Missing budgetId' });
    }

    const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", budgetId);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    return res.status(204).send();
}

async function joinBudgetByInviteCode(req, res) {
    const userId = req.user?.id;

    const { invite_code, display_name } = req.body;

    if (!userId || !invite_code) {
        return res.status(400).json({ error: 'Missing userId or invite_code' });
    }

    const { data: budget, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("invite_code", invite_code)
        .single();

    if (error || !budget) {
        return res.status(404).json({ error: "Invalid invite code" });
    }

    const { data: alreadyMemberData, error: checkError } = await supabase
        .from("user_budgets")
        .select("*")
        .eq("user_id", userId)
        .eq("budget_id", budget.id)
        .maybeSingle();

    if (checkError) {
        return res.status(500).json({ error: checkError.message });
    }

    if (alreadyMemberData) {
        return res.status(400).json({ error: "User already joined this budget" });
    }

    const { error: joinError } = await supabase
        .from("user_budgets")
        .insert({
            user_id: userId,
            budget_id: budget.id,
            role: "member",
            display_name
        });

    if (joinError) {
        return res.status(500).json({ error: joinError.message });
    }

    return res.json({ budget });
}

async function getSpendingByUserInBudget(req, res) {
    try {
        const { budgetId } = req.params; // Вземаме budgetId от URL параметрите
        const requestingUserId = req.user.id; // ID на автентикирания потребител

        if (!budgetId) {
            return res.status(400).json({ error: 'Идентификатор на бюджет е задължителен.' });
        }

        // 1. Проверка дали текущият потребител е член на бюджета (авторизация)
        // Трябва да изберем * (или поне user_id), за да проверим членството
        const { data: userBudgetMembership, error: membershipError } = await supabase
            .from('user_budgets')
            .select('*')
            .eq('user_id', requestingUserId)
            .eq('budget_id', budgetId)
            .maybeSingle(); // Използваме maybeSingle, ако резултатът може да е 0 или 1

        if (membershipError) {
            console.error('Грешка при проверка на членство в бюджет:', membershipError);
            return res.status(500).json({ error: 'Грешка при проверка на членство в бюджета.' });
        }

        if (!userBudgetMembership) { // Проверяваме за null, ако maybeSingle не върне резултат
            return res.status(403).json({ error: 'Нямате достъп до този бюджет или не сте член.' });
        }

        // 2. Вземаме всички бележки за този конкретен бюджет
        const { data: receipts, error: receiptsError } = await supabase
            .from('receipts')
            .select('amount, scanned_by') // Избираме само нужните ни колони
            .eq('budget_id', budgetId); // Филтрираме по budgetId

        if (receiptsError) {
            console.error('Грешка при извличане на бележки за бюджета:', receiptsError);
            return res.status(500).json({ error: receiptsError.message });
        }

        // 3. Извличаме display_name на ВСИЧКИ членове на бюджета от user_budgets таблицата
        const { data: budgetMembers, error: membersError } = await supabase
            .from('user_budgets')
            .select('user_id, display_name') // <-- Взимаме user_id и display_name
            .eq('budget_id', budgetId);

        if (membersError) {
            console.error('Грешка при извличане на членовете на бюджета:', membersError);
            // Продължаваме дори и без имена, ще останат 'Неизвестен потребител'
        }

        // Създаваме map за бърз достъп до display_name по user_id
        const memberDisplayNames = {};
        if (budgetMembers) {
            budgetMembers.forEach(member => {
                memberDisplayNames[member.user_id] = member.display_name || 'Неизвестен потребител';
            });
        }

        // 4. Групираме разходите и сумираме по потребител
        // Използваме memberDisplayNames, за да зададем правилното userName
        const spendingByUserMap = receipts.reduce((acc, receipt) => {
            const userId = receipt.scanned_by;
            const amount = parseFloat(receipt.amount);

            if (isNaN(amount)) {
                console.warn(`Бележка с ID ${receipt.id} има невалидна сума: ${receipt.amount}`);
                return acc;
            }

            if (!acc[userId]) {
                acc[userId] = {
                    userId: userId,
                    totalSpending: 0,
                    // <--- Взимаме display_name от map-а на членовете
                    userName: memberDisplayNames[userId] || 'Неизвестен потребител'
                };
            }
            acc[userId].totalSpending += amount;
            return acc;
        }, {});

        // 5. Преобразуваме обекта в масив за фронтенда
        const result = Object.values(spendingByUserMap);
        res.json(result); // Връщаме данните

    } catch (err) {
        console.error('Вътрешна сървърна грешка в getSpendingByUserInBudget:', err);
        res.status(500).json({ error: 'Вътрешна сървърна грешка.' });
    }
}

async function leaveBudget(req, res) {
    const userId = req.user?.id;
    const budgetId = req.params.budgetId;

    if (!userId || !budgetId) {
        return res.status(400).json({ error: 'Missing userId or budgetId' });
    }

    // Проверка дали потребителят е член на бюджета
    const { data: membership, error: membershipError } = await supabase
        .from('user_budgets')
        .select('role')
        .eq('user_id', userId)
        .eq('budget_id', budgetId)
        .maybeSingle();

    if (membershipError) {
        return res.status(500).json({ error: 'Грешка при проверка на членство' });
    }

    if (!membership) {
        return res.status(404).json({ error: 'Потребителят не е член на бюджета' });
    }

    if (membership.role === 'owner') {
        return res.status(403).json({ error: 'Създателят не може да напусне бюджета. Изтрий го или прехвърли собствеността.' });
    }

    // Изтриване от user_budgets
    const { error: deleteError } = await supabase
        .from('user_budgets')
        .delete()
        .eq('user_id', userId)
        .eq('budget_id', budgetId);

    if (deleteError) {
        return res.status(500).json({ error: 'Грешка при напускане на бюджета' });
    }

    return res.status(200).json({ message: 'Успешно напуснахте бюджета' });
}


module.exports = { createBudget, getBudgetsForCurrentUser, getBudgetById, deleteBudget, joinBudgetByInviteCode, getSpendingByUserInBudget, leaveBudget, getBudgetSummary, updateBudget };
