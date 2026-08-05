# Perbaikan Keamanan, Hitung Modal, dan Pengaturan

## 1. Hapus AI-sisten di Ruang Info (owner tenant)
Halaman Info owner hanya menampilkan daftar Kabar (tab dan konten AI dihilangkan). Panel AI di ruang super admin tetap ada seperti sekarang.

## 2. Perbaiki celah keamanan "Users can escalate access"
Saat ini seorang pengguna bisa mengubah `tenant_id`/`tenant_role_id` miliknya sendiri dan masuk ke toko lain. Perbaikan lewat migrasi database:
- Policy update pada `profiles` ditulis ulang dengan `USING` + `WITH CHECK` yang setara.
- Trigger validasi: pengguna biasa tidak boleh mengubah `tenant_id` dan `tenant_role_id` miliknya sendiri; owner boleh mengubah anggota di tokonya sendiri (tidak boleh memindahkan ke toko lain, tidak boleh mengubah dirinya sendiri); super admin bebas.
- Hirarki tetap: Super Admin > Owner Tenant > Anggota.
- Pengelolaan hak akses anggota tetap jalan karena dijalankan lewat fungsi server tepercaya.

## 3. Tools Hitung Modal: ganti saran AI dengan kalkulator margin
- Tombol chat "Saran AI" dan panel markdown-nya dihapus.
- Diganti baris tombol margin: 30% / 40% / 50% / 60% / Custom (isi persen sendiri, mendukung desimal).
- Rumus: Harga jual = HPP / (1 - margin). Contoh margin 40% → harga jual terdiri dari 60% modal + 40% keuntungan.
- Ditampilkan: harga jual (dibulatkan ke kelipatan 500), nominal modal, dan nominal keuntungan.
- Teks edukasi singkat, mis. "Dari harga Rp X, sekitar Rp Y (60%) adalah modal Anda dan Rp Z (40%) adalah keuntungan Anda."
- Nilai ini yang tersimpan sebagai harga jual saran saat resep disimpan.

## 4. Pengaturan Tim
- Daftar anggota tidak lagi menampilkan owner tenant (dan super admin) — hanya anggota.
- Anggota tidak dapat mengubah hak akses/role dirinya sendiri; pengelolaan tim hanya untuk owner.

## 5. Ganti password di Pengaturan
Form baru: password lama, password baru, konfirmasi password baru. Password lama diverifikasi dulu sebelum password diubah; validasi panjang minimal 6 dan kecocokan konfirmasi, dengan notifikasi gaya app.

## 6. Keterangan Lock/Hide tampil di Home owner
Catatan yang diisi super admin (mis. "under maintenance") ditampilkan sebagai badge status terkunci pada kartu terkait di Home owner tenant, dan kartu tidak bisa diklik. Fitur yang di-hide tetap tidak muncul.

## 7. POS: atur qty langsung di kartu/list produk
- Kartu produk yang sudah masuk keranjang menampilkan kontrol −/qty/+ (bukan hanya badge angka).
- List view mendapat kontrol yang sama dan kini juga menampilkan gambar produk.
- Menekan tombol tidak ikut memicu klik kartu; qty 0 menghapus item dari keranjang.

## 8. Notifikasi "Ketuk untuk menyalin URL aplikasi ini"
Manifest disesuaikan (`display_override`, scope & start_url konsisten, `prefer_related_applications: false`) agar aplikasi terinstal dibuka penuh tanpa bilah info URL Chrome. Catatan: bilah ini dikendalikan browser, jadi hasilnya baru terlihat setelah aplikasi dipasang ulang/diperbarui.

## Catatan teknis
- Migrasi SQL: policy `profiles update` + fungsi trigger `prevent_profile_privilege_escalation()`.
- File yang disentuh: `src/routes/_authenticated/info.tsx`, `hpp.tsx`, `pengaturan.tsx`, `home.tsx`, `kasir.tsx`, `src/lib/ai.functions.ts` (hapus fungsi saran harga AI), `public/manifest.webmanifest`.