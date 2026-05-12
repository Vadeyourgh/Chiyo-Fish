// ==UserScript==
// @name         Fishin' Chiyo - Auto v12
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  Auto CAST + Sell + Clean + Boss + Hook Set Fight + Upgrade + Charter + Pet-Safe Rebirth + Equip Best Pet + Auto Buy/Hatch Eggs — Glass-morphism GUI
// @match        https://fishin-chiyo.vercel.app/*
// @match        *://fishin-chiyo.vercel.app/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ── TIMING CONSTANTS ──────────────────────────────────────────────────────
    const SCAN_MS = 16;
    const CLICK_COOLDOWN = 200;
    const START_DELAY = 600;
    const CAST_DELAY = 500;
    const UPGRADE_DELAY = 300;
    const SELL_COOLDOWN = 2000;
    const WATER_CHECK_INTERVAL = 30000;
    const PET_EQUIP_INTERVAL = 60000;
    const EGG_CHECK_INTERVAL = 30000;

    // ── STATE ─────────────────────────────────────────────────────────────────
    let running = false;
    let loop = null;
    let hits = 0, casts = 0, closed = 0, upgrades = 0, charters = 0;
    let bosses = 0, dirHits = 0, reelHits = 0, holdStarts = 0;
    let rebirths = 0, petEquips = 0, eggsHatched = 0;
    let lastClickTime = 0, lastCastTime = 0, lastUpgradeTime = 0, lastSellTime = 0;
    let lastWaterCheck = 0, lastPetEquipCheck = 0, lastEggCheck = 0;

    let itemLimits = JSON.parse(localStorage.getItem('chiyo_limits') || '{}');
    let itemEnabled = JSON.parse(localStorage.getItem('chiyo_enabled') || '{}');

    function saveLimits() { localStorage.setItem('chiyo_limits', JSON.stringify(itemLimits)); }
    function saveEnabled() { localStorage.setItem('chiyo_enabled', JSON.stringify(itemEnabled)); }

    // ── HOLD STATE ────────────────────────────────────────────────────────────
    let holdActive = false;
    let holdTarget = null;
    let holdCheckInt = null;

    // ── DRAG STATE ────────────────────────────────────────────────────────────
    let isDragging = false;
    let dragOffX = 0, dragOffY = 0;
    const savedPos = JSON.parse(localStorage.getItem('chiyo_pos') || 'null');

    // ── COMPACT STATE ─────────────────────────────────────────────────────────
    let isCompact = localStorage.getItem('chiyo_compact') === 'true';

    // ── TAB TRACKING ──────────────────────────────────────────────────────────
    let waterTabOpen = false;
    let waterOpenedAt = 0;
    let rebirthTabOpen = false;
    let itemsTabOpen = false;
    let petTabOpen = false;
    let petsVerifiedForRebirth = false;
    let rebirthPending = false;

    // ── PET RARITY ────────────────────────────────────────────────────────────
    const RARITY_RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 };



    // ── STYLES — GLASS-MORPHISM ───────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        #chiyoWrap {
            position: fixed;
            top: ${savedPos ? savedPos.y + 'px' : '10px'};
            left: ${savedPos ? savedPos.x + 'px' : '50%'};
            ${savedPos ? '' : 'transform: translateX(-50%);'}
            z-index: 999999; display: flex; flex-direction: column; align-items: stretch; gap: 6px;
            font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 11px; color: #e0f0ff;
            user-select: none;
        }
        #chiyoWrap.dragging { opacity: 0.85; }

        #chiyoPanel {
            display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
            background: rgba(12, 20, 35, 0.82);
            backdrop-filter: blur(16px) saturate(1.4);
            -webkit-backdrop-filter: blur(16px) saturate(1.4);
            border: 1px solid rgba(80, 200, 220, 0.25);
            border-radius: 12px; padding: 6px 12px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05);
            cursor: grab;
            transition: box-shadow 0.3s, border-color 0.3s;
        }
        #chiyoPanel:hover {
            border-color: rgba(80, 200, 220, 0.45);
            box-shadow: 0 4px 32px rgba(0, 180, 200, 0.15), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        #chiyoPanel.grabbing { cursor: grabbing; }

        #chiyoPanel .led {
            width: 8px; height: 8px; border-radius: 50%; background: #2a3a4a; flex-shrink: 0;
            transition: background 0.15s, box-shadow 0.15s;
        }
        #chiyoPanel .led.on    { background: #00e89d; box-shadow: 0 0 8px #00e89d; }
        #chiyoPanel .led.hit   { background: #40c8ff; box-shadow: 0 0 8px #40c8ff; }
        #chiyoPanel .led.wait  { background: #ffb040; box-shadow: 0 0 8px #ffb040; }
        #chiyoPanel .led.cast  { background: #c060ff; box-shadow: 0 0 8px #c060ff; }
        #chiyoPanel .led.cls   { background: #ff5070; box-shadow: 0 0 8px #ff5070; }
        #chiyoPanel .led.upg   { background: #60ffb0; box-shadow: 0 0 8px #60ffb0; }
        #chiyoPanel .led.boss  { background: #ff4060; box-shadow: 0 0 10px #ff4060; }
        #chiyoPanel .led.fight { background: #ffd740; box-shadow: 0 0 8px #ffd740; }
        #chiyoPanel .led.hold  { background: #00d4ff; box-shadow: 0 0 10px #00d4ff; }
        #chiyoPanel .led.rb    { background: #c080ff; box-shadow: 0 0 10px #c080ff; }
        #chiyoPanel .led.egg   { background: #ff80c0; box-shadow: 0 0 8px #ff80c0; }

        #chiyoPanel button, #chiyoUpgradePanel button {
            background: rgba(20, 40, 60, 0.7);
            border: 1px solid rgba(80, 200, 220, 0.3);
            border-radius: 6px;
            color: #b0e8f0; font-family: inherit; font-size: 10px;
            padding: 3px 8px; cursor: pointer; line-height: 1.3;
            transition: all 0.2s ease;
        }
        #chiyoPanel button:hover {
            background: rgba(30, 60, 90, 0.8);
            border-color: rgba(80, 220, 240, 0.6);
            box-shadow: 0 0 12px rgba(80, 200, 220, 0.2);
            color: #fff;
        }
        #chiyoPanel button.on {
            background: rgba(0, 80, 60, 0.5);
            border-color: rgba(0, 232, 157, 0.6);
            color: #80ffc0;
            box-shadow: 0 0 10px rgba(0, 232, 157, 0.2);
        }

        #chiyoPanel .sep { opacity: 0.25; font-size: 10px; color: #4a8a9a; }

        .chiyo-badge {
            display: inline-flex; align-items: center; gap: 3px;
            background: rgba(20, 50, 70, 0.6);
            border: 1px solid rgba(80, 200, 220, 0.15);
            border-radius: 8px; padding: 2px 6px;
            font-size: 9px; color: #90d8e8;
            transition: border-color 0.2s;
        }
        .chiyo-badge .badge-label { opacity: 0.6; font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .chiyo-badge .badge-val { font-weight: 600; color: #c0f0ff; }
        .chiyo-badge.badge-cast .badge-val { color: #c080ff; }
        .chiyo-badge.badge-hit .badge-val { color: #40c8ff; }
        .chiyo-badge.badge-boss .badge-val { color: #ff6080; }
        .chiyo-badge.badge-fight .badge-val { color: #ffd740; }
        .chiyo-badge.badge-upg .badge-val { color: #60ffb0; }
        .chiyo-badge.badge-rb .badge-val { color: #c080ff; }
        .chiyo-badge.badge-ch .badge-val { color: #80d0ff; }
        .chiyo-badge.badge-pet .badge-val { color: #ff80c0; }
        .chiyo-badge.badge-egg .badge-val { color: #ffb060; }

        .chiyo-status {
            font-size: 10px; opacity: 0.8; max-width: 120px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            color: #80c8d8;
        }

        /* Pet/Egg row */
        #chiyoPetRow {
            display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
            padding: 3px 12px 0; font-size: 9px; color: #70a8b8;
        }
        #chiyoPetRow .pet-info { opacity: 0.7; }

        /* Compact mode */
        #chiyoWrap.compact #chiyoStats { display: none; }
        #chiyoWrap.compact #chiyoPetRow { display: none; }
        #chiyoWrap.compact #chiyoPanel { padding: 4px 10px; border-radius: 10px; }

        #chiyoStats {
            display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
            padding: 2px 12px 0;
        }

        #chiyoUpgradePanel {
            background: rgba(12, 20, 35, 0.92);
            backdrop-filter: blur(16px) saturate(1.4);
            -webkit-backdrop-filter: blur(16px) saturate(1.4);
            border: 1px solid rgba(80, 200, 220, 0.2);
            border-radius: 12px; padding: 10px 14px; min-width: 300px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
            display: none; flex-direction: column; gap: 6px;
        }
        #chiyoUpgradePanel.open { display: flex; }
        #chiyoUpgradePanel .up-title {
            font-size: 11px; color: #60d8e8; border-bottom: 1px solid rgba(80, 200, 220, 0.15);
            padding-bottom: 6px; margin-bottom: 4px; display: flex;
            justify-content: space-between; align-items: center; font-weight: 600;
        }
        #chiyoUpgradePanel .up-title button {
            padding: 2px 8px; font-size: 9px; border-color: rgba(255,255,255,0.1); color: #6a9aaa;
        }
        #chiyoUpgradePanel .up-title button:hover { color: #b0f0ff; border-color: rgba(80,200,220,0.4); }
        #chiyoUpgradePanel .item-row {
            display: flex; align-items: center; gap: 6px;
            padding: 4px 0; border-bottom: 1px solid rgba(80, 200, 220, 0.06);
        }
        #chiyoUpgradePanel .item-row:last-child { border-bottom: none; }
        #chiyoUpgradePanel .item-check  { width: 12px; height: 12px; cursor: pointer; accent-color: #00e89d; flex-shrink: 0; }
        #chiyoUpgradePanel .item-name   { flex: 1; font-size: 10px; color: #c0e8f0; }
        #chiyoUpgradePanel .item-lv     { font-size: 9px; color: #5a8a9a; min-width: 38px; }
        #chiyoUpgradePanel .item-limit-label { font-size: 9px; color: #5a8a9a; }
        #chiyoUpgradePanel .item-limit  {
            width: 42px; background: rgba(10, 20, 30, 0.8);
            border: 1px solid rgba(80, 200, 220, 0.2);
            border-radius: 4px; color: #b0e8f0; font-family: inherit;
            font-size: 10px; padding: 2px 4px; text-align: center;
        }
        #chiyoUpgradePanel .item-limit:focus { outline: none; border-color: rgba(80, 200, 220, 0.6); }
        #chiyoUpgradePanel .add-row {
            display: flex; gap: 6px; margin-top: 4px; padding-top: 6px;
            border-top: 1px solid rgba(80, 200, 220, 0.1);
        }
        #chiyoUpgradePanel .add-input {
            flex: 1; background: rgba(10, 20, 30, 0.8);
            border: 1px solid rgba(80, 200, 220, 0.2);
            border-radius: 4px; color: #b0e8f0; font-family: inherit;
            font-size: 10px; padding: 3px 6px;
        }
        #chiyoUpgradePanel .add-input:focus { outline: none; border-color: rgba(80, 200, 220, 0.5); }
        #chiyoUpgradePanel .add-btn {
            background: rgba(0, 80, 60, 0.4); border-color: rgba(0, 232, 157, 0.4);
            color: #80ffc0; padding: 3px 10px;
        }
        #chiyoUpgradePanel .add-btn:hover { background: rgba(0, 100, 80, 0.5); box-shadow: 0 0 8px rgba(0,232,157,0.2); }
        #chiyoUpgradePanel .empty-hint { font-size: 9px; color: #3a6a7a; text-align: center; padding: 6px 0; }
    `;
    document.head.appendChild(style);



    // ── HTML ──────────────────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.id = 'chiyoWrap';
    if (isCompact) wrap.classList.add('compact');
    wrap.innerHTML = `
        <div id="chiyoPanel">
            <div class="led" id="cLed"></div>
            <button id="cBtn">&#9654;</button>
            <span class="sep">|</span>
            <span class="chiyo-status" id="cSt">standby</span>
            <span class="sep">|</span>
            <button id="cCompactBtn" title="Toggle compact">${isCompact ? '&#9723;' : '&#9724;'}</button>
            <button id="cUpgBtn" title="Upgrade settings">&#9881;</button>
            <div id="chiyoStats">
                <span class="chiyo-badge badge-cast"><span class="badge-label">Cast</span><span class="badge-val" id="cCasts">0</span></span>
                <span class="chiyo-badge badge-hit"><span class="badge-label">Hit</span><span class="badge-val" id="cHits">0</span></span>
                <span class="chiyo-badge badge-boss"><span class="badge-label">Boss</span><span class="badge-val" id="cBoss">0</span></span>
                <span class="chiyo-badge badge-fight"><span class="badge-label">Fight</span><span class="badge-val" id="cFight">0</span>/<span class="badge-val" id="cReel">0</span>/<span class="badge-val" id="cHold">0</span></span>
                <span class="chiyo-badge badge-upg"><span class="badge-label">Upg</span><span class="badge-val" id="cUpg">0</span></span>
                <span class="chiyo-badge badge-rb"><span class="badge-label">Rb</span><span class="badge-val" id="cRebirth">0</span></span>
                <span class="chiyo-badge badge-ch"><span class="badge-label">Ch</span><span class="badge-val" id="cCharters">0</span></span>
                <span class="chiyo-badge badge-pet"><span class="badge-label">Pet</span><span class="badge-val" id="cPets">0</span></span>
                <span class="chiyo-badge badge-egg"><span class="badge-label">Egg</span><span class="badge-val" id="cEggs">0</span></span>
            </div>
        </div>
        <div id="chiyoPetRow">
            <span class="pet-info" id="cPetStatus">Pets: --</span>
            <span class="pet-info" id="cEggStatus">Eggs: --</span>
        </div>
        <div id="chiyoUpgradePanel">
            <div class="up-title">
                <span>&#9881; AUTO UPGRADE</span>
                <button id="upCloseBtn">&#10005;</button>
            </div>
            <div id="upItemList"></div>
            <div class="add-row">
                <input class="add-input" id="upAddName"  placeholder="Item name" />
                <input class="add-input" id="upAddLimit" placeholder="Max" style="width:48px;flex:none" />
                <button class="add-btn" id="upAddBtn">+</button>
            </div>
        </div>
    `;
    document.body.appendChild(wrap);



    // ── DRAG LOGIC ────────────────────────────────────────────────────────────
    const panel = document.getElementById('chiyoPanel');

    panel.addEventListener('mousedown', e => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true;
        wrap.classList.add('dragging');
        panel.classList.add('grabbing');
        const rect = wrap.getBoundingClientRect();
        dragOffX = e.clientX - rect.left;
        dragOffY = e.clientY - rect.top;
        wrap.style.transform = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        let x = e.clientX - dragOffX;
        let y = e.clientY - dragOffY;
        x = Math.max(0, Math.min(window.innerWidth - 100, x));
        y = Math.max(0, Math.min(window.innerHeight - 30, y));
        wrap.style.left = x + 'px';
        wrap.style.top = y + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        wrap.classList.remove('dragging');
        panel.classList.remove('grabbing');
        localStorage.setItem('chiyo_pos', JSON.stringify({
            x: parseInt(wrap.style.left),
            y: parseInt(wrap.style.top)
        }));
    });

    // ── ELEMENT REFS ──────────────────────────────────────────────────────────
    const led = document.getElementById('cLed');
    const btn = document.getElementById('cBtn');
    const hitsEl = document.getElementById('cHits');
    const castsEl = document.getElementById('cCasts');
    const upgEl = document.getElementById('cUpg');
    const chartersEl = document.getElementById('cCharters');
    const bossEl = document.getElementById('cBoss');
    const fightEl = document.getElementById('cFight');
    const reelEl = document.getElementById('cReel');
    const holdEl = document.getElementById('cHold');
    const rebirthEl = document.getElementById('cRebirth');
    const petEquipEl = document.getElementById('cPets');
    const eggsEl = document.getElementById('cEggs');
    const stEl = document.getElementById('cSt');
    const petStatusEl = document.getElementById('cPetStatus');
    const eggStatusEl = document.getElementById('cEggStatus');
    const upPanel = document.getElementById('chiyoUpgradePanel');
    const upList = document.getElementById('upItemList');
    const upAddName = document.getElementById('upAddName');
    const upAddLimit = document.getElementById('upAddLimit');

    function setLed(s) { led.className = 'led' + (s ? ' ' + s : ''); }
    function setSt(t) { stEl.textContent = t; }
    function addHit() { hits++; hitsEl.textContent = hits; }
    function addCast() { casts++; castsEl.textContent = casts; }
    function addUpg() { upgrades++; upgEl.textContent = upgrades; }
    function addCharter() { charters++; chartersEl.textContent = charters; }
    function addBoss() { bosses++; bossEl.textContent = bosses; }
    function addDir() { dirHits++; fightEl.textContent = dirHits; }
    function addReel() { reelHits++; reelEl.textContent = reelHits; }
    function addHold() { holdStarts++; holdEl.textContent = holdStarts; }
    function addRebirth() { rebirths++; rebirthEl.textContent = rebirths; }
    function addPetEquip() { petEquips++; petEquipEl.textContent = petEquips; }
    function addEgg() { eggsHatched++; eggsEl.textContent = eggsHatched; }

    // ── COMPACT TOGGLE ────────────────────────────────────────────────────────
    const compactBtn = document.getElementById('cCompactBtn');
    compactBtn.addEventListener('click', () => {
        isCompact = !isCompact;
        wrap.classList.toggle('compact', isCompact);
        compactBtn.innerHTML = isCompact ? '&#9723;' : '&#9724;';
        localStorage.setItem('chiyo_compact', isCompact);
    });



    // ── UPGRADE UI ────────────────────────────────────────────────────────────
    function renderUpgradeList() {
        const items = Object.keys(itemLimits);
        if (items.length === 0) {
            upList.innerHTML = '<div class="empty-hint">No items yet. Add below or wait for auto-detect.</div>';
            return;
        }
        upList.innerHTML = items.map(name => {
            const enabled = itemEnabled[name] !== false;
            const limit = itemLimits[name] || 0;
            const curLv = getCurrentLevel(name);
            const lvTxt = curLv !== null ? `Lv${curLv}` : '\u2013';
            return `
            <div class="item-row" data-item="${name}">
                <input type="checkbox" class="item-check" data-item="${name}" ${enabled ? 'checked' : ''}>
                <span class="item-name">${name}</span>
                <span class="item-lv" id="lv-${name}">${lvTxt}</span>
                <span class="item-limit-label">max:</span>
                <input type="number" class="item-limit" data-item="${name}" value="${limit}" min="0" max="9999">
                <button class="del-btn" data-item="${name}" style="padding:2px 6px;font-size:9px;border-color:rgba(255,80,80,0.3);color:#a08080;">&#10005;</button>
            </div>`;
        }).join('');

        upList.querySelectorAll('.item-check').forEach(el => {
            el.addEventListener('change', e => { itemEnabled[e.target.dataset.item] = e.target.checked; saveEnabled(); });
        });
        upList.querySelectorAll('.item-limit').forEach(el => {
            el.addEventListener('change', e => { itemLimits[e.target.dataset.item] = parseInt(e.target.value) || 0; saveLimits(); });
        });
        upList.querySelectorAll('.del-btn').forEach(el => {
            el.addEventListener('click', e => {
                const n = e.target.dataset.item;
                delete itemLimits[n]; delete itemEnabled[n];
                saveLimits(); saveEnabled(); renderUpgradeList();
            });
        });
    }

    document.getElementById('cUpgBtn').addEventListener('click', () => {
        upPanel.classList.toggle('open');
        if (upPanel.classList.contains('open')) renderUpgradeList();
    });
    document.getElementById('upCloseBtn').addEventListener('click', () => upPanel.classList.remove('open'));
    document.getElementById('upAddBtn').addEventListener('click', () => {
        const name = upAddName.value.trim();
        const limit = parseInt(upAddLimit.value) || 99;
        if (!name) return;
        itemLimits[name] = limit; itemEnabled[name] = true;
        saveLimits(); saveEnabled();
        upAddName.value = ''; upAddLimit.value = '';
        renderUpgradeList();
    });



    // ── HELPERS ───────────────────────────────────────────────────────────────
    function clickEl(el) {
        if (!el) return;
        el.focus && el.focus();
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(ev =>
            el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }))
        );
    }

    function holdEl2(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse' }));
    }

    function releaseEl(el) {
        if (!el) return;
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' }));
    }

    function getMarkerLeft(marker) {
        const s = marker.style.left;
        if (s && s.includes('%')) return parseFloat(s);
        const track = marker.closest('.cleaning-track');
        if (!track) return null;
        const tR = track.getBoundingClientRect();
        const mR = marker.getBoundingClientRect();
        return ((mR.left - tR.left) / tR.width) * 100;
    }

    function getZoneRange(zone, track) {
        const tR = track.getBoundingClientRect();
        const zR = zone.getBoundingClientRect();
        return {
            left: ((zR.left - tR.left) / tR.width) * 100,
            right: ((zR.right - tR.left) / tR.width) * 100,
        };
    }

    function getCurrentLevel(itemName) {
        const cards = document.querySelectorAll('div.upgrade');
        for (const card of cards) {
            const txt = card.textContent.trim();
            const m = txt.match(/^([A-Za-z\s]+?)Lv\s+(\d+)/);
            if (m && m[1].trim().toLowerCase() === itemName.toLowerCase()) return parseInt(m[2]);
            const nameEl = card.querySelector('.name');
            if (!nameEl) continue;
            if (nameEl.textContent.trim().toLowerCase() !== itemName.toLowerCase()) continue;
            const lvEl = card.querySelector('.lvl');
            if (lvEl) { const lm = lvEl.textContent.match(/\d+/); return lm ? parseInt(lm[0]) : null; }
        }
        return null;
    }

    function findUpgradeCard(itemName) {
        const cards = document.querySelectorAll('div.upgrade');
        for (const card of cards) {
            const txt = card.textContent.trim();
            const m = txt.match(/^([A-Za-z\s]+?)Lv/);
            if (m && m[1].trim().toLowerCase() === itemName.toLowerCase()) return card;
            const nameEl = card.querySelector('.name');
            if (nameEl && nameEl.textContent.trim().toLowerCase() === itemName.toLowerCase()) return card;
        }
        return null;
    }

    function getBuyButton(card) {
        const btns = card.querySelectorAll('button.buy');
        for (const b of btns) {
            if (b.classList.contains('use')) continue;
            if (b.disabled) continue;
            const r = b.getBoundingClientRect();
            if (r.width === 0) continue;
            return b;
        }
        return null;
    }

    function autoDetectItems() {
        const cards = document.querySelectorAll('div.upgrade');
        let changed = false;
        cards.forEach(card => {
            const txt = card.textContent.trim();
            const m = txt.match(/^([A-Za-z\s]+?)Lv/);
            const name = m ? m[1].trim() : card.querySelector('.name')?.textContent.trim();
            if (!name) return;
            if (!(name in itemLimits)) {
                itemLimits[name] = 0;
                itemEnabled[name] = false;
                changed = true;
            }
        });
        if (changed) {
            saveLimits(); saveEnabled();
            if (upPanel.classList.contains('open')) renderUpgradeList();
        }
    }

    function findClosePopup() {
        const candidates = [...document.querySelectorAll('button, [role="button"]')].filter(el => {
            if (el.closest('#chiyoWrap')) return false;
            const txt = el.textContent.trim();
            return txt === 'X' || txt === 'x' || txt === '\u00d7' || txt === '\u2715';
        });
        for (const el of candidates) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.top > 0) return el;
        }
        return null;
    }

    function findCatchPopup() {
        const keywords = ['rare catch', '1 in '];
        for (const el of document.querySelectorAll('div, section')) {
            if (el.closest('#chiyoWrap')) continue;
            const txt = el.textContent.toLowerCase();
            const r = el.getBoundingClientRect();
            if (r.width < 100 || r.height < 50) continue;
            if (!keywords.some(k => txt.includes(k))) continue;
            if (txt.length > 600) continue;
            const xBtn = [...el.querySelectorAll('button')].find(b => {
                const t = b.textContent.trim();
                return t === 'X' || t === 'x' || t === '\u00d7' || t === '\u2715';
            });
            if (xBtn) return el;
        }
        return null;
    }

    let lastLvRefresh = 0;
    function refreshLevelDisplay() {
        const now = Date.now();
        if (now - lastLvRefresh < 1000) return;
        lastLvRefresh = now;
        Object.keys(itemLimits).forEach(name => {
            const el = document.getElementById('lv-' + name);
            if (!el) return;
            const lv = getCurrentLevel(name);
            el.textContent = lv !== null ? `Lv${lv}` : '\u2013';
        });
    }

    function parseKNum(s) {
        s = s.replace(/,/g, '').trim();
        const lower = s.toLowerCase();
        if (lower.endsWith('m')) return parseFloat(s) * 1_000_000;
        if (lower.endsWith('k')) return parseFloat(s) * 1_000;
        if (lower.endsWith('b')) return parseFloat(s) * 1_000_000_000;
        return parseFloat(s);
    }



    // ── TAB NAVIGATION ────────────────────────────────────────────────────────
    function getWaterTab() { return [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^waters?$/i.test(el.textContent.trim())); }
    function getUpgradeTab() { return [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^upgrade$/i.test(el.textContent.trim())); }
    function getRebirthTab() {
        return document.querySelector('.ico-rebirth')?.closest('button, a, [role="tab"]') ||
            [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^rebirth$/i.test(el.textContent.trim()));
    }
    function getItemsTab() {
        return document.querySelector('.ico-items')?.closest('button, a, [role="tab"]') ||
            [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^items$/i.test(el.textContent.trim()));
    }
    function getPetsTab() {
        return [...document.querySelectorAll('button.tab, button[class*="tab"]')].find(el =>
            !el.closest('#chiyoWrap') && /^pets$/i.test(el.textContent.trim())
        );
    }

    function openWaterTab() { const t = getWaterTab(); if (t) { clickEl(t); waterTabOpen = true; waterOpenedAt = Date.now(); } }
    function openUpgradeTab() { const t = getUpgradeTab(); if (t) { clickEl(t); waterTabOpen = false; rebirthTabOpen = false; itemsTabOpen = false; petTabOpen = false; } }
    function openRebirthTab() { const t = getRebirthTab(); if (t) { clickEl(t); rebirthTabOpen = true; } }
    function openItemsTab() { const t = getItemsTab(); if (t) { clickEl(t); itemsTabOpen = true; } }
    function openPetsTab() { const t = getPetsTab(); if (t) { clickEl(t); petTabOpen = true; } }

    function getCharterBtn() { return document.querySelector('button.charter-button'); }
    function getRebirthBtn() { return document.querySelector('button.rebirth-btn'); }

    // ── CHARTER HELPERS ───────────────────────────────────────────────────────
    function isFishdexFull() {
        const zone = document.querySelector('.zone-charter');
        if (!zone) return false;
        const m = zone.textContent.match(/Fishdex(\d+)\s*\/\s*(\d+)/i);
        return m ? parseInt(m[1]) >= parseInt(m[2]) : false;
    }

    function canAffordCharter() {
        const zone = document.querySelector('.zone-charter');
        if (!zone) return false;
        const m = zone.textContent.match(/Charter\s*fee\s*([\d.,]+[kKmMbB]?)\s*\/\s*([\d.,]+[kKmMbB]?)/i);
        if (!m) return false;
        return parseKNum(m[1]) >= parseKNum(m[2]);
    }

    function selectBestLocation() {
        const allCards = [...document.querySelectorAll('button.zone-card')].filter(c => !c.classList.contains('locked'));
        if (!allCards.length) return;
        let bestVal = -1, best = null, currentVal = -1;
        allCards.forEach(card => {
            const txt = card.textContent;
            const m = txt.match(/([\d.,]+[kKmMbB]?)/);
            if (!m) return;
            const val = parseKNum(m[1]);
            if (card.classList.contains('current')) { currentVal = val; }
            else if (val > bestVal) { bestVal = val; best = card; }
        });
        if (currentVal >= bestVal) return;
        if (best) clickEl(best);
    }

    // ── AUTO USE ITEMS ────────────────────────────────────────────────────────
    function autoUseItems() {
        const useBtns = [...document.querySelectorAll('button.buy.use')].filter(b => {
            if (b.disabled) return false;
            const spans = b.querySelectorAll('span');
            const label = spans[0]?.textContent?.trim().toUpperCase();
            if (label !== 'USE' && label !== 'USE ALL') return false;
            const count = parseInt(spans[spans.length - 1]?.textContent?.replace(/[^\d]/g, '')) || 0;
            return count > 0;
        });
        useBtns.forEach(b => clickEl(b));
        return useBtns.length;
    }



    // ── AUTO UPGRADE LOGIC ────────────────────────────────────────────────────
    function tryUpgrade() {
        const now = Date.now();
        if (now - lastUpgradeTime < UPGRADE_DELAY) return false;
        autoDetectItems();
        for (const [name, limit] of Object.entries(itemLimits)) {
            if (itemEnabled[name] === false) continue;
            if (limit <= 0) continue;
            const curLv = getCurrentLevel(name);
            if (curLv === null) continue;
            if (curLv >= limit) continue;
            const card = findUpgradeCard(name);
            if (!card) continue;
            const buyBtn = getBuyButton(card);
            if (!buyBtn) continue;
            lastUpgradeTime = now;
            clickEl(buyBtn);
            addUpg();
            setSt(`upg ${name} lv${curLv}`);
            setLed('upg');
            return true;
        }
        return false;
    }

    // ── HOOK SET FIGHT ────────────────────────────────────────────────────────
    function isFightActive() {
        return !!document.querySelector('.fight-overlay');
    }

    function getFightPhase() {
        const pc = document.querySelector('.fight-phase-content');
        if (!pc) {
            const holdBtn = [...document.querySelectorAll('button')].find(b =>
                b.offsetParent && (b.textContent.toLowerCase().includes('hold') || b.textContent.toLowerCase().includes('spacebar'))
            );
            if (holdBtn) return 'hold';
            return null;
        }
        if (pc.classList.contains('fight-phase-direction')) return 'direction';
        if (pc.classList.contains('fight-phase-reel')) return 'reel';
        if (pc.classList.contains('fight-phase-hold')) return 'hold';
        return null;
    }

    function processFight(now) {
        const phase = getFightPhase();

        if (!phase || !isFightActive()) {
            stopHold();
            return false;
        }

        if (phase === 'direction') {
            stopHold();
            const field = document.querySelector('.dir-field');
            if (!field) return true;
            const cls = field.className;
            let tug = null;
            if (cls.includes('dir-tugging-up')) tug = 'up';
            if (cls.includes('dir-tugging-down')) tug = 'down';
            if (cls.includes('dir-tugging-left')) tug = 'left';
            if (cls.includes('dir-tugging-right')) tug = 'right';
            if (!tug) return true;
            const counter = { up: 'down', down: 'up', left: 'right', right: 'left' }[tug];
            const dirBtn = document.querySelector(`button.dir-zone-${counter}`);
            if (dirBtn && !dirBtn.disabled) {
                setLed('fight');
                setSt(`DIR ${tug}\u2192${counter}`);
                clickEl(dirBtn);
                addDir();
            }
            return true;
        }

        if (phase === 'reel') {
            stopHold();
            const reelPhase = document.querySelector('.fight-reel-phase');
            const reelBtn = document.querySelector('button.fight-reel-button');
            if (!reelPhase || !reelBtn || reelBtn.disabled) return true;
            const fill = parseFloat(reelPhase.style.getPropertyValue('--reel-fill')) || 0;
            const target = parseFloat(reelPhase.style.getPropertyValue('--reel-target')) || 0;
            const perfect = parseFloat(reelPhase.style.getPropertyValue('--reel-perfect')) || 0;
            const isPerfect = reelPhase.classList.contains('fight-reel-perfect');
            setLed('fight');
            setSt(`REEL ${fill.toFixed(0)}%`);
            if (isPerfect || fill >= perfect || fill >= target) {
                clickEl(reelBtn);
                addReel();
            }
            return true;
        }

        if (phase === 'hold') {
            const holdArea = document.querySelector('.fight-hold-area') ||
                [...document.querySelectorAll('button')].find(b =>
                    b.offsetParent && (b.textContent.toLowerCase().includes('hold') || b.textContent.toLowerCase().includes('spacebar'))
                );
            if (!holdArea) return true;
            if (!holdActive) {
                startHold(holdArea);
            }
            setLed('hold');
            setSt('HOLD');
            return true;
        }

        return true;
    }

    function startHold(el) {
        if (holdActive) return;
        holdTarget = el;
        holdActive = true;
        addHold();
        holdEl2(el);
        holdCheckInt = setInterval(() => {
            if (!isFightActive() || getFightPhase() !== 'hold') stopHold();
        }, 80);
    }

    function stopHold() {
        if (!holdActive) return;
        if (holdTarget) releaseEl(holdTarget);
        holdTarget = null;
        holdActive = false;
        if (holdCheckInt) { clearInterval(holdCheckInt); holdCheckInt = null; }
    }



    // ── AUTO EQUIP BEST PET ──────────────────────────────────────────────────
    function getCompanionSlots() {
        const metrics = document.querySelector('.hatchery-metrics');
        if (!metrics) return { current: 0, max: 1 };
        const m = metrics.textContent.match(/Companions\s*(\d+)\s*\/\s*(\d+)/i);
        if (!m) return { current: 0, max: 1 };
        return { current: parseInt(m[1]), max: parseInt(m[2]) };
    }

    function getOwnedPetCards() {
        return [...document.querySelectorAll('.pet-card:not(.locked)')].map(card => {
            const nameEl = card.querySelector('.pet-name');
            const rarityEl = card.querySelector('.pet-rarity');
            const levelEl = card.querySelector('.pet-level');
            if (!nameEl || !rarityEl || !levelEl) return null;

            const name = nameEl.textContent.trim();
            const rarity = rarityEl.textContent.trim().toLowerCase();
            const lvMatch = levelEl.textContent.match(/Lv\s*(\d+)/i);
            const level = lvMatch ? parseInt(lvMatch[1]) : 0;
            const isEquipped = card.classList.contains('equipped');

            const equipBtn = [...card.querySelectorAll('button')].find(b => {
                const t = b.textContent.trim().toUpperCase();
                return t === 'EQUIP' || t === 'UNEQUIP';
            });

            return { name, rarity, level, rank: RARITY_RANK[rarity] || 0, isEquipped, equipBtn, card };
        }).filter(Boolean);
    }

    function areBestPetsEquipped() {
        // Returns true if all best pets are already equipped
        const slots = getCompanionSlots();
        const pets = getOwnedPetCards();
        if (pets.length === 0) return true; // no pets = nothing to worry about

        pets.sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            return b.level - a.level;
        });

        const bestPets = pets.slice(0, slots.max);
        return bestPets.every(p => p.isEquipped);
    }

    function tryAutoEquipBestPets() {
        const now = Date.now();
        if (now - lastPetEquipCheck < PET_EQUIP_INTERVAL) return false;
        lastPetEquipCheck = now;

        // If pets tab is not open, open it and return (will process next cycle)
        const petsTabActive = document.querySelector('button.tab.active');
        if (!petsTabActive || !/^pets$/i.test(petsTabActive.textContent.trim())) {
            openPetsTab();
            setSt('check pets');
            return true;
        }

        const slots = getCompanionSlots();
        const pets = getOwnedPetCards();

        if (pets.length === 0) {
            petTabOpen = false;
            petStatusEl.textContent = 'Pets: none';
            openUpgradeTab();
            return false;
        }

        // Sort by rank (rarity) desc, then level desc
        pets.sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            return b.level - a.level;
        });

        const bestPets = pets.slice(0, slots.max);
        const otherPets = pets.slice(slots.max);

        // Update pet status display
        const equipped = pets.filter(p => p.isEquipped);
        petStatusEl.textContent = `Pets: ${equipped.length}/${slots.max} equipped | Best: ${bestPets.map(p => p.name).join(', ')}`;

        // First: unequip any pet that shouldn't be equipped
        for (const pet of otherPets) {
            if (pet.isEquipped && pet.equipBtn) {
                setSt(`unequip ${pet.name}`);
                clickEl(pet.equipBtn);
                addPetEquip();
                petTabOpen = false;
                return true;
            }
        }

        // Then: equip best pets that aren't equipped yet
        for (const pet of bestPets) {
            if (!pet.isEquipped && pet.equipBtn) {
                setSt(`equip ${pet.name}`);
                clickEl(pet.equipBtn);
                addPetEquip();
                petTabOpen = false;
                return true;
            }
        }

        // All good
        petTabOpen = false;
        openUpgradeTab();
        return false;
    }



    // ── PET-SAFE REBIRTH ─────────────────────────────────────────────────────
    // Before rebirthing, we must verify best pets are equipped.
    // Flow: Open Pets tab -> verify -> only then proceed to rebirth
    // If pets NOT equipped -> equip them and skip rebirth this cycle

    function initiatePetSafeRebirth() {
        // Step 1: Open pets tab to check
        if (!petTabOpen) {
            openPetsTab();
            setSt('pre-rb: check pets');
            setLed('rb');
            return 'checking';
        }

        // Step 2: Verify pets are equipped
        const petsTabActive = document.querySelector('button.tab.active');
        if (!petsTabActive || !/^pets$/i.test(petsTabActive.textContent.trim())) {
            // Tab not ready yet, wait
            return 'checking';
        }

        const pets = getOwnedPetCards();
        if (pets.length === 0) {
            // No pets, safe to rebirth
            petsVerifiedForRebirth = true;
            petTabOpen = false;
            return 'verified';
        }

        const slots = getCompanionSlots();
        pets.sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            return b.level - a.level;
        });

        const bestPets = pets.slice(0, slots.max);
        const otherPets = pets.slice(slots.max);

        // Check if any non-best pets are equipped (unequip them first)
        for (const pet of otherPets) {
            if (pet.isEquipped && pet.equipBtn) {
                setSt(`pre-rb: unequip ${pet.name}`);
                clickEl(pet.equipBtn);
                addPetEquip();
                return 'equipping'; // Not ready yet
            }
        }

        // Check if best pets need equipping
        for (const pet of bestPets) {
            if (!pet.isEquipped && pet.equipBtn) {
                setSt(`pre-rb: equip ${pet.name}`);
                clickEl(pet.equipBtn);
                addPetEquip();
                return 'equipping'; // Not ready yet
            }
        }

        // All best pets are equipped!
        petsVerifiedForRebirth = true;
        petTabOpen = false;
        return 'verified';
    }



    // ── AUTO BUY BEST EGG & HATCH ────────────────────────────────────────────
    // Strategy: Buy the most expensive unlocked egg, then hatch it into an open slot
    // Runs every EGG_CHECK_INTERVAL or when hatch slots are empty

    function getUnlockedEggCards() {
        // Get egg cards that are NOT locked
        return [...document.querySelectorAll('.egg-card:not(.locked)')];
    }

    function getEggPrice(eggCard) {
        // BUY button text is like "BUY250c", "BUY575c", "BUY1.2kc"
        const buyBtn = eggCard.querySelector('button.buy:not(.use)');
        if (!buyBtn) return -1;
        const txt = buyBtn.textContent.trim();
        const m = txt.match(/BUY\s*([\d.,]+[kKmMbB]?)/i);
        if (!m) return -1;
        return parseKNum(m[1]);
    }

    function getEggBuyButton(eggCard) {
        const btns = eggCard.querySelectorAll('button.buy');
        for (const b of btns) {
            if (b.classList.contains('use')) continue;
            if (b.disabled) continue;
            const txt = b.textContent.trim().toUpperCase();
            if (txt.startsWith('BUY')) return b;
        }
        return null;
    }

    function getEggHatchButton(eggCard) {
        // HATCH button has class .buy.use and text starts with "HATCH"
        const btns = eggCard.querySelectorAll('button.buy.use');
        for (const b of btns) {
            if (b.disabled) continue;
            const txt = b.textContent.trim().toUpperCase();
            if (txt.startsWith('HATCH')) return b;
        }
        return null;
    }

    function getOpenHatchSlots() {
        // Hatch slots: .hatch-slot without .locked, with text "Open"
        const slots = [...document.querySelectorAll('.hatch-slot:not(.locked)')];
        return slots.filter(slot => {
            const txt = slot.textContent.trim().toLowerCase();
            return txt.includes('open');
        });
    }

    function tryAutoBuyAndHatchEgg() {
        const now = Date.now();
        if (now - lastEggCheck < EGG_CHECK_INTERVAL) return false;
        lastEggCheck = now;

        // Must be on pets tab
        const petsTabActive = document.querySelector('button.tab.active');
        if (!petsTabActive || !/^pets$/i.test(petsTabActive.textContent.trim())) {
            openPetsTab();
            setSt('check eggs');
            setLed('egg');
            return true;
        }

        // Check for open hatch slots
        const openSlots = getOpenHatchSlots();
        if (openSlots.length === 0) {
            eggStatusEl.textContent = 'Eggs: no open slots';
            petTabOpen = false;
            openUpgradeTab();
            return false;
        }

        // Find the best (most expensive) unlocked egg
        const eggCards = getUnlockedEggCards();
        if (eggCards.length === 0) {
            eggStatusEl.textContent = 'Eggs: no eggs available';
            petTabOpen = false;
            openUpgradeTab();
            return false;
        }

        // Sort by price descending to find best egg
        let bestCard = null;
        let bestPrice = -1;
        for (const card of eggCards) {
            const price = getEggPrice(card);
            if (price > bestPrice) {
                bestPrice = price;
                bestCard = card;
            }
        }

        if (!bestCard) {
            petTabOpen = false;
            openUpgradeTab();
            return false;
        }

        // Try to hatch first (if already bought)
        const hatchBtn = getEggHatchButton(bestCard);
        if (hatchBtn) {
            setSt('hatch egg!');
            setLed('egg');
            clickEl(hatchBtn);
            addEgg();
            eggStatusEl.textContent = `Eggs: hatched! (${openSlots.length} slots)`;
            petTabOpen = false;
            setTimeout(() => openUpgradeTab(), 500);
            return true;
        }

        // Try to buy the best egg
        const buyBtn = getEggBuyButton(bestCard);
        if (buyBtn) {
            setSt(`buy egg ${bestPrice}`);
            setLed('egg');
            clickEl(buyBtn);
            eggStatusEl.textContent = `Eggs: buying (${bestPrice})`;
            // After buying, the HATCH button should appear - we'll catch it next cycle
            // Set a short delay to re-check for hatch
            lastEggCheck = now - EGG_CHECK_INTERVAL + 2000; // re-check in 2s
            return true;
        }

        petTabOpen = false;
        openUpgradeTab();
        return false;
    }



    // ── MAIN SCAN ─────────────────────────────────────────────────────────────
    function scan() {
        if (!running) return;
        const now = Date.now();

        // PRIORITY 0: Auto Sell
        if (now - lastSellTime > SELL_COOLDOWN) {
            const sellBtn = document.querySelector('button.sell') ||
                [...document.querySelectorAll('button')].find(b => !b.closest('#chiyoWrap') && /sell all/i.test(b.textContent));
            if (sellBtn && !sellBtn.disabled && sellBtn.offsetParent) {
                lastSellTime = now;
                clickEl(sellBtn);
                setSt('sell');
            }
        }

        // PRIORITY 0.3: Confirm Rebirth popup
        const confirmBtn = document.querySelector('button.btn-primary');
        if (confirmBtn && /^rebirth$/i.test(confirmBtn.textContent.trim())) {
            setLed('rb');
            setSt('rebirth!');
            clickEl(confirmBtn);
            addRebirth();
            rebirthTabOpen = false;
            rebirthPending = false;
            petsVerifiedForRebirth = false;
            setTimeout(() => openItemsTab(), 1500);
            return;
        }

        // PRIORITY 0.5: Boss fight
        const bossTargets = document.querySelectorAll('button.boss-target');
        if (bossTargets.length > 0) {
            setLed('boss');
            setSt(`boss x${bossTargets.length}`);
            bossTargets.forEach(t => { clickEl(t); addBoss(); });
            return;
        }

        // PRIORITY 0.7: Hook Set Fight
        if (isFightActive()) {
            processFight(now);
            return;
        } else {
            stopHold();
        }

        // PRIORITY 1: Close fish popup
        if (findCatchPopup()) {
            const closeBtn = findClosePopup();
            if (closeBtn) {
                setLed('cls');
                setSt('close popup');
                clickEl(closeBtn);
                return;
            }
        }

        // PRIORITY 1.5: Mini-game clean hook
        const track = document.querySelector('.cleaning-track');
        const marker = document.querySelector('.clean-marker');
        const zone = document.querySelector('.clean-zone');
        const ready = document.querySelector('.cleaning-scrub');

        if (track && marker && zone && ready) {
            const markerLeft = getMarkerLeft(marker);
            if (markerLeft === null) { setSt('err'); return; }
            const zr = getZoneRange(zone, track);
            const inside = markerLeft >= zr.left && markerLeft <= zr.right;
            setSt(`clean ${markerLeft.toFixed(0)}%`);
            if (inside) {
                setLed('hit');
                if (now - lastClickTime > CLICK_COOLDOWN) {
                    lastClickTime = now;
                    clickEl(ready);
                    addHit();
                }
            } else {
                setLed('on');
            }
            return;
        }

        // PRIORITY 2: CLEAN/REPAIR HOOK button
        const cleanBtn = document.querySelector('button.cast-btn.cast-mode-clean') ||
            document.querySelector('button.cast-btn.cast-mode-repair');
        if (cleanBtn) {
            setLed('wait');
            setSt('clean hook');
            if (now - lastClickTime > START_DELAY) { lastClickTime = now; clickEl(cleanBtn); }
            return;
        }

        // PRIORITY 3: Auto Charter — tab water logic
        if (waterTabOpen) {
            if (isFishdexFull()) {
                const charterBtn = getCharterBtn();
                if (charterBtn && !charterBtn.disabled && canAffordCharter()) {
                    setLed('upg');
                    setSt('charter!');
                    clickEl(charterBtn);
                    addCharter();
                    waterTabOpen = false;
                    lastWaterCheck = now;
                    // After charter, initiate pet-safe rebirth flow
                    setTimeout(() => { selectBestLocation(); rebirthPending = true; petsVerifiedForRebirth = false; openPetsTab(); }, 1000);
                    return;
                } else {
                    setSt('wait charter');
                }
            } else {
                selectBestLocation();
                waterTabOpen = false;
                lastWaterCheck = now;
                // Initiate pet-safe rebirth
                rebirthPending = true;
                petsVerifiedForRebirth = false;
                openPetsTab();
                return;
            }
        }

        if (now - lastWaterCheck > WATER_CHECK_INTERVAL) {
            lastWaterCheck = now;
            openWaterTab();
            setLed('wait');
            setSt('check water');
            return;
        }

        // PRIORITY 3.4: Pet-Safe Rebirth flow
        if (rebirthPending) {
            if (!petsVerifiedForRebirth) {
                const result = initiatePetSafeRebirth();
                if (result === 'verified') {
                    // Pets are good, proceed to rebirth
                    petsVerifiedForRebirth = true;
                    openRebirthTab();
                    return;
                } else if (result === 'equipping' || result === 'checking') {
                    // Still working on pets, skip this cycle
                    return;
                }
            } else {
                // Pets verified, proceed to rebirth tab
                if (!rebirthTabOpen) {
                    openRebirthTab();
                    return;
                }
            }
        }

        // PRIORITY 3.5: Auto Rebirth (when tab is open)
        if (rebirthTabOpen) {
            const rebirthBtn = getRebirthBtn();
            if (rebirthBtn && !rebirthBtn.disabled) {
                setLed('rb');
                setSt('rebirth\u2026');
                clickEl(rebirthBtn);
                return;
            } else {
                rebirthTabOpen = false;
                rebirthPending = false;
                openItemsTab();
                return;
            }
        }

        // PRIORITY 3.7: Auto Use Items
        if (itemsTabOpen) {
            const used = autoUseItems();
            setSt(used > 0 ? `used ${used}` : 'no items');
            itemsTabOpen = false;
            openUpgradeTab();
            return;
        }

        // PRIORITY 3.8: Auto Equip Best Pet (periodic)
        if (petTabOpen || (now - lastPetEquipCheck > PET_EQUIP_INTERVAL)) {
            if (tryAutoEquipBestPets()) return;
        }

        // PRIORITY 3.9: Auto Buy/Hatch Eggs (periodic)
        if (now - lastEggCheck > EGG_CHECK_INTERVAL) {
            if (tryAutoBuyAndHatchEgg()) return;
        }

        // PRIORITY 4: Auto Upgrade
        if (tryUpgrade()) return;

        // PRIORITY 5: CAST
        const castBtn =
            document.querySelector('button.cast-btn:not(.cast-mode-clean)') ||
            [...document.querySelectorAll('button')].find(b => !b.closest('#chiyoWrap') && /^CAST!?$/i.test(b.textContent.trim()));

        if (castBtn) {
            setLed('cast');
            setSt('cast');
            if (now - lastCastTime > CAST_DELAY) {
                lastCastTime = now;
                clickEl(castBtn);
                addCast();
            }
            return;
        }

        // PRIORITY 6: Upgrade while waiting
        if (!tryUpgrade()) {
            setLed('on');
            setSt('idle');
        }

        if (upPanel.classList.contains('open')) refreshLevelDisplay();
    }



    // ── TOGGLE ────────────────────────────────────────────────────────────────
    function toggle() {
        running = !running;
        if (running) {
            btn.innerHTML = '&#9632;';
            btn.classList.add('on');
            setLed('on');
            setSt('active');
            loop = setInterval(scan, SCAN_MS);
        } else {
            btn.innerHTML = '&#9654;';
            btn.classList.remove('on');
            setLed('');
            setSt('standby');
            stopHold();
            clearInterval(loop);
            loop = null;
        }
    }

    btn.addEventListener('click', toggle);
    document.addEventListener('keydown', e => {
        if (e.key === 'F8') { e.preventDefault(); toggle(); }
    });

    renderUpgradeList();
    console.log('[ChiyoMacro v12.0] Ready \u2014 Pet-Safe Rebirth + Auto Egg Buy/Hatch + Glass UI. START or F8.');
})();
