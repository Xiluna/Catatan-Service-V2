/**
 * sync.js - Offline Queue, Google Apps Script Cloud Sync, Price List & Stock Fetcher
 */

const SyncManager = {
  isSyncing: false,

  init() {
    this.updateIndicator();

    window.addEventListener('online', () => {
      this.updateIndicator();
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      this.updateIndicator();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('Service Worker registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('Service Worker registration failed:', err);
        });
    }

    if (navigator.onLine) {
      setTimeout(() => this.triggerSync(), 1500);
    }
  },

  updateIndicator() {
    const indicator = document.getElementById('syncIndicator');
    const textEl = document.getElementById('syncText');
    if (!indicator || !textEl) return;

    const queue = StorageService.getSyncQueue();
    const isOnline = navigator.onLine;

    indicator.classList.remove('syncing', 'offline', 'error');

    if (this.isSyncing) {
      indicator.classList.add('syncing');
      textEl.textContent = 'Menyinkronkan...';
      return;
    }

    if (!isOnline) {
      indicator.classList.add('offline');
      if (queue.length > 0) {
        textEl.textContent = `Belum terkirim (${queue.length})`;
      } else {
        textEl.textContent = 'Mode Offline';
      }
      return;
    }

    if (queue.length > 0) {
      indicator.classList.add('offline');
      textEl.textContent = `Belum terkirim (${queue.length})`;
    } else {
      textEl.textContent = 'Tersinkron';
    }
  },

  async testConnection(url, token) {
    if (!url) {
      return { success: false, message: 'URL Web App belum diisi' };
    }
    if (!token) {
      return { success: false, message: 'Token rahasia belum diisi' };
    }

    try {
      const payload = {
        action: 'ping',
        token: token
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        return { success: false, message: `Server merespon HTTP ${response.status}` };
      }

      const result = await response.json();
      if (result.status === 'success') {
        // Sekaligus coba muat daftar harga & stok di latar belakang
        this.fetchPriceList(url, token);
        this.fetchStock(url, token);
        return { success: true, message: result.message || 'Koneksi berhasil dan token valid!' };
      } else {
        return { success: false, message: result.message || 'Gagal: token salah' };
      }
    } catch (err) {
      return { success: false, message: 'Koneksi gagal: ' + err.message };
    }
  },

  async fetchPriceList(urlOverride, tokenOverride) {
    const settings = StorageService.getSettings();
    const url = urlOverride || settings.appScriptUrl;
    const token = tokenOverride || settings.securityToken;

    if (!url || !token || !navigator.onLine) return null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'fetchPriceList', token: token })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.status === 'success' && result.data) {
        StorageService.savePriceList(result.data);
        console.log('Price list loaded from Google Sheets:', result.data);
        return result.data;
      }
    } catch (e) {
      console.warn('Failed to fetch price list from Google Sheets:', e);
    }
    return null;
  },

  async fetchStock(urlOverride, tokenOverride) {
    const settings = StorageService.getSettings();
    const url = urlOverride || settings.appScriptUrl;
    const token = tokenOverride || settings.securityToken;

    if (!url || !token || !navigator.onLine) return null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'fetchStock', token: token })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.status === 'success' && Array.isArray(result.data)) {
        StorageService.saveAllStock(result.data);
        console.log('Stock items loaded from Google Sheets:', result.data);
        return result.data;
      }
    } catch (e) {
      console.warn('Failed to fetch stock from Google Sheets:', e);
    }
    return null;
  },

  async triggerSync() {
    if (this.isSyncing || !navigator.onLine) return;

    const settings = StorageService.getSettings();
    if (!settings.appScriptUrl || !settings.securityToken) {
      this.updateIndicator();
      return;
    }

    const queue = StorageService.getSyncQueue();
    if (queue.length === 0) {
      this.updateIndicator();
      return;
    }

    this.isSyncing = true;
    this.updateIndicator();

    try {
      const payload = {
        action: 'syncBatch',
        token: settings.securityToken,
        items: queue
      };

      const response = await fetch(settings.appScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'success') {
        StorageService.clearSyncQueue();
        const all = StorageService.getAllEntries();
        all.forEach(e => { e.synced = true; });
        StorageService.saveAllEntries(all);
        console.log('Sync batch successful:', result);
      } else {
        console.warn('Sync server returned error:', result.message);
        if (window.showToast) {
          window.showToast('Gagal sinkronisasi ke Sheets: ' + result.message, 'error');
        }
      }
    } catch (err) {
      console.warn('Sync request failed, will retry later:', err);
      if (window.showToast && !navigator.onLine) {
        window.showToast('Koneksi terputus, entri disimpan di antrean offline', 'info');
      } else if (window.showToast) {
        window.showToast('Gagal terhubung ke Google Sheets: ' + err.message, 'error');
      }
    } finally {
      this.isSyncing = false;
      this.updateIndicator();
    }
  }
};

window.SyncManager = SyncManager;
