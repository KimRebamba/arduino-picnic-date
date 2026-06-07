function vmap(v, a, b, c, d) { return (v - a) * (d - c) / (b - a) + c; }

var transportType = null;
var port = null, reader = null, serialBuffer = '';
var ws = null;
var potValue = 0, lastBtnText = '--';

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
  else if (msg.startsWith('POT:')) { setPotVal(parseInt(msg.substring(4))); }
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
  var gids = ['reaction', 'mash', 'tow', 'flappy'];
  if (gids.indexOf(id) >= 0 && activeGameId === id) {
    activeGameId = null; delete gameHandlers[id];
    sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE');
    if (id === 'reaction') destroyReaction();
    if (id === 'mash') destroyMash();
    if (id === 'tow') destroyTow();
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
  var ids = ['reaction', 'mash', 'tow', 'flappy'];
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
var rxState = 'idle', rxMode = '1p', rxTimeouts = [], rxStart = 0, rxBest = Infinity, rxWins = [0, 0];

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
  var h = '<div class="mode-toggle"><span class="mode-opt' + (rxMode === '1p' ? ' active' : '') + md + '" onclick="rxSetMode(\'1p\')">1 Player</span><span class="mode-opt' + (rxMode === '1v1' ? ' active' : '') + md + '" onclick="rxSetMode(\'1v1\')">1v1</span></div>';
  if (rxMode === '1p') {
    h += '<div class="reaction-display" id="rx-display"><div class="game-prompt">Test your reaction speed</div><div class="game-sub">Press Start, then press any button when the LED lights up</div></div><button class="game-btn" id="rx-btn" onclick="rxStartGame()">Start</button><div class="game-result" id="rx-result"></div><div class="best-score">Best: <span id="rx-best">' + (rxBest === Infinity ? '--' : rxBest + 'ms') + '</span></div>';
  } else {
    h += '<div class="reaction-display" id="rx-display"><div class="game-prompt">Who reacts faster?</div><div class="game-sub">P1: Button 1 &middot; P2: Button 2<br>Press when both LEDs light up</div></div><button class="game-btn" id="rx-btn" onclick="rxStartGame()">Start</button><div class="game-result" id="rx-result"></div><div class="wins-row"><span class="wp1">P1: ' + rxWins[0] + '</span> | <span class="wp2">P2: ' + rxWins[1] + '</span></div>';
  }
  body.innerHTML = h;
}

function rxStartGame() {
  if (rxState !== 'idle') return;
  rxState = 'waiting'; sendCmd('MODE:GAME'); sendCmd('LED1:OFF'); sendCmd('LED2:OFF');
  var d = document.getElementById('rx-display');
  if (rxMode === '1p') { d.className = 'reaction-display waiting'; d.innerHTML = '<div class="game-prompt" style="color:var(--accent-yellow)">Wait for it...</div>'; }
  else { d.className = 'reaction-display waiting'; d.innerHTML = '<div class="vs-row"><div class="vs-player p1"><div class="vs-label">Player 1</div><div class="vs-value" id="rx-p1v">--</div></div><div class="vs-divider">VS</div><div class="vs-player p2"><div class="vs-label">Player 2</div><div class="vs-value" id="rx-p2v">--</div></div></div><div class="game-prompt" style="color:var(--accent-yellow);margin-top:6px">Wait for it...</div>'; }
  var btn = document.getElementById('rx-btn'); if (btn) btn.disabled = true;
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
  if (rxMode === '1p') {
    if (rxState === 'waiting') {
      for (var i = 0; i < rxTimeouts.length; i++) clearTimeout(rxTimeouts[i]); rxTimeouts = [];
      rxState = 'too-early'; sendCmd('LED1:OFF'); sendCmd('MODE:CANDLE');
      var d = document.getElementById('rx-display'); d.className = 'reaction-display too-early'; d.innerHTML = '<div class="game-prompt" style="color:var(--accent-coral)">Too early!</div>';
      document.getElementById('rx-result').innerHTML = '<span style="color:var(--accent-coral)">Wait for the light</span>';
      rxTimeouts.push(addTimeout(rxReset, 2000));
    } else if (rxState === 'ready') {
      var ms = Math.round(performance.now() - rxStart);
      rxState = 'result'; sendCmd('LED1:OFF'); sendCmd('MODE:CANDLE');
      if (ms < rxBest) rxBest = ms;
      var be = document.getElementById('rx-best'); if (be) be.textContent = rxBest + 'ms';
      var d = document.getElementById('rx-display'); d.className = 'reaction-display'; d.innerHTML = '<div class="game-prompt" style="color:var(--accent-green)">' + ms + 'ms</div>';
      document.getElementById('rx-result').innerHTML = '<span style="color:var(--accent-green)">Great reaction!</span>';
      rxTimeouts.push(addTimeout(rxReset, 2500));
    }
  } else {
    if (rxState === 'waiting') {
      var winner = player === 1 ? 2 : 1;
      rxState = 'result'; sendCmd('LED1:OFF'); sendCmd('LED2:OFF'); sendCmd('MODE:CANDLE');
      rxWins[winner - 1]++; rxShow1v1(winner, pN(player) + ' pressed too early');
      rxTimeouts.push(addTimeout(rxReset, 3000));
    } else if (rxState === 'ready') {
      var ms = Math.round(performance.now() - rxStart);
      rxState = 'result'; sendCmd('LED1:OFF'); sendCmd('LED2:OFF'); sendCmd('MODE:CANDLE');
      sendCmd('LED' + player + ':ON'); rxTimeouts.push(addTimeout(function () { sendCmd('LED' + player + ':OFF'); }, 400));
      rxWins[player - 1]++; rxShow1v1(player, ms + 'ms');
      rxTimeouts.push(addTimeout(rxReset, 3000));
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
function rxReset() { rxState = 'idle'; for (var i = 0; i < rxTimeouts.length; i++) clearTimeout(rxTimeouts[i]); rxTimeouts = []; rxBuildUI(); }
function destroyReaction() { rxState = 'idle'; for (var i = 0; i < rxTimeouts.length; i++) clearTimeout(rxTimeouts[i]); rxTimeouts = []; }

// ========== MASH ==========
var msState = 'idle', msMode = '1p', msCount = 0, msCount1 = 0, msCount2 = 0, msTimeLeft = 0, msInterval = null, msBest = 0, msWins = [0, 0];

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
  var h = '<div class="mode-toggle"><span class="mode-opt' + (msMode === '1p' ? ' active' : '') + md + '" onclick="msSetMode(\'1p\')">1 Player</span><span class="mode-opt' + (msMode === '1v1' ? ' active' : '') + md + '" onclick="msSetMode(\'1v1\')">1v1</span></div>';
  if (msMode === '1p') {
    h += '<div class="mash-display"><div class="mash-count" id="ms-count">0</div><div class="mash-timer" id="ms-timer">Time: <span>10</span>s</div><div class="mash-rate" id="ms-rate"></div></div><div class="mash-bar-track"><div class="mash-bar-fill" id="ms-bar"></div></div><button class="game-btn" id="ms-btn" onclick="msStartGame()">Start</button><div class="best-score">Best: <span id="ms-best">' + (msBest || '--') + '</span> presses</div>';
  } else {
    h += '<div class="vs-row"><div class="vs-player p1"><div class="vs-label">Player 1</div><div class="vs-value" id="ms-c1">0</div></div><div class="vs-divider"><div style="font-size:11px">Time</div><div style="font-size:18px;color:var(--accent-coral)" id="ms-vt">10</div></div><div class="vs-player p2"><div class="vs-label">Player 2</div><div class="vs-value" id="ms-c2">0</div></div></div><div class="mash-vs-bars"><div class="mash-bar-row p1"><div class="bl">P1</div><div class="bt"><div class="bf" id="ms-b1"></div></div></div><div class="mash-bar-row p2"><div class="bl">P2</div><div class="bt"><div class="bf" id="ms-b2"></div></div></div></div><button class="game-btn" id="ms-btn" onclick="msStartGame()">Start</button><div class="game-result" id="ms-result"></div><div class="wins-row"><span class="wp1">P1: ' + msWins[0] + '</span> | <span class="wp2">P2: ' + msWins[1] + '</span></div>';
  }
  body.innerHTML = h;
}

function msStartGame() {
  if (msState !== 'idle') return;
  msCount = 0; msCount1 = 0; msCount2 = 0; msTimeLeft = 10; msState = 'playing'; sendCmd('MODE:GAME');
  if (msMode === '1p') {
    var el = document.getElementById('ms-count'); if (el) el.textContent = '0';
    var tl = document.getElementById('ms-timer'); if (tl) tl.innerHTML = 'Time: <span>10</span>s';
    var rt = document.getElementById('ms-rate'); if (rt) rt.textContent = '';
    var br = document.getElementById('ms-bar'); if (br) br.style.width = '0%';
  } else {
    var c1 = document.getElementById('ms-c1'); if (c1) c1.textContent = '0';
    var c2 = document.getElementById('ms-c2'); if (c2) c2.textContent = '0';
    var vt = document.getElementById('ms-vt'); if (vt) vt.textContent = '10';
    var b1 = document.getElementById('ms-b1'); if (b1) b1.style.width = '0%';
    var b2 = document.getElementById('ms-b2'); if (b2) b2.style.width = '0%';
    var res = document.getElementById('ms-result'); if (res) res.textContent = '';
  }
  var btn = document.getElementById('ms-btn'); if (btn) btn.disabled = true;
  msInterval = setInterval(function () {
    msTimeLeft--;
    if (msMode === '1p') {
      var tl = document.getElementById('ms-timer'); if (tl) tl.innerHTML = 'Time: <span>' + msTimeLeft + '</span>s';
      var rt = document.getElementById('ms-rate'); if (rt && msTimeLeft < 10) rt.textContent = (msCount / (10 - msTimeLeft)).toFixed(1) + ' presses/s';
    } else {
      var vt = document.getElementById('ms-vt'); if (vt) vt.textContent = msTimeLeft;
    }
    if (msTimeLeft <= 0) {
      clearInterval(msInterval); msInterval = null; msState = 'result'; sendCmd('MODE:CANDLE');
      if (msMode === '1p') {
        if (msCount > msBest) msBest = msCount;
        var be = document.getElementById('ms-best'); if (be) be.textContent = msBest;
        addTimeout(msReset, 3000);
      } else {
        var w = 0; if (msCount1 > msCount2) w = 1; else if (msCount2 > msCount1) w = 2;
        if (w) msWins[w - 1]++;
        var res = document.getElementById('ms-result');
        if (res) {
          if (w) res.innerHTML = '<div class="winner-banner ' + pCl(w) + '">' + pN(w) + ' Wins! (' + msCount1 + ' vs ' + msCount2 + ')</div>';
          else res.innerHTML = '<div class="winner-banner tie">Tie! (' + msCount1 + ' vs ' + msCount2 + ')</div>';
        }
        msBuildWR(); addTimeout(msReset, 3000);
      }
    }
  }, 1000);
}

function msPress(player) {
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
function msReset() { msState = 'idle'; msBuildUI(); }
function destroyMash() { if (msInterval) { clearInterval(msInterval); msInterval = null; } msState = 'idle'; }

// ========== TUG OF WAR ==========
var twState = 'idle', twMode = '1p', twPos = 50, twTimer = 15, twInterval = null, twAF = null, twDiff = 1, twCanvas, twCtx, twWins = [0, 0];

function openTow() {
  closeOtherGames('tow'); activeGameId = 'tow';
  openWindow('tow', 'Tug of War', 460, 400, function (body) {
    body.style.overflow='hidden';
    body.style.padding='12px';
    twBuildUI(body);
    gameHandlers['tow'] = { b1: function () { twPress(1); }, b2: function () { twPress(2); } };
  });
}

function twSetMode(m) { if (twState !== 'idle') return; twMode = m; twBuildUI(); }

function twBuildUI(body) {
  if (!body) body = document.getElementById('body-tow'); if (!body) return;
  var md = twState !== 'idle' ? ' disabled' : '';
  var sub = twMode === '1p' ? 'Mash buttons to pull the rope to your side!' : 'P1 pulls left (Btn 1) &middot; P2 pulls right (Btn 2)';
  var h = '<div class="mode-toggle"><span class="mode-opt' + (twMode === '1p' ? ' active' : '') + md + '" onclick="twSetMode(\'1p\')">1 Player</span><span class="mode-opt' + (twMode === '1v1' ? ' active' : '') + md + '" onclick="twSetMode(\'1v1\')">1v1</span></div>';
  h += '<div class="tow-canvas-wrap"><canvas id="tw-canvas" width="428" height="200"></canvas></div><button class="game-btn" id="tw-btn" onclick="twStartGame()">Start</button><div class="game-sub" style="margin-top:8px">' + sub + '</div>';
  if (twMode === '1v1') h += '<div class="wins-row"><span class="wp1">P1: ' + twWins[0] + '</span> | <span class="wp2">P2: ' + twWins[1] + '</span></div>';
  body.innerHTML = h;
  twCanvas = document.getElementById('tw-canvas'); twCtx = twCanvas.getContext('2d');
  twCanvas.width = twCanvas.parentElement.clientWidth; twCanvas.height = 200; drawTow();
}

function twStartGame() {
  if (twState !== 'idle') return;
  twPos = 50; twTimer = 15; twDiff = 1; twState = 'playing'; sendCmd('MODE:GAME');
  var btn = document.getElementById('tw-btn'); if (btn) btn.disabled = true;
  twInterval = setInterval(function () {
    twTimer--;
    if (twMode === '1p') twDiff += 0.12;
    if (twTimer <= 0) {
      clearInterval(twInterval); twInterval = null;
      if (twMode === '1p') {
        twState = 'won'; sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); drawTow(); addTimeout(twReset, 3000);
      } else {
        var w = twPos < 50 ? 1 : twPos > 50 ? 2 : 0;
        twState = w ? 'won' : 'lost';
        if (w) twWins[w - 1]++;
        sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE');
        if (w) { sendCmd('LED' + w + ':ON'); addTimeout(function () { sendCmd('LED' + w + ':OFF'); }, 500); }
        drawTow(); twBuildWR(); addTimeout(twReset, 3000);
      }
    }
  }, 1000);
  twLoop();
}

function twLoop() {
  if (twState !== 'playing') return;
  if (twMode === '1p') twPos += twDiff * 0.25; else twPos += (50 - twPos) * 0.008;
  if (twMode === '1p' && twPos >= 100) {
    twState = 'lost'; if (twInterval) { clearInterval(twInterval); twInterval = null; }
    sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); drawTow(); addTimeout(twReset, 3000); return;
  }
  if (twMode === '1v1') {
    if (twPos <= 0) {
      twState = 'won'; twWins[0]++; if (twInterval) { clearInterval(twInterval); twInterval = null; }
      sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); sendCmd('LED1:ON');
      addTimeout(function () { sendCmd('LED1:OFF'); }, 500); drawTow(); twBuildWR(); addTimeout(twReset, 3000); return;
    }
    if (twPos >= 100) {
      twState = 'lost'; twWins[1]++; if (twInterval) { clearInterval(twInterval); twInterval = null; }
      sendCmd('LED:BOTH:OFF'); sendCmd('MODE:CANDLE'); sendCmd('LED2:ON');
      addTimeout(function () { sendCmd('LED2:OFF'); }, 500); drawTow(); twBuildWR(); addTimeout(twReset, 3000); return;
    }
  }
  var l1 = Math.round(vmap(twPos, 0, 100, 255, 30)), l2 = Math.round(vmap(twPos, 0, 100, 30, 255));
  sendCmd('LED1:VAL:' + l1); sendCmd('LED2:VAL:' + l2); drawTow(); twAF = requestAnimationFrame(twLoop);
}

function twPress(player) {
  if (twState !== 'playing') return;
  if (twMode === '1p') { twPos -= 3.5; if (twPos < 0) twPos = 0; }
  else { if (player === 1) { twPos -= 3.5; if (twPos < 0) twPos = 0; } else { twPos += 3.5; if (twPos > 100) twPos = 100; } }
}

function drawTow() {
  if (!twCtx) return; var c = twCtx, w = twCanvas.width, h = twCanvas.height;
  c.clearRect(0, 0, w, h);
  var g1 = c.createLinearGradient(0, 0, w * 0.45, 0); g1.addColorStop(0, 'rgba(129,178,154,0.25)'); g1.addColorStop(1, 'rgba(129,178,154,0)'); c.fillStyle = g1; c.fillRect(0, 0, w * 0.45, h);
  var g2 = c.createLinearGradient(w * 0.55, 0, w, 0); g2.addColorStop(0, 'rgba(224,122,95,0)'); g2.addColorStop(1, 'rgba(224,122,95,0.25)'); c.fillStyle = g2; c.fillRect(w * 0.55, 0, w * 0.45, h);
  var ll = twMode === '1p' ? 'YOU' : 'P1', rl = twMode === '1p' ? 'OPPONENT' : 'P2';
  c.fillStyle = '#81B29A'; c.font = 'bold 13px Quicksand'; c.textAlign = 'left'; c.fillText(ll, 12, 22);
  c.fillStyle = '#E07A5F'; c.textAlign = 'right'; c.fillText(rl, w - 12, 22);
  c.save(); c.strokeStyle = 'rgba(61,64,91,0.15)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(w / 2, 32); c.lineTo(w / 2, h - 22); c.stroke(); c.restore();
  var ry = h / 2 + 8, rx = vmap(twPos, 0, 100, 36, w - 36); c.lineCap = 'round'; c.lineWidth = 5;
  c.strokeStyle = '#C9A97A'; c.beginPath(); c.moveTo(16, ry); c.lineTo(rx, ry); c.stroke();
  c.strokeStyle = '#A68656'; c.beginPath(); c.moveTo(rx, ry); c.lineTo(w - 16, ry); c.stroke();
  c.fillStyle = '#E07A5F'; c.beginPath(); c.arc(rx, ry, 11, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#C4593F'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#FFFAF5'; c.font = 'bold 9px Quicksand'; c.textAlign = 'center'; c.fillText(Math.round(twPos), rx, ry + 3);
  c.fillStyle = '#3D405B'; c.font = 'bold 16px Quicksand'; c.textAlign = 'center'; c.fillText(twTimer + 's', w / 2, h - 4);
  if (twState === 'won' || twState === 'lost') {
    c.fillStyle = 'rgba(255,250,245,0.82)'; c.fillRect(0, 0, w, h); c.textAlign = 'center';
    if (twMode === '1p') { c.fillStyle = twState === 'won' ? '#81B29A' : '#E07A5F'; c.font = 'bold 26px Quicksand'; c.fillText(twState === 'won' ? 'You Won!' : 'You Lost!', w / 2, h / 2 + 4); }
    else {
      var msg = ''; if (twPos <= 0) { msg = 'Player 1 Wins!'; c.fillStyle = '#81B29A'; } else if (twPos >= 100) { msg = 'Player 2 Wins!'; c.fillStyle = '#E07A5F'; } else { msg = Math.abs(twPos - 50) < 2 ? 'Tie!' : (twPos < 50 ? 'Player 1 Wins!' : 'Player 2 Wins!'); c.fillStyle = twPos < 50 ? '#81B29A' : '#E07A5F'; }
      c.font = 'bold 26px Quicksand'; c.fillText(msg, w / 2, h / 2 + 4);
    }
  }
}

function twBuildWR() { var e = document.querySelector('#body-tow .wins-row'); if (e) e.innerHTML = '<span class="wp1">P1: ' + twWins[0] + '</span> | <span class="wp2">P2: ' + twWins[1] + '</span>'; }
function twReset() { twState = 'idle'; twPos = 50; twBuildUI(); }
function destroyTow() { if (twInterval) { clearInterval(twInterval); twInterval = null; } if (twAF) { cancelAnimationFrame(twAF); twAF = null; } twState = 'idle'; }

// ========== FLAPPY ==========
var fbState = 'idle', fbBird, fbPipes, fbScore, fbBest = 0, fbAF = null, fbCanvas, fbCtx, fbPipeTimer;
var FBG = 0.38, FBF = -6.5, FBS = 2.2, FBGAP = 120, FBPW = 42, FBI = 95;

function openFlappy() {
  closeOtherGames('flappy'); activeGameId = 'flappy';
  openWindow('flappy', 'Flappy Bird', 360, 440, function (body) {
    body.style.padding = '8px'; body.style.display = 'flex'; body.style.flexDirection = 'column';
    body.innerHTML = '<div class="flappy-wrap" id="fb-wrap"><canvas id="fb-canvas"></canvas><div class="flappy-overlay" id="fb-overlay"><div class="flappy-start-text">Press any button to start</div><div class="best-score" style="margin-top:10px">Best: <span id="fb-best-d">' + fbBest + '</span></div></div></div>';
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