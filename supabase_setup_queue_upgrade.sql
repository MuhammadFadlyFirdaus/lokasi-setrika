-- ============================================================
-- SetrikaMap — Upgrade Script: Queue Number Sequence (v2.1)
-- ============================================================
-- Jalankan SQL ini SETELAH supabase_setup.sql jika tabel sudah dibuat.
-- Ini menambahkan sequence PostgreSQL agar queue_number tidak race condition.
--
-- Jika kamu setup dari awal, cukup jalankan supabase_setup.sql yang sudah
-- diperbarui (supabase_setup.sql v2.1) — sudah termasuk perubahan ini.
-- ============================================================

-- Buat sequence untuk queue_number agar atomic
CREATE SEQUENCE IF NOT EXISTS iron_queue_number_seq START 1;

-- Ubah kolom queue_number agar menggunakan sequence sebagai default
ALTER TABLE iron_queue
    ALTER COLUMN queue_number SET DEFAULT nextval('iron_queue_number_seq');

-- Atur nilai sequence ke max yang sudah ada + 1 (jika sudah ada data)
SELECT setval('iron_queue_number_seq', COALESCE(MAX(queue_number), 0) + 1, false)
FROM iron_queue;

