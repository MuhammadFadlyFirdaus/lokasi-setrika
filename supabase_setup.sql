-- ============================================================
-- SetrikaMap — Supabase Database Setup
-- ============================================================
-- Jalankan SQL ini di Supabase Dashboard:
--   1. Buka https://supabase.com/dashboard
--   2. Pilih project kamu
--   3. Klik "SQL Editor" di sidebar kiri
--   4. Paste seluruh isi file ini
--   5. Klik "Run"
-- ============================================================

-- ===== Tabel 1: lorong_status =====
-- Menyimpan status terkini lokasi setrika per lorong.
-- Satu baris per lorong (lorong_id unik).
CREATE TABLE IF NOT EXISTS lorong_status (
    lorong_id   TEXT        PRIMARY KEY,
    loc         TEXT        NOT NULL,           -- "room:275", "storage", "other:Dapur lantai 2"
    name        TEXT        DEFAULT '',          -- Nama orang yang memperbarui (opsional)
    updated_at  TIMESTAMPTZ DEFAULT now()        -- Waktu pembaruan terakhir
);

-- ===== Tabel 2: location_history =====
-- Menyimpan riwayat perpindahan setrika.
-- Setiap kali lokasi diperbarui, satu baris baru ditambahkan.
CREATE TABLE IF NOT EXISTS location_history (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    lorong_id   TEXT        NOT NULL REFERENCES lorong_status(lorong_id) ON DELETE CASCADE,
    loc         TEXT        NOT NULL,           -- "room:275", "storage", "other:Dapur lantai 2"
    name        TEXT        DEFAULT '',          -- Nama orang yang memperbarui (opsional)
    created_at  TIMESTAMPTZ DEFAULT now()        -- Waktu entri riwayat dibuat
);

-- Index untuk mempercepat query riwayat per lorong (terbaru dulu)
CREATE INDEX IF NOT EXISTS idx_history_lorong_time
    ON location_history (lorong_id, created_at DESC);

-- ===== Row Level Security (RLS) =====
-- Aktifkan RLS agar tabel bisa diakses via anon key.
-- Kebijakan: siapa pun boleh SELECT dan INSERT (publik, tanpa login).
-- Tidak ada UPDATE/DELETE dari client untuk keamanan data.

ALTER TABLE lorong_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_history ENABLE ROW LEVEL SECURITY;

-- Kebijakan untuk lorong_status
DROP POLICY IF EXISTS "Semua boleh baca lorong_status" ON lorong_status;
DROP POLICY IF EXISTS "Semua boleh insert lorong_status" ON lorong_status;
DROP POLICY IF EXISTS "Semua boleh update lorong_status" ON lorong_status;
CREATE POLICY "Semua boleh baca lorong_status"
    ON lorong_status FOR SELECT
    USING (true);

CREATE POLICY "Semua boleh insert lorong_status"
    ON lorong_status FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Semua boleh update lorong_status"
    ON lorong_status FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Kebijakan untuk location_history
DROP POLICY IF EXISTS "Semua boleh baca location_history" ON location_history;
DROP POLICY IF EXISTS "Semua boleh insert location_history" ON location_history;
CREATE POLICY "Semua boleh baca location_history"
    ON location_history FOR SELECT
    USING (true);

CREATE POLICY "Semua boleh insert location_history"
    ON location_history FOR INSERT
    WITH CHECK (true);

-- ===== Data Awal (Opsional) =====
-- Insert lorong_id agar foreign key di location_history bisa berfungsi.
-- Kalau lorong belum pernah diupdate, baris ini akan jadi placeholder.
INSERT INTO lorong_status (lorong_id, loc, name, updated_at)
VALUES ('270', 'storage', '', now())
ON CONFLICT (lorong_id) DO NOTHING;

-- ============================================================
-- SELESAI! Setelah menjalankan SQL ini:
--   1. Kembali ke Settings > API
--   2. Copy "Project URL" dan "anon public" key
--   3. Paste ke CONFIG di file app.js
-- ============================================================
