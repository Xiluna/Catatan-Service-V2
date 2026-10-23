/**
 * ============================================================================
 * CATATAN SERVIS - GOOGLE APPS SCRIPT BACKEND (V2)
 * ============================================================================
 * 
 * Backend Web App untuk mencatat dan membackup data teknisi servis HP ke Google Sheets.
 * 
 * FORMAT TAB BULANAN (YYYY-MM):
 * A: Tanggal | B: Cabang | C: Nama User | D: Perbaikan | E: Modal | F: Harga Jual | G: Profit | H: Rincian (Hidden) | I: ID (Hidden)
 * 
 * TAB HARGA JUAL:
 * Baris 1: Header (Kolom A: SERIES, Kolom lain: Jenis Part / Kualitas)
 * 
 * TAB STOK PART:
 * A: Nama Part | B: Jumlah | C: ID (Hidden)
 */

const SECRET_TOKEN = "CATATAN_SERVIS_TOKEN_2026";

/**
 * Handle HTTP GET Request
 */
function doGet(e) {
  const token = (e.parameter && e.parameter.token) || "";
  const action = (e.parameter && e.parameter.action) || "ping";

  if (token !== SECRET_TOKEN) {
    return createJsonResponse({
      status: "error",
      message: "Token rahasia tidak valid atau tidak cocok"
    });
  }

  if (action === "ping") {
    return createJsonResponse({
      status: "success",
      message: "Koneksi Google Apps Script berhasil terhubung!",
      timestamp: new Date().toISOString()
    });
  }

  if (action === "fetchMonth") {
    const yearMonth = e.parameter.month;
    if (!yearMonth) {
      return createJsonResponse({ status: "error", message: "Parameter month dibutuhkan (format YYYY-MM)" });
    }
    const data = getEntriesFromSheet(yearMonth);
    return createJsonResponse({ status: "success", data: data });
  }

  if (action === "fetchPriceList") {
    const priceData = getOrCreatePriceListSheet();
    return createJsonResponse({ status: "success", data: priceData });
  }

  if (action === "fetchStock") {
    const stockData = getStockFromSheet();
    return createJsonResponse({ status: "success", data: stockData });
  }

  return createJsonResponse({ status: "error", message: "Aksi tidak dikenali" });
}

/**
 * Handle HTTP POST Request
 */
function doPost(e) {
  try {
    let payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter || {};
    }

    if (payload.token !== SECRET_TOKEN) {
      return createJsonResponse({
        status: "error",
        message: "Token rahasia tidak valid atau tidak cocok"
      });
    }

    const action = payload.action;

    // Ping / Test
    if (action === "ping" || action === "test") {
      return createJsonResponse({
        status: "success",
        message: "Koneksi ke Google Sheets berhasil & token cocok!"
      });
    }

    // Entri Servis: Simpan / Update
    if (action === "saveEntry") {
      const result = saveOrUpdateEntry(payload.entry);
      return createJsonResponse({
        status: "success",
        message: "Entri berhasil disimpan ke Google Sheets",
        data: result
      });
    }

    // Entri Servis: Hapus
    if (action === "deleteEntry") {
      const deleted = deleteEntryFromSheet(payload.id, payload.tanggal);
      if (deleted) {
        return createJsonResponse({
          status: "success",
          message: "Entri berhasil dihapus dari Google Sheets",
          id: payload.id
        });
      } else {
        return createJsonResponse({
          status: "error",
          message: "Entri dengan ID tersebut tidak ditemukan di sheet"
        });
      }
    }

    // Fetch Daftar Harga Jual
    if (action === "fetchPriceList") {
      const priceData = getOrCreatePriceListSheet();
      return createJsonResponse({ status: "success", data: priceData });
    }

    // Stok Part: Fetch
    if (action === "fetchStock") {
      const stockData = getStockFromSheet();
      return createJsonResponse({ status: "success", data: stockData });
    }

    // Stok Part: Simpan / Update
    if (action === "saveStock") {
      const result = saveOrUpdateStock(payload.item);
      return createJsonResponse({
        status: "success",
        message: "Stok part berhasil disimpan",
        data: result
      });
    }

    // Stok Part: Hapus
    if (action === "deleteStock") {
      const deleted = deleteStockFromSheet(payload.id);
      return createJsonResponse({
        status: deleted ? "success" : "error",
        message: deleted ? "Stok part berhasil dihapus" : "Item stok tidak ditemukan"
      });
    }

    // Batch Sync dari antrean offline
    if (action === "syncBatch") {
      const items = payload.items || [];
      const results = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          if (item.action === "CREATE" || item.action === "UPDATE") {
            saveOrUpdateEntry(item.entry);
            results.push({ id: item.entry ? item.entry.id : null, status: "success" });
          } else if (item.action === "DELETE") {
            deleteEntryFromSheet(item.id, item.tanggal);
            results.push({ id: item.id, status: "success" });
          } else if (item.action === "STOCK_SAVE") {
            saveOrUpdateStock(item.item);
            results.push({ id: item.item ? item.item.id : null, status: "success" });
          } else if (item.action === "STOCK_DELETE") {
            deleteStockFromSheet(item.id);
            results.push({ id: item.id, status: "success" });
          }
        } catch (err) {
          results.push({ id: item.id || (item.entry && item.entry.id), status: "error", error: err.toString() });
        }
      }

      return createJsonResponse({
        status: "success",
        message: "Sinkronisasi antrean berhasil diproses",
        processed: results.length,
        results: results
      });
    }

    return createJsonResponse({
      status: "error",
      message: "Aksi '" + action + "' tidak dikenali"
    });

  } catch (err) {
    return createJsonResponse({
      status: "error",
      message: "Terjadi kesalahan server: " + err.toString()
    });
  }
}

/**
 * ============================================================================
 * MODUL TAB BULANAN (ENTRI SERVIS)
 * ============================================================================
 */

function getOrCreateMonthSheet(yearMonth) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(yearMonth);

  if (!sheet) {
    sheet = ss.insertSheet(yearMonth);

    const headers = [
      "Tanggal",
      "Cabang",
      "Nama User",
      "Perbaikan",
      "Modal",
      "Harga Jual",
      "Profit",
      "Rincian",
      "ID"
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0068B5");
    headerRange.setFontColor("#FFFFFF");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 36);

    sheet.setColumnWidth(1, 110); // Tanggal
    sheet.setColumnWidth(2, 100); // Cabang
    sheet.setColumnWidth(3, 180); // Nama User
    sheet.setColumnWidth(4, 280); // Perbaikan
    sheet.setColumnWidth(5, 120); // Modal
    sheet.setColumnWidth(6, 120); // Harga Jual
    sheet.setColumnWidth(7, 120); // Profit
    sheet.setColumnWidth(8, 50);  // Rincian (Hidden)
    sheet.setColumnWidth(9, 50);  // ID (Hidden)

    sheet.hideColumns(8, 2);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function saveOrUpdateEntry(entry) {
  if (!entry || !entry.tanggal) {
    throw new Error("Data entri tidak lengkap (tanggal wajib ada)");
  }

  const yearMonth = entry.tanggal.substring(0, 7);
  const sheet = getOrCreateMonthSheet(yearMonth);
  const data = sheet.getDataRange().getValues();

  let targetRow = -1;
  const entryId = entry.id || ("entry_" + Utilities.getUuid());

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][8]) === String(entryId)) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    targetRow = sheet.getLastRow() + 1;
  }

  const modalVal = Number(entry.modal) || 0;
  const jualVal = Number(entry.hargaJual) || 0;
  const rincianJson = typeof entry.rincian === "string" ? entry.rincian : JSON.stringify(entry.rincian || []);
  const profitFormula = "=F" + targetRow + "-E" + targetRow;

  const rowData = [
    entry.tanggal,
    entry.cabang,
    entry.namaUser,
    entry.perbaikan,
    modalVal,
    jualVal,
    profitFormula,
    rincianJson,
    entryId
  ];

  sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);

  sheet.getRange(targetRow, 5, 1, 3).setNumberFormat('"Rp"#,##0');
  sheet.getRange(targetRow, 1, 1, 2).setHorizontalAlignment("center");
  sheet.getRange(targetRow, 4).setWrap(true);

  sheet.hideColumns(8, 2);

  return { row: targetRow, id: entryId };
}

function deleteEntryFromSheet(entryId, tanggal) {
  if (!entryId) return false;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (tanggal && tanggal.length >= 7) {
    const yearMonth = tanggal.substring(0, 7);
    const sheet = ss.getSheetByName(yearMonth);
    if (sheet && deleteFromSpecificSheet(sheet, entryId)) {
      return true;
    }
  }

  const sheets = ss.getSheets();
  for (let s = 0; s < sheets.length; s++) {
    const name = sheets[s].getName();
    if (/^\d{4}-\d{2}$/.test(name)) {
      if (deleteFromSpecificSheet(sheets[s], entryId)) {
        return true;
      }
    }
  }

  return false;
}

function deleteFromSpecificSheet(sheet, entryId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][8]) === String(entryId)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function getEntriesFromSheet(yearMonth) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(yearMonth);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const entries = [];
  let sheetModified = false;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;

    let parsedRincian = [];
    try {
      if (row[7]) parsedRincian = JSON.parse(row[7]);
    } catch (e) {
      parsedRincian = [];
    }

    let dateStr = row[0];
    if (dateStr instanceof Date) {
      dateStr = Utilities.formatDate(dateStr, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }

    let entryId = row[8] ? String(row[8]).trim() : "";
    if (!entryId) {
      entryId = "entry_" + Utilities.getUuid();
      sheet.getRange(i + 1, 9).setValue(entryId);
      sheetModified = true;
    }

    entries.push({
      tanggal: String(dateStr),
      cabang: String(row[1] || ""),
      namaUser: String(row[2] || ""),
      perbaikan: String(row[3] || ""),
      modal: Number(row[4]) || 0,
      hargaJual: Number(row[5]) || 0,
      profit: Number(row[6]) || (Number(row[5]) - Number(row[4])),
      rincian: parsedRincian,
      id: entryId
    });
  }

  if (sheetModified) {
    sheet.hideColumns(8, 2);
  }

  return entries;
}

/**
 * ============================================================================
 * MODUL TAB "HARGA JUAL"
 * ============================================================================
 */

function getOrCreatePriceListSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Harga Jual");

  if (!sheet) {
    sheet = ss.insertSheet("Harga Jual");

    const headers = [
      "SERIES", "LCD HIGH PREMIUM", "LCD OLED", "BATERAI", "BATERAI GENUINE",
      "KAMERA DEPAN", "KAMERA BELAKANG", "KACA KAMERA", "BACKGLASS", "HOUSING",
      "FLEX CHARGER", "ANTENA WIFI", "FACE ID", "FLEX ON/OFF", "TAPTIC VIBRANCE",
      "SPEAKER ATAS/BUZZER", "HOME BUTTON", "KONSLET", "IC", "LOGIC BOARD"
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0068B5");
    headerRange.setFontColor("#FFFFFF");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 36);

    const sampleSeries = [
      ["IP 11", "550000", "850000", "250000", "450000", "300000", "400000", "120000", "200000", "350000", "180000", "150000", "350000", "150000", "150000", "150000", "150000", "300000", "450000", "650000"],
      ["IP 11 PRO", "650000", "1100000", "280000", "500000", "350000", "450000", "150000", "250000", "400000", "200000", "180000", "400000", "180000", "180000", "180000", "", "350000", "550000", "800000"],
      ["IP 11 PRO MAX", "700000", "1300000", "300000", "550000", "380000", "500000", "150000", "280000", "450000", "220000", "180000", "450000", "180000", "180000", "180000", "", "350000", "600000", "900000"],
      ["IP 12", "800000", "1500000", "350000", "600000", "400000", "550000", "180000", "300000", "500000", "250000", "200000", "500000", "200000", "200000", "200000", "", "400000", "700000", "1000000"],
      ["IP 12 PRO", "850000", "1650000", "380000", "650000", "450000", "600000", "180000", "320000", "550000", "280000", "220000", "550000", "220000", "220000", "220000", "", "450000", "750000", "1100000"],
      ["IP 12 PRO MAX", "950000", "1850000", "400000", "700000", "500000", "700000", "200000", "350000", "600000", "300000", "250000", "600000", "250000", "250000", "250000", "", "500000", "850000", "1250000"],
      ["IP 13", "1100000", "2100000", "450000", "750000", "550000", "750000", "220000", "380000", "650000", "320000", "250000", "650000", "250000", "250000", "250000", "", "550000", "900000", "1350000"],
      ["IP 13 PRO", "1300000", "2600000", "480000", "800000", "600000", "850000", "250000", "420000", "750000", "350000", "280000", "750000", "280000", "280000", "280000", "", "600000", "1050000", "1500000"],
      ["IP 13 PRO MAX", "1450000", "2900000", "520000", "850000", "650000", "950000", "250000", "450000", "800000", "380000", "280000", "800000", "280000", "280000", "280000", "", "650000", "1200000", "1700000"]
    ];

    sheet.getRange(2, 1, sampleSeries.length, headers.length).setValues(sampleSeries);
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
  }

  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return { headers: [], rows: [] };

  const rawHeaders = data[0];
  const headers = [];
  for (let c = 0; c < rawHeaders.length; c++) {
    headers.push(String(rawHeaders[c] || "").trim());
  }

  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const series = String(row[0] || "").trim();
    if (!series) continue;

    const prices = {};
    for (let c = 1; c < headers.length; c++) {
      const headerName = headers[c];
      const rawVal = row[c];
      const cleanNum = parsePriceNumber(rawVal);
      if (cleanNum > 0) {
        prices[headerName] = cleanNum;
      }
    }

    rows.push({
      series: series,
      prices: prices
    });
  }

  return { headers: headers, rows: rows };
}

function parsePriceNumber(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const str = String(val).replace(/Rp/gi, "").replace(/[,\.\s]/g, "");
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * ============================================================================
 * MODUL TAB "STOK PART"
 * ============================================================================
 */

function getOrCreateStockSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Stok Part");

  if (!sheet) {
    sheet = ss.insertSheet("Stok Part");

    const headers = ["Nama Part", "Jumlah", "ID"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0068B5");
    headerRange.setFontColor("#FFFFFF");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 36);

    sheet.setColumnWidth(1, 280);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 50);

    sheet.hideColumns(3, 1);
    sheet.setFrozenRows(1);

    const sampleStock = [
      ["LCD IP 11 - BD", 3, "stock_" + Utilities.getUuid()],
      ["LCD OLED IP 11 PRO MAX - MC", 2, "stock_" + Utilities.getUuid()],
      ["BATERAI IP 11 - BD", 5, "stock_" + Utilities.getUuid()],
      ["FLEX CHARGER IP 12 - BD", 4, "stock_" + Utilities.getUuid()]
    ];
    sheet.getRange(2, 1, sampleStock.length, 3).setValues(sampleStock);
  }

  return sheet;
}

function getStockFromSheet() {
  const sheet = getOrCreateStockSheet();
  const data = sheet.getDataRange().getValues();
  const stockItems = [];
  let modified = false;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const namaPart = String(row[0] || "").trim();
    if (!namaPart) continue;

    let id = row[2] ? String(row[2]).trim() : "";
    if (!id) {
      id = "stock_" + Utilities.getUuid();
      sheet.getRange(i + 1, 3).setValue(id);
      modified = true;
    }

    const jumlah = Math.max(0, parseInt(row[1], 10) || 0);

    stockItems.push({
      id: id,
      namaPart: namaPart,
      jumlah: jumlah
    });
  }

  if (modified) {
    sheet.hideColumns(3, 1);
  }

  return stockItems;
}

function saveOrUpdateStock(item) {
  if (!item || !item.namaPart) {
    throw new Error("Nama part wajib diisi");
  }

  const sheet = getOrCreateStockSheet();
  const data = sheet.getDataRange().getValues();
  const id = item.id || ("stock_" + Utilities.getUuid());
  const jumlah = Math.max(0, parseInt(item.jumlah, 10) || 0);

  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(id)) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    targetRow = sheet.getLastRow() + 1;
  }

  const rowData = [item.namaPart.trim(), jumlah, id];
  sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
  sheet.getRange(targetRow, 2).setHorizontalAlignment("center");
  sheet.hideColumns(3, 1);

  return { row: targetRow, id: id, namaPart: item.namaPart, jumlah: jumlah };
}

function deleteStockFromSheet(id) {
  if (!id) return false;
  const sheet = getOrCreateStockSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(id)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

/**
 * Helper JSON Response
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
