'use strict';
// 加到主畫面：LINE 內自動改用瀏覽器開啟；手機第一次打開時自動詢問是否加到主畫面。
// 手機系統規定一定要使用者按一下確認，網頁無法自己偷偷加圖示。
(() => {
  const ua = navigator.userAgent;
  const isLine = /\bLine\//i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOSSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Line\//i.test(ua);

  const EXT_PARAM = 'openExternalBrowser';
  const externalUrl = () => {
    const u = new URL(location.href);
    u.searchParams.set(EXT_PARAM, '1');
    return u.href;
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 無痕模式等 */ } },
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* 忽略 */ } },
  };

  // 1) 在 LINE 裡打開：自動改用手機預設瀏覽器（LINE 支援 openExternalBrowser=1 參數）
  if (isLine && !isStandalone && !new URL(location.href).searchParams.has(EXT_PARAM) && !ss.get('lineRedirected')) {
    ss.set('lineRedirected', '1');
    location.replace(externalUrl());
    return;
  }

  if (isStandalone) return;   // 已經從主畫面圖示開啟，不必再問

  const $ = (id) => document.getElementById(id);
  const btn = $('install-btn');
  const dlg = $('install-dlg');
  const body = $('install-body');
  const go = $('install-go');
  const later = $('install-later');
  let deferred = null;       // Android / 電腦 Chrome 的安裝事件
  let autoShown = false;

  const ASK_KEY = 'installAskedAt';
  const recentlyAsked = () => Date.now() - Number(store.get(ASK_KEY) || 0) < 3 * 86400000;

  function steps(items) {
    const ol = document.createElement('ol');
    ol.className = 'install-steps';
    for (const html of items) {
      const li = document.createElement('li');
      li.innerHTML = html;       // 內容為本檔固定字串
      ol.append(li);
    }
    return ol;
  }

  function fill() {
    body.replaceChildren();
    go.hidden = false;
    go.onclick = null;
    if (isLine) {
      body.append(steps([
        '點右上角 <span class="ico">⋯</span> 或右下角 <span class="ico">⋯</span>',
        '選 <b>「用預設瀏覽器開啟」</b>',
        '在瀏覽器裡按右上角金色的 <b>「＋ 主畫面」</b>',
      ]));
      go.textContent = '改用瀏覽器開啟';
      go.onclick = () => { location.href = externalUrl(); };
    } else if (deferred) {
      go.textContent = '好，加入';
      go.onclick = async () => {
        const ev = deferred;
        deferred = null;
        close();
        ev.prompt();
        try { await ev.userChoice; } catch { /* 忽略 */ }
      };
    } else if (isIOS) {
      body.append(steps(isIOSSafari ? [
        '點畫面下方的 <b>分享</b> 按鈕 <span class="ico">⬆</span>',
        '往下滑，點 <b>「加入主畫面」</b>',
        '點右上角的 <b>「新增」</b>',
      ] : [
        '請先用 <b>Safari</b> 打開這個網頁',
        '點下方的 <b>分享</b> 按鈕 <span class="ico">⬆</span>',
        '點 <b>「加入主畫面」</b> → <b>「新增」</b>',
      ]));
      go.textContent = '知道了';
      go.onclick = close;
    } else {
      body.append(steps([
        '點右上角的 <span class="ico">⋮</span>',
        '點 <b>「加到主畫面」</b> 或 <b>「安裝應用程式」</b>',
        '點 <b>「新增」</b> 或 <b>「安裝」</b>',
      ]));
      go.textContent = '知道了';
      go.onclick = close;
    }
  }

  function open() {
    fill();
    store.set(ASK_KEY, String(Date.now()));
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function close() {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  function autoAsk() {
    if (autoShown || !isMobile || recentlyAsked()) return;
    autoShown = true;
    open();
  }

  btn.hidden = false;
  btn.addEventListener('click', open);
  later.addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });   // 點背景關閉

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (dlg.open) fill();     // 說明視窗已開著：換成一鍵安裝
    else autoAsk();           // Android Chrome：可以一鍵安裝，第一次打開自動詢問
  });
  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    close();
  });

  // iPhone 或沒有安裝事件的瀏覽器：稍等一下再自動顯示步驟
  window.addEventListener('load', () => {
    setTimeout(() => { if (!deferred) autoAsk(); }, isAndroid ? 2500 : 800);
  });
})();
