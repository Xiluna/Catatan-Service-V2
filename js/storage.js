/**
 * storage.js - Data Layer, LocalStorage, Offline Queue, Price Matcher, Last Cost, and Stock
 */

const STORAGE_KEYS = {
  ENTRIES: 'catatan_servis_entries_v2',
  SYNC_QUEUE: 'catatan_servis_sync_queue_v2',
  SETTINGS: 'catatan_servis_settings_v2',
  LAST_CABANG: 'catatan_servis_last_cabang_v2',
  PRICELIST: 'catatan_servis_pricelist_v2',
  STOCK: 'catatan_servis_stock_v2'
};

const StorageService = {
  // ==================== SETTINGS ====================
  getSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse settings from localStorage', e);
    }
    return {
      appScriptUrl: '',
      securityToken: '',
      accentColor: 'blue',
      showChartsMobile: false
    };
  },

  saveSettings(settings) {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  },

  getLastCabang() {
    return localStorage.getItem(STORAGE_KEYS.LAST_CABANG) || 'Center';
  },

  saveLastCabang(cabang) {
    if (['Center', 'Icone', 'Semampir'].includes(cabang)) {
      localStorage.setItem(STORAGE_KEYS.LAST_CABANG, cabang);
    }
  },

  // ==================== ENTRIES ====================
  getAllEntries() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ENTRIES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // Pastikan setiap entri memiliki ID valid
          let fixed = false;
          parsed.forEach(e => {
            if (!e.id) {
              e.id = 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
              fixed = true;
            }
          });
          if (fixed) this.saveAllEntries(parsed);
          return parsed.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
        }
      }
    } catch (e) {
      console.error('Failed to read entries from localStorage', e);
    }
    return [];
  },

  saveAllEntries(entries) {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
  },

  getEntriesByMonth(yearMonth) {
    const entries = this.getAllEntries();
    return entries.filter(item => {
      if (!item.tanggal) return false;
      return item.tanggal.startsWith(yearMonth);
    });
  },

  getAvailableMonths() {
    const entries = this.getAllEntries();
    const monthsSet = new Set();
    const currentYm = new Date().toISOString().slice(0, 7);
    monthsSet.add(currentYm);

    entries.forEach(e => {
      if (e.tanggal && e.tanggal.length >= 7) {
        monthsSet.add(e.tanggal.slice(0, 7));
      }
    });

    return Array.from(monthsSet).sort().reverse();
  },

  getEntryById(id) {
    if (!id) return null;
    const entries = this.getAllEntries();
    return entries.find(e => String(e.id) === String(id)) || null;
  },

  saveEntry(entryData) {
    const entries = this.getAllEntries();
    const isEdit = Boolean(entryData.id);
    const now = Date.now();

    let savedEntry = null;

    if (isEdit) {
      const idx = entries.findIndex(e => String(e.id) === String(entryData.id));
      if (idx !== -1) {
        savedEntry = {
          ...entries[idx],
          ...entryData,
          updatedAt: now,
          synced: false
        };
        entries[idx] = savedEntry;
        this.enqueueSync({ action: 'UPDATE', entry: savedEntry });
      } else {
        savedEntry = {
          ...entryData,
          id: entryData.id,
          createdAt: now,
          updatedAt: now,
          synced: false
        };
        entries.unshift(savedEntry);
        this.enqueueSync({ action: 'CREATE', entry: savedEntry });
      }
    } else {
      const newId = 'entry_' + now + '_' + Math.random().toString(36).substr(2, 6);
      savedEntry = {
        ...entryData,
        id: newId,
        createdAt: now,
        updatedAt: now,
        synced: false
      };
      entries.unshift(savedEntry);
      this.enqueueSync({ action: 'CREATE', entry: savedEntry });
    }

    if (entryData.cabang) {
      this.saveLastCabang(entryData.cabang);
    }

    this.saveAllEntries(entries);
    return savedEntry;
  },

  deleteEntry(id) {
    const entries = this.getAllEntries();
    const target = entries.find(e => String(e.id) === String(id));
    if (!target) return false;

    const filtered = entries.filter(e => String(e.id) !== String(id));
    this.saveAllEntries(filtered);

    this.enqueueSync({
      action: 'DELETE',
      id: id,
      tanggal: target.tanggal
    });

    return true;
  },

  // ==================== OFFLINE SYNC QUEUE ====================
  getSyncQueue() {
    try {
      const q = localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
      if (q) return JSON.parse(q);
    } catch (e) {
      console.warn('Failed to read sync queue', e);
    }
    return [];
  },

  saveSyncQueue(queue) {
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
  },

  enqueueSync(item) {
    const queue = this.getSyncQueue();
    queue.push({
      ...item,
      queuedAt: Date.now()
    });
    this.saveSyncQueue(queue);
  },

  clearSyncQueue() {
    this.saveSyncQueue([]);
  },

  // ==================== CSV EXPORT ====================
  exportCsvByMonth(yearMonth) {
    const entries = this.getEntriesByMonth(yearMonth);
    const headers = ['Tanggal', 'Cabang', 'Nama User', 'Perbaikan', 'Modal', 'Harga Jual', 'Profit'];
    
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = entries.map(item => [
      escapeCsv(item.tanggal || ''),
      escapeCsv(item.cabang || ''),
      escapeCsv(item.namaUser || ''),
      escapeCsv(item.perbaikan || ''),
      item.modal || 0,
      item.hargaJual || 0,
      item.profit || 0
    ]);

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Catatan_Servis_${yearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // ==================== TAHAP 2: HARGA JUAL & PRICE MATCHER ====================
  getPriceList() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PRICELIST);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to read pricelist from storage', e);
    }
    // Default fallback pricelist
    return {
      headers: [
        "SERIES", "LCD HIGH PREMIUM", "LCD OLED", "BATERAI", "BATERAI GENUINE",
        "KAMERA DEPAN", "KAMERA BELAKANG", "KACA KAMERA", "BACKGLASS", "HOUSING",
        "FLEX CHARGER", "ANTENA WIFI", "FACE ID", "FLEX ON/OFF", "TAPTIC VIBRANCE",
        "SPEAKER ATAS/BUZZER", "HOME BUTTON", "KONSLET", "IC", "LOGIC BOARD"
      ],
      rows: [
        { series: "IP 11", prices: { "LCD HIGH PREMIUM": 550000, "LCD OLED": 850000, "BATERAI": 250000, "BATERAI GENUINE": 450000, "KAMERA DEPAN": 300000, "KAMERA BELAKANG": 400000, "FLEX CHARGER": 180000, "FLEX ON/OFF": 150000, "SPEAKER ATAS/BUZZER": 150000 } },
        { series: "IP 11 PRO", prices: { "LCD HIGH PREMIUM": 650000, "LCD OLED": 1100000, "BATERAI": 280000, "BATERAI GENUINE": 500000, "KAMERA DEPAN": 350000, "KAMERA BELAKANG": 450000, "FLEX CHARGER": 200000, "FLEX ON/OFF": 180000, "SPEAKER ATAS/BUZZER": 180000 } },
        { series: "IP 11 PRO MAX", prices: { "LCD HIGH PREMIUM": 700000, "LCD OLED": 1300000, "BATERAI": 300000, "BATERAI GENUINE": 550000, "KAMERA DEPAN": 380000, "KAMERA BELAKANG": 500000, "FLEX CHARGER": 220000, "FLEX ON/OFF": 180000, "SPEAKER ATAS/BUZZER": 180000 } },
        { series: "IP 12", prices: { "LCD HIGH PREMIUM": 800000, "LCD OLED": 1500000, "BATERAI": 350000, "BATERAI GENUINE": 600000, "KAMERA DEPAN": 400000, "KAMERA BELAKANG": 550000, "FLEX CHARGER": 250000, "FLEX ON/OFF": 200000, "SPEAKER ATAS/BUZZER": 200000 } },
        { series: "IP 12 PRO", prices: { "LCD HIGH PREMIUM": 850000, "LCD OLED": 1650000, "BATERAI": 380000, "BATERAI GENUINE": 650000, "KAMERA DEPAN": 450000, "KAMERA BELAKANG": 600000, "FLEX CHARGER": 280000, "FLEX ON/OFF": 220000, "SPEAKER ATAS/BUZZER": 220000 } },
        { series: "IP 12 PRO MAX", prices: { "LCD HIGH PREMIUM": 950000, "LCD OLED": 1850000, "BATERAI": 400000, "BATERAI GENUINE": 700000, "KAMERA DEPAN": 500000, "KAMERA BELAKANG": 700000, "FLEX CHARGER": 300000, "FLEX ON/OFF": 250000, "SPEAKER ATAS/BUZZER": 250000 } },
        { series: "IP 13", prices: { "LCD HIGH PREMIUM": 1100000, "LCD OLED": 2100000, "BATERAI": 450000, "BATERAI GENUINE": 750000, "KAMERA DEPAN": 550000, "KAMERA BELAKANG": 750000, "FLEX CHARGER": 320000, "FLEX ON/OFF": 250000, "SPEAKER ATAS/BUZZER": 250000 } },
        { series: "IP 13 PRO", prices: { "LCD HIGH PREMIUM": 1300000, "LCD OLED": 2600000, "BATERAI": 480000, "BATERAI GENUINE": 800000, "KAMERA DEPAN": 600000, "KAMERA BELAKANG": 850000, "FLEX CHARGER": 350000, "FLEX ON/OFF": 280000, "SPEAKER ATAS/BUZZER": 280000 } },
        { series: "IP 13 PRO MAX", prices: { "LCD HIGH PREMIUM": 1450000, "LCD OLED": 2900000, "BATERAI": 520000, "BATERAI GENUINE": 850000, "KAMERA DEPAN": 650000, "KAMERA BELAKANG": 950000, "FLEX CHARGER": 380000, "FLEX ON/OFF": 280000, "SPEAKER ATAS/BUZZER": 280000 } }
      ]
    };
  },

  savePriceList(priceData) {
    if (priceData && Array.isArray(priceData.headers) && Array.isArray(priceData.rows)) {
      localStorage.setItem(STORAGE_KEYS.PRICELIST, JSON.stringify(priceData));
    }
  },

  /**
   * Logika Pencocokan Harga Jual Otomatis:
   * Pola: [jenis part] [series] - [vendor]
   */
  matchItemPrice(itemName) {
    if (!itemName || !itemName.trim()) {
      return { matchType: 'none', price: 0 };
    }

    // 1. Buang kode vendor setelah " - " (jika ada) dan normalisasi
    let baseText = itemName.split(' - ')[0].trim();
    baseText = baseText.toUpperCase().replace(/\s+/g, ' ');

    const priceList = this.getPriceList();
    if (!priceList || !priceList.rows || priceList.rows.length === 0) {
      return { matchType: 'none', price: 0 };
    }

    // 2. Cari SERIES yang cocok di bagian akhir teks, diurutkan kecocokan terpanjang lebih dulu
    const sortedSeriesList = priceList.rows
      .map(r => r.series.toUpperCase().trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    let matchedSeries = null;
    let partType = '';

    for (const s of sortedSeriesList) {
      // Periksa apakah baseText diakhiri dengan series s (sebagai kata/frasa utuh)
      if (baseText === s) {
        matchedSeries = s;
        partType = '';
        break;
      }
      if (baseText.endsWith(' ' + s)) {
        matchedSeries = s;
        partType = baseText.slice(0, baseText.length - s.length).trim();
        break;
      }
    }

    if (!matchedSeries) {
      return { matchType: 'none', price: 0 };
    }

    // Dapatkan data harga untuk series tersebut
    const seriesRow = priceList.rows.find(r => r.series.toUpperCase().trim() === matchedSeries);
    if (!seriesRow || !seriesRow.prices) {
      return { matchType: 'none', price: 0 };
    }

    // 3. Cocokkan jenis part dengan kolom header
    // Header yang mengandung tanda "/" dianggap memiliki beberapa nama alternatif
    const headers = priceList.headers.slice(1); // Lewati kolom "SERIES"
    const matchingHeaders = [];

    // Prioritas 1: Kecocokan persis
    for (const h of headers) {
      const hNorm = h.toUpperCase().trim();
      const subNames = hNorm.split('/').map(x => x.trim());

      if (hNorm === partType || subNames.includes(partType)) {
        const p = seriesRow.prices[h] || 0;
        if (p > 0) {
          return { matchType: 'exact', price: p, header: h };
        }
      }
    }

    // Prioritas 2: Pencocokan per kata utuh
    // Contoh: "LCD" cocok dengan "LCD HIGH PREMIUM" dan "LCD OLED"
    // "KAMERA" cocok dengan "KAMERA DEPAN" dan "KAMERA BELAKANG"
    // "FLEX" cocok dengan "FLEX CHARGER" dan "FLEX ON/OFF"
    // "BUZZER" cocok dengan "SPEAKER ATAS/BUZZER"
    const partWords = partType.split(' ').filter(Boolean);

    for (const h of headers) {
      const hNorm = h.toUpperCase().trim();
      const subNames = hNorm.split('/').map(x => x.trim());

      let isMatch = false;

      for (const name of subNames) {
        const headerWords = name.split(' ').filter(Boolean);
        // Jika semua kata pada partType ada di dalam header name sebagai kata utuh
        if (partWords.length > 0 && partWords.every(pw => headerWords.includes(pw))) {
          isMatch = true;
          break;
        }
      }

      if (isMatch) {
        const p = seriesRow.prices[h] || 0;
        if (p > 0) {
          // Label chip: singkatkan nama jika diawali jenis part yang sama (misal "LCD HIGH PREMIUM" -> "HIGH PREMIUM")
          let chipLabel = h;
          if (partType && hNorm.startsWith(partType + ' ')) {
            chipLabel = h.slice(partType.length + 1).trim();
          } else if (hNorm.includes('/')) {
            chipLabel = h;
          }
          matchingHeaders.push({
            header: h,
            chipLabel: chipLabel,
            price: p
          });
        }
      }
    }

    if (matchingHeaders.length === 1) {
      return {
        matchType: 'exact',
        price: matchingHeaders[0].price,
        header: matchingHeaders[0].header
      };
    }

    if (matchingHeaders.length > 1) {
      return {
        matchType: 'multiple',
        options: matchingHeaders
      };
    }

    return { matchType: 'none', price: 0 };
  },

  // ==================== TAHAP 3: PETUNJUK MODAL TERAKHIR ====================
  getLastCostForItem(fullItemName) {
    if (!fullItemName || !fullItemName.trim()) return null;
    const targetName = fullItemName.trim().toLowerCase();

    const entries = this.getAllEntries();
    // Cari entri terbaru yang memiliki item dengan nama lengkap persis
    for (const entry of entries) {
      if (Array.isArray(entry.rincian)) {
        for (const item of entry.rincian) {
          if (item.nama && item.nama.trim().toLowerCase() === targetName) {
            const m = Number(item.modal) || 0;
            if (m > 0) return m;
          }
        }
      }
    }
    return null;
  },

  // ==================== TAHAP 4: STOK PART ====================
  getAllStock() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.STOCK);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to read stock from storage', e);
    }
    // Default initial stock items
    const defaults = [
      { id: 'stock_1', namaPart: 'LCD IP 11 - BD', jumlah: 3 },
      { id: 'stock_2', namaPart: 'LCD OLED IP 11 PRO MAX - MC', jumlah: 2 },
      { id: 'stock_3', namaPart: 'BATERAI IP 11 - BD', jumlah: 5 },
      { id: 'stock_4', namaPart: 'FLEX CHARGER IP 12 - BD', jumlah: 4 }
    ];
    this.saveAllStock(defaults);
    return defaults;
  },

  saveAllStock(stockList) {
    localStorage.setItem(STORAGE_KEYS.STOCK, JSON.stringify(stockList));
  },

  getStockById(id) {
    const list = this.getAllStock();
    return list.find(s => String(s.id) === String(id)) || null;
  },

  saveStockItem(item) {
    const list = this.getAllStock();
    const isEdit = Boolean(item.id);
    let saved = null;

    if (isEdit) {
      const idx = list.findIndex(s => String(s.id) === String(item.id));
      if (idx !== -1) {
        saved = {
          ...list[idx],
          namaPart: item.namaPart.trim(),
          jumlah: Math.max(0, parseInt(item.jumlah, 10) || 0)
        };
        list[idx] = saved;
        this.enqueueSync({ action: 'STOCK_SAVE', item: saved });
      }
    } else {
      saved = {
        id: 'stock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        namaPart: item.namaPart.trim(),
        jumlah: Math.max(0, parseInt(item.jumlah, 10) || 0)
      };
      list.push(saved);
      this.enqueueSync({ action: 'STOCK_SAVE', item: saved });
    }

    this.saveAllStock(list);
    return saved;
  },

  deleteStockItem(id) {
    const list = this.getAllStock();
    const filtered = list.filter(s => String(s.id) !== String(id));
    this.saveAllStock(filtered);
    this.enqueueSync({ action: 'STOCK_DELETE', id: id });
    return true;
  },

  updateStockQuantity(id, delta) {
    const list = this.getAllStock();
    const item = list.find(s => String(s.id) === String(id));
    if (!item) return null;

    item.jumlah = Math.max(0, (parseInt(item.jumlah, 10) || 0) + delta);
    this.saveAllStock(list);
    this.enqueueSync({ action: 'STOCK_SAVE', item: item });
    return item;
  },

  // ==================== AUTOCOMPLETE HELPERS ====================
  getAutocompleteSuggestions() {
    const entries = this.getAllEntries();
    const usersSet = new Set();
    const repairsSet = new Set();

    // 1. Dari riwayat transaksi sebelumnya (dengan vendor)
    entries.forEach(e => {
      if (e.namaUser && e.namaUser.trim()) {
        usersSet.add(e.namaUser.trim());
      }
      if (Array.isArray(e.rincian)) {
        e.rincian.forEach(r => {
          if (r.nama && r.nama.trim()) {
            repairsSet.add(r.nama.trim());
          }
        });
      } else if (e.perbaikan) {
        e.perbaikan.split('\n').forEach(line => {
          if (line.trim()) repairsSet.add(line.trim());
        });
      }
    });

    // 2. Dari kombinasi "Jenis Part + Series" pada tab Harga Jual
    const priceList = this.getPriceList();
    if (priceList && Array.isArray(priceList.headers) && Array.isArray(priceList.rows)) {
      const headers = priceList.headers.slice(1);
      priceList.rows.forEach(r => {
        const s = (r.series || '').trim();
        if (s) {
          headers.forEach(h => {
            // Hindari nama alternatif split slash untuk saran
            const firstHeaderPart = h.split('/')[0].trim();
            repairsSet.add(`${firstHeaderPart} ${s}`);
          });
        }
      });
    }

    return {
      users: Array.from(usersSet),
      repairs: Array.from(repairsSet)
    };
  },

  // ==================== DEMO DATA ====================
  loadDemoData() {
    const today = new Date();
    const currentYm = today.toISOString().slice(0, 7);
    const pad = (n) => String(n).padStart(2, '0');

    const demoRecords = [
      {
        id: 'demo_1',
        tanggal: `${currentYm}-${pad(Math.min(today.getDate(), 22))}`,
        cabang: 'Center',
        namaUser: 'Pak Hendra (iPhone 13)',
        rincian: [
          { nama: 'LCD OLED IP 13 - BD', modal: 1200000, hargaJual: 2100000 },
          { nama: 'TEMPERED GLASS IP 13 - VIP', modal: 15000, hargaJual: 50000 }
        ]
      },
      {
        id: 'demo_2',
        tanggal: `${currentYm}-${pad(Math.max(1, today.getDate() - 1))}`,
        cabang: 'Icone',
        namaUser: 'Ibu Ratna (iPhone 11)',
        rincian: [
          { nama: 'BATERAI IP 11 - BD', modal: 150000, hargaJual: 250000 },
          { nama: 'FLEX CHARGER IP 11 - BD', modal: 95000, hargaJual: 180000 }
        ]
      },
      {
        id: 'demo_3',
        tanggal: `${currentYm}-${pad(Math.max(1, today.getDate() - 2))}`,
        cabang: 'Semampir',
        namaUser: 'Mas Dimas (Redmi Note 12)',
        rincian: [
          { nama: 'IC POWER REDMI NOTE 12 - ORI', modal: 120000, hargaJual: 350000 }
        ]
      },
      {
        id: 'demo_4',
        tanggal: `${currentYm}-${pad(Math.max(1, today.getDate() - 3))}`,
        cabang: 'Center',
        namaUser: 'Kevin Pratama (iPhone 11 Pro Max)',
        rincian: [
          { nama: 'LCD OLED IP 11 PRO MAX - MC', modal: 850000, hargaJual: 1300000 },
          { nama: 'BACKGLASS IP 11 PRO MAX - BD', modal: 90000, hargaJual: 280000 }
        ]
      }
    ];

    const processed = demoRecords.map(item => {
      const perbaikan = item.rincian.map(r => r.nama).join('\n');
      const modal = item.rincian.reduce((sum, r) => sum + (Number(r.modal) || 0), 0);
      const hargaJual = item.rincian.reduce((sum, r) => sum + (Number(r.hargaJual) || 0), 0);
      const profit = hargaJual - modal;

      return {
        ...item,
        perbaikan,
        modal,
        hargaJual,
        profit,
        synced: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    });

    this.saveAllEntries(processed);
    return processed;
  },

  clearAllData() {
    localStorage.removeItem(STORAGE_KEYS.ENTRIES);
    localStorage.removeItem(STORAGE_KEYS.SYNC_QUEUE);
    localStorage.removeItem(STORAGE_KEYS.STOCK);
  }
};
