"use strict";

/* ===== Konfigurasi =====
   ISI SUPABASE_URL dan SUPABASE_ANON_KEY dari project Supabase kamu.
   Kalau kosong = mode demo (data hanya di browser ini).
   
   Cara mendapatkan:
   1. Buka https://supabase.com/dashboard
   2. Pilih project kamu
   3. Pergi ke Settings > API
   4. Copy "Project URL" → isi ke SUPABASE_URL
   5. Copy "anon public" key → isi ke SUPABASE_ANON_KEY
*/
const CONFIG = {
    SUPABASE_URL: "https://mdkxgvlbbwsucziujfmn.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka3hndmxiYndzdWN6aXVqZm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1ODQ0MzMsImV4cCI6MjEwODE2MDQzM30.Ovx6Vsm5PLKMOtoglhUyE5CcHVD-V4x7kHgT_l5sBLU",
    FRESH_MINUTES: 60,
    STALE_HOURS: 3,
    POLL_MS: 5000,
    HISTORY_MAX: 20,
    HISTORY_SHOWN: 6,
    LORONG: [
        {
            id: "270",
            name: "Lorong 270-280",
            storage: "Tempat penyimpanan",
            left: [["280", "SR 280"], ["278", "278"], ["276", "276"], ["274", "274"], ["270", "270"]],
            right: [["279", "279"], ["277", "277"], ["275", "275"], ["273", "273"], ["272", "272"], ["271", "271"]]
        }
    ]
};

/* ===== Utilitas ===== */
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

/* ===== Lokasi =====
   Disimpan sebagai teks: "room:275", "storage", atau "other:Dapur lantai 2". */
const curL = () => CONFIG.LORONG.find(l => l.id === cur);
const roomsOf = L => [...L.left, ...L.right].map(([id, label]) => ({ id, label }))
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

/* Merapikan data dari penyimpanan, termasuk format lama (field "room"). */
function norm(d) {
    d = d || {};
    const conv = x => x.loc || (x.room ? "room:" + x.room : "storage");
    let hist = Array.isArray(d.history) ? d.history : Object.values(d.history || {});
    hist = hist.filter(h => h && h.at).map(h => ({ loc: conv(h), name: h.name || h.holder || "", at: h.at }))
        .sort((a, b) => b.at - a.at);
    const loc = d.loc || (d.room ? "room:" + d.room : (d.at ? "storage" : null));
    return { loc, name: d.name || d.holder || "", at: d.at || null, history: hist };
}

/* ===== Supabase Client (tanpa SDK, pakai REST API langsung) ===== */
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

    /* GET rows from a table with query params */
    async get(table, params = "") {
        const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, {
            headers: this.headers(),
            cache: "no-store"
        });
        if (!r.ok) throw new Error("Supabase GET " + r.status);
        return r.json();
    },

    /* UPSERT (insert or update) a row */
    async upsert(table, data) {
        const h = this.headers();
        h["Prefer"] = "return=representation,resolution=merge-duplicates";
        const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
            method: "POST",
            headers: h,
            body: JSON.stringify(data)
        });
        if (!r.ok) throw new Error("Supabase UPSERT " + r.status);
        return r.json();
    },

    /* INSERT a row */
    async insert(table, data) {
        const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(data)
        });
        if (!r.ok) throw new Error("Supabase INSERT " + r.status);
        return r.json();
    }
};

/* ===== Penyimpanan ===== */
const CLOUD = !!(SUPA_URL && SUPA_KEY);

const Store = {
    mode: CLOUD ? "cloud" : "local",

    async load(id) {
        if (CLOUD) {
            /* Ambil status terkini dari tabel lorong_status */
            const statusRows = await supaRest.get("lorong_status",
                `lorong_id=eq.${encodeURIComponent(id)}&select=*`);
            const status = statusRows[0] || null;

            /* Ambil riwayat dari tabel location_history, terbaru dulu, max 20 */
            const histRows = await supaRest.get("location_history",
                `lorong_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=${CONFIG.HISTORY_MAX}`);

            const history = histRows.map(h => ({
                loc: h.loc,
                name: h.name || "",
                at: new Date(h.created_at).getTime()
            }));

            return {
                loc: status ? status.loc : null,
                name: status ? (status.name || "") : "",
                at: status ? new Date(status.updated_at).getTime() : null,
                history
            };
        }

        /* Mode lokal (demo) */
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem("setrikamap.v2." + id)); } catch (e) { raw = null; }
        return norm(raw);
    },

    async save(id, data) {
        if (CLOUD) {
            const now = new Date().toISOString();

            /* Upsert status terkini ke lorong_status */
            await supaRest.upsert("lorong_status", {
                lorong_id: id,
                loc: data.loc,
                name: data.name || "",
                updated_at: now
            });

            /* Insert riwayat baru ke location_history */
            await supaRest.insert("location_history", {
                lorong_id: id,
                loc: data.loc,
                name: data.name || "",
                created_at: now
            });

            return;
        }

        /* Mode lokal (demo) */
        localStorage.setItem("setrikamap.v2." + id, JSON.stringify(data));
    }
};

const profile = {
    get() { try { return JSON.parse(localStorage.getItem("setrikamap.profile")) || {}; } catch (e) { return {}; } },
    set(p) { try { localStorage.setItem("setrikamap.profile", JSON.stringify(p)); } catch (e) { } }
};

/* ===== Supabase Realtime (SSE via Realtime channel) =====
   Mendengarkan perubahan di tabel lorong_status secara realtime
   menggunakan Supabase Realtime over WebSocket (tanpa SDK). 
   Fallback ke polling jika WebSocket tidak tersedia. */
let realtimeWs = null;

function setupRealtime() {
    if (!CLOUD) return;

    /* Gunakan polling sebagai strategi yang lebih reliable tanpa SDK */
    setInterval(() => {
        if (!document.hidden && !$("#dlg").open) refresh(true);
    }, CONFIG.POLL_MS);
}

/* ===== State ===== */
let cur = CONFIG.LORONG[0].id;
let S = norm(null);
let loading = true, loaded = false, error = "", showAllHist = false;
let pendingLoc = null;
let prevKey = null;        // lokasi yang terakhir ditampilkan di hero (untuk animasi pergantian)
let prevRoomKey;           // kamar yang terakhir ditandai di denah (untuk animasi tanda)

/* ===== Render ===== */
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
        html = textHtml("Lokasi belum bisa dimuat") +
            `<p class="fresh fresh-stale"><span class="dot"></span><span>Cek koneksi internet, lalu coba lagi.</span></p>`;
    } else if (!S.loc || !S.at) {
        html = textHtml("Belum diketahui") +
            `<p class="fresh"><span class="dot"></span><span>Belum ada yang memperbarui lokasi setrika di lorong ini. Kalau kamu tahu, perbarui sekarang.</span></p>`;
    } else {
        known = true; key = S.loc;
        const f = freshness(S.at), rel = relTime(S.at), when = absTime(S.at);
        tone = f === "stale" ? "quiet" : "warm";
        const line = f === "stale"
            ? `Terakhir diperbarui ${rel} (${when}). Lokasi mungkin sudah berubah.`
            : `Diperbarui ${rel} (${when})`;
        const p = parseLoc(S.loc);
        const sub = S.name ? `Dibawa ${esc(S.name)}` : (p && p.kind === "storage" ? "Bisa langsung diambil" : "");
        html = locHtml(S.loc, L) +
            (sub ? `<p class="sub">${sub}</p>` : "") +
            `<p class="fresh fresh-${f === "fresh" ? "ok" : (f === "stale" ? "stale" : "mid")}"><span class="dot"></span><span>${esc(line)}</span></p>`;
    }

    /* Pergantian lokasi: yang lama meluncur naik dan memudar, yang baru muncul dari bawah. */
    const changed = known && key !== prevKey;
    const old = box.querySelector(".loc");
    let ghost = null;
    if (changed && old) {
        ghost = old.cloneNode(true);
        ghost.classList.remove("loc");
        ghost.classList.add("loc-old");
        ghost.setAttribute("aria-hidden", "true");
    }
    /* Kalau lama dan baru sama-sama kamar, label "Kamar" tetap diam; hanya angkanya yang bergerak. */
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
    const diff = L.right.length - L.left.length;
    const spacers = diff > 0 ? '<div class="room spacer" aria-hidden="true"></div>'.repeat(diff) : '';
    $("#colL").innerHTML = spacers + L.left.map(btn).join("");
    const diffR = L.left.length - L.right.length;
    const spacersR = diffR > 0 ? '<div class="room spacer" aria-hidden="true"></div>'.repeat(diffR) : '';
    $("#colR").innerHTML = spacersR + L.right.map(btn).join("");
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
            html += `<h3 class="day">${esc(d)}</h3><ul class="hist">`;
            lastDay = d;
        }
        html += `<li${i === 0 ? ' class="cur"' : ""}><time datetime="${new Date(h.at).toISOString()}">${clock(h.at)}</time><i class="hd" aria-hidden="true"></i>
      <span class="hl">${esc(locText(h.loc, L))}</span>${h.name ? `<span class="who">${esc(h.name)}</span>` : ""}</li>`;
    });
    box.innerHTML = html + "</ul>" + (hasMore ? "</div></div>" : "");
    more.hidden = !hasMore;
    if (hasMore) syncMore();
}
function render() { renderTop(); renderBanner(); renderStatus(); renderPlan(); renderHist(); }

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
    loading = false; render();
}
function selectLorong(id, fromHash) {
    if (!CONFIG.LORONG.some(l => l.id === id)) id = CONFIG.LORONG[0].id;
    cur = id; S = norm(null); loaded = false; showAllHist = false; prevRoomKey = undefined;
    if (!fromHash) { try { history.replaceState(null, "", "#l=" + encodeURIComponent(id)); } catch (e) { } }
    refresh(false);
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
    const finish = () => {
        dlg.classList.remove("closing");
        if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
    };
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
    const title = name === "pick" ? $("#pkTitle") : $("#cfTitle");
    dlg.setAttribute("aria-labelledby", title.id);
    title.focus();   // fokus ke judul, bukan kolom isian, agar keyboard HP tidak langsung muncul
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
    if (loading && !loaded) { toast("Data masih dimuat. Coba lagi sebentar."); return; }
    $("#q").value = ""; $("#otherIn").value = ""; $("#otherErr").textContent = "";
    $("#otherBox").hidden = true;
    renderOpts(); showPane("pick"); openDialog(); $("#pkTitle").focus();
}
function openConfirm(loc) {
    const L = curL();
    pendingLoc = loc;
    const p = parseLoc(loc);
    $("#cfTitle").textContent = p.kind === "storage"
        ? `Setrika dikembalikan ke ${L.storage}?`
        : `Setrika sekarang di ${locText(loc, L)}?`;
    $("#fName").value = profile.get().name || "";
    $("#cfErr").textContent = "";
    $("#cfOk").disabled = false; $("#cfOk").textContent = "Konfirmasi";
    showPane("confirm"); openDialog(); $("#cfTitle").focus();
}

function validateOther(raw) {
    const L = curL();
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return { error: "Isi lokasinya dulu." };
    if (text.length < 2) return { error: "Lokasi terlalu pendek." };
    if (text.length > 40) return { error: "Maksimal 40 karakter." };
    if (!/^[\p{L}\p{N} .,\-\/()]+$/u.test(text)) return { error: "Pakai huruf, angka, atau tanda baca biasa (. , - /)." };
    if (!/[\p{L}\p{N}]/u.test(text)) return { error: "Lokasi harus memuat huruf atau angka." };
    const room = matchRoom(L, text);
    if (room) return { loc: "room:" + room.id };
    if (/^(kamar\s*)?[a-z]{0,2}\s?-?\d{1,4}$/i.test(text)) return { error: "Kamar itu tidak ada di " + L.name + ". Pilih dari daftar, atau tulis lokasi lain." };
    return { loc: "other:" + text };
}

async function submitConfirm() {
    const btn = $("#cfOk"), err = $("#cfErr");
    const name = $("#fName").value.replace(/\s+/g, " ").trim();
    if (name.length > 30) { err.textContent = "Nama maksimal 30 karakter."; return; }
    if (!pendingLoc) { err.textContent = "Lokasi belum dipilih."; return; }
    btn.disabled = true; btn.textContent = "Menyimpan..."; err.textContent = "";
    try {
        const fresh = await Store.load(cur);   // ambil riwayat terbaru agar tidak menimpa perubahan orang lain
        const now = Date.now();
        const next = {
            loc: pendingLoc, name, at: now,
            history: [{ loc: pendingLoc, name, at: now }, ...fresh.history].slice(0, CONFIG.HISTORY_MAX)
        };
        await Store.save(cur, next);
        profile.set({ name });
        S = await Store.load(cur); loaded = true; error = "";
        closeDialog(); render();
        toast("Lokasi setrika berhasil diperbarui.", true);
        $("#announce").textContent = "Setrika sekarang di " + locText(next.loc, curL());
    } catch (e) {
        err.textContent = "Gagal menyimpan. Cek koneksi internet, lalu coba lagi.";
        btn.disabled = false; btn.textContent = "Konfirmasi";
    }
}

/* ===== Toast ===== */
let toastTimer;
function toast(t, ok) {
    const el = $("#toast");
    $("#toastTxt").textContent = t;
    el.querySelector(".ic").hidden = !ok;
    el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

/* ===== Event ===== */
$("#btnUpdate").addEventListener("click", openPick);
$("#lorongSel").addEventListener("change", e => selectLorong(e.target.value, false));
$("#banner").addEventListener("click", e => { if (e.target.closest("#btnRetry")) refresh(false); });
$("#btnMore").addEventListener("click", () => {
    showAllHist = !showAllHist;
    const m = $("#histMore"); if (m) m.classList.toggle("open", showAllHist);
    syncMore();
});

document.querySelector(".floor").addEventListener("click", e => {
    const b = e.target.closest(".room"); if (!b) return;
    if (loading && !loaded) { toast("Data masih dimuat. Coba lagi sebentar."); return; }
    const loc = "room:" + b.dataset.room;
    if (S.loc === loc) { toast("Setrika sudah tercatat di " + locText(loc, curL()) + "."); return; }
    openConfirm(loc);
});

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
    $("#otherErr").textContent = "";
    openConfirm(r.loc);
});
$("#pkCancel").addEventListener("click", closeDialog);
$("#cfCancel").addEventListener("click", closeDialog);
$("#cfBack").addEventListener("click", () => { renderOpts(); showPane("pick"); });
$("#cfOk").addEventListener("click", submitConfirm);
$("#fName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submitConfirm(); } });
dlg.addEventListener("click", e => { if (e.target === dlg) closeDialog(); });
dlg.addEventListener("cancel", e => { e.preventDefault(); closeDialog(); });   // tombol Escape ikut animasi tutup

/* ===== Mulai ===== */
(function init() {
    const m = /[#&]l=([^&]+)/.exec(location.hash);
    render();
    selectLorong(m ? decodeURIComponent(m[1]) : cur, true);
    setInterval(() => { if (loaded) { renderStatus(); renderHist(); } }, 30000);

    if (Store.mode === "cloud") {
        setupRealtime();
    } else {
        window.addEventListener("storage", () => refresh(true));
    }

    document.addEventListener("visibilitychange", () => { if (!document.hidden && !dlg.open) refresh(true); });
})();
