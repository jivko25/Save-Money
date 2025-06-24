const express = require('express');
const { createBudget, getBudgetsForUser, getBudgetById, deleteBudget, joinBudgetByInviteCode } = require('../services/budgetService');
const budgetRouter = express.Router();

budgetRouter.post('/', createBudget);

// Вземане на бюджети за конкретен потребител (userId в params)
budgetRouter.get('/user/:userId', getBudgetsForUser);

// Вземане на бюджет по ID
budgetRouter.get('/:budgetId', getBudgetById);

// Изтриване на бюджет по ID
budgetRouter.delete('/:budgetId', deleteBudget);

// Присъединяване към бюджет по invite code
budgetRouter.post('/join', joinBudgetByInviteCode);

module.exports = budgetRouter;