-- ============================================================
-- SetrikaMap — Supabase Database Setup (v2.1 + Antrian)
-- ============================================================
-- PERUBAHAN v2.1:
--   - Tambah sequence iron_queue_number_seq untuk queue_number atomic
--   - Tambah index idx_queue_session_lorong untuk cek duplikat lebih cepat
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

-- ===== Tabel 3: iron_session =====
-- Satu baris per lorong; menyimpan siapa yang sedang memakai setrika.
-- session_id diisi oleh client (UUID acak yang dibuat di browser, disimpan di localStorage).
-- Sesi otomatis dianggap hangus setelah 15 menit dari session_start.
CREATE TABLE IF NOT EXISTS iron_session (
    lorong_id       TEXT        PRIMARY KEY REFERENCES lorong_status(lorong_id) ON DELETE CASCADE,
    session_id      TEXT        NOT NULL,       -- UUID client, untuk validasi "pemilik sesi"
    user_name       TEXT        DEFAULT '',     -- Nama pengguna yang sedang memakai
    session_start   TIMESTAMPTZ DEFAULT now(),  -- Kapan sesi dimulai
    session_end_at  TIMESTAMPTZ,                -- Kapan sesi berakhir (null = masih aktif)
    ended_by        TEXT        DEFAULT ''      -- "user", "timeout", "system"
);

-- ===== Sequence untuk nomor antrean atomic =====
-- Menggunakan PostgreSQL sequence agar dua pengguna yang mendaftar
-- hampir bersamaan tetap mendapatkan queue_number yang berbeda dan unik.
CREATE SEQUENCE IF NOT EXISTS iron_queue_number_seq START 1;

-- ===== Tabel 4: iron_queue =====
-- Antrian penggunaan setrika per lorong. FIFO berdasarkan joined_at.
-- status: 'waiting' | 'ready' | 'cancelled' | 'done'
--   - waiting  : sedang menunggu giliran
--   - ready    : giliran sudah tiba, menunggu konfirmasi (maks 2 menit)
--   - cancelled: dibatalkan sendiri atau timeout konfirmasi
--   - done     : sudah selesai menggunakan atau dilewati
CREATE TABLE IF NOT EXISTS iron_queue (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    lorong_id       TEXT        NOT NULL REFERENCES lorong_status(lorong_id) ON DELETE CASCADE,
    session_id      TEXT        NOT NULL,       -- UUID client (sama dengan iron_session)
    user_name       TEXT        NOT NULL DEFAULT '',
    status          TEXT        NOT NULL DEFAULT 'waiting'
                                CHECK (status IN ('waiting','ready','cancelled','done')),
    joined_at       TIMESTAMPTZ DEFAULT now(),  -- Waktu daftar (untuk urutan FIFO)
    ready_at        TIMESTAMPTZ,                -- Kapan statusnya berubah jadi "ready"
    -- queue_number menggunakan sequence PostgreSQL agar atomic dan tidak race condition
    queue_number    INTEGER     NOT NULL DEFAULT nextval('iron_queue_number_seq')
);

-- Index untuk query antrian aktif per lorong (FIFO, urutkan berdasarkan queue_number)
CREATE INDEX IF NOT EXISTS idx_queue_lorong_active
    ON iron_queue (lorong_id, queue_number)
    WHERE status IN ('waiting', 'ready');

-- Index tambahan untuk cek duplikat session_id per lorong
CREATE INDEX IF NOT EXISTS idx_queue_session_lorong
    ON iron_queue (lorong_id, session_id)
    WHERE status IN ('waiting', 'ready');

-- ===== Row Level Security (RLS) =====
ALTER TABLE lorong_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE iron_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE iron_queue ENABLE ROW LEVEL SECURITY;

-- ========== Kebijakan lorong_status ==========
DROP POLICY IF EXISTS "Semua boleh baca lorong_status" ON lorong_status;
DROP POLICY IF EXISTS "Semua boleh insert lorong_status" ON lorong_status;
DROP POLICY IF EXISTS "Semua boleh update lorong_status" ON lorong_status;
CREATE POLICY "Semua boleh baca lorong_status"
    ON lorong_status FOR SELECT USING (true);
CREATE POLICY "Semua boleh insert lorong_status"
    ON lorong_status FOR INSERT WITH CHECK (true);
CREATE POLICY "Semua boleh update lorong_status"
    ON lorong_status FOR UPDATE USING (true) WITH CHECK (true);

-- ========== Kebijakan location_history ==========
DROP POLICY IF EXISTS "Semua boleh baca location_history" ON location_history;
DROP POLICY IF EXISTS "Semua boleh insert location_history" ON location_history;
CREATE POLICY "Semua boleh baca location_history"
    ON location_history FOR SELECT USING (true);
CREATE POLICY "Semua boleh insert location_history"
    ON location_history FOR INSERT WITH CHECK (true);

-- ========== Kebijakan iron_session ==========
DROP POLICY IF EXISTS "Semua boleh baca iron_session" ON iron_session;
DROP POLICY IF EXISTS "Semua boleh insert iron_session" ON iron_session;
DROP POLICY IF EXISTS "Semua boleh update iron_session" ON iron_session;
DROP POLICY IF EXISTS "Semua boleh delete iron_session" ON iron_session;
CREATE POLICY "Semua boleh baca iron_session"
    ON iron_session FOR SELECT USING (true);
CREATE POLICY "Semua boleh insert iron_session"
    ON iron_session FOR INSERT WITH CHECK (true);
CREATE POLICY "Semua boleh update iron_session"
    ON iron_session FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Semua boleh delete iron_session"
    ON iron_session FOR DELETE USING (true);

-- ========== Kebijakan iron_queue ==========
DROP POLICY IF EXISTS "Semua boleh baca iron_queue" ON iron_queue;
DROP POLICY IF EXISTS "Semua boleh insert iron_queue" ON iron_queue;
DROP POLICY IF EXISTS "Semua boleh update iron_queue" ON iron_queue;
CREATE POLICY "Semua boleh baca iron_queue"
    ON iron_queue FOR SELECT USING (true);
CREATE POLICY "Semua boleh insert iron_queue"
    ON iron_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Semua boleh update iron_queue"
    ON iron_queue FOR UPDATE USING (true) WITH CHECK (true);

-- ===== Data Awal (Opsional) =====
INSERT INTO lorong_status (lorong_id, loc, name, updated_at)
VALUES ('270', 'storage', '', now())
ON CONFLICT (lorong_id) DO NOTHING;

-- ============================================================
-- SELESAI! Setelah menjalankan SQL ini:
--   1. Kembali ke Settings > API
--   2. Copy "Project URL" dan "anon public" key
--   3. Paste ke CONFIG di file app.js (jika belum)
-- ============================================================
