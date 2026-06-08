function vmap(v, a, b, c, d) { return (v - a) * (d - c) / (b - a) + c; }

var transportType = null;
var port = null, reader = null, serialBuffer = '';
var ws = null;
var potValue = 0, pot2Value = 0, lastBtnText = '--';

function sendCmd(c) {
  if (transportType === 'wifi' && ws && ws.readyState === 1) { ws.send(c); }
  else if (transportType === 'usb') { serialSend(c); }
}

function serialSend(c) {
  if (!port) return;
  try { var w = port.writable.getWriter(); w.write(new TextEncoder().encode(c + '\n')); w.releaseLock(); } catch (e) {}
}

function onIncoming(msg) {
  if (msg === 'BUTTON_1') { routeButton(1); setLastBtn('Button 1'); }
  else if (msg === 'BUTTON_2') { routeButton(2); setLastBtn('Button 2'); }
  else if (msg === 'POT:' || msg.startsWith('POT:')) { setPotVal(parseInt(msg.substring(4))); }
  else if (msg.startsWith('POT2:')) { setPot2Val(parseInt(msg.substring(5))); }
}

function toggleWifi() { if (transportType === 'wifi') wsDisconnect(); else wsConnect(); }
function toggleUSB() { if (transportType === 'usb') usbDisconnect(); else usbConnect(); }

function wsConnect() {
  if (transportType === 'usb') usbDisconnect();
  var url = 'ws://' + location.hostname + ':81';
  if (!location.hostname || location.hostname === 'localhost' || location.hostname === '127.0.0.1') url = 'ws://192.168.4.1:81';
  try { ws = new WebSocket(url); } catch (e) { showError('WIFI FAILED', 'Could not create WebSocket.'); return; }
  ws.onopen = function () { transportType = 'wifi'; updateConnectionUI(); };
  ws.onmessage = function (e) { var lines = e.data.split('\n'); for (var i = 0; i < lines.length; i++) { var t = lines[i].trim(); if (t) onIncoming(t); } };
  ws.onclose = function () { if (transportType === 'wifi') { transportType = null; ws = null; updateConnectionUI(); } };
  ws.onerror = function () {};
}

function wsDisconnect() {
  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  transportType = null; updateConnectionUI();
}

async function usbConnect() {
  if (transportType === 'wifi') wsDisconnect();
  if (!('serial' in navigator)) { showError('NOT SUPPORTED', 'Web Serial unavailable. Use Chrome or Edge on desktop.'); return; }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    transportType = 'usb'; readSerialLoop(); updateConnectionUI();
  } catch (e) { showError('USB FAILED', 'Could not open serial port.'); }
}

async function usbDisconnect() {
  try { if (reader) { await reader.cancel(); reader = null; } if (port) { await port.close(); port = null; } } catch (e) {}
  transportType = null; updateConnectionUI();
}

async function readSerialLoop() {
  var dec = new TextDecoderStream();
  port.readable.pipeTo(dec.writable);
  reader = dec.readable.getReader();
  try {
    while (true) {
      var r = await reader.read(); if (r.done) break;
      serialBuffer += r.value;
      var lines = serialBuffer.split('\n'); serialBuffer = lines.pop();
      for (var i = 0; i < lines.length; i++) { var t = lines[i].trim(); if (t) onIncoming(t); }
    }
  } catch (e) {}
  if (transportType === 'usb') { transportType = null; updateConnectionUI(); }
}

function showError(t, m) {
  document.getElementById('error-title').textContent = t;
  document.getElementById('error-msg').textContent = m;
  document.getElementById('error-popup').style.display = 'block';
}

function setPotVal(v) { potValue = v; updateStatusUI(); }
function setPot2Val(v) { pot2Value = v; }
function setLastBtn(t) { lastBtnText = t; updateStatusUI(); }

var zIndex = 100, openWins = {}, activeGameId = null, gameHandlers = {}, globalTimers = [];
function addTimeout(fn, ms) { var t = setTimeout(fn, ms); globalTimers.push(t); return t; }
function clearTimeouts() { for (var i = 0; i < globalTimers.length; i++) clearTimeout(globalTimers[i]); globalTimers = []; }

function updateEmptyHint() { document.getElementById('empty-hint').style.display = Object.keys(openWins).length === 0 ? 'block' : 'none'; }

function setActiveSB(id) {
  document.querySelectorAll('.sidebar-item').forEach(function (el) { el.classList.remove('active'); });
  if (id) { var el = document.getElementById('sb-' + id); if (el) el.classList.add('active'); }
}

function openWindow(id, title, w, h, fn) {
  if (openWins[id]) { focusWin(openWins[id]); return; }
  var win = document.createElement('div'); win.className = 'app-window'; win.id = 'win-' + id;
  win.style.width = w + 'px'; win.style.height = h + 'px';
  var area = document.getElementById('windows-area'); var ar = area.getBoundingClientRect();
  var ox = Math.max(10, (ar.width - w) / 2 - Object.keys(openWins).length * 20);
  var oy = Math.max(10, (ar.height - h) / 2 - Object.keys(openWins).length * 16);
  win.style.left = ox + 'px'; win.style.top = oy + 'px';
  win.innerHTML = '<div class="window-titlebar"><div class="window-dots"><span class="dot dot-close" data-w="' + id + '"></span><span class="dot dot-min"></span><span class="dot dot-max"></span></div><span class="window-title">' + title + '</span></div><div class="window-body" id="body-' + id + '"></div>';
  area.appendChild(win); openWins[id] = win; makeDraggable(win); focusWin(win); setActiveSB(id); updateEmptyHint();
  win.querySelector('.dot-close').addEventListener('click', function () { closeWindow(id); });
  fn(document.getElementById('body-' + id));
}

function closeWindow(id) {
  if (!openWins[id]) return;
  var gids = ['reaction', 'mash', 'tow', 'archery', 'flappy'];
  if (gids.indexOf(id) >= 0 && activeGameId === id) {
    activeGameId = null; delete gameHandlers[id];
    sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE');
    if (id === 'reaction') destroyReaction();
    if (id === 'mash') destroyMash();
    if (id === 'tow') destroyTow();
    if (id === 'archery') destroyArchery();
    if (id === 'flappy') destroyFlappy();
  }
  openWins[id].remove(); delete openWins[id]; setActiveSB(null);
  for (var i = 0; i < gids.length; i++) { if (openWins[gids[i]]) { setActiveSB(gids[i]); break; } }
  if (openWins['status']) setActiveSB('status');
  updateEmptyHint();
}

function focusWin(win) { zIndex++; win.style.zIndex = zIndex; }

function makeDraggable(win) {
  var tb = win.querySelector('.window-titlebar'), dragging = false, sx, sy, ox, oy;
  function dn(cx, cy) { dragging = true; sx = cx; sy = cy; ox = win.offsetLeft; oy = win.offsetTop; focusWin(win); }
  function mv(cx, cy) { if (!dragging) return; win.style.left = (ox + cx - sx) + 'px'; win.style.top = (oy + cy - sy) + 'px'; }
  function up() { dragging = false; }
  tb.addEventListener('mousedown', function (e) { if (e.target.classList.contains('dot')) return; dn(e.clientX, e.clientY); });
  document.addEventListener('mousemove', function (e) { mv(e.clientX, e.clientY); });
  document.addEventListener('mouseup', up);
  tb.addEventListener('touchstart', function (e) { if (e.target.classList.contains('dot')) return; var t = e.touches[0]; dn(t.clientX, t.clientY); }, { passive: true });
  document.addEventListener('touchmove', function (e) { if (!dragging) return; var t = e.touches[0]; mv(t.clientX, t.clientY); }, { passive: true });
  document.addEventListener('touchend', up);
}

function routeButton(n) {
  if (activeGameId && gameHandlers[activeGameId]) {
    if (n === 1 && gameHandlers[activeGameId].b1) gameHandlers[activeGameId].b1();
    if (n === 2 && gameHandlers[activeGameId].b2) gameHandlers[activeGameId].b2();
  }
}

document.addEventListener('keydown', function (e) {
  if (e.code === 'Space') { e.preventDefault(); routeButton(1); }
  if (e.code === 'Enter') { e.preventDefault(); routeButton(2); }
});

function closeOtherGames(keep) {
  var ids = ['reaction', 'mash', 'tow', 'archery', 'flappy'];
  for (var i = 0; i < ids.length; i++) { if (ids[i] !== keep && openWins[ids[i]]) closeWindow(ids[i]); }
}

function pCl(p) { return p === 1 ? 'p1' : 'p2'; }
function pN(p) { return 'Player ' + p; }

// ========== STATUS ==========
function openStatus() {
  openWindow('status', 'Status', 360, 420, function (body) {
    body.innerHTML =
      '<div class="conn-card"><div class="conn-info"><span class="indicator offline" id="wifi-ind"></span><div><div class="conn-label"><svg class="icon" viewBox="0 0 20 20"><path d="M10 15a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM5.5 11.5a6 6 0 019 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M2 8a10 10 0 0116 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>WiFi</div><div class="conn-status" id="wifi-st">Disconnected</div></div></div><button class="conn-btn c-connect" id="wifi-btn" onclick="toggleWifi()">Connect</button></div>' +
      '<div class="conn-card"><div class="conn-info"><span class="indicator offline" id="usb-ind"></span><div><div class="conn-label"><svg class="icon" viewBox="0 0 20 20"><rect x="7" y="1" width="2" height="4" rx="1"/><rect x="11" y="1" width="2" height="4" rx="1"/><path d="M6 5h8l-1.5 13h-5L6 5z"/></svg>USB</div><div class="conn-status" id="usb-st">Disconnected</div></div></div><button class="conn-btn c-connect" id="usb-btn" onclick="toggleUSB()">Connect</button></div>' +
      '<div class="status-grid">' +
      '<div class="status-item"><span class="status-label">Brightness</span><span class="status-value" id="st-bright">--</span><div class="brightness-bar"><div class="brightness-fill" id="st-bbar"></div></div></div>' +
      '<div class="status-item"><span class="status-label">Last Button</span><span class="status-value" id="st-btn">' + lastBtnText + '</span></div>' +
      '<div class="status-item"><span class="status-label">Mode</span><span class="status-value" id="st-mode">Candle</span></div>' +
      '<div class="status-item"><span class="status-label">Transport</span><span class="status-value" id="st-transport">None</span></div>' +
      '</div>';
    updateConnectionUI(); updateStatusUI();
  });
}

function updateConnectionUI() {
  var wi = document.getElementById('wifi-ind'), wst = document.getElementById('wifi-st'), wb = document.getElementById('wifi-btn');
  var ui = document.getElementById('usb-ind'), ust = document.getElementById('usb-st'), ub = document.getElementById('usb-btn');
  if (!wi) return;
  if (transportType === 'wifi') { wi.className = 'indicator online'; wst.textContent = 'Connected'; wb.className = 'conn-btn c-disconnect'; wb.textContent = 'Disconnect'; }
  else { wi.className = 'indicator offline'; wst.textContent = 'Disconnected'; wb.className = 'conn-btn c-connect'; wb.textContent = 'Connect'; }
  if (transportType === 'usb') { ui.className = 'indicator online'; ust.textContent = 'Connected'; ub.className = 'conn-btn c-disconnect'; ub.textContent = 'Disconnect'; }
  else { ui.className = 'indicator offline'; ust.textContent = 'Disconnected'; ub.className = 'conn-btn c-connect'; ub.textContent = 'Connect'; }
  var tp = document.getElementById('st-transport');
  if (tp) tp.textContent = transportType === 'wifi' ? 'WebSocket' : transportType === 'usb' ? 'Serial' : 'None';
}

function updateStatusUI() {
  var bright = document.getElementById('st-bright'), bbar = document.getElementById('st-bbar');
  var btnV = document.getElementById('st-btn'), modeV = document.getElementById('st-mode');
  if (bright) {
    if (transportType) { var pct = Math.round(vmap(potValue, 0, 4095, 0, 100)); bright.textContent = pct + '%'; bbar.style.width = pct + '%'; }
    else { bright.textContent = '--'; bbar.style.width = '0%'; }
  }
  if (btnV) btnV.textContent = lastBtnText;
  if (modeV) modeV.textContent = activeGameId ? 'Game' : 'Candle';
}

// ========== REACTION ==========
var rxState = 'idle', rxMode = '1p', rxTimeouts = [], rxStart = 0, rxBest = Infinity, rxWins = [0, 0], rxHasPlayed = false;

function openReaction() {
  closeOtherGames('reaction'); activeGameId = 'reaction';
  openWindow('reaction', 'Reaction Time', 400, 380, function (body) {
    rxBuildUI(body);
    gameHandlers['reaction'] = { b1: function () { rxPress(1); }, b2: function () { rxPress(2); } };
  });
}

function rxSetMode(m) { if (rxState !== 'idle') return; rxMode = m; rxBuildUI(); }

function rxBuildUI(body) {
  if (!body) body = document.getElementById('body-reaction'); if (!body) return;
  var md = rxState !== 'idle' ? ' disabled' : '';
  var promptText = rxHasPlayed ? 'Press any button to restart' : 'Press any button to start';
  var h = '<div class="mode-toggle"><span class="mode-opt' + (rxMode === '1p' ? ' active' : '') + md + '" onclick="rxSetMode(\'1p\')">1 Player</span><span class="mode-opt' + (rxMode === '1v1' ? ' active' : '') + md + '" onclick="rxSetMode(\'1v1\')">1v1</span></div>';
  if (rxMode === '1p') {
    h += '<div class="reaction-display" id="rx-display"><div class="game-prompt">' + promptText + '</div><div class="game-sub">Then press any button when the LED lights up</div></div><div class="game-result" id="rx-result"></div><div class="best-score">Best: <span id="rx-best">' + (rxBest === Infinity ? '--' : rxBest + 'ms') + '</span></div>';
  } else {
    h += '<div class="reaction-display" id="rx-display"><div class="game-prompt">' + promptText + '</div><div class="game-sub">P1: Button 1 &middot; P2: Button 2<br>Press when both LEDs light up</div></div><div class="game-result" id="rx-result"></div><div class="wins-row"><span class="wp1">P1: ' + rxWins[0] + '</span> | <span class="wp2">P2: ' + rxWins[1] + '</span></div>';
  }
  body.innerHTML = h;
}

function rxStartGame() {
  if (rxState !== 'idle') return;
  rxHasPlayed = true; rxState = 'waiting'; sendCmd('MODE:GAME'); sendCmd('LED1:OFF'); sendCmd('LED2:OFF');
  var d = document.getElementById('rx-display');
  if (rxMode === '1p') { d.className = 'reaction-display waiting'; d.innerHTML = '<div class="game-prompt" style="color:var(--accent-yellow)">Wait for it...</div>'; }
  else { d.className = 'reaction-display waiting'; d.innerHTML = '<div class="vs-row"><div class="vs-player p1"><div class="vs-label">Player 1</div><div class="vs-value" id="rx-p1v">--</div></div><div class="vs-divider">VS</div><div class="vs-player p2"><div class="vs-label">Player 2</div><div class="vs-value" id="rx-p2v">--</div></div></div><div class="game-prompt" style="color:var(--accent-yellow);margin-top:6px">Wait for it...</div>'; }
  var res = document.getElementById('rx-result'); if (res) res.textContent = '';
  var t = setTimeout(function () {
    if (rxState !== 'waiting') return;
    rxState = 'ready'; rxStart = performance.now();
    if (rxMode === '1p') sendCmd('LED1:ON'); else { sendCmd('LED1:ON'); sendCmd('LED2:ON'); }
    d = document.getElementById('rx-display');
    if (rxMode === '1p') { d.className = 'reaction-display ready'; d.innerHTML = '<div class="game-prompt" style="color:var(--accent-green)">NOW!</div>'; }
    else { d.className = 'reaction-display ready'; d.innerHTML = '<div class="vs-row"><div class="vs-player p1"><div class="vs-label">Player 1</div><div class="vs-value" id="rx-p1v">--</div></div><div class="vs-divider">VS</div><div class="vs-player p2"><div class="vs-label">Player 2</div><div class="vs-value" id="rx-p2v">--</div></div></div><div class="game-prompt" style="color:var(--accent-green);margin-top:6px">NOW!</div>'; }
  }, 2000 + Math.random() * 3000);
  rxTimeouts.push(t);
}

function rxPress(player) {
  if (rxState === 'idle') { rxStartGame(); return; }
  if (rxState === 'dead') { rxResetToIdle(); return; }
  if (rxMode === '1p') {
    if (rxState === 'waiting') {
      for (var i = 0; i < rxTimeouts.length; i++) clearTimeout(rxTimeouts[i]); rxTimeouts = [];
      rxState = 'dead'; sendCmd('LED1:OFF'); sendCmd('MODE:CANDLE');
      var d = document.getElementById('rx-display'); d.className = 'reaction-display too-early'; d.innerHTML = '<div class="game-prompt" style="color:var(--accent-coral)">Too early!</div>';
      document.getElementById('rx-result').innerHTML = '<span style="color:var(--accent-coral)">Wait for the light</span>';
    } else if (rxState === 'ready') {
      var ms = Math.round(performance.now() - rxStart);
      rxState = 'dead'; sendCmd('LED1:OFF'); sendCmd('MODE:CANDLE');
      if (ms < rxBest) rxBest = ms;
      var be = document.getElementById('rx-best'); if (be) be.textContent = rxBest + 'ms';
      var d = document.getElementById('rx-display'); d.className = 'reaction-display'; d.innerHTML = '<div class="game-prompt" style="color:var(--accent-green)">' + ms + 'ms</div>';
      document.getElementById('rx-result').innerHTML = '<span style="color:var(--accent-green)">Great reaction!</span>';
    }
  } else {
    if (rxState === 'waiting') {
      var winner = player === 1 ? 2 : 1;
      rxState = 'dead'; sendCmd('LED1:OFF'); sendCmd('LED2:OFF'); sendCmd('MODE:CANDLE');
      rxWins[winner - 1]++; rxShow1v1(winner, pN(player) + ' pressed too early');
    } else if (rxState === 'ready') {
      var ms = Math.round(performance.now() - rxStart);
      rxState = 'dead'; sendCmd('LED1:OFF'); sendCmd('LED2:OFF'); sendCmd('MODE:CANDLE');
      sendCmd('LED' + player + ':ON'); rxTimeouts.push(addTimeout(function () { sendCmd('LED' + player + ':OFF'); }, 400));
      rxWins[player - 1]++; rxShow1v1(player, ms + 'ms');
    }
  }
}

function rxShow1v1(winner, detail) {
  var d = document.getElementById('rx-display'), wv = document.getElementById('rx-p' + winner + 'v'), lv = document.getElementById('rx-p' + (winner === 1 ? 2 : 1) + 'v');
  if (wv) wv.textContent = detail; if (lv) lv.textContent = '--'; d.className = 'reaction-display';
  var wp1 = d.querySelector('.vs-player.p1'), wp2 = d.querySelector('.vs-player.p2');
  if (wp1) wp1.className = 'vs-player p1' + (winner === 1 ? ' winner' : '');
  if (wp2) wp2.className = 'vs-player p2' + (winner === 2 ? ' winner' : '');
  var res = document.getElementById('rx-result'); if (res) res.innerHTML = '<div class="winner-banner ' + pCl(winner) + '">' + pN(winner) + ' Wins!</div>';
  rxBuildWR();
}

function rxBuildWR() { var e = document.querySelector('#body-reaction .wins-row'); if (e) e.innerHTML = '<span class="wp1">P1: ' + rxWins[0] + '</span> | <span class="wp2">P2: ' + rxWins[1] + '</span>'; }
function rxResetToIdle() { rxState = 'idle'; for (var i = 0; i < rxTimeouts.length; i++) clearTimeout(rxTimeouts[i]); rxTimeouts = []; rxBuildUI(); }
function destroyReaction() { rxState = 'idle'; for (var i = 0; i < rxTimeouts.length; i++) clearTimeout(rxTimeouts[i]); rxTimeouts = []; }

// ========== MASH ==========
var msState = 'idle', msMode = '1p', msCount = 0, msCount1 = 0, msCount2 = 0, msTimeLeft = 0, msInterval = null, msBest = 0, msWins = [0, 0], msHasPlayed = false;

function msHandleClick() {
  if (msState === 'idle') msStartGame();
  else if (msState === 'dead') msResetToIdle();
}

function openMash() {
  closeOtherGames('mash'); activeGameId = 'mash';
  openWindow('mash', 'Button Mash', 440, 430, function (body) {
    msBuildUI(body);
    gameHandlers['mash'] = { b1: function () { msPress(1); }, b2: function () { msPress(2); } };
  });
}

function msSetMode(m) { if (msState !== 'idle') return; msMode = m; msBuildUI(); }

function msBuildUI(body) {
  if (!body) body = document.getElementById('body-mash'); if (!body) return;
  var md = msState !== 'idle' ? ' disabled' : '';
  var promptText = msHasPlayed ? 'Click to restart' : 'Click to start';
  var h = '<div class="mode-toggle"><span class="mode-opt' + (msMode === '1p' ? ' active' : '') + md + '" onclick="event.stopPropagation();msSetMode(\'1p\')">1 Player</span><span class="mode-opt' + (msMode === '1v1' ? ' active' : '') + md + '" onclick="event.stopPropagation();msSetMode(\'1v1\')">1v1</span></div>';
  if (msMode === '1p') {
    h += '<div class="mash-display"><div class="mash-count" id="ms-count">0</div><div class="mash-timer" id="ms-timer">Time: <span>10</span>s</div><div class="mash-rate" id="ms-rate"></div></div><div class="mash-bar-track"><div class="mash-bar-fill" id="ms-bar"></div></div><div class="game-result" id="ms-result" style="cursor:pointer" onclick="msHandleClick()">' + promptText + '</div><div class="best-score">Best: <span id="ms-best">' + (msBest || '--') + '</span> presses</div>';
  } else {
    h += '<div class="vs-row"><div class="vs-player p1"><div class="vs-label">Player 1</div><div class="vs-value" id="ms-c1">0</div></div><div class="vs-divider"><div style="font-size:11px">Time</div><div style="font-size:18px;color:var(--accent-coral)" id="ms-vt">10</div></div><div class="vs-player p2"><div class="vs-label">Player 2</div><div class="vs-value" id="ms-c2">0</div></div></div><div class="mash-vs-bars"><div class="mash-bar-row p1"><div class="bl">P1</div><div class="bt"><div class="bf" id="ms-b1"></div></div></div><div class="mash-bar-row p2"><div class="bl">P2</div><div class="bt"><div class="bf" id="ms-b2"></div></div></div></div><div class="game-result" id="ms-result" style="cursor:pointer" onclick="msHandleClick()">' + promptText + '</div><div class="wins-row"><span class="wp1">P1: ' + msWins[0] + '</span> | <span class="wp2">P2: ' + msWins[1] + '</span></div>';
  }
  body.innerHTML = h;
}

function msStartGame() {
  if (msState !== 'idle') return;
  msHasPlayed = true;
  msCount = 0; msCount1 = 0; msCount2 = 0; msTimeLeft = 10; msState = 'playing'; sendCmd('MODE:GAME');
  if (msMode === '1p') {
    var el = document.getElementById('ms-count'); if (el) el.textContent = '0';
    var tl = document.getElementById('ms-timer'); if (tl) tl.innerHTML = 'Time: <span>10</span>s';
    var rt = document.getElementById('ms-rate'); if (rt) rt.textContent = '';
    var br = document.getElementById('ms-bar'); if (br) br.style.width = '0%';
    var res = document.getElementById('ms-result'); if (res) res.textContent = '';
  } else {
    var c1 = document.getElementById('ms-c1'); if (c1) c1.textContent = '0';
    var c2 = document.getElementById('ms-c2'); if (c2) c2.textContent = '0';
    var vt = document.getElementById('ms-vt'); if (vt) vt.textContent = '10';
    var b1 = document.getElementById('ms-b1'); if (b1) b1.style.width = '0%';
    var b2 = document.getElementById('ms-b2'); if (b2) b2.style.width = '0%';
    var res = document.getElementById('ms-result'); if (res) res.textContent = '';
  }
  msInterval = setInterval(function () {
    msTimeLeft--;
    if (msMode === '1p') {
      var tl = document.getElementById('ms-timer'); if (tl) tl.innerHTML = 'Time: <span>' + msTimeLeft + '</span>s';
      var rt = document.getElementById('ms-rate'); if (rt && msTimeLeft < 10) rt.textContent = (msCount / (10 - msTimeLeft)).toFixed(1) + ' presses/s';
    } else {
      var vt = document.getElementById('ms-vt'); if (vt) vt.textContent = msTimeLeft;
    }
    if (msTimeLeft <= 0) {
      clearInterval(msInterval); msInterval = null; msState = 'dead'; sendCmd('MODE:CANDLE');
      if (msMode === '1p') {
        if (msCount > msBest) msBest = msCount;
        var be = document.getElementById('ms-best'); if (be) be.textContent = msBest;
        var res = document.getElementById('ms-result'); if (res) res.innerHTML = '<span style="color:var(--accent-green)">Time\'s up! ' + msCount + ' presses</span>';
      } else {
        var w = 0; if (msCount1 > msCount2) w = 1; else if (msCount2 > msCount1) w = 2;
        if (w) msWins[w - 1]++;
        var res = document.getElementById('ms-result');
        if (res) {
          if (w) res.innerHTML = '<div class="winner-banner ' + pCl(w) + '">' + pN(w) + ' Wins! (' + msCount1 + ' vs ' + msCount2 + ')</div>';
          else res.innerHTML = '<div class="winner-banner tie">Tie! (' + msCount1 + ' vs ' + msCount2 + ')</div>';
        }
        msBuildWR();
      }
    }
  }, 1000);
}

function msPress(player) {
  if (msState === 'idle') { msStartGame(); return; }
  if (msState === 'dead') { msResetToIdle(); return; }
  if (msState !== 'playing') return;
  if (msMode === '1p') {
    msCount++;
    var el = document.getElementById('ms-count'); if (el) el.textContent = msCount;
    var br = document.getElementById('ms-bar'); if (br) br.style.width = Math.min(100, msCount) + '%';
    if (msCount % 5 === 0) { sendCmd('LED1:ON'); addTimeout(function () { sendCmd('LED1:OFF'); }, 50); }
    if (msCount % 5 === 3) { sendCmd('LED2:ON'); addTimeout(function () { sendCmd('LED2:OFF'); }, 50); }
  } else {
    if (player === 1) {
      msCount1++;
      var c1 = document.getElementById('ms-c1'); if (c1) c1.textContent = msCount1;
      var b1 = document.getElementById('ms-b1'); if (b1) b1.style.width = Math.min(100, msCount1) + '%';
      sendCmd('LED1:ON'); addTimeout(function () { sendCmd('LED1:OFF'); }, 40);
    } else {
      msCount2++;
      var c2 = document.getElementById('ms-c2'); if (c2) c2.textContent = msCount2;
      var b2 = document.getElementById('ms-b2'); if (b2) b2.style.width = Math.min(100, msCount2) + '%';
      sendCmd('LED2:ON'); addTimeout(function () { sendCmd('LED2:OFF'); }, 40);
    }
  }
}

function msBuildWR() { var e = document.querySelector('#body-mash .wins-row'); if (e) e.innerHTML = '<span class="wp1">P1: ' + msWins[0] + '</span> | <span class="wp2">P2: ' + msWins[1] + '</span>'; }
function msResetToIdle() { if (msInterval) { clearInterval(msInterval); msInterval = null; } msState = 'idle'; sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); msBuildUI(); }
function destroyMash() { if (msInterval) { clearInterval(msInterval); msInterval = null; } msState = 'idle'; }

// ========== TUG OF WAR ==========
var twState = 'idle', twMode = '1p', twPos = 50, twTimer = 15, twInterval = null, twAF = null, twDiff = 1, twCanvas, twCtx, twWins = [0, 0], twHasPlayed = false;

function twHandleClick() {
  if (twState === 'idle') twStartGame();
  else if (twState === 'won' || twState === 'lost' || twState === 'tie') twResetToIdle();
}

function openTow() {
  closeOtherGames('tow'); activeGameId = 'tow';
  openWindow('tow', 'Tug of War', 460, 400, function (body) {
    body.style.overflow = 'hidden'; body.style.padding = '12px';
    twBuildUI(body);
    gameHandlers['tow'] = { b1: function () { twPress(1); }, b2: function () { twPress(2); } };
  });
}

function twSetMode(m) { if (twState !== 'idle') return; twMode = m; twBuildUI(); }

function twBuildUI(body) {
  if (!body) body = document.getElementById('body-tow'); if (!body) return;
  var md = twState !== 'idle' ? ' disabled' : '';
  var sub = twMode === '1p' ? 'Mash buttons to pull the rope to your side!' : 'P1 pulls left (Btn 1) · P2 pulls right (Btn 2)';
  var twPrompt = twHasPlayed ? 'Click to restart' : 'Click to start';
  var showOverlay = (twState === 'idle' || twState === 'won' || twState === 'lost' || twState === 'tie');
  var h = '<div class="mode-toggle"><span class="mode-opt' + (twMode === '1p' ? ' active' : '') + md + '" onclick="event.stopPropagation();twSetMode(\'1p\')">1 Player</span><span class="mode-opt' + (twMode === '1v1' ? ' active' : '') + md + '" onclick="event.stopPropagation();twSetMode(\'1v1\')">1v1</span></div>';
  h += '<div class="tow-canvas-wrap" style="position:relative;cursor:' + (showOverlay ? 'pointer' : 'default') + '" onclick="twHandleClick()"><canvas id="tw-canvas" width="428" height="200"></canvas>';
  if (showOverlay) {
    h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none"><div style="background:rgba(255,250,245,0.85);padding:6px 18px;border-radius:8px;color:#3D405B;font:bold 16px Quicksand">' + twPrompt + '</div></div>';
  }
  h += '</div><div class="game-sub" style="margin-top:8px">' + sub + '</div>';
  if (twMode === '1v1') h += '<div class="wins-row"><span class="wp1">P1: ' + twWins[0] + '</span> | <span class="wp2">P2: ' + twWins[1] + '</span></div>';
  body.innerHTML = h;
  twCanvas = document.getElementById('tw-canvas'); twCtx = twCanvas.getContext('2d');
  twCanvas.width = 428; twCanvas.height = 200; drawTow();
}

function twStartGame() {
  if (twState !== 'idle') return;
  twHasPlayed = true;
  twPos = 50; twTimer = 15; twDiff = 1; twState = 'playing'; sendCmd('MODE:GAME');
  var wrap = document.querySelector('.tow-canvas-wrap'); if (wrap) wrap.style.cursor = 'default';
  var ov = document.querySelector('.tow-canvas-wrap > div:last-child'); if (ov && ov.style.position === 'absolute') ov.style.display = 'none';
  twInterval = setInterval(function () {
    twTimer--;
    if (twMode === '1p') twDiff += 0.12;
    if (twTimer <= 0) {
      clearInterval(twInterval); twInterval = null;
      if (twMode === '1p') {
        twState = 'won'; sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); drawTow();
      } else {
        var w = twPos < 50 ? 1 : twPos > 50 ? 2 : 0;
        twState = w ? 'won' : 'tie';
        if (w) twWins[w - 1]++;
        sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE');
        if (w) { sendCmd('LED' + w + ':ON'); addTimeout(function () { sendCmd('LED' + w + ':OFF'); }, 500); }
        drawTow(); twBuildWR();
      }
    }
  }, 1000);
  twLoop();
}

function twPress(player) {
  if (twState === 'idle') { twStartGame(); return; }
  if (twState === 'won' || twState === 'lost' || twState === 'tie') { twResetToIdle(); return; }
  if (twState !== 'playing') return;
  if (twMode === '1p') { twPos -= 3.5; if (twPos < 0) twPos = 0; }
  else { if (player === 1) { twPos -= 3.5; if (twPos < 0) twPos = 0; } else { twPos += 3.5; if (twPos > 100) twPos = 100; } }
}

function twLoop() {
  if (twState !== 'playing') return;
  if (twMode === '1p') twPos += twDiff * 0.25; else twPos += (50 - twPos) * 0.008;
  if (twMode === '1p' && twPos >= 100) {
    twState = 'lost'; if (twInterval) { clearInterval(twInterval); twInterval = null; }
    sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); drawTow(); return;
  }
  if (twMode === '1v1') {
    if (twPos <= 0) {
      twState = 'won'; twWins[0]++; if (twInterval) { clearInterval(twInterval); twInterval = null; }
      sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); sendCmd('LED1:ON');
      addTimeout(function () { sendCmd('LED1:OFF'); }, 500); drawTow(); twBuildWR(); return;
    }
    if (twPos >= 100) {
      twState = 'lost'; twWins[1]++; if (twInterval) { clearInterval(twInterval); twInterval = null; }
      sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); sendCmd('LED2:ON');
      addTimeout(function () { sendCmd('LED2:OFF'); }, 500); drawTow(); twBuildWR(); return;
    }
  }
  var l1 = Math.round(vmap(twPos, 0, 100, 255, 30)), l2 = Math.round(vmap(twPos, 0, 100, 30, 255));
  sendCmd('LED1:VAL:' + l1); sendCmd('LED2:VAL:' + l2); drawTow(); twAF = requestAnimationFrame(twLoop);
}

function drawTow() {
  if (!twCtx) return; var c = twCtx, w = twCanvas.width, h = twCanvas.height;
  c.clearRect(0, 0, w, h);
  var g1 = c.createLinearGradient(0, 0, w * 0.45, 0); g1.addColorStop(0, 'rgba(129,178,154,0.25)'); g1.addColorStop(1, 'rgba(129,178,154,0)'); c.fillStyle = g1; c.fillRect(0, 0, w * 0.45, h);
  var g2 = c.createLinearGradient(w * 0.55, 0, w, 0); g2.addColorStop(0, 'rgba(224,122,95,0)'); g2.addColorStop(1, 'rgba(224,122,95,0.25)'); c.fillStyle = g2; c.fillRect(w * 0.55, 0, w * 0.45, h);
  var ll = twMode === '1p' ? 'YOU' : 'P1', rl = twMode === '1p' ? 'OPPONENT' : 'P2';
  c.fillStyle = '#81B29A'; c.font = 'bold 13px Quicksand'; c.textAlign = 'left'; c.fillText(ll, 12, 22);
  c.fillStyle = '#E07A5F'; c.textAlign = 'right'; c.fillText(rl, w - 12, 22);
  if (twState === 'idle') {
    var ry = h / 2 + 8, rx = vmap(50, 0, 100, 36, w - 36); c.lineCap = 'round'; c.lineWidth = 5;
    c.strokeStyle = '#C9A97A'; c.beginPath(); c.moveTo(16, ry); c.lineTo(rx, ry); c.stroke();
    c.strokeStyle = '#A68656'; c.beginPath(); c.moveTo(rx, ry); c.lineTo(w - 16, ry); c.stroke();
    c.fillStyle = '#E07A5F'; c.beginPath(); c.arc(rx, ry, 11, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#C4593F'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#FFFAF5'; c.font = 'bold 9px Quicksand'; c.textAlign = 'center'; c.fillText('50', rx, ry + 3);
    return;
  }
  c.save(); c.strokeStyle = 'rgba(61,64,91,0.15)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(w / 2, 32); c.lineTo(w / 2, h - 22); c.stroke(); c.restore();
  var ry = h / 2 + 8, rx = vmap(twPos, 0, 100, 36, w - 36); c.lineCap = 'round'; c.lineWidth = 5;
  c.strokeStyle = '#C9A97A'; c.beginPath(); c.moveTo(16, ry); c.lineTo(rx, ry); c.stroke();
  c.strokeStyle = '#A68656'; c.beginPath(); c.moveTo(rx, ry); c.lineTo(w - 16, ry); c.stroke();
  c.fillStyle = '#E07A5F'; c.beginPath(); c.arc(rx, ry, 11, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#C4593F'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#FFFAF5'; c.font = 'bold 9px Quicksand'; c.textAlign = 'center'; c.fillText(Math.round(twPos), rx, ry + 3);
  c.fillStyle = '#3D405B'; c.font = 'bold 16px Quicksand'; c.textAlign = 'center'; c.fillText(twTimer + 's', w / 2, h - 4);
  if (twState === 'won' || twState === 'lost' || twState === 'tie') {
    c.fillStyle = 'rgba(255,250,245,0.82)'; c.fillRect(0, 0, w, h); c.textAlign = 'center';
    if (twMode === '1p') { c.fillStyle = twState === 'won' ? '#81B29A' : '#E07A5F'; c.font = 'bold 26px Quicksand'; c.fillText(twState === 'won' ? 'You Won!' : 'You Lost!', w / 2, h / 2 + 4); }
    else {
      var msg = '', clr = '#E9C46A';
      if (twState === 'tie') { msg = 'Tie!'; }
      else if (twPos <= 0) { msg = 'Player 1 Wins!'; clr = '#81B29A'; }
      else if (twPos >= 100) { msg = 'Player 2 Wins!'; clr = '#E07A5F'; }
      else { msg = twPos < 50 ? 'Player 1 Wins!' : 'Player 2 Wins!'; clr = twPos < 50 ? '#81B29A' : '#E07A5F'; }
      c.fillStyle = clr; c.font = 'bold 26px Quicksand'; c.fillText(msg, w / 2, h / 2 + 4);
    }
  }
}

function twBuildWR() { var e = document.querySelector('#body-tow .wins-row'); if (e) e.innerHTML = '<span class="wp1">P1: ' + twWins[0] + '</span> | <span class="wp2">P2: ' + twWins[1] + '</span>'; }
function twResetToIdle() { if (twInterval) { clearInterval(twInterval); twInterval = null; } if (twAF) { cancelAnimationFrame(twAF); twAF = null; } twState = 'idle'; twPos = 50; sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); twBuildUI(); }
function destroyTow() { if (twInterval) { clearInterval(twInterval); twInterval = null; } if (twAF) { cancelAnimationFrame(twAF); twAF = null; } twState = 'idle'; }

// ========== ARCHERY ==========
var awState = 'idle', awP1Angle = 0, awP2Angle = 0;
var awP1Arrow = null, awP2Arrow = null;
var awP1Cooldown = 0, awP2Cooldown = 0;
var awWinner = 0, awAF = null, awCanvas, awCtx;
var awWins = [0, 0], awHasPlayed = false;
var AW_SPEED = 10.2, AW_GRAV = 0.42, AW_GRAV_VAR = 0.135, AW_HIT_R = 36;

function openArchery() {
  closeOtherGames('archery'); activeGameId = 'archery';
  openWindow('archery', 'Archery Duel', 540, 540, function (body) {
    body.style.overflow = 'hidden'; body.style.padding = '10px';
    awBuildUI(body);
    gameHandlers['archery'] = { b1: function () { awShoot(1); }, b2: function () { awShoot(2); } };
  });
}

function awBuildUI(body) {
  if (!body) body = document.getElementById('body-archery'); if (!body) return;
  var h = '<div class="archery-canvas-wrap"><canvas id="aw-canvas" width="520" height="350"></canvas></div>';
  h += '<div class="game-sub" style="margin-top:6px">P1: Pot1 aim, Btn1 shoot · P2: Pot2 aim, Btn2 shoot<br>Arc it to hit the other!</div>';
  h += '<div class="wins-row"><span class="wp1">P1: ' + awWins[0] + '</span> | <span class="wp2">P2: ' + awWins[1] + '</span></div>';
  body.innerHTML = h;
  awCanvas = document.getElementById('aw-canvas'); awCtx = awCanvas.getContext('2d');
  awP1Angle = vmap(potValue, 0, 4095, 5 * Math.PI / 180, 80 * Math.PI / 180);
  awP2Angle = vmap(pot2Value, 0, 4095, 5 * Math.PI / 180, 80 * Math.PI / 180);
  drawArchery();
}

function awStartGame() {
  if (awState !== 'idle') return;
  awHasPlayed = true;
  awState = 'playing'; awP1Arrow = null; awP2Arrow = null;
  awP1Cooldown = 0; awP2Cooldown = 0; awWinner = 0;
  sendCmd('MODE:GAME');
  awLoop();
}

function awShoot(player) {
  if (awState === 'idle') { awStartGame(); return; }
  if (awState === 'won') { awResetToIdle(); return; }
  if (awState !== 'playing') return;
  if (player === 1 && (awP1Cooldown > 0 || awP1Arrow)) return;
  if (player === 2 && (awP2Cooldown > 0 || awP2Arrow)) return;
  var angle, speed, sx, sy, vx, vy, grav, px;
  speed = AW_SPEED + (Math.random() - 0.5) * 3.0;
  grav = AW_GRAV + (Math.random() - 0.5) * AW_GRAV_VAR * 2;
  if (player === 1) {
    angle = awP1Angle; px = 70;
    sx = px + Math.cos(angle) * 35; sy = 260 - Math.sin(angle) * 35;
    vx = speed * Math.cos(angle); vy = -speed * Math.sin(angle);
    awP1Arrow = { x: sx, y: sy, vx: vx, vy: vy, grav: grav };
  } else {
    angle = awP2Angle; px = 450;
    sx = px - Math.cos(angle) * 35; sy = 260 - Math.sin(angle) * 35;
    vx = -speed * Math.cos(angle); vy = -speed * Math.sin(angle);
    awP2Arrow = { x: sx, y: sy, vx: vx, vy: vy, grav: grav };
  }
  sendCmd('LED' + player + ':ON');
  addTimeout(function () { sendCmd('LED' + player + ':OFF'); }, 80);
}

function awLoop() {
  if (awState !== 'playing') return;
  awP1Angle = vmap(potValue, 0, 4095, 5 * Math.PI / 180, 80 * Math.PI / 180);
  awP2Angle = vmap(pot2Value, 0, 4095, 5 * Math.PI / 180, 80 * Math.PI / 180);
  if (awP1Cooldown > 0) awP1Cooldown--;
  if (awP2Cooldown > 0) awP2Cooldown--;
  var groundY = 310;
  if (awP1Arrow) {
    awP1Arrow.x += awP1Arrow.vx; awP1Arrow.y += awP1Arrow.vy; awP1Arrow.vy += awP1Arrow.grav;
    if (awP1Arrow.y > groundY || awP1Arrow.x > 560) {
      awP1Arrow = null; awP1Cooldown = 90;
    } else {
      var dx = awP1Arrow.x - 450, dy = awP1Arrow.y - 278;
      if (Math.sqrt(dx * dx + dy * dy) < AW_HIT_R) {
        awState = 'won'; awWinner = 1; awWins[0]++;
        sendCmd('LED1:ON'); addTimeout(function () { sendCmd('LED1:OFF'); }, 500);
        sendCmd('MODE:CANDLE'); awBuildWR();
      }
    }
  }
  if (awP2Arrow) {
    awP2Arrow.x += awP2Arrow.vx; awP2Arrow.y += awP2Arrow.vy; awP2Arrow.vy += awP2Arrow.grav;
    if (awP2Arrow.y > groundY || awP2Arrow.x < -40) {
      awP2Arrow = null; awP2Cooldown = 90;
    } else {
      var dx = awP2Arrow.x - 70, dy = awP2Arrow.y - 278;
      if (Math.sqrt(dx * dx + dy * dy) < AW_HIT_R) {
        awState = 'won'; awWinner = 2; awWins[1]++;
        sendCmd('LED2:ON'); addTimeout(function () { sendCmd('LED2:OFF'); }, 500);
        sendCmd('MODE:CANDLE'); awBuildWR();
      }
    }
  }
  if (awState === 'won') { drawArchery(); return; }
  drawArchery(); awAF = requestAnimationFrame(awLoop);
}

function drawArchery() {
  var c = awCtx, w = awCanvas.width, h = awCanvas.height;
  var groundY = 310;
  var sky = c.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#FFF5E6'); sky.addColorStop(1, '#E8F5E9');
  c.fillStyle = sky; c.fillRect(0, 0, w, groundY);
  c.fillStyle = '#81B29A'; c.fillRect(0, groundY, w, h - groundY);
  c.fillStyle = '#6A9B83'; c.fillRect(0, groundY, w, 3);
  for (var i = 0; i < 8; i++) {
    c.strokeStyle = 'rgba(106,155,131,0.4)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(i * 70 + 10, groundY);
    c.quadraticCurveTo(i * 70 + 35, groundY - 8, i * 70 + 60, groundY);
    c.stroke();
  }
  c.save();
  c.fillStyle = 'rgba(196,89,63,0.06)';
  c.beginPath(); c.arc(450, 278, AW_HIT_R, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(129,178,154,0.06)';
  c.beginPath(); c.arc(70, 278, AW_HIT_R, 0, Math.PI * 2); c.fill();
  c.restore();
  awDrawStickman(c, 70, groundY, awP1Angle, 1, awP1Cooldown > 0 || awP1Arrow);
  awDrawStickman(c, 450, groundY, awP2Angle, -1, awP2Cooldown > 0 || awP2Arrow);
  if (awP1Arrow) awDrawArrow(c, awP1Arrow);
  if (awP2Arrow) awDrawArrow(c, awP2Arrow);
  c.fillStyle = '#3D405B'; c.font = 'bold 14px Quicksand'; c.textAlign = 'center';
  c.fillText('P1', 70, groundY + 25);
  c.fillText('P2', 450, groundY + 25);
  if (awState === 'idle') {
    var promptText = awHasPlayed ? 'Press any button to restart' : 'Press any button to start';
    c.fillStyle = 'rgba(255,250,245,0.8)';
    var tw2 = c.measureText(promptText).width;
    c.fillRect(w / 2 - tw2 / 2 - 16, h / 2 - 20, tw2 + 32, 32);
    c.fillStyle = '#3D405B'; c.font = 'bold 16px Quicksand'; c.textAlign = 'center';
    c.fillText(promptText, w / 2, h / 2);
  }
  if (awState === 'won') {
    c.fillStyle = 'rgba(255,250,245,0.82)'; c.fillRect(0, 0, w, h);
    c.fillStyle = awWinner === 1 ? '#81B29A' : '#E07A5F';
    c.font = 'bold 30px Quicksand'; c.textAlign = 'center';
    c.fillText(pN(awWinner) + ' Wins!', w / 2, h / 2);
  }
}

function awDrawStickman(c, px, gy, angle, dir, busy) {
  var headY = gy - 32;
  c.strokeStyle = '#3D405B'; c.lineWidth = 2.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(px, gy - 12); c.lineTo(px - 10, gy); c.stroke();
  c.beginPath(); c.moveTo(px, gy - 12); c.lineTo(px + 10, gy); c.stroke();
  c.beginPath(); c.moveTo(px, gy - 12); c.lineTo(px, gy - 28); c.stroke();
  c.fillStyle = '#FFFAF5'; c.beginPath(); c.arc(px, headY, 7, 0, Math.PI * 2); c.fill(); c.stroke();
  var sX = px, sY = gy - 24;
  c.beginPath(); c.moveTo(sX, sY); c.lineTo(sX - dir * 12, sY + 8); c.stroke();
  var bX = sX + dir * 20, bY = sY - 5;
  c.beginPath(); c.moveTo(sX, sY); c.lineTo(bX, bY); c.stroke();
  c.strokeStyle = '#A68656'; c.lineWidth = 3;
  c.beginPath(); c.ellipse(bX, bY, 4, 16, 0, -Math.PI / 2, Math.PI / 2, dir < 0); c.stroke();
  var stY1 = bY - 16, stY2 = bY + 16;
  c.strokeStyle = '#3D405B'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(bX, stY1); c.lineTo(bX, stY2); c.stroke();
  if (!busy) {
    c.save(); c.translate(bX, bY); c.rotate(dir * -angle);
    c.strokeStyle = '#C4593F'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(25 * dir, 0); c.stroke();
    c.fillStyle = '#C4593F';
    c.beginPath(); c.moveTo(25 * dir, 0); c.lineTo(20 * dir, -4); c.lineTo(20 * dir, 4); c.closePath(); c.fill();
    c.restore();
  }
}

function awDrawArrow(c, arrow) {
  var ang = Math.atan2(arrow.vy, arrow.vx);
  c.save(); c.translate(arrow.x, arrow.y); c.rotate(ang);
  c.strokeStyle = '#C4593F'; c.lineWidth = 2.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-12, 0); c.lineTo(8, 0); c.stroke();
  c.fillStyle = '#C4593F';
  c.beginPath(); c.moveTo(10, 0); c.lineTo(4, -3); c.lineTo(4, 3); c.closePath(); c.fill();
  c.strokeStyle = '#E07A5F'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-12, -3); c.lineTo(-8, 0); c.stroke();
  c.beginPath(); c.moveTo(-12, 3); c.lineTo(-8, 0); c.stroke();
  c.restore();
}

function awBuildWR() { var e = document.querySelector('#body-archery .wins-row'); if (e) e.innerHTML = '<span class="wp1">P1: ' + awWins[0] + '</span> | <span class="wp2">P2: ' + awWins[1] + '</span>'; }
function awResetToIdle() { if (awAF) { cancelAnimationFrame(awAF); awAF = null; } awState = 'idle'; awWinner = 0; awP1Arrow = null; awP2Arrow = null; awP1Cooldown = 0; awP2Cooldown = 0; sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); awBuildUI(); }
function destroyArchery() { if (awAF) { cancelAnimationFrame(awAF); awAF = null; } awState = 'idle'; awWinner = 0; awP1Arrow = null; awP2Arrow = null; awP1Cooldown = 0; awP2Cooldown = 0; }

// ========== FLAPPY ==========
var fbState = 'idle', fbBird, fbPipes, fbScore, fbBest = 0, fbAF = null, fbCanvas, fbCtx, fbPipeTimer;
var FBG = 0.38, FBF = -6.5, FBS = 2.2, FBGAP = 120, FBPW = 42, FBI = 95;

function openFlappy() {
  closeOtherGames('flappy'); activeGameId = 'flappy';
  openWindow('flappy', 'Flappy Bird', 360, 440, function (body) {
    body.style.padding = '8px'; body.style.display = 'flex'; body.style.flexDirection = 'column';
    body.innerHTML = '<div class="flappy-wrap" id="fb-wrap"><canvas id="fb-canvas"></canvas><div class="flappy-overlay" id="fb-overlay"><div class="flappy-start-text">Press any button to start</div><div class="best-score" style="margin-top:10px">Best: <span id="fb-best-d">' + fbBest + '</span></div></div></div></div>';
    fbCanvas = document.getElementById('fb-canvas'); var wrap = document.getElementById('fb-wrap');
    fbCanvas.width = wrap.clientWidth; fbCanvas.height = wrap.clientHeight; fbCtx = fbCanvas.getContext('2d');
    fbBird = { x: 70, y: fbCanvas.height / 2, vel: 0, r: 11 }; fbPipes = []; fbPipeTimer = 0; fbScore = 0; drawFlappy();
    gameHandlers['flappy'] = { b1: function () { fbFlap(); }, b2: function () { fbFlap(); } };
  });
}

function fbStartGame() {
  fbBird = { x: 70, y: fbCanvas.height / 2, vel: 0, r: 11 }; fbPipes = []; fbPipeTimer = 60; fbScore = 0; fbState = 'playing';
  sendCmd('MODE:GAME'); document.getElementById('fb-overlay').classList.add('hidden'); fbLoop();
}

function fbFlap() {
  if (fbState === 'idle') { fbStartGame(); return; }
  if (fbState === 'playing') { fbBird.vel = FBF; }
  if (fbState === 'dead') {
    fbState = 'idle'; sendCmd('MODE:CANDLE');
    var ov = document.getElementById('fb-overlay'); if (ov) { ov.classList.remove('hidden'); ov.querySelector('.flappy-start-text').textContent = 'Press any button to restart'; }
    fbBird = { x: 70, y: fbCanvas.height / 2, vel: 0, r: 11 }; fbPipes = []; fbPipeTimer = 0; fbScore = 0; drawFlappy();
  }
}

function fbLoop() {
  if (fbState !== 'playing') return; var w = fbCanvas.width, h = fbCanvas.height;
  fbBird.vel += FBG; fbBird.y += fbBird.vel; fbPipeTimer++;
  if (fbPipeTimer >= FBI) { fbPipeTimer = 0; var th = 45 + Math.random() * (h - FBGAP - 90); fbPipes.push({ x: w, th: th, scored: false }); }
  for (var i = fbPipes.length - 1; i >= 0; i--) { fbPipes[i].x -= FBS; if (!fbPipes[i].scored && fbPipes[i].x + FBPW < fbBird.x) { fbPipes[i].scored = true; fbScore++; } if (fbPipes[i].x + FBPW < -10) fbPipes.splice(i, 1); }
  if (fbBird.y + fbBird.r > h || fbBird.y - fbBird.r < 0) { fbDie(); return; }
  for (var j = 0; j < fbPipes.length; j++) { var p = fbPipes[j]; if (fbBird.x + fbBird.r > p.x && fbBird.x - fbBird.r < p.x + FBPW) { if (fbBird.y - fbBird.r < p.th || fbBird.y + fbBird.r > p.th + FBGAP) { fbDie(); return; } } }
  drawFlappy(); fbAF = requestAnimationFrame(fbLoop);
}

function fbDie() {
  fbState = 'dead'; if (fbScore > fbBest) fbBest = fbScore;
  var be = document.getElementById('fb-best-d'); if (be) be.textContent = fbBest;
  sendCmd('MODE:CANDLE'); sendCmd('LED1:ON'); sendCmd('LED2:ON');
  addTimeout(function () { sendCmd('LED1:OFF'); sendCmd('LED2:OFF'); }, 300); drawFlappy();
  addTimeout(function () { if (fbState === 'dead') { var ov = document.getElementById('fb-overlay'); if (ov) { ov.classList.remove('hidden'); ov.querySelector('.flappy-start-text').textContent = 'Game Over! Score: ' + fbScore; } } }, 600);
}

function drawFlappy() {
  if (!fbCtx) return; var c = fbCtx, w = fbCanvas.width, h = fbCanvas.height;
  var sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#ADE4D0'); sky.addColorStop(1, '#E8F5E9'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
  for (var i = 0; i < 5; i++) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse((i * 110 + fbPipeTimer * 0.3) % (w + 80) - 40, 30 + i * 18, 40 + i * 8, 10 + i * 2, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#81B29A'; c.fillRect(0, h - 24, w, 24); c.fillStyle = '#6A9B83'; c.fillRect(0, h - 24, w, 3);
  for (var j = 0; j < fbPipes.length; j++) {
    var p = fbPipes[j];
    c.fillStyle = '#6A9B83'; c.fillRect(p.x - 3, p.th - 18, FBPW + 6, 18);
    c.fillStyle = '#81B29A'; c.fillRect(p.x, 0, FBPW, p.th);
    c.fillStyle = '#6A9B83'; c.fillRect(p.x + 4, 0, FBPW - 8, p.th);
    c.fillStyle = '#6A9B83'; c.fillRect(p.x - 3, p.th + FBGAP, FBPW + 6, 18);
    c.fillStyle = '#81B29A'; c.fillRect(p.x, p.th + FBGAP, FBPW, h - p.th - FBGAP - 24);
    c.fillStyle = '#6A9B83'; c.fillRect(p.x + 4, p.th + FBGAP, FBPW - 8, h - p.th - FBGAP - 24);
  }
  c.save(); c.translate(fbBird.x, fbBird.y); var ang = Math.min(Math.max(fbBird.vel * 0.06, -0.5), 0.6); c.rotate(ang);
  c.fillStyle = '#F2CC8F'; c.beginPath(); c.arc(0, 0, fbBird.r, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#D4A843'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = '#3D405B'; c.beginPath(); c.arc(4, -3, 3.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'white'; c.beginPath(); c.arc(5, -4, 1.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#E07A5F'; c.beginPath(); c.moveTo(fbBird.r - 2, -1); c.lineTo(fbBird.r + 8, 2); c.lineTo(fbBird.r - 2, 5); c.closePath(); c.fill();
  c.restore();
  c.fillStyle = 'rgba(61,64,91,0.7)'; c.font = 'bold 22px Quicksand'; c.textAlign = 'center'; c.fillText(fbScore, w / 2, 36);
  if (fbState === 'dead') { c.fillStyle = 'rgba(61,64,91,0.25)'; c.fillRect(0, 0, w, h); }
}

function destroyFlappy() { if (fbAF) { cancelAnimationFrame(fbAF); fbAF = null; } fbState = 'idle'; }

// ========== INIT ==========
function init() {
  var host = location.hostname;
  if (host && host !== 'localhost' && host !== '127.0.0.1' && host !== '') { wsConnect(); }
  openStatus();
}
init();