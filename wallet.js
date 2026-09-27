/* ============================================================
   MYTOKEN Wallet Module v3.0
   تصميم احترافي — بطاقة محفظة في صفحة "حسابك" فقط
   ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  var CONFIG = {
    manifestUrl: 'https://mytoken-mining-app.netlify.app/tonconnect-manifest.json',
    apiBase: 'https://mytoken-api.vercel.app',
    maxRetries: 12,
    retryDelay: 300,
    sdkLoadTimeout: 20000
  };

  // ============================================================
  // STATE
  // ============================================================
  var STATE = {
    ui: null,
    address: null,
    connected: false,
    userId: null,
    initialized: false,
    connecting: false,
    restored: false
  };

  // ============================================================
  // UTILS
  // ============================================================
  function log() {
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[Wallet]');
    console.log.apply(console, a);
  }

  function warn() {
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[Wallet]');
    console.warn.apply(console, a);
  }

  function err() {
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[Wallet]');
    console.error.apply(console, a);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function shorten(addr) {
    if (!addr) return '—';
    if (addr.length <= 16) return addr;
    return addr.substring(0, 8) + '...' + addr.substring(addr.length - 6);
  }

  function vibrate(p) {
    try {
      if (navigator.vibrate) navigator.vibrate(p || 20);
    } catch (e) {}
  }

  function notify(msg, type) {
    try {
      if (window.toast && typeof window.toast === 'function') {
        window.toast(msg, type);
        return;
      }
    } catch (e) {}
    var div = document.createElement('div');
    div.textContent = msg;
    div.style.cssText =
      'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);' +
      'background:' +
      (type === 'err' ? '#ff4d4d' : type === 'ok' ? '#00c96b' : '#333') +
      ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:800;' +
      'z-index:99999;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.5);';
    document.body.appendChild(div);
    setTimeout(function () {
      div.remove();
    }, 2500);
  }

  function getUserData() {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        var tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        var u = tg.initDataUnsafe && tg.initDataUnsafe.user;
        if (u && u.id) return { id: u.id, name: u.first_name || 'User' };
      }
    } catch (e) {}
    try {
      var saved = localStorage.getItem('mytoken_uid');
      if (saved) return { id: parseInt(saved), name: 'User' };
    } catch (e) {}
    return { id: null, name: 'User' };
  }

  // ============================================================
  // TON CONNECT SDK LOADER
  // ============================================================
  function waitForSDK() {
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var interval = setInterval(function () {
        if (typeof TON_CONNECT_UI !== 'undefined' && TON_CONNECT_UI.TonConnectUI) {
          clearInterval(interval);
          log('SDK loaded after', Date.now() - start, 'ms');
          resolve(true);
        } else if (Date.now() - start > CONFIG.sdkLoadTimeout) {
          clearInterval(interval);
          reject(new Error('SDK load timeout'));
        }
      }, CONFIG.retryDelay);
    });
  }

  // ============================================================
  // INIT
  // ============================================================
  async function init() {
    if (STATE.initialized) return true;
    log('Initializing...');
    try {
      await waitForSDK();
    } catch (e) {
      err('Failed to load SDK:', e.message);
      notify('❌ فشل تحميل TON', 'err');
      return false;
    }

    try {
      STATE.ui = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: CONFIG.manifestUrl,
        buttonRootId: null
      });

      STATE.ui.onStatusChange(function (wallet) {
        if (wallet && wallet.account && wallet.account.address) {
          STATE.connected = true;
          STATE.address = wallet.account.address;
          log('Connected:', STATE.address);
          try {
            localStorage.setItem('mytoken_wallet', STATE.address);
          } catch (e) {}
          vibrate(50);
          notify('✅ تم ربط المحفظة', 'ok');
          updateUI();
          saveToServer(STATE.address);
        } else {
          if (STATE.connected) log('Disconnected');
          STATE.connected = false;
          STATE.address = null;
          try {
            localStorage.removeItem('mytoken_wallet');
          } catch (e) {}
          updateUI();
        }
      });

      STATE.initialized = true;
      log('✅ Initialized successfully');
      updateUI();
      return true;
    } catch (e) {
      err('Init error:', e);
      notify('❌ خطأ في التهيئة', 'err');
      return false;
    }
  }

  // ============================================================
  // CONNECT
  // ============================================================
  async function connect() {
    if (STATE.connecting) {
      log('Already connecting...');
      return;
    }
    if (STATE.connected) {
      notify('👛 ' + shorten(STATE.address), 'ok');
      return;
    }

    STATE.connecting = true;
    log('Connect requested');

    if (!STATE.initialized) {
      var ok = await init();
      if (!ok) {
        STATE.connecting = false;
        return;
      }
    }

    try {
      await STATE.ui.openModal();
      log('Modal opened');
    } catch (e) {
      err('openModal error:', e);
      // إعادة المحاولة
      try {
        STATE.ui = null;
        STATE.initialized = false;
        await init();
        if (STATE.ui) {
          await STATE.ui.openModal();
        }
      } catch (e2) {
        err('Retry failed:', e2);
        notify('❌ فشل الاتصال، حاول مرة أخرى', 'err');
      }
    } finally {
      STATE.connecting = false;
    }
  }

  // ============================================================
  // DISCONNECT
  // ============================================================
  async function disconnect() {
    if (!STATE.ui) {
      notify('المحفظة غير مهيأة', 'err');
      return;
    }
    try {
      await STATE.ui.disconnect();
      STATE.connected = false;
      STATE.address = null;
      try {
        localStorage.removeItem('mytoken_wallet');
      } catch (e) {}
      updateUI();
      vibrate(30);
      notify('تم قطع الاتصال', '');
    } catch (e) {
      err('Disconnect error:', e);
      notify('❌ فشل قطع الاتصال', 'err');
    }
  }

  // ============================================================
  // SAVE TO SERVER
  // ============================================================
  async function saveToServer(address) {
    var user = getUserData();
    if (!user.id || !address) return;
    try {
      var res = await fetch(CONFIG.apiBase + '/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, wallet: address })
      });
      var data = await res.json();
      if (data && data.ok) log('Wallet saved to server');
    } catch (e) {
      warn('Save to server failed:', e.message);
    }
  }

  // ============================================================
  // UI UPDATE
  // ============================================================
  function updateUI() {
    var status = $('walletStatus');
    var statusText = $('walletStatusText');
    var addr = $('walletAddress');
    var connectBtn = $('walletConnectBtn');
    var disconnectBtn = $('walletDisconnectBtn');
    var copyBtn = $('walletCopyBtn');

    if (!status) return;

    if (STATE.connected && STATE.address) {
      status.className = 'wallet-status on';
      if (statusText) statusText.textContent = 'متصل ✓';
      if (addr) {
        addr.style.display = 'block';
        addr.textContent = STATE.address;
      }
      if (connectBtn) connectBtn.style.display = 'none';
      if (disconnectBtn) disconnectBtn.style.display = 'flex';
      if (copyBtn) copyBtn.style.display = 'flex';
    } else {
      status.className = 'wallet-status';
      if (statusText) statusText.textContent = 'غير متصل';
      if (addr) addr.style.display = 'none';
      if (connectBtn) connectBtn.style.display = 'flex';
      if (disconnectBtn) disconnectBtn.style.display = 'none';
      if (copyBtn) copyBtn.style.display = 'none';
    }
  }

  // ============================================================
  // COPY ADDRESS
  // ============================================================
  async function copyAddress() {
    if (!STATE.address) return;
    try {
      await navigator.clipboard.writeText(STATE.address);
      notify('📋 تم نسخ العنوان', 'ok');
      vibrate(30);
    } catch (e) {
      var ta = document.createElement('textarea');
      ta.value = STATE.address;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        notify('📋 تم النسخ', 'ok');
      } catch (e2) {
        notify('❌ فشل النسخ', 'err');
      }
      ta.remove();
    }
  }

  // ============================================================
  // RESTORE SESSION
  // ============================================================
  function restoreSession() {
    try {
      var saved = localStorage.getItem('mytoken_wallet');
      if (saved) {
        log('Restoring session:', saved);
      }
    } catch (e) {}
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  window.MYTWallet = {
    init: init,
    connect: connect,
    disconnect: disconnect,
    copyAddress: copyAddress,
    updateUI: updateUI,
    getState: function () {
      return STATE;
    },
    isConnected: function () {
      return STATE.connected;
    },
    getAddress: function () {
      return STATE.address;
    }
  };

  // Aliases
  window.openWalletModal = connect;
  window.disconnectWallet = disconnect;
  window.copyWalletAddress = copyAddress;

  // ============================================================
  // AUTO INIT
  // ============================================================
  function autoInit() {
    restoreSession();
    updateUI();
    setTimeout(function () {
      if (typeof TON_CONNECT_UI !== 'undefined') {
        init();
      }
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !STATE.initialized) {
      setTimeout(autoInit, 500);
    }
  });

  log('Module loaded');
})();
