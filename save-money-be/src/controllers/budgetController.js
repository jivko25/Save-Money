const express = require('express');
const { createBudget, getBudgetsForUser, getBudgetById, deleteBudget, joinBudgetByInviteCode, getBudgetsForCurrentUser } = require('../services/budgetService');
const { verifySession } = require('../services/authService');
const budgetRouter = express.Router();

budgetRouter.post('/', createBudget);

budgetRouter.use(verifySession);

// Вземане на бюджети за конкретен потребител
budgetRouter.get('/', getBudgetsForCurrentUser);

// Вземане на бюджет по ID
budgetRouter.get('/:budgetId', getBudgetById);

// Изтриване на бюджет по ID
budgetRouter.delete('/:budgetId', deleteBudget);

// Присъединяване към бюджет по invite code
budgetRouter.post('/join', joinBudgetByInviteCode);

module.exports = budgetRouter;