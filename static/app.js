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

    if (State.isAdmin) {
      document.getElementById('topbarTitle').textContent    = State.activeAudit?.name || 'Stock Audit';
      document.getElementById('adminSection').style.display = 'block';
      document.getElementById('deptChips').style.display    = 'flex';
      document.getElementById('dashSectionTitle').textContent = 'All Departments';
      Audit.renderDeptChips();
    } else {
      const dept = State.departments.find(d => d.id === deptId);
      document.getElementById('topbarTitle').textContent    = dept ? dept.name : 'Stock Audit';
      document.getElementById('adminSection').style.display = 'none';
      document.getElementById('deptChips').style.display    = 'none';
      document.getElementById('dashSectionTitle').textContent = 'My Department';
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
    document.getElementById(`page${page.charAt(0).toUpperCase() + page.slice(1)}`).classList.add('active');
    document.getElementById(`nav-${page}`).classList.add('active');
    if (page === 'audit') {
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
    showSpinner();
    try {
      const items = await API.get(`/api/stock/${State.activeDeptId}`);
      State.stockItems = items;
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
    } else {
      Audit.renderStockList();
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

      return `
        <div class="stock-card ${cardClass}" onclick="Audit.openStockModal(${idx})">
          <div class="stock-card-header">
            <div>
              <div class="stock-card-title">${item.data[cols[0]] || 'Item ' + (idx+1)}</div>
              <div class="stock-card-sub">${item.data[cols[1]] || ''}</div>
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
        <input type="number" id="modalPhyQty" value="${item.physical_qty ?? ''}"
               placeholder="Enter physical count" inputmode="decimal">
      </div>

      <div class="form-group">
        <label>Remark (optional)</label>
        <input type="text" id="modalRemark" value="${item.remark || ''}" placeholder="Any notes?">
      </div>

      <button class="btn btn-primary" style="margin-bottom:8px;"
              onclick="Audit.sameQty(${item.id}, ${item.management_qty ?? 0})">
        ✅ Same as Management (${item.management_qty ?? '—'})
      </button>
      <button class="btn btn-success" onclick="Audit.saveVerification(${item.id})">
        💾 Save My Count
      </button>
    `;

    document.getElementById('stockModal').classList.add('open');
  },

  async sameQty(itemId, mgmtQty) {
    document.getElementById('modalPhyQty').value = mgmtQty;
    await Audit.saveVerification(itemId);
  },

  async saveVerification(itemId) {
    const qty    = document.getElementById('modalPhyQty').value;
    const remark = document.getElementById('modalRemark').value;
    if (qty === '') { toast('Enter physical qty', 'warning'); return; }

    showSpinner();
    try {
      await API.patch(`/api/stock/${itemId}/update`, {
        physical_qty: Number(qty),
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
          } catch(photoErr) {
            // Photo upload failing (e.g. Drive not configured) shouldn't fail the whole entry
            toast('Stock added ✅ but photo upload failed', 'warning');
          }
        }
      }

      toast('✅ Extra stock added!', 'success');

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

  async importExcel() {
    const deptName = document.getElementById('importDeptName').value.trim();
    const file     = document.getElementById('importFile').files[0];
    const qtyCol   = document.getElementById('importQtyColumn').value;

    if (!deptName) { toast('Enter department name', 'warning'); return; }
    if (!file)     { toast('Select an Excel file', 'warning'); return; }

    showSpinner();
    try {
      await Admin.ensureAudit();

      const fd = new FormData();
      fd.append('audit_id',   State.activeAudit.id);
      fd.append('dept_name',  deptName);
      fd.append('qty_column', qtyCol || '');
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
      toast('Import failed. Check the file and try again.', 'error');
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

    document.getElementById('importQtyField').style.display = 'block';
    document.getElementById('importPreview').style.display  = 'block';
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
    document.getElementById('importQtyField').style.display = 'none';
    document.getElementById('importPreview').style.display  = 'none';
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

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── BOOT ──────────────────────────────────────────────
App.init();
