// ==UserScript==
// @name         Fishin' Chiyo - Auto v11
// @namespace    http://tampermonkey.net/
// @version      11.3
// @description  Auto CAST + Sell + Clean + Boss + Hook Set Fight + Upgrade + Charter + Rebirth + Equip Best Pet — Draggable & Compact GUI
// @match        https://fishin-chiyo.vercel.app/*
// @match        *://fishin-chiyo.vercel.app/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SCAN_MS = 16;
    const CLICK_COOLDOWN = 200;
    const START_DELAY = 600;
    const CAST_DELAY = 500;
    const UPGRADE_DELAY = 300;
    const SELL_COOLDOWN = 2000;

    let running = false;
    let loop = null;
    let hits = 0;
    let casts = 0;
    let closed = 0;
    let upgrades = 0;
    let charters = 0;
    let bosses = 0;
    let dirHits = 0;
    let reelHits = 0;
    let holdStarts = 0;
    let rebirths = 0;
    let petEquips = 0;
    let lastClickTime = 0;
    let lastCastTime = 0;
    let lastUpgradeTime = 0;
    let lastSellTime = 0;

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

    // ── STYLES ────────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        #chiyoWrap {
            position: fixed;
            top: ${savedPos ? savedPos.y + 'px' : '10px'};
            left: ${savedPos ? savedPos.x + 'px' : '50%'};
            ${savedPos ? '' : 'transform: translateX(-50%);'}
            z-index: 999999; display: flex; flex-direction: column; align-items: stretch; gap: 4px;
            font-family: 'Courier New', monospace; font-size: 11px; color: #f0c860;
            user-select: none;
        }
        #chiyoWrap.dragging { opacity: 0.85; }

        #chiyoPanel {
            display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
            background: rgba(15,8,3,0.95); border: 1.5px solid #b8903a;
            border-radius: 6px; padding: 4px 8px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.6);
            cursor: grab;
        }
        #chiyoPanel.grabbing { cursor: grabbing; }

        #chiyoPanel .led {
            width: 7px; height: 7px; border-radius: 50%; background: #333; flex-shrink: 0;
            transition: background 0.1s, box-shadow 0.1s;
        }
        #chiyoPanel .led.on    { background: #40e040; box-shadow: 0 0 5px #40e040; }
        #chiyoPanel .led.hit   { background: #40aaff; box-shadow: 0 0 5px #40aaff; }
        #chiyoPanel .led.wait  { background: #f0a020; box-shadow: 0 0 5px #f0a020; }
        #chiyoPanel .led.cast  { background: #e040e0; box-shadow: 0 0 5px #e040e0; }
        #chiyoPanel .led.cls   { background: #ff6060; box-shadow: 0 0 5px #ff6060; }
        #chiyoPanel .led.upg   { background: #60ffb0; box-shadow: 0 0 5px #60ffb0; }
        #chiyoPanel .led.boss  { background: #ff4040; box-shadow: 0 0 6px #ff4040; }
        #chiyoPanel .led.fight { background: #ffd700; box-shadow: 0 0 6px #ffd700; }
        #chiyoPanel .led.hold  { background: #00cfff; box-shadow: 0 0 6px #00cfff; }
        #chiyoPanel .led.rb    { background: #df80ff; box-shadow: 0 0 6px #df80ff; }

        #chiyoPanel button, #chiyoUpgradePanel button {
            background: #2a1400; border: 1px solid #b8903a; border-radius: 4px;
            color: #f0c860; font-family: inherit; font-size: 10px;
            padding: 2px 7px; cursor: pointer; line-height: 1.3;
        }
        #chiyoPanel button:hover { background: #4a2800; }
        #chiyoPanel button.on { background: #0a300a; border-color: #40e040; color: #80ff80; }
        #chiyoPanel .sep { opacity: 0.3; font-size: 10px; }
        #chiyoPanel .dim { opacity: 0.6; font-size: 10px; }
        #chiyoPanel .cnt { min-width: 18px; text-align: right; font-weight: bold; font-size: 10px; }
        #chiyoPanel .st  { font-size: 9px; opacity: 0.65; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Compact mode hides stats row */
        #chiyoWrap.compact #chiyoStats { display: none; }
        #chiyoWrap.compact #chiyoPanel { padding: 3px 7px; }

        #chiyoStats {
            display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
            padding: 2px 8px 0;
        }

        #chiyoUpgradePanel {
            background: rgba(15,8,3,0.97); border: 1.5px solid #b8903a;
            border-radius: 6px; padding: 8px 10px; min-width: 280px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.7);
            display: none; flex-direction: column; gap: 6px;
        }
        #chiyoUpgradePanel.open { display: flex; }
        #chiyoUpgradePanel .up-title {
            font-size: 10px; color: #b8903a; border-bottom: 1px solid #3a2010;
            padding-bottom: 4px; margin-bottom: 2px; display: flex;
            justify-content: space-between; align-items: center;
        }
        #chiyoUpgradePanel .up-title button { padding: 1px 6px; font-size: 9px; border-color: #555; color: #888; }
        #chiyoUpgradePanel .up-title button:hover { color: #f0c860; border-color: #b8903a; }
        #chiyoUpgradePanel .item-row {
            display: flex; align-items: center; gap: 6px;
            padding: 3px 0; border-bottom: 1px solid #1a0e06;
        }
        #chiyoUpgradePanel .item-row:last-child { border-bottom: none; }
        #chiyoUpgradePanel .item-check  { width: 12px; height: 12px; cursor: pointer; accent-color: #40e040; flex-shrink: 0; }
        #chiyoUpgradePanel .item-name   { flex: 1; font-size: 10px; color: #f0c860; }
        #chiyoUpgradePanel .item-lv     { font-size: 9px; color: #888; min-width: 38px; }
        #chiyoUpgradePanel .item-limit-label { font-size: 9px; color: #888; }
        #chiyoUpgradePanel .item-limit  {
            width: 40px; background: #1a0e06; border: 1px solid #5a3a10;
            border-radius: 3px; color: #f0c860; font-family: inherit;
            font-size: 10px; padding: 1px 3px; text-align: center;
        }
        #chiyoUpgradePanel .item-limit:focus { outline: none; border-color: #b8903a; }
        #chiyoUpgradePanel .add-row {
            display: flex; gap: 4px; margin-top: 3px; padding-top: 4px;
            border-top: 1px solid #3a2010;
        }
        #chiyoUpgradePanel .add-input {
            flex: 1; background: #1a0e06; border: 1px solid #5a3a10;
            border-radius: 3px; color: #f0c860; font-family: inherit;
            font-size: 10px; padding: 2px 5px;
        }
        #chiyoUpgradePanel .add-input:focus { outline: none; border-color: #b8903a; }
        #chiyoUpgradePanel .add-btn { background: #1a3a1a; border-color: #40e040; color: #80ff80; padding: 2px 8px; }
        #chiyoUpgradePanel .add-btn:hover { background: #254a25; }
        #chiyoUpgradePanel .empty-hint { font-size: 9px; color: #555; text-align: center; padding: 4px 0; }
    `;
    document.head.appendChild(style);


    // ── HTML ──────────────────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.id = 'chiyoWrap';
    if (isCompact) wrap.classList.add('compact');
    wrap.innerHTML = `
        <div id="chiyoPanel">
            <div class="led" id="cLed"></div>
            <button id="cBtn">▶</button>
            <span class="sep">│</span>
            <span class="st" id="cSt">standby</span>
            <span class="sep">│</span>
            <button id="cCompactBtn" title="Toggle compact">${isCompact ? '◻' : '◼'}</button>
            <button id="cUpgBtn" title="Upgrade settings">⚙</button>
            <div id="chiyoStats">
                <span class="dim">C:</span><span class="cnt" id="cCasts">0</span>
                <span class="dim">H:</span><span class="cnt" id="cHits">0</span>
                <span class="dim">B:</span><span class="cnt" id="cBoss">0</span>
                <span class="dim">F:</span><span class="cnt" id="cFight">0</span>/<span class="cnt" id="cReel">0</span>/<span class="cnt" id="cHold">0</span>
                <span class="dim">U:</span><span class="cnt" id="cUpg">0</span>
                <span class="dim">R:</span><span class="cnt" id="cRebirth">0</span>
                <span class="dim">Ch:</span><span class="cnt" id="cCharters">0</span>
                <span class="dim">P:</span><span class="cnt" id="cPets">0</span>
            </div>
        </div>
        <div id="chiyoUpgradePanel">
            <div class="up-title">
                <span>⚙ AUTO UPGRADE</span>
                <button id="upCloseBtn">✕</button>
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
        // Don't drag when clicking buttons/inputs
        if (e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true;
        wrap.classList.add('dragging');
        panel.classList.add('grabbing');
        const rect = wrap.getBoundingClientRect();
        dragOffX = e.clientX - rect.left;
        dragOffY = e.clientY - rect.top;
        // Remove transform centering on first drag
        wrap.style.transform = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        let x = e.clientX - dragOffX;
        let y = e.clientY - dragOffY;
        // Clamp to viewport
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
        // Save position
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
    const stEl = document.getElementById('cSt');
    const upPanel = document.getElementById('chiyoUpgradePanel');
    const upList = document.getElementById('upItemList');
    const upAddName = document.getElementById('upAddName');
    const upAddLimit = document.getElementById('upAddLimit');

    function setLed(s) { led.className = 'led' + (s ? ' ' + s : ''); }
    function setSt(t) { stEl.textContent = t; }
    function addHit() { hits++; hitsEl.textContent = hits; }
    function addCast() { casts++; castsEl.textContent = casts; }
    function addUpg() { upgrades++; upgEl.textContent = upgrades; }
    function addCharter(){ charters++; chartersEl.textContent = charters; }
    function addBoss() { bosses++; bossEl.textContent = bosses; }
    function addDir() { dirHits++; fightEl.textContent = dirHits; }
    function addReel() { reelHits++; reelEl.textContent = reelHits; }
    function addHold() { holdStarts++; holdEl.textContent = holdStarts; }
    function addRebirth(){ rebirths++; rebirthEl.textContent = rebirths; }
    function addPetEquip(){ petEquips++; petEquipEl.textContent = petEquips; }

    // ── COMPACT TOGGLE ────────────────────────────────────────────────────────
    const compactBtn = document.getElementById('cCompactBtn');
    compactBtn.addEventListener('click', () => {
        isCompact = !isCompact;
        wrap.classList.toggle('compact', isCompact);
        compactBtn.textContent = isCompact ? '◻' : '◼';
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
            const limit   = itemLimits[name] || 0;
            const curLv   = getCurrentLevel(name);
            const lvTxt   = curLv !== null ? `Lv${curLv}` : '–';
            return `
            <div class="item-row" data-item="${name}">
                <input type="checkbox" class="item-check" data-item="${name}" ${enabled ? 'checked' : ''}>
                <span class="item-name">${name}</span>
                <span class="item-lv" id="lv-${name}">${lvTxt}</span>
                <span class="item-limit-label">max:</span>
                <input type="number" class="item-limit" data-item="${name}" value="${limit}" min="0" max="9999">
                <button class="del-btn" data-item="${name}" style="padding:1px 5px;font-size:9px;border-color:#553;color:#a88;">✕</button>
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
        const name  = upAddName.value.trim();
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
        ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(ev =>
            el.dispatchEvent(new MouseEvent(ev, { bubbles:true, cancelable:true, view:window }))
        );
    }

    function holdEl2(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
        el.dispatchEvent(new MouseEvent('mousedown',    { bubbles:true, cancelable:true, clientX:cx, clientY:cy, button:0 }));
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true, clientX:cx, clientY:cy, pointerId:1, pointerType:'mouse' }));
    }

    function releaseEl(el) {
        if (!el) return;
        el.dispatchEvent(new MouseEvent('mouseup',    { bubbles:true, cancelable:true, button:0 }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, cancelable:true, pointerId:1, pointerType:'mouse' }));
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
            left:  ((zR.left  - tR.left) / tR.width) * 100,
            right: ((zR.right - tR.left) / tR.width) * 100,
        };
    }

    function getCurrentLevel(itemName) {
        const cards = document.querySelectorAll('div.upgrade');
        for (const card of cards) {
            const txt = card.textContent.trim();
            const m   = txt.match(/^([A-Za-z\s]+?)Lv\s+(\d+)/);
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
            const m   = txt.match(/^([A-Za-z\s]+?)Lv/);
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
            const m   = txt.match(/^([A-Za-z\s]+?)Lv/);
            const name = m ? m[1].trim() : card.querySelector('.name')?.textContent.trim();
            if (!name) return;
            if (!(name in itemLimits)) {
                itemLimits[name]  = 0;
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
            return txt === 'X' || txt === 'x' || txt === '×' || txt === '✕';
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
            const r   = el.getBoundingClientRect();
            if (r.width < 100 || r.height < 50) continue;
            if (!keywords.some(k => txt.includes(k))) continue;
            if (txt.length > 600) continue;
            const xBtn = [...el.querySelectorAll('button')].find(b => {
                const t = b.textContent.trim();
                return t === 'X' || t === 'x' || t === '×' || t === '✕';
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
            el.textContent = lv !== null ? `Lv${lv}` : '–';
        });
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
        if (pc.classList.contains('fight-phase-reel'))      return 'reel';
        if (pc.classList.contains('fight-phase-hold'))      return 'hold';
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
            if (cls.includes('dir-tugging-up'))    tug = 'up';
            if (cls.includes('dir-tugging-down'))  tug = 'down';
            if (cls.includes('dir-tugging-left'))  tug = 'left';
            if (cls.includes('dir-tugging-right')) tug = 'right';
            if (!tug) return true;
            const counter = { up:'down', down:'up', left:'right', right:'left' }[tug];
            const dirBtn  = document.querySelector(`button.dir-zone-${counter}`);
            if (dirBtn && !dirBtn.disabled) {
                setLed('fight');
                setSt(`DIR ${tug}→${counter}`);
                clickEl(dirBtn);
                addDir();
            }
            return true;
        }

        if (phase === 'reel') {
            stopHold();
            const reelPhase = document.querySelector('.fight-reel-phase');
            const reelBtn   = document.querySelector('button.fight-reel-button');
            if (!reelPhase || !reelBtn || reelBtn.disabled) return true;
            const fill    = parseFloat(reelPhase.style.getPropertyValue('--reel-fill'))    || 0;
            const target  = parseFloat(reelPhase.style.getPropertyValue('--reel-target'))  || 0;
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

    // ── AUTO CHARTER ─────────────────────────────────────────────────────────
    const WATER_CHECK_INTERVAL = 30000;
    let lastWaterCheck  = 0;
    let waterTabOpen    = false;
    let waterOpenedAt   = 0;
    let rebirthTabOpen  = false;
    let itemsTabOpen    = false;
    let rebirthPending  = false;
    let petsVerifiedForRebirth = false;

    function parseKNum(s) {
        s = s.replace(/,/g, '').trim();
        const lower = s.toLowerCase();
        if (lower.endsWith('m')) return parseFloat(s) * 1_000_000;
        if (lower.endsWith('k')) return parseFloat(s) * 1_000;
        if (lower.endsWith('b')) return parseFloat(s) * 1_000_000_000;
        return parseFloat(s);
    }

    function getWaterTab()   { return [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^waters?$/i.test(el.textContent.trim())); }
    function getUpgradeTab() { return [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^upgrade$/i.test(el.textContent.trim())); }
    function getRebirthTab() {
        return document.querySelector('.ico-rebirth')?.closest('button, a, [role="tab"]') ||
            [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^rebirth$/i.test(el.textContent.trim()));
    }
    function getItemsTab() {
        return document.querySelector('.ico-items')?.closest('button, a, [role="tab"]') ||
            [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^items$/i.test(el.textContent.trim()));
    }
    function getCharterBtn() { return document.querySelector('button.charter-button'); }
    function getRebirthBtn() { return document.querySelector('button.rebirth-btn'); }

    function openWaterTab()   { const t=getWaterTab();   if(t){clickEl(t);waterTabOpen=true;waterOpenedAt=Date.now();} }
    function openUpgradeTab() { const t=getUpgradeTab(); if(t){clickEl(t);waterTabOpen=false;rebirthTabOpen=false;itemsTabOpen=false;} }
    function openRebirthTab() { const t=getRebirthTab(); if(t){clickEl(t);rebirthTabOpen=true;} }
    function openItemsTab()   { const t=getItemsTab();   if(t){clickEl(t);itemsTabOpen=true;} }

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
        let bestVal=-1, best=null, currentVal=-1;
        allCards.forEach(card => {
            const txt = card.textContent;
            const m   = txt.match(/base\s*([\d.,]+)([kKmMbB]?)c/i);
            if (!m) return;
            const val = parseKNum(m[1] + m[2]);
            if (card.classList.contains('current')) { currentVal = val; }
            else if (val > bestVal) { bestVal = val; best = card; }
        });
        if (currentVal >= bestVal) return;
        if (best) clickEl(best);
    }

    function autoUseItems() {
        // Step 1: Click all BUY MAX buttons where count > 0
        const buyMaxBtns = [...document.querySelectorAll('div.upgrade.item-card.active button.buy.use')].filter(b => {
            if (b.disabled) return false;
            const txt = b.textContent.trim().toUpperCase();
            if (!txt.startsWith('BUY MAX')) return false;
            const count = parseInt(txt.replace(/[^\d]/g, '')) || 0;
            return count > 0;
        });
        buyMaxBtns.forEach(b => clickEl(b));

        // Step 2: Click all STACK buttons where count > 0
        const stackBtns = [...document.querySelectorAll('div.upgrade.item-card.active button.buy.use')].filter(b => {
            if (b.disabled) return false;
            const txt = b.textContent.trim().toUpperCase();
            if (!txt.startsWith('STACK')) return false;
            const count = parseInt(txt.replace(/[^\d]/g, '')) || 0;
            return count > 0;
        });
        stackBtns.forEach(b => clickEl(b));

        // Step 3: Click all USE ALL / USE buttons where count > 0
        const useBtns = [...document.querySelectorAll('button.buy.use')].filter(b => {
            if (b.disabled) return false;
            const txt = b.textContent.trim().toUpperCase();
            if (!txt.startsWith('USE ALL') && !txt.startsWith('USE')) return false;
            if (txt.startsWith('BUY') || txt.startsWith('STACK')) return false;
            const count = parseInt(txt.replace(/[^\d]/g, '')) || 0;
            return count > 0;
        });
        useBtns.forEach(b => clickEl(b));

        return buyMaxBtns.length + stackBtns.length + useBtns.length;
    }


    // ── AUTO EQUIP BEST PET ──────────────────────────────────────────────────
    const PET_EQUIP_INTERVAL = 60000; // check every 60s
    let lastPetEquipCheck = 0;
    let petTabOpen = false;

    const RARITY_RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 };

    function getPetsTab() {
        return [...document.querySelectorAll('button.tab, button[class*="tab"]')].find(el =>
            !el.closest('#chiyoWrap') && /^pets$/i.test(el.textContent.trim())
        );
    }

    function openPetsTab() {
        const t = getPetsTab();
        if (t) { clickEl(t); petTabOpen = true; }
    }

    function getCompanionSlots() {
        const metrics = document.querySelector('.hatchery-metrics');
        if (!metrics) return { current: 0, max: 1 };
        const m = metrics.textContent.match(/Companions\s*(\d+)\s*\/\s*(\d+)/i);
        if (!m) return { current: 0, max: 1 };
        return { current: parseInt(m[1]), max: parseInt(m[2]) };
    }

    function getOwnedPetCards() {
        // Get all pet-cards that are NOT locked (= owned)
        return [...document.querySelectorAll('.pet-card:not(.locked)')].map(card => {
            const nameEl   = card.querySelector('.pet-name');
            const rarityEl = card.querySelector('.pet-rarity');
            const levelEl  = card.querySelector('.pet-level');
            if (!nameEl || !rarityEl || !levelEl) return null;

            const name    = nameEl.textContent.trim();
            const rarity  = rarityEl.textContent.trim().toLowerCase();
            const lvMatch = levelEl.textContent.match(/Lv\s*(\d+)/i);
            const level   = lvMatch ? parseInt(lvMatch[1]) : 0;
            const isEquipped = card.classList.contains('equipped');

            // Find EQUIP / UNEQUIP button inside card
            const equipBtn = [...card.querySelectorAll('button')].find(b => {
                const t = b.textContent.trim().toUpperCase();
                return t === 'EQUIP' || t === 'UNEQUIP';
            });

            return { name, rarity, level, rank: RARITY_RANK[rarity] || 0, isEquipped, equipBtn, card };
        }).filter(Boolean);
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
        const pets  = getOwnedPetCards();

        if (pets.length === 0) {
            petTabOpen = false;
            openUpgradeTab();
            return false;
        }

        // Sort by rank (rarity) desc, then level desc
        pets.sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            return b.level - a.level;
        });

        // Best N pets should be equipped
        const bestPets   = pets.slice(0, slots.max);
        const otherPets  = pets.slice(slots.max);

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

        // All good — go back to upgrade tab
        petTabOpen = false;
        openUpgradeTab();
        return false;
    }

    // ── PET-SAFE REBIRTH HELPERS ─────────────────────────────────────────────
    function areBestPetsEquipped() {
        const slots = getCompanionSlots();
        const pets  = getOwnedPetCards();
        if (pets.length === 0) return true; // no pets = nothing to equip

        // Sort by rank (rarity) desc, then level desc
        pets.sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            return b.level - a.level;
        });

        const bestPets = pets.slice(0, slots.max);
        return bestPets.every(pet => pet.isEquipped);
    }

    function ensureBestPetsEquipped() {
        // Returns true if an action was taken (need to wait), false if already good
        const slots = getCompanionSlots();
        const pets  = getOwnedPetCards();
        if (pets.length === 0) return false;

        // Sort by rank (rarity) desc, then level desc
        pets.sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            return b.level - a.level;
        });

        const bestPets  = pets.slice(0, slots.max);
        const otherPets = pets.slice(slots.max);

        // First: unequip any pet that shouldn't be equipped
        for (const pet of otherPets) {
            if (pet.isEquipped && pet.equipBtn) {
                setSt(`rb: unequip ${pet.name}`);
                clickEl(pet.equipBtn);
                addPetEquip();
                return true;
            }
        }

        // Then: equip best pets that aren't equipped yet
        for (const pet of bestPets) {
            if (!pet.isEquipped && pet.equipBtn) {
                setSt(`rb: equip ${pet.name}`);
                clickEl(pet.equipBtn);
                addPetEquip();
                return true;
            }
        }

        return false; // all best pets already equipped
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
        const track  = document.querySelector('.cleaning-track');
        const marker = document.querySelector('.clean-marker');
        const zone   = document.querySelector('.clean-zone');
        const ready  = document.querySelector('.cleaning-scrub');

        if (track && marker && zone && ready) {
            const markerLeft = getMarkerLeft(marker);
            if (markerLeft === null) { setSt('err'); return; }
            const zr     = getZoneRange(zone, track);
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
                    rebirthPending = true;
                    petsVerifiedForRebirth = false;
                    setTimeout(() => openPetsTab(), 1000);
                    return;
                } else {
                    setSt('wait charter');
                }
            } else {
                selectBestLocation();
                waterTabOpen  = false;
                lastWaterCheck = now;
                rebirthPending = true;
                petsVerifiedForRebirth = false;
                setTimeout(() => openPetsTab(), 500);
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

        // PRIORITY 3.5: Pet-Safe Rebirth Flow
        if (rebirthPending && !petsVerifiedForRebirth) {
            // Check if pets tab is active
            const petsTabActive = document.querySelector('button.tab.active');
            if (petsTabActive && /^pets$/i.test(petsTabActive.textContent.trim())) {
                // Pets tab is open — verify/equip best pets
                if (areBestPetsEquipped()) {
                    petsVerifiedForRebirth = true;
                    openRebirthTab();
                    setSt('pets OK → rebirth');
                    return;
                } else {
                    // Equip best pets, retry next cycle
                    const acted = ensureBestPetsEquipped();
                    if (acted) {
                        setLed('hold');
                        setSt('equipping for rebirth');
                        return;
                    } else {
                        // Edge case: couldn't act but not equipped — proceed anyway
                        petsVerifiedForRebirth = true;
                        openRebirthTab();
                        return;
                    }
                }
            } else {
                // Pets tab not open yet, open it
                openPetsTab();
                setSt('pets check for rebirth');
                return;
            }
        }

        if (rebirthTabOpen) {
            const rebirthBtn = getRebirthBtn();
            if (rebirthBtn && !rebirthBtn.disabled) {
                setLed('rb');
                setSt('rebirth…');
                clickEl(rebirthBtn);
                rebirthPending = false;
                petsVerifiedForRebirth = false;
                return;
            } else {
                rebirthTabOpen = false;
                rebirthPending = false;
                petsVerifiedForRebirth = false;
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

        // PRIORITY 3.8: Auto Equip Best Pet
        if (petTabOpen || (now - lastPetEquipCheck > PET_EQUIP_INTERVAL)) {
            if (tryAutoEquipBestPets()) return;
        }

        // PRIORITY 4: Auto Upgrade
        if (tryUpgrade()) return;

        // PRIORITY 5: CAST (handles CAST / REPAIR / CLEAN via single cast-btn)
        const castBtn = document.querySelector('button.cast-btn');
        if (castBtn && !castBtn.disabled && castBtn.offsetParent) {
            const castTxt = castBtn.textContent.trim().toUpperCase();
            
            if (castTxt.includes('REPAIR')) {
                // Auto repair hook
                setLed('wait');
                setSt('repair');
                if (now - lastClickTime > START_DELAY) {
                    lastClickTime = now;
                    clickEl(castBtn);
                }
            } else if (castTxt.includes('CLEAN')) {
                // Trigger cleaning minigame
                setLed('wait');
                setSt('clean hook');
                if (now - lastClickTime > START_DELAY) {
                    lastClickTime = now;
                    clickEl(castBtn);
                }
            } else {
                // Normal CAST
                setLed('cast');
                setSt('cast');
                if (now - lastCastTime > CAST_DELAY) {
                    lastCastTime = now;
                    clickEl(castBtn);
                    addCast();
                }
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
            btn.textContent = '■';
            btn.classList.add('on');
            setLed('on');
            setSt('active');
            loop = setInterval(scan, SCAN_MS);
        } else {
            btn.textContent = '▶';
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
    console.log('[ChiyoMacro v11.3] Ready — drag to move, click ◼ to compact. Auto-equip best pets + pet-safe rebirth enabled. START or F8.');
})();
