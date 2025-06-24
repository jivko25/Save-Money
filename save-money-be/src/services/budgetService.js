const supabase = require('../../supabase');
const { generateInviteCode } = require('../utils/generateId');

async function createBudget(req, res) {
    const { name, userId } = req.body;

    if (!name || !userId) {
        return res.status(400).json({ error: 'Missing name or userId' });
    }

    const invite_code = generateInviteCode(8);

    // 1. Създай бюджета
    const { data: budget, error: budgetError } = await supabase
        .from('budgets')
        .insert([{ name, created_by: userId, invite_code }])
        .select()
        .single();

    if (budgetError) {
        return res.status(500).json({ error: budgetError.message });
    }

    // 2. Добави създателя в user_budgets като owner
    const { error: userBudgetError } = await supabase
        .from('user_budgets')
        .insert([{ user_id: userId, budget_id: budget.id, role: 'owner' }]);

    if (userBudgetError) {
        return res.status(500).json({ error: userBudgetError.message });
    }

    return res.status(201).json({ budget });
}

async function getBudgetsForUser(req, res) {
    const userId = req.params.userId || req.query.userId;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    const { data, error } = await supabase
        .from("user_budgets")
        .select("budget_id, budgets(*)")
        .eq("user_id", userId);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const budgets = data.map(item => item.budgets);

    return res.json({ budgets });
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
    const { userId, invite_code } = req.body;

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
        });

    if (joinError) {
        return res.status(500).json({ error: joinError.message });
    }

    return res.json({ budget });
}


module.exports = { createBudget, getBudgetsForUser, getBudgetById, deleteBudget, joinBudgetByInviteCode };
