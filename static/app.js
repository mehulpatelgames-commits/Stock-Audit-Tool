/* ═══════════════════════════════════════════════════
   PIL STOCK AUDIT — app.js
   Mobile-only frontend logic
═══════════════════════════════════════════════════ */

const API = {
  get: async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  },
  post: async (url, body) => {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(()=>{}); throw new Error(d?.detail || `${r.status}`); }
    return r.json();
  },
  patch: async (url, body) => {
    const r = await fetch(url, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(()=>{}); throw new Error(d?.detail || `${r.status}`); }
    return r.json();
  },
  del: async (url) => {
    const r = await fetch(url, { method:'DELETE' });
    if (!r.ok) { const d = await r.json().catch(()=>{}); throw new Error(d?.detail || `${r.status}`); }
    return r.json();
  },
  delete: async (url) => API.del(url),  // alias
  form: async (url, fd) => {
    const r = await fetch(url, { method:'POST', body: fd });
    if (!r.ok) { const d = await r.json().catch(()=>{}); throw new Error(d?.detail || `${r.status}`); }
    return r.json();
  },
};

// ── STATE ─────────────────────────────────────────────
const State = {
  user: null,
  isAdmin: false,
  activeAudit: null,
  departments: [],       // all departments (admin sees all)
  activeDeptId: null,    // currently active dept in audit tab
  lockedDeptId: null,    // non-admin: locked to this dept for entire session
  stockItems: [],
  filteredItems: [],
  filterPrefs: JSON.parse(localStorage.getItem('filterPrefs') || '{}'),
};

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── SPINNER ───────────────────────────────────────────
function showSpinner() { document.getElementById('spinner').classList.add('show'); }
function hideSpinner() { document.getElementById('spinner').classList.remove('show'); }

// ══════════════════════════════════════════════════════
// APP — CORE
// ══════════════════════════════════════════════════════
const App = {

  async init() {
    // Listen for Enter key on login inputs
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    if (uInput && pInput) {
      const handleEnter = (e) => { if (e.key === 'Enter') App.loginStep1(); };
      uInput.addEventListener('keydown', handleEnter);
      pInput.addEventListener('keydown', handleEnter);
    }
  },

  // ── STEP 1: Validate ID & Password ──────────────────
  async loginStep1() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!username) { toast('Please enter your User ID', 'warning'); return; }
    if (!password) { toast('Please enter your Password', 'warning'); return; }

    showSpinner();

    let authRes;
    try {
      authRes = await API.post('/api/auth/login', { username, password });
    } catch(e) {
      toast(e.message || 'Invalid User ID or Password', 'error');
      hideSpinner();
      return;
    }

    State.user     = authRes.name;
    State.username = authRes.username;
    State.isAdmin  = authRes.is_admin;

    // Load audit data
    await App.loadAudit();

    hideSpinner();

    if (authRes.is_admin) {
      App.enterApp(null);
    } else {
      App.showDeptSelection();
    }
  },

  // ── STEP 2: Show dept selection for non-admin ─────
  showDeptSelection() {
    document.getElementById('loginStep1').style.display = 'none';
    document.getElementById('loginStep2').style.display = 'block';
    document.getElementById('loginNameDisplay').textContent = State.user;

    const container = document.getElementById('deptSelectList');

    if (!State.departments.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:24px 0;">
          <div class="empty-icon" style="font-size:32px;">😕</div>
          <p>No departments available.<br>Ask admin to import data first.</p>
        </div>`;
      return;
    }

    container.innerHTML = State.departments.map(dept => {
      const pct = dept.total_items ? Math.round((dept.verified_items / dept.total_items) * 100) : 0;
      return `
        <div class="dept-card" onclick="App.enterApp(${dept.id})" style="margin-bottom:10px;">
          <div class="dept-card-header">
            <div>
              <div class="dept-name">${dept.name}</div>
              <div class="dept-count">${dept.total_items} items · ${dept.verified_items} verified</div>
            </div>
            <div style="font-size:20px; font-weight:700; color:var(--primary)">${pct}%</div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');
  },

  backToStep1() {
    document.getElementById('loginStep1').style.display = 'block';
    document.getElementById('loginStep2').style.display = 'none';
    State.user = null;
    State.isAdmin = false;
  },

  // ── ENTER THE APP ────────────────────────────────
  enterApp(deptId) {
    State.lockedDeptId = deptId;
    State.activeDeptId = deptId || (State.departments[0]?.id ?? null);

    // Switch screens
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display    = 'block';

    // Topbar
    document.getElementById('topbarUser').textContent = State.user;

    const btnSwitch = document.getElementById('btnSwitchDept');
    if (State.isAdmin) {
      document.getElementById('topbarTitle').textContent    = State.activeAudit?.name || 'Stock Audit';
      document.getElementById('adminSection').style.display = 'block';
      document.getElementById('deptChips').style.display    = 'flex';
      document.getElementById('dashSectionTitle').textContent = 'All Departments';
      if (btnSwitch) btnSwitch.style.display = 'none';
      Audit.renderDeptChips();
    } else {
      const dept = State.departments.find(d => d.id === deptId);
      document.getElementById('topbarTitle').textContent    = dept ? dept.name : 'Stock Audit';
      document.getElementById('adminSection').style.display = 'none';
      document.getElementById('deptChips').style.display    = 'none';
      document.getElementById('dashSectionTitle').textContent = 'My Department';
      if (btnSwitch) btnSwitch.style.display = 'inline-flex';
    }

    if (!State.isAdmin && deptId) {
      const dept = State.departments.find(d => d.id === deptId);
      if (dept && dept.verification_method === 'finish_goods') {
        FG.open(deptId);
        return;
      }
    }

    Dashboard.render();
    ExtraStock.populateForm();
    App.showPage('dashboard');

    // Admin: pre-load staff list
    if (State.isAdmin) Staff.load();

    // Background load stock for audit tab
    if (State.activeDeptId) {
      Audit.loadStock();
    }
  },

  showDeptSelectionModal() {
    const container = document.getElementById('switchDeptList');
    if (!container) return;
    if (!State.departments.length) {
      container.innerHTML = '<div class="empty-state"><p>No departments available.</p></div>';
      Modals.open('switchDeptModal');
      return;
    }

    container.innerHTML = State.departments.map(dept => {
      const isCurrent = dept.id === State.lockedDeptId;
      const isFG = dept.verification_method === 'finish_goods';
      const pct = dept.total_items ? Math.round((dept.verified_items / dept.total_items) * 100) : 0;
      return `
        <div class="dept-card" onclick="App.selectAndSwitchDept(${dept.id})" style="margin-bottom:10px; cursor:pointer; ${isCurrent ? 'border:2px solid var(--primary); background:#f0f7ff;' : ''}">
          <div class="dept-card-header">
            <div>
              <div class="dept-name">
                ${dept.name}
                ${isFG ? '<span style="font-size:10px; background:#eff6ff; color:#2563eb; padding:2px 6px; border-radius:4px; font-weight:700; margin-left:6px;">SPECIAL METHOD</span>' : ''}
                ${isCurrent ? '<span style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:700; margin-left:6px;">CURRENT</span>' : ''}
              </div>
              <div class="dept-count">${dept.total_items || 0} items · ${dept.verified_items || 0} verified</div>
            </div>
            <div style="font-size:18px; font-weight:700; color:var(--primary)">${pct}%</div>
          </div>
          <div class="progress-bar" style="margin-top:6px;">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
    Modals.open('switchDeptModal');
  },

  selectAndSwitchDept(deptId) {
    Modals.close('switchDeptModal');
    State.lockedDeptId = deptId;
    State.activeDeptId = deptId;

    const dept = State.departments.find(d => d.id === deptId);
    const deptName = dept ? dept.name : 'Stock Audit';

    if (!State.isAdmin) {
      document.getElementById('topbarTitle').textContent = deptName;
    }

    Dashboard.render();
    ExtraStock.populateForm();

    if (dept && dept.verification_method === 'finish_goods') {
      FG.open(deptId);
    } else {
      Audit.loadStock();
      App.showPage('audit');
    }
    toast(`Switched to ${deptName}`, 'success');
  },

  async loadAudit() {
    try {
      const audit = await API.get('/api/audits/active');
      State.activeAudit = audit;
      const depts = await API.get(`/api/departments/audit/${audit.id}`);
      State.departments = Array.isArray(depts) ? depts : [];
    } catch(e) {
      // No active audit yet — perfectly fine, admin will create one via import
      State.activeAudit = null;
      State.departments  = [];
    }
  },

  logout() {
    if (!confirm('Logout and return to login?')) return;

    // Reset all state
    State.user = null;
    State.isAdmin = false;
    State.activeAudit = null;
    State.departments = [];
    State.activeDeptId = null;
    State.lockedDeptId = null;
    State.stockItems = [];
    State.filteredItems = [];

    // Reset login UI
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginStep1').style.display = 'block';
    document.getElementById('loginStep2').style.display = 'none';
    const uIn = document.getElementById('loginUsername');
    const pIn = document.getElementById('loginPassword');
    if (uIn) uIn.value = '';
    if (pIn) pIn.value = '';
    document.getElementById('globalSearch').value = '';
    document.getElementById('dynamicFilters').innerHTML = '';
    document.getElementById('stockList').innerHTML = '';
  },

  showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageId = page === 'fgaudit' ? 'pageFGAudit' : `page${page.charAt(0).toUpperCase() + page.slice(1)}`;
    const pageEl = document.getElementById(pageId);
    if (pageEl) pageEl.classList.add('active');

    const mainNav = document.getElementById('mainBottomNav');
    if (mainNav) {
      mainNav.style.display = page === 'fgaudit' ? 'none' : 'flex';
    }

    const navEl = document.getElementById(`nav-${page}`);
    if (navEl) navEl.classList.add('active');

    if (page === 'dashboard') {
      if (!State.isAdmin) {
        const curDept = State.departments.find(d => d.id === State.lockedDeptId);
        document.getElementById('topbarTitle').textContent = curDept ? curDept.name : 'Stock Audit';
      }
      Dashboard.render();
    } else if (page === 'audit') {
      Audit.renderDynamicFilters();
    }
  }
};

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
const Dashboard = {

  async refresh() {
    showSpinner();
    try {
      const depts = await API.get(`/api/departments/audit/${State.activeAudit.id}`);
      State.departments = Array.isArray(depts) ? depts : [];
      Dashboard.render();
      ExtraStock.populateForm();
      toast('Refreshed ✅', 'success');
    } catch(e) {
      toast('Refresh failed', 'error');
    } finally {
      hideSpinner();
    }
  },

  render() {
    const container = document.getElementById('deptList');

    const depts = State.isAdmin
      ? State.departments
      : State.departments.filter(d => d.id === State.lockedDeptId);

    if (!depts.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p>${State.isAdmin ? 'No departments imported yet.<br>Use Import to add stock data.' : 'No data available for your department.'}</p>
        </div>`;
      return;
    }

    container.innerHTML = depts.map(dept => {
      const total   = dept.total_items   || 0;
      const verified= dept.verified_items|| 0;
      const pending = total - verified;
      const pct     = total ? Math.round((verified / total) * 100) : 0;
      const allDone = total > 0 && pending === 0;

      const isFG = dept.verification_method === 'finish_goods';
      const methodBadge = isFG
        ? `<div class="status-badge" style="background:#E0E7FF; color:#3730A3;">📦 Specific FG Method</div>`
        : '';

      const statusBadge = allDone
        ? `<div class="status-badge ready">✅ Good to Export</div>`
        : `<div class="status-badge working">🔄 Currently Working</div>`;

      return `
        <div class="dept-card" onclick="Dashboard.openDept(${dept.id})">
          <div class="dept-card-header">
            <div>
              <div class="dept-name">${dept.name}</div>
              <div class="dept-count">${total} items total</div>
            </div>
            <div style="font-size:22px; font-weight:700; color:var(--primary)">${pct}%</div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${allDone ? 'done' : ''}" style="width:${pct}%"></div>
          </div>
          <div class="dept-stats">
            <div class="stat-pill verified">✅ ${verified} Done</div>
            <div class="stat-pill pending">⏳ ${pending} Left</div>
            ${statusBadge}
            ${methodBadge}
          </div>
          ${State.isAdmin ? `
            <div class="dept-card-admin-actions" onclick="event.stopPropagation()">
              <button class="btn-card-action export" onclick="Admin.exportSpecificDept(${dept.id}, '${dept.name.replace(/'/g, "\\'")}')">
                📥 Export Sheet
              </button>
              <button class="btn-card-action remove" onclick="Admin.removeDept(${dept.id}, '${dept.name.replace(/'/g, "\\'")}', ${total})">
                🗑️ Erase Data
              </button>
            </div>
          ` : ''}
        </div>`;
    }).join('');
  },

  openDept(deptId) {
    State.activeDeptId = deptId;
    const dept = State.departments.find(d => d.id === deptId);
    if (dept && dept.verification_method === 'finish_goods') {
      FG.open(deptId);
      return;
    }
    if (State.isAdmin) Audit.renderDeptChips();
    Audit.loadStock();
    App.showPage('audit');
  }
};

// ══════════════════════════════════════════════════════
// STAFF MANAGEMENT (Admin only)
// ══════════════════════════════════════════════════════
const Staff = {
  users: [],

  async load() {
    try {
      const res    = await API.get('/api/auth/users');
      Staff.users  = res.users || [];
      Staff.render();
    } catch(e) {
      toast('Failed to load staff list', 'error');
    }
  },

  render() {
    const container = document.getElementById('staffList');
    if (!container) return;
    if (!Staff.users.length) {
      container.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px">No staff added yet</div>';
      return;
    }
    container.innerHTML = Staff.users.map(u => `
      <div class="staff-row">
        <div class="staff-info">
          <div>
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="staff-name">${u.name}</span>
              ${u.is_admin ? '<span class="staff-badge admin">Admin</span>' : '<span class="staff-badge team">Team</span>'}
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
              ID: <b>${u.username || '—'}</b> · Pass: <b>${u.password || '—'}</b>
            </div>
          </div>
        </div>
        <div class="staff-actions">
          <button class="btn-icon" onclick="Staff.editPrompt(${u.id},'${u.name.replace(/'/g,"\\'")}','${(u.username||'').replace(/'/g,"\\'")}','${(u.password||'').replace(/'/g,"\\'")}',${u.is_admin})" title="Edit">✏️</button>
          <button class="btn-icon danger" onclick="Staff.remove(${u.id},'${u.name.replace(/'/g,"\\'")}')" title="Remove">🗑️</button>
        </div>
      </div>`).join('');
  },

  async add() {
    const nameEl    = document.getElementById('newStaffName');
    const userEl    = document.getElementById('newStaffUsername');
    const passEl    = document.getElementById('newStaffPassword');
    const adminEl   = document.getElementById('newStaffAdmin');

    const name      = nameEl.value.trim();
    const username  = userEl ? userEl.value.trim() : '';
    const password  = passEl ? passEl.value.trim() : '';
    const is_admin  = adminEl.checked;

    if (!name) { toast('Enter member full name', 'warning'); return; }
    if (!username) { toast('Enter user ID/Username', 'warning'); return; }
    if (!password) { toast('Enter password', 'warning'); return; }

    showSpinner();
    try {
      await API.post('/api/auth/users', { name, username, password, is_admin });
      nameEl.value    = '';
      if (userEl) userEl.value = '';
      if (passEl) passEl.value = '123';
      adminEl.checked = false;
      toast(`✅ Added member '${name}' (${username})`, 'success');
      await Staff.load();
    } catch(e) {
      toast(e.message || 'Failed to add', 'error');
    } finally { hideSpinner(); }
  },

  editPrompt(id, currentName, currentUsername, currentPassword, currentAdmin) {
    const newName = prompt(`Full Name for member:`, currentName);
    if (!newName) return;
    const newUsername = prompt(`User ID / Username:`, currentUsername || '');
    if (!newUsername) return;
    const newPassword = prompt(`Password:`, currentPassword || '');
    if (!newPassword) return;
    const newAdmin = confirm(`Should '${newName}' be an Admin?\n(OK = Admin with all permissions, Cancel = Team member)`);

    Staff.update(id, newName.trim(), newUsername.trim(), newPassword.trim(), newAdmin);
  },

  async update(id, name, username, password, is_admin) {
    showSpinner();
    try {
      await API.patch(`/api/auth/users/${id}`, { name, username, password, is_admin });
      toast(`✅ Updated '${name}'`, 'success');
      await Staff.load();
    } catch(e) {
      toast(e.message || 'Update failed', 'error');
    } finally { hideSpinner(); }
  },

  async remove(id, name) {
    if (!confirm(`Remove '${name}' from team members?\nThey will no longer be able to log in.`)) return;
    showSpinner();
    try {
      await API.delete(`/api/auth/users/${id}`);
      toast(`Removed '${name}'`, 'success');
      await Staff.load();
    } catch(e) {
      toast(e.message || 'Remove failed', 'error');
    } finally { hideSpinner(); }
  }
};

// ══════════════════════════════════════════════════════
// AUDIT
// ══════════════════════════════════════════════════════
const Audit = {
  selectedItemIds: new Set(),

  // Admin only — dept switching chips
  renderDeptChips() {
    if (!State.isAdmin) return;
    const container = document.getElementById('deptChips');
    container.innerHTML = State.departments.map(d => `
      <button class="dept-chip ${d.id === State.activeDeptId ? 'active' : ''}"
              onclick="Audit.switchDept(${d.id})">
        ${d.name}
      </button>`).join('');
  },

  switchDept(deptId) {
    if (!State.isAdmin) return; // safety guard
    State.activeDeptId = deptId;
    Audit.renderDeptChips();
    Audit.renderDynamicFilters();
    Audit.loadStock();
  },

  getDept() {
    return State.departments.find(d => d.id === State.activeDeptId);
  },

  getFilterPrefs() {
    const dept = Audit.getDept();
    if (!dept) return [];
    const key = `dept_${State.activeDeptId}`;
    if (State.filterPrefs[key]) return State.filterPrefs[key];
    const cols = dept.columns || [];
    return cols.includes('Stand') ? ['Stand'] : cols.slice(0, 2);
  },

  renderDynamicFilters() {
    const prefs = Audit.getFilterPrefs();
    const container = document.getElementById('dynamicFilters');
    container.innerHTML = prefs.map(col => `
      <input type="text" id="filter_${col.replace(/\s/g,'_')}"
             placeholder="${col}..." oninput="Audit.applyFilter()">`
    ).join('');
  },

  async loadStock() {
    if (!State.activeDeptId) return;
    const dept = Audit.getDept();
    const titleEl = document.getElementById('auditDeptTitle');
    const subEl = document.getElementById('auditDeptSubtitle');
    if (titleEl && dept) titleEl.textContent = dept.name;
    if (subEl && dept) subEl.textContent = `${dept.total_items || 0} items · General Physical Verification`;

    showSpinner();
    try {
      const items = await API.get(`/api/stock/${State.activeDeptId}`);
      State.stockItems = items;
      Audit.selectedItemIds.clear();
      if (subEl && dept) subEl.textContent = `${items.length} items · General Physical Verification`;
      document.getElementById('globalSearch').value = '';
      Audit.renderDynamicFilters();
      Audit.applyFilter();
    } catch(e) {
      toast('Failed to load stock', 'error');
    } finally {
      hideSpinner();
    }
  },

  applyFilter() {
    const normalize = s => String(s || '').toLowerCase().replace(/[\s\-]/g, '');
    const g = normalize(document.getElementById('globalSearch').value);
    const prefs = Audit.getFilterPrefs();

    const filterVals = {};
    prefs.forEach(col => {
      const el = document.getElementById(`filter_${col.replace(/\s/g,'_')}`);
      if (el) filterVals[col] = normalize(el.value);
    });

    const hasFilter = g || Object.values(filterVals).some(v => v);

    State.filteredItems = State.stockItems.filter(item => {
      if (g) {
        const allText = Object.values(item.data).join(' ');
        if (!normalize(allText).includes(g)) return false;
      }
      for (const [col, val] of Object.entries(filterVals)) {
        if (!val) continue;
        if (!normalize(item.data[col] || '').includes(val)) return false;
      }
      return true;
    });

    document.getElementById('resultsMeta').textContent = hasFilter
      ? `Showing ${State.filteredItems.length} of ${State.stockItems.length} items`
      : '';

    if (!hasFilter) {
      document.getElementById('stockList').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>Use the search bar above<br>to find stock items</p>
        </div>`;
      Audit.updateBulkBarUI();
    } else {
      Audit.renderStockList();
      Audit.updateBulkBarUI();
    }
  },

  renderStockList() {
    const container = document.getElementById('stockList');
    if (!State.filteredItems.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">😕</div>
          <p>No items match your search</p>
        </div>`;
      return;
    }

    const dept = Audit.getDept();
    const cols = dept ? dept.columns : [];

    container.innerHTML = State.filteredItems.map((item, idx) => {
      let badgeClass = 'badge-pending';
      let cardClass = '';
      let badgeText = '⏳ Pending';

      if (item.verified) {
        const diff = item.physical_qty - (item.management_qty || 0);
        if (diff === 0) {
          badgeClass = 'badge-verified'; cardClass = 'verified'; badgeText = '✅ Match';
        } else {
          badgeClass = 'badge-discrepant'; cardClass = 'discrepant';
          badgeText = diff > 0 ? `🔺 +${diff}` : `🔻 ${diff}`;
        }
      }

      if (item.being_edited_by && item.being_edited_by !== State.user) {
        cardClass = 'editing';
      }

      const displayCols = cols.slice(0, 6);
      const gridHTML = displayCols.map(col => `
        <div class="data-item">
          <div class="data-label">${col}</div>
          <div class="data-value">${item.data[col] ?? '—'}</div>
        </div>`).join('');

      const photoBadge = (item.photos && item.photos.length > 0)
        ? `<span style="background:#EDE7F6; color:#5E35B1; font-size:11px; font-weight:700; padding:2px 8px; border-radius:12px; margin-right:4px;">📷 Photo</span>`
        : '';

      const isSelected = Audit.selectedItemIds.has(item.id);
      const checkboxHTML = (item.management_qty != null && !item.verified)
        ? `<div class="item-checkbox-wrapper" onclick="event.stopPropagation()">
             <input type="checkbox" class="stock-item-checkbox" data-id="${item.id}"
                    ${isSelected ? 'checked' : ''}
                    onchange="Audit.onItemCheckboxChange(${item.id}, this.checked)">
           </div>`
        : '';

      return `
        <div class="stock-card ${cardClass}" onclick="Audit.openStockModal(${idx})">
          <div class="stock-card-header">
            <div style="display:flex; align-items:center;">
              ${checkboxHTML}
              <div>
                <div class="stock-card-title">${item.data[cols[0]] || 'Item ' + (idx+1)}</div>
                <div class="stock-card-sub">${item.data[cols[1]] || ''}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
              ${photoBadge}
              <span class="status-badge ${badgeClass}">${badgeText}</span>
            </div>
          </div>
          ${item.being_edited_by && item.being_edited_by !== State.user
            ? `<div class="warning-banner">⚠️ Being edited by ${item.being_edited_by}</div>` : ''}
          <div class="stock-data-grid">${gridHTML}</div>
          <div class="mgmt-qty-row">
            <span class="mgmt-qty-label">Management Qty</span>
            <span class="mgmt-qty-value">${item.management_qty ?? '—'}</span>
          </div>
        </div>`;
    }).join('');
  },

  openStockModal(idx) {
    const item = State.filteredItems[idx];
    if (!item) return;
    const dept = Audit.getDept();
    const cols = dept ? dept.columns : [];

    // Lock for editing
    API.patch(`/api/stock/${item.id}/edit-lock`, { user_name: State.user, action: 'lock' })
      .then(res => {
        if (res.locked && res.by !== State.user) toast(res.warning, 'warning');
      });

    const allDataRows = cols.map(col => `
      <div class="data-item">
        <div class="data-label">${col}</div>
        <div class="data-value">${item.data[col] ?? '—'}</div>
      </div>`).join('');

    const diff = item.verified ? (item.physical_qty - (item.management_qty || 0)) : null;

    const photoHTML = (item.photos && item.photos.length > 0)
      ? `<div style="margin: 14px 0 8px;">
           <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">📷 Attached Photo</div>
           ${item.photos.map(p => `
             <div style="border:1px solid var(--border); border-radius:10px; overflow:hidden; background:var(--bg); margin-bottom:8px;">
               <a href="${p.file_url}" target="_blank" rel="noopener">
                 <img src="${p.file_url}" alt="Stock photo" style="width:100%; max-height:220px; object-fit:contain; display:block; background:#000;">
               </a>
               <div style="padding:6px 10px; font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between;">
                 <span>${p.uploaded_by ? 'By ' + p.uploaded_by : ''}</span>
                 <a href="${p.file_url}" target="_blank" rel="noopener" style="color:var(--primary); font-weight:600; text-decoration:none;">🔍 Open Full Size</a>
               </div>
             </div>
           `).join('')}
         </div>`
      : '';

    document.getElementById('stockModalContent').innerHTML = `
      <div class="modal-handle"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div class="modal-title" style="margin-bottom:0;">${item.data[cols[0]] || 'Stock Item'}</div>
        <button onclick="Modals.closeStock(${item.id})" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>

      <div class="stock-data-grid">${allDataRows}</div>
      ${photoHTML}
      <div class="divider"></div>

      <div class="mgmt-qty-row">
        <span class="mgmt-qty-label">Management Qty</span>
        <span class="mgmt-qty-value">${item.management_qty ?? '—'}</span>
      </div>

      ${item.verified ? `
        <div style="background:${diff===0?'#E8F5E9':'#FFEBEE'}; border-radius:10px; padding:12px 14px; margin-bottom:12px;">
          <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; font-weight:600;">
            Previously verified by ${item.verified_by}
          </div>
          <div style="font-size:16px; font-weight:700; margin-top:4px;">
            Physical: ${item.physical_qty} &nbsp;|&nbsp; Diff: ${diff >= 0 ? '+'+diff : diff}
          </div>
          ${item.remark ? `<div style="font-size:13px; color:var(--text-muted); margin-top:4px;">Remark: ${item.remark}</div>` : ''}
        </div>` : ''}

      <div class="form-group">
        <label>Physical Qty (you counted)</label>
        <input type="number" id="modalPhyQty" value="${item.physical_qty ?? ''}" min="0" step="any"
               placeholder="Enter physical count" inputmode="decimal"
               oninput="Audit.onPhyQtyInput()"
               onkeydown="if(event.key==='Enter') Audit.saveVerification(${item.id})">
      </div>

      <div class="form-group">
        <label>Remark (optional)</label>
        <input type="text" id="modalRemark" value="${item.remark || ''}" placeholder="Any notes?"
               onkeydown="if(event.key==='Enter') Audit.saveVerification(${item.id})">
      </div>

      ${item.management_qty != null ? `
        <button class="btn btn-primary" id="btnSameQty" style="margin-bottom:8px; transition:opacity 0.2s;"
                onclick="Audit.sameQty(${item.id}, ${item.management_qty})">
          ✅ Same as Management (${item.management_qty})
        </button>
      ` : ''}
      <button class="btn btn-success" id="btnSaveCount" onclick="Audit.saveVerification(${item.id})">
        💾 Save My Count
      </button>
    `;

    document.getElementById('stockModal').classList.add('open');
    Audit.onPhyQtyInput();
  },

  onPhyQtyInput() {
    const el = document.getElementById('modalPhyQty');
    const btnSame = document.getElementById('btnSameQty');
    if (!el || !btnSame) return;
    const hasValue = el.value.trim() !== '';
    if (hasValue) {
      btnSame.disabled = true;
      btnSame.style.opacity = '0.35';
      btnSame.style.pointerEvents = 'none';
      btnSame.style.cursor = 'not-allowed';
      btnSame.title = "You have entered a physical count. Clear it to use 'Same as Management'";
    } else {
      btnSame.disabled = false;
      btnSame.style.opacity = '1';
      btnSame.style.pointerEvents = 'auto';
      btnSame.style.cursor = 'pointer';
      btnSame.title = "";
    }
  },

  async sameQty(itemId, mgmtQty) {
    document.getElementById('modalPhyQty').value = mgmtQty;
    await Audit.saveVerification(itemId);
  },

  async saveVerification(itemId) {
    const qtyInput = document.getElementById('modalPhyQty');
    if (!qtyInput) return;
    const qtyVal = qtyInput.value.trim();
    if (qtyVal === '') { toast('Enter physical qty', 'warning'); return; }
    const numQty = Number(qtyVal);
    if (isNaN(numQty) || numQty < 0) {
      toast('Please enter a valid positive quantity', 'warning');
      return;
    }
    const remark = (document.getElementById('modalRemark')?.value || '').trim();

    showSpinner();
    try {
      await API.patch(`/api/stock/${itemId}/update`, {
        physical_qty: numQty,
        remark,
        verified_by: State.user
      });
      toast('✅ Saved!', 'success');
      Modals.close('stockModal');
      await Audit.loadStock();
      // Refresh dashboard progress
      const audit = await API.get('/api/audits/active');
      State.activeAudit = audit;
      const depts = await API.get(`/api/departments/audit/${audit.id}`);
      State.departments = depts;
      Dashboard.render();
    } catch(e) {
      toast('Save failed', 'error');
    } finally {
      hideSpinner();
    }
  },

  applyFilterConfig() {
    const dept = Audit.getDept();
    if (!dept) return;
    const key = `dept_${State.activeDeptId}`;
    const selected = [];
    dept.columns.forEach(col => {
      const t = document.getElementById(`toggle_${col.replace(/\s/g,'_')}`);
      if (t && t.checked) selected.push(col);
    });
    State.filterPrefs[key] = selected;
    localStorage.setItem('filterPrefs', JSON.stringify(State.filterPrefs));
    Audit.renderDynamicFilters();
    Audit.applyFilter();
    Modals.close('filterModal');
    toast('Filter preferences saved', 'success');
  },

  onItemCheckboxChange(itemId, isChecked) {
    if (isChecked) {
      Audit.selectedItemIds.add(itemId);
    } else {
      Audit.selectedItemIds.delete(itemId);
    }
    Audit.updateBulkBarUI();
  },

  toggleSelectAllPending(checked) {
    const pending = State.filteredItems.filter(i => !i.verified && i.management_qty != null);
    if (checked) {
      pending.forEach(i => Audit.selectedItemIds.add(i.id));
    } else {
      pending.forEach(i => Audit.selectedItemIds.delete(i.id));
    }
    // Update all visible checkboxes in DOM directly
    document.querySelectorAll('.stock-item-checkbox').forEach(cb => {
      const id = parseInt(cb.getAttribute('data-id'));
      if (id) cb.checked = Audit.selectedItemIds.has(id);
    });
    Audit.updateBulkBarUI();
  },

  updateBulkBarUI() {
    const bar = document.getElementById('bulkActionBar');
    if (!bar) return;

    if (!State.filteredItems.length) {
      bar.style.display = 'none';
      return;
    }

    const pending = State.filteredItems.filter(i => !i.verified && i.management_qty != null);
    if (pending.length === 0 && Audit.selectedItemIds.size === 0) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';

    const selectAllCb = document.getElementById('bulkSelectAllPending');
    const selectAllText = document.getElementById('bulkSelectAllText');
    const btnVerify = document.getElementById('btnBulkVerify');
    const countSpan = document.getElementById('bulkSelectedCount');

    if (selectAllText) {
      selectAllText.textContent = `Select All Pending (${pending.length})`;
    }

    if (selectAllCb) {
      selectAllCb.checked = pending.length > 0 && pending.every(i => Audit.selectedItemIds.has(i.id));
    }

    const selCount = Audit.selectedItemIds.size;
    if (countSpan) countSpan.textContent = selCount;
    if (btnVerify) btnVerify.disabled = selCount === 0;
  },

  openBulkVerifyModal() {
    const selIds = Array.from(Audit.selectedItemIds);
    if (selIds.length === 0) {
      toast('Select at least one item to verify', 'warning');
      return;
    }

    const selectedItems = State.stockItems.filter(i => Audit.selectedItemIds.has(i.id));
    const totalQty = selectedItems.reduce((acc, item) => acc + (Number(item.management_qty) || 0), 0);

    const countEl = document.getElementById('bulkModalItemCount');
    const qtyEl = document.getElementById('bulkModalTotalQty');
    const btnCountEl = document.getElementById('bulkModalBtnCount');

    if (countEl) countEl.textContent = `${selectedItems.length} items`;
    if (qtyEl) qtyEl.textContent = `${Number(totalQty.toFixed(2)).toLocaleString()} Units`;
    if (btnCountEl) btnCountEl.textContent = selectedItems.length;

    Modals.open('bulkVerifyModal');
  },

  async confirmBulkVerify() {
    const selIds = Array.from(Audit.selectedItemIds);
    if (selIds.length === 0) return;

    const remark = (document.getElementById('bulkRemarkInput')?.value || '').trim() || 'Bulk verified as per management qty';

    Modals.close('bulkVerifyModal');
    showSpinner();

    try {
      const res = await API.post('/api/stock/bulk-verify-management', {
        department_id: State.activeDeptId,
        item_ids: selIds,
        verified_by: State.user,
        remark: remark,
        overwrite_verified: false
      });

      toast(`✅ ${res.message || 'Items verified successfully'}`, 'success');

      Audit.selectedItemIds.clear();
      await Audit.loadStock();

      // Refresh active audit stats and dashboard
      if (State.activeAudit) {
        const audit = await API.get('/api/audits/active');
        State.activeAudit = audit;
        const depts = await API.get(`/api/departments/audit/${audit.id}`);
        State.departments = Array.isArray(depts) ? depts : [];
        Dashboard.render();
      }
    } catch(e) {
      toast(e.message || 'Bulk verification failed', 'error');
    } finally {
      hideSpinner();
    }
  }
};

// ══════════════════════════════════════════════════════
// EXTRA STOCK — combined Add + Photo module
// ══════════════════════════════════════════════════════
const ExtraStock = {

  populateForm() {
    const deptId  = State.lockedDeptId || State.activeDeptId;
    const dept    = State.departments.find(d => d.id === deptId);
    const container = document.getElementById('addFormFields');
    const submitBtn = document.getElementById('addSubmitBtn');

    if (!dept) {
      container.innerHTML = '<div class="empty-state"><p>No department selected.<br>Please select a department first.</p></div>';
      submitBtn.style.display = 'none';
      return;
    }

    // Render one input per column
    container.innerHTML = dept.columns.map(col => `
      <div class="form-group">
        <label>${col}</label>
        <input type="text" id="add_${col.replace(/\W/g,'_')}" placeholder="${col}">
      </div>`).join('');

    submitBtn.style.display = 'block';
  },

  onPhotoSelect(input) {
    const file = input.files[0];
    if (!file) return;
    const area    = document.getElementById('extraPhotoArea');
    const preview = document.getElementById('extraPhotoPreview');
    const icon    = document.getElementById('extraPhotoIcon');
    const label   = document.getElementById('extraPhotoLabel');

    area.classList.add('has-file');
    icon.style.display  = 'none';
    label.style.display = 'none';

    const reader = new FileReader();
    reader.onload = e => {
      preview.src           = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  },

  async submit() {
    const deptId = State.lockedDeptId || State.activeDeptId;
    const dept   = State.departments.find(d => d.id === deptId);
    if (!dept) { toast('No department selected', 'warning'); return; }

    // Collect stock field values
    const data = {};
    dept.columns.forEach(col => {
      const el = document.getElementById(`add_${col.replace(/\W/g,'_')}`);
      if (el) data[col] = el.value.trim();
    });

    const remark     = document.getElementById('extraRemark').value.trim();
    const photoInput = document.getElementById('extraPhotoInput');
    const photoFile  = photoInput.files[0];

    // At least one field must be filled
    const hasData = Object.values(data).some(v => v !== '');
    if (!hasData) { toast('Fill in at least one field', 'warning'); return; }

    showSpinner();
    try {
      // Step 1: Add the stock item
      const newItem = await API.post('/api/stock/add', {
        department_id: deptId,
        data,
        remark,
        verified_by: State.user
      });

      // Step 2: Upload photo if selected (linked to new item)
      if (photoFile) {
        if (photoFile.size > 100 * 1024 * 1024) {
          toast('Photo is larger than 100MB — please use a smaller image', 'warning');
        } else {
          const fd = new FormData();
          fd.append('file', photoFile);
          fd.append('uploaded_by', State.user);
          fd.append('remark', remark || `Extra stock: ${Object.values(data).filter(Boolean)[0] || ''}`);
          fd.append('department_id', deptId);
          if (newItem?.id) fd.append('stock_item_id', newItem.id);
          try {
            await API.form('/api/photo/upload', fd);
            toast('✅ Extra stock & photo added!', 'success');
          } catch(photoErr) {
            toast('⚠️ Stock added, but photo upload failed: ' + (photoErr.message || ''), 'warning');
          }
        }
      } else {
        toast('✅ Extra stock added!', 'success');
      }

      // Reset form
      dept.columns.forEach(col => {
        const el = document.getElementById(`add_${col.replace(/\W/g,'_')}`);
        if (el) el.value = '';
      });
      document.getElementById('extraRemark').value = '';
      photoInput.value = '';
      document.getElementById('extraPhotoPreview').style.display = 'none';
      document.getElementById('extraPhotoArea').classList.remove('has-file');
      document.getElementById('extraPhotoIcon').style.display  = '';
      document.getElementById('extraPhotoLabel').style.display = '';

      // Refresh audit list
      App.showPage('audit');
      await Audit.loadStock();

    } catch(e) {
      toast('Failed to submit. Try again.', 'error');
    } finally {
      hideSpinner();
    }
  }
};

// ══════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════
const Admin = {

  async ensureAudit() {
    if (State.activeAudit) return State.activeAudit;
    const auditName = `Audit ${new Date().toLocaleDateString('en-IN')}`;
    // Pass created_by as query param (FastAPI reads it from query)
    const url = `/api/audits/?created_by=${encodeURIComponent(State.user)}`;
    const res = await API.post(url, { name: auditName });
    State.activeAudit = res;
    document.getElementById('topbarTitle').textContent = res.name;
    return res;
  },

  toggleImportMethod(method) {
    const isFG = method === 'finish_goods';
    const lblGen = document.getElementById('lblMethodGeneral');
    const lblFG  = document.getElementById('lblMethodFG');
    if (lblGen && lblFG) {
      if (isFG) {
        lblFG.style.borderColor = 'var(--primary)';
        lblFG.style.background  = '#EFF6FF';
        lblGen.style.borderColor = 'var(--border)';
        lblGen.style.background  = 'white';
      } else {
        lblGen.style.borderColor = 'var(--primary)';
        lblGen.style.background  = '#EFF6FF';
        lblFG.style.borderColor = 'var(--border)';
        lblFG.style.background  = 'white';
      }
    }

    const deptIn = document.getElementById('importDeptName');
    if (isFG && (!deptIn.value || deptIn.value === 'Fabric' || deptIn.value === 'Yarn')) {
      deptIn.value = 'Finish Goods';
    }

    const hasFile = !!document.getElementById('importFile').files[0];
    if (hasFile) {
      document.getElementById('importQtyField').style.display  = isFG ? 'none' : 'block';
      document.getElementById('importFGMapping').style.display = isFG ? 'block' : 'none';
    }
  },

  async importExcel() {
    const deptName = document.getElementById('importDeptName').value.trim();
    const file     = document.getElementById('importFile').files[0];
    const qtyCol   = document.getElementById('importQtyColumn').value;
    const method   = document.querySelector('input[name="importMethod"]:checked')?.value || 'general';

    if (!deptName) { toast('Enter department name', 'warning'); return; }
    if (!file)     { toast('Select an Excel file', 'warning'); return; }

    showSpinner();
    try {
      await Admin.ensureAudit();

      const fd = new FormData();
      fd.append('audit_id',   State.activeAudit.id);
      fd.append('dept_name',  deptName);
      fd.append('verification_method', method);

      if (method === 'finish_goods') {
        const partyCol = document.getElementById('importFGPartyCol').value;
        const orderCol = document.getElementById('importFGOrderCol').value;
        const readyCol = document.getElementById('importFGReadyCol').value;
        fd.append('party_col', partyCol || '');
        fd.append('order_col', orderCol || '');
        fd.append('ready_qty_col', readyCol || '');
      } else {
        fd.append('qty_column', qtyCol || '');
      }
      fd.append('file', file);

      const res = await API.form('/api/departments/import', fd);
      toast(`✅ ${res.message}`, 'success');
      Modals.close('importModal');

      // Reload departments list
      const depts = await API.get(`/api/departments/audit/${State.activeAudit.id}`);
      State.departments = Array.isArray(depts) ? depts : [];
      Dashboard.render();
      Audit.renderDeptChips();
      ExtraStock.populateForm();
    } catch(e) {
      toast(e.message || 'Import failed. Check the file and try again.', 'error');
    } finally {
      hideSpinner();
    }
  },

  exportDept() {
    if (!State.activeDeptId) {
      toast('Go to Audit tab and select a department first', 'warning');
      return;
    }
    window.location.href = `/api/stock/${State.activeDeptId}/export`;
  },

  exportSpecificDept(deptId, deptName) {
    if (!State.isAdmin) {
      toast('Admin access required', 'error');
      return;
    }
    toast(`Preparing export for ${deptName}...`, 'info');
    window.location.href = `/api/stock/${deptId}/export`;
  },

  async removeDept(deptId, deptName, itemCount) {
    if (!State.isAdmin) {
      toast('Admin access required', 'error');
      return;
    }
    const confirmMsg = `⚠️ Are you sure you want to remove '${deptName}'?\n\nThis will permanently erase all ${itemCount} stock items, verified entries, and photos for this department from the database.\n\nMake sure you have already exported the sheet!`;
    if (!confirm(confirmMsg)) return;

    showSpinner();
    try {
      const res = await API.delete(`/api/departments/${deptId}`);
      toast(`✅ ${res.message || 'Sheet data erased successfully'}`, 'success');

      // Refresh audit data
      if (State.activeAudit) {
        const depts = await API.get(`/api/departments/audit/${State.activeAudit.id}`);
        State.departments = Array.isArray(depts) ? depts : [];
        if (State.activeDeptId === deptId) {
          State.activeDeptId = State.departments[0]?.id ?? null;
        }
      } else {
        State.departments = [];
        State.activeDeptId = null;
      }

      Dashboard.render();
      if (State.isAdmin) Audit.renderDeptChips();
      ExtraStock.populateForm();
    } catch(e) {
      toast(e.message || 'Failed to remove department', 'error');
    } finally {
      hideSpinner();
    }
  },

  previewColumns() {
    const file = document.getElementById('importFile').files[0];
    if (!file) return;

    const curMethod = document.querySelector('input[name="importMethod"]:checked')?.value || 'general';
    const isFG = curMethod === 'finish_goods';

    document.getElementById('importQtyField').style.display  = isFG ? 'none' : 'block';
    document.getElementById('importFGMapping').style.display = isFG ? 'block' : 'none';
    document.getElementById('importPreview').style.display   = 'block';
    document.getElementById('importPreviewText').textContent = `📄 ${file.name} (${(file.size/1024).toFixed(0)} KB)`;
    document.getElementById('importQtyColumn').value = '';
    document.getElementById('importColumnsHint').innerHTML = '<span style="color:var(--text-muted)">Reading columns...</span>';

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data  = new Uint8Array(e.target.result);
        const wb    = XLSX.read(data, { type: 'array', sheetRows: 1 }); // read only 1st row
        const ws    = wb.Sheets[wb.SheetNames[0]];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        const cols  = [];

        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
          if (cell && cell.v) cols.push(String(cell.v).trim());
        }

        if (cols.length) {
          const chips = cols.map(col =>
            `<span onclick="document.getElementById('importQtyColumn').value='${col}'; document.querySelectorAll('.col-chip').forEach(c=>c.style.background='var(--bg)'); this.style.background='#BBDEFB';"
                  class="col-chip"
                  style="display:inline-block; padding:4px 10px; background:var(--bg); border-radius:100px;
                         font-size:12px; font-weight:600; margin:2px; cursor:pointer; border:1px solid var(--border);">
              ${col}
            </span>`
          ).join('');
          document.getElementById('importColumnsHint').innerHTML =
            `<div style="margin-bottom:6px;color:var(--text-muted);font-size:12px;">📋 Tap a column to select as Management Qty:</div>${chips}`;

          // Also populate Finish Goods Mapping Dropdowns
          const pSel = document.getElementById('importFGPartyCol');
          const oSel = document.getElementById('importFGOrderCol');
          const rSel = document.getElementById('importFGReadyCol');
          if (pSel && oSel && rSel) {
            const opts = cols.map(c => `<option value="${c}">${c}</option>`).join('');
            pSel.innerHTML = opts;
            oSel.innerHTML = opts;
            rSel.innerHTML = opts;

            cols.forEach(c => {
              const lc = c.toLowerCase();
              if (lc.includes('party')) pSel.value = c;
              if (lc.includes('order')) oSel.value = c;
              if (lc.includes('ready') || lc.includes('pcs') || lc.includes('qty')) rSel.value = c;
            });
          }
        } else {
          document.getElementById('importColumnsHint').textContent = '⚠️ Could not read columns. Type the name manually.';
        }
      } catch(err) {
        document.getElementById('importColumnsHint').textContent = '⚠️ Could not read columns. Type the name manually.';
      }
    };
    reader.readAsArrayBuffer(file);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const importFile = document.getElementById('importFile');
  if (importFile) importFile.addEventListener('change', Admin.previewColumns);
});

// ══════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════
const Modals = {
  open(id)  { document.getElementById(id).classList.add('open'); },
  close(id) { document.getElementById(id).classList.remove('open'); },

  openImport() {
    if (!State.isAdmin) { toast('Admin access required', 'error'); return; }
    document.getElementById('importDeptName').value = '';
    document.getElementById('importFile').value     = '';
    document.getElementById('importQtyField').style.display  = 'none';
    document.getElementById('importFGMapping').style.display = 'none';
    document.getElementById('importPreview').style.display   = 'none';

    const genRadio = document.querySelector('input[name="importMethod"][value="general"]');
    if (genRadio) {
      genRadio.checked = true;
      Admin.toggleImportMethod('general');
    }

    Modals.open('importModal');
  },

  openFilterConfig() {
    const dept = Audit.getDept();
    if (!dept) { toast('Select a department first', 'warning'); return; }
    const prefs = Audit.getFilterPrefs();
    document.getElementById('filterToggleList').innerHTML = dept.columns.map(col => `
      <div class="filter-toggle-item">
        <span class="toggle-label">${col}</span>
        <label class="toggle">
          <input type="checkbox" id="toggle_${col.replace(/\s/g,'_')}"
                 ${prefs.includes(col) ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>`).join('');
    Modals.open('filterModal');
  },

  closeStock(itemId) {
    API.patch(`/api/stock/${itemId}/edit-lock`, { user_name: State.user, action: 'unlock' });
    Modals.close('stockModal');
  }
};

// ══════════════════════════════════════════════════
// FINISH GOODS SPECIFIC METHOD CONTROLLER
// ══════════════════════════════════════════════════
const FG = {
  currentParties: [],
  currentOrders: [],
  allOrdersData: [],
  allLogData: [],
  selectedPartyName: "",
  selectedItemId: null,
  selectedOrderData: null,
  currentFilterStatus: 'ALL',
  ordersNeedReload: true,

  async open(deptId) {
    State.activeDeptId = deptId;
    const dept = State.departments.find(d => d.id === deptId);
    if (dept) {
      document.getElementById('fgDeptTitle').textContent = dept.name;
    }

    // Set saved auditor name
    const savedAuditor = localStorage.getItem('pil_auditor_name') || State.user || 'Auditor';
    const inAuditor = document.getElementById('fgInAuditor');
    if (inAuditor) inAuditor.value = savedAuditor;

    App.showPage('fgaudit');
    FG.switchTab('verify');
    await FG.refreshAll();
  },

  async refreshAll() {
    if (!State.activeDeptId) return;
    showSpinner();
    try {
      const promises = [FG.fetchSummary(), FG.fetchParties()];
      if (FG.selectedPartyName) {
        promises.push(FG.loadOrdersForParty(FG.selectedPartyName));
      }
      await Promise.all(promises);
      FG.ordersNeedReload = true;
    } catch (e) {
      console.error("FG refresh error:", e);
    } finally {
      hideSpinner();
    }
  },

  // ── SUMMARY ──────────────────────────────────────────
  async fetchSummary() {
    try {
      const data = await API.get(`/api/stock/fg/${State.activeDeptId}/summary`);
      document.getElementById('fgKpiOrders').textContent     = (data.total_orders || 0).toLocaleString();
      document.getElementById('fgKpiReady').textContent      = (data.total_ready_pcs || 0).toLocaleString();
      document.getElementById('fgKpiVerified').textContent   = (data.total_verified_pcs || 0).toLocaleString();
      document.getElementById('fgKpiPending').textContent    = (data.total_pending_pcs || 0).toLocaleString();
      document.getElementById('fgKpiMatched').textContent    = (data.matched || 0).toLocaleString();
      document.getElementById('fgKpiDiscrepant').textContent = (data.discrepancy || 0).toLocaleString();

      document.getElementById('fgTopProgressBadge').textContent = 
        `${(data.total_verified_pcs || 0).toLocaleString()} / ${(data.total_ready_pcs || 0).toLocaleString()} Pcs`;
    } catch(err) {
      console.error("FG Summary error:", err);
    }
  },

  // ── PARTIES ──────────────────────────────────────────
  async fetchParties() {
    try {
      FG.currentParties = await API.get(`/api/stock/fg/${State.activeDeptId}/parties`);
      if (FG.selectedPartyName && FG.currentParties.some(p => p.party === FG.selectedPartyName)) {
        const pData = FG.currentParties.find(p => p.party === FG.selectedPartyName);
        document.getElementById('fgPartyChipTarget').textContent   = (pData.total_ready || 0).toLocaleString();
        document.getElementById('fgPartyChipVerified').textContent = (pData.total_verified || 0).toLocaleString();
        document.getElementById('fgPartyChipPending').textContent  = (pData.total_pending || 0).toLocaleString();
      }
    } catch(err) {
      console.error("FG Parties error:", err);
    }
  },

  openPartyDropdown() {
    FG.renderPartyDropdownItems(FG.currentParties);
    document.getElementById('fgPartyDropdown').style.display = 'block';
  },

  togglePartyDropdown() {
    const dd = document.getElementById('fgPartyDropdown');
    if (dd.style.display === 'block') {
      dd.style.display = 'none';
    } else {
      FG.openPartyDropdown();
    }
  },

  filterPartyDropdown() {
    const q = (document.getElementById('fgPartySearch').value || '').toLowerCase();
    const filtered = FG.currentParties.filter(p => p.party.toLowerCase().includes(q));
    FG.renderPartyDropdownItems(filtered);
    document.getElementById('fgPartyDropdown').style.display = 'block';
  },

  renderPartyDropdownItems(parties) {
    const dd = document.getElementById('fgPartyDropdown');
    if (!parties || parties.length === 0) {
      dd.innerHTML = '<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:13px;">No matching party found</div>';
      return;
    }

    dd.innerHTML = parties.map(p => {
      const isSel = p.party === FG.selectedPartyName;
      return `
        <div class="combobox-item ${isSel ? 'selected' : ''}" onclick="FG.selectParty('${FG.escapeJs(p.party)}')">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:${isSel ? 'var(--primary)' : 'var(--text)'}">${p.party}</span>
            <span class="badge" style="background:#f1f5f9; color:var(--text-muted); border:1px solid #e2e8f0; font-size:11px;">${p.orders_count} orders</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:11px; margin-top:4px;">
            <span>Target: ${(p.total_ready || 0).toLocaleString()}</span>
            <span>Pending: <b class="${p.total_pending > 0 ? 'text-warning' : 'text-success'}">${(p.total_pending || 0).toLocaleString()}</b></span>
          </div>
        </div>
      `;
    }).join('');
  },

  async selectParty(partyName) {
    FG.selectedPartyName = partyName;
    document.getElementById('fgPartySearch').value = partyName;
    document.getElementById('fgPartyDropdown').style.display = 'none';
    document.getElementById('fgBtnClearParty').style.display = 'inline-block';

    // Reset Order
    FG.clearOrderSelection();

    // Show party chip
    const pData = FG.currentParties.find(p => p.party === partyName);
    const chip = document.getElementById('fgPartyChip');
    if (pData) {
      chip.style.display = 'block';
      document.getElementById('fgPartyChipName').textContent     = pData.party;
      document.getElementById('fgPartyChipTarget').textContent   = (pData.total_ready || 0).toLocaleString();
      document.getElementById('fgPartyChipVerified').textContent = (pData.total_verified || 0).toLocaleString();
      document.getElementById('fgPartyChipPending').textContent  = (pData.total_pending || 0).toLocaleString();

      const pct = pData.total_ready > 0 ? Math.min(100, Math.round((pData.total_verified / pData.total_ready) * 100)) : 0;
      document.getElementById('fgPartyChipBar').style.width      = `${pct}%`;
      document.getElementById('fgPartyChipPct').textContent      = `${pct}%`;
    }

    // Enable Order combobox
    const inOrder = document.getElementById('fgOrderSearch');
    const btnToggle = document.getElementById('fgBtnToggleOrder');
    inOrder.disabled = false;
    btnToggle.disabled = false;
    inOrder.placeholder = "Search order or tap to select...";
    await FG.loadOrdersForParty(partyName);
  },

  clearPartySelection() {
    FG.selectedPartyName = "";
    document.getElementById('fgPartySearch').value = "";
    document.getElementById('fgBtnClearParty').style.display = 'none';
    document.getElementById('fgPartyChip').style.display = 'none';

    FG.clearOrderSelection();
    const inOrder = document.getElementById('fgOrderSearch');
    const btnToggle = document.getElementById('fgBtnToggleOrder');
    inOrder.disabled = true;
    btnToggle.disabled = true;
    inOrder.placeholder = "Choose party first...";
  },

  // ── ORDERS FOR PARTY ─────────────────────────────────
  async loadOrdersForParty(party) {
    try {
      FG.currentOrders = await API.get(`/api/stock/fg/${State.activeDeptId}/orders?party=${encodeURIComponent(party)}`);
    } catch (err) {
      console.error("FG orders load error:", err);
    }
  },

  openOrderDropdown() {
    if (!FG.selectedPartyName) return;
    FG.renderOrderDropdownItems(FG.currentOrders);
    document.getElementById('fgOrderDropdown').style.display = 'block';
  },

  toggleOrderDropdown() {
    const dd = document.getElementById('fgOrderDropdown');
    if (dd.style.display === 'block') {
      dd.style.display = 'none';
    } else {
      FG.openOrderDropdown();
    }
  },

  filterOrderDropdown() {
    const q = (document.getElementById('fgOrderSearch').value || '').toLowerCase();
    const filtered = FG.currentOrders.filter(o => 
      String(o.order_no).toLowerCase().includes(q) || 
      String(o.data['BAG SIZE'] || '').toLowerCase().includes(q) ||
      String(o.data['TYPE'] || '').toLowerCase().includes(q)
    );
    FG.renderOrderDropdownItems(filtered);
    document.getElementById('fgOrderDropdown').style.display = 'block';
  },

  renderOrderDropdownItems(orders) {
    const dd = document.getElementById('fgOrderDropdown');
    if (!orders || orders.length === 0) {
      dd.innerHTML = '<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:13px;">No matching orders</div>';
      return;
    }

    dd.innerHTML = orders.map(o => {
      const isSel = o.id === FG.selectedItemId;
      let badgeClass = 'status-pending';
      if (o.status === 'Match') badgeClass = 'status-match';
      else if (o.status.startsWith('Surplus')) badgeClass = 'status-surplus';
      else if (o.status.startsWith('Partial')) badgeClass = 'status-partial';

      return `
        <div class="combobox-item ${isSel ? 'selected' : ''}" onclick="FG.selectOrder(${o.id})">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:700; color:${isSel ? 'var(--primary)' : 'var(--text)'}">Order #${o.order_no}</span>
            <span class="badge-status ${badgeClass}" style="font-size:11px;">${o.status}</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:11px;">
            <span>Size: ${o.data['BAG SIZE'] || '—'}</span>
            <span>Target: <b style="color:var(--text);">${(o.ready_pcs || 0).toLocaleString()}</b> Pcs</span>
          </div>
        </div>
      `;
    }).join('');
  },

  async selectOrder(orderId) {
    FG.selectedItemId = orderId;
    const order = FG.currentOrders.find(o => o.id === orderId);
    if (order) {
      document.getElementById('fgOrderSearch').value = `Order #${order.order_no} (${(order.ready_pcs || 0).toLocaleString()} Pcs)`;
    }
    document.getElementById('fgOrderDropdown').style.display = 'none';
    document.getElementById('fgBtnClearOrder').style.display = 'inline-block';

    await FG.loadOrderDetails(orderId);
  },

  clearOrderSelection() {
    FG.selectedItemId = null;
    FG.selectedOrderData = null;
    document.getElementById('fgOrderSearch').value = "";
    document.getElementById('fgBtnClearOrder').style.display = 'none';
    document.getElementById('fgOrderSpecs').style.display = 'none';
    document.getElementById('fgCardCalc').style.display = 'none';
  },

  async loadOrderDetails(itemId) {
    try {
      const data = await API.get(`/api/stock/fg/order/${itemId}`);
      FG.selectedOrderData = data;

      // Specs
      document.getElementById('fgOrderSpecs').style.display = 'block';
      document.getElementById('fgDispOrderNo').textContent  = `Order #${data.order_no}`;
      document.getElementById('fgDispBagSize').textContent  = data.data['BAG SIZE'] || '—';
      document.getElementById('fgDispType').textContent     = data.data['TYPE'] || '—';
      document.getElementById('fgDispBagWt').textContent    = data.data['BAG WT'] || '—';
      document.getElementById('fgDispOrderQty').textContent = data.data['QTY'] || '—';

      document.getElementById('fgDispTargetPcs').textContent   = (data.ready_pcs || 0).toLocaleString();
      document.getElementById('fgDispVerifiedPcs').textContent = (data.verified_pcs || 0).toLocaleString();
      document.getElementById('fgDispPendingPcs').textContent  = Math.max(0, data.pending_pcs || 0).toLocaleString();

      const badge = document.getElementById('fgDispStatusBadge');
      if (data.verified_pcs === 0) {
        badge.className = 'badge-status status-pending';
        badge.textContent = 'Pending';
      } else if (data.difference === 0) {
        badge.className = 'badge-status status-match';
        badge.textContent = 'Match';
      } else if (data.difference > 0) {
        badge.className = 'badge-status status-surplus';
        badge.textContent = `Surplus (+${data.difference})`;
      } else {
        badge.className = 'badge-status status-partial';
        badge.textContent = `Partial (-${data.pending_pcs})`;
      }

      // Calc box
      document.getElementById('fgCardCalc').style.display = 'block';
      document.getElementById('fgCalcOrderTag').textContent = `#${data.order_no}`;

      document.getElementById('fgInBales').value = 0;
      document.getElementById('fgInPcsPerBale').value = 0;
      document.getElementById('fgInLoose').value = 0;
      FG.updateLiveCalc();

      FG.renderBatchHistory(data.batches || []);

    } catch (err) {
      console.error("FG Order details error:", err);
    }
  },

  // ── STEPPER CONTROLS ─────────────────────────────────
  stepVal(id, delta) {
    const el = document.getElementById(id);
    let v = (parseInt(el.value) || 0) + delta;
    if (v < 0) v = 0;
    el.value = v;
    FG.updateLiveCalc();
  },

  updateLiveCalc() {
    const bales = parseInt(document.getElementById('fgInBales').value) || 0;
    const pcs   = parseInt(document.getElementById('fgInPcsPerBale').value) || 0;
    const loose = parseInt(document.getElementById('fgInLoose').value) || 0;

    const total = (bales * pcs) + loose;

    document.getElementById('fgLiveFormulaText').textContent = 
      `(${bales} Bales × ${pcs} Pcs) + ${loose} Loose`;
    document.getElementById('fgLiveTotalText').textContent = 
      `= ${total.toLocaleString()} Pieces`;
  },

  // ── SUBMIT BATCH ─────────────────────────────────────
  async submitBatch(e) {
    e.preventDefault();
    if (!FG.selectedItemId) return;

    const bales   = parseInt(document.getElementById('fgInBales').value) || 0;
    const pcs     = parseInt(document.getElementById('fgInPcsPerBale').value) || 0;
    const loose   = parseInt(document.getElementById('fgInLoose').value) || 0;
    const auditor = document.getElementById('fgInAuditor').value.trim() || State.user || 'Auditor';
    const remark  = document.getElementById('fgInRemark').value.trim();

    const total = (bales * pcs) + loose;
    if (total <= 0) {
      toast("Please enter bales or loose pieces (total must be > 0)", "warning");
      return;
    }

    localStorage.setItem('pil_auditor_name', auditor);

    showSpinner();
    try {
      const resData = await API.post(`/api/stock/fg/order/${FG.selectedItemId}/verify`, {
        bales: bales,
        pcs_per_bale: pcs,
        loose_pcs: loose,
        verified_by: auditor,
        remark: remark
      });

      // ── 1. POPUP SUCCESS MODAL IMMEDIATELY! (Zero lag for floor auditor) ──
      hideSpinner();
      document.getElementById('fgSuccEntryNo').textContent      = `#${resData.entry_no}`;
      document.getElementById('fgSuccBalesText').textContent    = `${resData.bales} Bales` + (resData.loose_pcs > 0 ? ` + ${resData.loose_pcs} Loose` : '');
      document.getElementById('fgSuccTotalPcsText').textContent  = `(${(resData.total_pcs || 0).toLocaleString()} Pieces)`;
      document.getElementById('fgSuccOrderParty').textContent    = `Order #${resData.order_no} • ${resData.party}`;
      document.getElementById('fgSuccPhysicalTag').textContent    = `ENTRY #${resData.entry_no} — ${resData.bales} BALES`;

      Modals.open('fgSuccessModal');

      // ── 2. Reset calculator inputs ──────────────────────
      document.getElementById('fgInRemark').value = '';
      document.getElementById('fgInBales').value = 0;
      document.getElementById('fgInPcsPerBale').value = 0;
      document.getElementById('fgInLoose').value = 0;
      FG.updateLiveCalc();

      // ── 3. Fast background sync of active order & stats ─
      FG.ordersNeedReload = true;
      await FG.loadOrderDetails(FG.selectedItemId);
      FG.fetchSummary();
      FG.fetchParties();

    } catch (err) {
      hideSpinner();
      toast(err.message || "Failed to submit batch", "error");
    }
  },

  // ── DELETE BATCH ─────────────────────────────────────
  async deleteBatch(batchId, pcs) {
    if (!confirm(`Delete batch Entry #${batchId} (${pcs} pieces)? Balance will recalculate automatically.`)) return;

    showSpinner();
    try {
      await API.del(`/api/stock/fg/batch/${batchId}`);
      toast(`Entry #${batchId} deleted`, "success");

      FG.ordersNeedReload = true;
      const tasks = [FG.fetchSummary(), FG.fetchParties(), FG.loadAuditLog()];
      if (FG.selectedItemId) tasks.push(FG.loadOrderDetails(FG.selectedItemId));
      await Promise.all(tasks);

    } catch (err) {
      toast(err.message || "Failed to delete entry", "error");
    } finally {
      hideSpinner();
    }
  },

  renderBatchHistory(batches) {
    const container = document.getElementById('fgDispBatchList');
    document.getElementById('fgDispBatchCount').textContent = batches.length;

    if (batches.length === 0) {
      container.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:12px; text-align:center;">No batches logged yet for this order.</div>';
      return;
    }

    container.innerHTML = batches.map(b => {
      let formula = '';
      if (b.bales > 0 && b.pcs_per_bale > 0) formula += `${b.bales} Bales × ${b.pcs_per_bale} Pcs`;
      if (b.loose_pcs > 0) formula += (formula ? ' + ' : '') + `${b.loose_pcs} Loose`;
      const time = b.created_at ? b.created_at.substring(11, 16) : '';

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px;">
          <div>
            <div style="font-weight:700; font-size:13px; color:var(--text);">
              <span class="badge" style="background:#16a34a; color:white; font-size:10px; padding:2px 6px; border-radius:4px; margin-right:4px;">ENTRY #${b.id}</span>
              <span style="color:#15803d;">${(b.total_pcs || 0).toLocaleString()} Pcs</span>
              <span style="color:var(--text-muted); font-size:12px;">(${b.bales} Bales)</span>
            </div>
            <div style="color:var(--text-muted); font-size:11px; margin-top:2px;">
              ${formula} • ${b.verified_by || 'Auditor'} (${time})
              ${b.remark ? ` • <i style="color:var(--primary);">${b.remark}</i>` : ''}
            </div>
          </div>
          <button class="btn-icon danger" onclick="FG.deleteBatch(${b.id}, ${b.total_pcs})" title="Delete batch">
            🗑️
          </button>
        </div>
      `;
    }).join('');
  },

  // ── VIEW 3: SERIAL AUDIT LOG ─────────────────────────
  async loadAuditLog() {
    showSpinner();
    try {
      FG.allLogData = await API.get(`/api/stock/fg/${State.activeDeptId}/log`);
      FG.renderAuditLog();
    } catch (err) {
      toast("Failed to load audit log", "error");
    } finally {
      hideSpinner();
    }
  },

  filterAuditLog() {
    FG.renderAuditLog();
  },

  renderAuditLog() {
    const q = (document.getElementById('fgLogSearchInput').value || '').toLowerCase();
    const container = document.getElementById('fgAuditLogContainer');

    const filtered = FG.allLogData.filter(r => 
      String(r.entry_no).includes(q) ||
      String(r.order_no).toLowerCase().includes(q) ||
      r.party.toLowerCase().includes(q) ||
      r.verified_by.toLowerCase().includes(q) ||
      (r.remark && r.remark.toLowerCase().includes(q))
    );

    document.getElementById('fgLogEntriesCount').textContent = `Showing ${filtered.length} of ${FG.allLogData.length} serial entries`;

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">No log entries found.</div>';
      return;
    }

    container.innerHTML = filtered.map(r => {
      let formula = '';
      if (r.bales > 0 && r.pcs_per_bale > 0) formula += `${r.bales} Bales × ${r.pcs_per_bale} Pcs`;
      if (r.loose_pcs > 0) formula += (formula ? ' + ' : '') + `${r.loose_pcs} Loose`;
      const time = r.created_at ? r.created_at.substring(0, 16).replace('T', ' ') : '';

      return `
        <div class="fg-card mb-2" style="padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span class="badge" style="background:#16a34a; color:white; font-weight:800; font-size:13px; padding:3px 8px; border-radius:6px;">ENTRY #${r.entry_no}</span>
            <span style="font-size:11px; color:var(--text-muted);">🕒 ${time}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin:8px 0 4px;">
            <span style="font-weight:800; font-size:17px; color:var(--text);">
              ${r.bales} Bales <small style="font-size:13px; color:var(--text-muted);">(${(r.total_pcs || 0).toLocaleString()} Pcs)</small>
            </span>
            <span class="badge" style="background:#f1f5f9; color:var(--primary); border:1px solid #cbd5e1; font-weight:700;">#${r.order_no}</span>
          </div>
          <div style="font-weight:700; font-size:13px; color:var(--text-muted); margin-bottom:2px;">${r.party}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">Size: ${r.bag_size || '—'} • ${formula}</div>

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
            <div>
              <span style="color:#16a34a; font-weight:800;">🏷️ Physical Tag:</span> <b>ENTRY #${r.entry_no} (${r.bales} Bales)</b>
              <div style="color:var(--text-muted); margin-top:2px;">👤 ${r.verified_by} ${r.remark ? '• ' + r.remark : ''}</div>
            </div>
            <button class="btn-icon danger" onclick="FG.deleteBatch(${r.id}, ${r.total_pcs})" title="Delete entry">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  // ── VIEW 2: ORDERS LIST (CARDS) ───────────────────────
  async loadAllOrdersCards() {
    try {
      // Fast single API call fetching all orders across all parties at once
      const ords = await API.get(`/api/stock/fg/${State.activeDeptId}/orders`);
      FG.allOrdersData = Array.isArray(ords) ? ords : [];
      FG.renderOrdersCards();
      FG.ordersNeedReload = false;
    } catch (err) {
      console.error("FG Orders cards error:", err);
    }
  },

  setFilter(status, btn) {
    FG.currentFilterStatus = status;
    document.querySelectorAll('#fgFilterStatusPills button').forEach(b => {
      b.className = 'filter-pill';
    });
    btn.className = 'filter-pill active';
    FG.renderOrdersCards();
  },

  renderOrdersCards() {
    const q = (document.getElementById('fgCardSearchInput').value || '').toLowerCase();
    const container = document.getElementById('fgOrderCardsContainer');

    const filtered = FG.allOrdersData.filter(o => {
      const matchesQ = o.party.toLowerCase().includes(q) || String(o.order_no).toLowerCase().includes(q);
      const matchesStatus = FG.currentFilterStatus === 'ALL' || o.status.startsWith(FG.currentFilterStatus);
      return matchesQ && matchesStatus;
    });

    document.getElementById('fgOrdersListCount').textContent = `Showing ${filtered.length} of ${FG.allOrdersData.length} orders`;

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">No matching orders found.</div>';
      return;
    }

    container.innerHTML = filtered.map(o => {
      let statusClass = 'status-pending';
      if (o.status === 'Match') statusClass = 'status-match';
      else if (o.status.startsWith('Surplus')) statusClass = 'status-surplus';
      else if (o.status.startsWith('Partial')) statusClass = 'status-partial';

      const pct = o.ready_pcs > 0 ? Math.min(100, Math.round((o.verified_pcs / o.ready_pcs) * 100)) : 0;

      return `
        <div class="order-card" onclick="FG.selectOrderAndGo('${FG.escapeJs(o.party)}', ${o.id})">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:800; color:var(--primary);">#${o.order_no}</span>
            <span class="badge-status ${statusClass}">${o.status}</span>
          </div>
          <div style="font-weight:700; color:var(--text); font-size:13px; margin-bottom:4px;">${o.party}</div>
          <div style="color:var(--text-muted); font-size:11px; margin-bottom:8px;">
            Size: ${o.data['BAG SIZE'] || '—'} | Type: ${o.data['TYPE'] || '—'} | Wt: ${o.data['BAG WT'] || '—'}
          </div>
          <div class="progress-bar mb-2" style="height:5px;">
            <div class="progress-fill ${pct === 100 ? 'done' : ''}" style="width:${pct}%"></div>
          </div>
          <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:11px;">
            <span>Target: <b style="color:var(--text);">${(o.ready_pcs || 0).toLocaleString()}</b></span>
            <span>Verified: <b class="text-success">${(o.verified_pcs || 0).toLocaleString()}</b></span>
            <span>Pending: <b class="text-warning">${Math.max(0, o.pending_pcs || 0).toLocaleString()}</b></span>
          </div>
        </div>
      `;
    }).join('');
  },

  async selectOrderAndGo(party, orderId) {
    await FG.selectParty(party);
    setTimeout(async () => {
      await FG.selectOrder(orderId);
      FG.switchTab('verify');
    }, 200);
  },

  // ── TAB SWITCHING ────────────────────────────────────
  switchTab(tab) {
    document.getElementById('fgViewVerify').style.display  = tab === 'verify'  ? 'block' : 'none';
    document.getElementById('fgViewOrders').style.display  = tab === 'orders'  ? 'block' : 'none';
    document.getElementById('fgViewLog').style.display     = tab === 'log'     ? 'block' : 'none';
    document.getElementById('fgViewSummary').style.display = tab === 'summary' ? 'block' : 'none';

    document.getElementById('fgTabVerify').classList.toggle('active', tab === 'verify');
    document.getElementById('fgTabOrders').classList.toggle('active', tab === 'orders');
    document.getElementById('fgTabLog').classList.toggle('active', tab === 'log');
    document.getElementById('fgTabSummary').classList.toggle('active', tab === 'summary');

    if (tab === 'orders' && (FG.ordersNeedReload || !FG.allOrdersData.length)) {
      FG.loadAllOrdersCards();
    }
    if (tab === 'log') {
      FG.loadAuditLog();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  },

  exportExcel() {
    if (!State.activeDeptId) return;
    toast("Generating 2-sheet FG report...", "info");
    window.location.href = `/api/stock/${State.activeDeptId}/export`;
  },

  escapeJs(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
};

// Global click outside combobox handler
document.addEventListener('click', (e) => {
  if (!e.target.closest('#fgComboParty')) {
    const dd = document.getElementById('fgPartyDropdown');
    if (dd) dd.style.display = 'none';
  }
  if (!e.target.closest('#fgComboOrder')) {
    const dd = document.getElementById('fgOrderDropdown');
    if (dd) dd.style.display = 'none';
  }
});

// ── BOOT ──────────────────────────────────────────────
App.init();
