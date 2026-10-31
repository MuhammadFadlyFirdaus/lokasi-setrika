"use strict";

/* ===== Konfigurasi ===== */
const CONFIG = {
    SUPABASE_URL: "https://mdkxgvlbbwsucziujfmn.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka3hndmxiYndzdWN6aXVqZm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1ODQ0MzMsImV4cCI6MjEwODE2MDQzM30.Ovx6Vsm5PLKMOtoglhUyE5CcHVD-V4x7kHgT_l5sBLU",
    FRESH_MINUTES: 60,
    STALE_HOURS: 3,
    POLL_MS: 5000,
    HISTORY_MAX: 20,
    HISTORY_SHOWN: 6,
    SESSION_MINUTES: 15,
    CONFIRM_MINUTES: 2,
    LORONG: [
        {
            id: "270",
            name: "Lorong 270-280",
            storage: "Tempat penyimpanan",
            left: [["280", "SR 280"], ["278", "278"], ["276", "276"], ["274", "274"], null, ["270", "270"]],
            right: [["279", "279"], ["277", "277"], ["275", "275"], ["273", "273"], ["272", "272"], ["271", "271"]]
        }
    ]
};

/* ===== Suara & Notifikasi Giliran ===== */
function playTurnSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        
        // Pola melodi 3 nada ceria: C5 -> E5 -> G5
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, now + idx * 0.16);
            gain.gain.setValueAtTime(0, now + idx * 0.16);
            gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.16 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.16 + 0.28);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + idx * 0.16);
            osc.stop(now + idx * 0.16 + 0.3);
        });
    } catch (e) { }
}

function notifyTurn(title, body) {
    playTurnSound();
    if ("Notification" in window && Notification.permission === "granted") {
        try {
            new Notification(title, {
                body,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ff7a3d" d="M2 20v-1.6L5.4 10.5h9.1c2.9 0 5.4 1.8 6.5 4.5l1.4 3.4c.4 1-.3 1.6-1.2 1.6zM9.3 14.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 1 0 0-2.2z"/></svg>'
            });
        } catch (e) { }
    }
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        try { Notification.requestPermission(); } catch (e) { }
    }
}
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clock(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, "0") + "." + String(d.getMinutes()).padStart(2, "0");
}
function sameDay(a, b) { return new Date(a).toDateString() === new Date(b).toDateString(); }
function absTime(ts) {
    if (sameDay(ts, Date.now())) return clock(ts);
    const d = new Date(ts);
    return d.getDate() + " " + MONTHS[d.getMonth()] + ", " + clock(ts);
}
function dayLabel(ts) {
    const now = Date.now();
    if (sameDay(ts, now)) return "Hari ini";
    if (sameDay(ts, now - 86400000)) return "Kemarin";
    const d = new Date(ts);
    return d.getDate() + " " + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
}
function relTime(ts, now = Date.now()) {
    const m = Math.floor((now - ts) / 60000);
    if (m < 1) return "baru saja";
    if (m < 60) return m + " menit lalu";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " jam lalu";
    return Math.floor(h / 24) + " hari lalu";
}
function freshness(ts, now = Date.now()) {
    const age = now - ts;
    if (age < CONFIG.FRESH_MINUTES * 60000) return "fresh";
    if (age < CONFIG.STALE_HOURS * 3600000) return "recent";
    return "stale";
}
function fmtCountdown(ms) {
    if (ms <= 0) return "0:00";
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m + ":" + String(s).padStart(2, "0");
}

/* ===== Lokasi ===== */
const curL = () => CONFIG.LORONG.find(l => l.id === cur);
const roomsOf = L => [...L.left, ...L.right].filter(Boolean).map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.id.localeCompare(b.id, "id", { numeric: true }));
function parseLoc(s) {
    if (!s) return null;
    if (s === "storage") return { kind: "storage" };
    const i = s.indexOf(":");
    return i < 0 ? null : { kind: s.slice(0, i), value: s.slice(i + 1) };
}
function locText(s, L) {
    const p = parseLoc(s);
    if (!p) return "Belum diketahui";
    if (p.kind === "storage") return L.storage;
    if (p.kind === "room") {
        const r = roomsOf(L).find(x => x.id === p.value);
        return "Kamar " + (r ? r.label : p.value);
    }
    return p.value;
}
function matchRoom(L, text) {
    const t = text.toLowerCase().replace(/^kamar\s*/, "").replace(/\s+/g, "");
    return roomsOf(L).find(r => r.id.toLowerCase() === t || r.label.toLowerCase().replace(/\s+/g, "") === t) || null;
}

function norm(d) {
    d = d || {};
    const conv = x => x.loc || (x.room ? "room:" + x.room : "storage");
    let hist = Array.isArray(d.history) ? d.history : Object.values(d.history || {});
    hist = hist.filter(h => h && h.at).map(h => ({ loc: conv(h), name: h.name || h.holder || "", at: h.at }))
        .sort((a, b) => b.at - a.at);
    const loc = d.loc || (d.room ? "room:" + d.room : (d.at ? "storage" : null));
    return { loc, name: d.name || d.holder || "", at: d.at || null, history: hist };
}

/* ===== ID Sesi Client ===== */
function getClientSessionId() {
    let id = localStorage.getItem("setrikamap.session_id");
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() :
            ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
        localStorage.setItem("setrikamap.session_id", id);
    }
    return id;
}
const CLIENT_SESSION_ID = getClientSessionId();

/* ===== Supabase Client ===== */
const SUPA_URL = (CONFIG.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPA_KEY = CONFIG.SUPABASE_ANON_KEY || "";

const supaRest = {
    headers() {
        return {
            "apikey": SUPA_KEY,
            "Authorization": "Bearer " + SUPA_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        };
    },
    async get(table, params = "") {
        const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { headers: this.headers(), cache: "no-store" });
        if (!r.ok) throw new Error("Supabase GET " + r.status);
        return r.json();
    },
    async upsert(table, data) {
        const h = this.headers();
        h["Prefer"] = "return=representation,resolution=merge-duplicates";
        const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, { method: "POST", headers: h, body: JSON.stringify(data) });
        if (!r.ok) throw new Error("Supabase UPSERT " + r.status);
        return r.json();
    },
    async insert(table, data) {
        const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, { method: "POST", headers: this.headers(), body: JSON.stringify(data) });
        if (!r.ok) throw new Error("Supabase INSERT " + r.status);
        return r.json();
    },
    async patch(table, match, data) {
        const params = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join("&");
        const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { method: "PATCH", headers: this.headers(), body: JSON.stringify(data) });
        if (!r.ok) throw new Error("Supabase PATCH " + r.status);
        return r.json();
    },
    async del(table, match) {
        const params = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join("&");
        const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { method: "DELETE", headers: this.headers() });
        if (!r.ok) throw new Error("Supabase DELETE " + r.status);
        return true;
    }
};

/* ===== Penyimpanan Lokasi ===== */
const CLOUD = !!(SUPA_URL && SUPA_KEY);

const Store = {
    mode: CLOUD ? "cloud" : "local",
    async load(id) {
        if (CLOUD) {
            const statusRows = await supaRest.get("lorong_status", `lorong_id=eq.${encodeURIComponent(id)}&select=*`);
            const status = statusRows[0] || null;
            const histRows = await supaRest.get("location_history",
                `lorong_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=${CONFIG.HISTORY_MAX}`);
            const history = histRows.map(h => ({ loc: h.loc, name: h.name || "", at: new Date(h.created_at).getTime() }));
            return {
                loc: status ? status.loc : null,
                name: status ? (status.name || "") : "",
                at: status ? new Date(status.updated_at).getTime() : null,
                history
            };
        }
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem("setrikamap.v2." + id)); } catch (e) { raw = null; }
        return norm(raw);
    },
    async save(id, data) {
        if (CLOUD) {
            const now = new Date().toISOString();
            await supaRest.upsert("lorong_status", { lorong_id: id, loc: data.loc, name: data.name || "", updated_at: now });
            await supaRest.insert("location_history", { lorong_id: id, loc: data.loc, name: data.name || "", created_at: now });
            return;
        }
        localStorage.setItem("setrikamap.v2." + id, JSON.stringify(data));
    }
};

/* ===== Penyimpanan Sesi ===== */
const SessionStore = {
    async load(lorongId) {
        if (!CLOUD) return null;
        const rows = await supaRest.get("iron_session", `lorong_id=eq.${encodeURIComponent(lorongId)}&select=*`);
        if (!rows.length) return null;
        const s = rows[0];
        // Tidak ada auto-timeout paksa; sesi aktif sampai pengguna menekan "Selesai Menggunakan"
        // (atau jika sesi sudah menggantung lebih dari 12 jam sebagai pembersihan darurat)
        if (!s.session_end_at) {
            const elapsed = Date.now() - new Date(s.session_start).getTime();
            if (elapsed > 12 * 3600000) {
                try { await supaRest.patch("iron_session", { lorong_id: lorongId }, { session_end_at: new Date().toISOString(), ended_by: "timeout_cleanup" }); } catch(e) {}
                return { ...s, session_end_at: new Date().toISOString(), ended_by: "timeout_cleanup" };
            }
        }
        return s;
    },
    async start(lorongId, userName) {
        const now = new Date().toISOString();
        const rows = await supaRest.upsert("iron_session", {
            lorong_id: lorongId, session_id: CLIENT_SESSION_ID,
            user_name: userName, session_start: now, session_end_at: null, ended_by: ""
        });
        return rows[0];
    },
    async end(lorongId, reason = "user") {
        await supaRest.patch("iron_session", { lorong_id: lorongId }, { session_end_at: new Date().toISOString(), ended_by: reason });
    }
};

/* ===== Penyimpanan Antrian ===== */
const QueueStore = {
    async load(lorongId) {
        if (!CLOUD) return [];
        // Muat antrian aktif, otomatis bersihkan / lewati entri kadaluarsa > 24 jam (Fitur 5)
        const rows = await supaRest.get("iron_queue",
            `lorong_id=eq.${encodeURIComponent(lorongId)}&status=in.(waiting,ready)&order=queue_number.asc&select=*`);
        
        const now = Date.now();
        const valid = [];
        for (const q of rows) {
            const age = now - new Date(q.joined_at).getTime();
            // Jika antrean sudah lebih dari 24 jam menggantung, tandai done di background
            if (age > 24 * 3600000) {
                supaRest.patch("iron_queue", { id: q.id }, { status: "done" }).catch(() => {});
            } else {
                valid.push(q);
            }
        }
        return valid;
    },
    async nextNumber(lorongId) {
        const rows = await supaRest.get("iron_queue",
            `lorong_id=eq.${encodeURIComponent(lorongId)}&order=queue_number.desc&limit=1&select=queue_number`);
        return rows.length ? (rows[0].queue_number + 1) : 1;
    },
    async join(lorongId, userName) {
        const existing = await supaRest.get("iron_queue",
            `lorong_id=eq.${encodeURIComponent(lorongId)}&session_id=eq.${encodeURIComponent(CLIENT_SESSION_ID)}&status=in.(waiting,ready)&select=id`);
        if (existing.length) throw new Error("ALREADY_IN_QUEUE");
        // Gunakan joined_at sebagai primary ordering; queue_number hanya referensi awal
        // Retry sekali jika ada conflict (mitigasi race condition)
        const doInsert = async () => {
            const num = await this.nextNumber(lorongId);
            return supaRest.insert("iron_queue", {
                lorong_id: lorongId, session_id: CLIENT_SESSION_ID,
                user_name: userName, status: "waiting",
                joined_at: new Date().toISOString(), queue_number: num
            });
        };
        let rows;
        try {
            rows = await doInsert();
        } catch (e) {
            // Retry sekali jika gagal (misal conflict nomor)
            rows = await doInsert();
        }
        return rows[0];
    },
    async cancel(queueId) { await supaRest.patch("iron_queue", { id: queueId }, { status: "cancelled" }); },
    async markReady(queueId) { await supaRest.patch("iron_queue", { id: queueId }, { status: "ready", ready_at: new Date().toISOString() }); },
    async markDone(queueId) { await supaRest.patch("iron_queue", { id: queueId }, { status: "done" }); }
};

const profile = {
    get() { try { return JSON.parse(localStorage.getItem("setrikamap.profile")) || {}; } catch (e) { return {}; } },
    set(p) { try { localStorage.setItem("setrikamap.profile", JSON.stringify(p)); } catch (e) { } }
};

/* ===== State ===== */
let cur = CONFIG.LORONG[0].id;
let S = norm(null);
let loading = true, loaded = false, error = "", showAllHist = false;
let pendingLoc = null;
let prevKey = null;
let prevRoomKey;
let QS = { session: null, queue: [], loadError: false };
let sessionTimerInterval = null;
let confirmTimerInterval = null;

/* ===== Helper State ===== */
function isSessionActive(sess) {
    if (!sess || sess.session_end_at) return false;
    // Sesi tetap aktif selama belum diakhiri manual (maksimal proteksi pembersihan darurat 12 jam)
    return (Date.now() - new Date(sess.session_start).getTime()) < 12 * 3600000;
}
function isMySession(sess) { return sess && sess.session_id === CLIENT_SESSION_ID; }
function myQueueEntry() { return QS.queue.find(q => q.session_id === CLIENT_SESSION_ID) || null; }
function isReadyExpired(entry) {
    if (!entry || entry.status !== "ready" || !entry.ready_at) return false;
    return (Date.now() - new Date(entry.ready_at).getTime()) > CONFIG.CONFIRM_MINUTES * 60000;
}
function stopTimers() {
    clearInterval(sessionTimerInterval); clearInterval(confirmTimerInterval);
    sessionTimerInterval = null; confirmTimerInterval = null;
}

function startSessionTimer(sess) {
    stopTimers();
    if (!sess || !isSessionActive(sess)) return;
    const startMs = new Date(sess.session_start).getTime();
    const estMs = CONFIG.SESSION_MINUTES * 60000;
    sessionTimerInterval = setInterval(() => {
        const elapsed = Date.now() - startMs;
        const remaining = estMs - elapsed;
        const bar = $("#sessionBar");
        if (!bar) { clearInterval(sessionTimerInterval); return; }
        const timerEl = bar.querySelector(".sb-timer");
        if (timerEl) {
            if (remaining > 0) {
                timerEl.textContent = fmtCountdown(remaining);
                timerEl.classList.toggle("urgent", remaining < 120000);
            } else {
                // Melewati estimasi 15 menit: hitung overtime (+mm:ss) tanpa mematikan sesi
                const overtime = Math.abs(remaining);
                timerEl.textContent = "+" + fmtCountdown(overtime);
                timerEl.classList.add("urgent");
            }
        }
    }, 1000);
}

function startConfirmTimer(readyEntry) {
    clearInterval(confirmTimerInterval);
    if (!readyEntry || readyEntry.status !== "ready" || !readyEntry.ready_at) return;
    const readyMs = new Date(readyEntry.ready_at).getTime();
    const limitMs = CONFIG.CONFIRM_MINUTES * 60000;
    confirmTimerInterval = setInterval(() => {
        const remaining = limitMs - (Date.now() - readyMs);
        const cd = document.querySelector(`.queue-item[data-qid="${readyEntry.id}"] .qi-countdown`);
        if (cd) {
            if (remaining <= 0) {
                cd.textContent = "Giliran habis — melewati..."; cd.classList.add("urgent");
                clearInterval(confirmTimerInterval);
                handleReadyExpired().catch(() => {});
                return;
            }
            cd.textContent = `Konfirmasi dalam: ${fmtCountdown(remaining)}`;
            cd.classList.toggle("urgent", remaining < 30000);
        } else { clearInterval(confirmTimerInterval); }
    }, 1000);
}

async function handleReadyExpired() {
    const frontReady = QS.queue.find(q => q.status === "ready");
    if (!frontReady) return;
    await QueueStore.markDone(frontReady.id);
    toast("Giliran dilewati karena tidak dikonfirmasi.");
    await refreshAll(true);
    const next = QS.queue.find(q => q.status === "waiting");
    if (next) {
        await QueueStore.markReady(next.id);
        if (next.session_id === CLIENT_SESSION_ID) toast("Giliran kamu tiba! Tekan konfirmasi untuk mulai.", true);
        await refreshAll(true);
    }
}

/* ===== Render Lokasi ===== */
function renderTop() {
    $("#demo").hidden = Store.mode !== "local";
    const wrap = $("#lorongWrap");
    wrap.hidden = CONFIG.LORONG.length < 2;
    $("#lorongSel").innerHTML = CONFIG.LORONG.map(l =>
        `<option value="${esc(l.id)}"${l.id === cur ? " selected" : ""}>${esc(l.name)}</option>`).join("");
}
function renderBanner() {
    $("#banner").innerHTML = error
        ? `<div class="notice error" role="alert"><span>${esc(error)}</span><button type="button" class="btn" id="btnRetry">Coba lagi</button></div>`
        : "";
}
function locHtml(s, L) {
    const p = parseLoc(s);
    if (p && p.kind === "room") {
        const r = roomsOf(L).find(x => x.id === p.value);
        const label = r ? r.label : p.value;
        return `<p class="loc ${label.length <= 4 ? "n-xl" : "n-l"}"><span class="loc-k">Kamar</span> <span class="loc-n">${esc(label)}</span></p>`;
    }
    return `<p class="loc n-m"><span class="loc-n">${esc(locText(s, L))}</span></p>`;
}
const textHtml = t => `<p class="loc n-m dim"><span class="loc-n">${esc(t)}</span></p>`;

function renderStatus() {
    const box = $("#stBody"), hero = $("#hero"), L = curL();
    let html = "", tone = "quiet", key = null, known = false;
    if (loading && !loaded) {
        html = `<div class="skel" role="status"><div class="iron-run" aria-hidden="true"><svg class="ic"><use href="#i-iron"/></svg></div>
      <i class="bar b1" aria-hidden="true"></i><i class="bar b2" aria-hidden="true"></i><p class="skel-t">Memuat lokasi...</p></div>`;
    } else if (error && !loaded) {
        html = textHtml("Lokasi belum bisa dimuat") + `<p class="fresh fresh-stale"><span class="dot"></span><span>Cek koneksi internet, lalu coba lagi.</span></p>`;
    } else if (!S.loc || !S.at) {
        html = textHtml("Belum diketahui") + `<p class="fresh"><span class="dot"></span><span>Belum ada yang memperbarui lokasi setrika di lorong ini.</span></p>`;
    } else {
        known = true; key = S.loc;
        const f = freshness(S.at), rel = relTime(S.at), when = absTime(S.at);
        tone = f === "stale" ? "quiet" : "warm";
        const line = f === "stale" ? `Terakhir diperbarui ${rel} (${when}). Lokasi mungkin sudah berubah.` : `Diperbarui ${rel} (${when})`;
        const p = parseLoc(S.loc);
        const sub = S.name ? `Dibawa ${esc(S.name)}` : (p && p.kind === "storage" ? "Bisa langsung diambil" : "");
        html = locHtml(S.loc, L) + (sub ? `<p class="sub">${sub}</p>` : "") +
            `<p class="fresh fresh-${f === "fresh" ? "ok" : (f === "stale" ? "stale" : "mid")}"><span class="dot"></span><span>${esc(line)}</span></p>`;
    }
    const changed = known && key !== prevKey;
    const old = box.querySelector(".loc");
    let ghost = null;
    if (changed && old) {
        ghost = old.cloneNode(true); ghost.classList.remove("loc"); ghost.classList.add("loc-old");
        ghost.setAttribute("aria-hidden", "true");
    }
    const keepLabel = !!(ghost && ghost.querySelector(".loc-k") && html.includes('class="loc-k"'));
    box.className = "stage" + (changed ? " changed" : "") + (keepLabel ? " keep-k" : "");
    box.innerHTML = html;
    if (ghost) {
        box.appendChild(ghost);
        const drop = () => ghost.remove();
        ghost.addEventListener("animationend", drop, { once: true });
        setTimeout(drop, 450);
    }
    hero.classList.toggle("quiet", tone === "quiet");
    prevKey = known ? key : null;
}

function renderPlan() {
    const L = curL();
    $("#planName").textContent = L.name;
    const roomNow = S.loc && S.loc.startsWith("room:") ? S.loc.slice(5) : null;
    const pop = prevRoomKey !== undefined && roomNow !== null && roomNow !== prevRoomKey;
    const btn = ([id, label]) => {
        const here = roomNow === id;
        return `<button type="button" class="room${here ? " here" : ""}${here && pop ? " pop" : ""}" data-room="${esc(id)}" aria-label="Kamar ${esc(label)}${here ? ", setrika ada di sini" : ""}">
      <span>${esc(label)}</span>${here ? `<small><svg class="ic" aria-hidden="true"><use href="#i-iron"/></svg>Setrika di sini</small>` : ""}</button>`;
    };
    const cell = item => item === null ? '<div class="room spacer" aria-hidden="true"></div>' : btn(item);
    $("#colL").innerHTML = L.left.map(cell).join("");
    $("#colR").innerHTML = L.right.map(cell).join("");
    prevRoomKey = roomNow;
}

function syncMore() {
    const more = $("#btnMore");
    more.setAttribute("aria-expanded", String(showAllHist));
    more.textContent = showAllHist ? "Tampilkan lebih sedikit" : `Lihat semua (${S.history.length})`;
}
function renderHist() {
    const box = $("#hist"), more = $("#btnMore"), L = curL();
    if (!S.history.length) {
        box.innerHTML = `<p class="empty">${loading && !loaded ? "Memuat riwayat..." : "Belum ada riwayat. Perubahan lokasi akan muncul di sini."}</p>`;
        more.hidden = true; return;
    }
    const N = CONFIG.HISTORY_SHOWN;
    let html = "", lastDay = "", hasMore = false;
    S.history.forEach((h, i) => {
        const d = dayLabel(h.at);
        if (i === N) {
            html += "</ul>";
            html += `<div class="more${showAllHist ? " open" : ""}" id="histMore"><div class="more-in">`;
            html += d !== lastDay ? `<h3 class="day">${esc(d)}</h3><ul class="hist">` : `<ul class="hist">`;
            lastDay = d; hasMore = true;
        } else if (d !== lastDay) {
            if (lastDay) html += "</ul>";
            html += `<h3 class="day">${esc(d)}</h3><ul class="hist">`; lastDay = d;
        }
        html += `<li${i === 0 ? ' class="cur"' : ""}><time datetime="${new Date(h.at).toISOString()}">${clock(h.at)}</time><i class="hd" aria-hidden="true"></i>
      <span class="hl">${esc(locText(h.loc, L))}</span>${h.name ? `<span class="who">${esc(h.name)}</span>` : ""}</li>`;
    });
    box.innerHTML = html + "</ul>" + (hasMore ? "</div></div>" : "");
    more.hidden = !hasMore;
    if (hasMore) syncMore();
}

/* ===== Render Sesi & Antrian ===== */
function renderSessionBox() {
    const box = $("#sessionBox"), bar = $("#sessionBar"), sess = QS.session;
    const active = isSessionActive(sess);
    box.hidden = !active;
    if (!active) return;
    const startMs = new Date(sess.session_start).getTime();
    const elapsed = Date.now() - startMs;
    const remaining = CONFIG.SESSION_MINUTES * 60000 - elapsed;
    const who = sess.user_name || "Seseorang";
    const timerDisplay = remaining > 0 ? fmtCountdown(remaining) : ("+" + fmtCountdown(Math.abs(remaining)));
    bar.innerHTML = `
        <div class="sb-label">
            <svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>
            <span>${isMySession(sess) ? "Kamu sedang menggunakan" : `${esc(who)} sedang menggunakan`} &middot; Estimasi waktu</span>
        </div>
        <span class="sb-timer${remaining < 120000 ? " urgent" : ""}">${timerDisplay}</span>`;
    startSessionTimer(sess);
}

function renderHeroButtons() {
    const sess = QS.session, active = isSessionActive(sess);
    const myEntry = myQueueEntry(), iAmReady = myEntry && myEntry.status === "ready";
    const activeByOther = active && !isMySession(sess);
    const activeByMe = active && isMySession(sess);
    const hasQueue = QS.queue.length > 0;

    // Kunci tombol "Perbarui Lokasi" jika setrika sedang digunakan
    const btnUpdate = $("#btnUpdate");
    if (btnUpdate) {
        btnUpdate.disabled = active;
        btnUpdate.title = active ? "Setrika sedang digunakan, lokasi terkunci sementara" : "";
    }

    if (!CLOUD) {
        ["#btnStartSession","#btnEndSession","#btnJoinQueue","#btnCancelQueue","#btnConfirmTurn"]
            .forEach(id => $(id).hidden = true);
        return;
    }
    // Mulai Menggunakan: tampil hanya jika tidak ada sesi aktif DAN tidak ada antrian DAN saya tidak di antrian
    $("#btnStartSession").hidden = active || hasQueue || !!myEntry;
    // Selesai: saya yang memakai
    $("#btnEndSession").hidden = !activeByMe;
    // Ambil Antrian: ada sesi orang lain ATAU ada antrian (tapi setrika tidak dipakai oleh saya), dan saya belum di antrian
    $("#btnJoinQueue").hidden = !((activeByOther || (hasQueue && !activeByMe)) && !myEntry);
    // Batalkan Antrian: saya di antrian waiting
    $("#btnCancelQueue").hidden = !(myEntry && myEntry.status === "waiting");
    // Konfirmasi Giliran: saya ready DAN tidak ada sesi aktif lain
    $("#btnConfirmTurn").hidden = !(iAmReady && !active);
}

function renderQueue() {
    const body = $("#queueBody"), queue = QS.queue;
    if (QS.loadError) { body.innerHTML = `<p class="queue-empty">Gagal memuat antrian. Cek koneksi internet.</p>`; return; }
    if (!queue.length) { body.innerHTML = `<p class="queue-empty">Belum ada antrian. Setrika bebas digunakan.</p>`; return; }

    const count = queue.length;
    let html = `<p class="queue-count">${count} orang dalam antrian</p><ul class="queue-list">`;
    
    // Hitung sisa waktu sesi aktif untuk estimasi tunggu antrean
    let currentSessionRemainingMin = 0;
    if (QS.session && isSessionActive(QS.session)) {
        const startMs = new Date(QS.session.session_start).getTime();
        const remMs = CONFIG.SESSION_MINUTES * 60000 - (Date.now() - startMs);
        currentSessionRemainingMin = Math.max(0, Math.ceil(remMs / 60000));
    }

    queue.forEach((q, idx) => {
        const isMine = q.session_id === CLIENT_SESSION_ID;
        const isReady = q.status === "ready";
        let countdownHtml = "";
        if (isReady && !isReadyExpired(q) && q.ready_at) {
            const remaining = CONFIG.CONFIRM_MINUTES * 60000 - (Date.now() - new Date(q.ready_at).getTime());
            if (remaining > 0) {
                countdownHtml = `<p class="qi-countdown${remaining < 30000 ? " urgent" : ""}">Konfirmasi dalam: ${fmtCountdown(remaining)}</p>`;
            }
        }

        // Estimasi waktu tunggu (Fitur 3)
        let waitEstimate = "";
        if (isReady) {
            waitEstimate = "";
        } else if (idx === 0) {
            waitEstimate = currentSessionRemainingMin > 0 ? `~${currentSessionRemainingMin} mnt lagi` : "segera";
        } else {
            const totalEst = currentSessionRemainingMin + (idx * CONFIG.SESSION_MINUTES);
            waitEstimate = `~${totalEst} mnt lagi`;
        }

        const statusLabel = isReady ? (isMine ? "✨ Giliran kamu!" : "Giliran Berikutnya")
            : (idx === 0 ? "Menunggu giliran berikutnya" : "Menunggu");
        const cancelBtn = (isMine && q.status === "waiting")
            ? `<button class="qi-cancel" data-cancel-qid="${esc(q.id)}" aria-label="Batalkan antrianku"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button>`
            : `<div></div>`;
        // Gunakan idx+1 sebagai nomor tampilan (bukan queue_number dari DB) agar ordering konsisten
        // Tambah --i:${idx} untuk staggered animation di CSS
        html += `<li class="queue-item${isReady ? " ready" : ""}${isMine ? " mine" : ""}" data-qid="${esc(q.id)}" style="--i:${idx}">
            <div class="qi-num">${idx + 1}</div>
            <div class="qi-info">
                <div class="qi-name">${esc(q.user_name || "Tanpa nama")}</div>
                <div class="qi-status">
                    <span>${esc(statusLabel)}</span>
                    ${waitEstimate ? `<span class="qi-estimate">&bull; Estimasi: ${esc(waitEstimate)}</span>` : ""}
                </div>
                ${countdownHtml}
            </div>
            ${cancelBtn}
        </li>`;
    });
    html += "</ul>";
    body.innerHTML = html;
    const myReady = myQueueEntry();
    if (myReady && myReady.status === "ready") startConfirmTimer(myReady);
}

function renderQueueJoinForm() {
    const form = $("#queueJoinForm"), myEntry = myQueueEntry(), sess = QS.session;
    const activeByOther = isSessionActive(sess) && !isMySession(sess);
    // Tampilkan form jika: setrika dipakai orang lain ATAU sudah ada antrian,
    // dan user belum di antrian dan bukan pemilik sesi aktif
    const canJoin = (activeByOther || QS.queue.length > 0) && !myEntry && !isMySession(sess);
    form.hidden = !(canJoin && CLOUD);

    // Isi pilihan kamar jika elemen select tersedia
    const sel = $("#queueRoom");
    if (sel && curL()) {
        const rooms = roomsOf(curL());
        const savedRoom = profile.get().room || "";
        const currentVal = sel.value || savedRoom;
        sel.innerHTML = '<option value="">-- Pilih Kamar (270 - 280) --</option>' +
            rooms.map(r => `<option value="${esc(r.id)}"${r.id === currentVal ? " selected" : ""}>Kamar ${esc(r.label)}</option>`).join("");
    }
}

function renderAll() {
    renderTop(); renderBanner(); renderStatus(); renderPlan(); renderHist();
    renderSessionBox(); renderHeroButtons(); renderQueue(); renderQueueJoinForm();
}

/* ===== Data ===== */
async function refresh(silent) {
    const id = cur;
    if (!silent) { loading = true; renderStatus(); renderHist(); }
    try {
        const data = await Store.load(id);
        if (id !== cur) return;
        S = data; error = ""; loaded = true;
    } catch (e) {
        if (id !== cur) return;
        error = "Tidak bisa memuat lokasi setrika. Cek koneksi internet, lalu coba lagi.";
    }
    loading = false;
    renderTop(); renderBanner(); renderStatus(); renderPlan(); renderHist();
}

async function refreshQueue() {
    if (!CLOUD) return;
    try {
        const [sess, queue] = await Promise.all([SessionStore.load(cur), QueueStore.load(cur)]);
        QS.session = sess; QS.queue = queue; QS.loadError = false;
        const sessActive = isSessionActive(sess);

        if (!sessActive && queue.length) {
            const frontWaiting = queue.find(q => q.status === "waiting");
            const frontReady = queue.find(q => q.status === "ready");
            if (!frontReady && frontWaiting) {
                // Guard: cek ulang dari DB sebelum markReady untuk mengurangi concurrent calls
                const latestQueue = await QueueStore.load(cur);
                const latestReady = latestQueue.find(q => q.status === "ready");
                const latestWaiting = latestQueue.find(q => q.status === "waiting");
                if (!latestReady && latestWaiting && latestWaiting.id === frontWaiting.id) {
                    await QueueStore.markReady(frontWaiting.id);
                    QS.queue = await QueueStore.load(cur);
                    if (frontWaiting.session_id === CLIENT_SESSION_ID) {
                        toast("Giliran kamu tiba! Tekan konfirmasi untuk mulai.", true);
                        notifyTurn("✨ Giliran Kamu Tiba!", "Setrika siap digunakan. Segera konfirmasi dalam 2 menit!");
                    }
                } else {
                    QS.queue = latestQueue;
                }
            }
            const readyEntry = QS.queue.find(q => q.status === "ready");
            if (readyEntry && isReadyExpired(readyEntry)) {
                // Guard: cek ulang state ready dari DB sebelum mark done
                const latestCheck = await QueueStore.load(cur);
                const latestReady = latestCheck.find(q => q.id === readyEntry.id && q.status === "ready");
                if (latestReady && isReadyExpired(latestReady)) {
                    await QueueStore.markDone(readyEntry.id);
                    QS.queue = await QueueStore.load(cur);
                    const nextW = QS.queue.find(q => q.status === "waiting");
                    if (nextW) {
                        const nextCheck = await QueueStore.load(cur);
                        const nextReady = nextCheck.find(q => q.status === "ready");
                        if (!nextReady) {
                            await QueueStore.markReady(nextW.id);
                            QS.queue = await QueueStore.load(cur);
                            if (nextW.session_id === CLIENT_SESSION_ID) {
                                toast("Giliran kamu tiba! Tekan konfirmasi untuk mulai.", true);
                                notifyTurn("✨ Giliran Kamu Tiba!", "Setrika siap digunakan. Segera konfirmasi dalam 2 menit!");
                            }
                        } else {
                            QS.queue = nextCheck;
                        }
                    }
                } else {
                    QS.queue = latestCheck;
                }
            }
        }
    } catch (e) { QS.loadError = true; }
    renderSessionBox(); renderHeroButtons(); renderQueue(); renderQueueJoinForm();
}

async function refreshAll(silent) { await Promise.all([refresh(silent), refreshQueue()]); }

function selectLorong(id, fromHash) {
    if (!CONFIG.LORONG.some(l => l.id === id)) id = CONFIG.LORONG[0].id;
    cur = id; S = norm(null); loaded = false; showAllHist = false; prevRoomKey = undefined;
    QS = { session: null, queue: [], loadError: false }; stopTimers();
    if (!fromHash) { try { history.replaceState(null, "", "#l=" + encodeURIComponent(id)); } catch (e) { } }
    refreshAll(false);
}

function setupRealtime() {
    if (!CLOUD) return;
    setInterval(() => { if (!document.hidden && !$("#dlg").open) refreshAll(true); }, CONFIG.POLL_MS);
}

/* ===== Dialog ===== */
const dlg = $("#dlg");
function openDialog() {
    dlg.classList.remove("closing");
    if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute("open", "");
}
function closeDialog() {
    if (!dlg.open && !dlg.hasAttribute("open")) return;
    const finish = () => { dlg.classList.remove("closing"); if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open"); };
    if (reduceMotion() || typeof dlg.close !== "function") { finish(); return; }
    if (dlg.classList.contains("closing")) return;
    dlg.classList.add("closing");
    dlg.addEventListener("animationend", function h(e) {
        if (e.target !== dlg) return;
        dlg.removeEventListener("animationend", h);
        if (dlg.classList.contains("closing")) finish();
    });
    setTimeout(() => { if (dlg.classList.contains("closing")) finish(); }, 360);
}
function showPane(name) {
    $("#panePick").hidden = name !== "pick";
    $("#paneConfirm").hidden = name !== "confirm";
    const pStart = $("#paneStartSession");
    if (pStart) pStart.hidden = name !== "startSession";
    const pEnd = $("#paneEndSession");
    if (pEnd) pEnd.hidden = name !== "endSession";

    const title = name === "pick" ? $("#pkTitle") :
        (name === "confirm" ? $("#cfTitle") :
        (name === "startSession" ? $("#ssTitle") : $("#esTitle")));
    if (title) {
        dlg.setAttribute("aria-labelledby", title.id);
        title.focus();
    }
}
function renderOpts() {
    const L = curL(), q = $("#q").value.trim().toLowerCase();
    const rooms = roomsOf(L).filter(r => !q || r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    const atStorage = S.loc === "storage";
    let h = "";
    if (rooms.length) {
        h += `<div class="room-grid">` + rooms.map(r => {
            const here = S.loc === "room:" + r.id;
            return `<button type="button" class="opt" data-act="room" data-id="${esc(r.id)}"${here ? " disabled" : ""}><span>${esc(r.label)}</span>${here ? "<small>Sekarang</small>" : ""}</button>`;
        }).join("") + `</div>`;
    } else {
        h += `<p class="empty">Tidak ada kamar bernomor ${esc($("#q").value.trim())}. Pakai Lainnya kalau lokasinya bukan kamar.</p>`;
    }
    h += `<button type="button" class="opt wide" data-act="storage"${atStorage ? " disabled" : ""}><span>${esc(L.storage)}</span>${atStorage ? "<small>Sekarang</small>" : ""}</button>`;
    h += `<button type="button" class="opt wide" data-act="other"><span>Lainnya</span></button>`;
    $("#opts").innerHTML = h;
}
function openPick() {
    if (isSessionActive(QS.session)) {
        toast("Setrika sedang digunakan. Lokasi tidak bisa dipindahkan sekarang.");
        return;
    }
    if (loading && !loaded) { toast("Data masih dimuat. Coba lagi sebentar."); return; }
    $("#q").value = ""; $("#otherIn").value = ""; $("#otherErr").textContent = "";
    $("#otherBox").hidden = true; renderOpts(); showPane("pick"); openDialog(); $("#pkTitle").focus();
}
function openConfirm(loc) {
    const L = curL(); pendingLoc = loc;
    const p = parseLoc(loc);
    $("#cfTitle").textContent = p.kind === "storage" ? `Setrika dikembalikan ke ${L.storage}?` : `Setrika sekarang di ${locText(loc, L)}?`;
    $("#fName").value = profile.get().name || ""; $("#cfErr").textContent = "";
    $("#cfOk").disabled = false; $("#cfOk").textContent = "Konfirmasi";
    showPane("confirm"); openDialog(); $("#cfTitle").focus();
}
function validateOther(raw) {
    const L = curL(), text = raw.replace(/\s+/g, " ").trim();
    if (!text) return { error: "Isi lokasinya dulu." };
    if (text.length < 2) return { error: "Lokasi terlalu pendek." };
    if (text.length > 40) return { error: "Maksimal 40 karakter." };
    if (!/^[\p{L}\p{N} .,\-\/()]+$/u.test(text)) return { error: "Pakai huruf, angka, atau tanda baca biasa." };
    if (!/[\p{L}\p{N}]/u.test(text)) return { error: "Lokasi harus memuat huruf atau angka." };
    const room = matchRoom(L, text);
    if (room) return { loc: "room:" + room.id };
    if (/^(kamar\s*)?[a-z]{0,2}\s?-?\d{1,4}$/i.test(text)) return { error: "Kamar itu tidak ada di " + L.name + ". Pilih dari daftar." };
    return { loc: "other:" + text };
}
async function submitConfirm() {
    const btn = $("#cfOk"), err = $("#cfErr");
    if (isSessionActive(QS.session)) {
        err.textContent = "Setrika sedang digunakan. Lokasi terkunci.";
        toast("Setrika sedang digunakan. Lokasi tidak bisa dipindahkan.");
        return;
    }
    const name = $("#fName").value.replace(/\s+/g, " ").trim();
    if (name.length > 30) { err.textContent = "Nama maksimal 30 karakter."; return; }
    if (!pendingLoc) { err.textContent = "Lokasi belum dipilih."; return; }
    btn.disabled = true; btn.textContent = "Menyimpan..."; err.textContent = "";
    try {
        // Cek lagi ke database status sesi terkini
        if (CLOUD) {
            const currentSess = await SessionStore.load(cur);
            if (isSessionActive(currentSess)) {
                err.textContent = "Setrika sedang digunakan oleh seseorang. Tidak bisa mengubah lokasi.";
                btn.disabled = false; btn.textContent = "Konfirmasi";
                await refreshAll(true);
                return;
            }
        }
        const fresh = await Store.load(cur), now = Date.now();
        const next = { loc: pendingLoc, name, at: now, history: [{ loc: pendingLoc, name, at: now }, ...fresh.history].slice(0, CONFIG.HISTORY_MAX) };
        await Store.save(cur, next);
        profile.set({ name });
        S = await Store.load(cur); loaded = true; error = "";
        closeDialog(); renderTop(); renderBanner(); renderStatus(); renderPlan(); renderHist();
        toast("Lokasi setrika berhasil diperbarui.", true);
        $("#announce").textContent = "Setrika sekarang di " + locText(next.loc, curL());
    } catch (e) {
        err.textContent = "Gagal menyimpan. Cek koneksi internet, lalu coba lagi.";
        btn.disabled = false; btn.textContent = "Konfirmasi";
    }
}

/* ===== Aksi Sesi ===== */
function openStartSessionDialog() {
    if (CLOUD && isSessionActive(QS.session)) {
        toast("Setrika sedang digunakan oleh orang lain.");
        return;
    }
    if (QS.queue.length > 0) {
        toast("Masih ada antrian. Silakan bergabung ke antrian.");
        return;
    }

    const sel = $("#ssRoom");
    if (sel && curL()) {
        const rooms = roomsOf(curL());
        const savedRoom = profile.get().room || "";
        sel.innerHTML = '<option value="">-- Pilih Kamar (270 - 280) --</option>' +
            rooms.map(r => `<option value="${esc(r.id)}"${r.id === savedRoom ? " selected" : ""}>Kamar ${esc(r.label)}</option>`).join("");
    }
    const nameIn = $("#ssName");
    if (nameIn) nameIn.value = profile.get().name || "";
    const errEl = $("#ssErr");
    if (errEl) errEl.textContent = "";

    showPane("startSession");
    openDialog();
    if (sel) sel.focus();
}

async function submitStartSession() {
    const sel = $("#ssRoom"), nameIn = $("#ssName"), errEl = $("#ssErr"), btn = $("#ssOk");
    const roomId = (sel ? sel.value : "").trim();
    const name = (nameIn ? nameIn.value : "").replace(/\s+/g, " ").trim();

    if (!roomId) {
        if (errEl) errEl.textContent = "Silakan pilih kamar kamu terlebih dahulu.";
        if (sel) sel.focus();
        return;
    }

    if (CLOUD) {
        const checkSess = await SessionStore.load(cur);
        if (isSessionActive(checkSess)) {
            if (errEl) errEl.textContent = "Setrika baru saja digunakan oleh orang lain.";
            toast("Setrika sedang digunakan oleh orang lain.");
            await refreshAll(true);
            return;
        }
    }
    if (QS.queue.length > 0) {
        if (errEl) errEl.textContent = "Ada antrian masuk. Silakan ambil antrian.";
        toast("Masih ada antrian. Silakan bergabung ke antrian.");
        await refreshAll(true);
        return;
    }

    const L = curL();
    const rObj = roomsOf(L).find(r => r.id === roomId);
    const roomLabel = rObj ? rObj.label : roomId;
    const labelRoom = `Kamar ${roomLabel}`;
    const displayIdentity = name ? `${labelRoom} (${name})` : labelRoom;

    btn.disabled = true; btn.textContent = "Memulai...";
    if (errEl) errEl.textContent = "";

    try {
        await SessionStore.start(cur, displayIdentity);
        profile.set({ ...profile.get(), room: roomId, name });

        // Otomatis pindahkan lokasi setrika ke kamar pengguna
        const newLoc = "room:" + roomId;
        const now = Date.now();
        const fresh = await Store.load(cur);
        const next = {
            loc: newLoc,
            name: displayIdentity,
            at: now,
            history: [{ loc: newLoc, name: displayIdentity, at: now }, ...(fresh.history || [])].slice(0, CONFIG.HISTORY_MAX)
        };
        await Store.save(cur, next);
        S = await Store.load(cur);

        closeDialog();
        await refreshAll(true);
        toast(`Sesi dimulai. Setrika otomatis berpindah ke Kamar ${roomLabel}!`, true);
    } catch (e) {
        if (errEl) errEl.textContent = "Gagal memulai sesi. Coba lagi.";
        toast("Gagal memulai sesi. Coba lagi.");
    } finally {
        btn.disabled = false; btn.textContent = "Mulai Pakai";
    }
}
function openEndSessionDialog() {
    showPane("endSession");
    openDialog();
}

async function finishEndSession(action) {
    const btnStorage = $("#btnEndReturnStorage"), btnKeep = $("#btnEndKeepRoom");
    btnStorage.disabled = true; btnKeep.disabled = true;

    try {
        await SessionStore.end(cur, "user");
        
        // Jika pengguna memilih kembalikan ke tempat penyimpanan
        if (action === "storage") {
            const L = curL();
            const now = Date.now();
            const fresh = await Store.load(cur);
            const myName = profile.get().name || "";
            const next = {
                loc: "storage",
                name: myName ? `${myName} (Disimpan kembali)` : "Disimpan kembali",
                at: now,
                history: [{ loc: "storage", name: myName || "Disimpan kembali", at: now }, ...(fresh.history || [])].slice(0, CONFIG.HISTORY_MAX)
            };
            await Store.save(cur, next);
            S = await Store.load(cur);
        }

        closeDialog();

        // Cek antrean berikutnya
        const queue = await QueueStore.load(cur);
        const frontW = queue.find(q => q.status === "waiting"), frontR = queue.find(q => q.status === "ready");
        if (!frontR && frontW) {
            await QueueStore.markReady(frontW.id);
            if (frontW.session_id === CLIENT_SESSION_ID) {
                toast("Giliran kamu tiba! Tekan konfirmasi untuk mulai.", true);
                notifyTurn("✨ Giliran Kamu Tiba!", "Setrika siap digunakan. Segera konfirmasi dalam 2 menit!");
            }
        }

        await refreshAll(true);
        toast(action === "storage" ? "Sesi selesai & setrika dikembalikan ke tempat penyimpanan." : "Sesi selesai. Setrika bebas digunakan lagi.", true);
        stopTimers();
    } catch (e) {
        toast("Gagal mengakhiri sesi. Coba lagi.");
    } finally {
        btnStorage.disabled = false; btnKeep.disabled = false;
    }
}
async function handleConfirmTurn() {
    const btn = $("#btnConfirmTurn"), myEntry = myQueueEntry();
    if (!myEntry) return;

    // Pastikan tidak ada sesi aktif lain sebelum memulai
    if (CLOUD) {
        const checkSess = await SessionStore.load(cur);
        if (isSessionActive(checkSess)) {
            toast("Setrika masih digunakan oleh orang lain. Tunggu hingga selesai.");
            await refreshAll(true);
            return;
        }
    }

    btn.disabled = true; btn.textContent = "Memulai...";
    try {
        const userName = myEntry.user_name || (profile.get().name || "").trim();
        // 1. Mulai sesi terlebih dahulu agar setrika langsung berstatus aktif
        await SessionStore.start(cur, userName);

        // 2. Tandai antrean selesai
        await QueueStore.markDone(myEntry.id);

        // Jika antrean mencantumkan kamar (misal profile.room atau dari user_name "Kamar 270..."),
        // pindahkan lokasi setrika secara otomatis ke kamar tersebut.
        const L = curL();
        let targetRoomId = profile.get().room || null;
        if (!targetRoomId && myEntry.user_name) {
            const m = myEntry.user_name.match(/Kamar\s+([A-Za-z0-9]+)/i);
            if (m) {
                const found = roomsOf(L).find(r => r.id === m[1] || r.label.toLowerCase() === m[1].toLowerCase());
                if (found) targetRoomId = found.id;
            }
        }

        if (targetRoomId) {
            const newLoc = "room:" + targetRoomId;
            const now = Date.now();
            const fresh = await Store.load(cur);
            const next = {
                loc: newLoc,
                name: userName,
                at: now,
                history: [{ loc: newLoc, name: userName, at: now }, ...(fresh.history || [])].slice(0, CONFIG.HISTORY_MAX)
            };
            await Store.save(cur, next);
            S = await Store.load(cur);
        }

        clearInterval(confirmTimerInterval);
        await refreshAll(true);
        toast("Sesi dimulai. Setrika otomatis tercatat di kamarmu!", true);
    } catch (e) { toast("Gagal mengkonfirmasi giliran. Coba lagi."); }
    finally { btn.disabled = false; btn.textContent = "Mulai Menggunakan (Giliran Saya)"; }
}

/* ===== Aksi Antrian ===== */
async function handleJoinQueue(e) {
    e.preventDefault();
    const roomInput = $("#queueRoom"), nameInput = $("#queueName");
    const errEl = $("#queueErr") || $("#queueNameErr"), submitBtn = $("#btnQueueSubmit");
    
    const roomId = (roomInput ? roomInput.value : "").trim();
    const name = nameInput.value.replace(/\s+/g, " ").trim();

    if (!roomId) {
        errEl.textContent = "Silakan pilih kamarmu terlebih dahulu.";
        if (roomInput) roomInput.focus();
        return;
    }

    const L = curL();
    const rObj = roomsOf(L).find(r => r.id === roomId);
    const roomLabel = rObj ? rObj.label : roomId;
    const labelRoom = `Kamar ${roomLabel}`;
    const displayIdentity = name ? `${labelRoom} (${name})` : labelRoom;

    errEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Mendaftar...";

    try {
        await QueueStore.join(cur, displayIdentity);
        profile.set({ ...profile.get(), room: roomId, name });
        $("#queueJoinForm").hidden = true;
        nameInput.value = "";
        await refreshAll(true);
        const myEntry = myQueueEntry();
        // Tampilkan nomor berdasarkan posisi di array (idx+1), bukan queue_number dari DB
        const posInQueue = QS.queue.findIndex(q => q.session_id === CLIENT_SESSION_ID) + 1;
        toast(`Berhasil masuk antrian! Nomor: ${posInQueue > 0 ? posInQueue : "-"}`, true);
        $("#announce").textContent = "Kamu sudah masuk antrian.";
    } catch (e) {
        errEl.textContent = e.message === "ALREADY_IN_QUEUE" ? "Kamu sudah ada di antrian ini." : "Gagal mendaftar. Cek koneksi internet.";
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Ambil Antrian";
    }
}
async function handleCancelQueue() {
    const myEntry = myQueueEntry(); if (!myEntry) return;
    const btn = $("#btnCancelQueue");
    btn.disabled = true; btn.textContent = "Membatalkan...";
    try {
        await QueueStore.cancel(myEntry.id);
        await refreshAll(true);
        toast("Antrianmu berhasil dibatalkan.");
    } catch (e) { toast("Gagal membatalkan antrian. Coba lagi."); }
    finally { btn.disabled = false; btn.textContent = "Batalkan Antrianku"; }
}

/* ===== Toast ===== */
let toastTimer;
function toast(t, ok) {
    const el = $("#toast");
    $("#toastTxt").textContent = t;
    el.querySelector(".ic").hidden = !ok;
    el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ===== Event ===== */
$("#btnUpdate").addEventListener("click", openPick);
$("#btnStartSession").addEventListener("click", openStartSessionDialog);
$("#ssCancel").addEventListener("click", closeDialog);
$("#ssOk").addEventListener("click", submitStartSession);
$("#ssName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submitStartSession(); } });
$("#btnEndSession").addEventListener("click", openEndSessionDialog);
$("#btnEndReturnStorage").addEventListener("click", () => finishEndSession("storage"));
$("#btnEndKeepRoom").addEventListener("click", () => finishEndSession("keep"));
$("#btnEndCancel").addEventListener("click", closeDialog);
$("#btnConfirmTurn").addEventListener("click", handleConfirmTurn);
$("#btnJoinQueue").addEventListener("click", () => {
    requestNotificationPermission();
    const form = $("#queueJoinForm");
    form.hidden = !form.hidden;
    if (!form.hidden) {
        const prof = profile.get();
        const roomIn = $("#queueRoom");
        const nameIn = $("#queueName");
        if (roomIn) {
            roomIn.value = prof.room || "";
            if (!prof.room) roomIn.focus();
            else if (nameIn) nameIn.focus();
        } else if (nameIn) {
            nameIn.focus();
        }
        if (nameIn) nameIn.value = prof.name || "";
    }
});
$("#btnCancelQueue").addEventListener("click", handleCancelQueue);
$("#lorongSel").addEventListener("change", e => selectLorong(e.target.value, false));
$("#banner").addEventListener("click", e => { if (e.target.closest("#btnRetry")) refreshAll(false); });
$("#btnMore").addEventListener("click", () => {
    showAllHist = !showAllHist;
    const m = $("#histMore"); if (m) m.classList.toggle("open", showAllHist); syncMore();
});
document.querySelector(".floor").addEventListener("click", e => {
    const b = e.target.closest(".room"); if (!b) return;
    if (isSessionActive(QS.session)) {
        toast("Setrika sedang digunakan. Lokasi tidak bisa dipindahkan sekarang.");
        return;
    }
    if (loading && !loaded) { toast("Data masih dimuat. Coba lagi sebentar."); return; }
    const loc = "room:" + b.dataset.room;
    if (S.loc === loc) { toast("Setrika sudah tercatat di " + locText(loc, curL()) + "."); return; }
    openConfirm(loc);
});
$("#queueBody").addEventListener("click", async e => {
    const cancelBtn = e.target.closest("[data-cancel-qid]"); if (!cancelBtn) return;
    cancelBtn.disabled = true;
    try {
        await QueueStore.cancel(cancelBtn.dataset.cancelQid);
        await refreshAll(true); toast("Antrian dibatalkan.");
    } catch (ex) { toast("Gagal membatalkan. Coba lagi."); cancelBtn.disabled = false; }
});
$("#queueJoinForm").addEventListener("submit", handleJoinQueue);
$("#btnQueueCancel").addEventListener("click", () => { $("#queueJoinForm").hidden = true; });
$("#q").addEventListener("input", renderOpts);
$("#opts").addEventListener("click", e => {
    const b = e.target.closest(".opt"); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "room") openConfirm("room:" + b.dataset.id);
    else if (act === "storage") openConfirm("storage");
    else if (act === "other") { $("#otherBox").hidden = false; $("#otherIn").focus(); }
});
$("#otherBox").addEventListener("submit", e => {
    e.preventDefault();
    const r = validateOther($("#otherIn").value);
    if (r.error) { $("#otherErr").textContent = r.error; $("#otherIn").focus(); return; }
    if (r.loc === S.loc) { $("#otherErr").textContent = "Setrika sudah tercatat di lokasi itu."; return; }
    $("#otherErr").textContent = ""; openConfirm(r.loc);
});
$("#pkCancel").addEventListener("click", closeDialog);
$("#cfCancel").addEventListener("click", closeDialog);
$("#cfBack").addEventListener("click", () => { renderOpts(); showPane("pick"); });
$("#cfOk").addEventListener("click", submitConfirm);
$("#fName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submitConfirm(); } });
dlg.addEventListener("click", e => { if (e.target === dlg) closeDialog(); });
dlg.addEventListener("cancel", e => { e.preventDefault(); closeDialog(); });

/* ===== Mulai ===== */
(function init() {
    const m = /[#&]l=([^&]+)/.exec(location.hash);
    renderAll();
    selectLorong(m ? decodeURIComponent(m[1]) : cur, true);
    setInterval(() => { if (loaded) { renderStatus(); renderHist(); } }, 30000);
    if (Store.mode === "cloud") { setupRealtime(); }
    else { window.addEventListener("storage", () => refresh(true)); }
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !dlg.open) refreshAll(true); });
})();
