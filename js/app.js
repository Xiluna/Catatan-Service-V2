/**
 * app.js - Main Application Controller (V2)
 */

(function () {
  'use strict';

  // State
  let currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  let activeTab = 'beranda';
  
  // Pending delete state for Undo (Entri Servis)
  let pendingDeleteEntry = null;
  let pendingDeleteTimeout = null;
  let undoToastEl = null;

  // Pending delete state for Undo (Stok Part)
  let pendingDeleteStock = null;
  let pendingDeleteStockTimeout = null;

  // Active delete target for confirmation modal
  let deleteTarget = null; // { type: 'entry' | 'stock', item: Object }

  const MONTH_NAMES_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const MONTH_SHORT_ID = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  // Helper: Format Rupiah
  function formatRupiah(num) {
    return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
  }

  // Helper: Format Indonesian Date (e.g. 23 Okt 2026)
  function formatDateID(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const day = parseInt(parts[2], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const year = parts[0];
    return `${day} ${MONTH_SHORT_ID[monthIdx] || ''} ${year}`;
  }

  // Helper: Format Month Label (e.g. Oktober 2026)
  function formatMonthLabel(yearMonth) {
    const parts = yearMonth.split('-');
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    return `${MONTH_NAMES_ID[monthIdx] || ''} ${year}`;
  }

  // Toast Notification Helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" fill="none" stroke="#34D399" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" fill="none" stroke="#F87171" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" fill="none" stroke="#60A5FA" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease-out';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  window.showToast = showToast;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==================== NAVIGATION ====================
  function switchTab(tabId) {
    activeTab = tabId;

    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });
    const targetSection = document.getElementById(`tab-${tabId}`);
    if (targetSection) targetSection.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabId === 'beranda') {
      renderBeranda();
    } else if (tabId === 'riwayat') {
      renderRiwayat();
    } else if (tabId === 'stok-part') {
      renderStock();
    }
  }

  // ==================== BERANDA VIEW ====================
  function renderBeranda() {
    let entries = StorageService.getEntriesByMonth(currentMonth);

    // Filter out item that is currently in "pending delete" state (temporarily hidden for Undo)
    if (pendingDeleteEntry) {
      entries = entries.filter(e => String(e.id) !== String(pendingDeleteEntry.id));
    }

    document.getElementById('heroMonthBadge').textContent = formatMonthLabel(currentMonth);

    let totalModal = 0;
    let totalPenjualan = 0;
    let totalProfit = 0;
    const jumlahKasus = entries.length;

    entries.forEach(e => {
      totalModal += Number(e.modal) || 0;
      totalPenjualan += Number(e.hargaJual) || 0;
      totalProfit += Number(e.profit) || 0;
    });

    document.getElementById('heroProfitValue').textContent = formatRupiah(totalProfit);

    // 4 Summary Cards (Exact labels: Total Modal, Total Penjualan, Total Profit, Jumlah Kasus)
    document.getElementById('cardTotalModal').textContent = formatRupiah(totalModal);
    document.getElementById('cardTotalPenjualan').textContent = formatRupiah(totalPenjualan);
    document.getElementById('cardTotalProfit').textContent = formatRupiah(totalProfit);
    document.getElementById('cardJumlahKasus').textContent = jumlahKasus.toLocaleString('id-ID');

    document.getElementById('homeTxCountBadge').textContent = `${jumlahKasus} Transaksi`;

    ChartsService.renderCharts(entries, currentMonth);
    renderTransactionList(entries, 'homeTableBody', 'homeMobileList', 'homeEmptyState');
  }

  // ==================== RIWAYAT VIEW ====================
  function renderRiwayat() {
    const monthSelect = document.getElementById('historyMonthSelect');
    const availableMonths = StorageService.getAvailableMonths();
    const selectedMonth = monthSelect.value || currentMonth;

    monthSelect.innerHTML = availableMonths.map(ym => `
      <option value="${ym}" ${ym === selectedMonth ? 'selected' : ''}>${formatMonthLabel(ym)}</option>
    `).join('');

    applyHistoryFilters();
  }

  function applyHistoryFilters() {
    const monthSelect = document.getElementById('historyMonthSelect');
    const branchSelect = document.getElementById('historyBranchSelect');
    const searchInput = document.getElementById('historySearchInput');

    const selectedMonth = monthSelect.value || currentMonth;
    const selectedBranch = branchSelect.value;
    const searchQuery = (searchInput.value || '').trim().toLowerCase();

    let entries = StorageService.getEntriesByMonth(selectedMonth);

    if (pendingDeleteEntry) {
      entries = entries.filter(e => String(e.id) !== String(pendingDeleteEntry.id));
    }

    if (selectedBranch) {
      entries = entries.filter(e => e.cabang === selectedBranch);
    }

    if (searchQuery) {
      entries = entries.filter(e => {
        const userMatch = (e.namaUser || '').toLowerCase().includes(searchQuery);
        const repairMatch = (e.perbaikan || '').toLowerCase().includes(searchQuery);
        const branchMatch = (e.cabang || '').toLowerCase().includes(searchQuery);
        return userMatch || repairMatch || branchMatch;
      });
    }

    document.getElementById('historyTableTitle').textContent = `Riwayat - ${formatMonthLabel(selectedMonth)}`;
    document.getElementById('historyTxCountBadge').textContent = `${entries.length} Kasus`;

    renderTransactionList(entries, 'historyTableBody', 'historyMobileList', 'historyEmptyState');
  }

  // ==================== TAHAP 1: EVENT DELEGATION & SHARED RENDERER ====================
  function renderTransactionList(entries, tableBodyId, mobileListId, emptyStateId) {
    const tableBody = document.getElementById(tableBodyId);
    const mobileList = document.getElementById(mobileListId);
    const emptyState = document.getElementById(emptyStateId);

    if (!tableBody || !mobileList) return;

    if (entries.length === 0) {
      tableBody.innerHTML = '';
      mobileList.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Desktop Table HTML
    tableBody.innerHTML = entries.map(item => `
      <tr data-id="${item.id}">
        <td style="font-weight: 600; white-space: nowrap;">${formatDateID(item.tanggal)}</td>
        <td>
          <span class="branch-badge branch-${item.cabang}">${item.cabang}</span>
        </td>
        <td style="font-weight: 700;">${escapeHtml(item.namaUser)}</td>
        <td class="repair-items-cell">${escapeHtml(item.perbaikan)}</td>
        <td>${formatRupiah(item.modal)}</td>
        <td>${formatRupiah(item.hargaJual)}</td>
        <td class="profit-cell">${formatRupiah(item.profit)}</td>
        <td>
          <div class="actions-cell">
            <button type="button" class="btn btn-ghost btn-sm btn-icon btn-edit-entry" data-id="${item.id}" title="Edit">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button type="button" class="btn btn-ghost btn-sm btn-icon btn-delete-entry" data-id="${item.id}" style="color: var(--status-danger);" title="Hapus">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Mobile Cards with Swipe-to-delete Wrapper
    mobileList.innerHTML = entries.map(item => `
      <div class="swipeable-card-wrapper" data-id="${item.id}">
        <div class="swipe-delete-action btn-delete-entry" data-id="${item.id}">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          <span>Hapus</span>
        </div>
        <div class="tx-card swipeable-card">
          <div class="tx-card-header">
            <div>
              <span class="branch-badge branch-${item.cabang}">${item.cabang}</span>
              <span class="tx-card-user" style="margin-left: 0.35rem;">${escapeHtml(item.namaUser)}</span>
            </div>
            <span class="tx-card-date">${formatDateID(item.tanggal)}</span>
          </div>
          <div class="tx-card-repairs">${escapeHtml(item.perbaikan)}</div>
          <div class="tx-card-financials">
            <div class="tx-card-fin-item">
              <label>Modal</label>
              <span>${formatRupiah(item.modal)}</span>
            </div>
            <div class="tx-card-fin-item">
              <label>Jual</label>
              <span>${formatRupiah(item.hargaJual)}</span>
            </div>
            <div class="tx-card-fin-item">
              <label>Profit</label>
              <span style="color: var(--status-success);">${formatRupiah(item.profit)}</span>
            </div>
          </div>
          <div class="tx-card-actions">
            <button type="button" class="btn btn-outline btn-sm btn-edit-entry" data-id="${item.id}">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              <span>Edit</span>
            </button>
            <button type="button" class="btn btn-ghost btn-sm btn-delete-entry" data-id="${item.id}" style="color: var(--status-danger);">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              <span>Hapus</span>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    setupMobileSwipe(mobileList);
  }

  // Event Delegation Handler for table and card actions
  function handleContainerClick(e) {
    const editBtn = e.target.closest('.btn-edit-entry');
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = editBtn.dataset.id;
      openEditModal(id);
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete-entry');
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = deleteBtn.dataset.id;
      openDeleteModal(id, 'entry');
      return;
    }
  }

  // Mobile Swipe-to-delete Touch Gestures
  function setupMobileSwipe(container) {
    let startX = 0;
    let currentX = 0;
    let activeCard = null;

    container.querySelectorAll('.swipeable-card').forEach(card => {
      card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        currentX = startX;
        activeCard = card;
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (!activeCard) return;
        currentX = e.touches[0].clientX;
        const diffX = currentX - startX;
        if (diffX < 0 && diffX > -100) {
          activeCard.style.transform = `translateX(${diffX}px)`;
        }
      }, { passive: true });

      card.addEventListener('touchend', () => {
        if (!activeCard) return;
        const diffX = currentX - startX;
        if (diffX < -50) {
          activeCard.style.transform = 'translateX(-84px)';
        } else {
          activeCard.style.transform = 'translateX(0)';
        }
        activeCard = null;
      });
    });
  }

  // ==================== TAHAP 1: EDIT & FORM MODAL ====================
  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Tambah Entri Servis';
    document.getElementById('entryId').value = '';
    document.getElementById('inputTanggal').value = new Date().toISOString().slice(0, 10);
    
    const lastCabang = StorageService.getLastCabang();
    document.getElementById('selectCabang').value = lastCabang || 'Center';
    document.getElementById('inputNamaUser').value = '';

    const container = document.getElementById('itemsContainer');
    container.innerHTML = '';
    addItemRow();

    updateFormProfit();
    updateAutocompleteDatalists();

    document.getElementById('entryModal').classList.add('active');
    setTimeout(() => document.getElementById('inputNamaUser').focus(), 100);
  }

  function openEditModal(id) {
    if (!id) {
      showToast('ID entri tidak valid', 'error');
      return;
    }

    const entry = StorageService.getEntryById(id);
    if (!entry) {
      showToast('Data entri tidak ditemukan di penyimpanan lokal', 'error');
      return;
    }

    document.getElementById('modalTitle').textContent = 'Edit Entri Servis';
    document.getElementById('entryId').value = entry.id;
    document.getElementById('inputTanggal').value = entry.tanggal || new Date().toISOString().slice(0, 10);
    document.getElementById('selectCabang').value = entry.cabang || 'Center';
    document.getElementById('inputNamaUser').value = entry.namaUser || '';

    const container = document.getElementById('itemsContainer');
    container.innerHTML = '';

    if (Array.isArray(entry.rincian) && entry.rincian.length > 0) {
      entry.rincian.forEach(r => addItemRow(r.nama, r.modal, r.hargaJual));
    } else {
      const lines = (entry.perbaikan || '').split('\n');
      lines.forEach(l => addItemRow(l, entry.modal, entry.hargaJual));
    }

    updateFormProfit();
    updateAutocompleteDatalists();

    document.getElementById('entryModal').classList.add('active');
  }

  function closeModal() {
    document.getElementById('entryModal').classList.remove('active');
  }

  // ==================== TAHAP 2 & 3: FORM ITEM ROW WITH PRICE MATCHER & LAST COST ====================
  function addItemRow(nama = '', modal = '', hargaJual = '') {
    const container = document.getElementById('itemsContainer');
    const row = document.createElement('div');
    row.className = 'item-row';
    
    // Track if Harga Jual was manually typed
    if (hargaJual !== '') {
      row.dataset.manualPrice = 'true';
    }

    row.innerHTML = `
      <div class="item-field-wrap">
        <label>Jenis Perbaikan</label>
        <input type="text" class="form-input item-name" list="repairSuggestions" placeholder="Misal: LCD OLED IP 11 PRO MAX - MC" value="${escapeHtml(nama)}" required autocomplete="off">
      </div>
      <div class="item-field-wrap">
        <label>Modal (Rp)</label>
        <input type="number" class="form-input item-modal" placeholder="0" min="0" step="1000" value="${modal !== '' ? modal : ''}">
        <div class="last-cost-hint"></div>
      </div>
      <div class="item-field-wrap">
        <label>Harga Jual (Rp)</label>
        <input type="number" class="form-input item-price" placeholder="0" min="0" step="1000" value="${hargaJual !== '' ? hargaJual : ''}">
        <div class="price-chips-container"></div>
      </div>
      <div class="item-delete-btn-wrap">
        <button type="button" class="btn btn-ghost btn-sm btn-icon btn-remove-item" title="Hapus Item" style="color: var(--status-danger);">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `;

    const nameInput = row.querySelector('.item-name');
    const modalInput = row.querySelector('.item-modal');
    const priceInput = row.querySelector('.item-price');
    const chipsContainer = row.querySelector('.price-chips-container');
    const lastCostHint = row.querySelector('.last-cost-hint');

    // Update last cost hint
    function updateLastCostHint(itemName) {
      const lastCost = StorageService.getLastCostForItem(itemName);
      if (lastCost !== null && lastCost > 0) {
        lastCostHint.textContent = `Modal terakhir: ${formatRupiah(lastCost)}`;
        lastCostHint.style.display = 'block';
      } else {
        lastCostHint.textContent = '';
        lastCostHint.style.display = 'none';
      }
    }

    // Price Matching handler
    function handleItemNameChange() {
      const val = nameInput.value.trim();
      updateLastCostHint(val);

      chipsContainer.innerHTML = '';

      // Jangan menimpa jika Harga Jual sudah pernah diketik manual
      if (row.dataset.manualPrice === 'true') {
        return;
      }

      if (!val) {
        priceInput.value = '';
        updateFormProfit();
        return;
      }

      const matchResult = StorageService.matchItemPrice(val);

      if (matchResult.matchType === 'exact') {
        priceInput.value = matchResult.price;
      } else if (matchResult.matchType === 'multiple') {
        priceInput.value = 0; // Belum dipilih
        matchResult.options.forEach(opt => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'price-chip';
          chip.textContent = `${opt.chipLabel} ${formatRupiah(opt.price)}`;
          chip.onclick = (e) => {
            e.preventDefault();
            priceInput.value = opt.price;
            chipsContainer.innerHTML = '';
            updateFormProfit();
          };
          chipsContainer.appendChild(chip);
        });
      } else {
        // matchType === 'none' (misal Android "LCD OPPO A06 - BD" atau tidak ada)
        priceInput.value = 0;
      }

      updateFormProfit();
    }

    nameInput.addEventListener('input', handleItemNameChange);
    nameInput.addEventListener('change', handleItemNameChange);

    modalInput.addEventListener('input', updateFormProfit);

    // If user types manually into Harga Jual, lock it
    priceInput.addEventListener('input', () => {
      row.dataset.manualPrice = 'true';
      chipsContainer.innerHTML = '';
      updateFormProfit();
    });

    row.querySelector('.btn-remove-item').onclick = () => {
      if (container.children.length > 1) {
        row.remove();
        updateFormProfit();
      } else {
        showToast('Minimal harus ada 1 item perbaikan', 'info');
      }
    };

    container.appendChild(row);

    // Initial check for hints if pre-filled
    if (nama) {
      updateLastCostHint(nama);
    }
  }

  function updateFormProfit() {
    const rows = document.querySelectorAll('#itemsContainer .item-row');
    let totalModal = 0;
    let totalJual = 0;

    rows.forEach(r => {
      const modalVal = Number(r.querySelector('.item-modal').value) || 0;
      const priceVal = Number(r.querySelector('.item-price').value) || 0;
      totalModal += modalVal;
      totalJual += priceVal;
    });

    const profit = totalJual - totalModal;
    document.getElementById('formProfitValue').textContent = formatRupiah(profit);
  }

  function updateAutocompleteDatalists() {
    const { users, repairs } = StorageService.getAutocompleteSuggestions();

    const userList = document.getElementById('userSuggestions');
    if (userList) {
      userList.innerHTML = users.map(u => `<option value="${escapeHtml(u)}">`).join('');
    }

    const repairList = document.getElementById('repairSuggestions');
    if (repairList) {
      repairList.innerHTML = repairs.map(r => `<option value="${escapeHtml(r)}">`).join('');
    }
  }

  function saveCurrentEntry() {
    const tanggal = document.getElementById('inputTanggal').value;
    const cabang = document.getElementById('selectCabang').value;
    const namaUser = document.getElementById('inputNamaUser').value.trim();
    const entryId = document.getElementById('entryId').value;

    if (!tanggal) {
      showToast('Harap pilih tanggal', 'error');
      return;
    }
    if (!cabang) {
      showToast('Harap pilih cabang', 'error');
      return;
    }
    if (!namaUser) {
      showToast('Harap isi nama user', 'error');
      return;
    }

    const rows = document.querySelectorAll('#itemsContainer .item-row');
    const rincian = [];
    let hasValidItem = false;

    rows.forEach(r => {
      const nama = r.querySelector('.item-name').value.trim();
      const modal = Number(r.querySelector('.item-modal').value) || 0;
      const hargaJual = Number(r.querySelector('.item-price').value) || 0;

      if (nama) {
        hasValidItem = true;
        rincian.push({ nama, modal, hargaJual });
      }
    });

    if (!hasValidItem || rincian.length === 0) {
      showToast('Harap isi minimal satu jenis perbaikan', 'error');
      return;
    }

    const perbaikan = rincian.map(item => item.nama).join('\n');
    const modal = rincian.reduce((sum, item) => sum + item.modal, 0);
    const hargaJual = rincian.reduce((sum, item) => sum + item.hargaJual, 0);
    const profit = hargaJual - modal;

    const entryData = {
      id: entryId || undefined,
      tanggal,
      cabang,
      namaUser,
      perbaikan,
      modal,
      hargaJual,
      profit,
      rincian
    };

    StorageService.saveEntry(entryData);
    closeModal();
    showToast(entryId ? 'Entri berhasil diperbarui' : 'Entri berhasil disimpan', 'success');

    if (activeTab === 'beranda') {
      renderBeranda();
    } else if (activeTab === 'riwayat') {
      renderRiwayat();
    }

    if (window.SyncManager) {
      window.SyncManager.triggerSync();
    }
  }

  // ==================== TAHAP 1: KONFIRMASI HAPUS & FITUR URUNGKAN (6 DETIK) ====================
  function openDeleteModal(id, type = 'entry') {
    if (type === 'entry') {
      const entry = StorageService.getEntryById(id);
      if (!entry) {
        showToast('Data entri tidak ditemukan', 'error');
        return;
      }
      deleteTarget = { type: 'entry', item: entry };
      document.getElementById('deleteModalPrompt').textContent = 'Hapus entri ini?';
      document.getElementById('deleteModalDetails').textContent = 
        `${entry.namaUser} • ${entry.cabang} • ${formatDateID(entry.tanggal)} (${formatRupiah(entry.profit)})`;
    } else if (type === 'stock') {
      const stockItem = StorageService.getStockById(id);
      if (!stockItem) {
        showToast('Item stok tidak ditemukan', 'error');
        return;
      }
      deleteTarget = { type: 'stock', item: stockItem };
      document.getElementById('deleteModalPrompt').textContent = 'Hapus stok part ini?';
      document.getElementById('deleteModalDetails').textContent = 
        `${stockItem.namaPart} (Jumlah: ${stockItem.jumlah})`;
    }

    document.getElementById('deleteModal').classList.add('active');
  }

  function closeDeleteModal() {
    deleteTarget = null;
    document.getElementById('deleteModal').classList.remove('active');
  }

  function executeDeleteWithUndo() {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'entry') {
      const entryToDelete = deleteTarget.item;
      closeDeleteModal();

      // Selesaikan pending delete sebelumnya jika ada
      if (pendingDeleteEntry && pendingDeleteTimeout) {
        clearTimeout(pendingDeleteTimeout);
        StorageService.deleteEntry(pendingDeleteEntry.id);
        if (window.SyncManager) window.SyncManager.triggerSync();
      }

      // Simpan di state pending delete
      pendingDeleteEntry = entryToDelete;

      // Segera hilangkan baris dari tampilan visual
      if (activeTab === 'beranda') {
        renderBeranda();
      } else if (activeTab === 'riwayat') {
        renderRiwayat();
      }

      // Tampilkan notifikasi bawah dengan tombol "Urungkan" selama 6 detik
      showUndoToast('Entri dihapus', () => {
        // Callback jika "Urungkan" ditekan
        clearTimeout(pendingDeleteTimeout);
        pendingDeleteEntry = null;
        if (activeTab === 'beranda') {
          renderBeranda();
        } else if (activeTab === 'riwayat') {
          renderRiwayat();
        }
        showToast('Penghapusan dibatalkan', 'info');
      });

      // Timer 6 detik: jika habis, hapus benar-benar dikirim ke Sheets
      pendingDeleteTimeout = setTimeout(() => {
        if (pendingDeleteEntry) {
          const id = pendingDeleteEntry.id;
          pendingDeleteEntry = null;
          StorageService.deleteEntry(id);
          if (window.SyncManager) {
            window.SyncManager.triggerSync();
          }
        }
      }, 6000);

    } else if (deleteTarget.type === 'stock') {
      const stockToDelete = deleteTarget.item;
      closeDeleteModal();

      if (pendingDeleteStock && pendingDeleteStockTimeout) {
        clearTimeout(pendingDeleteStockTimeout);
        StorageService.deleteStockItem(pendingDeleteStock.id);
        if (window.SyncManager) window.SyncManager.triggerSync();
      }

      pendingDeleteStock = stockToDelete;
      renderStock();

      showUndoToast('Stok part dihapus', () => {
        clearTimeout(pendingDeleteStockTimeout);
        pendingDeleteStock = null;
        renderStock();
        showToast('Penghapusan dibatalkan', 'info');
      });

      pendingDeleteStockTimeout = setTimeout(() => {
        if (pendingDeleteStock) {
          const id = pendingDeleteStock.id;
          pendingDeleteStock = null;
          StorageService.deleteStockItem(id);
          if (window.SyncManager) {
            window.SyncManager.triggerSync();
          }
        }
      }, 6000);
    }
  }

  function showUndoToast(message, onUndo) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    if (undoToastEl) {
      undoToastEl.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast-undo';
    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button" class="btn-undo-action">Urungkan</button>
      <div class="toast-undo-timer-bar"></div>
    `;

    toast.querySelector('.btn-undo-action').onclick = () => {
      toast.remove();
      undoToastEl = null;
      if (onUndo) onUndo();
    };

    container.appendChild(toast);
    undoToastEl = toast;

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
      }
      if (undoToastEl === toast) undoToastEl = null;
    }, 6000);
  }

  // ==================== TAHAP 4: STOK PART VIEW ====================
  function renderStock() {
    let stockItems = StorageService.getAllStock();
    const searchInput = document.getElementById('stockSearchInput');
    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

    if (pendingDeleteStock) {
      stockItems = stockItems.filter(s => String(s.id) !== String(pendingDeleteStock.id));
    }

    if (query) {
      stockItems = stockItems.filter(s => s.namaPart.toLowerCase().includes(query));
    }

    const countBadge = document.getElementById('stockCountBadge');
    if (countBadge) {
      countBadge.textContent = `${stockItems.length} Part`;
    }

    const tableBody = document.getElementById('stockTableBody');
    const mobileList = document.getElementById('stockMobileList');
    const emptyState = document.getElementById('stockEmptyState');

    if (!tableBody || !mobileList) return;

    if (stockItems.length === 0) {
      tableBody.innerHTML = '';
      mobileList.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Desktop Table
    tableBody.innerHTML = stockItems.map(item => `
      <tr data-id="${item.id}">
        <td style="font-weight: 700; font-size: 0.9375rem;">${escapeHtml(item.namaPart)}</td>
        <td style="text-align: center;">
          <div class="stock-stepper-wrap">
            <button type="button" class="btn-stepper btn-stock-dec" data-id="${item.id}" title="Kurangi">−</button>
            <span class="stock-qty-badge">${item.jumlah}</span>
            <button type="button" class="btn-stepper btn-stock-inc" data-id="${item.id}" title="Tambah">+</button>
          </div>
        </td>
        <td style="text-align: right;">
          <div class="actions-cell" style="justify-content: flex-end;">
            <button type="button" class="btn btn-ghost btn-sm btn-icon btn-edit-stock" data-id="${item.id}" title="Edit">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button type="button" class="btn btn-ghost btn-sm btn-icon btn-delete-stock" data-id="${item.id}" style="color: var(--status-danger);" title="Hapus">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Mobile Cards
    mobileList.innerHTML = stockItems.map(item => `
      <div class="swipeable-card-wrapper" data-id="${item.id}">
        <div class="swipe-delete-action btn-delete-stock" data-id="${item.id}">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          <span>Hapus</span>
        </div>
        <div class="tx-card swipeable-card" style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 0.9375rem; color: var(--text-main);">${escapeHtml(item.namaPart)}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div class="stock-stepper-wrap">
              <button type="button" class="btn-stepper btn-stock-dec" data-id="${item.id}">−</button>
              <span class="stock-qty-badge">${item.jumlah}</span>
              <button type="button" class="btn-stepper btn-stock-inc" data-id="${item.id}">+</button>
            </div>
            <button type="button" class="btn btn-outline btn-sm btn-icon btn-edit-stock" data-id="${item.id}" title="Edit">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    setupMobileSwipe(mobileList);
  }

  function handleStockContainerClick(e) {
    const decBtn = e.target.closest('.btn-stock-dec');
    if (decBtn) {
      e.preventDefault();
      const id = decBtn.dataset.id;
      StorageService.updateStockQuantity(id, -1);
      renderStock();
      if (window.SyncManager) window.SyncManager.triggerSync();
      return;
    }

    const incBtn = e.target.closest('.btn-stock-inc');
    if (incBtn) {
      e.preventDefault();
      const id = incBtn.dataset.id;
      StorageService.updateStockQuantity(id, 1);
      renderStock();
      if (window.SyncManager) window.SyncManager.triggerSync();
      return;
    }

    const editBtn = e.target.closest('.btn-edit-stock');
    if (editBtn) {
      e.preventDefault();
      const id = editBtn.dataset.id;
      openStockModal(id);
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete-stock');
    if (deleteBtn) {
      e.preventDefault();
      const id = deleteBtn.dataset.id;
      openDeleteModal(id, 'stock');
      return;
    }
  }

  function openStockModal(id = null) {
    const modal = document.getElementById('stockModal');
    const title = document.getElementById('stockModalTitle');
    const inputId = document.getElementById('stockId');
    const inputNama = document.getElementById('inputStockNama');
    const inputJumlah = document.getElementById('inputStockJumlah');

    if (id) {
      const item = StorageService.getStockById(id);
      if (!item) return;
      title.textContent = 'Edit Stok Part';
      inputId.value = item.id;
      inputNama.value = item.namaPart;
      inputJumlah.value = item.jumlah;
    } else {
      title.textContent = 'Tambah Part Baru';
      inputId.value = '';
      inputNama.value = '';
      inputJumlah.value = 1;
    }

    modal.classList.add('active');
    setTimeout(() => inputNama.focus(), 100);
  }

  function closeStockModal() {
    document.getElementById('stockModal').classList.remove('active');
  }

  function saveStockFromModal() {
    const id = document.getElementById('stockId').value;
    const namaPart = document.getElementById('inputStockNama').value.trim();
    const jumlah = Math.max(0, parseInt(document.getElementById('inputStockJumlah').value, 10) || 0);

    if (!namaPart) {
      showToast('Nama part wajib diisi', 'error');
      return;
    }

    StorageService.saveStockItem({
      id: id || undefined,
      namaPart: namaPart,
      jumlah: jumlah
    });

    closeStockModal();
    renderStock();
    showToast(id ? 'Stok part diperbarui' : 'Stok part ditambahkan', 'success');

    if (window.SyncManager) {
      window.SyncManager.triggerSync();
    }
  }

  // ==================== TAHAP 2: RELOAD DAFTAR HARGA ====================
  async function reloadPriceList() {
    const statusEl = document.getElementById('reloadPriceStatus');
    statusEl.textContent = 'Memuat dari Google Sheets...';
    statusEl.style.color = 'var(--text-muted)';

    if (!window.SyncManager) return;
    const data = await window.SyncManager.fetchPriceList();

    if (data && data.rows && data.rows.length > 0) {
      statusEl.textContent = `✓ Berhasil dimuat (${data.rows.length} series iPhone)`;
      statusEl.style.color = 'var(--status-success)';
      showToast(`Daftar harga diperbarui (${data.rows.length} series)`, 'success');
      updateAutocompleteDatalists();
    } else {
      statusEl.textContent = '✗ Gagal memuat dari Sheets (pakai cache)';
      statusEl.style.color = 'var(--status-danger)';
      showToast('Tidak dapat memuat daftar harga dari Sheets', 'error');
    }
  }

  // ==================== SETTINGS & ACCENT ====================
  function applyAccentColor(colorName) {
    document.documentElement.setAttribute('data-accent', colorName);
    document.querySelectorAll('#accentColorPicker .color-option').forEach(el => {
      el.classList.toggle('active', el.dataset.color === colorName);
    });
    const entries = StorageService.getEntriesByMonth(currentMonth);
    ChartsService.renderCharts(entries, currentMonth);
  }

  function initSettings() {
    const settings = StorageService.getSettings();

    document.getElementById('settingAppScriptUrl').value = settings.appScriptUrl || '';
    document.getElementById('settingSecurityToken').value = settings.securityToken || '';

    applyAccentColor(settings.accentColor || 'blue');

    const chartSwitch = document.getElementById('switchShowChartsMobile');
    chartSwitch.checked = Boolean(settings.showChartsMobile);
    applyMobileChartVisibility(settings.showChartsMobile);

    chartSwitch.onchange = () => {
      StorageService.saveSettings({ showChartsMobile: chartSwitch.checked });
      applyMobileChartVisibility(chartSwitch.checked);
      showToast('Pengaturan grafik diperbarui', 'info');
    };

    document.querySelectorAll('#accentColorPicker .color-option').forEach(el => {
      el.onclick = () => {
        const color = el.dataset.color;
        StorageService.saveSettings({ accentColor: color });
        applyAccentColor(color);
        showToast(`Aksen warna diubah: ${color}`, 'info');
      };
    });

    document.getElementById('btnSaveBackendConfig').onclick = () => {
      const url = document.getElementById('settingAppScriptUrl').value.trim();
      const token = document.getElementById('settingSecurityToken').value.trim();
      StorageService.saveSettings({ appScriptUrl: url, securityToken: token });
      showToast('Pengaturan Google Sheets disimpan', 'success');
      if (window.SyncManager) {
        window.SyncManager.triggerSync();
      }
    };

    document.getElementById('btnTestConnection').onclick = async () => {
      const url = document.getElementById('settingAppScriptUrl').value.trim();
      const token = document.getElementById('settingSecurityToken').value.trim();
      const statusEl = document.getElementById('testConnectionStatus');
      
      statusEl.style.color = 'var(--text-muted)';
      statusEl.textContent = 'Menguji koneksi...';

      if (window.SyncManager) {
        const result = await window.SyncManager.testConnection(url, token);
        if (result.success) {
          statusEl.style.color = 'var(--status-success)';
          statusEl.textContent = '✓ ' + result.message;
          showToast(result.message, 'success');
        } else {
          statusEl.style.color = 'var(--status-danger)';
          statusEl.textContent = '✗ ' + result.message;
          showToast(result.message, 'error');
        }
      }
    };

    // Tombol Muat Ulang Daftar Harga
    const btnReloadPrice = document.getElementById('btnReloadPriceList');
    if (btnReloadPrice) {
      btnReloadPrice.onclick = reloadPriceList;
    }

    document.getElementById('btnLoadDemoData').onclick = () => {
      StorageService.loadDemoData();
      showToast('Data contoh berhasil dimuat', 'success');
      renderBeranda();
      renderRiwayat();
      renderStock();
    };

    document.getElementById('btnClearData').onclick = () => {
      if (confirm('Yakin ingin mereset seluruh data lokal? Semua catatan yang belum tersinkron akan hilang.')) {
        StorageService.clearAllData();
        showToast('Data lokal berhasil direset', 'info');
        renderBeranda();
        renderRiwayat();
        renderStock();
      }
    };
  }

  function applyMobileChartVisibility(show) {
    const chartsSection = document.getElementById('chartsSection');
    const toggleBtnText = document.getElementById('chartToggleText');
    if (!chartsSection) return;

    if (window.innerWidth <= 768) {
      if (show) {
        chartsSection.classList.remove('mobile-hidden');
        if (toggleBtnText) toggleBtnText.textContent = 'Sembunyikan Grafik';
      } else {
        chartsSection.classList.add('mobile-hidden');
        if (toggleBtnText) toggleBtnText.textContent = 'Tampilkan Grafik';
      }
    } else {
      chartsSection.classList.remove('mobile-hidden');
    }
  }

  // ==================== EVENT BINDINGS & KEYBOARD SHORTCUTS ====================
  function initEvents() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });

    document.getElementById('brandLink').onclick = (e) => {
      e.preventDefault();
      switchTab('beranda');
    };

    document.getElementById('btnOpenModalDesk').onclick = openAddModal;
    document.getElementById('btnOpenModalHero').onclick = openAddModal;
    document.getElementById('btnFabAdd').onclick = () => {
      if (activeTab === 'stok-part') {
        openStockModal();
      } else {
        openAddModal();
      }
    };

    document.getElementById('btnCloseModal').onclick = closeModal;
    document.getElementById('btnCancelModal').onclick = closeModal;
    document.getElementById('btnAddItem').onclick = () => addItemRow();
    document.getElementById('btnSaveEntry').onclick = saveCurrentEntry;

    // Delete Modal controls
    document.getElementById('btnCloseDeleteModal').onclick = closeDeleteModal;
    document.getElementById('btnCancelDelete').onclick = closeDeleteModal;
    document.getElementById('btnConfirmDelete').onclick = executeDeleteWithUndo;

    // Riwayat controls
    document.getElementById('historyMonthSelect').onchange = applyHistoryFilters;
    document.getElementById('historyBranchSelect').onchange = applyHistoryFilters;
    document.getElementById('historySearchInput').oninput = applyHistoryFilters;

    document.getElementById('btnExportCSV').onclick = () => {
      const selectedMonth = document.getElementById('historyMonthSelect').value || currentMonth;
      StorageService.exportCsvByMonth(selectedMonth);
      showToast(`Export CSV ${selectedMonth} berhasil diunduh`, 'success');
    };

    // Mobile Chart Toggle Button
    const mobileChartBtn = document.getElementById('btnToggleChartMobile');
    if (mobileChartBtn) {
      mobileChartBtn.onclick = () => {
        const settings = StorageService.getSettings();
        const newVal = !settings.showChartsMobile;
        StorageService.saveSettings({ showChartsMobile: newVal });
        document.getElementById('switchShowChartsMobile').checked = newVal;
        applyMobileChartVisibility(newVal);
      };
    }

    // Stok Part events
    const btnOpenAddStock = document.getElementById('btnOpenAddStock');
    if (btnOpenAddStock) btnOpenAddStock.onclick = () => openStockModal();
    document.getElementById('btnCloseStockModal').onclick = closeStockModal;
    document.getElementById('btnCancelStock').onclick = closeStockModal;
    document.getElementById('btnSaveStock').onclick = saveStockFromModal;

    const stockSearch = document.getElementById('stockSearchInput');
    if (stockSearch) stockSearch.oninput = renderStock;

    // EVENT DELEGATION: Pasang listener klik pada kontainer tabel & kartu
    const homeTableBody = document.getElementById('homeTableBody');
    const homeMobileList = document.getElementById('homeMobileList');
    const historyTableBody = document.getElementById('historyTableBody');
    const historyMobileList = document.getElementById('historyMobileList');

    if (homeTableBody) homeTableBody.addEventListener('click', handleContainerClick);
    if (homeMobileList) homeMobileList.addEventListener('click', handleContainerClick);
    if (historyTableBody) historyTableBody.addEventListener('click', handleContainerClick);
    if (historyMobileList) historyMobileList.addEventListener('click', handleContainerClick);

    // EVENT DELEGATION: Stok Part
    const stockTableBody = document.getElementById('stockTableBody');
    const stockMobileList = document.getElementById('stockMobileList');
    if (stockTableBody) stockTableBody.addEventListener('click', handleStockContainerClick);
    if (stockMobileList) stockMobileList.addEventListener('click', handleStockContainerClick);

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const modalActive = document.getElementById('entryModal').classList.contains('active');
      const deleteModalActive = document.getElementById('deleteModal').classList.contains('active');
      const stockModalActive = document.getElementById('stockModal').classList.contains('active');

      if (e.key === 'Escape') {
        if (modalActive) closeModal();
        if (deleteModalActive) closeDeleteModal();
        if (stockModalActive) closeStockModal();
        return;
      }

      if (e.key === 'Enter') {
        if (modalActive && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          saveCurrentEntry();
          return;
        }
        if (stockModalActive) {
          e.preventDefault();
          saveStockFromModal();
          return;
        }
      }

      if (!modalActive && !deleteModalActive && !stockModalActive) {
        const inInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
        if (e.key.toLowerCase() === 'n' && !inInput && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (activeTab === 'stok-part') {
            openStockModal();
          } else {
            openAddModal();
          }
        }
      }
    });

    window.addEventListener('resize', () => {
      const settings = StorageService.getSettings();
      applyMobileChartVisibility(settings.showChartsMobile);
    });
  }

  // ==================== INITIALIZATION ====================
  function init() {
    initSettings();
    initEvents();

    if (window.SyncManager) {
      window.SyncManager.init();
    }

    const existing = StorageService.getAllEntries();
    if (existing.length === 0) {
      StorageService.loadDemoData();
    }

    renderBeranda();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
