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
  departments: [],
  activeDeptId: null,
  stockItems: [],
  filteredItems: [],
  // Per-dept filter prefs stored in localStorage
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
    const users = await API.get('/api/auth/users');
    const sel = document.getElementById('userSelect');
    users.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = u;
      sel.appendChild(opt);
    });
  },

  async login() {
    const name = document.getElementById('userSelect').value;
    if (!name) { toast('Please select your name', 'warning'); return; }

    showSpinner();
    try {
      const res = await API.post('/api/auth/login', { name });
      State.user = res.name;
      State.isAdmin = res.is_admin;

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      document.getElementById('topbarUser').textContent = res.name;

      if (res.is_admin) {
        document.getElementById('adminSection').style.display = 'block';
      }

      await App.loadAudit();
      App.showPage('dashboard');
    } catch(e) {
      toast('Login failed', 'error');
    } finally {
      hideSpinner();
    }
  },

  logout() {
    if (!confirm('Logout?')) return;
    State.user = null;
    State.isAdmin = false;
    State.activeAudit = null;
    State.departments = [];
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('userSelect').value = '';
  },

  async loadAudit() {
    try {
      const audit = await API.get('/api/audits/active');
      State.activeAudit = audit;
      document.getElementById('topbarTitle').textContent = audit.name;
      await App.loadDepartments();
    } catch(e) {
      // No active audit — admin needs to create one
      document.getElementById('topbarTitle').textContent = 'PIL Stock Audit';
    }
  },

  async loadDepartments() {
    if (!State.activeAudit) return;
    const depts = await API.get(`/api/departments/audit/${State.activeAudit.id}`);
    State.departments = depts;
    Dashboard.render();
    Audit.renderDeptChips();
    Add.populateDeptSelect();
    Photo.populateDeptSelect();
  },

  showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page${page.charAt(0).toUpperCase() + page.slice(1)}`).classList.add('active');
    document.getElementById(`nav-${page}`).classList.add('active');

    if (page === 'audit' && State.activeDeptId) Audit.loadStock();
  },

  exportAll() {
    if (!State.activeDeptId) { toast('Select a department first from the Audit tab', 'warning'); return; }
    window.location.href = `/api/stock/${State.activeDeptId}/export`;
  }
};

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
const Dashboard = {
  render() {
    const container = document.getElementById('deptList');
    if (!State.departments.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p>No departments loaded.<br>Ask admin to import data.</p>
        </div>`;
      return;
    }

    container.innerHTML = State.departments.map(dept => {
      const pct = dept.total_items ? Math.round((dept.verified_items / dept.total_items) * 100) : 0;
      const pending = dept.total_items - dept.verified_items;
      return `
        <div class="dept-card" onclick="Dashboard.openDept(${dept.id})">
          <div class="dept-card-header">
            <div>
              <div class="dept-name">${dept.name}</div>
              <div class="dept-count">${dept.total_items} items</div>
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
    App.showPage('audit');
    Audit.renderDeptChips();
    Audit.loadStock();
  }
};

// ══════════════════════════════════════════════════════
// AUDIT
// ══════════════════════════════════════════════════════
const Audit = {

  renderDeptChips() {
    const container = document.getElementById('deptChips');
    container.innerHTML = State.departments.map(d => `
      <button class="dept-chip ${d.id === State.activeDeptId ? 'active' : ''}"
              onclick="Audit.switchDept(${d.id})">
        ${d.name}
      </button>`).join('');
  },

  switchDept(deptId) {
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
    // Default: Stand if exists, else first 2 columns
    const cols = dept.columns || [];
    const defaults = cols.includes('Stand') ? ['Stand'] : cols.slice(0, 2);
    return defaults;
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

    State.filteredItems = State.stockItems.filter(item => {
      // Global search across all data fields
      if (g) {
        const allText = Object.values(item.data).join(' ');
        if (!normalize(allText).includes(g)) return false;
      }
      // Per-column filters
      for (const [col, val] of Object.entries(filterVals)) {
        if (!val) continue;
        const cellVal = normalize(item.data[col] || '');
        if (!cellVal.includes(val)) return false;
      }
      return true;
    });

    document.getElementById('resultsMeta').textContent =
      g || Object.values(filterVals).some(v => v)
        ? `Showing ${State.filteredItems.length} of ${State.stockItems.length} items`
        : '';

    if (!g && !Object.values(filterVals).some(v => v)) {
      document.getElementById('stockList').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>Use the search bar above to find stock items</p>
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
          badgeClass = 'badge-verified'; cardClass = 'verified'; badgeText = '✅ Verified';
        } else {
          badgeClass = 'badge-discrepant'; cardClass = 'discrepant';
          badgeText = diff > 0 ? `🔺 +${diff}` : `🔻 ${diff}`;
        }
      }

      if (item.being_edited_by && item.being_edited_by !== State.user) {
        cardClass = 'editing';
      }

      // Show top 4 columns in the card grid
      const displayCols = cols.slice(0, 6);
      const gridHTML = displayCols.map(col => `
        <div class="data-item">
          <div class="data-label">${col}</div>
          <div class="data-value">${item.data[col] || '—'}</div>
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
        if (res.locked && res.by !== State.user) {
          toast(res.warning, 'warning');
        }
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
          <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Previously Verified By ${item.verified_by}</div>
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
              onclick="Audit.sameQty(${item.id}, ${item.management_qty})">
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
    const qty = document.getElementById('modalPhyQty').value;
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
      await App.loadDepartments(); // refresh progress
    } catch(e) {
      toast('Save failed', 'error');
    } finally {
      hideSpinner();
    }
  },

  openFilterConfigModal() {
    Modals.openFilterConfig();
  },

  applyFilterConfig() {
    const dept = Audit.getDept();
    if (!dept) return;
    const key = `dept_${State.activeDeptId}`;
    const selected = [];
    dept.columns.forEach(col => {
      const toggle = document.getElementById(`toggle_${col.replace(/\s/g,'_')}`);
      if (toggle && toggle.checked) selected.push(col);
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
// ADD NEW STOCK
// ══════════════════════════════════════════════════════
const Add = {
  populateDeptSelect() {
    const sel = document.getElementById('addDeptSelect');
    sel.innerHTML = '<option value="">-- Select Department --</option>' +
      State.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    sel.onchange = Add.onDeptChange;
  },

  onDeptChange() {
    const deptId = parseInt(document.getElementById('addDeptSelect').value);
    const dept = State.departments.find(d => d.id === deptId);
    const container = document.getElementById('addFormFields');
    const submitBtn = document.getElementById('addSubmitBtn');

    if (!dept) {
      container.innerHTML = '<div class="empty-state"><p>Select a department to see fields</p></div>';
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
    const deptId = parseInt(document.getElementById('addDeptSelect').value);
    const dept = State.departments.find(d => d.id === deptId);
    if (!dept) { toast('Select a department', 'warning'); return; }

    const data = {};
    dept.columns.forEach(col => {
      const el = document.getElementById(`add_${col.replace(/\s/g,'_')}`);
      if (el) data[col] = el.value;
    });

    showSpinner();
    try {
      const fd = new FormData();
      fd.append('audit_id', State.activeAudit.id);
      fd.append('dept_name', dept.name);
      fd.append('qty_column', dept.columns[0]);
      // We'll use a dedicated add-item endpoint instead
      // For now send as JSON patch
      await fetch('/api/stock/add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ department_id: deptId, data, verified_by: State.user })
      });
      toast('✅ Added!', 'success');
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
  populateDeptSelect() {
    const sel = document.getElementById('photoDeptSelect');
    sel.innerHTML = '<option value="">-- Select Department --</option>' +
      State.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  },

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

    const remark  = document.getElementById('photoRemark').value;
    const deptId  = document.getElementById('photoDeptSelect').value;

    const fd = new FormData();
    fd.append('file', file);
    fd.append('uploaded_by', State.user);
    fd.append('remark', remark);
    if (deptId) fd.append('department_id', deptId);

    showSpinner();
    try {
      const res = await API.form('/api/photo/upload', fd);
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
    // Auto-create an audit if none exists
    const name = `Audit ${new Date().toLocaleDateString('en-IN')}`;
    const res = await API.post(`/api/audits/?created_by=${encodeURIComponent(State.user)}`, { name });
    State.activeAudit = res;
    document.getElementById('topbarTitle').textContent = res.name;
    return res;
  },

  async importExcel() {
    const deptName = document.getElementById('importDeptName').value.trim();
    const file = document.getElementById('importFile').files[0];
    const qtyCol = document.getElementById('importQtyColumn').value;

    if (!deptName) { toast('Enter department name', 'warning'); return; }
    if (!file) { toast('Select an Excel file', 'warning'); return; }

    await Admin.ensureAudit();

    const fd = new FormData();
    fd.append('audit_id', State.activeAudit.id);
    fd.append('dept_name', deptName);
    fd.append('qty_column', qtyCol || '');
    fd.append('file', file);

    showSpinner();
    try {
      const res = await API.form('/api/departments/import', fd);
      toast(`✅ ${res.message}`, 'success');
      Modals.close('importModal');
      await App.loadDepartments();
    } catch(e) {
      toast('Import failed', 'error');
    } finally {
      hideSpinner();
    }
  },

  // Preview columns when file is selected
  async previewColumns() {
    const file = document.getElementById('importFile').files[0];
    if (!file) return;
    // Read first row locally using FileReader + basic parse
    // For now just show filename
    document.getElementById('importQtyField').style.display = 'block';
    document.getElementById('importPreview').style.display = 'block';
    document.getElementById('importPreviewText').textContent = `📄 ${file.name}`;
  }
};

// Wire up file input preview
document.addEventListener('DOMContentLoaded', () => {
  const importFile = document.getElementById('importFile');
  if (importFile) importFile.addEventListener('change', Admin.previewColumns);
});

// ══════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════
const Modals = {
  open(id) { document.getElementById(id).classList.add('open'); },
  close(id) { document.getElementById(id).classList.remove('open'); },

  openImport() {
    document.getElementById('importDeptName').value = '';
    document.getElementById('importFile').value = '';
    document.getElementById('importQtyField').style.display = 'none';
    document.getElementById('importPreview').style.display = 'none';
    Modals.open('importModal');
  },

  openFilterConfig() {
    const dept = Audit.getDept();
    if (!dept) { toast('Select a department first', 'warning'); return; }
    const prefs = Audit.getFilterPrefs();
    const list = document.getElementById('filterToggleList');
    list.innerHTML = dept.columns.map(col => `
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
    // Unlock item
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
