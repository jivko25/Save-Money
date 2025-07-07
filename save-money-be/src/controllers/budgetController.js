const express = require('express');
const { createBudget, getBudgetsForUser, getBudgetById, deleteBudget, joinBudgetByInviteCode, getBudgetsForCurrentUser, getSpendingByUserInBudget, leaveBudget, getBudgetSummary, updateBudget, getBudgetCategorySummary } = require('../services/budgetService');
const { verifySession } = require('../services/authService');
const budgetRouter = express.Router();

budgetRouter.use(verifySession);

budgetRouter.post('/', createBudget);

budgetRouter.patch('/:budgetId', updateBudget);

// Вземане на бюджети за конкретен потребител
budgetRouter.get('/', getBudgetsForCurrentUser);

// Смята в конкретен бюджет кой потребител колко е изхарчил
budgetRouter.get('/:budgetId/spending-by-user', getSpendingByUserInBudget);

// Смята в конкретен бюджет кой потребител колко е изхарчил
budgetRouter.get('/:budgetId/summary', getBudgetSummary);

// Вземане на бюджет по ID
budgetRouter.get('/:budgetId', getBudgetById);

// Изтриване на бюджет по ID
budgetRouter.delete('/:budgetId', deleteBudget);

// Присъединяване към бюджет по invite code
budgetRouter.post('/join', joinBudgetByInviteCode);

// Напускане на бюджет от потребител
budgetRouter.delete('/:budgetId/leave', leaveBudget);

budgetRouter.get('/:budgetId/category-summary', getBudgetCategorySummary);


module.exports = budgetRouter;