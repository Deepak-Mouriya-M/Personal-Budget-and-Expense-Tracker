import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API = "";

function formatCurrency(amount) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
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

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("budgetTrackerDarkMode") === "true";
  });

  const [transactions, setTransactions] = useState([]);
  const [budget, setBudget] = useState(15000);
  const [budgetInput, setBudgetInput] = useState("15000");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    amount: "",
    type: "expense",
    category: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [formErrors, setFormErrors] = useState({});

  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  }

  const loadData = useCallback(async () => {
    try {
      const [txRes, bRes] = await Promise.all([
        fetch(`${API}/transactions`),
        fetch(`${API}/budget`),
      ]);

      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData);
      }
      if (bRes.ok) {
        const bData = await bRes.json();
        const bVal = Number(bData.monthlyBudget) || 15000;
        setBudget(bVal);
        setBudgetInput(String(bVal));
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
      showToast("Could not connect to backend server.", "error");
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [txRes, bRes] = await Promise.all([
          fetch(`${API}/transactions`),
          fetch(`${API}/budget`),
        ]);
        if (ignore) return;
        if (txRes.ok) {
          const txData = await txRes.json();
          setTransactions(txData);
        }
        if (bRes.ok) {
          const bData = await bRes.json();
          const bVal = Number(bData.monthlyBudget) || 15000;
          setBudget(bVal);
          setBudgetInput(String(bVal));
        }
      } catch (err) {
        if (!ignore) {
          console.error("Failed to fetch data:", err);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("budgetTrackerDarkMode", darkMode);
    if (darkMode) {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  }, [darkMode]);

  // Totals
  const { income, expense, balance, remaining } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const t of transactions) {
      if (t.type === "income") inc += Number(t.amount);
      else exp += Number(t.amount);
    }
    return {
      income: inc,
      expense: exp,
      balance: inc - exp,
      remaining: budget - exp,
    };
  }, [transactions, budget]);

  // Unique categories for filters & datalist
  const categories = useMemo(() => {
    return [...new Set(transactions.map((t) => t.category).filter(Boolean))].sort();
  }, [transactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      const matchesSearch = !q || t.title.toLowerCase().includes(q);
      const matchesType = filterType === "all" || t.type === filterType;
      const matchesCategory = filterCategory === "all" || t.category === filterCategory;
      return matchesSearch && matchesType && matchesCategory;
    });
  }, [transactions, search, filterType, filterCategory]);

  // Recent transactions (top 5 by date)
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
  }, [transactions]);

  // Form handling
  function resetForm() {
    setForm({
      title: "",
      amount: "",
      type: "expense",
      category: "",
      date: new Date().toISOString().split("T")[0],
      description: "",
    });
    setEditingId(null);
    setFormErrors({});
  }

  function startEdit(t) {
    setEditingId(t.id);
    setForm({
      title: t.title,
      amount: String(t.amount),
      type: t.type,
      category: t.category,
      date: t.date,
      description: t.description || "",
    });
    setFormErrors({});
    setActivePage("add");
  }

  function validateForm() {
    const errors = {};
    if (!form.title.trim()) errors.title = "Title is required.";
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      errors.amount = "Enter an amount greater than zero.";
    }
    if (!form.type) errors.type = "Select a type.";
    if (!form.category.trim()) errors.category = "Category is required.";
    if (!form.date || isNaN(Date.parse(form.date))) errors.date = "Enter a valid date.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;

    const payload = {
      title: form.title.trim(),
      amount: Number(form.amount),
      type: form.type,
      category: form.category.trim(),
      date: form.date,
      description: form.description.trim(),
    };

    try {
      if (editingId) {
        const res = await fetch(`${API}/transactions/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Update failed");
        showToast("Transaction updated successfully.");
      } else {
        const res = await fetch(`${API}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Add failed");
        showToast("Transaction added successfully.");
      }
      await loadData();
      resetForm();
      setActivePage("transactions");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Delete transaction
  async function confirmDelete() {
    if (!pendingDeleteId) return;
    try {
      const res = await fetch(`${API}/transactions/${pendingDeleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showToast("Transaction deleted.");
      await loadData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setPendingDeleteId(null);
    }
  }

  // Budget handling
  async function handleBudgetSubmit(e) {
    e.preventDefault();
    if (budgetInput === "" || isNaN(budgetInput) || Number(budgetInput) < 0) {
      showToast("Enter a valid non-negative amount.", "error");
      return;
    }
    try {
      const res = await fetch(`${API}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyBudget: Number(budgetInput) }),
      });
      if (!res.ok) throw new Error("Failed to save budget");
      setBudget(Number(budgetInput));
      showToast("Budget saved.");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // Export CSV
  function exportCsv() {
    if (filteredTransactions.length === 0) {
      showToast("No transactions to export.", "error");
      return;
    }
    const headers = ["Title", "Amount", "Type", "Category", "Date", "Description"];
    const csvLines = [headers.join(",")];
    for (const t of filteredTransactions) {
      const line = [
        `"${String(t.title).replace(/"/g, '""')}"`,
        t.amount,
        t.type,
        `"${String(t.category).replace(/"/g, '""')}"`,
        t.date,
        `"${String(t.description || "").replace(/"/g, '""')}"`,
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

  // Category breakdown for Pie Chart
  const categoryBreakdown = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (t.type === "expense") {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      }
    }
    const totalExp = Object.values(map).reduce((a, b) => a + b, 0);
    const colors = ["#2563eb", "#3b82f6", "#167a5c", "#c23b3b", "#8891ab", "#12266b", "#e07b39"];
    return Object.entries(map).map(([cat, val], idx) => ({
      category: cat,
      amount: val,
      percentage: totalExp > 0 ? (val / totalExp) * 100 : 0,
      color: colors[idx % colors.length],
    }));
  }, [transactions]);

  // Budget percent
  const budgetPct = budget > 0 ? Math.min((expense / budget) * 100, 100) : 0;

  return (
    <div className={`app-shell ${darkMode ? "dark" : ""}`}>
      {/* Mobile Top Bar */}
      <header className="topbar">
        <button
          className="hamburger-btn"
          aria-label="Toggle menu"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          ☰
        </button>
        <span className="topbar-title">Budget Tracker</span>
        <button
          className="icon-btn"
          aria-label="Toggle dark mode"
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? "☀️" : "🌙"}
        </button>
      </header>

      <div className="app-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
          <div className="sidebar-brand">
            <span className="brand-icon">💰</span>
            <span className="brand-text">Budget Tracker</span>
          </div>

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activePage === "dashboard" ? "active" : ""}`}
              onClick={() => { setActivePage("dashboard"); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon">📊</span> Dashboard
            </button>
            <button
              className={`nav-item ${activePage === "transactions" ? "active" : ""}`}
              onClick={() => { setActivePage("transactions"); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon">📄</span> Transactions
            </button>
            <button
              className={`nav-item ${activePage === "add" ? "active" : ""}`}
              onClick={() => { resetForm(); setActivePage("add"); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon">➕</span> Add Transaction
            </button>
            <button
              className={`nav-item ${activePage === "budget" ? "active" : ""}`}
              onClick={() => { setActivePage("budget"); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon">🎯</span> Budget
            </button>
            <button
              className={`nav-item ${activePage === "reports" ? "active" : ""}`}
              onClick={() => { setActivePage("reports"); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon">📈</span> Reports
            </button>
          </nav>

          <div className="sidebar-footer">
            <label className="dark-toggle">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => setDarkMode(e.target.checked)}
              />
              <span>Dark Mode</span>
            </label>
          </div>
        </aside>

        {mobileMenuOpen && (
          <div
            className="sidebar-overlay visible"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <main className="main-content">
          {/* ================= DASHBOARD PAGE ================= */}
          {activePage === "dashboard" && (
            <section className="page active">
              <h1 className="page-title">Dashboard</h1>
              <p className="page-subtitle">Overview of your finances</p>

              <div className="cards-grid">
                <div className="card card-balance">
                  <div className="card-icon">💼</div>
                  <div className="card-info">
                    <span className="card-label">Total Balance</span>
                    <span className="card-value">{formatCurrency(balance)}</span>
                  </div>
                </div>

                <div className="card card-income">
                  <div className="card-icon">⬆️</div>
                  <div className="card-info">
                    <span className="card-label">Total Income</span>
                    <span className="card-value">{formatCurrency(income)}</span>
                  </div>
                </div>

                <div className="card card-expense">
                  <div className="card-icon">⬇️</div>
                  <div className="card-info">
                    <span className="card-label">Total Expenses</span>
                    <span className="card-value">{formatCurrency(expense)}</span>
                  </div>
                </div>

                <div className="card card-remaining">
                  <div className="card-icon">🎯</div>
                  <div className="card-info">
                    <span className="card-label">Remaining Budget</span>
                    <span className="card-value">{formatCurrency(remaining)}</span>
                  </div>
                </div>
              </div>

              {budget > 0 && expense > budget && (
                <div className="budget-warning">
                  ⚠️ You have exceeded your monthly budget!
                </div>
              )}

              <div className="panel">
                <div className="panel-header">
                  <h2>Recent Transactions</h2>
                  <button
                    className="btn btn-outline"
                    onClick={() => setActivePage("transactions")}
                  >
                    View All
                  </button>
                </div>

                <div className="table-wrapper">
                  <table className="tx-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTransactions.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="empty-msg">
                            No transactions yet. Add your first one!
                          </td>
                        </tr>
                      ) : (
                        recentTransactions.map((t) => (
                          <tr key={t.id}>
                            <td>{t.title}</td>
                            <td>{t.category}</td>
                            <td>{formatDate(t.date)}</td>
                            <td>
                              <span className={`type-badge ${t.type}`}>{t.type}</span>
                            </td>
                            <td
                              className={
                                t.type === "income" ? "amount-income" : "amount-expense"
                              }
                            >
                              {t.type === "income" ? "+" : "-"}
                              {formatCurrency(t.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ================= TRANSACTIONS PAGE ================= */}
          {activePage === "transactions" && (
            <section className="page active">
              <div className="page-header-row">
                <div>
                  <h1 className="page-title">Transactions</h1>
                  <p className="page-subtitle">Search, filter, edit or delete transactions</p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => { resetForm(); setActivePage("add"); }}
                >
                  + Add Transaction
                </button>
              </div>

              <div className="filters-bar">
                <input
                  type="text"
                  placeholder="🔍 Search by title..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="all">All Types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button className="btn btn-outline" onClick={exportCsv}>
                  📥 Export CSV
                </button>
              </div>

              <div className="panel">
                <div className="table-wrapper">
                  <table className="tx-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="empty-msg">
                            No transactions match your search/filter.
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((t) => (
                          <tr key={t.id}>
                            <td>{t.title}</td>
                            <td>{t.category}</td>
                            <td>{formatDate(t.date)}</td>
                            <td>
                              <span className={`type-badge ${t.type}`}>{t.type}</span>
                            </td>
                            <td
                              className={
                                t.type === "income" ? "amount-income" : "amount-expense"
                              }
                            >
                              {t.type === "income" ? "+" : "-"}
                              {formatCurrency(t.amount)}
                            </td>
                            <td>{t.description || "—"}</td>
                            <td className="actions-cell">
                              <button
                                className="btn-icon-sm"
                                title="Edit"
                                onClick={() => startEdit(t)}
                              >
                                ✏️
                              </button>
                              <button
                                className="btn-icon-sm"
                                title="Delete"
                                onClick={() => setPendingDeleteId(t.id)}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ================= ADD / EDIT TRANSACTION PAGE ================= */}
          {activePage === "add" && (
            <section className="page active">
              <h1 className="page-title">
                {editingId ? "Edit Transaction" : "Add Transaction"}
              </h1>
              <p className="page-subtitle">
                {editingId ? `Editing "${form.title}"` : "Fill in the details below"}
              </p>

              <div className="panel form-panel">
                <form onSubmit={handleFormSubmit}>
                  <div className="form-row">
                    <label htmlFor="txTitle">Title</label>
                    <input
                      id="txTitle"
                      type="text"
                      placeholder="e.g. Grocery Shopping"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                    {formErrors.title && <span className="field-error">{formErrors.title}</span>}
                  </div>

                  <div className="form-grid">
                    <div className="form-row">
                      <label htmlFor="txAmount">Amount (₹)</label>
                      <input
                        id="txAmount"
                        type="number"
                        placeholder="e.g. 500"
                        min="0"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      />
                      {formErrors.amount && <span className="field-error">{formErrors.amount}</span>}
                    </div>

                    <div className="form-row">
                      <label htmlFor="txType">Type</label>
                      <select
                        id="txType"
                        value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                      >
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                      {formErrors.type && <span className="field-error">{formErrors.type}</span>}
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-row">
                      <label htmlFor="txCategory">Category</label>
                      <input
                        id="txCategory"
                        type="text"
                        list="reactCategoryList"
                        placeholder="e.g. Food, Transport, Salary"
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                      />
                      <datalist id="reactCategoryList">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                      {formErrors.category && (
                        <span className="field-error">{formErrors.category}</span>
                      )}
                    </div>

                    <div className="form-row">
                      <label htmlFor="txDate">Date</label>
                      <input
                        id="txDate"
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                      />
                      {formErrors.date && <span className="field-error">{formErrors.date}</span>}
                    </div>
                  </div>

                  <div className="form-row">
                    <label htmlFor="txDescription">Description (optional)</label>
                    <textarea
                      id="txDescription"
                      rows={3}
                      placeholder="Add a short note..."
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      {editingId ? "Save Changes" : "Add Transaction"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => { resetForm(); setActivePage("transactions"); }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}

          {/* ================= BUDGET PAGE ================= */}
          {activePage === "budget" && (
            <section className="page active">
              <h1 className="page-title">Budget Management</h1>
              <p className="page-subtitle">Set your monthly budget and track how much is left</p>

              <div className="panel form-panel budget-panel">
                <form onSubmit={handleBudgetSubmit}>
                  <div className="form-row">
                    <label htmlFor="budgetInput">Monthly Budget (₹)</label>
                    <input
                      id="budgetInput"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 15000"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Save Budget
                  </button>
                </form>

                <div className="budget-summary">
                  <div className="budget-summary-row">
                    <span>Monthly Budget</span>
                    <strong>{formatCurrency(budget)}</strong>
                  </div>
                  <div className="budget-summary-row">
                    <span>Spent So Far</span>
                    <strong>{formatCurrency(expense)}</strong>
                  </div>
                  <div className="budget-summary-row">
                    <span>Remaining</span>
                    <strong>{formatCurrency(remaining)}</strong>
                  </div>
                  <div className="progress-bar-track">
                    <div
                      className={`progress-bar-fill ${budget > 0 && expense > budget ? "over" : ""}`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ================= REPORTS PAGE ================= */}
          {activePage === "reports" && (
            <section className="page active">
              <h1 className="page-title">Reports</h1>
              <p className="page-subtitle">Visualize your income and expenses</p>

              <div className="charts-grid">
                {/* Expense by Category */}
                <div className="panel chart-panel">
                  <h2>Expense by Category</h2>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <svg viewBox="-105 -105 210 210" style={{ width: "240px", height: "240px" }}>
                      {categoryBreakdown.length === 0 ? (
                        <circle cx="0" cy="0" r="90" fill="#e2e8f0" />
                      ) : (
                        (() => {
                          let cumulativeAngle = 0;
                          return categoryBreakdown.map((item, i) => {
                            const angle = (item.percentage / 100) * 360;
                            const startAngle = cumulativeAngle;
                            cumulativeAngle += angle;

                            const startRad = ((startAngle - 90) * Math.PI) / 180;
                            const endRad = (((startAngle + angle) - 90) * Math.PI) / 180;

                            const x1 = 90 * Math.cos(startRad);
                            const y1 = 90 * Math.sin(startRad);
                            const x2 = 90 * Math.cos(endRad);
                            const y2 = 90 * Math.sin(endRad);

                            const largeArc = angle > 180 ? 1 : 0;
                            const pathData =
                              categoryBreakdown.length === 1
                                ? `M 0 -90 A 90 90 0 1 1 -0.01 -90 Z`
                                : `M 0 0 L ${x1} ${y1} A 90 90 0 ${largeArc} 1 ${x2} ${y2} Z`;

                            return (
                              <path
                                key={item.category || i}
                                d={pathData}
                                fill={item.color}
                                stroke="#ffffff"
                                strokeWidth="2"
                              />
                            );
                          });
                        })()
                      )}
                    </svg>

                    {/* Legend */}
                    <div style={{ display: "flex", gap: "16px", marginTop: "16px", flexWrap: "wrap", justifyContent: "center" }}>
                      {categoryBreakdown.map((item) => (
                        <div key={item.category} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                          <span style={{ width: "14px", height: "14px", backgroundColor: item.color, borderRadius: "2px" }} />
                          <span>{item.category}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Income vs Expense Bar Chart */}
                <div className="panel chart-panel">
                  <h2>Income vs Expense</h2>
                  <div style={{ padding: "10px 0" }}>
                    <svg viewBox="0 0 320 220" style={{ width: "100%", height: "240px", overflow: "visible" }}>
                      {/* Grid lines and y-axis ticks */}
                      {[0, 5000, 10000, 15000, 20000, 25000, 30000].map((val) => {
                        const y = 190 - (val / 30000) * 170;
                        return (
                          <g key={val}>
                            <line x1="45" y1={y} x2="310" y2={y} stroke="#edf2f7" strokeWidth="1" />
                            <text
                              x="40"
                              y={y + 4}
                              fontSize="11"
                              fill="#64748b"
                              textAnchor="end"
                              fontFamily="'Inter', sans-serif"
                            >
                              {val.toLocaleString("en-IN")}
                            </text>
                          </g>
                        );
                      })}

                      {/* Income Bar */}
                      {(() => {
                        const height = (income / 30000) * 170;
                        const y = 190 - height;
                        return (
                          <g>
                            <rect
                              x="80"
                              y={y}
                              width="80"
                              height={height}
                              fill="#167a5c"
                              rx="6"
                              ry="6"
                            />
                            <text
                              x="120"
                              y="210"
                              fontSize="12"
                              fill="#475569"
                              textAnchor="middle"
                              fontWeight="500"
                            >
                              Income
                            </text>
                          </g>
                        );
                      })()}

                      {/* Expense Bar */}
                      {(() => {
                        const height = (expense / 30000) * 170;
                        const y = 190 - height;
                        return (
                          <g>
                            <rect
                              x="190"
                              y={y}
                              width="80"
                              height={height}
                              fill="#c23b3b"
                              rx="6"
                              ry="6"
                            />
                            <text
                              x="230"
                              y="210"
                              fontSize="12"
                              fill="#475569"
                              textAnchor="middle"
                              fontWeight="500"
                            >
                              Expense
                            </text>
                          </g>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteId && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Transaction?</h3>
            <p>This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
              <button className="btn btn-outline" onClick={() => setPendingDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
