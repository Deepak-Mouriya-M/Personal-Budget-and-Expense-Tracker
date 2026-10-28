// app.js
// Personal Budget & Expense Tracker - Frontend logic (Vanilla JS + Fetch API)

const API_BASE = ""; // same origin, since Express serves this file too

// ---------- Global State ----------
let allTransactions = [];
let currentBudget = { monthlyBudget: 0 };
let editingId = null;       // id of transaction currently being edited (null = add mode)
let pendingDeleteId = null; // id awaiting delete confirmation
let categoryPieChart = null;
let incomeExpenseBarChart = null;

// ---------- DOM Shortcuts ----------
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// ==================================================================
// NAVIGATION
// ==================================================================

function goToPage(pageName) {
  $$(".page").forEach((p) => p.classList.remove("active"));
  $(`#page-${pageName}`)?.classList.add("active");

  $$(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageName);
  });

  closeMobileSidebar();

  if (pageName === "reports") renderCharts();
  if (pageName === "budget") renderBudgetPage();
}

function initNavigation() {
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => goToPage(btn.dataset.page));
  });
  $$("[data-page-link]").forEach((btn) => {
    btn.addEventListener("click", () => goToPage(btn.dataset.pageLink));
  });
}

// ---------- Mobile sidebar ----------
function initMobileSidebar() {
  const sidebar = $("#sidebar");
  const overlay = $("#sidebarOverlay");

  $("#hamburgerBtn").addEventListener("click", () => {
    sidebar.classList.add("open");
    overlay.classList.add("visible");
  });
  overlay.addEventListener("click", closeMobileSidebar);
}

function closeMobileSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebarOverlay").classList.remove("visible");
}

// ==================================================================
// TOAST NOTIFICATIONS
// ==================================================================

function showToast(message, type = "success") {
  const container = $("#toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ==================================================================
// API HELPERS (Fetch API)
// ==================================================================

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}

async function apiSend(path, method, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = (data.errors && data.errors.join(" ")) || data.error || "Request failed";
    throw new Error(message);
  }
  return data;
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Delete failed");
  return data;
}

// ==================================================================
// DATA LOADING
// ==================================================================

async function loadAllData() {
  try {
    const [transactions, budget] = await Promise.all([
      apiGet("/transactions"),
      apiGet("/budget"),
    ]);
    allTransactions = transactions;
    currentBudget = budget;
    refreshEverything();
  } catch (err) {
    console.error(err);
    showToast("Could not load data from server.", "error");
  }
}

function refreshEverything() {
  populateCategoryOptions();
  renderDashboard();
  renderTransactionsTable();
  renderBudgetPage();
}

// ==================================================================
// DASHBOARD
// ==================================================================

function formatCurrency(amount) {
  return "₹" + Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function computeTotals() {
  let income = 0;
  let expense = 0;
  for (const t of allTransactions) {
    if (t.type === "income") income += Number(t.amount);
    else expense += Number(t.amount);
  }
  return { income, expense, balance: income - expense };
}

function renderDashboard() {
  const { income, expense, balance } = computeTotals();
  const remaining = Number(currentBudget.monthlyBudget || 0) - expense;

  $("#statBalance").textContent = formatCurrency(balance);
  $("#statIncome").textContent = formatCurrency(income);
  $("#statExpense").textContent = formatCurrency(expense);
  $("#statRemaining").textContent = formatCurrency(remaining);

  const warningEl = $("#budgetWarning");
  if (currentBudget.monthlyBudget > 0 && expense > currentBudget.monthlyBudget) {
    warningEl.classList.remove("hidden");
  } else {
    warningEl.classList.add("hidden");
  }

  // Recent transactions: last 5, most recent date first
  const recent = [...allTransactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  const body = $("#recentTxBody");
  body.innerHTML = "";

  if (recent.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty-msg">No transactions yet. Add your first one!</td></tr>`;
    return;
  }

  for (const t of recent) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.category)}</td>
      <td>${formatDate(t.date)}</td>
      <td><span class="type-badge ${t.type}">${t.type}</span></td>
      <td class="${t.type === "income" ? "amount-income" : "amount-expense"}">
        ${t.type === "income" ? "+" : "-"}${formatCurrency(t.amount)}
      </td>
    `;
    body.appendChild(row);
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split("-");
  if (parts.length === 3) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const m = months[monthIdx] || parts[1];
    return `${parts[2].padStart(2, "0")} ${m} ${parts[0]}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ==================================================================
// TRANSACTIONS TABLE + SEARCH/FILTER
// ==================================================================

function populateCategoryOptions() {
  const categories = [...new Set(allTransactions.map((t) => t.category).filter(Boolean))].sort();

  const filterSelect = $("#filterCategory");
  const currentFilterVal = filterSelect.value;
  filterSelect.innerHTML = `<option value="all">All Categories</option>`;
  categories.forEach((c) => {
    filterSelect.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
  });
  if (categories.includes(currentFilterVal)) filterSelect.value = currentFilterVal;

  const datalist = $("#categoryList");
  datalist.innerHTML = "";
  categories.forEach((c) => {
    datalist.innerHTML += `<option value="${escapeHtml(c)}"></option>`;
  });
}

function getFilteredTransactions() {
  const search = $("#searchInput").value.trim().toLowerCase();
  const typeFilter = $("#filterType").value;
  const categoryFilter = $("#filterCategory").value;

  return allTransactions.filter((t) => {
    const matchesSearch = !search || t.title.toLowerCase().includes(search);
    const matchesType = typeFilter === "all" || t.type === typeFilter;
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    return matchesSearch && matchesType && matchesCategory;
  });
}

function renderTransactionsTable() {
  const filtered = [...getFilteredTransactions()].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  const body = $("#allTxBody");
  const noResults = $("#noResultsMsg");
  body.innerHTML = "";

  if (filtered.length === 0) {
    noResults.classList.remove("hidden");
    return;
  }
  noResults.classList.add("hidden");

  for (const t of filtered) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.category)}</td>
      <td>${formatDate(t.date)}</td>
      <td><span class="type-badge ${t.type}">${t.type}</span></td>
      <td class="${t.type === "income" ? "amount-income" : "amount-expense"}">
        ${t.type === "income" ? "+" : "-"}${formatCurrency(t.amount)}
      </td>
      <td>${escapeHtml(t.description || "—")}</td>
      <td class="actions-cell">
        <button class="btn-icon-sm" title="Edit" data-edit="${t.id}">✏️</button>
        <button class="btn-icon-sm" title="Delete" data-delete="${t.id}">🗑️</button>
      </td>
    `;
    body.appendChild(row);
  }

  body.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEditTransaction(btn.dataset.edit));
  });
  body.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteModal(btn.dataset.delete));
  });
}

function initSearchAndFilters() {
  $("#searchInput").addEventListener("input", renderTransactionsTable);
  $("#filterType").addEventListener("change", renderTransactionsTable);
  $("#filterCategory").addEventListener("change", renderTransactionsTable);
}

// ==================================================================
// ADD / EDIT TRANSACTION FORM
// ==================================================================

function clearFormErrors() {
  $$(".field-error").forEach((el) => (el.textContent = ""));
}

function validateFormClientSide() {
  clearFormErrors();
  let valid = true;

  const title = $("#txTitle").value.trim();
  const amount = $("#txAmount").value;
  const type = $("#txType").value;
  const category = $("#txCategory").value.trim();
  const date = $("#txDate").value;

  if (!title) {
    $("#err-title").textContent = "Title is required.";
    valid = false;
  }
  if (amount === "" || isNaN(amount) || Number(amount) <= 0) {
    $("#err-amount").textContent = "Enter an amount greater than zero.";
    valid = false;
  }
  if (!type) {
    $("#err-type").textContent = "Select a type.";
    valid = false;
  }
  if (!category) {
    $("#err-category").textContent = "Category is required.";
    valid = false;
  }
  if (!date || isNaN(Date.parse(date))) {
    $("#err-date").textContent = "Enter a valid date.";
    valid = false;
  }

  return valid;
}

function resetForm() {
  $("#txForm").reset();
  $("#txId").value = "";
  editingId = null;
  $("#formPageTitle").textContent = "Add Transaction";
  $("#formPageSubtitle").textContent = "Fill in the details below";
  $("#submitTxBtn").textContent = "Add Transaction";
  clearFormErrors();
  // default date to today for convenience
  $("#txDate").value = new Date().toISOString().split("T")[0];
}

function startEditTransaction(id) {
  const t = allTransactions.find((tx) => tx.id === id);
  if (!t) return;

  editingId = id;
  $("#txId").value = id;
  $("#txTitle").value = t.title;
  $("#txAmount").value = t.amount;
  $("#txType").value = t.type;
  $("#txCategory").value = t.category;
  $("#txDate").value = t.date;
  $("#txDescription").value = t.description || "";

  $("#formPageTitle").textContent = "Edit Transaction";
  $("#formPageSubtitle").textContent = `Editing "${t.title}"`;
  $("#submitTxBtn").textContent = "Save Changes";

  goToPage("add");
}

function initTransactionForm() {
  $("#txForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateFormClientSide()) return;

    const payload = {
      title: $("#txTitle").value.trim(),
      amount: Number($("#txAmount").value),
      type: $("#txType").value,
      category: $("#txCategory").value.trim(),
      date: $("#txDate").value,
      description: $("#txDescription").value.trim(),
    };

    try {
      if (editingId) {
        await apiSend(`/transactions/${editingId}`, "PUT", payload);
        showToast("Transaction updated successfully.");
      } else {
        await apiSend("/transactions", "POST", payload);
        showToast("Transaction added successfully.");
      }
      await loadAllData();
      resetForm();
      goToPage("transactions");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  $("#cancelEditBtn").addEventListener("click", () => {
    resetForm();
    goToPage("transactions");
  });
}

// ==================================================================
// DELETE CONFIRMATION MODAL
// ==================================================================

function openDeleteModal(id) {
  pendingDeleteId = id;
  $("#deleteModalOverlay").classList.remove("hidden");
}

function closeDeleteModal() {
  pendingDeleteId = null;
  $("#deleteModalOverlay").classList.add("hidden");
}

function initDeleteModal() {
  $("#cancelDeleteBtn").addEventListener("click", closeDeleteModal);
  $("#confirmDeleteBtn").addEventListener("click", async () => {
    if (!pendingDeleteId) return;
    try {
      await apiDelete(`/transactions/${pendingDeleteId}`);
      showToast("Transaction deleted.");
      await loadAllData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      closeDeleteModal();
    }
  });
}

// ==================================================================
// BUDGET PAGE
// ==================================================================

function renderBudgetPage() {
  $("#budgetInput").value = currentBudget.monthlyBudget || "";

  const { expense } = computeTotals();
  const budget = Number(currentBudget.monthlyBudget || 0);
  const remaining = budget - expense;

  $("#budgetSummaryTotal").textContent = formatCurrency(budget);
  $("#budgetSummarySpent").textContent = formatCurrency(expense);
  $("#budgetSummaryRemaining").textContent = formatCurrency(remaining);

  const fill = $("#budgetProgressFill");
  const pct = budget > 0 ? Math.min((expense / budget) * 100, 100) : 0;
  fill.style.width = pct + "%";
  fill.classList.toggle("over", budget > 0 && expense > budget);
}

function initBudgetForm() {
  $("#budgetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#err-budget").textContent = "";

    const value = $("#budgetInput").value;
    if (value === "" || isNaN(value) || Number(value) < 0) {
      $("#err-budget").textContent = "Enter a valid non-negative amount.";
      return;
    }

    try {
      currentBudget = await apiSend("/budget", "POST", { monthlyBudget: Number(value) });
      showToast("Budget saved.");
      renderDashboard();
      renderBudgetPage();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

// ==================================================================
// CHARTS (Chart.js)
// ==================================================================

function getChartColors() {
  return [
    "#2c56e0", "#3d6eff", "#167a5c", "#c23b3b",
    "#8891ab", "#12266b", "#5b8def", "#e07b39",
  ];
}

function renderCharts() {
  renderCategoryPieChart();
  renderIncomeExpenseBarChart();
}

function renderCategoryPieChart() {
  const expenseByCategory = {};
  for (const t of allTransactions) {
    if (t.type !== "expense") continue;
    expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + Number(t.amount);
  }

  const labels = Object.keys(expenseByCategory);
  const data = Object.values(expenseByCategory);

  if (categoryPieChart) categoryPieChart.destroy();

  const ctx = $("#categoryPieChart").getContext("2d");
  categoryPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels.length ? labels : ["No expenses yet"],
      datasets: [{
        data: data.length ? data : [1],
        backgroundColor: getChartColors(),
        borderColor: "#ffffff",
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "rect",
            padding: 16,
            boxWidth: 22,
            boxHeight: 12,
            color: getComputedStyle(document.body).getPropertyValue("--ink-900").trim() || "#10162b",
            font: {
              family: "'Inter', sans-serif",
              size: 13
            }
          }
        },
      },
    },
  });
}

function renderIncomeExpenseBarChart() {
  const { income, expense } = computeTotals();

  if (incomeExpenseBarChart) incomeExpenseBarChart.destroy();

  const maxVal = Math.max(30000, Math.ceil(Math.max(income, expense) / 5000) * 5000);

  const ctx = $("#incomeExpenseBarChart").getContext("2d");
  incomeExpenseBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Income", "Expense"],
      datasets: [{
        label: "Amount (₹)",
        data: [income, expense],
        backgroundColor: ["#167a5c", "#c23b3b"],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 110,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => " " + formatCurrency(item.raw)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: maxVal,
          ticks: {
            stepSize: 5000,
            color: getComputedStyle(document.body).getPropertyValue("--ink-600").trim() || "#4b5470",
            callback: (val) => Number(val).toLocaleString("en-IN")
          },
          grid: {
            color: "rgba(0, 0, 0, 0.06)"
          }
        },
        x: {
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--ink-600").trim() || "#4b5470"
          },
          grid: {
            display: false
          }
        },
      },
    },
  });
}

// ==================================================================
// CSV EXPORT
// ==================================================================

function exportTransactionsToCsv() {
  const rows = getFilteredTransactions();
  if (rows.length === 0) {
    showToast("No transactions to export.", "error");
    return;
  }

  const headers = ["Title", "Amount", "Type", "Category", "Date", "Description"];
  const csvLines = [headers.join(",")];

  for (const t of rows) {
    const line = [
      csvEscape(t.title),
      t.amount,
      t.type,
      csvEscape(t.category),
      t.date,
      csvEscape(t.description || ""),
    ].join(",");
    csvLines.push(line);
  }

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showToast("CSV exported.");
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ==================================================================
// DARK MODE
// ==================================================================

function initDarkMode() {
  const toggle = $("#darkModeToggle");
  const mobileToggle = $("#darkModeToggleMobile");

  const isDark = localStorage.getItem("budgetTrackerDarkMode") === "true";
  applyDarkMode(isDark);
  toggle.checked = isDark;

  toggle.addEventListener("change", () => applyDarkMode(toggle.checked));
  mobileToggle.addEventListener("click", () => {
    const newState = !document.body.classList.contains("dark");
    applyDarkMode(newState);
    toggle.checked = newState;
  });
}

function applyDarkMode(isDark) {
  document.body.classList.toggle("dark", isDark);
  localStorage.setItem("budgetTrackerDarkMode", isDark);
  // Re-render charts so legend/axis colors pick up the new theme
  if ($("#page-reports").classList.contains("active")) {
    renderCharts();
  }
}

// ==================================================================
// INIT
// ==================================================================

function init() {
  initNavigation();
  initMobileSidebar();
  initSearchAndFilters();
  initTransactionForm();
  initDeleteModal();
  initBudgetForm();
  initDarkMode();

  $("#exportCsvBtn").addEventListener("click", exportTransactionsToCsv);

  resetForm(); // sets default date
  loadAllData();
}

document.addEventListener("DOMContentLoaded", init);
