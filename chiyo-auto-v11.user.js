// ==UserScript==
// @name         Fishin' Chiyo - Auto v11
// @namespace    http://tampermonkey.net/
// @version      11.5
// @description  Auto CAST + Sell + Clean + Boss + Hook Set Fight + Upgrade + Charter + Rebirth + Equip Best Pet — State Machine with Unified Tab Rotation & Modern GUI
// @match        https://fishin-chiyo.vercel.app/*
// @match        *://fishin-chiyo.vercel.app/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════════
    // ── CONSTANTS ─────────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    const SCAN_MS = 16;
    const CLICK_COOLDOWN = 200;
    const START_DELAY = 600;
    const DEFAULT_CAST_DELAY = 500;
    const UPGRADE_DELAY = 300;
    const DEFAULT_SELL_COOLDOWN = 2000;
    const DEFAULT_TAB_ROTATION_INTERVAL = 60000;

    // ══════════════════════════════════════════════════════════════════════════
    // ── STATE ─────────────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    // State machine: 'fishing' | 'cleaning' | 'fighting' | 'boss' | 'tab_switching'
    let currentState = 'fishing';

    let running = false;
    let loop = null;

    // Stats
    let stats = { casts: 0, cleans: 0, bosses: 0, fights: 0, upgrades: 0, rebirths: 0, charters: 0, pets: 0 };

    // Timing
    let lastClickTime = 0;
    let lastCastTime = 0;
    let lastUpgradeTime = 0;
    let lastSellTime = 0;

    // Tab rotation: 0=idle, 1=waters, 2=pets, 3=items, 4=upgrade
    let tabRotationPhase = 0;
    let lastTabRotation = 0;
    let tabPhaseStartTime = 0;

    // Rebirth flow
    let rebirthPending = false;
    let petsVerifiedForRebirth = false;

    // Hold state (for fight)
    let holdActive = false;
    let holdTarget = null;
    let holdCheckInt = null;

    // Drag state
    let isDragging = false;
    let dragOffX = 0, dragOffY = 0;

    // Persistence
    let itemLimits = JSON.parse(localStorage.getItem('chiyo_limits') || '{}');
    let itemEnabled = JSON.parse(localStorage.getItem('chiyo_enabled') || '{}');
    const savedPos = JSON.parse(localStorage.getItem('chiyo_pos') || 'null');
    let isCompact = localStorage.getItem('chiyo_compact') === 'true';
    let isSettingsOpen = false;

    // Feature toggles
    const defaultToggles = {
        autoCast: true, autoSell: true, autoRepair: true, autoClean: true,
        autoBoss: true, autoFight: true, autoUpgrade: true, autoCharter: true,
        autoRebirth: true, autoPetEquip: true, autoItems: true
    };
    let toggles = Object.assign({}, defaultToggles, JSON.parse(localStorage.getItem('chiyo_toggles') || '{}'));

    // Timing settings
    let timingSettings = {
        tabRotationInterval: DEFAULT_TAB_ROTATION_INTERVAL,
        sellCooldown: DEFAULT_SELL_COOLDOWN,
        castDelay: DEFAULT_CAST_DELAY
    };
    const savedTiming = JSON.parse(localStorage.getItem('chiyo_timing') || 'null');
    if (savedTiming) Object.assign(timingSettings, savedTiming);

    // Rarity ranking for pets
    const RARITY_RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 };

    // ══════════════════════════════════════════════════════════════════════════
    // ── PERSISTENCE HELPERS ───────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function saveLimits() { localStorage.setItem('chiyo_limits', JSON.stringify(itemLimits)); }
    function saveEnabled() { localStorage.setItem('chiyo_enabled', JSON.stringify(itemEnabled)); }
    function saveToggles() { localStorage.setItem('chiyo_toggles', JSON.stringify(toggles)); }
    function saveTiming() { localStorage.setItem('chiyo_timing', JSON.stringify(timingSettings)); }
    function savePos(x, y) { localStorage.setItem('chiyo_pos', JSON.stringify({ x, y })); }



    // ══════════════════════════════════════════════════════════════════════════
    // ── STYLES ────────────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    const style = document.createElement('style');
    style.textContent = `
        #chiyoWrap {
            position: fixed;
            top: ${savedPos ? savedPos.y + 'px' : '10px'};
            left: ${savedPos ? savedPos.x + 'px' : '50%'};
            ${savedPos ? '' : 'transform: translateX(-50%);'}
            z-index: 999999;
            display: flex; flex-direction: column; align-items: stretch; gap: 4px;
            font-family: 'Segoe UI', 'Courier New', monospace;
            font-size: 11px; color: #f0c860;
            user-select: none;
            width: 300px;
        }
        #chiyoWrap.dragging { opacity: 0.85; }
        #chiyoWrap * { box-sizing: border-box; }

        /* ── Main Panel ── */
        #chiyoMainPanel {
            display: flex; align-items: center; gap: 6px;
            background: rgba(12, 6, 2, 0.96);
            border: 1.5px solid #b8903a;
            border-radius: 8px; padding: 6px 10px;
            box-shadow: 0 3px 14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,200,80,0.05);
            cursor: grab;
            transition: box-shadow 0.2s;
        }
        #chiyoMainPanel:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,200,80,0.08); }
        #chiyoMainPanel.grabbing { cursor: grabbing; }

        /* LED */
        #chiyoLed {
            width: 8px; height: 8px; border-radius: 50%;
            background: #333; flex-shrink: 0;
            transition: background 0.15s, box-shadow 0.15s;
        }
        #chiyoLed.on    { background: #40e040; box-shadow: 0 0 6px #40e040; }
        #chiyoLed.hit   { background: #40aaff; box-shadow: 0 0 6px #40aaff; }
        #chiyoLed.wait  { background: #f0a020; box-shadow: 0 0 6px #f0a020; }
        #chiyoLed.cast  { background: #e040e0; box-shadow: 0 0 6px #e040e0; }
        #chiyoLed.cls   { background: #ff6060; box-shadow: 0 0 6px #ff6060; }
        #chiyoLed.upg   { background: #60ffb0; box-shadow: 0 0 6px #60ffb0; }
        #chiyoLed.boss  { background: #ff4040; box-shadow: 0 0 7px #ff4040; }
        #chiyoLed.fight { background: #ffd700; box-shadow: 0 0 7px #ffd700; }
        #chiyoLed.hold  { background: #00cfff; box-shadow: 0 0 7px #00cfff; }
        #chiyoLed.rb    { background: #df80ff; box-shadow: 0 0 7px #df80ff; }

        /* Status text */
        #chiyoStatus {
            flex: 1; font-size: 10px; opacity: 0.8;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            min-width: 0;
        }

        /* Buttons */
        #chiyoWrap button {
            background: #2a1400; border: 1px solid #b8903a; border-radius: 6px;
            color: #f0c860; font-family: inherit; font-size: 10px;
            padding: 3px 8px; cursor: pointer; line-height: 1.3;
            transition: background 0.15s, border-color 0.15s, transform 0.1s;
        }
        #chiyoWrap button:hover { background: #4a2800; transform: translateY(-1px); }
        #chiyoWrap button:active { transform: translateY(0); }
        #chiyoWrap button.active { background: #0a300a; border-color: #40e040; color: #80ff80; }

        /* ── Stats Row ── */
        #chiyoStats {
            display: flex; flex-wrap: wrap; gap: 3px;
            padding: 4px 6px;
            background: rgba(12, 6, 2, 0.9);
            border: 1px solid rgba(184, 144, 58, 0.4);
            border-radius: 6px;
        }
        #chiyoWrap.compact #chiyoStats { display: none; }

        .chiyo-badge {
            display: inline-flex; align-items: center; gap: 2px;
            background: rgba(40, 30, 10, 0.8);
            border: 1px solid rgba(184, 144, 58, 0.3);
            border-radius: 4px; padding: 1px 5px;
            font-size: 9px; line-height: 1.4;
        }
        .chiyo-badge .badge-label { opacity: 0.6; }
        .chiyo-badge .badge-value { font-weight: bold; min-width: 12px; text-align: right; }
        .chiyo-badge.cast .badge-value { color: #e040e0; }
        .chiyo-badge.clean .badge-value { color: #40aaff; }
        .chiyo-badge.boss .badge-value { color: #ff4040; }
        .chiyo-badge.fight .badge-value { color: #ffd700; }
        .chiyo-badge.upgrade .badge-value { color: #60ffb0; }
        .chiyo-badge.rebirth .badge-value { color: #df80ff; }
        .chiyo-badge.charter .badge-value { color: #f0a020; }
        .chiyo-badge.pets .badge-value { color: #00cfff; }

        /* ── Settings Panel ── */
        #chiyoSettings {
            display: none; flex-direction: column; gap: 0;
            background: rgba(12, 6, 2, 0.97);
            border: 1.5px solid #b8903a;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.8);
            max-height: 400px; overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: #b8903a rgba(12, 6, 2, 0.5);
        }
        #chiyoSettings.open { display: flex; }
        #chiyoSettings::-webkit-scrollbar { width: 6px; }
        #chiyoSettings::-webkit-scrollbar-track { background: rgba(12, 6, 2, 0.5); border-radius: 3px; }
        #chiyoSettings::-webkit-scrollbar-thumb { background: #b8903a; border-radius: 3px; }

        /* Section */
        .chiyo-section {
            border-bottom: 1px solid rgba(184, 144, 58, 0.2);
        }
        .chiyo-section:last-child { border-bottom: none; }
        .chiyo-section-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 6px 10px; cursor: pointer;
            font-size: 10px; font-weight: bold; color: #b8903a;
            transition: background 0.15s;
        }
        .chiyo-section-header:hover { background: rgba(184, 144, 58, 0.08); }
        .chiyo-section-header .arrow { transition: transform 0.2s; font-size: 8px; }
        .chiyo-section-header .arrow.collapsed { transform: rotate(-90deg); }
        .chiyo-section-body {
            padding: 4px 10px 8px;
            display: flex; flex-direction: column; gap: 3px;
        }
        .chiyo-section-body.collapsed { display: none; }

        /* Toggle row */
        .chiyo-toggle-row {
            display: flex; align-items: center; gap: 6px;
            padding: 2px 0; font-size: 10px;
        }
        .chiyo-toggle-row input[type="checkbox"] {
            width: 13px; height: 13px; accent-color: #40e040;
            cursor: pointer; flex-shrink: 0;
        }
        .chiyo-toggle-row label { cursor: pointer; flex: 1; }

        /* Upgrade item row */
        .chiyo-item-row {
            display: flex; align-items: center; gap: 5px;
            padding: 3px 0; border-bottom: 1px solid rgba(26, 14, 6, 0.8);
            font-size: 10px;
        }
        .chiyo-item-row:last-child { border-bottom: none; }
        .chiyo-item-row input[type="checkbox"] {
            width: 12px; height: 12px; accent-color: #40e040; cursor: pointer; flex-shrink: 0;
        }
        .chiyo-item-row .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chiyo-item-row .item-lv { font-size: 9px; color: #888; min-width: 32px; }
        .chiyo-item-row .item-limit {
            width: 38px; background: #1a0e06; border: 1px solid #5a3a10;
            border-radius: 4px; color: #f0c860; font-family: inherit;
            font-size: 10px; padding: 2px 4px; text-align: center;
        }
        .chiyo-item-row .item-limit:focus { outline: none; border-color: #b8903a; }
        .chiyo-item-row .del-btn {
            padding: 1px 5px; font-size: 9px; border-color: #553; color: #a88;
            border-radius: 4px; background: transparent;
        }
        .chiyo-item-row .del-btn:hover { color: #ff6060; border-color: #ff6060; }

        /* Add row */
        .chiyo-add-row {
            display: flex; gap: 4px; margin-top: 4px; padding-top: 6px;
            border-top: 1px solid rgba(184, 144, 58, 0.2);
        }
        .chiyo-add-input {
            flex: 1; background: #1a0e06; border: 1px solid #5a3a10;
            border-radius: 4px; color: #f0c860; font-family: inherit;
            font-size: 10px; padding: 3px 6px;
        }
        .chiyo-add-input:focus { outline: none; border-color: #b8903a; }
        .chiyo-add-btn { background: #1a3a1a; border-color: #40e040; color: #80ff80; padding: 3px 8px; }
        .chiyo-add-btn:hover { background: #254a25; }

        /* Timing inputs */
        .chiyo-timing-row {
            display: flex; align-items: center; gap: 6px;
            padding: 2px 0; font-size: 10px;
        }
        .chiyo-timing-row label { flex: 1; opacity: 0.8; }
        .chiyo-timing-row input[type="number"] {
            width: 52px; background: #1a0e06; border: 1px solid #5a3a10;
            border-radius: 4px; color: #f0c860; font-family: inherit;
            font-size: 10px; padding: 2px 4px; text-align: center;
        }
        .chiyo-timing-row input[type="number"]:focus { outline: none; border-color: #b8903a; }
        .chiyo-timing-row .unit { opacity: 0.5; font-size: 9px; min-width: 16px; }

        .chiyo-empty-hint { font-size: 9px; color: #555; text-align: center; padding: 6px 0; }
    `;
    document.head.appendChild(style);



    // ══════════════════════════════════════════════════════════════════════════
    // ── HTML ──────────────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    const wrap = document.createElement('div');
    wrap.id = 'chiyoWrap';
    if (isCompact) wrap.classList.add('compact');
    wrap.innerHTML = `
        <div id="chiyoMainPanel">
            <div id="chiyoLed"></div>
            <span id="chiyoStatus">standby</span>
            <button id="chiyoStartBtn">START</button>
            <button id="chiyoCompactBtn" title="Toggle compact">${isCompact ? '+' : '-'}</button>
            <button id="chiyoSettingsBtn" title="Settings">&#9881;</button>
        </div>
        <div id="chiyoStats">
            <span class="chiyo-badge cast"><span class="badge-label">Cast</span><span class="badge-value" id="sCasts">0</span></span>
            <span class="chiyo-badge clean"><span class="badge-label">Clean</span><span class="badge-value" id="sCleans">0</span></span>
            <span class="chiyo-badge boss"><span class="badge-label">Boss</span><span class="badge-value" id="sBosses">0</span></span>
            <span class="chiyo-badge fight"><span class="badge-label">Fight</span><span class="badge-value" id="sFights">0</span></span>
            <span class="chiyo-badge upgrade"><span class="badge-label">Upg</span><span class="badge-value" id="sUpgrades">0</span></span>
            <span class="chiyo-badge rebirth"><span class="badge-label">Rb</span><span class="badge-value" id="sRebirths">0</span></span>
            <span class="chiyo-badge charter"><span class="badge-label">Ch</span><span class="badge-value" id="sCharters">0</span></span>
            <span class="chiyo-badge pets"><span class="badge-label">Pets</span><span class="badge-value" id="sPets">0</span></span>
        </div>
        <div id="chiyoSettings">
            <div class="chiyo-section" id="secToggles">
                <div class="chiyo-section-header" data-section="secTogglesBody">
                    <span>Toggles</span><span class="arrow">&#9660;</span>
                </div>
                <div class="chiyo-section-body" id="secTogglesBody"></div>
            </div>
            <div class="chiyo-section" id="secUpgrades">
                <div class="chiyo-section-header" data-section="secUpgradesBody">
                    <span>Upgrade Limits</span><span class="arrow">&#9660;</span>
                </div>
                <div class="chiyo-section-body" id="secUpgradesBody">
                    <div id="upgradeItemList"></div>
                    <div class="chiyo-add-row">
                        <input class="chiyo-add-input" id="addItemName" placeholder="Item name" />
                        <input class="chiyo-add-input" id="addItemLimit" placeholder="Max" style="width:42px;flex:none" />
                        <button class="chiyo-add-btn" id="addItemBtn">+</button>
                    </div>
                </div>
            </div>
            <div class="chiyo-section" id="secTiming">
                <div class="chiyo-section-header" data-section="secTimingBody">
                    <span>Timing</span><span class="arrow">&#9660;</span>
                </div>
                <div class="chiyo-section-body" id="secTimingBody">
                    <div class="chiyo-timing-row">
                        <label>Tab rotation</label>
                        <input type="number" id="timingRotation" min="10" max="600" value="${timingSettings.tabRotationInterval / 1000}" />
                        <span class="unit">s</span>
                    </div>
                    <div class="chiyo-timing-row">
                        <label>Sell cooldown</label>
                        <input type="number" id="timingSell" min="0.5" max="30" step="0.5" value="${timingSettings.sellCooldown / 1000}" />
                        <span class="unit">s</span>
                    </div>
                    <div class="chiyo-timing-row">
                        <label>Cast delay</label>
                        <input type="number" id="timingCast" min="100" max="5000" step="50" value="${timingSettings.castDelay}" />
                        <span class="unit">ms</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrap);



    // ══════════════════════════════════════════════════════════════════════════
    // ── GUI LOGIC ─────────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    const mainPanel = document.getElementById('chiyoMainPanel');
    const ledEl = document.getElementById('chiyoLed');
    const statusEl = document.getElementById('chiyoStatus');
    const startBtn = document.getElementById('chiyoStartBtn');
    const compactBtn = document.getElementById('chiyoCompactBtn');
    const settingsBtn = document.getElementById('chiyoSettingsBtn');
    const settingsPanel = document.getElementById('chiyoSettings');
    const statsEl = document.getElementById('chiyoStats');

    // Stats elements
    const statEls = {
        casts: document.getElementById('sCasts'),
        cleans: document.getElementById('sCleans'),
        bosses: document.getElementById('sBosses'),
        fights: document.getElementById('sFights'),
        upgrades: document.getElementById('sUpgrades'),
        rebirths: document.getElementById('sRebirths'),
        charters: document.getElementById('sCharters'),
        pets: document.getElementById('sPets')
    };

    function setLed(cls) { ledEl.className = cls ? cls : ''; }
    function setSt(text) { statusEl.textContent = text; }
    function addStat(key) { stats[key]++; if (statEls[key]) statEls[key].textContent = stats[key]; }

    // ── Drag Logic ──
    mainPanel.addEventListener('mousedown', e => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true;
        wrap.classList.add('dragging');
        mainPanel.classList.add('grabbing');
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
        mainPanel.classList.remove('grabbing');
        savePos(parseInt(wrap.style.left), parseInt(wrap.style.top));
    });

    // ── Compact Toggle ──
    compactBtn.addEventListener('click', () => {
        isCompact = !isCompact;
        wrap.classList.toggle('compact', isCompact);
        compactBtn.textContent = isCompact ? '+' : '-';
        localStorage.setItem('chiyo_compact', isCompact);
    });

    // ── Settings Toggle ──
    settingsBtn.addEventListener('click', () => {
        isSettingsOpen = !isSettingsOpen;
        settingsPanel.classList.toggle('open', isSettingsOpen);
        if (isSettingsOpen) renderToggles();
    });

    // ── Section Collapse ──
    document.querySelectorAll('.chiyo-section-header').forEach(header => {
        header.addEventListener('click', () => {
            const bodyId = header.dataset.section;
            const body = document.getElementById(bodyId);
            const arrow = header.querySelector('.arrow');
            if (body) body.classList.toggle('collapsed');
            if (arrow) arrow.classList.toggle('collapsed');
        });
    });

    // ── Toggles Section ──
    function renderToggles() {
        const container = document.getElementById('secTogglesBody');
        const toggleDefs = [
            { key: 'autoCast', label: 'Auto Cast' },
            { key: 'autoSell', label: 'Auto Sell' },
            { key: 'autoRepair', label: 'Auto Repair' },
            { key: 'autoClean', label: 'Auto Clean' },
            { key: 'autoBoss', label: 'Auto Boss' },
            { key: 'autoFight', label: 'Auto Fight' },
            { key: 'autoUpgrade', label: 'Auto Upgrade' },
            { key: 'autoCharter', label: 'Auto Charter' },
            { key: 'autoRebirth', label: 'Auto Rebirth' },
            { key: 'autoPetEquip', label: 'Auto Pet Equip' },
            { key: 'autoItems', label: 'Auto Items' }
        ];
        container.innerHTML = toggleDefs.map(def => `
            <div class="chiyo-toggle-row">
                <input type="checkbox" id="tog_${def.key}" ${toggles[def.key] ? 'checked' : ''} />
                <label for="tog_${def.key}">${def.label}</label>
            </div>
        `).join('');
        container.querySelectorAll('input[type="checkbox"]').forEach(el => {
            el.addEventListener('change', () => {
                const key = el.id.replace('tog_', '');
                toggles[key] = el.checked;
                saveToggles();
            });
        });
    }

    // ── Upgrade Items Section ──
    function renderUpgradeList() {
        const container = document.getElementById('upgradeItemList');
        const items = Object.keys(itemLimits);
        if (items.length === 0) {
            container.innerHTML = '<div class="chiyo-empty-hint">No items. Add below or wait for auto-detect.</div>';
            return;
        }
        container.innerHTML = items.map(name => {
            const enabled = itemEnabled[name] !== false;
            const limit = itemLimits[name] || 0;
            const curLv = getCurrentLevel(name);
            const lvTxt = curLv !== null ? 'Lv' + curLv : '--';
            return `
                <div class="chiyo-item-row" data-item="${name}">
                    <input type="checkbox" ${enabled ? 'checked' : ''} data-action="toggle" data-item="${name}" />
                    <span class="item-name">${name}</span>
                    <span class="item-lv">${lvTxt}</span>
                    <input type="number" class="item-limit" value="${limit}" min="0" max="9999" data-action="limit" data-item="${name}" />
                    <button class="del-btn" data-action="delete" data-item="${name}">x</button>
                </div>`;
        }).join('');

        container.querySelectorAll('[data-action="toggle"]').forEach(el => {
            el.addEventListener('change', () => { itemEnabled[el.dataset.item] = el.checked; saveEnabled(); });
        });
        container.querySelectorAll('[data-action="limit"]').forEach(el => {
            el.addEventListener('change', () => { itemLimits[el.dataset.item] = parseInt(el.value) || 0; saveLimits(); });
        });
        container.querySelectorAll('[data-action="delete"]').forEach(el => {
            el.addEventListener('click', () => {
                delete itemLimits[el.dataset.item];
                delete itemEnabled[el.dataset.item];
                saveLimits(); saveEnabled(); renderUpgradeList();
            });
        });
    }

    // Add item button
    document.getElementById('addItemBtn').addEventListener('click', () => {
        const name = document.getElementById('addItemName').value.trim();
        const limit = parseInt(document.getElementById('addItemLimit').value) || 99;
        if (!name) return;
        itemLimits[name] = limit;
        itemEnabled[name] = true;
        saveLimits(); saveEnabled();
        document.getElementById('addItemName').value = '';
        document.getElementById('addItemLimit').value = '';
        renderUpgradeList();
    });

    // ── Timing Section ──
    document.getElementById('timingRotation').addEventListener('change', function () {
        timingSettings.tabRotationInterval = Math.max(10, parseInt(this.value) || 60) * 1000;
        saveTiming();
    });
    document.getElementById('timingSell').addEventListener('change', function () {
        timingSettings.sellCooldown = Math.max(500, parseFloat(this.value) || 2) * 1000;
        saveTiming();
    });
    document.getElementById('timingCast').addEventListener('change', function () {
        timingSettings.castDelay = Math.max(100, parseInt(this.value) || 500);
        saveTiming();
    });

    // Initial render
    renderToggles();
    renderUpgradeList();



    // ══════════════════════════════════════════════════════════════════════════
    // ── DOM INTERACTION HELPERS ────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function clickEl(el) {
        if (!el) return;
        if (el.focus) el.focus();
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

    function parseKNum(s) {
        s = s.replace(/,/g, '').trim();
        const lower = s.toLowerCase();
        if (lower.endsWith('m')) return parseFloat(s) * 1000000;
        if (lower.endsWith('k')) return parseFloat(s) * 1000;
        if (lower.endsWith('b')) return parseFloat(s) * 1000000000;
        return parseFloat(s);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── CLEANING MINIGAME ─────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

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
            right: ((zR.right - tR.left) / tR.width) * 100
        };
    }

    function processCleaningMinigame(now) {
        const track = document.querySelector('.cleaning-track');
        const marker = document.querySelector('.clean-marker');
        const zone = document.querySelector('.clean-zone');
        const ready = document.querySelector('.cleaning-scrub');

        if (!track || !marker || !zone || !ready) return false;

        currentState = 'cleaning';
        const markerLeft = getMarkerLeft(marker);
        if (markerLeft === null) { setSt('clean err'); return true; }
        const zr = getZoneRange(zone, track);
        const inside = markerLeft >= zr.left && markerLeft <= zr.right;
        setSt('clean ' + markerLeft.toFixed(0) + '%');

        if (inside) {
            setLed('hit');
            if (now - lastClickTime > CLICK_COOLDOWN) {
                lastClickTime = now;
                clickEl(ready);
                addStat('cleans');
            }
        } else {
            setLed('on');
        }
        return true;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── HOOK SET FIGHT ────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

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
        if (!isFightActive()) { stopHold(); return false; }
        const phase = getFightPhase();
        if (!phase) { stopHold(); return false; }

        currentState = 'fighting';

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
            const dirBtn = document.querySelector('button.dir-zone-' + counter);
            if (dirBtn && !dirBtn.disabled) {
                setLed('fight');
                setSt('DIR ' + tug + ' > ' + counter);
                clickEl(dirBtn);
                addStat('fights');
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
            setSt('REEL ' + fill.toFixed(0) + '%');
            if (isPerfect || fill >= perfect || fill >= target) {
                clickEl(reelBtn);
                addStat('fights');
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
        addStat('fights');
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



    // ══════════════════════════════════════════════════════════════════════════
    // ── UPGRADE LOGIC ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

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
            const name = m ? m[1].trim() : (card.querySelector('.name') ? card.querySelector('.name').textContent.trim() : null);
            if (!name) return;
            if (!(name in itemLimits)) {
                itemLimits[name] = 0;
                itemEnabled[name] = false;
                changed = true;
            }
        });
        if (changed) {
            saveLimits(); saveEnabled();
            if (isSettingsOpen) renderUpgradeList();
        }
    }

    function tryUpgrade() {
        if (!toggles.autoUpgrade) return false;
        const now = Date.now();
        if (now - lastUpgradeTime < UPGRADE_DELAY) return false;
        autoDetectItems();
        for (const name of Object.keys(itemLimits)) {
            if (itemEnabled[name] === false) continue;
            if (itemLimits[name] <= 0) continue;
            const curLv = getCurrentLevel(name);
            if (curLv === null) continue;
            if (curLv >= itemLimits[name]) continue;
            const card = findUpgradeCard(name);
            if (!card) continue;
            const buyBtn = getBuyButton(card);
            if (!buyBtn) continue;
            lastUpgradeTime = now;
            clickEl(buyBtn);
            addStat('upgrades');
            setSt('upg ' + name + ' lv' + curLv);
            setLed('upg');
            return true;
        }
        return false;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── TAB NAVIGATION ────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function getWaterTab() { return [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^waters?$/i.test(el.textContent.trim())); }
    function getUpgradeTab() { return [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^upgrade$/i.test(el.textContent.trim())); }
    function getPetsTab() { return [...document.querySelectorAll('button.tab, button[class*="tab"]')].find(el => !el.closest('#chiyoWrap') && /^pets$/i.test(el.textContent.trim())); }
    function getItemsTab() {
        return document.querySelector('.ico-items')?.closest('button, a, [role="tab"]') ||
            [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^items$/i.test(el.textContent.trim()));
    }
    function getRebirthTab() {
        return document.querySelector('.ico-rebirth')?.closest('button, a, [role="tab"]') ||
            [...document.querySelectorAll('button, a, [role="tab"]')].find(el => !el.closest('#chiyoWrap') && /^rebirth$/i.test(el.textContent.trim()));
    }

    function clickTab(tabEl) { if (tabEl) clickEl(tabEl); }

    // ══════════════════════════════════════════════════════════════════════════
    // ── CHARTER LOGIC ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function getCharterBtn() { return document.querySelector('button.charter-button'); }
    function getRebirthBtn() { return document.querySelector('button.rebirth-btn'); }

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
            const m = txt.match(/base\s*([\d.,]+)([kKmMbB]?)c/i);
            if (!m) return;
            const val = parseKNum(m[1] + m[2]);
            if (card.classList.contains('current')) { currentVal = val; }
            else if (val > bestVal) { bestVal = val; best = card; }
        });
        if (currentVal >= bestVal) return;
        if (best) clickEl(best);
    }

    function processWatersPhase() {
        if (toggles.autoCharter && isFishdexFull()) {
            const charterBtn = getCharterBtn();
            if (charterBtn && !charterBtn.disabled && canAffordCharter()) {
                setLed('upg');
                setSt('charter!');
                clickEl(charterBtn);
                addStat('charters');
                rebirthPending = true;
                petsVerifiedForRebirth = false;
            }
        }
        selectBestLocation();
    }



    // ══════════════════════════════════════════════════════════════════════════
    // ── PET LOGIC ─────────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

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

    function equipBestPets() {
        if (!toggles.autoPetEquip) return false;

        const slots = getCompanionSlots();
        const pets = getOwnedPetCards();
        if (pets.length === 0) return false;

        pets.sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            return b.level - a.level;
        });

        const bestPets = pets.slice(0, slots.max);
        const otherPets = pets.slice(slots.max);

        // Unequip pets that shouldn't be equipped
        for (const pet of otherPets) {
            if (pet.isEquipped && pet.equipBtn) {
                setSt('unequip ' + pet.name);
                clickEl(pet.equipBtn);
                addStat('pets');
                return true;
            }
        }

        // Equip best pets
        for (const pet of bestPets) {
            if (!pet.isEquipped && pet.equipBtn) {
                setSt('equip ' + pet.name);
                clickEl(pet.equipBtn);
                addStat('pets');
                return true;
            }
        }

        return false;
    }

    function areBestPetsEquipped() {
        const slots = getCompanionSlots();
        const pets = getOwnedPetCards();
        if (pets.length === 0) return true;

        pets.sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            return b.level - a.level;
        });

        const bestPets = pets.slice(0, slots.max);
        return bestPets.every(pet => pet.isEquipped);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── ITEMS LOGIC ───────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function autoUseItems() {
        if (!toggles.autoItems) return 0;

        let total = 0;

        // BUY MAX buttons
        const buyMaxBtns = [...document.querySelectorAll('div.upgrade.item-card.active button.buy.use')].filter(b => {
            if (b.disabled) return false;
            const txt = b.textContent.trim().toUpperCase();
            if (!txt.startsWith('BUY MAX')) return false;
            const count = parseInt(txt.replace(/[^\d]/g, '')) || 0;
            return count > 0;
        });
        buyMaxBtns.forEach(b => clickEl(b));
        total += buyMaxBtns.length;

        // STACK buttons
        const stackBtns = [...document.querySelectorAll('div.upgrade.item-card.active button.buy.use')].filter(b => {
            if (b.disabled) return false;
            const txt = b.textContent.trim().toUpperCase();
            if (!txt.startsWith('STACK')) return false;
            const count = parseInt(txt.replace(/[^\d]/g, '')) || 0;
            return count > 0;
        });
        stackBtns.forEach(b => clickEl(b));
        total += stackBtns.length;

        // USE ALL buttons
        const useBtns = [...document.querySelectorAll('button.buy.use')].filter(b => {
            if (b.disabled) return false;
            const txt = b.textContent.trim().toUpperCase();
            if (!txt.startsWith('USE ALL') && !txt.startsWith('USE')) return false;
            if (txt.startsWith('BUY') || txt.startsWith('STACK')) return false;
            const count = parseInt(txt.replace(/[^\d]/g, '')) || 0;
            return count > 0;
        });
        useBtns.forEach(b => clickEl(b));
        total += useBtns.length;

        return total;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── POPUP DETECTION ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

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
            if (xBtn) return xBtn;
        }
        return null;
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



    // ══════════════════════════════════════════════════════════════════════════
    // ── UNIFIED TAB ROTATION CYCLE ────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    // Tab rotation phases: 0=idle, 1=waters, 2=pets, 3=items, 4=upgrade
    // Each phase opens its tab, does its work, then advances to next phase.
    // The whole cycle starts every tabRotationInterval ms.

    function startTabRotation() {
        tabRotationPhase = 1;
        tabPhaseStartTime = Date.now();
        currentState = 'tab_switching';
    }

    function processTabRotation(now) {
        // Timeout safety: if stuck in a phase for >5s, advance
        if (now - tabPhaseStartTime > 5000) {
            advanceTabPhase();
            return true;
        }

        if (tabRotationPhase === 1) {
            // Phase 1: Waters — check charter, select best zone
            const waterTab = getWaterTab();
            if (waterTab) {
                clickTab(waterTab);
                setSt('tab: waters');
                setLed('wait');
                // Process waters after a short delay (give DOM time to render)
                setTimeout(() => {
                    processWatersPhase();
                    advanceTabPhase();
                }, 400);
                tabRotationPhase = -1; // waiting for timeout
            } else {
                advanceTabPhase();
            }
            return true;
        }

        if (tabRotationPhase === 2) {
            // Phase 2: Pets — equip best pets
            if (!toggles.autoPetEquip) { advanceTabPhase(); return true; }
            const petsTab = getPetsTab();
            if (petsTab) {
                clickTab(petsTab);
                setSt('tab: pets');
                setLed('wait');
                setTimeout(() => {
                    equipBestPets();
                    advanceTabPhase();
                }, 400);
                tabRotationPhase = -2; // waiting
            } else {
                advanceTabPhase();
            }
            return true;
        }

        if (tabRotationPhase === 3) {
            // Phase 3: Items — BUY MAX + STACK + USE ALL
            if (!toggles.autoItems) { advanceTabPhase(); return true; }
            const itemsTab = getItemsTab();
            if (itemsTab) {
                clickTab(itemsTab);
                setSt('tab: items');
                setLed('wait');
                setTimeout(() => {
                    autoUseItems();
                    advanceTabPhase();
                }, 400);
                tabRotationPhase = -3; // waiting
            } else {
                advanceTabPhase();
            }
            return true;
        }

        if (tabRotationPhase === 4) {
            // Phase 4: Upgrade — tryUpgrade
            const upgradeTab = getUpgradeTab();
            if (upgradeTab) {
                clickTab(upgradeTab);
                setSt('tab: upgrade');
                setLed('wait');
                setTimeout(() => {
                    if (toggles.autoUpgrade) tryUpgrade();
                    advanceTabPhase();
                }, 400);
                tabRotationPhase = -4; // waiting
            } else {
                advanceTabPhase();
            }
            return true;
        }

        // Negative phases = waiting for setTimeout callback
        if (tabRotationPhase < 0) return true;

        return false;
    }

    function advanceTabPhase() {
        tabPhaseStartTime = Date.now();
        if (tabRotationPhase === -1 || tabRotationPhase === 1) {
            tabRotationPhase = 2;
        } else if (tabRotationPhase === -2 || tabRotationPhase === 2) {
            tabRotationPhase = 3;
        } else if (tabRotationPhase === -3 || tabRotationPhase === 3) {
            tabRotationPhase = 4;
        } else {
            // Done — return to fishing
            tabRotationPhase = 0;
            currentState = 'fishing';
            lastTabRotation = Date.now();
            // Return to upgrade tab as default view
            const upgradeTab = getUpgradeTab();
            if (upgradeTab) clickTab(upgradeTab);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── PET-SAFE REBIRTH ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function processRebirth(now) {
        if (!toggles.autoRebirth || !rebirthPending) return false;

        // Step 1: Verify pets are equipped
        if (!petsVerifiedForRebirth) {
            if (toggles.autoPetEquip) {
                const petsTab = getPetsTab();
                if (petsTab) {
                    clickTab(petsTab);
                    setSt('rb: check pets');
                    setLed('hold');
                    // Check after DOM updates
                    setTimeout(() => {
                        if (areBestPetsEquipped()) {
                            petsVerifiedForRebirth = true;
                        } else {
                            equipBestPets();
                        }
                    }, 400);
                    return true;
                }
            }
            petsVerifiedForRebirth = true;
        }

        // Step 2: Open rebirth tab and click rebirth
        if (petsVerifiedForRebirth) {
            const rebirthTab = getRebirthTab();
            if (rebirthTab) {
                clickTab(rebirthTab);
                setSt('rb: rebirth tab');
                setLed('rb');
                setTimeout(() => {
                    const rebirthBtn = getRebirthBtn();
                    if (rebirthBtn && !rebirthBtn.disabled) {
                        clickEl(rebirthBtn);
                    } else {
                        // Can't rebirth, cancel
                        rebirthPending = false;
                        petsVerifiedForRebirth = false;
                    }
                }, 400);
                return true;
            }
            rebirthPending = false;
            petsVerifiedForRebirth = false;
        }

        return false;
    }



    // ══════════════════════════════════════════════════════════════════════════
    // ── MAIN SCAN LOOP (STATE MACHINE) ────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function scan() {
        if (!running) return;
        const now = Date.now();

        // ────────────────────────────────────────────────────────────────────
        // NON-BLOCKING: Auto Sell (runs alongside other priorities)
        // ────────────────────────────────────────────────────────────────────
        if (toggles.autoSell && now - lastSellTime > timingSettings.sellCooldown) {
            const sellBtn = document.querySelector('button.sell') ||
                [...document.querySelectorAll('button')].find(b => !b.closest('#chiyoWrap') && /sell all/i.test(b.textContent));
            if (sellBtn && !sellBtn.disabled && sellBtn.offsetParent) {
                lastSellTime = now;
                clickEl(sellBtn);
                // Don't return — this is non-blocking
            }
        }

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 1: Confirm Rebirth popup (btn-primary with "rebirth" text)
        // ────────────────────────────────────────────────────────────────────
        const confirmBtn = document.querySelector('button.btn-primary');
        if (confirmBtn && /^rebirth$/i.test(confirmBtn.textContent.trim())) {
            setLed('rb');
            setSt('rebirth!');
            clickEl(confirmBtn);
            addStat('rebirths');
            rebirthPending = false;
            petsVerifiedForRebirth = false;
            tabRotationPhase = 0;
            currentState = 'fishing';
            // After rebirth, go to items tab briefly
            setTimeout(() => {
                const itemsTab = getItemsTab();
                if (itemsTab && toggles.autoItems) {
                    clickTab(itemsTab);
                    setTimeout(() => { autoUseItems(); const ut = getUpgradeTab(); if (ut) clickTab(ut); }, 500);
                }
            }, 1500);
            return;
        }

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 2: Boss targets
        // ────────────────────────────────────────────────────────────────────
        if (toggles.autoBoss) {
            const bossTargets = document.querySelectorAll('button.boss-target');
            if (bossTargets.length > 0) {
                currentState = 'boss';
                setLed('boss');
                setSt('boss x' + bossTargets.length);
                bossTargets.forEach(t => { clickEl(t); addStat('bosses'); });
                return;
            }
        }

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 3: Hook Set Fight
        // ────────────────────────────────────────────────────────────────────
        if (toggles.autoFight && isFightActive()) {
            if (processFight(now)) return;
        } else {
            stopHold();
        }

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 4: Cleaning minigame
        // ────────────────────────────────────────────────────────────────────
        if (toggles.autoClean) {
            if (processCleaningMinigame(now)) return;
        }

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 5: Close rare catch popup
        // ────────────────────────────────────────────────────────────────────
        const catchPopupBtn = findCatchPopup();
        if (catchPopupBtn) {
            setLed('cls');
            setSt('close popup');
            clickEl(catchPopupBtn);
            return;
        }

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 6: Tab rotation cycle (every tabRotationInterval)
        // ────────────────────────────────────────────────────────────────────
        if (tabRotationPhase !== 0) {
            // Currently in a tab rotation — process it
            if (processTabRotation(now)) return;
        } else if (now - lastTabRotation > timingSettings.tabRotationInterval) {
            // Time to start a new rotation cycle
            startTabRotation();
            if (processTabRotation(now)) return;
        }

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 7: Pet-Safe Rebirth (only after charter, with pet verify)
        // ────────────────────────────────────────────────────────────────────
        if (processRebirth(now)) return;

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 8: Auto Upgrade (runs every scan if Upgrade tab is active)
        // ────────────────────────────────────────────────────────────────────
        if (toggles.autoUpgrade) {
            const activeTab = document.querySelector('button.tab.active');
            if (activeTab && /^upgrade$/i.test(activeTab.textContent.trim())) {
                if (tryUpgrade()) return;
            }
        }

        // ────────────────────────────────────────────────────────────────────
        // PRIORITY 9: Cast / Repair / Clean via cast-btn
        // ────────────────────────────────────────────────────────────────────
        const castBtn = document.querySelector('button.cast-btn');
        if (castBtn && !castBtn.disabled && castBtn.offsetParent) {
            const castTxt = castBtn.textContent.trim().toUpperCase();
            currentState = 'fishing';

            if (castTxt.includes('REPAIR') && toggles.autoRepair) {
                setLed('wait');
                setSt('repair');
                if (now - lastClickTime > START_DELAY) {
                    lastClickTime = now;
                    clickEl(castBtn);
                }
                return;
            }

            if (castTxt.includes('CLEAN') && toggles.autoClean) {
                setLed('wait');
                setSt('clean hook');
                if (now - lastClickTime > START_DELAY) {
                    lastClickTime = now;
                    clickEl(castBtn);
                }
                return;
            }

            // Normal CAST
            if (toggles.autoCast) {
                setLed('cast');
                setSt('cast');
                if (now - lastCastTime > timingSettings.castDelay) {
                    lastCastTime = now;
                    clickEl(castBtn);
                    addStat('casts');
                }
                return;
            }
        }

        // ────────────────────────────────────────────────────────────────────
        // IDLE: Nothing to do
        // ────────────────────────────────────────────────────────────────────
        currentState = 'fishing';
        setLed('on');
        setSt('idle');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── TOGGLE / HOTKEY ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function toggle() {
        running = !running;
        if (running) {
            startBtn.textContent = 'STOP';
            startBtn.classList.add('active');
            setLed('on');
            setSt('active');
            lastTabRotation = Date.now(); // Don't immediately rotate on start
            loop = setInterval(scan, SCAN_MS);
        } else {
            startBtn.textContent = 'START';
            startBtn.classList.remove('active');
            setLed('');
            setSt('standby');
            stopHold();
            currentState = 'fishing';
            tabRotationPhase = 0;
            clearInterval(loop);
            loop = null;
        }
    }

    startBtn.addEventListener('click', toggle);
    document.addEventListener('keydown', e => {
        if (e.key === 'F8') { e.preventDefault(); toggle(); }
    });

    console.log('[ChiyoMacro v11.5] Ready \u2014 F8 to toggle.');
})();
