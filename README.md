# Catatan Servis - PWA Backup Pekerjaan Teknisi HP

Aplikasi web progresif (PWA) responsif untuk mencatat dan membackup pekerjaan teknisi servis HP ke Google Sheets secara otomatis dengan dukungan offline (IndexedDB / LocalStorage queue).

---

## 1. Panduan Update Backend (Code.gs) Tanpa Mengubah URL Web App

Jika Web App Google Apps Script Anda sudah pernah di-deploy sebelumnya dan Anda ingin memperbaruinya dengan kode terbaru dari [`Code.gs`](./Code.gs):

1. Buka spreadsheet Google Sheets Anda, klik **Ekstensi** > **Apps Script**.
2. Salin dan timpa seluruh kode di editor dengan file [`Code.gs`](./Code.gs) terbaru.
3. Klik ikon **Simpan** (`Ctrl + S`).
4. Di pojok kanan atas, klik menu biru **Terapkan (Deploy)** > **Kelola penerapan (Manage deployments)**.
5. Klik ikon **Pensil (Edit)** pada deployment aktif Anda.
6. Pada dropdown **Versi (Version)**, pilih **Versi baru (New version)**.
7. Klik tombol biru **Terapkan (Deploy)**.
8. Selesai! URL Web App Anda **tetap sama persis** sehingga tidak perlu mengubah pengaturan apa pun di web Catatan Servis.

---

## 2. Struktur Data di Google Sheets

### A. Tab Bulanan (Format `YYYY-MM`, contoh: `2026-10`)
Satu baris = Satu pelanggan (satu kasus), kolom:
1. **Tanggal** (Format `YYYY-MM-DD`)
2. **Cabang** (`Center`, `Icone`, `Semampir`)
3. **Nama User**
4. **Perbaikan** (Daftar part/pekerjaan multiline)
5. **Modal** (Rupiah)
6. **Harga Jual** (Rupiah)
7. **Profit** (Rumus otomatis: `=F{row}-E{row}`)
8. **Rincian** *(Disembunyikan)*: JSON rincian tiap item
9. **ID** *(Disembunyikan)*: ID unik entri untuk edit & hapus baris yang akurat

### B. Tab "Harga Jual"
- Baris 1: Header (Kolom A: `SERIES`, Kolom lainnya: jenis part / kualitas seperti `LCD HIGH PREMIUM`, `LCD OLED`, `BATERAI`, `KAMERA DEPAN`, `SPEAKER ATAS/BUZZER`, dll.).
- Baris 2 dst: Seri HP (contoh: `IP 11`, `IP 11 PRO MAX`, `IP 12`, dll.) beserta harga jualnya.
- Angka bisa berformat Rp atau angka murni.
- Web mencocokkan otomatis berdasarkan pola `[jenis part] [series] - [vendor]`.

### C. Tab "Stok Part"
- Kolom A: **Nama Part**
- Kolom B: **Jumlah**
- Kolom C: **ID** *(Disembunyikan)*

---

## 3. Fitur Utama & Panduan Penggunaan

1. **Edit & Hapus Cepat**:
   - Ikon pensil membuka modal yang sudah terisi lengkap per item.
   - Ikon tempat sampah membuka konfirmasi hapus. Setelah dikonfirmasi, entri langsung disembunyikan dan muncul notifikasi bawah dengan tombol **"Urungkan"** selama 6 detik.
   - Pada ponsel (layar HP), geser kartu ke kiri untuk memunculkan tombol merah **Hapus**.
2. **Harga Jual Otomatis**:
   - Mengetik nama item (misal `LCD OLED IP 11 PRO MAX - MC`) akan otomatis mengisi Harga Jual.
   - Jika ada beberapa pilihan kualitas (misal `LCD IP 11 - BD`), muncul tombol chip pilihan kualitas (`HIGH PREMIUM`, `OLED`).
   - Jika part tidak ada di daftar harga (misal Android `LCD OPPO A06 - BD`), harga jual otomatis 0 (tanpa error).
   - Jika harga sudah diedit manual oleh Anda, sistem tidak akan menimpanya lagi.
3. **Petunjuk Modal Terakhir**:
   - Di bawah isian Modal, muncul petunjuk abu-abu `"Modal terakhir: Rp X"` jika nama item lengkap pernah dipakai sebelumnya.
4. **Stok Part**:
   - Tab ketiga menyajikan manajemen stok part dengan tombol stepper cepat `−` dan `+`, pencarian instan, tambah/edit, serta hapus dengan konfirmasi dan fitur Urungkan 6 detik.

---

## 4. Panduan Hosting Gratis (GitHub Pages / Vercel / Netlify)

1. Upload seluruh file proyek ke repositori GitHub.
2. Di GitHub: **Settings** > **Pages** > pilih branch `main`, folder `/ (root)`, lalu klik **Save**.
3. Buka web di Google Chrome ponsel Android dan pasang ke layar utama (**Add to Home screen**) untuk menggunakannya sebagai PWA offline.
