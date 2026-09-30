/* ═══════════════════════════════════════════════════
   PIL STOCK AUDIT — app.js
   Mobile-only frontend logic
═══════════════════════════════════════════════════ */

const API = {
  get:  (url)       => fetch(url).then(r => r.json()),
  post: (url, body) => fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  patch:(url, body) => fetch(url, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json()),
  del:  (url)       => fetch(url, { method:'DELETE' }).then(r => r.json()),
  form: (url, fd)   => fetch(url, { method:'POST', body: fd }).then(r => r.json()),
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
    // Load user list for dropdown
    const res = await API.get('/api/auth/users');
    const sel = document.getElementById('userSelect');
    res.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = u;
      sel.appendChild(opt);
    });
  },

  // ── STEP 1: Validate name ─────────────────────────
  async loginStep1() {
    const name = document.getElementById('userSelect').value;
    if (!name) { toast('Please select your name', 'warning'); return; }

    showSpinner();
    try {
      const res = await API.post('/api/auth/login', { name });
      State.user = res.name;
      State.isAdmin = res.is_admin;

      // Load audit + departments before showing step 2
      await App.loadAudit();

      if (res.is_admin) {
        // Admin skips dept selection — goes straight to app
        App.enterApp(null);
      } else {
        // Non-admin must pick a department
        App.showDeptSelection();
      }
    } catch(e) {
      toast('Login failed. Try again.', 'error');
    } finally {
      hideSpinner();
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
    // deptId = null for admin, dept ID for non-admin
    State.lockedDeptId = deptId;
    State.activeDeptId = deptId || (State.departments[0]?.id ?? null);

    // Show/hide screens
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';

    // Topbar
    document.getElementById('topbarUser').textContent = State.user;

    if (State.isAdmin) {
      document.getElementById('topbarTitle').textContent = State.activeAudit?.name || 'Stock Audit';
      document.getElementById('adminSection').style.display = 'block';
      document.getElementById('deptChips').style.display = 'flex';
      document.getElementById('dashSectionTitle').textContent = 'All Departments';
      Audit.renderDeptChips();
    } else {
      const dept = State.departments.find(d => d.id === deptId);
      document.getElementById('topbarTitle').textContent = dept ? dept.name : 'Stock Audit';
      document.getElementById('topbarUser').textContent = `${State.user}`;
      document.getElementById('adminSection').style.display = 'none';
      document.getElementById('deptChips').style.display = 'none';
      document.getElementById('dashSectionTitle').textContent = 'My Department';
    }

    // Render dashboard and load stock
    Dashboard.render();
    Add.populateForm();
    App.showPage('dashboard');

    // Auto-load stock for audit tab
    if (State.activeDeptId) Audit.loadStock();
  },

  async loadAudit() {
    try {
      const audit = await API.get('/api/audits/active');
      State.activeAudit = audit;
      const depts = await API.get(`/api/departments/audit/${audit.id}`);
      State.departments = depts;
    } catch(e) {
      State.departments = [];
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
    document.getElementById('userSelect').value = '';
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
  render() {
    const container = document.getElementById('deptList');

    // Decide which departments to show
    const depts = State.isAdmin
      ? State.departments
      : State.departments.filter(d => d.id === State.lockedDeptId);

    if (!depts.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p>${State.isAdmin ? 'No departments imported yet.' : 'No data available for your department.'}</p>
        </div>`;
      return;
    }

    container.innerHTML = depts.map(dept => {
      const pct = dept.total_items ? Math.round((dept.verified_items / dept.total_items) * 100) : 0;
      const pending = dept.total_items - dept.verified_items;
      return `
        <div class="dept-card" onclick="Dashboard.openDept(${dept.id})">
          <div class="dept-card-header">
            <div>
              <div class="dept-name">${dept.name}</div>
              <div class="dept-count">${dept.total_items} items total</div>
            </div>
            <div style="font-size:22px; font-weight:700; color:var(--primary)">${pct}%</div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="dept-stats">
            <div class="stat-pill verified">✅ ${dept.verified_items} Done</div>
            <div class="stat-pill pending">⏳ ${pending} Left</div>
          </div>
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

      return `
        <div class="stock-card ${cardClass}" onclick="Audit.openStockModal(${idx})">
          <div class="stock-card-header">
            <div>
              <div class="stock-card-title">${item.data[cols[0]] || 'Item ' + (idx+1)}</div>
              <div class="stock-card-sub">${item.data[cols[1]] || ''}</div>
            </div>
            <span class="status-badge ${badgeClass}">${badgeText}</span>
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

    document.getElementById('stockModalContent').innerHTML = `
      <div class="modal-handle"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div class="modal-title" style="margin-bottom:0;">${item.data[cols[0]] || 'Stock Item'}</div>
        <button onclick="Modals.closeStock(${item.id})" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>
      </div>

      <div class="stock-data-grid">${allDataRows}</div>
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
// ADD NEW STOCK (locked to user's dept)
// ══════════════════════════════════════════════════════
const Add = {
  populateForm() {
    const deptId = State.lockedDeptId || State.activeDeptId;
    const dept = State.departments.find(d => d.id === deptId);
    const container = document.getElementById('addFormFields');
    const submitBtn = document.getElementById('addSubmitBtn');

    if (!dept) {
      container.innerHTML = '<div class="empty-state"><p>No department selected</p></div>';
      submitBtn.style.display = 'none';
      return;
    }

    container.innerHTML = dept.columns.map(col => `
      <div class="form-group">
        <label>${col}</label>
        <input type="text" id="add_${col.replace(/\s/g,'_')}" placeholder="${col}">
      </div>`).join('');

    submitBtn.style.display = 'block';
  },

  async submit() {
    const deptId = State.lockedDeptId || State.activeDeptId;
    const dept = State.departments.find(d => d.id === deptId);
    if (!dept) { toast('No department selected', 'warning'); return; }

    const data = {};
    dept.columns.forEach(col => {
      const el = document.getElementById(`add_${col.replace(/\s/g,'_')}`);
      if (el) data[col] = el.value;
    });

    showSpinner();
    try {
      await fetch('/api/stock/add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ department_id: deptId, data, verified_by: State.user })
      });
      toast('✅ Added!', 'success');
      // Clear form
      dept.columns.forEach(col => {
        const el = document.getElementById(`add_${col.replace(/\s/g,'_')}`);
        if (el) el.value = '';
      });
      App.showPage('audit');
      await Audit.loadStock();
    } catch(e) {
      toast('Failed to add item', 'error');
    } finally {
      hideSpinner();
    }
  }
};

// ══════════════════════════════════════════════════════
// PHOTO
// ══════════════════════════════════════════════════════
const Photo = {
  onFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    const area = document.getElementById('photoArea');
    const preview = document.getElementById('photoPreview');
    area.classList.add('has-file');
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  },

  async upload() {
    const input = document.getElementById('photoFileInput');
    const file = input.files[0];
    if (!file) { toast('Select a photo first', 'warning'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('Max 5MB allowed', 'warning'); return; }

    const remark = document.getElementById('photoRemark').value;
    const deptId = State.lockedDeptId || State.activeDeptId;

    const fd = new FormData();
    fd.append('file', file);
    fd.append('uploaded_by', State.user);
    fd.append('remark', remark);
    if (deptId) fd.append('department_id', deptId);

    showSpinner();
    try {
      await API.form('/api/photo/upload', fd);
      toast('✅ Uploaded!', 'success');
      input.value = '';
      document.getElementById('photoPreview').style.display = 'none';
      document.getElementById('photoArea').classList.remove('has-file');
      document.getElementById('photoRemark').value = '';
    } catch(e) {
      toast('Upload failed', 'error');
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
    const name = `Audit ${new Date().toLocaleDateString('en-IN')}`;
    const res = await API.post(`/api/audits/?created_by=${encodeURIComponent(State.user)}`, { name });
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

    await Admin.ensureAudit();

    const fd = new FormData();
    fd.append('audit_id',  State.activeAudit.id);
    fd.append('dept_name', deptName);
    fd.append('qty_column', qtyCol || '');
    fd.append('file', file);

    showSpinner();
    try {
      const res = await API.form('/api/departments/import', fd);
      toast(`✅ ${res.message}`, 'success');
      Modals.close('importModal');
      // Reload departments
      const depts = await API.get(`/api/departments/audit/${State.activeAudit.id}`);
      State.departments = depts;
      Dashboard.render();
      Audit.renderDeptChips();
    } catch(e) {
      toast('Import failed', 'error');
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

  previewColumns() {
    const file = document.getElementById('importFile').files[0];
    if (!file) return;
    document.getElementById('importQtyField').style.display = 'block';
    document.getElementById('importPreview').style.display  = 'block';
    document.getElementById('importPreviewText').textContent = `📄 ${file.name}`;
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
