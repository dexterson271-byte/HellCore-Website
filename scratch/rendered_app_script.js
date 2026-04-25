
    'use strict';
    const AD_COMPLETION_SECRET = "test-secret";
    // ════════════════════════════════════════════════════
    // STATE
    // ════════════════════════════════════════════════════
    let ME = null, TOK = null, CART_N = 0;
    let SV3D = null, LAST_UUID = null, LAST_UNAME = null;
    const CAPS = { LG: '', RG: '' };
    const STAFF_ROLES = ['helper', 'mod', 'admin', 'dev', 'owner', 'founder'];
    let CUR_FORUM = null;
    let PENDING_ROUTE = null, PENDING_TICKET_ID = null, NEXT_AFTER_AUTH = null;
    let STAFF_PUSH_READY = false, TIX_TYPING_TIMER = null, TIX_TYPING_HIDE = null;
    let isCheckingSession = false;
    let XP_STATE = { current_xp: 0, rank: null, daily_ads_watched: 0, ads_remaining_today: 20, next_ad_available_at: null };
    let STORE_RANKS_CACHE = [];
    let DASHBOARD_TIMER = null;
    let ACTIVE_AD_SESSION = null;
    let ACTIVE_AD_INTERVAL = null;
    let PENDING_RANK_PURCHASE = null;


    function toggleMobileMenu(open = null) {
      const nav = I('MOBILE-NAV');
      if (!nav) return;
      if (open === null) nav.classList.toggle('open');
      else if (open) nav.classList.add('open');
      else nav.classList.remove('open');
      document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
    }

    function getCookie(name) {
      return (document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`)) || [])[2] || '';
    }

    function rememberAuthIntent(routeId = null, ticketId = null) {
      if (routeId) PENDING_ROUTE = routeId;
      if (ticketId) PENDING_TICKET_ID = ticketId;
      if (!NEXT_AFTER_AUTH) {
        const next = new URLSearchParams(window.location.search).get('next');
        NEXT_AFTER_AUTH = next || '';
      }
    }

    function redirectToNextAfterAuth() {
      if (NEXT_AFTER_AUTH) {
        const next = NEXT_AFTER_AUTH;
        NEXT_AFTER_AUTH = '';
        window.location.href = next;
        return true;
      }
      if (PENDING_ROUTE) {
        const targetRoute = PENDING_ROUTE;
        const targetTicket = PENDING_TICKET_ID;
        PENDING_ROUTE = null;
        PENDING_TICKET_ID = null;
        GO(targetRoute);
        if (targetTicket) setTimeout(() => openTix(targetTicket), 120);
        return true;
      }
      return false;
    }

    function rememberVisibleRouteForAuth() {
      const routeId = window.location.pathname.substring(1).replace(/\//g, '-') || 'home';
      const ticketId = routeId === 'tickets'
        ? (TIX?.activeId || new URLSearchParams(window.location.search).get('id'))
        : null;
      if (routeId !== 'home') rememberAuthIntent(routeId, ticketId);
    }

    function handleSessionExpired() {
      rememberVisibleRouteForAuth();
      ME = null;
      TOK = null;
      localStorage.removeItem('hc_token');
      localStorage.removeItem('hc_user');
      refreshUI();
      openM('ML');
      toast('err', 'Your session expired. Please log in again.');
    }

    // ════════════════════════════════════════════════════
    // BOOT
    // ════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', async () => {
      // 1. SESSION WARMUP (Checkout Token Check)
      const urlParams = new URLSearchParams(window.location.search);
      const tempToken = urlParams.get('temp_token');
      NEXT_AFTER_AUTH = urlParams.get('next') || '';

      async function initSession() {
        if (tempToken) {
          console.log("[Auth] Warmup token detected, restoring session...");
          try {
            const res = await window.fetch('/api/auth/warmup', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: tempToken })
            });
            const r = await res.json();
            if (r.ok) {
              ME = r.user;
              localStorage.setItem('hc_user', JSON.stringify(ME));
              // Token settled, refresh to clean URL
              window.location.href = window.location.origin + window.location.pathname;
              return false; // Stop here, page will reload
            }
          } catch (err) { console.log("Warmup failed:", err); }
        }

        // 2. Restore session — check Cookies, then localStorage
        let t = getCookie('hc_token') || localStorage.getItem('hc_token');
        const u = localStorage.getItem('hc_user');
        if (t && u) {
          TOK = t;
          try { ME = JSON.parse(u); } catch (e) { }
          refreshUI();
          // Re-sync from server to get latest roles
          try {
            const r = await API('/api/auth/me');
            ME = r;
            localStorage.setItem('hc_user', JSON.stringify(ME));
            refreshUI();
            return true;
          } catch (err) {
            console.log('Session re-sync failed:', err.message);
            if ((err.message || '').includes('401') || (err.message || '').includes('Authentication')) {
              ME = null;
              TOK = null;
              localStorage.removeItem('hc_token');
              localStorage.removeItem('hc_user');
              refreshUI();
            }
          }
        }
        if (t && !u) {
          try {
            const r = await API('/api/auth/me');
            TOK = t;
            ME = r;
            localStorage.setItem('hc_user', JSON.stringify(ME));
            refreshUI();
            return true;
          } catch (err) {
            console.log('Cookie session restore failed:', err.message);
            if ((err.message || '').includes('401') || (err.message || '').includes('Authentication')) {
              ME = null;
              TOK = null;
              localStorage.removeItem('hc_token');
              localStorage.removeItem('hc_user');
              refreshUI();
            }
          }
        }
        return false;
      }

      await initSession();

      genCap('LG'); genCap('RG');
      checkAnn();

      TOK = getCookie('hc_token') || TOK;

      // Close overlay on backdrop click
      document.querySelectorAll('.ov').forEach(o => {
        o.addEventListener('click', e => { if (e.target === o) o.classList.remove('OPEN'); });
      });

      buildStores();
      checkStatus();
      setInterval(checkStatus, 60000); // Poll every 60s — matches graph resolution
      loadAbout();
      // Init recent searches + showcase for Stats tab
      renderRecentSearches();
      loadShowcase();
      initRouting();
      handleTicketDeepLink();
      initAdminListeners();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
          if (event.data?.type !== 'notification-open' || !event.data.url) return;
          const target = new URL(event.data.url, window.location.origin);
          if (target.pathname === '/tickets') {
            const targetId = target.searchParams.get('id');
            GO('tickets', false);
            if (targetId) setTimeout(() => openTix(targetId), 180);
            return;
          }
          window.location.href = `${target.pathname}${target.search}`;
        });
      }
    });

    let searchDebounce;
    function initAdminListeners() {
      const searchInp = I('ADM-P-SEARCH');
      if (searchInp) {
        searchInp.addEventListener('input', () => {
          clearTimeout(searchDebounce);
          searchDebounce = setTimeout(admSearchP, 300);
        });
      }
    }

    function handleTicketDeepLink() {
      const params = new URLSearchParams(window.location.search);
      const page = params.get('page');
      const tid = params.get('id');
      const wantsTickets = page === 'tickets' || window.location.pathname === '/tickets';
      if (!wantsTickets) return;
      if (page === 'tickets') {
        const normalized = tid ? `/tickets?id=${encodeURIComponent(tid)}` : '/tickets';
        history.replaceState({ pg: 'tickets' }, '', normalized);
      }
      if (!ME) {
        rememberAuthIntent('tickets', tid);
        openM('ML');
        return;
      }
      if (tid) {
        setTimeout(() => openTix(tid), 300);
      } else {
        GO('tickets', false);
      }
    }

    async function ensurePushSubscription() {
      if (!ME) {
        toast('err', 'Please log in to enable notifications.');
        return false;
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        toast('err', 'Push notifications are not supported here.');
        return false;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('err', 'Notification permission was not granted.');
        return false;
      }
      try {
        const reg = await navigator.serviceWorker.register('/static/sw.js');
        const activeReg = await navigator.serviceWorker.ready;
        const vapidKey = 'BESlhKyTo4E7kr2llj371KeAwjhO1j0pCy-DTwly3xDTW4Gy1uQPuNc_Qa6-9XlnCxi_RjUA0TL9JNH-rR_OVvo';
        let sub = await activeReg.pushManager.getSubscription();
        if (!sub) {
          sub = await activeReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
          });
        }
        await API('/api/push/subscribe', { method: 'POST', body: { subscription: sub } });
        toast('ok', 'Notifications enabled successfully!');
        return true;

      } catch (e) {
        console.log('Push setup failed:', e);
        toast('err', 'Could not enable notifications.');
        return false;
      }
    }

    // ════════════════════════════════════════════════════
    // NAVIGATION
    // ════════════════════════════════════════════════════
    // ════════════════════════════════════════════════════
    async function GO(id, push = true) {
      // Verification Check for Store and Admin
      const restricted = ['store', 'store-gl', 'store-bw', 'store-sw', 'store-ls', 'store-sv', 'store-pr', 'store-free', 'chat', 'admin', 'logs', 'staff', 'mgmt'];
      if (restricted.includes(id)) {
        if (!ME) {
          rememberAuthIntent(id);
          openM('ML');
          toast('err', 'Please log in to access this feature.');
          return;
        }
        if (!ME.is_verified && ME.role !== 'owner' && ME.role !== 'dev' && ME.role !== 'founder') {
          const res = await API('/api/verify/status');
          if (!res.is_verified) {
            startVerificationFlow();
            return;
          } else {
            ME.is_verified = true;
          }
        }
      }

      if (id === 'admin' && !isAdmin()) { GO('home'); return; }
      if (id === 'staff' && !isStaff()) { GO('home'); return; }

      document.querySelectorAll('.pg').forEach(p => p.classList.remove('ON'));
      document.querySelectorAll('.nb').forEach(b => b.classList.remove('on'));
      const pg = I('pg-' + id);
      if (pg) pg.classList.add('ON');
      window.scrollTo(0, 0);

      // Mark active nav button
      const base = id.split('-')[0];
      document.querySelectorAll('.nb').forEach(b => {
        if (b.textContent.toLowerCase().includes(base)) b.classList.add('on');
      });

      // Update URL
      if (push) {
        let path = id.replace('pg-', '').replace(/-/g, '/');
        if (path === 'home') path = '';
        history.pushState({ pg: id }, '', '/' + path);
      }

      ({
        forums: renderForumIndex,
        players: () => { plT('skin'); initSV3D(); },
        profile: () => { if (ME) { loadProfile(); loadInv(); loadGifts(); loadProfTix(); } else { rememberAuthIntent('profile'); openM('ML'); } },
        tickets: loadTix,
        staff: loadStaff,
        admin: () => { admT('node'); },
        cart: renderCart,
        about: loadAbout,
        store: () => { if (ME) loadRewardStore(); else { rememberAuthIntent('store'); openM('ML'); } },
        'store-gl': () => showStore('gl'),
        'store-bw': () => showStore('bw'),
        'store-sw': () => showStore('sw'),
        'store-ls': () => showStore('ls'),
        'store-sv': () => showStore('sv'),
        'store-pr': () => showStore('pr'),
        'store-free': () => { if (ME) { GO('profile'); } else { rememberAuthIntent('profile'); openM('ML'); } },
      })[id]?.();
    }

    // Handle back/forward buttons
    window.onpopstate = (e) => {
      if (e.state && e.state.pg) GO(e.state.pg, false);
    };

    // Initial Routing Logic
    function initRouting() {
      const path = window.location.pathname.substring(1);
      if (!path) { GO('home', false); return; }

      // Map path back to ID
      // e.g. "store/free" -> "store-free"
      const id = path.replace(/\//g, '-');
      
      // Redirect legacy store paths to the main store landing page
      if (path.startsWith('store/') && id !== 'store-free') {
        GO('store', false); return;
      }

      const target = I('pg-' + id);
      if (target) {
        GO(id, false);
      } else {
        GO('home', false);
      }

    }

    // ════════════════════════════════════════════════════
    // UI REFRESH
    // ════════════════════════════════════════════════════
    function refreshUI() {
      const li = !!ME;
      I('A-OUT').style.display = li ? 'none' : 'flex';
      I('A-IN').style.display = li ? 'flex' : 'none';
      if (!li) {
        XP_STATE = { current_xp: 0, rank: null, daily_ads_watched: 0, ads_remaining_today: 20, next_ad_available_at: null };
        STORE_RANKS_CACHE = [];
        if (DASHBOARD_TIMER) { clearInterval(DASHBOARD_TIMER); DASHBOARD_TIMER = null; }
        if (ACTIVE_AD_INTERVAL) { clearInterval(ACTIVE_AD_INTERVAL); ACTIVE_AD_INTERVAL = null; }
        ACTIVE_AD_SESSION = null;
        return;
      }
      I('NB-ME').innerHTML = '<svg class="ic"><use href="#ic-user"/></svg>  ' + ME.username;
      I('NB-STAFF').style.display = isStaff() ? '' : 'none';
      I('NB-ADMIN').style.display = isAdmin() ? '' : 'none';
      // Update profile head with Flask proxy
      if (ME.mc_username) {
        const h = I('PR-HEAD');
        if (h) h.src = `/api/skin/head/${enc(ME.mc_username)}/74`;
      }
      updateCart();
      loadEvents();
      loadActiveTrials();
    }
    const isStaff = () => ME && ['helper', 'mod', 'dev', 'admin', 'owner', 'founder', 'youtube', 'famous'].includes(ME.role);
    const isAdmin = () => ME && ['helper', 'mod', 'dev', 'admin', 'owner', 'founder'].includes(ME.role);

    // Reinitialize all permission-dependent systems after login/register
    // This fixes the bug where staff chat and admin features don't work until relog
    function reInitPermissions() {
      if (!ME) return;
      // Re-sync user data from server to get latest role
      API('/api/auth/me').then(r => {
        ME = r;
        localStorage.setItem('hc_user', JSON.stringify(ME));
        TOK = getCookie('hc_token') || r.token || null;
        refreshUI();
      }).catch(() => { });
      // Re-init staff systems
      if (isStaff()) {
        startHeartbeat();
        // If user is currently viewing admin, reload it
        const admNode = I('ADM-NODE');
        if (admNode && admNode.style.display !== 'none') loadNexusNode();
      }
    }

    // ════════════════════════════════════════════════════
    // CAPTCHA — new code every open, every error
    // ════════════════════════════════════════════════════
    function genCap(t) {
      const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = ''; for (let i = 0; i < 5; i++) c += ch[Math.floor(Math.random() * ch.length)];
      CAPS[t] = c;
      const el = I(t + '-CC'); if (el) el.textContent = c.split('').join(' ');
      const inp = I(t + '-CI'); if (inp) inp.value = '';
    }

    // ════════════════════════════════════════════════════
    // MODALS
    // ════════════════════════════════════════════════════
    function openM(id) {
      const el = I(id); if (!el) return;
      if (id === 'ML') genCap('LG');
      if (id === 'MR') genCap('RG');
      el.classList.add('OPEN');
    }
    function closeM(id) { I(id)?.classList.remove('OPEN'); }
    function swM(a, b) { closeM(a); openM(b); }
    function NL(fn) { if (!ME) openM('ML'); else fn(); }

    // ════════════════════════════════════════════════════
    // PASSWORD TOGGLE
    // ════════════════════════════════════════════════════
    function togPW(id, btn) {
      const el = I(id); if (!el) return;
      el.type = el.type === 'password' ? 'text' : 'password';
      btn.innerHTML = el.type === 'password' ? '<svg class="ic"><use href="#ic-eye"/></svg>' : '<svg class="ic"><use href="#ic-eye-off"/></svg>';
    }

    // ════════════════════════════════════════════════════
    // AUTH
    // ════════════════════════════════════════════════════
    async function doLogin() {
      const id = V('LG-ID'), pw = V('LG-PW');
      const ci = V('LG-CI').toUpperCase().replace(/\s/g, '');
      I('LG-ERR').textContent = '';
      if (!id || !pw) { I('LG-ERR').textContent = 'Fill all fields.'; return; }
      if (ci !== CAPS.LG) { I('LG-ERR').textContent = 'Wrong CAPTCHA code.'; genCap('LG'); return; }
      try {
        const r = await API('/api/auth/login', { method: 'POST', body: { identifier: id, password: pw } });

        // 1. RELY ON SERVER COOKIE: No more document.cookie = ...
        // 2. STORE USER INFO FOR UI ONLY
        ME = r;
        localStorage.setItem('hc_user', JSON.stringify(ME));

        refreshUI(); closeM('ML');
        reInitPermissions();
        ['LG-ID', 'LG-PW', 'LG-CI'].forEach(x => SV(x, '')); genCap('LG');
        if (!redirectToNextAfterAuth()) handleTicketDeepLink();
        toast('ok', '✓ Welcome back, ' + r.username + '!');
      } catch (e) { I('LG-ERR').textContent = e.message; genCap('LG'); }
    }

    async function doReg() {
      const em = V('RG-EM'), us = V('RG-US'), mc = V('RG-MC'), pw = V('RG-PW'), p2 = V('RG-P2');
      const ci = V('RG-CI').toUpperCase().replace(/\s/g, '');
      I('RG-ERR').textContent = '';
      if (!em || !us || !pw || !p2) { I('RG-ERR').textContent = 'Fill all required fields.'; return; }
      if (pw !== p2) { I('RG-ERR').textContent = 'Passwords do not match.'; return; }
      if (ci !== CAPS.RG) { I('RG-ERR').textContent = 'Wrong CAPTCHA code.'; genCap('RG'); return; }
      try {
        const r = await API('/api/auth/register', { method: 'POST', body: { email: em, username: us, mc_username: mc, password: pw, confirm_password: p2 } });

        // 1. RELY ON SERVER COOKIE
        // 2. STORE USER INFO FOR UI ONLY
        ME = r;
        localStorage.setItem('hc_user', JSON.stringify(ME));
        TOK = getCookie('hc_token') || r.token || null;

        refreshUI(); closeM('MR');
        reInitPermissions();
        ['RG-EM', 'RG-US', 'RG-MC', 'RG-PW', 'RG-P2', 'RG-CI'].forEach(x => SV(x, '')); genCap('RG');
        if (!redirectToNextAfterAuth()) handleTicketDeepLink();
        toast('ok', '✓ Account created! Welcome, ' + r.username + '!');
      } catch (e) { I('RG-ERR').textContent = e.message; genCap('RG'); }
    }

    async function doLogout() {
      try { await API('/api/auth/logout', { method: 'POST' }); } catch (e) { }
      ME = null; TOK = null;
      PENDING_ROUTE = null; PENDING_TICKET_ID = null; NEXT_AFTER_AUTH = '';
      const domain = window.location.hostname.endsWith('hellcore.net') ? '; domain=.hellcore.net' : '';
      document.cookie = `hc_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC${domain}`;
      localStorage.removeItem('hc_token'); localStorage.removeItem('hc_user');
      refreshUI(); GO('home'); toast('ok', 'Logged out.');
    }

    // ════════════════════════════════════════════════════
    // SERVER STATUS
    // ════════════════════════════════════════════════════
    // ════════════════════════════════════════════════════
    // SERVER STATUS — mcsrvstat.us v3 API (live, client-side)
    // ════════════════════════════════════════════════════
    const MC_SERVER = 'mc.hellcore.net';
    const MC_API = `https://api.mcsrvstat.us/3/${MC_SERVER}`;

    // Rolling 60-minute history stored in memory
    const playerHistory = { labels: [], counts: [] };
    let pChart = null;
    let historyLoaded = false;

    async function checkStatus() {
      // Load history once on first run
      if (!historyLoaded) {
        try {
          const hRes = await fetch('/api/serverstatus/history');
          const hData = await hRes.json();
          if (hData.labels && hData.counts) {
            playerHistory.labels = hData.labels;
            playerHistory.counts = hData.counts;
            if (I('CHART-EMPTY')) I('CHART-EMPTY').style.display = 'none';
          }
          historyLoaded = true;
        } catch (e) { }
      }

      try {
        const res = await fetch(MC_API);
        const d = await res.json();

        // --- Navbar dot + text ---
        const dot = I('DOT'), txt = I('STXT');
        const online = d.online || false;
        const players = d.players?.online || 0;
        const maxPlayers = d.players?.max || 0;

        if (online) {
          dot.className = 'dot ON';
          txt.textContent = `${players}/${maxPlayers} online`;
        } else {
          dot.className = 'dot';
          txt.textContent = 'Offline';
        }

        renderStatus(d);
        loadEvents();
        loadActiveTrials();

        // --- Update BW Arenas / Players from Nexus API ---
        try {
          const ovRes = await fetch('/api/serverstatus/overview');
          const ov = await ovRes.json();
          const arEl = I('BW-ARENAS'), plEl = I('BW-PLAYERS');
          if (arEl) arEl.textContent = `${ov.arenas || 0} Arenas`;
          if (plEl) plEl.textContent = `${ov.ingame || 0} In Game`;
        } catch (e) { }

        // --- Append data point to rolling history ---
        const now = new Date();
        const label = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
        playerHistory.labels.push(label);
        playerHistory.counts.push(players);
        // Keep only last 60 data points
        if (playerHistory.labels.length > 60) {
          playerHistory.labels.shift();
          playerHistory.counts.shift();
        }

        updatePlayerChart();

      } catch (e) {
        const dot = I('DOT');
        if (dot) dot.className = 'dot';
      }
    }

    function renderStatus(d) {
      const el = I('HOME-SRV'); if (!el) return;
      if (!d.online) {
        el.innerHTML = `<div style="display:flex;align-items:center;gap:16px;padding:8px">
          <div class="dot" style="width:12px;height:12px;background:#ef4444;box-shadow:0 0 10px #ef4444"></div>
          <div>
            <div style="font-weight:800;font-family:'Outfit',sans-serif;font-size:1.1rem;color:#fca5a5">SERVER OFFLINE</div>
            <div style="font-size:0.8rem;color:var(--tx3)">The network is currently undergoing maintenance.</div>
          </div>
        </div>`;
        return;
      }
      const p = d.players || { online: 0, max: 0 };
      const pct = p.max ? Math.min(100, Math.round((p.online / p.max) * 100)) : 0;
      const motd = d.motd?.clean?.[0] || 'Hellcore Network — Premium Experience';

      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:14px">
              <div class="dot ON" style="width:12px;height:12px"></div>
              <div>
                <div style="display:flex;align-items:baseline;gap:6px">
                  <span style="font-size:1.4rem;font-weight:900;font-family:'Outfit',sans-serif;color:#fff">${p.online}</span>
                  <span style="font-size:0.85rem;color:var(--tx2);font-weight:500">/ ${p.max} PLAYERS</span>
                </div>
                <div style="font-size:0.8rem;color:var(--tx3);font-weight:500;margin-top:1px">${motd}</div>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:0.75rem;font-weight:800;color:var(--g);text-transform:uppercase;letter-spacing:0.06em;background:rgba(255,81,47,0.1);padding:3px 8px;border-radius:6px;border:1px solid rgba(255,81,47,0.2)">${d.version || '1.8 - 1.20'}</div>
              <div style="font-size:0.65rem;color:var(--tx3);margin-top:4px;font-family:monospace">Ping: ${d.debug?.ping || '?'}ms</div>
            </div>
          </div>
          <div style="height:8px;background:rgba(255,255,255,0.04);border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.05)">
            <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, var(--g), var(--g2));box-shadow:0 0 15px var(--g);transition:width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)"></div>
          </div>
        </div>
      `;
    }

    function updatePlayerChart() {
      const canvas = document.getElementById('playerChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      if (pChart) {
        // Live update — push new data without full re-render
        pChart.data.labels = [...playerHistory.labels];
        pChart.data.datasets[0].data = [...playerHistory.counts];
        pChart.update('none'); // 'none' = no animation for smooth live feel
        return;
      }

      // First render
      pChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: playerHistory.labels,
          datasets: [{
            label: 'Players Online',
            data: playerHistory.counts,
            borderColor: 'rgba(255,81,47,1)',
            backgroundColor: 'rgba(255,81,47,0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: 'rgba(255,81,47,1)',
            pointHoverRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index',
          },
          animation: { duration: 400 },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(9, 9, 11, 0.9)',
              titleFont: { size: 13, weight: 'bold' },
              bodyFont: { size: 12 },
              padding: 10,
              displayColors: false,
              callbacks: {
                label: ctx => `👥 ${ctx.parsed.y} Players Online`
              }
            }
          },
          scales: {
            x: {
              display: true,
              grid: { display: false },
              ticks: { color: '#71717a', maxTicksLimit: 10, font: { size: 11 } }
            },
            y: {
              display: true,
              beginAtZero: true,
              suggestedMax: 20,
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#71717a', precision: 0, font: { size: 11 } }
            }
          }
        }
      });
    }

    // ════════════════════════════════════════════════════
    // SKIN VIEWER — All proxied through Flask, no crafatar
    // ════════════════════════════════════════════════════

    // ════════════════════════════════════════════════════
    // SKIN VIEWER — All proxied through Flask, no crafatar
    // ════════════════════════════════════════════════════
    function initSV3D() {
      if (SV3D) return;
      try {
        SV3D = new skinview3d.SkinViewer({
          canvas: I('SV'), width: 260, height: 360,
          skin: '/api/skin/texture/Steve'   // default Steve skin via our proxy
        });
        SV3D.animation = new skinview3d.WalkingAnimation();
        SV3D.animation.speed = 0.6;
        SV3D.controls.enableRotate = true;
        SV3D.controls.enableZoom = true;
        SV3D.autoRotate = true; SV3D.autoRotateSpeed = 0.9; SV3D.fov = 70;
      } catch (e) { console.warn('SV3D init:', e); }
    }

    async function doSkin() {
      const uname = V('SK-IN').trim(); if (!uname) return;
      const btn = I('SK-BTN'); btn.textContent = '⏳'; btn.disabled = true;
      I('SK-ERR').textContent = '';
      try {
        // Get UUID via Mojang (proxied through Flask)
        const md = await API(`/api/mc/uuid/${enc(uname)}`);
        if (!md.id) throw new Error('Player not found on Mojang');
        LAST_UUID = md.id; LAST_UNAME = md.name;

        const uuidFmt = md.id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

        // ★ Use our Flask proxy for the head image, NOT crafatar
        I('SK-HEAD').src = `/api/skin/head/${md.name}/72`;
        I('SK-HEAD').onerror = () => { I('SK-HEAD').src = `/api/skin/head/Steve/72`; };

        I('SK-NAME').textContent = md.name;
        I('SK-UUID').innerHTML = `<span style="color:var(--tx2)">UUID:</span> ${uuidFmt}`;

        // ★ Skin download via Flask proxy
        I('SK-DL').href = `/api/skin/texture/${md.id}`;

        I('SK-INFO').style.display = 'block';

        // Load Hellcore stats
        try {
          const pd = await API(`/api/stats/${enc(md.name)}`);
          const rk = Object.entries(pd.ranks || {}).map(([m, r]) =>
            `<span class="rb rb-${rbcls(r)}">${r.toUpperCase()} <span style="font-size:.56rem;opacity:.7">${m}</span></span>`
          ).join(' ');
          I('SK-RANKS').innerHTML = rk || '<span style="font-size:.74rem;color:var(--tx2)">Not on Hellcore</span>';
          const chips = Object.entries(pd.stats || {}).map(([m, s]) =>
            `<span class="tag" style="margin:2px">${mIC(m)} ${cap(m)}: ${s.wins || 0}W ${s.kills || 0}K</span>`
          ).join('');
          I('SK-STAT-MINI').innerHTML = chips;
        } catch (e2) {
          I('SK-RANKS').innerHTML = '<span style="font-size:.74rem;color:var(--tx2)">Not registered on Hellcore</span>';
        }

        load3D(md.name, md.id);
      } catch (e) { I('SK-ERR').textContent = e.message; }
      btn.textContent = '<svg class="ic"><use href="#ic-search"/></svg>  Look Up'; btn.disabled = false;
    }

    function load3D(username, uuid) {
      initSV3D(); if (!SV3D) return;
      // ★ Load skin via Flask proxy — no crafatar
      const skinUrl = `/api/skin/texture/${username}`;
      SV3D.loadSkin(skinUrl).catch(() => { });
      // ★ Load cape via Flask proxy
      const capeUrl = `/api/skin/cape/${username}`;
      SV3D.loadCape(capeUrl)
        .then(() => { const e = I('SV-INFO'); if (e) e.textContent = '🪄 Cape loaded'; })
        .catch(() => { const e = I('SV-INFO'); if (e) e.textContent = 'No cape for this player'; });
    }
    function reload3D() { if (LAST_UNAME) load3D(LAST_UNAME, LAST_UUID); }

    // ════════════════════════════════════════════════════
    // LEADERBOARD
    // ════════════════════════════════════════════════════
    function updateLBS() {
      const isBW = V('LB-M') === 'bedwars';
      document.querySelectorAll('.bw-only').forEach(el => el.style.display = isBW ? 'block' : 'none');
      if (!isBW && ['losses', 'final_kills', 'final_deaths', 'beds_destroyed', 'games_played', 'level', 'xp', 'fkdr', 'wlr', 'kdr'].includes(V('LB-S'))) {
        I('LB-S').value = 'wins';
      }

    }

    async function loadLB() {
      const mode = V('LB-M'), stat = V('LB-S');
      const el = I('LB-R');
      const head = I('LB-H');
      el.innerHTML = '<div class="ld"><div class="sp"></div>Loading...</div>';
      try {
        const d = await API(`/api/lb/${mode}?stat=${stat}`);
        if (d.coming_soon) {
          el.innerHTML = `<div class="empty" style="color:#fde047;font-weight:700;font-size:1.5rem;letter-spacing:1px;text-transform:uppercase;margin-top:40px">
            <svg class="ic" style="width:2.5rem;height:2.5rem;display:block;margin:0 auto 15px;opacity:0.8"><use href="#ic-clock"/></svg>
            Coming Soon
          </div>`;
          head.innerHTML = '';
          return;
        }
        if (!d.length) { el.innerHTML = '<div class="empty">No data yet.</div>'; return; }


        const isBW = d[0].is_bw1058;

        // Friendly label for the value column
        const statLabels = {
          wins: 'Wins', losses: 'Losses', kills: 'Kills', deaths: 'Deaths',
          final_kills: 'F. Kills', final_deaths: 'F. Deaths',
          beds_destroyed: 'Beds', games_played: 'Games',
          level: 'Level', xp: 'XP', fkdr: 'FKDR', wlr: 'WLR', kdr: 'KDR',
          coins: 'Coins'
        };

        const valueLabel = statLabels[stat] || stat;

        if (isBW) {
          head.style.gridTemplateColumns = '30px 1fr 80px 80px';
          head.innerHTML = `<span>#</span><span>Player</span><span style="text-align:right">${valueLabel}</span><span style="text-align:right">Rank</span>`;
        } else {
          head.style.gridTemplateColumns = '30px 1fr 60px 60px 60px 60px 80px';
          head.innerHTML = `<span>#</span><span>Player</span><span>Wins</span><span>Kills</span><span>Deaths</span><span>K/D</span><span>Rank</span>`;
        }

        el.innerHTML = d.map((p, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
          const rankBadge = p.rank_name ? `<span class="rb rb-${rbcls(p.rank_name)}">${p.rank_name.toUpperCase()}</span>` : '-';

          let cols = '';
          if (isBW) {
            const raw = p.value ?? 0;
            let val;
            if (['fkdr', 'wlr', 'kdr'].includes(stat)) {
              val = Number(raw).toFixed(2);
            } else {
              val = fmt(raw);
            }
            cols = `<span style="text-align:right;font-weight:700;color:var(--g)">${val}</span>`;

          } else {
            const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : '∞';
            cols = `<span>${p.wins || 0}</span><span>${p.kills || 0}</span><span>${p.deaths || 0}</span><span>${kd}</span>`;
          }

          return `<div class="lr ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''}" style="grid-template-columns:${isBW ? '30px 1fr 80px 80px' : '30px 1fr 60px 60px 60px 60px 80px'}">
            <span>${medal}</span>
            <span style="display:flex;align-items:center;gap:6px">
              <img src="/api/skin/head/${enc(p.mc_username || p.username)}/22" width="22" height="22" style="image-rendering:pixelated;border-radius:3px" onerror="this.style.display='none'">
              ${esc(p.username)}
            </span>
            ${cols}
            <span style="text-align:right">${rankBadge}</span>
          </div>`;
        }).join('');
      } catch (e) { el.innerHTML = '<div class="empty">Could not load.</div>'; }
    }


    // ════════════════════════════════════════════════════
    // RECENT SEARCHES (localStorage)
    // ════════════════════════════════════════════════════
    const RECENT_KEY = 'hc_recent_lookups';
    function getRecentSearches() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 5); } catch (e) { return []; } }
    function addRecentSearch(name) {
      let arr = getRecentSearches().filter(n => n.toLowerCase() !== name.toLowerCase());
      arr.unshift(name);
      if (arr.length > 5) arr = arr.slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch (e) { }
      renderRecentSearches();
    }
    function removeRecentSearch(name) {
      let arr = getRecentSearches().filter(n => n.toLowerCase() !== name.toLowerCase());
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch (e) { }
      renderRecentSearches();
    }
    function renderRecentSearches() {
      const arr = getRecentSearches();
      const wrap = I('PS-RECENT'), chips = I('PS-RECENT-CHIPS');
      if (!wrap || !chips) return;
      if (arr.length === 0) { wrap.style.display = 'none'; return; }
      wrap.style.display = '';
      chips.innerHTML = arr.map(n => `<span class="recent-chip" onclick="quickSearch('${esc(n)}')">
    <img src="/api/skin/head/${enc(n)}/18" onerror="this.style.display='none'" alt="">
    ${esc(n)}
    <span class="chip-x" onclick="event.stopPropagation();removeRecentSearch('${esc(n)}')">&times;</span>
  </span>`).join('');
    }
    function quickSearch(name) {
      const inp = I('PS-IN'); if (inp) { inp.value = name; } loadPS();
    }

    // ════════════════════════════════════════════════════
    // ACHIEVEMENT BADGES (auto-generated from stats)
    // ════════════════════════════════════════════════════
    function generateBadges(p) {
      const o = p.groupStats?.overall || {};
      const badges = [];
      const w = o.wins || p.wins || 0, k = o.kills || p.kills || 0, fk = o.finalKills || p.finalKills || 0;
      const beds = o.bedsBroken || p.bedsBroken || 0, games = o.gamesPlayed || p.gamesPlayed || 0;
      const fkdr = o.fkdr || p.fkdr || 0, kdr = o.kdr || p.kdr || 0, wlr = o.wlr || p.wlr || 0;
      const ws = o.highestWinstreak || 0;

      // Wins
      if (w >= 500) badges.push({ label: 'Legend ' + w + 'W', tier: 'fire', icon: 'ic-trophy' });
      else if (w >= 200) badges.push({ label: 'Champion ' + w + 'W', tier: 'diamond', icon: 'ic-trophy' });
      else if (w >= 100) badges.push({ label: 'Veteran ' + w + 'W', tier: 'gold', icon: 'ic-trophy' });
      else if (w >= 50) badges.push({ label: 'Winner ' + w + 'W', tier: 'silver', icon: 'ic-trophy' });
      else if (w >= 10) badges.push({ label: 'Rising ' + w + 'W', tier: 'bronze', icon: 'ic-trophy' });

      // Kills
      if (k >= 1000) badges.push({ label: 'Slayer 1K+', tier: 'fire', icon: 'ic-swords' });
      else if (k >= 500) badges.push({ label: 'Warrior ' + k + 'K', tier: 'diamond', icon: 'ic-swords' });
      else if (k >= 200) badges.push({ label: 'Fighter ' + k + 'K', tier: 'gold', icon: 'ic-swords' });
      else if (k >= 50) badges.push({ label: 'Brawler ' + k + 'K', tier: 'bronze', icon: 'ic-swords' });

      // FKDR
      if (fkdr >= 3) badges.push({ label: 'FKDR God', tier: 'fire', icon: 'ic-star' });
      else if (fkdr >= 2) badges.push({ label: 'FKDR Elite', tier: 'diamond', icon: 'ic-star' });
      else if (fkdr >= 1) badges.push({ label: 'FKDR Solid', tier: 'gold', icon: 'ic-star' });

      // Beds
      if (beds >= 100) badges.push({ label: 'Bed Destroyer', tier: 'fire', icon: 'ic-bed' });
      else if (beds >= 50) badges.push({ label: 'Bed Breaker', tier: 'gold', icon: 'ic-bed' });
      else if (beds >= 20) badges.push({ label: 'Bed Hunter', tier: 'silver', icon: 'ic-bed' });

      // Games
      if (games >= 200) badges.push({ label: 'Grinder', tier: 'diamond', icon: 'ic-gamepad' });
      else if (games >= 100) badges.push({ label: 'Dedicated', tier: 'gold', icon: 'ic-gamepad' });
      else if (games >= 50) badges.push({ label: 'Active', tier: 'silver', icon: 'ic-gamepad' });

      // Winstreak
      if (ws >= 10) badges.push({ label: 'Hot Streak ' + ws, tier: 'fire', icon: 'ic-bolt' });
      else if (ws >= 5) badges.push({ label: 'Streaker ' + ws, tier: 'gold', icon: 'ic-bolt' });

      // KDR
      if (kdr >= 2) badges.push({ label: 'KDR Master', tier: 'diamond', icon: 'ic-swords' });

      // WLR
      if (wlr >= 2) badges.push({ label: 'W/L King', tier: 'diamond', icon: 'ic-trophy' });

      return badges;
    }

    function renderBadgesHTML(badges) {
      if (!badges.length) return '';
      return `<div class="bw-section-title">Achievements</div>
  <div class="badge-wrap">${badges.map(b =>
        `<span class="badge badge-${b.tier}"><svg class="ic"><use href="#${b.icon}"/></svg>${b.label}</span>`
      ).join('')}</div>`;
    }

    // ════════════════════════════════════════════════════
    // TOP PLAYERS SHOWCASE
    // ════════════════════════════════════════════════════
    async function loadShowcase() {
      const el = I('PS-SHOWCASE'); if (!el) return;
      el.innerHTML = '<div class="ld"><div class="sp"></div>Calculating champions...</div>';

      const stats = ['wins', 'level', 'kills', 'final_kills', 'beds_destroyed'];
      const labels = ['Top Wins', 'Top Level', 'Top Kills', 'Top Finals', 'Top Beds'];
      const colors = ['var(--grn)', '#c084fc', '#f87171', '#60a5fa', '#fde047'];

      try {
        const results = await Promise.all(stats.map(s =>
          API(`/api/lb/bedwars?stat=${s}&limit=1`).then(d => d[0] || null).catch(() => null)
        ));

        const cards = results.map((p, i) => {
          if (!p) return '';
          const val = stats[i] === 'fkdr' || stats[i] === 'wlr' || stats[i] === 'kdr' ? Number(p.value).toFixed(2) : fmt(p.value);
          return `<div class="showcase-card" style="--card-accent:${colors[i]}" onclick="document.getElementById('PS-IN').value='${esc(p.username)}';loadPS()">
            <img src="/api/skin/head/${enc(p.mc_username || p.username)}/48" onerror="this.style.display='none'" alt="">
            <div class="showcase-name">${esc(p.username)}</div>
            <div class="showcase-stat-label">${labels[i]}</div>
            <div class="showcase-stat-val" style="color:${colors[i]}">${val}</div>
            <div class="showcase-sub">#1 Overall · Click to view</div>
          </div>`;
        }).filter(Boolean);

        if (cards.length > 0) {
          el.innerHTML = `<div class="bw-section-title">Top Players</div>
            <div class="showcase-grid">${cards.join('')}</div>`;
        } else {
          el.innerHTML = '';
        }
      } catch (e) {
        console.error('loadShowcase:', e);
        el.innerHTML = '';
      }
    }


    // ════════════════════════════════════════════════════
    // STAT BAR HELPER (visual gauge for ratios)
    // ════════════════════════════════════════════════════
    function statBarHTML(value, max, colorClass) {
      const pct = max > 0 ? Math.min(value / max * 100, 100) : 0;
      return `<div class="stat-bar-wrap"><div class="stat-bar"><div class="stat-bar-fill ${colorClass}" style="width:${pct}%"></div></div></div>`;
    }

    async function loadPS() {
      const uname = V('PS-IN').trim(); if (!uname) return;
      const el = I('PS-RES');
      const btn = I('PS-BTN'); if (btn) btn.disabled = true;
      el.innerHTML = '<div class="ld"><div class="sp"></div>Looking up player...</div>';
      try {
        const r = await fetch(`/api/bwstats/${enc(uname)}`); const d = await r.json();
        if (!d.success || !d.player) { el.innerHTML = '<div class="empty">Player not found on Hellcore BedWars.</div>'; if (btn) btn.disabled = false; return; }
        const p = d.player;
        const o = p.groupStats?.overall || {};
        const modes = p.groupStats?.groups || {};
        const modeNames = Object.keys(modes);
        const isOn = p.isOnline;
        const lastSeen = p.lastSeen ? new Date(p.lastSeen).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const firstPlay = p.firstPlay ? new Date(p.firstPlay).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const prefixClean = (p.rank?.prefix || '').replace(/[\[\]]/g, '');
        const rankColor = getRankColor(prefixClean);
        const xpForNext = getXpForLevel(p.level || 0);
        const xpProgress = xpForNext > 0 ? Math.min((p.xp || 0) / xpForNext * 100, 100) : 0;

        let html = '';
        // --- Player Header ---
        html += `<div class="bw-header">
      <img class="bw-avatar" src="/api/skin/head/${enc(p.username)}/72" onerror="this.style.display='none'" alt="">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span class="bw-name">${esc(p.username)}</span>
          ${prefixClean ? `<span class="bw-rank-badge" style="background:${rankColor}15;border:1px solid ${rankColor}30;color:${rankColor}">${esc(prefixClean)}</span>` : ''}
          <span class="bw-star"><svg class="ic" style="width:0.75rem;height:0.75rem"><use href="#ic-star"/></svg> ${p.stars || p.level || 0}★</span>
        </div>
        <div class="bw-meta">
          <span>${isOn ? '<svg class="ic" style="width:0.5rem;height:0.5rem;color:var(--grn)"><use href="#ic-dot"/></svg> <span class="bw-online">Online</span>' : '<svg class="ic" style="width:0.5rem;height:0.5rem"><use href="#ic-dot"/></svg> <span class="bw-offline">Offline</span>'}</span>
          ${p.guild ? `<span><svg class="ic"><use href="#ic-shield"/></svg> ${esc(p.guild.name)}</span>` : ''}
          ${firstPlay ? `<span><svg class="ic"><use href="#ic-calendar"/></svg> Joined ${firstPlay}</span>` : ''}
        </div>
        ${xpForNext > 0 ? `<div class="bw-level-bar" title="${p.xp || 0} / ${xpForNext} XP"><div class="bw-level-fill" style="width:${xpProgress}%"></div></div>` : ''}
      </div>
    </div>`;

        // --- Overall Stats Grid ---
        html += `<div class="bw-section-title">Overall Stats</div>
    <div class="bw-stats-grid">
      <div class="bw-stat-card"><div class="bw-stat-label">Wins</div><div class="bw-stat-value green">${fmt(o.wins || p.wins || 0)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">Losses</div><div class="bw-stat-value red">${fmt(o.losses || p.losses || 0)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">W/L Ratio</div><div class="bw-stat-value">${(o.wlr || p.wlr || 0).toFixed(2)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">Games Played</div><div class="bw-stat-value">${fmt(o.gamesPlayed || p.gamesPlayed || 0)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">Kills</div><div class="bw-stat-value green">${fmt(o.kills || p.kills || 0)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">Deaths</div><div class="bw-stat-value red">${fmt(o.deaths || p.deaths || 0)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">K/D Ratio</div><div class="bw-stat-value">${(o.kdr || p.kdr || 0).toFixed(2)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">Beds Broken</div><div class="bw-stat-value gold">${fmt(o.bedsBroken || p.bedsBroken || 0)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">Final Kills</div><div class="bw-stat-value green">${fmt(o.finalKills || p.finalKills || 0)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">Final Deaths</div><div class="bw-stat-value red">${fmt(o.finalDeaths || p.finalDeaths || 0)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">FKDR</div><div class="bw-stat-value blue">${(o.fkdr || p.fkdr || 0).toFixed(2)}</div></div>
      <div class="bw-stat-card"><div class="bw-stat-label">Winstreak</div><div class="bw-stat-value gold">${fmt(o.winstreak || 0)}</div></div>
    </div>`;

        // --- Per-Mode Breakdown ---
        if (modeNames.length > 0) {
          html += `<div class="bw-section-title">Mode Breakdown</div>`;
          html += `<div class="bw-mode-tabs" id="BW-MODE-TABS">`;
          modeNames.forEach((m, i) => {
            html += `<button class="bw-mode-tab${i === 0 ? ' active' : ''}" onclick="switchBwMode('${m}')">${esc(m)}</button>`;
          });
          html += `</div>`;

          modeNames.forEach((m, i) => {
            const s = modes[m];
            html += `<div class="bw-mode-panel${i === 0 ? ' active' : ''}" id="bw-mode-${m}">
          <div class="bw-stats-grid">
            <div class="bw-stat-card"><div class="bw-stat-label">Wins</div><div class="bw-stat-value green">${fmt(s.wins || 0)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">Losses</div><div class="bw-stat-value red">${fmt(s.losses || 0)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">W/L</div><div class="bw-stat-value">${(s.wlr || 0).toFixed(2)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">Games</div><div class="bw-stat-value">${fmt(s.gamesPlayed || 0)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">Kills</div><div class="bw-stat-value green">${fmt(s.kills || 0)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">Deaths</div><div class="bw-stat-value red">${fmt(s.deaths || 0)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">K/D</div><div class="bw-stat-value">${(s.kdr || 0).toFixed(2)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">Beds</div><div class="bw-stat-value gold">${fmt(s.bedsBroken || 0)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">FK</div><div class="bw-stat-value green">${fmt(s.finalKills || 0)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">FD</div><div class="bw-stat-value red">${fmt(s.finalDeaths || 0)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">FKDR</div><div class="bw-stat-value blue">${(s.fkdr || 0).toFixed(2)}</div></div>
            <div class="bw-stat-card"><div class="bw-stat-label">Winstreak</div><div class="bw-stat-value gold">${fmt(s.winstreak || 0)} <span style="font-size:0.65rem;color:var(--tx3)">(best ${s.highestWinstreak || 0})</span></div></div>
          </div>
        </div>`;
          });
        }

        // --- Guild Info ---
        if (p.guild) {
          const g = p.guild;
          html += `<div class="bw-guild">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <span class="bw-guild-name"><svg class="ic" style="margin-right:6px"><use href="#ic-shield"/></svg>${esc(g.name)}</span>
            ${g.tag ? `<span class="bw-guild-tag">${esc(g.tag)}</span>` : ''}
          </div>
          ${g.level ? `<span class="bw-star" style="font-size:0.75rem"><svg class="ic"><use href="#ic-layers"/></svg> Level ${g.level.level}</span>` : ''}
        </div>
        <div class="bw-guild-meta">
          <span><svg class="ic"><use href="#ic-users"/></svg> ${g.memberCount || 0}/${g.maxMembers || 125} Members</span>
          ${g.level ? `<span><svg class="ic"><use href="#ic-chartline"/></svg> ${g.level.xp || 0} XP</span>` : ''}
        </div>
      </div>`;
        }

        // Add achievement badges
        const badges = generateBadges(p);
        html += renderBadgesHTML(badges);

        el.innerHTML = html;

        // Save to recent searches
        addRecentSearch(p.username);

        // Hide showcase when results are shown
        const sc = I('PS-SHOWCASE'); if (sc) sc.style.display = 'none';

      } catch (e) {
        console.error('Stats error:', e);
        el.innerHTML = '<div class="empty"><svg class="ic" style="margin-right:8px;width:1em;height:1em"><use href="#ic-warn"/></svg>Could not load player stats. Please try again.</div>';
      }
      if (btn) btn.disabled = false;
    }

    // Helper: switch mode tabs
    function switchBwMode(mode) {
      document.querySelectorAll('.bw-mode-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.bw-mode-panel').forEach(p => p.classList.remove('active'));
      const tab = document.querySelector(`.bw-mode-tab[onclick*="'${mode}'"]`);
      const panel = I('bw-mode-' + mode);
      if (tab) tab.classList.add('active');
      if (panel) panel.classList.add('active');
    }

    // Helper: format numbers with commas
    function fmt(n) { return Number(n).toLocaleString(); }

    // Helper: get rank color from prefix
    function getRankColor(prefix) {
      const p = prefix.toUpperCase();
      if (p.includes('MVP+')) return '#f87171';
      if (p.includes('MVP')) return '#fbbf24';
      if (p.includes('VIP+')) return '#2dd4bf';
      if (p.includes('VIP')) return '#4ade80';
      if (p.includes('OWNER')) return '#fb7185';
      if (p.includes('ADMIN')) return '#fb923c';
      if (p.includes('MOD')) return '#4ade80';
      if (p.includes('DEV')) return '#c084fc';
      return '#a1a1aa';
    }

    // Helper: rough XP needed for next BedWars level
    function getXpForLevel(lvl) { return 5000 + (lvl * 500); }

    // ════════════════════════════════════════════════════
    // FORUM OVERHAUL LOGIC
    // ════════════════════════════════════════════════════
    const F_GROUPS = {
      'Official': ['announcements', 'rules'],
      'Community': ['general', 'offtopic'],
      'Support': ['help', 'suggestions']
    };

    function stBadge(role) {
      if (!role || role === 'player') return '';
      const cls = ['helper', 'mod', 'dev', 'admin', 'owner'].includes(role) ? `st-${role}` : 'rb-player';
      return `<span class="st-badge ${cls}">${role}</span>`;
    }

    async function renderForumIndex() {
      I('F-INDEX').style.display = 'block';
      I('F-LIST').style.display = 'none';
      I('F-THREAD').style.display = 'none';
      I('F-BREAD-CAT').innerHTML = '';

      const el = I('F-INDEX-L');
      el.innerHTML = '<div class="ld"><div class="sp"></div></div>';

      try {
        const meta = await API('/api/forums/meta');
        const { counts, replies, latest } = meta;

        let html = '';
        for (const [group, cats] of Object.entries(F_GROUPS)) {
          html += `<div class="f-index-cat">
            <div class="f-cat-head">${group.toUpperCase()}</div>`;
          cats.forEach(cat => {
            const tCount = counts[cat] || 0;
            const mCount = tCount + (replies[cat] || 0);
            const lt = latest[cat];

            html += `<div class="f-row" onclick="loadForums('${cat}')">
              <div class="f-icon"><svg class="ic"><use href="#ic-chat"/></svg></div>
              <div class="f-txt">
                <div class="f-title">${cap(cat)}</div>
                <div class="f-desc">Community discussions about ${cat}.</div>
              </div>
              <div class="f-stats">
                 <div class="f-stat-unit"><span class="f-stat-val">${fmtK(tCount)}</span><span class="f-stat-lbl">Threads</span></div>
                 <div class="f-stat-unit"><span class="f-stat-val">${fmtK(mCount)}</span><span class="f-stat-lbl">Messages</span></div>
              </div>
              <div class="f-last">
                 ${lt ? `
                   <img class="f-last-avatar" src="/api/skin/head/${enc(lt.author_name)}/32">
                   <div class="f-last-txt">
                      <span class="f-last-title">${esc(lt.title)}</span>
                      <div class="f-last-meta">By ${esc(lt.author_name)} · ${fmtD(lt.created_at)}</div>
                   </div>
                 ` : '<div style="color:var(--tx3)">No activity</div>'}
              </div>
            </div>`;
          });
          html += `</div>`;
        }
        el.innerHTML = html;
        loadForumWidgets();
      } catch (e) { el.innerHTML = '<div class="empty">Error loading index.</div>'; }
    }

    async function loadForumWidgets() {
      try {
        const d = await API('/api/forums/widgets');
        I('F-WID-LATEST').innerHTML = d.latest.map(f => `
           <div class="f-widget-item">
             <img src="/api/skin/head/${enc(f.author_name)}/28" class="f-widget-img">
             <div class="f-widget-txt">
                <span class="f-widget-name" onclick="openForum(${f.id})">${esc(f.title)}</span>
                <div class="f-widget-meta">by ${esc(f.author_name)} · ${fmtD(f.created_at)}</div>
             </div>
           </div>
        `).join('');
        I('F-WID-TREND').innerHTML = d.trending.map(f => `
           <div class="f-widget-item">
             <div class="f-widget-txt">
                <span class="f-widget-name" onclick="openForum(${f.id})">${esc(f.title)}</span>
                <div class="f-widget-meta">${f.rc} replies · in ${cap(f.category)}</div>
             </div>
           </div>
        `).join('');
      } catch (e) { }
    }

    async function loadForums(cat) {
      if (!cat) { renderForumIndex(); return; }
      I('F-INDEX').style.display = 'none';
      I('F-LIST').style.display = 'block';
      I('F-THREAD').style.display = 'none';
      I('F-CAT-TITLE').textContent = cap(cat);
      I('F-BREAD-CAT').innerHTML = `<span style="margin:0 5px">/</span> <span>${cap(cat)}</span>`;

      const el = I('F-ROWS');
      el.innerHTML = '<div class="ld"><div class="sp"></div></div>';

      try {
        const d = await API(`/api/forums?cat=${cat}`);
        if (!d.length) { el.innerHTML = '<div class="empty">No threads in this category.</div>'; return; }
        el.innerHTML = d.map(f => {
          const avatar = `/api/skin/head/${enc(f.author_name)}/40`;
          return `<div class="f-row" onclick="openForum(${f.id})">
            <div class="f-icon"><svg class="ic"><use href="#ic-chat"/></svg></div>
            <div style="flex:1">
               <div class="f-title">
                  ${f.is_pinned ? '<span class="f-pin">📌</span>' : ''}
                  ${f.is_locked ? '<span class="f-lock">🔒</span>' : ''}
                  ${esc(f.title)}
               </div>
               <div class="f-desc">By ${esc(f.author_name)} ${stBadge(f.author_role)} · ${fmtD(f.created_at)}</div>
            </div>
            <div class="f-stats">
               <div class="f-stat-unit"><span class="f-stat-val">${f.reply_count}</span><span class="f-stat-lbl">Replies</span></div>
               <div class="f-stat-unit"><span class="f-stat-val">${f.views}</span><span class="f-stat-lbl">Views</span></div>
            </div>
            <div class="f-last">
               <img src="${avatar}" class="f-last-avatar">
               <div class="f-last-txt" style="font-size:0.7rem">
                  Latest activity<br>
                  <span style="color:var(--tx3)">${fmtD(f.created_at)}</span>
               </div>
            </div>
          </div>`;
        }).join('');
      } catch (e) { el.innerHTML = '<div class="empty">Error.</div>'; }
    }

    async function openForum(id) {
      CUR_FORUM = id;
      I('F-INDEX').style.display = 'none'; I('F-LIST').style.display = 'none'; I('F-THREAD').style.display = 'block';
      const el = I('F-TC'); el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      try {
        const d = await API(`/api/forums/${id}`);
        const f = d.forum, is_ad = isAdmin();
        const canDel = ME && (ME.id === f.author_id || is_ad);
        const avatar = `/api/skin/head/${enc(f.author_name)}/64`;

        // Breadcrumb
        I('F-BREAD-CAT').innerHTML = `<span style="margin:0 5px">/</span> <span class="link" onclick="loadForums('${f.category}')">${cap(f.category)}</span> <span style="margin:0 5px">/</span> <span>${esc(f.title)}</span>`;

        // Admin Toolbar
        let adminBar = '';
        if (is_ad) {
          adminBar = `<div style="display:flex; gap:8px; margin-bottom:12px">
              <button class="bto bxs" onclick="adminTog(${id}, '${f.is_pinned ? 'unpin' : 'pin'}')">${f.is_pinned ? 'Unpin' : 'Pin'}</button>
              <button class="bto bxs" onclick="adminTog(${id}, '${f.is_locked ? 'unlock' : 'lock'}')">${f.is_locked ? 'Unlock' : 'Lock (Archive)'}</button>
           </div>`;
        }

        I('F-RPLY-ADMIN').style.display = is_ad ? 'block' : 'none';

        el.innerHTML = adminBar + `<div class="p" style="margin-bottom:15px; border-left:4px solid var(--g)">
            <div style="display:flex;gap:15px;align-items:flex-start">
              <img src="${avatar}" style="width:54px;height:54px;border-radius:10px;border:1px solid var(--bd)">
              <div style="flex:1">
                 <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <h2 style="font-family:'Oxanium',sans-serif;color:var(--g);margin:0; font-size:1.4rem">
                       ${f.is_pinned ? '📌 ' : ''}${f.is_locked ? '🔒 ' : ''}${esc(f.title)}
                    </h2>
                    ${canDel ? `<button class="btn bred bxs" onclick="delForum(${f.id})">Delete</button>` : ''}
                 </div>
                 <div style="font-size:.75rem;color:var(--tx2);margin-top:5px">
                   By <strong style="color:var(--tx)">${esc(f.author_name)}</strong> ${stBadge(f.author_role)}
                   · ${fmtD(f.created_at)}
                 </div>
              </div>
            </div>
            <div class="dv"></div>
            <div style="color:var(--tx);line-height:1.8;font-size:.95rem;white-space:pre-wrap">${f.content}</div>
        </div>
        <div style="color:var(--tx3);font-family:'Oxanium',sans-serif;font-size:.8rem;margin-bottom:12px">
          ${d.replies.length} REPLIES
        </div>
        ${d.replies.map(r => `
          <div class="p" style="margin-bottom:12px; background:rgba(255,255,255,0.02)">
            <div style="display:flex;gap:12px;align-items:flex-start">
              <img src="/api/skin/head/${enc(r.author_name)}/40" style="width:36px;height:36px;border-radius:6px;border:1px solid var(--bd)">
              <div style="flex:1">
                 <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <div style="font-size:.8rem;font-weight:700">${esc(r.author_name)} ${stBadge(r.author_role)}</div>
                    <div style="font-size:.7rem;color:var(--tx2)">${fmtD(r.created_at)}</div>
                 </div>
                 <div style="color:var(--tx2);font-size:.9rem;white-space:pre-wrap">${r.content}</div>
              </div>
              ${ME && (ME.id === r.author_id || is_ad) ? `<button class="btn bred bxs" onclick="delReply(${r.id})">×</button>` : ''}
            </div>
          </div>
        `).join('')}`;
      } catch (e) { el.innerHTML = '<div class="empty">Error.</div>'; }
    }

    async function adminTog(fid, action) {
      try {
        await API('/api/admin/thread_control', { method: 'POST', body: { fid, action } });
        toast('ok', `Thread updated: ${action}`);
        openForum(fid);
      } catch (e) { toast('err', e.message); }
    }

    async function uploadForumImg(el) {
      if (!el.files.length) return;
      const formData = new FormData();
      formData.append('file', el.files[0]);
      try {
        const d = await fetch('/api/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData
        }).then(res => res.json());
        if (d.error) throw new Error(d.error);

        const area = I('F-RPLY');
        area.value += `\n<img src="${d.url}" style="max-width:100%; border-radius:10px; margin:10px 0">\n`;
        toast('ok', 'Image uploaded and inserted!');
      } catch (e) { toast('err', e.message); }
    }

    function backF() {
      renderForumIndex();
    }

    // Helper: format 1500 to 1.5K
    function fmtK(n) {
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return n;
    }

    function loadForumsInit() { renderForumIndex(); }

    // ════════════════════════════════════════════════════
    // HELLCORE NEXUS (ADMIN SETTINGS)
    // ════════════════════════════════════════════════════
    function admT(t) {
      ['NODE', 'PLAYERS', 'STAFF', 'LOGS', 'FORUMS', 'TICKETS', 'CHAT', 'EVENTS', 'TRIALS', 'MGMT'].forEach(k => {
        const el = I('ADM-' + k); if (el) el.style.display = k === t.toUpperCase() ? 'block' : 'none';
        const tab = I('ADM-TAB-' + k); if (tab) tab.className = 'adm-nav-btn' + (k === t.toUpperCase() ? ' ON' : '');
      });
      if (t === 'node') loadNexusNode();
      if (t === 'staff') loadNexusStaff();
      if (t === 'logs') loadNexusLogs();
      if (t === 'events') loadNexusEvents();
      if (t === 'forums') loadNexusForums();
      if (t === 'tickets') loadNexusTickets();
      if (t === 'trials') loadNexusTrials();
      if (t === 'chat') loadNexusChat();
      else stopChatPoll();
    }

    let CHAT_POLL = null, PING_POLL = null, CUR_CHAN = null;
    let HEARTBEAT_TIMER = null;
    let HEART_ACTIVE = false;
    let UNREAD_MENTIONS = {};

    function startHeartbeat() {
      if (HEART_ACTIVE) return;
      HEART_ACTIVE = true;
      HEARTBEAT_TIMER = setInterval(async () => {
        if (!ME) return;
        try { await fetch('/api/auth/heartbeat', { method: 'POST', credentials: 'include' }); } catch (e) { }
      }, 60000); // 1 minute heartbeat
    }

    async function loadOnlineStaff() {
      const el = I('ADM-ONLINE-TEAM'); if (!el) return;
      try {
        const staff = await API('/api/staff/online');
        if (!staff.length) {
          el.innerHTML = '<div style="color:var(--tx3);font-size:0.8rem">No staff members active in the last 5 minutes.</div>';
          return;
        }
        el.innerHTML = staff.map(u => `
          <div class="sbar" style="display:flex;align-items:center;gap:10px;margin-bottom:0">
            <img src="/api/skin/head/${enc(u.username)}/24" style="width:24px;height:24px;border-radius:4px" alt="">
            <div style="flex:1;min-width:0">
              <div class="sbar-n" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.username)}</div>
              <span class="rb rb-${u.role}" style="font-size:0.5rem;padding:0 4px">${u.role.toUpperCase()}</span>${u.primary_rank ? `<span class="rb rb-${rbcls(u.primary_rank)}" style="font-size:0.5rem;padding:0 4px;margin-left:4px">${esc(u.primary_rank)}</span>` : ''}
            </div>
            <div style="width:8px;height:8px;border-radius:50%;background:var(--grn);box-shadow:0 0 8px var(--grn)"></div>
          </div>
        `).join('');
      } catch (e) { }
    }

    async function loadNexusChat() {
      if (ME?.role === 'founder') I('CHAT-CREATE-BTN').style.display = 'block';
      try {
        const chans = await API('/api/staff/channels');
        const el = I('CHAT-CHANNELS');
        el.innerHTML = chans.map(c => `
          <div class="p bxs CH-ITM" id="CH-${c.id}" style="cursor:pointer;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;background:${CUR_CHAN === c.id ? 'var(--p2)' : 'transparent'}" onclick="setStaffChan(${c.id},'${esc(c.name)}')">
            <div style="display:flex;align-items:center;gap:10px">
              <svg class="ic" style="margin:0;opacity:0.6;width:1rem;height:1rem"><use href="#ic-chat" /></svg>
              <span>${esc(c.name)}</span>
              <span class="cbadge" id="BADGE-${c.id}" style="display:${UNREAD_MENTIONS[c.id] ? 'flex' : 'none'};position:static;min-width:18px;height:18px;font-size:0.6rem;background:var(--r2)">${UNREAD_MENTIONS[c.id] || ''}</span>
            </div>
            ${ME?.role === 'founder' && c.name !== '#staff-hub' ? `<span style="color:var(--r2);font-size:12px;cursor:pointer" onclick="event.stopPropagation();admDelChatChan(${c.id})">×</span>` : ''}
          </div>`).join('');
        if (!CUR_CHAN && chans.length) setStaffChan(chans[0].id, chans[0].name);
        else if (CUR_CHAN) updateChatHighlights();
        startChatPoll();
      } catch (e) { }
    }

    function setStaffChan(id, name) {
      if (CUR_CHAN === id && I('CHAT-MESSAGES').innerHTML !== "") return;

      // Clear mentions for this channel
      UNREAD_MENTIONS[id] = 0;
      const b = I('BADGE-' + id); if (b) b.style.display = 'none';

      CUR_CHAN = id; I('CHAT-HEAD').textContent = name;
      loadChatMsgs();
      updateChatHighlights();
    }

    function updateChatHighlights() {
      document.querySelectorAll('.CH-ITM').forEach(d => {
        d.style.background = (d.id === 'CH-' + CUR_CHAN) ? 'var(--p2)' : 'transparent';
      });
    }

    async function loadChatMsgs() {
      if (!CUR_CHAN) return;
      try {
        const msgs = await API(`/api/staff/channels/${CUR_CHAN}/messages`);
        const el = I('CHAT-MESSAGES'), wasAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;

        const myName = ME?.username || "";
        const settings = {
          sound: I('SET-CHAT-SOUND')?.checked ?? true,
          scroll: I('SET-CHAT-SCROLL')?.checked ?? true
        };

        let newMention = false;

        el.innerHTML = msgs.map(m => {
          const isMe = m.author_id === ME?.id;
          const hasMention = m.content.includes(`@${myName}`);
          if (hasMention && !isMe) newMention = true;

          const bubbleStyle = isMe
            ? `background:var(--g);color:#000;border-bottom-right-radius:2px`
            : (hasMention ? `background:rgba(251,191,36,0.2);color:#fff;border-bottom-left-radius:2px;border:1px solid #fbbf24` : `background:var(--p1);color:#fff;border-bottom-left-radius:2px`);

          return `
            <div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'}">
              <div style="font-size:0.65rem;color:var(--tx3);margin-bottom:2px">
                <b>${esc(m.username)}</b> ${m.primary_rank ? `<span class="rb rb-${rbcls(m.primary_rank)}" style="font-size:0.5rem;padding:0 3px">${esc(m.primary_rank)}</span>` : ''}<span class="rb rb-${m.role}" style="font-size:0.5rem;padding:0 3px">${m.role.toUpperCase()}</span> 
                · ${fmtD(m.created_at)}
              </div>
              <div class="p" style="padding:8px 12px;max-width:80%;font-size:0.85rem;${bubbleStyle};border-radius:12px">
                ${esc(m.content)}
              </div>
            </div>
          `;
        }).join('') || '<div class="empty">No messages. Pull the trigger on some chat!</div>';

        if (newMention && settings.sound) playMentionSound();
        if (settings.scroll && wasAtBottom) el.scrollTop = el.scrollHeight;
      } catch (e) { }
    }

    function playMentionSound() {
      // Simple notification sound via AudioContext if no file provided
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } catch (e) { }
    }

    function toggleChatDark(on) {
      I('CHAT-MESSAGES').style.background = on ? 'rgba(0,0,0,0.4)' : '';
    }

    async function staffPing() {
      try {
        const active = await API('/api/staff/ping', { method: 'POST' });
        const list = active.map(u => u.username).join(', ') || 'No one';
        const el = I('ONLINE-USERS-LIST');
        if (el) el.textContent = list;
      } catch (e) { }
    }

    function startChatPoll() {
      initPusher();
      stopChatPoll();
      // Manual backup poll every 10s instead of 1.5s
      CHAT_POLL = setInterval(loadChatMsgs, 10000);
      PING_POLL = setInterval(staffPing, 10000);
      staffPing();
    }
    function stopChatPoll() {
      if (CHAT_POLL) { clearInterval(CHAT_POLL); CHAT_POLL = null; }
      if (PING_POLL) { clearInterval(PING_POLL); PING_POLL = null; }
    }

    let PUSHER_INST = null, P_CHAN = null, TIX_GLOBAL_CHAN = null, TIX_RT_CHAN = null, TIX_RT_ID = null;
    function initPusher() {
      if (PUSHER_INST) return;
      try {
        PUSHER_INST = new Pusher('0546780f85fe17efd982', { cluster: 'ap3' });

        // Status updates
        PUSHER_INST.connection.bind('state_change', function (states) {
          I('CHAT-STATE').textContent = states.current.charAt(0).toUpperCase() + states.current.slice(1);
          I('CHAT-DOT').style.background = states.current === 'connected' ? '#4ade80' : '#f87171';
        });

        P_CHAN = PUSHER_INST.subscribe('staff-chat');
        TIX_GLOBAL_CHAN = PUSHER_INST.subscribe('tickets-global');
        TIX_GLOBAL_CHAN.bind('ticket-created', function () { if (ME) loadTix(); });
        TIX_GLOBAL_CHAN.bind('ticket-updated', function () { if (ME) loadTix(); });
        TIX_GLOBAL_CHAN.bind('presence', function () {
          if (I('ADM-ONLINE-TEAM')) loadOnlineStaff();
        });
        P_CHAN.bind('new-message', function (data) {
          console.log('Chat Event:', data);
          const chanId = Number(data.channel_id);
          if (chanId === Number(CUR_CHAN)) {
            loadChatMsgs();
          } else {
            // If not active channel, check for mentions
            if (data.content.includes(`@${ME?.username}`)) {
              UNREAD_MENTIONS[chanId] = (UNREAD_MENTIONS[chanId] || 0) + 1;
              const badge = I('BADGE-' + chanId);
              if (badge) {
                badge.style.display = 'flex';
                badge.textContent = UNREAD_MENTIONS[chanId];
              }
              if (I('SET-CHAT-SOUND')?.checked !== false) playMentionSound();
              toast('ok', `Mention in ${data.channel_name || 'another channel'}`);
            }
          }
        });
      } catch (e) { console.error('Pusher error:', e); }

    }

    function bindTicketRealtime(ticketId) {
      initPusher();
      if (!PUSHER_INST || !ticketId) return;
      if (TIX_RT_CHAN && TIX_RT_ID && TIX_RT_ID !== ticketId) {
        try { PUSHER_INST.unsubscribe(`ticket-${TIX_RT_ID}`); } catch (e) { }
        TIX_RT_CHAN = null;
      }
      if (TIX_RT_ID === ticketId && TIX_RT_CHAN) return;
      TIX_RT_ID = ticketId;
      TIX_RT_CHAN = PUSHER_INST.subscribe(`ticket-${ticketId}`);
      TIX_RT_CHAN.bind('new-message', function (data) {
        if (data?.message && data.message.id && !TIX.messages.find(m => m.id === data.message.id)) {
          TIX.messages.push(data.message);
          renderTicketMessages();
          loadTix();
        }
      });
      TIX_RT_CHAN.bind('ticket-updated', function () {
        if (TIX.activeId === ticketId) openTix(ticketId);
        else loadTix();
      });
      TIX_RT_CHAN.bind('typing', function (data) {
        const username = data?.username;
        if (!username || username === ME?.username) return;
        if (!TIX.typingUsers.includes(username)) TIX.typingUsers.push(username);
        updateTypingIndicator();
        clearTimeout(TIX_TYPING_HIDE);
        TIX_TYPING_HIDE = setTimeout(() => {
          TIX.typingUsers = TIX.typingUsers.filter(name => name !== username);
          updateTypingIndicator();
        }, 1800);
      });
    }

    async function sendStaffMsg() {
      const c = V('CHAT-INP').trim(); if (!c || !CUR_CHAN) return;
      SV('CHAT-INP', '');

      // Optimistic UI: Add message locally first
      const el = I('CHAT-MESSAGES');
      const tempDiv = document.createElement('div');
      tempDiv.style = "display:flex;flex-direction:column;align-items:flex-end;opacity:0.6";
      tempDiv.innerHTML = `
        <div style="font-size:0.65rem;color:var(--tx3);margin-bottom:2px"><b>${esc(ME.username)}</b> [PENDING...]</div>
        <div class="p" style="padding:8px 12px;max-width:80%;font-size:0.85rem;background:var(--g);color:#000;border-radius:12px;border-bottom-right-radius:2px">
          ${esc(c)}
        </div>
      `;
      el.appendChild(tempDiv);
      el.scrollTop = el.scrollHeight;

      try {
        await API(`/api/staff/channels/${CUR_CHAN}/messages`, { method: 'POST', body: { content: c } });
        loadChatMsgs();
      } catch (e) { toast('err', e.message); loadChatMsgs(); }
    }

    async function admCreateChatChan() {
      const name = prompt('Channel Name (e.g. #dev-only)'); if (!name) return;
      try { await API('/api/staff/channels', { method: 'POST', body: { name } }); loadNexusChat(); } catch (e) { toast('err', e.message); }
    }
    async function admDelChatChan(id) {
      if (!confirm('Delete this channel and all messages?')) return;
      try { await API(`/api/staff/channels/${id}`, { method: 'DELETE' }); CUR_CHAN = null; loadNexusChat(); } catch (e) { toast('err', e.message); }
    }

    let activityChart;
    async function loadNexusNode() {
      try {
        const d = await API('/api/admin/overview');
        I('ADM-SYNC-STATUS').textContent = d.status || 'ACTIVE';
        I('ADM-PENDING-CMD').textContent = d.pending || 0;
        I('ADM-TOTAL-USERS').textContent = d.total_users || 0;
        I('ADM-STAFF-COUNT').textContent = d.staff_count || 0;

        const log = I('ADM-LOGS-MINI');
        if (log) log.innerHTML = d.logs.map(l => `<div style="padding:4px;border-bottom:1px solid var(--bd);opacity:0.8;font-size:0.75rem"><small style="color:var(--g)">[${fmtD(l.created_at)}]</small> <b>${esc(l.admin_name)}</b>: ${esc(l.action)} ${l.details ? `<span style="color:var(--tx3)">(${esc(l.details)})</span>` : ''}</div>`).join('') || 'No actions recorded yet.';

        loadOnlineStaff();
        startHeartbeat();
        renderActivityChart(d.stats);
      } catch (e) { }
    }

    function renderActivityChart(data) {
      const ctx = I('admActivityChart')?.getContext('2d');
      if (!ctx) return;
      if (activityChart) activityChart.destroy();

      const labels = (data?.labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
      const values = (data?.values || [0, 0, 0, 0, 0, 0, 0]);

      activityChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Network Activity',
            data: values,
            borderColor: '#FF512F',
            backgroundColor: 'rgba(255, 81, 47, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#71717a' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#71717a' } }
          }
        }
      });
    }

    async function loadNexusStaff() {
      const el = I('ADM-S-LIST'); el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      try {
        const d = await API('/api/admin/staff');
        el.innerHTML = `
          <table class="adm-table">
            <thead>
              <tr><th>User</th><th>Role</th><th>Member Since</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${d.map(u => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <img src="/api/skin/head/${enc(u.mc_username || u.username)}/24" style="border-radius:3px">
                      <div>
                        <div style="font-weight:700">${esc(u.username)}</div>
                        <div style="font-size:0.7rem;color:var(--tx3)">${esc(u.email)}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="rb rb-${rbcls(u.role)}">${esc(u.role)}</span></td>
                  <td>${fmtD(u.created_at)}</td>
                  <td><button class="bto bxs" onclick="GO('admin');admT('players');SV('ADM-P-SEARCH','${u.username}');admSearchP()">Manage</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` || '<div class="empty">No staff found. Check roles!</div>';
      } catch (e) { el.innerHTML = '<div class="empty">Error loading staff.</div>'; }
    }

    async function loadNexusLogs() {
      const el = I('ADM-L-LIST'); el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      const filter = V('AUDIT-TYPE-FILTER') || '';
      try {
        const logs = await API('/api/admin/audit');
        const filtered = filter ? logs.filter(l => (l.action_type || l.action).toLowerCase().includes(filter)) : logs;

        el.innerHTML = `
          <div class="adm-table-wrap">
            <table class="adm-table">

            <thead>
              <tr><th>Timestamp</th><th>Admin</th><th>Action</th><th>Status</th><th>Time</th></tr>
            </thead>
            <tbody>
              ${filtered.map(l => {
          const act = l.action_type || l.action;
          const statusCls = l.status === 'success' ? 'open' : 'closed';
          return `
                  <tr>
                    <td><div style="font-size:0.7rem;color:var(--tx3)">${fmtD(l.created_at)}</div></td>
                    <td><strong>${esc(l.admin_name || 'System')}</strong></td>
                    <td>
                      <div style="font-weight:700;font-size:0.8rem">${esc(act.toUpperCase())}</div>
                      <div style="font-size:0.7rem;color:var(--tx2);max-width:250px;white-space:normal">${esc(l.details || '')}</div>
                    </td>
                    <td><span class="adm-badge ${statusCls}">${esc(l.status || 'success')}</span></td>
                    <td><div style="font-size:0.7rem;color:var(--tx3)">${l.execution_time ? l.execution_time + 'ms' : '-'}</div></td>
                  </tr>
                `;
        }).join('')}
            </tbody>
          </table>
        </div>

        ` || '<div class="empty">No logs found matching your filter.</div>';
        loadRewardLogs();
      } catch (e) { el.innerHTML = '<div class="empty">Error loading audit logs.</div>'; }
    }

    function exportAudit(format) {
      API('/api/admin/audit').then(logs => {
        if (format === 'csv') {
          let csv = 'Timestamp,Admin,Action,Details,Status,ExecutionTime\n';
          logs.forEach(l => {
            csv += `"${fmtD(l.created_at)}","${l.admin_name || 'System'}","${l.action_type || l.action}","${(l.details || '').replace(/"/g, '""')}","${l.status}","${l.execution_time}"\n`;
          });
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.setAttribute('hidden', '');
          a.setAttribute('href', url);
          a.setAttribute('download', `audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast('ok', 'Audit log exported!');
        }
      }).catch(e => toast('err', 'Export failed: ' + e.message));
    }

    async function admSetAnn(clear = false) {
      const msg = clear ? "" : V('ADM-ANN-MSG');
      try {
        await API('/api/admin/announcement', { method: 'POST', body: { message: msg } });
        toast('ok', 'Network announcement updated!');
        checkAnn();
      } catch (e) { toast('err', e.message); }
    }

    async function checkAnn() {
      try {
        const d = await API('/api/admin/announcement');
        const el = I('GLOBAL-BANNER'), txt = I('BANNER-TXT');
        if (d.message && d.message.trim()) {
          el.style.display = 'block';
          txt.innerHTML = d.message;
        } else {
          el.style.display = 'none';
        }
      } catch (e) { }
    }

    async function admRunCmd() {
      const cmd = V('ADM-RAW-CMD').trim(); if (!cmd) return;
      const start = performance.now();
      try {
        await API('/api/admin/commands/queue', { method: 'POST', body: { command: cmd } });
        const duration = (performance.now() - start).toFixed(2);
        toast('ok', `Command queued to Velocity Proxy! (${duration}ms)`);
        SV('ADM-RAW-CMD', ''); I('ADM-CMD-HINT').style.display = 'none';
        loadNexusNode();
      } catch (e) { toast('err', e.message); }
    }

    let allCmdSuggestions = [];
    let activeCmdIdx = -1;
    let filteredCmds = [];

    async function handleCmdKey(e) {
      const inp = e.target;
      const hintEl = I('ADM-CMD-HINT');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeCmdIdx = Math.min(activeCmdIdx + 1, filteredCmds.length - 1);
        renderCmdHints();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeCmdIdx = Math.max(activeCmdIdx - 1, 0);
        renderCmdHints();
      } else if (e.key === 'Enter' && activeCmdIdx >= 0 && hintEl.style.display !== 'none') {
        e.preventDefault();
        selectCmdHint(filteredCmds[activeCmdIdx].command);
      } else if (e.key === 'Escape') {
        hintEl.style.display = 'none';
      } else if (e.key === 'Tab' && activeCmdIdx >= 0 && hintEl.style.display !== 'none') {
        e.preventDefault();
        selectCmdHint(filteredCmds[activeCmdIdx].command);
      } else {
        setTimeout(async () => {
          const cur = inp.value;
          if (cur.startsWith('/')) {
            if (!allCmdSuggestions.length) {
              allCmdSuggestions = await API('/api/admin/commands/suggestions');
            }
            const query = cur.substring(1).toLowerCase();
            filteredCmds = allCmdSuggestions.filter(s => s.command.toLowerCase().includes(query));
            if (filteredCmds.length > 0) {
              if (activeCmdIdx >= filteredCmds.length) activeCmdIdx = 0;
              renderCmdHints();
            } else {
              hintEl.style.display = 'none';
            }
          } else {
            hintEl.style.display = 'none';
          }
        }, 50);
      }
    }

    function renderCmdHints() {
      const hintEl = I('ADM-CMD-HINT');
      if (!filteredCmds.length) { hintEl.style.display = 'none'; return; }

      hintEl.style.display = 'block';
      hintEl.innerHTML = filteredCmds.map((s, i) => `
        <div class="cmd-hint-item ${i === activeCmdIdx ? 'ON' : ''}" onclick="selectCmdHint('${s.command}')">
          <div style="display:flex;justify-content:space-between">
            <span class="cmd-hint-name">${esc(s.command)}</span>
            <span class="cmd-hint-cat">${esc(s.category)}</span>
          </div>
          <span class="cmd-hint-desc">${esc(s.description)}</span>
        </div>
      `).join('');

      const active = hintEl.querySelector('.cmd-hint-item.ON');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function selectCmdHint(cmd) {
      const inp = I('ADM-RAW-CMD');
      inp.value = cmd.split(' {')[0] + ' '; // Auto-fill until first parameter
      I('ADM-CMD-HINT').style.display = 'none';
      activeCmdIdx = -1;
      inp.focus();
    }

    async function admSearchP() {
      const q = (V('ADM-P-SEARCH') || '').trim(), el = I('ADM-P-RES');
      if (!q) { el.innerHTML = ''; return; }
      try {
        const users = await API(`/api/admin/users?q=${enc(q)}`);
        if (!users.length) { el.innerHTML = '<div class="empty">No users found matching "' + esc(q) + '".</div>'; return; }

        const highlight = (text, query) => {
          if (!query) return esc(text);
          const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
          return esc(text).replace(regex, '<span class="hl">$1</span>');
        };

        el.innerHTML = `
          <div class="adm-table-wrap">
            <table class="adm-table">

            <thead>
              <tr><th>User</th><th>Contact</th><th>Role</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${users.map(u => {
          const isStaff = ['helper', 'mod', 'dev', 'admin', 'owner', 'founder', 'youtube', 'famous'].includes(u.role);
          return `
                  <tr class="adm-user-row" onclick="admToggleUser(${u.id})">
                    <td>
                      <div style="font-weight:700">${highlight(u.username, q)}</div>
                      <div style="font-size:0.65rem;color:var(--tx3)">UID: #${u.id}</div>
                    </td>
                    <td>
                      <div style="font-size:0.8rem">${highlight(u.email, q)}</div>
                      <div style="font-size:0.65rem;color:var(--tx3)">Joined ${fmtD(u.created_at)}</div>
                    </td>
                    <td><span class="rb rb-${rbcls(u.role)}">${esc(u.role)}</span></td>
                    <td>
                      <button class="btn bred bxs" onclick="event.stopPropagation();admBurnUser(${u.id})"><svg class="ic" style="margin:0;width:12px;height:12px"><use href="#ic-trash"/></svg></button>
                    </td>
                  </tr>
                  <tr id="ADM-USER-EXTRA-${u.id}" class="adm-user-details">
                    <td colspan="4">
                      <div style="display:flex;gap:20px">
                        <img src="/api/skin/head/${enc(u.mc_username || u.username)}/64" style="border-radius:8px;background:var(--bg3);padding:10px">
                        <div style="flex:1">
                          <div class="stitle" style="margin:0">Manage Permissions</div>
                          <div class="role-grid">
                            ${['player', 'helper', 'mod', 'dev', 'admin', 'owner', 'founder', 'youtube', 'famous'].map(r => `
                              <button class="role-btn ${u.role === r ? 'ON' : ''}" onclick="admUpdateRole(${u.id}, '${r}')">${r.toUpperCase()}</button>
                            `).join('')}
                          </div>
                          <div class="stitle" style="margin:15px 0 5px 0">Identity Status</div>
                          <div style="display:flex;align-items:center;gap:10px">
                            <div style="font-size:0.8rem;color:${u.is_verified ? 'var(--grn)' : 'var(--r2)'}">${u.is_verified ? 'Verified ✅' : 'Unverified ❌'}</div>
                            <button class="btn bsm" onclick="admToggleVerify(${u.id}, ${u.is_verified ? 0 : 1})">${u.is_verified ? 'Revoke Verification' : 'Mark Verified'}</button>

                          </div>

                        </div>
                      </div>
                    </td>
                  </tr>
                `;
        }).join('')}
            </tbody>
          </table>
        </div>
      `;
      } catch (e) { el.innerHTML = '<div class="empty">Error fetching users.</div>'; }
    }

    function admToggleUser(uid) {
      const el = I(`ADM-USER-EXTRA-${uid}`);
      const wasOn = el.classList.contains('ON');
      document.querySelectorAll('.adm-user-details').forEach(d => d.classList.remove('ON'));
      if (!wasOn) el.classList.add('ON');
    }

    async function admUpdateRole(uid, next) {
      try {
        await API(`/api/admin/users/${uid}/role`, { method: 'POST', body: { role: next } });
        toast('ok', `User role updated to ${next.toUpperCase()}`);
        admSearchP();
      } catch (e) { toast('err', e.message); }
    }

    async function admToggleVerify(uid, next) {
      try {
        await API(`/api/admin/users/${uid}/verify`, { method: 'POST', body: { verified: next } });
        toast('ok', `Verification status updated.`);
        admSearchP();
      } catch (e) { toast('err', e.message); }
    }


    async function loadNexusTickets() {
      const el = I('ADM-T-QUEUE'); el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      try {
        const d = await API('/api/tickets');
        const open = d.filter(t => t.status === 'open');
        el.innerHTML = `
          <div class="adm-table-wrap">
            <table class="adm-table">

            <thead>
              <tr><th>Ticket</th><th>Author</th><th>Priority</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${open.map(t => `
                <tr>
                  <td>
                    <div style="font-weight:700">#${t.id} ${esc(t.title)}</div>
                    <div style="font-size:0.7rem;color:var(--tx3)">${esc(t.category)}</div>
                  </td>
                  <td>${esc(t.author_name)}</td>
                  <td><span class="adm-badge priority">${esc(t.priority || 'normal')}</span></td>
                  <td><button class="btn bsm" onclick="GO('tickets');setTimeout(()=>openTix(${t.id}),100)">Open</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ` || '<div class="empty">The queue is empty! Great job.</div>';
      } catch (e) { el.innerHTML = '<div class="empty">Error loading tickets.</div>'; }
    }

    async function admBurnUser(uid) {
      if (!confirm('!!! WARNING !!!\\n\\nThis will OBLITERATE this user and all their stats, logs, and forum history. This cannot be undone.\\n\\nContinue?')) return;
      try { await API(`/api/admin/users/${uid}`, { method: 'DELETE' }); admSearchP(); toast('ok', 'User obliterated.'); }
      catch (e) { toast('err', e.message); }
    }

    async function loadNexusTrials() {
      const el = I('ADM-TR-LIST'); el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      try {
        const res = await API('/api/admin/trials');
        if (!res.length) { el.innerHTML = '<div class="empty">No active trial offers.</div>'; return; }
        el.innerHTML = res.map(t => `
          <div class="adm-card" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:1.05rem;color:var(--g)">${esc(t.title)} <span style="font-size:0.7rem;color:var(--tx2);font-weight:normal;background:var(--p2);padding:2px 6px;border-radius:4px;margin-left:5px">${t.is_active ? 'ACTIVE' : 'INACTIVE'}</span></div>
              <div style="color:var(--tx2);font-size:0.8rem;margin-top:4px">Gamemode: <b>${esc(t.gamemode)}</b> | Rank: <b>${esc(t.rank_name)}</b> | Duration: <b>${t.duration_days} days</b></div>
            </div>
            <div>
              <button class="bto bxs bred" onclick="admDelTrial(${t.id})">Delete</button>
            </div>
          </div>
        `).join('');
      } catch (e) { el.innerHTML = '<div class="empty">Error loading trials.</div>'; }
    }

    async function admSaveTrial() {
      const d = {
        title: V('ADM-TR-TITLE'),
        gamemode: V('ADM-TR-GM'),
        rank_name: V('ADM-TR-RANK'),
        duration_days: V('ADM-TR-DAYS')
      };
      if (!d.title || !d.gamemode || !d.rank_name || !d.duration_days) return toast('err', 'Fill all fields.');
      try {
        await API('/api/admin/trials', { method: 'POST', body: d });
        toast('ok', 'Trial offer saved successfully.');
        SV('ADM-TR-TITLE', ''); SV('ADM-TR-GM', ''); SV('ADM-TR-RANK', ''); SV('ADM-TR-DAYS', '7');
        loadNexusTrials();
      } catch (e) { toast('err', e.message); }
    }

    async function admDelTrial(id) {
      if (!confirm('Delete this trial offer?')) return;
      try {
        await API(`/api/admin/trials/${id}`, { method: 'DELETE' });
        toast('ok', 'Trial offer deleted.');
        loadNexusTrials();
      } catch (e) { toast('err', e.message); }
    }

    async function loadNexusEvents() {
      const el = I('ADM-E-LIST'); el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      try {
        const d = await API('/api/events');
        el.innerHTML = d.map(e => `<div class="p" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
          <div><strong>${esc(e.title)}</strong><br><small style="color:var(--tx2)">Expires: ${fmtD(e.expires_at)}</small></div>
          <button class="btn bred bxs" onclick="admDelEvent(${e.id})"><svg class="ic" style="margin:0"><use href="#ic-trash"/></svg></button>
        </div>`).join('') || '<div class="empty">No active events.</div>';
      } catch (e) { }
    }

    const EVENT_PRESETS = [
      { ti: "Earn a Free Rank", de: "Claim your free starter rank today and unlock exclusive lobby furniture!", lk: "/store/free" },
      { ti: "Join our Discord", de: "Join 5,000+ members! Get live updates and participate in giveaways.", lk: "https://discord.gg/z4Yc7EMr4e" },
      { ti: "Double XP Weekend", de: "2x Experience is currently ACTIVE! Level up your battle pass twice as fast.", lk: "/players" },
      { ti: "Vote for Rewards", de: "Help Hellcore Network grow on server lists and earn 2x Mystery Boxes!", lk: "/forums" },
      { ti: "Spring Sale: 20% OFF", de: "Spring is here! Use coupon code 'SPRING20' for a massive discount.", lk: "/store" },
      { ti: "Guild Tournament", de: "The weekly Guild Wars have begun! Top guilds win sharing chests of Gold.", lk: "/players" },
      { ti: "Mystery Nexus Boost", de: "Nexus rates are BOOSTED! Watch ads for a higher chance of Legendary loot.", lk: "/store/free" }
    ];

    function admFillPreset(idx) {
      const p = EVENT_PRESETS[idx];
      SV('ADM-E-TI', p.ti); SV('ADM-E-DE', p.de); SV('ADM-E-LK', p.lk);
      toast('ok', 'Template loaded!');
    }

    async function admCreateEvent() {
      const ti = V('ADM-E-TI'), de = V('ADM-E-DE'), lk = V('ADM-E-LK');
      let ex = V('ADM-E-EX'); // datetime-local format: YYYY-MM-DDTHH:MM
      if (ex) ex = ex.replace('T', ' '); // format for backend: YYYY-MM-DD HH:MM

      if (!ti || !de) return;
      try {
        await API('/api/admin/events', { method: 'POST', body: { title: ti, description: de, expires_at: ex, link_url: lk } });
        SV('ADM-E-TI', ''); SV('ADM-E-DE', ''); SV('ADM-E-EX', ''); SV('ADM-E-LK', '');
        loadNexusEvents(); toast('ok', 'Event published!'); loadEvents();
      } catch (e) { toast('err', e.message); }
    }

    async function admDelEvent(id) {
      try { await API(`/api/admin/events/${id}`, { method: 'DELETE' }); loadNexusEvents(); loadEvents(); }
      catch (e) { }
    }

    // NOTE: admRunCmd is defined earlier at line ~6315 using the correct input ID 'ADM-RAW-CMD'
    // The duplicate that was here used the wrong ID 'ADM-TERM-IN' and was removed.

    async function loadActiveTrials() {
      const el = I('TRIAL-BOX'); if (!el) return;
      try {
        const res = await API('/api/trials');
        const available = res.filter(t => !t.claimed);
        if (!available.length) { el.style.display = 'none'; return; }
        
        el.style.display = 'block';
        el.innerHTML = available.map(t => `
          <div class="p" style="border:1px solid var(--g); background:var(--accent-glow); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px">
            <div>
              <div style="font-weight:700; font-size:1.2rem; color:var(--tx)">${esc(t.title)}</div>
              <div style="font-size:0.85rem; color:var(--tx2); margin-top:2px">Free ${t.duration_days}-Day Trial for new verified users.</div>
            </div>
            <button class="btn" onclick="claimTrial(${t.id})">Claim Free Trial</button>
          </div>
        `).join('');
      } catch (e) { el.style.display = 'none'; }
    }

    async function claimTrial(tid) {
      if (!ME) {
        toast('err', 'Please log in to claim this trial.');
        openM('ML');
        return;
      }
      if (!ME.is_verified) {
        startVerificationFlow();
        return;
      }
      try {
        const res = await API(`/api/trials/claim/${tid}`, { method: 'POST' });
        toast('ok', 'Trial claimed successfully!');
        loadActiveTrials();
        reInitPermissions();
      } catch (e) {
        toast('err', e.message);
      }
    }

    async function loadEvents() {
      const el = I('EVENT-BOX'); if (!el) return;
      try {
        const d = await API('/api/events');
        if (!d.length) {
          el.innerHTML = '<div class="p" style="text-align:center;color:var(--tx2);font-style:italic">No active events. Stay tuned!</div>';
          return;
        }

        const carousel = document.createElement('div');
        carousel.className = 'event-carousel';

        d.forEach(function (ev) {
          const lk = ev.link_url || '';
          const isExt = lk.startsWith('http') || lk.startsWith('//');

          const card = document.createElement('div');
          card.className = 'event-card';

          const title = document.createElement('div');
          title.className = 'event-card-title';
          title.textContent = ev.title;

          const desc = document.createElement('div');
          desc.className = 'event-card-desc';
          desc.textContent = ev.description;

          card.appendChild(title);
          card.appendChild(desc);

          if (lk) {
            if (isExt) {
              // External link: use a real <a> tag
              const btn = document.createElement('a');
              btn.className = 'btn bsm';
              btn.style.cssText = 'display:inline-block;margin-top:14px;text-decoration:none;';
              btn.href = lk;
              btn.target = '_blank';
              btn.rel = 'noopener noreferrer';
              btn.textContent = 'Learn More';
              card.appendChild(btn);
            } else {
              // Internal link: real <button>
              const btn = document.createElement('button');
              btn.className = 'btn bsm';
              btn.style.cssText = 'margin-top:14px;';
              btn.textContent = 'Learn More';
              btn.addEventListener('click', function (e) {
                e.stopPropagation();
                GO(lk.replace(/^\//, '').replace(/\//g, '-'));
              });
              card.appendChild(btn);
            }
          }

          carousel.appendChild(card);
        });

        el.innerHTML = '';
        el.appendChild(carousel);
      } catch (err) { el.innerHTML = ''; }
    }

    async function loadNexusForums() {
      const el = I('ADM-F-LIST'); el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      try {
        const d = await API('/api/forums');
        el.innerHTML = d.map(f => `<div class="p" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
           <div style="font-size:.8rem"><strong>${esc(f.title)}</strong><br><small>By ${esc(f.author_name)} in ${f.category}</small></div>
           <button class="btn bred bxs" onclick="admPurgeThread(${f.id})"><svg class="ic" style="margin:0"><use href="#ic-trash"/></svg></button>
         </div>`).join('') || '<div class="empty">No threads to moderate.</div>';
      } catch (e) { }
    }

    async function admPurgeThread(id) {
      if (!confirm('Purge this thread and all replies?')) return;
      try { await API(`/api/forums/${id}`, { method: 'DELETE' }); loadNexusForums(); toast('ok', 'Purged.'); }
      catch (e) { }
    }
    async function submitF() {
      const t = V('NF-TI'), c = V('NF-CO'), ca = V('NF-CA');
      if (!t || !c) { toast('err', 'Fill all fields'); return; }
      try {
        await API('/api/forums', { method: 'POST', body: { title: t, content: c, category: ca } });
        closeM('MF'); SV('NF-TI', ''); SV('NF-CO', ''); toast('ok', 'Thread posted!'); loadForums();
      }
      catch (e) { toast('err', e.message); }
    }
    async function postReply() {
      if (!ME) { openM('ML'); return; }
      const c = V('F-RPLY').trim(); if (!c) return;
      try {
        await API(`/api/forums/${CUR_FORUM}/replies`, { method: 'POST', body: { content: c } });
        SV('F-RPLY', ''); toast('ok', 'Reply posted!'); openForum(CUR_FORUM);
      }
      catch (e) { toast('err', e.message); }
    }
    async function delForum(id) {
      if (!confirm('Delete this thread?')) return;
      try { await API(`/api/forums/${id}`, { method: 'DELETE' }); backF(); loadForums(); toast('ok', 'Deleted.'); }
      catch (e) { toast('err', e.message); }
    }
    async function delReply(id) {
      if (!confirm('Delete reply?')) return;
      try { await API(`/api/forums/replies/${id}`, { method: 'DELETE' }); openForum(CUR_FORUM); }
      catch (e) { toast('err', e.message); }
    }

    // ════════════════════════════════════════════════════
    // TICKETS (DISCORD WORKSPACE)
    // ════════════════════════════════════════════════════
    const TIX = { list: [], activeId: null, active: null, messages: [], activity: [], staff: [], perms: {}, poll: null, internal: false, canned: [], typingUsers: [] };
    const tixSeenKey = id => `hc_tix_seen_${ME?.id || 0}_${id}`;
    const tixMarkSeen = (id, mid) => { try { localStorage.setItem(tixSeenKey(id), String(mid || 0)); } catch (e) { } };
    const tixGetSeen = id => { try { return parseInt(localStorage.getItem(tixSeenKey(id)) || '0', 10) || 0; } catch (e) { return 0; } };
    function updateTicketUnreadUI(totalUnread = null) {
      const total = totalUnread == null
        ? (TIX.list || []).reduce((sum, t) => sum + Math.max(0, (t.last_message_id || 0) - tixGetSeen(t.id)), 0)
        : totalUnread;
      const badge = I('TIX-UNREAD-BADGE');
      if (badge) {
        badge.style.display = total ? 'inline-flex' : 'none';
        badge.textContent = total;
      }
      document.title = total ? `(${total}) Hellcore Network` : 'Hellcore Network — mc.hellcore.net';
    }

    async function loadTix() {
      if (!ME) { const el = I('TIX-L'); if (el) el.innerHTML = '<div class="empty">Please log in to view your tickets.</div>'; return; }
      const el = I('TIX-L'); if (!el) return;
      el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      try {
        const [tickets, canned] = await Promise.all([
          API('/api/tickets'),
          isStaff() ? API('/api/tickets/canned') : Promise.resolve([])
        ]);
        TIX.list = tickets || [];
        TIX.canned = canned || [];
        renderTixList(TIX.list, el);
        updateTicketUnreadUI();
        renderCannedReplies();
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message || 'Failed to load tickets.')}</div>`; }
    }
    async function loadProfTix() {
      if (!ME) return;
      const el = I('PR-TIX-L'); if (!el) return;
      try { const d = await API('/api/tickets'); renderTixList(d, el, true); } catch (e) { }
    }
    function renderTixList(d, el, simple = false) {
      const q = (I('TIX-FILTER')?.value || '').toLowerCase().trim();
      const list = (d || []).filter(t => !q || `${t.title} ${t.category} ${t.author_name}`.toLowerCase().includes(q));
      if (!list.length) { el.innerHTML = '<div class="empty">No tickets.</div>'; return; }
      el.innerHTML = list.map(t => {
        const seen = tixGetSeen(t.id);
        const unread = Math.max(0, (t.last_message_id || 0) - seen);
        const st = t.status === 'open' ? 'open' : 'closed';
        if (simple) {
          return `<div class="p" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px" onclick="openTix(${t.id})">
            <div><div style="font-weight:600">${esc(t.title)}</div><div style="font-size:.72rem;color:var(--tx2)">${t.category} · ${fmtD(t.created_at)} · By ${esc(t.author_name)}</div></div>
            <span style="font-size:.75rem;font-weight:700;color:${t.status === 'open' ? 'var(--grn)' : 'var(--r2)'}">${t.status.toUpperCase()}</span></div>`;
        }
        return `<div class="tix-item ${TIX.activeId === t.id ? 'on' : ''}" onclick="openTix(${t.id})">
          <div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(t.title)}</strong><span class="tix-chip ${st}">${st}</span></div>
          <div style="font-size:.72rem;color:var(--tx2);margin-top:2px">${esc(t.category)} · ${esc(t.author_name)} · ${fmtD(t.last_message_at || t.created_at)}</div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:.7rem">
            <span style="color:${t.priority === 'urgent' ? '#f87171' : t.priority === 'high' ? '#fb923c' : 'var(--tx3)'}">Priority: ${esc(t.priority || 'normal')}</span>
            ${unread ? `<span style="color:#fbbf24;font-weight:800">${unread} unread</span>` : '<span style="color:var(--tx3)">No unread</span>'}
          </div>
        </div>`;
      }).join('');
    }
    function filterTicketList() { renderTixList(TIX.list, I('TIX-L')); }

    async function openTix(id) {
      const pg = I('pg-tickets');
      if (!pg || !pg.classList.contains('ON')) { GO('tickets'); setTimeout(() => openTix(id), 60); return; }
      try {
        const d = await API(`/api/tickets/${id}`);
        TIX.activeId = id;
        TIX.active = d.ticket;
        TIX.messages = d.messages || [];
        TIX.activity = d.activity || [];
        TIX.staff = d.staff || [];
        TIX.perms = d.permissions || {};
        TIX.typingUsers = [];
        updateTypingIndicator();
        renderTixList(TIX.list, I('TIX-L'));
        renderTicketWorkspace();
        bindTicketRealtime(id);
        startTicketPolling();
        updateTicketUnreadUI();
      } catch (e) {
        if ((e.message || '').includes('Authentication')) {
          rememberAuthIntent('tickets', id);
          openM('ML');
          return;
        }
        toast('err', e.message);
      }
    }
    function closeTixD() {
      if (TIX.poll) clearInterval(TIX.poll);
      TIX.poll = null;
      TIX.activeId = null;
      TIX.active = null;
      I('TIX-CHAT-HEAD').textContent = 'Select a ticket to start.';
      I('TIX-CHAT').innerHTML = '';
      I('TIX-SIDE').innerHTML = 'Select a ticket to view details.';
      I('TIX-COMPOSER').style.display = 'none';
      loadTix();
    }
    function renderTicketWorkspace() {
      const t = TIX.active; if (!t) return;
      const head = I('TIX-CHAT-HEAD');
      const canManage = !!TIX.perms.can_manage;
      head.innerHTML = `<div>#${t.id} ${esc(t.title)}${t.primary_rank ? ` <span class="rb rb-${rbcls(t.primary_rank)}" style="font-size:.6rem">${esc(t.primary_rank)}</span>` : ''}</div><div style="display:flex;gap:8px">${canManage && t.status === 'open' ? `<button class="bto bsm" onclick="ticketAction('close')">Close</button>` : ''}${canManage && t.status !== 'open' ? `<button class="bto bsm" onclick="ticketAction('reopen')">Reopen</button>` : ''}${TIX.perms.can_delete ? `<button class="btn bred bsm" onclick="delTix(${t.id})">Delete</button>` : ''}</div>`;
      I('TIX-COMPOSER').style.display = t.status === 'open' ? '' : 'none';
      renderTicketMessages();
      renderTicketSide();
      const last = TIX.messages.length ? TIX.messages[TIX.messages.length - 1].id : 0;
      tixMarkSeen(t.id, last);
    }
    function highlightMentions(text) {
      const msg = esc(text || '').replace(/\n/g, '<br>');
      if (!ME?.username) return msg;
      const r = new RegExp(`@${ME.username}\\b`, 'gi');
      return msg.replace(r, `<span class="tix-mention">@${ME.username}</span>`);
    }
    function renderOneMessage(m) {
      const isSys = m.author_id === 1 || m.message_type === 'system';
      const isInternal = Number(m.is_internal || 0) === 1;
      const av = isSys ? '/main-static/logo.png' : `/api/skin/head/${enc(m.mc_username || m.author_name)}/42`;
      const badge = isInternal ? '<span class="tmsg-badge" style="background:#f59e0b">Internal</span>' : (isSys ? '<span class="tmsg-badge">System</span>' : '');
      return `<div class="tmsg ${isSys ? 'system' : ''}">
        ${isSys ? '' : `<div class="tmsg-av"><img src="${av}" alt=""></div>`}
        <div class="tmsg-main">
          <div class="tmsg-header"><span class="tmsg-user">${esc(isSys ? 'Hellcore System' : m.author_name)}</span>${m.primary_rank ? `<span class="rb rb-${rbcls(m.primary_rank)}" style="font-size:.58rem">${esc(m.primary_rank)}</span>` : ''}${m.author_role ? `<span class="rb rb-${m.author_role}" style="font-size:.6rem">${m.author_role}</span>` : ''}${badge}<span class="tmsg-time">${fmtD(m.created_at)}</span></div>
          <div class="tmsg-content">${highlightMentions(m.content || '')}</div>
          ${m.image_url ? `<img src="${m.image_url}" class="tmsg-img" onclick="window.open(this.src)">` : ''}
        </div>
      </div>`;
    }
    function renderTicketMessages() {
      const el = I('TIX-CHAT');
      const q = (I('TIX-MSG-SEARCH')?.value || '').toLowerCase().trim();
      const list = (TIX.messages || []).filter(m => !q || String(m.content || '').toLowerCase().includes(q));
      el.innerHTML = list.length ? list.map(renderOneMessage).join('') : '<div class="empty">No messages.</div>';
      el.scrollTop = el.scrollHeight;
    }
    function renderTicketSide() {
      const t = TIX.active, el = I('TIX-SIDE'); if (!t || !el) return;
      const staffOpt = ['<option value="">Unassigned</option>'].concat((TIX.staff || []).map(s => `<option value="${s.id}" ${Number(t.assigned_to) === Number(s.id) ? 'selected' : ''}>${esc(s.username)} (${s.role})</option>`)).join('');
      const canAssign = TIX.perms.can_assign;
      const canRank = TIX.perms.can_rank_grant;
      const canNote = TIX.perms.can_internal_note;
      el.innerHTML = `
        <div class="p"><div class="stitle" style="font-size:1rem">Ticket Details</div>
          <div style="font-size:.8rem;color:var(--tx2)">Category: <strong>${esc(t.category)}</strong></div>
          <div style="font-size:.8rem;color:var(--tx2)">Author: <strong>${esc(t.author_name)}</strong>${t.primary_rank ? ` <span class="rb rb-${rbcls(t.primary_rank)}" style="font-size:.58rem">${esc(t.primary_rank)}</span>` : ''}</div>
          <div style="font-size:.8rem;color:var(--tx2)">Created: <strong>${fmtD(t.created_at)}</strong></div>
          ${t.order_summary ? `<div style="margin-top:8px;padding:10px;border:1px solid var(--bd);border-radius:10px;background:rgba(255,255,255,0.03)"><div style="font-size:.72rem;color:var(--tx3);text-transform:uppercase">Order</div><div style="font-weight:700">${esc(t.order_summary.order_code || 'Pending')}</div><div style="font-size:.78rem;color:var(--tx2)">Payment: ${esc(t.order_summary.payment_method || 'upi')} · ${esc(t.order_summary.payment_status || t.order_summary.status || 'pending')}</div><div style="font-size:.78rem;color:var(--tx2);margin-top:4px">${(t.order_summary.items || []).map(it => `${esc(it.name)} (${esc(it.gamemode || 'global')})`).join('<br>')}</div></div>` : ''}
          <div style="margin-top:8px;display:flex;gap:8px"><span class="tix-chip ${t.status === 'open' ? 'open' : 'closed'}">${esc(t.status)}</span><span class="tix-chip">${esc(t.priority || 'normal')}</span></div>
        </div>
        ${isStaff() ? `<div class="p"><div class="stitle" style="font-size:1rem">Notifications</div><button class="btn bsm" onclick="ensurePushSubscription()">Enable Staff Notifications</button></div>` : ''}
        <div class="p"><div class="stitle" style="font-size:1rem">Search Messages</div><input id="TIX-MSG-SEARCH" class="inp" placeholder="Find in chat..." oninput="renderTicketMessages()"></div>
        <div class="p"><div class="stitle" style="font-size:1rem">Priority</div><select class="inp" ${canAssign ? '' : 'disabled'} onchange="ticketAction('priority', { priority:this.value })"><option value="low" ${t.priority === 'low' ? 'selected' : ''}>low</option><option value="normal" ${t.priority === 'normal' ? 'selected' : ''}>normal</option><option value="high" ${t.priority === 'high' ? 'selected' : ''}>high</option><option value="urgent" ${t.priority === 'urgent' ? 'selected' : ''}>urgent</option></select></div>
        <div class="p"><div class="stitle" style="font-size:1rem">Assignee</div><select class="inp" ${canAssign ? '' : 'disabled'} onchange="ticketAction('assign', { assigned_to:this.value || null })">${staffOpt}</select></div>
        ${canRank ? `<div class="p"><div class="stitle" style="font-size:1rem">Grant Rank (HellcoreSync)</div><div class="fg"><label>Username</label><input id="TR-USER" class="inp" placeholder="minecraft username"></div><div class="fg"><label>Rank</label><input id="TR-RANK" class="inp" placeholder="vip"></div><div class="g2"><div class="fg"><label>Mode</label><select id="TR-MODE" class="inp"><option value="perm_set">Permanent</option><option value="temp_add">Temporary</option></select></div><div class="fg"><label>Duration</label><input id="TR-DUR" class="inp" value="7d"></div></div><button class="btn bsm" onclick="grantTicketRank()">Queue Rank Grant</button></div>` : ''}
        <div class="p"><div class="stitle" style="font-size:1rem">Payment Quick Actions</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="bto bsm" onclick="ticketAction('payment_received')">Payment Received</button><button class="bto bsm" onclick="ticketAction('payment_pending')">Pending Proof</button><button class="bto bsm" onclick="ticketAction('need_details')">Need Details</button></div></div>
        ${canNote ? `<div class="p"><div class="stitle" style="font-size:1rem">Internal Notes</div><button class="bto bsm" onclick="toggleInternalNote()">Toggle Internal Mode</button></div>` : ''}
        <div class="p"><div class="stitle" style="font-size:1rem">Timeline</div>${(TIX.activity || []).length ? TIX.activity.map(a => `<div class="tix-act"><strong>${esc(a.action)}</strong><div style="color:var(--tx2)">${esc(a.details || '')}</div><div style="font-size:.68rem;color:var(--tx3)">${esc(a.actor_name || '')} · ${fmtD(a.created_at)}</div></div>`).join('') : '<div class="empty">No activity yet.</div>'}</div>
      `;
    }
    function toggleInternalNote() {
      TIX.internal = !TIX.internal;
      I('TIX-INTERNAL-BADGE').style.display = TIX.internal ? '' : 'none';
    }
    function updateTypingIndicator() {
      const el = I('TIX-TYPING');
      if (!el) return;
      const others = (TIX.typingUsers || []).filter(name => name && name !== ME?.username);
      if (!others.length) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = 'block';
      el.textContent = `${others.join(', ')} typing...`;
    }
    async function ticketTyping() {
      if (!TIX.activeId || !ME) return;
      if (TIX_TYPING_TIMER) return;
      TIX_TYPING_TIMER = setTimeout(() => { TIX_TYPING_TIMER = null; }, 1500);
      try { await API(`/api/tickets/${TIX.activeId}/typing`, { method: 'POST' }); } catch (e) { }
    }
    function previewTicketImage(input) {
      const f = input?.files?.[0];
      I('TIX-IMG-NM').textContent = f ? `${f.name} (${Math.round(f.size / 1024)} KB)` : '';
    }
    function renderCannedReplies() {
      const s = I('TIX-CANNED'); if (!s) return;
      const opts = ['<option value="">Insert canned response...</option>'].concat((TIX.canned || []).map(c => `<option value="${esc(c.text)}">${esc(c.label)}</option>`));
      s.innerHTML = opts.join('');
    }
    function applyCannedReply() {
      const s = I('TIX-CANNED'), t = I('TIX-RPLY');
      if (!s?.value) return;
      t.value = t.value ? `${t.value}\n${s.value}` : s.value;
      s.value = '';
    }
    async function submitTix() {
      if (!ME) { closeM('MT'); openM('ML'); return; }
      const ti = V('NT-TI'), de = V('NT-DE'), ca = V('NT-CA');
      if (!ti || !de) { toast('err', 'Fill all fields'); return; }
      try {
        const pr = (I('NT-PR')?.value || 'normal');
        await API('/api/tickets', { method: 'POST', body: { title: ti, description: de, category: ca, priority: pr } });
        closeM('MT'); SV('NT-TI', ''); SV('NT-DE', ''); toast('ok', 'Ticket submitted!'); await loadTix(); loadProfTix();
      }
      catch (e) { toast('err', e.message); }
    }
    async function sendActiveTixMsg() { if (TIX.activeId) await sendTixMsg(TIX.activeId); }
    async function sendTixMsg(id) {
      const c = V('TIX-RPLY')?.trim();
      const file = I('TIX-IMG')?.files[0];
      if (!c && !file) return;
      let base64 = null;
      if (file) {
        base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
      }
      try {
        const r = await API(`/api/tickets/${id}/msg`, {
          method: 'POST',
          body: { content: c, image: base64, is_internal: TIX.internal ? 1 : 0 }
        });
        if (r.message) TIX.messages.push(r.message);
        SV('TIX-RPLY', '');
        if (I('TIX-IMG')) I('TIX-IMG').value = '';
        I('TIX-IMG-NM').textContent = '';
        TIX.internal = false;
        I('TIX-INTERNAL-BADGE').style.display = 'none';
        renderTicketMessages();
        const last = TIX.messages.length ? TIX.messages[TIX.messages.length - 1].id : 0;
        tixMarkSeen(id, last);
        loadTix();
      } catch (e) { toast('err', e.message); }
    }
    async function ticketAction(action, body = {}) {
      if (!TIX.activeId) return;
      try {
        await API(`/api/tickets/${TIX.activeId}/action`, { method: 'POST', body: { action, ...body } });
        await openTix(TIX.activeId);
        await loadTix();
      } catch (e) { toast('err', e.message); }
    }
    async function closeTix(id) { TIX.activeId = id; await ticketAction('close'); }
    async function reopenTix(id) { TIX.activeId = id; await ticketAction('reopen'); }
    async function delTix(id) {
      if (!confirm('Delete ticket?')) return;
      try { await API(`/api/tickets/${id}`, { method: 'DELETE' }); closeTixD(); toast('ok', 'Deleted.'); }
      catch (e) { toast('err', e.message); }
    }
    async function grantTicketRank() {
      if (!TIX.activeId) return;
      const username = V('TR-USER').trim(), rank = V('TR-RANK').trim(), mode = V('TR-MODE'), duration = V('TR-DUR').trim();
      if (!username || !rank) { toast('err', 'Username and rank required'); return; }
      try {
        await API(`/api/tickets/${TIX.activeId}/rank`, { method: 'POST', body: { username, rank, mode, duration } });
        toast('ok', 'Rank grant queued in HellcoreSync.');
        openTix(TIX.activeId);
      } catch (e) { toast('err', e.message); }
    }
    function startTicketPolling() {
      if (TIX.poll) clearInterval(TIX.poll);
      if (!TIX.activeId) return;
      initPusher();
      TIX.poll = setInterval(async () => {
        try {
          const last = TIX.messages.length ? TIX.messages[TIX.messages.length - 1].id : 0;
          const d = await API(`/api/tickets/${TIX.activeId}/updates?after_id=${last}`);
          if (Array.isArray(d.messages) && d.messages.length) {
            TIX.messages = TIX.messages.concat(d.messages);
            renderTicketMessages();
            tixMarkSeen(TIX.activeId, TIX.messages[TIX.messages.length - 1].id);
            loadTix();
          }
          if (d.ticket_meta && TIX.active) {
            TIX.active.status = d.ticket_meta.status || TIX.active.status;
            TIX.active.priority = d.ticket_meta.priority || TIX.active.priority;
          }
        } catch (e) { }
      }, 12000);
    }

    // ════════════════════════════════════════════════════
    // STORE
    // ════════════════════════════════════════════════════
    const STORE = {
      bw_ranks: [
        { id: 'bw-vip', name: 'VIP', price: 4.99, icon: '<svg class="ic"><use href="#ic-star"/></svg> ', cc: '#4ade80', gm: 'bedwars', perks: ['[VIP] Green Tag', 'VIP Kit', '5% Discount', 'Global Chat access'] },
        { id: 'bw-vipp', name: 'VIP+', price: 9.99, icon: '<svg class="ic"><use href="#ic-layers"/></svg> ', cc: '#06b6d4', gm: 'bedwars', perks: ['[VIP+] Cyan Tag', 'VIP+ Kit', '10% Discount', 'All VIP Perks', 'Fly in Lobby'] },
        { id: 'bw-mvp', name: 'MVP', price: 19.99, icon: '<svg class="ic"><use href="#ic-shield"/></svg> ', cc: '#f59e0b', gm: 'bedwars', perks: ['[MVP] Gold Tag', 'MVP Kit', '15% Discount', 'All VIP+ Perks', 'Color Nickname'] },
        { id: 'bw-mvpp', name: 'MVP+', price: 39.99, icon: '<svg class="ic"><use href="#ic-heart"/></svg> ', cc: '#f43f5e', gm: 'bedwars', perks: ['[MVP+] Red Tag', 'MVP+ Kit', '20% Discount', 'All Perks', 'Priority Join'] },
        { id: 'bw-mvppp', name: 'MVP++', price: 45.00, icon: '<svg class="ic"><use href="#ic-bolt"/></svg> ', cc: '#d946ef', gm: 'bedwars', perks: ['[MVP++] Pink Tag', 'MVP++ Kit', '25% Discount', 'All Perks', 'Private Games'] },
      ],
      bw_free: [
        { id: 'free-vip', name: 'FREE VIP', price: 0, icon: '<svg class="ic"><use href="#ic-gift"/></svg> ', cc: '#eab308', gm: 'bedwars', perks: ['Watch 3 Ads to claim', 'Temporary 1hr VIP', 'Earn coins & XP', 'Play for Free'] },
      ],
      bw_mystery: [
        { id: 'bw-mb', name: 'Mystery Box', price: 2.99, icon: '<svg class="ic"><use href="#ic-box"/></svg> ', cc: '#a855f7', gm: 'bedwars', perks: ['Random cosmetic', 'Exclusive chance', 'Effect chance'] },
        { id: 'bw-md1', name: 'Mystery Dust ×100', price: 1.99, icon: '✨', cc: '#c084fc', gm: 'bedwars', perks: ['100 Mystery Dust', 'Craft cosmetics', 'Trade'] },
        { id: 'bw-md5', name: 'Mystery Dust ×500', price: 7.99, icon: '✨', cc: '#c084fc', gm: 'bedwars', perks: ['500 Mystery Dust', 'Best value', 'Bonus 50'] },
      ],
      bw_coins: [
        { id: 'bw-c1k', name: 'BW Coins 1K', price: 1.99, icon: '<svg class="ic"><use href="#ic-coins"/></svg> ', cc: '#eab308', gm: 'bedwars', perks: ['1,000 Bedwars Coins', 'Buy upgrades', 'Permanent'] },
        { id: 'bw-c5k', name: 'BW Coins 5K', price: 7.99, icon: '<svg class="ic"><use href="#ic-coins"/></svg> ', cc: '#eab308', gm: 'bedwars', perks: ['5,000 Bedwars Coins', 'Best value', 'Bonus 500'] },
        { id: 'bw-c10k', name: 'BW Coins 10K', price: 14.99, icon: '<svg class="ic"><use href="#ic-coins"/></svg> ', cc: '#eab308', gm: 'bedwars', perks: ['10,000 Bedwars Coins', 'Max pack', 'Bonus 1K'] },
      ],
    };
    const gmR = gm => [
      { id: `${gm}-vip`, name: 'VIP', price: 4.99, icon: '<svg class="ic"><use href="#ic-star"/></svg> ', cc: '#4ade80', gm, perks: [`[VIP] on ${cap(gm)}`, 'VIP kit', '5% discount'] },
      { id: `${gm}-vipp`, name: 'VIP+', price: 9.99, icon: '<svg class="ic"><use href="#ic-layers"/></svg> ', cc: '#06b6d4', gm, perks: [`[VIP+] on ${cap(gm)}`, 'Enhanced kit', 'All VIP', '10% disc'] },
      { id: `${gm}-mvp`, name: 'MVP', price: 19.99, icon: '<svg class="ic"><use href="#ic-shield"/></svg> ', cc: '#f59e0b', gm, perks: [`[MVP] on ${cap(gm)}`, 'MVP kit', 'All VIP+', '15% disc', 'Fly'] },
      { id: `${gm}-mvpp`, name: 'MVP+', price: 39.99, icon: '<svg class="ic"><use href="#ic-heart"/></svg> ', cc: '#f43f5e', gm, perks: [`[MVP+] on ${cap(gm)}`, 'Best kit', 'All MVP', '20% disc', 'Nick'] },
      { id: `${gm}-mvppp`, name: 'MVP++', price: 45.00, icon: '<svg class="ic"><use href="#ic-bolt"/></svg> ', cc: '#d946ef', gm, perks: [`[MVP++] on ${cap(gm)}`, 'Ultimate kit', 'All MVP+', '25% disc', 'Private Host'] },
    ];

    function buildStores() {
      try {
        bwT('ranks');
        rS('S-SW', gmR('skywars'));
        rS('S-FREE', STORE.bw_free);
        rS('S-FREE-PAID', STORE.bw_ranks);
        console.log('Stores built');
      } catch (e) { console.error('buildStores:', e); }
    }
    function showStore(id) {
      buildStores();
      const pg = I('pg-store-' + id);
      if (pg) {
        document.querySelectorAll('.pg').forEach(p => p.classList.remove('ON'));
        pg.classList.add('ON');
        window.scrollTo(0, 0);
        if (id === 'free') loadAdStatus();
      }
    }
    let AD_STATE = { ads_today: 0, ad_streak: 0, vip_active: false };
    let AD_TIMER = null;
    function showGoogleAd() {
      try {
        if (typeof adsbygoogle !== 'undefined') {
          (adsbygoogle = adsbygoogle || []).push({});
        }
      } catch (e) { console.log('Ad error:', e); }
    }
    // ════════════════════════════════════════════════════
    // MYSTERY NEXUS (Ad System)
    // ════════════════════════════════════════════════════
    let NEXUS_CD = 0;
    function updateNexusCD() {
      if (NEXUS_CD <= 0) {
        I('NEXUS-TIMER').textContent = 'READY TO UNLOCK';
        I('NEXUS-BTN').disabled = false;
        I('NEXUS-BTN').textContent = 'WATCH & WIN';
        I('NEXUS-BOX').classList.add('crate-pulse');
        I('NEXUS-BOX').classList.remove('cooldown');
        return;
      }
      const m = Math.floor(NEXUS_CD / 60), s = NEXUS_CD % 60;
      I('NEXUS-TIMER').textContent = `RECHARGING: ${m}m ${s}s`;
      I('NEXUS-BTN').disabled = true;
      I('NEXUS-BTN').textContent = `${m}m ${s}s`;
      I('NEXUS-BOX').classList.remove('crate-pulse');
      I('NEXUS-BOX').classList.add('cooldown');
      NEXUS_CD--;
      setTimeout(updateNexusCD, 1000);
    }

    async function loadAdStatus() {
      try {
        const d = await API('/api/ads/status');
        AD_STATE = d;
        if (d.next_ad) {
          const diff = (new Date(d.next_ad).getTime() - new Date().getTime()) / 1000;
          if (diff > 0) { NEXUS_CD = Math.ceil(diff); updateNexusCD(); }
        }
        loadAdHistory();
      } catch (e) { }
    }
    async function loadAdHistory() {
      const h = await API('/api/ads/recent');
      I('NEXUS-HISTORY').innerHTML = h.map(x => `<tr>
            <td><b>${esc(x.username)}</b></td>
            <td>${esc(x.item_name)}</td>
            <td>${fmtD(x.created_at)}</td>
        </tr>`).join('');
    }

    function watchAd(num) {
      if (!ME) { openM('ML'); toast('err', 'Log in to watch ads.'); return; }
      if (NEXUS_CD > 0) { toast('err', 'Nexus is recharging!'); return; }

      const btn = I('NEXUS-BTN');
      btn.disabled = true;
      btn.innerHTML = '<div class="sp" style="width:16px;height:16px;border-width:2px"></div> Waiting for Ad...';

      // Trigger the provided ad directly on click to guarantee it shows
      // window.open('YOUR_PROPELLERADS_DIRECT_LINK_HERE', '_blank');
      let countdown = 30;
      if (AD_TIMER) clearInterval(AD_TIMER);
      AD_TIMER = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(AD_TIMER);
          AD_TIMER = null;
          completeAd();
        } else {
          btn.innerHTML = `Watching: ${countdown}s`;
        }
      }, 1000);
    }

    async function completeAd() {
      try {
        const d = await API('/api/ads/watch', { method: 'POST' });
        openCrate(d);
        NEXUS_CD = 300; // Start 5m cooldown immediately locally
        updateNexusCD();
      } catch (e) { toast('err', e.message); loadAdStatus(); }
    }

    function openCrate(data) {
      openM('MX');
      I('MX-SPIN').style.display = 'block';
      I('MX-RESULT').style.display = 'none';

      const strip = I('MX-STRIP');
      const pool = [
        { rarity: 'common', label: '200 Coins', icon: 'ic-cart' },
        { rarity: 'rare', label: '1H VIP', icon: 'ic-shield' },
        { rarity: 'epic', label: '6H VIP', icon: 'ic-shield' },
        { rarity: 'common', label: '300 XP', icon: 'ic-bolt' },
        { rarity: 'rare', label: '1000 Coins', icon: 'ic-cart' }
      ];

      // Build strip
      let html = '';
      for (let i = 0; i < 40; i++) {
        const it = pool[Math.floor(Math.random() * pool.length)];
        html += `<div class="slot-item rarity-${it.rarity}"><svg class="ic" style="width:2rem;height:2rem"><use href="#${it.icon}"/></svg><span>${it.label}</span></div>`;
      }
      // Add final result
      html += `<div class="slot-item rarity-${data.rarity}"><svg class="ic" style="width:2rem;height:2rem"><use href="#${data.icon}"/></svg><span>${data.label}</span></div>`;
      strip.style.transition = 'none';
      strip.style.top = '0px';
      strip.innerHTML = html;

      setTimeout(() => {
        strip.style.transition = 'top 4s cubic-bezier(0.1, 0.7, 0.3, 1)';
        strip.style.top = `-${(40) * 120}px`;
      }, 50);

      setTimeout(() => {
        I('MX-SPIN').style.display = 'none';
        I('MX-RESULT').style.display = 'block';
        I('MX-ICON').innerHTML = `<svg class="ic" style="width:4rem;height:4rem;color:inherit"><use href="#${data.icon}"/></svg>`;
        I('MX-LABEL').textContent = data.label;
        I('MX-RARITY').textContent = data.rarity;
        I('MX-CARD').className = 'reward-card rarity-' + data.rarity;
        loadAdHistory();
      }, 4500);
    }
    function bwT(t) {
      console.log('bwT called:', t);
      const m = { ranks: STORE.bw_ranks, coins: STORE.bw_coins, free: STORE.bw_free };
      rS('S-BW', m[t]);
      document.querySelectorAll('#BW-T .tab').forEach((b, i) => b.classList.toggle('ON', ['ranks', 'coins', 'free'][i] === t));
    }
    function rS(id, items) {
      const el = I(id); if (!el) return;
      el.innerHTML = items.map(it => `<div class="sc" style="--cc:${it.cc}">
    <div class="sc-ic">${it.icon}</div>
    <div class="sc-nm" style="color:${it.cc}">${it.name}</div>
    <div class="sc-pr">${it.price === 0 ? 'FREE' : '$' + it.price.toFixed(2)}</div>
    <ul class="sc-pk">${it.perks.map(p => `<li>${p}</li>`).join('')}</ul>
    <button class="btn ${it.price === 0 ? 'bgrn' : ''}" style="width:100%;margin-top:auto"
      onclick="${it.price === 0 ? `GO('store-free')` : `addCart('${it.id}','${it.name.replace(/'/g, "\\'")}',${it.price},'${it.gm}')`}"><svg class="ic"><use href="${it.price === 0 ? '#ic-play' : '#ic-cart'}"/></svg>  ${it.price === 0 ? 'Watch Ads' : 'Add to Cart'}</button>
  </div>`).join('');
    }

    // ════════════════════════════════════════════════════
    // CART
    // ════════════════════════════════════════════════════
    async function addCart(id, name, price, gm) {
      if (!ME) { openM('ML'); toast('err', 'Log in to add items.'); return; }
      try {
        await API('/api/cart', { method: 'POST', body: { item_id: id, item_name: name, item_price: price, gamemode: gm } });
        CART_N += 1;
        const b = I('CBG');
        if (b) { b.style.display = 'flex'; b.textContent = CART_N; }
        toast('ok', `✓ ${name} added to cart!`);
      }
      catch (e) { toast('err', e.message); }
    }
    async function updateCart() {
      try {
        const d = await API('/api/cart'); CART_N = d.length;
        const b = I('CBG'); if (b) { b.style.display = CART_N ? 'flex' : 'none'; b.textContent = CART_N; }
      }
      catch (e) { }
    }
    async function renderCart() {
      if (!ME) { GO('home'); openM('ML'); return; }
      const el = I('CART-L'), se = I('CART-TOT');
      el.innerHTML = '<div class="ld"><div class="sp"></div></div>';
      try {
        const d = await API('/api/cart');
        if (!d.length) { el.innerHTML = '<div class="empty">Cart is empty.<br><br><button class="btn" onclick="GO(\'store\')">Browse Store</button></div>'; se.innerHTML = ''; return; }
        el.innerHTML = d.map(it => `<div class="p" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
      <div><div style="font-weight:600">${esc(it.item_name)}</div>
        <div style="font-size:.72rem;color:var(--tx2)">${it.gamemode}</div></div>
      <div style="display:flex;align-items:center;gap:9px">
        <span style="color:var(--g);font-weight:700">$${parseFloat(it.item_price).toFixed(2)}</span>
        <button class="btn bred bxs" onclick="remCart(${it.id})"><svg class="ic"><use href="#ic-x"/></svg></button>
      </div>
    </div>`).join('');
        const total = d.reduce((s, i) => s + parseFloat(i.item_price), 0);
        se.innerHTML = `<div class="p" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:9px">
      <span><span style="color:var(--tx2)">Total: </span>
        <span style="font-size:1.3rem;font-weight:800;font-family:'Oxanium',sans-serif;color:var(--g)">$${total.toFixed(2)}</span></span>
      <div style="display:flex;gap:7px">
        <button class="bto bsm" onclick="clearCart()">🗑 Clear</button>
        <button class="btn" onclick="doCheckout()">💳 Checkout via Tebex</button>
      </div>
    </div>`;
      } catch (e) { el.innerHTML = '<div class="empty" style="color:var(--r2)">Could not load cart.</div>'; }
    }
    async function remCart(id) {
      try {
        await API(`/api/cart/${id}`, { method: 'DELETE' });
        CART_N = Math.max(0, CART_N - 1);
        const b = I('CBG');
        if (b) { b.style.display = CART_N ? 'flex' : 'none'; b.textContent = CART_N; }
        toast('ok', 'Item removed from cart.');
        renderCart();
      } catch (e) { toast('err', e.message); }
    }
    async function clearCart() {
      if (!confirm('Clear cart?')) return;
      try {
        await API('/api/cart/clear', { method: 'DELETE' });
        CART_N = 0;
        const b = I('CBG');
        if (b) b.style.display = 'none';
        I('CART-L').innerHTML = '<div class="empty">Cart is empty.<br><br><button class="btn" onclick="GO(\'store\')">Browse Store</button></div>';
        I('CART-TOT').innerHTML = '';
        toast('ok', 'Cart cleared.');
      } catch (e) { toast('err', e.message); }
    }

    async function doCheckout() {
      try {
        // NEW ARCHITECTURE: Create ticket directly in DB first
        // This works for both logged-in users and guests
        const r = await API('/api/store/checkout', {
          method: 'POST',
          body: { email: ME ? ME.email : (prompt("Enter your email for order tracking:") || "") }
        });

        if (!r.ticket_id) throw new Error("Could not create order ticket.");

        // Success! Redirect to the main site ticket chat immediately.
        // We use the Deep Linking structure to open the specific ticket.
        const mainSite = window.location.hostname.includes('hellcore.net') ? 'https://hellcore.net' : window.location.origin;
        window.location.href = `${mainSite}/tickets?id=${r.ticket_id}`;
      } catch (e) {
        toast('err', 'Checkout failed: ' + e.message);
        console.error("[Checkout] Error:", e);
      }
    }

    // ════════════════════════════════════════════════════
    // PROFILE
    // ════════════════════════════════════════════════════
    function rewardTierClass(name) {
      const v = String(name || '').toLowerCase();
      if (v.includes('gold')) return 'gold';
      if (v.includes('silver')) return 'silver';
      if (v.includes('bronze')) return 'bronze';
      return 'unranked';
    }

    function rewardErrorMessage(err, fallback) {
      const code = err?.data?.code;
      const map = {
        missing_fingerprint: 'This browser tab could not start a tracked ad session. Refresh and try again.',
        daily_limit_reached: 'You reached the 20 ads per day limit. Try again after the daily reset.',
        cooldown_active: 'Your cooldown is still active. Wait for the timer to finish and try again.',
        active_tab_conflict: 'Another tab already has an active ad session. Finish that one first.',
        ad_already_active: 'You already have an ad in progress in this tab.',
        too_fast: 'The ad ended too quickly, so no XP was awarded.',
        token_replayed: 'That ad session was already used.',
        invalid_proof: 'We could not verify the ad completion proof.',
        token_expired: 'That ad session expired. Start a fresh one.',
        ip_rate_limited: 'Too many ad rewards came from this connection in the last hour.',
        insufficient_xp: 'You do not have enough XP for that rank yet.',
        already_owned: 'You already own this rank.',
        lower_tier_owned: 'You cannot downgrade to a lower-tier rank.',
      };
      return map[code] || fallback || 'Something went wrong. Please try again.';
    }

    function getRewardDeviceId() {
      const key = 'hc_reward_device_id';
      let value = localStorage.getItem(key);
      if (!value) {
        value = uid();
        localStorage.setItem(key, value);
      }
      return value;
    }

    function getRewardTabId() {
      const key = 'hc_reward_tab_id';
      let value = sessionStorage.getItem(key);
      if (!value) {
        value = uid();
        sessionStorage.setItem(key, value);
      }
      return value;
    }

    function getAdSessionFingerprint() {
      const fingerprint = `${getRewardTabId()}:${getRewardDeviceId()}`;
      localStorage.setItem('hc_ad_session_fingerprint', fingerprint);
      return fingerprint;
    }

    async function sha256Hex(value) {
      const bytes = new TextEncoder().encode(value);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function countdownSeconds(targetIso) {
      if (!targetIso) return 0;
      const diff = Math.ceil((new Date(targetIso).getTime() - Date.now()) / 1000);
      return diff > 0 ? diff : 0;
    }

    function fmtCountdown(totalSeconds) {
      const seconds = Math.max(0, Number(totalSeconds) || 0);
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
      const ss = String(seconds % 60).padStart(2, '0');
      return `${mm}:${ss}`;
    }

    function fmtDT(value) {
      try {
        return new Date(value).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        return value || '';
      }
    }

    function animateValue(el, from, to, suffix = '') {
      if (!el) return;
      const start = Number.isFinite(from) ? from : 0;
      const end = Number.isFinite(to) ? to : 0;
      const startedAt = performance.now();
      const duration = 800;

      function tick(now) {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = `${Math.round(start + (end - start) * eased).toLocaleString()}${suffix}`;
        if (progress < 1) requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    }

    function rewardDashboardSkeleton() {
      return `
        <div class="xp-dashboard-grid">
          <div>
            <div class="skeleton" style="height:14px;width:110px;margin-bottom:12px"></div>
            <div class="skeleton" style="height:42px;width:70%;margin-bottom:12px"></div>
            <div class="skeleton" style="height:15px;width:88%;margin-bottom:18px"></div>
            <div class="skeleton" style="height:56px;width:180px;margin-bottom:14px"></div>
            <div class="skeleton" style="height:12px;width:100%;margin-bottom:12px"></div>
            <div class="dashboard-metrics">
              <div class="skeleton" style="height:92px"></div>
              <div class="skeleton" style="height:92px"></div>
              <div class="skeleton" style="height:92px"></div>
            </div>
          </div>
          <div class="skeleton" style="height:320px;border-radius:22px"></div>
        </div>
      `;
    }

    function rewardStoreSkeleton() {
      return Array.from({ length: 3 }).map(() => `
        <div class="rank-tier-card">
          <div class="skeleton" style="height:22px;width:50%"></div>
          <div class="skeleton" style="height:14px;width:34%"></div>
          <div class="skeleton" style="height:14px;width:100%"></div>
          <div class="skeleton" style="height:14px;width:92%"></div>
          <div class="skeleton" style="height:14px;width:86%"></div>
          <div class="skeleton" style="height:44px;width:100%;margin-top:auto"></div>
        </div>
      `).join('');
    }

    function rewardLogsSkeleton() {
      return `
        <div class="skeleton" style="height:170px;margin-bottom:14px"></div>
        <div class="skeleton" style="height:210px"></div>
      `;
    }

    async function refreshRewardState() {
      const [xp, ranks] = await Promise.all([
        API('/api/user/xp'),
        API('/api/store/ranks')
      ]);
      XP_STATE = xp;
      STORE_RANKS_CACHE = ranks;
      return { xp, ranks };
    }

    function renderRewardDashboard(previousXp = null) {
      const el = I('XP-DASHBOARD');
      if (!el) return;
      const rank = XP_STATE.rank;
      const tierClass = rewardTierClass(rank?.name);
      const nextRank = STORE_RANKS_CACHE.find(r => (rank ? r.tier_order > rank.tier_order : true));
      const progressPct = nextRank ? Math.max(0, Math.min(100, (XP_STATE.current_xp / Math.max(1, nextRank.xp_cost)) * 100)) : 100;
      const cooldownLeft = countdownSeconds(XP_STATE.next_ad_available_at);
      const active = ACTIVE_AD_SESSION;
      const serverLock = !!XP_STATE.active_ad_in_progress && !active;
      const activeRemaining = active ? Math.max(0, active.remainingSeconds || 0) : 0;
      const adsWatched = XP_STATE.daily_ads_watched || 0;
      const adsRemaining = XP_STATE.ads_remaining_today || 0;
      const buttonDisabled = !!active || serverLock || cooldownLeft > 0 || adsRemaining <= 0;
      const buttonLabel = active
        ? `Watching Ad ${fmtCountdown(activeRemaining)}`
        : serverLock
          ? 'Ad Session Locked'
        : cooldownLeft > 0
          ? `Next Ad In ${fmtCountdown(cooldownLeft)}`
          : adsRemaining <= 0
            ? 'Daily Limit Reached'
            : 'Watch Ad';

      el.innerHTML = `
        <div class="xp-dashboard-grid">
          <div>
            <div class="dash-eyebrow"><span class="dash-eyebrow-dot"></span> XP Dashboard</div>
            <div class="dash-head">
              <div>
                <div class="dash-title">${esc(ME?.username || 'Player')}</div>
                <div class="dash-copy">Earn XP from rewarded ads, keep the remainder after rank purchases, and climb through the rank tiers at your own pace.</div>
              </div>
              <div class="dash-rank-pill ${tierClass}">${esc(rank?.name || 'Unranked')}</div>
            </div>
            <div class="xp-stat-block">
              <div class="xp-stat-line">
                <span class="xp-stat-label">Current XP</span>
                <span class="xp-stat-label">${nextRank ? `${esc(nextRank.name)} at ${nextRank.xp_cost} XP` : 'Top tier reached'}</span>
              </div>
              <div class="xp-value" id="DASH-XP-VALUE">0</div>
              <div class="progress-shell">
                <div class="progress-meta">
                  <span>${rank ? `Current rank: ${esc(rank.name)}` : 'No rank owned yet'}</span>
                  <span>${nextRank ? `${Math.max(0, nextRank.xp_cost - XP_STATE.current_xp)} XP to go` : 'All ranks unlocked'}</span>
                </div>
                <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
              </div>
            </div>
            <div class="dashboard-metrics">
              <div class="metric-card">
                <span>Ads Watched Today</span>
                <strong>${adsWatched}/20</strong>
              </div>
              <div class="metric-card">
                <span>Ads Remaining</span>
                <strong>${adsRemaining}</strong>
              </div>
              <div class="metric-card">
                <span>Cooldown</span>
                <strong>${active ? fmtCountdown(activeRemaining) : (cooldownLeft ? fmtCountdown(cooldownLeft) : 'Ready')}</strong>
              </div>
            </div>
          </div>
          <div class="ad-panel">
            <div class="ad-panel-head">
              <div>
                <div class="ad-panel-title">Rewarded Ad Queue</div>
                <div style="color:var(--tx2);font-size:.84rem">${adsWatched}/20 ads watched today</div>
              </div>
              <div class="ad-chip">${active ? 'IN PROGRESS' : (serverLock ? 'LOCKED' : (cooldownLeft ? 'COOLDOWN' : 'READY'))}</div>
            </div>
            <div style="font-size:1.7rem;font-family:'Outfit',sans-serif">+10 to +50 XP</div>
            <div style="color:var(--tx2);line-height:1.6">Server-side checks enforce the daily cap, cooldown, timing window, tab lock, and one-time token validation before XP is awarded.</div>
            <div class="ad-progress"><div id="DASH-AD-PROGRESS" style="width:${active ? `${Math.min(100, ((active.totalSeconds - activeRemaining) / active.totalSeconds) * 100)}%` : '0%'}"></div></div>
            <button class="btn" id="DASH-WATCH-BTN" ${buttonDisabled ? 'disabled' : ''} onclick="watchRewardAd()">${buttonLabel}</button>
            <div class="ad-footnote">${active ? 'Keep this tab active while the ad finishes.' : (serverLock ? 'A previous ad session is still active on the server, so new requests stay blocked until it expires.' : (cooldownLeft ? `Next ad available in ${fmtCountdown(cooldownLeft)}.` : 'When the ad completes, your XP reward lands instantly and is logged server-side.'))}</div>
          </div>
        </div>
      `;

      animateValue(I('DASH-XP-VALUE'), previousXp == null ? XP_STATE.current_xp : previousXp, XP_STATE.current_xp, ' XP');
    }

    async function loadRewardDashboard(previousXp = null) {
      const el = I('XP-DASHBOARD');
      if (!el || !ME) return;
      el.innerHTML = rewardDashboardSkeleton();
      try {
        const before = previousXp == null ? XP_STATE.current_xp : previousXp;
        await refreshRewardState();
        renderRewardDashboard(before);
        if (DASHBOARD_TIMER) clearInterval(DASHBOARD_TIMER);
        DASHBOARD_TIMER = setInterval(() => {
          if (!I('XP-DASHBOARD')) return;
          if (ACTIVE_AD_SESSION || countdownSeconds(XP_STATE.next_ad_available_at) > 0) renderRewardDashboard(XP_STATE.current_xp);
        }, 1000);
      } catch (e) {
        el.innerHTML = `<div class="reward-empty">${esc(rewardErrorMessage(e, 'We could not load your XP dashboard right now.'))}</div>`;
      }
    }

    function renderRewardStore() {
      const grid = I('STORE-RANKS');
      if (!grid) return;
      I('STORE-XP-BALANCE').textContent = `${Number(XP_STATE.current_xp || 0).toLocaleString()} XP`;
      I('STORE-EMPTY').style.display = XP_STATE.current_xp > 0 ? 'none' : '';
      grid.innerHTML = STORE_RANKS_CACHE.map(rank => {
        const needed = Math.max(0, rank.xp_cost - XP_STATE.current_xp);
        const tierClass = rewardTierClass(rank.name);
        const locked = !rank.affordable && !rank.already_purchased;
        const stateLabel = rank.is_current ? 'Current Rank' : rank.already_purchased ? 'Owned' : locked ? 'Locked' : 'Unlocked';
        const buttonText = rank.is_current
          ? 'Equipped'
          : rank.already_purchased
            ? 'Already Owned'
            : rank.affordable
              ? `Buy for ${rank.xp_cost} XP`
              : `Need ${needed} More XP`;
        return `
          <div class="rank-tier-card ${tierClass} ${rank.affordable ? 'affordable' : ''} ${rank.is_current ? 'current' : ''} ${locked ? 'locked' : ''}">
            <div class="rank-tier-top">
              <div>
                <div class="rank-tier-name">${esc(rank.name)}</div>
                <div class="rank-tier-cost">${rank.xp_cost.toLocaleString()} XP</div>
              </div>
              <div class="rank-state">${stateLabel}</div>
            </div>
            <ul class="rank-perks">
              ${rank.perks.map(perk => `<li>${esc(perk)}</li>`).join('')}
            </ul>
            <button class="btn" ${rank.is_current || rank.already_purchased || !rank.affordable ? 'disabled' : ''} onclick="openRankPurchaseModal(${rank.id})">${buttonText}</button>
          </div>
        `;
      }).join('');
    }

    async function loadRewardStore() {
      const grid = I('STORE-RANKS');
      if (!grid || !ME) return;
      grid.innerHTML = rewardStoreSkeleton();
      try {
        await refreshRewardState();
        renderRewardStore();
      } catch (e) {
        grid.innerHTML = `<div class="reward-empty">${esc(rewardErrorMessage(e, 'We could not load the rank store right now.'))}</div>`;
      }
    }

    function openRankPurchaseModal(rankId) {
      const rank = STORE_RANKS_CACHE.find(item => Number(item.id) === Number(rankId));
      if (!rank) return;
      PENDING_RANK_PURCHASE = rank;
      I('RANK-BUY-BODY').innerHTML = `
        <div style="font-size:1.15rem;font-weight:700;color:var(--tx);margin-bottom:6px">${esc(rank.name)}</div>
        <div style="margin-bottom:10px">Spend <strong>${rank.xp_cost} XP</strong> to unlock this tier. Your remaining XP carries over after the purchase.</div>
        <div style="color:var(--tx3);font-size:.82rem">Perks: ${esc(rank.perks.join(' • '))}</div>
      `;
      I('RANK-BUY-CONFIRM').disabled = false;
      openM('MRANKBUY');
    }

    async function confirmRankPurchase() {
      if (!PENDING_RANK_PURCHASE) return;
      const previousXp = XP_STATE.current_xp;
      I('RANK-BUY-CONFIRM').disabled = true;
      try {
        await API('/api/store/purchase', { method: 'POST', body: { rank_id: PENDING_RANK_PURCHASE.id } });
        closeM('MRANKBUY');
        toast('ok', `${PENDING_RANK_PURCHASE.name} unlocked!`);
        fireConfetti();
        PENDING_RANK_PURCHASE = null;
        await refreshRewardState();
        renderRewardStore();
        renderRewardDashboard(previousXp);
      } catch (e) {
        I('RANK-BUY-CONFIRM').disabled = false;
        toast('err', rewardErrorMessage(e, 'We could not complete that purchase.'));
      }
    }

    function fireConfetti() {
      const root = I('CONFETTI');
      if (!root) return;
      root.innerHTML = '';
      ['#f97316', '#f59e0b', '#fde047', '#e5e7eb'].forEach((color, colorIdx) => {
        for (let i = 0; i < 18; i++) {
          const piece = document.createElement('div');
          piece.className = 'confetti-piece';
          piece.style.background = color;
          piece.style.left = `${5 + Math.random() * 90}%`;
          piece.style.top = `${-10 - Math.random() * 20}px`;
          piece.style.setProperty('--x-shift', `${(Math.random() - 0.5) * (180 + colorIdx * 35)}px`);
          piece.style.animationDelay = `${Math.random() * 160}ms`;
          root.appendChild(piece);
        }
      });
      setTimeout(() => { root.innerHTML = ''; }, 1800);
    }

    async function watchRewardAd() {
      if (!ME) {
        openM('ML');
        toast('err', 'Please log in to earn XP from ads.');
        return;
      }
      if (ACTIVE_AD_SESSION) return;
      if (XP_STATE.active_ad_in_progress) {
        toast('err', 'An earlier ad session is still locked on the server. Please wait for it to clear.');
        return;
      }
      const cooldownLeft = countdownSeconds(XP_STATE.next_ad_available_at);
      if (cooldownLeft > 0) {
        toast('err', `Your next ad unlocks in ${fmtCountdown(cooldownLeft)}.`);
        return;
      }
      if ((XP_STATE.ads_remaining_today || 0) <= 0) {
        toast('err', 'You reached the ad cap for today.');
        return;
      }

      try {
        const res = await API('/api/ads/request', {
          method: 'POST',
          body: { session_fingerprint: getAdSessionFingerprint() }
        });
        ACTIVE_AD_SESSION = {
          token: res.ad_token,
          totalSeconds: Number(res.ad?.duration_seconds || 25),
          remainingSeconds: Number(res.ad?.duration_seconds || 25),
        };
        renderRewardDashboard(XP_STATE.current_xp);
        ACTIVE_AD_INTERVAL = setInterval(async () => {
          if (!ACTIVE_AD_SESSION) return;
          ACTIVE_AD_SESSION.remainingSeconds -= 1;
          renderRewardDashboard(XP_STATE.current_xp);
          if (ACTIVE_AD_SESSION.remainingSeconds <= 0) {
            clearInterval(ACTIVE_AD_INTERVAL);
            ACTIVE_AD_INTERVAL = null;
            await finalizeRewardAd();
          }
        }, 1000);
      } catch (e) {
        toast('err', rewardErrorMessage(e, 'We could not start an ad right now.'));
        await loadRewardDashboard(XP_STATE.current_xp);
      }
    }

    async function finalizeRewardAd() {
      if (!ACTIVE_AD_SESSION) return;
      const token = ACTIVE_AD_SESSION.token;
      const previousXp = XP_STATE.current_xp;
      try {
        const completion_proof = await sha256Hex(token + AD_COMPLETION_SECRET);
        const res = await API('/api/ads/complete', {
          method: 'POST',
          body: { ad_token: token, completion_proof }
        });
        ACTIVE_AD_SESSION = null;
        toast('ok', `+${res.xp_earned} XP earned!`);
        await refreshRewardState();
        renderRewardDashboard(previousXp);
        if (I('STORE-RANKS')?.closest('.pg')?.classList.contains('ON')) renderRewardStore();
      } catch (e) {
        ACTIVE_AD_SESSION = null;
        toast('err', rewardErrorMessage(e, 'The ad could not be verified.'));
        await loadRewardDashboard(previousXp);
      }
    }

    async function loadRewardLogs() {
      const el = I('ADM-RW-LOGS');
      if (!el || !isAdmin()) return;
      el.innerHTML = rewardLogsSkeleton();
      try {
        const query = new URLSearchParams();
        if (V('ADM-RW-USER').trim()) query.set('user', V('ADM-RW-USER').trim());
        if (V('ADM-RW-DATE').trim()) query.set('date', V('ADM-RW-DATE').trim());
        const data = await API(`/api/admin/reward-logs${query.toString() ? `?${query}` : ''}`);
        const purchases = data.rank_purchases || [];
        const ads = data.ad_watches || [];
        el.innerHTML = `
          <div class="adm-table-wrap" style="margin-bottom:14px">
            <table class="adm-table">
              <thead><tr><th>Rank Purchases</th><th>User</th><th>Rank</th><th>XP Spent</th></tr></thead>
              <tbody>
                ${purchases.length ? purchases.map(row => `
                  <tr>
                    <td>${fmtDT(row.created_at)}</td>
                    <td><strong>${esc(row.username)}</strong></td>
                    <td>${esc(row.rank_name)}</td>
                    <td>${row.xp_spent}</td>
                  </tr>
                `).join('') : '<tr><td colspan="4">No rank purchases matched these filters.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead><tr><th>Ad Watches</th><th>User</th><th>Status</th><th>Duration</th><th>XP</th></tr></thead>
              <tbody>
                ${ads.length ? ads.map(row => `
                  <tr style="${row.suspicious ? 'background:rgba(239,68,68,0.08)' : ''}">
                    <td>
                      <div>${fmtDT(row.started_at)}</div>
                      <div style="font-size:.68rem;color:var(--tx3)">${row.ip_address ? esc(row.ip_address) : 'IP hidden'}</div>
                    </td>
                    <td><strong>${esc(row.username)}</strong></td>
                    <td>
                      <span class="adm-badge ${row.status === 'completed' ? 'open' : 'closed'}">${esc(row.status)}</span>
                      ${row.suspicious ? '<div style="font-size:.68rem;color:#fca5a5;margin-top:4px">Flagged</div>' : ''}
                      ${row.failure_reason ? `<div style="font-size:.68rem;color:var(--tx3);margin-top:4px">${esc(row.failure_reason)}</div>` : ''}
                    </td>
                    <td>${row.duration_seconds || 0}s</td>
                    <td>${row.xp_awarded || 0}</td>
                  </tr>
                `).join('') : '<tr><td colspan="5">No ad watches matched these filters.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      } catch (e) {
        el.innerHTML = `<div class="reward-empty">${esc(rewardErrorMessage(e, 'We could not load the reward logs.'))}</div>`;
      }
    }

    function watchAd() { return watchRewardAd(); }

    function loadProfile() {
      if (!ME) return;
      loadRewardDashboard(XP_STATE.current_xp);
      I('PR-NAME').textContent = ME.username;
      I('PR-EMAIL').textContent = ME.email;
      I('PR-MC').textContent = ME.mc_username || 'Not linked';
      I('PR-UNLINK-BTN').style.display = ME.mc_username ? 'inline-block' : 'none';
      I('PR-ROLE').innerHTML = `<span class="rb rb-${ME.role}">${ME.role.toUpperCase()}</span>`;

      if (ME.mc_username) I('PR-HEAD').src = `/api/skin/head/${enc(ME.mc_username)}/78`;
      API(`/api/stats/${enc(ME.username)}`).then(d => {
        const e = d.economy || {};
        I('PR-ECO').innerHTML = `<div style="display:flex;gap:18px">
      <div>💛 <strong>${e.server_gold || 0}</strong> <span style="color:var(--tx2);font-size:.76rem">Gold</span></div>
      <div>⚪ <strong>${e.server_iron || 0}</strong> <span style="color:var(--tx2);font-size:.76rem">Iron</span></div>
    </div>`;
        const rk = I('PR-RANKS');
        if (Object.keys(d.ranks || {}).length) {
          rk.innerHTML = Object.entries(d.ranks).map(([m, r]) =>
            `<div style="margin-bottom:4px">${mIC(m)} ${cap(m)}: <span class="rb rb-${rbcls(r)}">${r.toUpperCase()}</span></div>`
          ).join('');
        } else { rk.innerHTML = '<div style="color:var(--tx2);font-size:.8rem">No ranks yet.</div>'; }
      }).catch(() => { });
    }

    async function doUnlink() {
      if (!confirm('Are you sure you want to unlink your Minecraft account? You will lose access to support tickets and restricted features.')) return;
      try {
        await API('/api/auth/unlink', { method: 'POST' });
        toast('ok', 'Account unlinked successfully.');
        reInitPermissions(); // Refreshes ME and UI
      } catch (e) { toast('err', e.message); }
    }

    async function loadInv() {
      const el = I('PR-INV-L'); if (!el || !ME) return;
      try {
        const d = await API('/api/inventory');
        if (!d.length) { el.innerHTML = '<div class="empty">No items in inventory.</div>'; return; }
        el.innerHTML = `<div class="g3">${d.map(it => `<div class="p" style="text-align:center">
      <div style="font-size:1.5rem;margin-bottom:5px">${it.item_type === 'rank' ? '👑' : '<svg class="ic"><use href="#ic-gift"/></svg> '}</div>
      <div style="font-weight:700;color:var(--g)">${esc(it.item_name)}</div>
      <div style="font-size:.7rem;color:var(--tx2)">${it.gamemode} · ${fmtD(it.created_at)}</div>
      ${it.gifted_by ? '<div style="font-size:.66rem;color:var(--tx2);margin-top:2px"><svg class="ic"><use href="#ic-gift"/></svg>  Gifted</div>' : ''}
    </div>`).join('')}</div>`;
      } catch (e) { el.innerHTML = '<div class="empty">Could not load.</div>'; }
    }
    async function loadGifts() {
      const el = I('PGIFTS'); if (!el || !ME) return;
      try {
        const d = await API('/api/gifts/pending');
        if (!d.length) { el.innerHTML = '<div class="empty">No pending gifts.</div>'; return; }
        el.innerHTML = d.map(g => `<div class="p" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
      <div><div style="font-weight:600"><svg class="ic"><use href="#ic-gift"/></svg>  ${esc(g.item_name)}</div>
        <div style="font-size:.72rem;color:var(--tx2)">From: ${esc(g.from_name)} · ${g.gamemode}</div></div>
      <button class="btn bgrn bsm" onclick="claimGift(${g.id})">Claim</button>
    </div>`).join('');
      } catch (e) { }
    }
    async function sendGift() {
      const to = V('GFT-TO'), it = V('GFT-IT'), gm = V('GFT-GM');
      if (!to) { toast('err', 'Enter recipient username'); return; }
      try {
        await API('/api/gifts/send', { method: 'POST', body: { to_username: to, item_name: it, item_type: 'rank', gamemode: gm } });
        toast('ok', `Gift sent to ${to}!`); SV('GFT-TO', '');
      }
      catch (e) { toast('err', e.message); }
    }
    async function claimGift(id) {
      try { await API(`/api/gifts/${id}/claim`, { method: 'POST' }); toast('ok', 'Gift claimed!'); loadGifts(); loadInv(); }
      catch (e) { toast('err', e.message); }
    }

    // ════════════════════════════════════════════════════
    // STAFF & ABOUT
    // ════════════════════════════════════════════════════
    async function loadAbout() {
      const el = I('ABOUT-S'); if (!el) return;
      try {
        const d = await API('/api/staff');
        if (!d.length) { el.innerHTML = '<div class="empty">No staff listed.</div>'; return; }
        // ★ Staff avatars via Flask proxy
        el.innerHTML = `<div class="g4">${d.map(s => `<div style="text-align:center">
      <img src="/api/skin/head/${enc(s.mc_username || s.username)}/46"
        width="46" height="46" style="image-rendering:pixelated;border-radius:5px;margin-bottom:6px"
        onerror="this.style.display='none'">
      <div style="font-weight:600;font-size:.85rem">${esc(s.username)}</div>
      <span class="rb rb-${s.role}">${s.role.toUpperCase()}</span>
    </div>`).join('')}</div>`;
      } catch (e) { el.innerHTML = '<div class="empty">Could not load.</div>'; }
    }
    async function loadStaff() {
      const el = I('STAFF-PNL'); if (!el || !isStaff()) { if (el) el.innerHTML = '<div class="empty" style="color:var(--r2)">Access denied.</div>'; return; }
      try {
        const tix = await API('/api/tickets');
        const open = tix.filter(t => t.status === 'open');
        el.innerHTML = `<div class="p"><div class="stitle">Open Tickets (${open.length})</div>
      ${open.length ? open.map(t => `<div style="border-bottom:1px solid var(--bd);padding:8px 0;display:flex;justify-content:space-between;cursor:pointer"
        onclick="GO('tickets');setTimeout(()=>openTix(${t.id}),100)">
        <div><div style="font-weight:600">${esc(t.title)}</div>
          <div style="font-size:.72rem;color:var(--tx2)">${t.category} · By ${esc(t.author_name)}</div></div>
        <span style="color:var(--grn);font-size:.75rem;font-weight:700">OPEN</span>
      </div>`).join('') : '<div class="empty">No open tickets! 🎉</div>'}
    </div>`;
      } catch (e) { el.innerHTML = '<div class="empty" style="color:var(--r2)">Access denied.</div>'; }
    }

    // ════════════════════════════════════════════════════
    // ADMIN
    // ════════════════════════════════════════════════════
    function adT(t) {
      ['ADM-U', 'ADM-S', 'ADM-R', 'ADM-E'].forEach((id, i) => I(id).style.display = ['users', 'stats', 'ranks', 'eco'][i] === t ? '' : 'none');
      document.querySelectorAll('#pg-admin .tab').forEach((b, i) => b.classList.toggle('ON', ['users', 'stats', 'ranks', 'eco'][i] === t));
    }
    async function loadAdmU() {
      const el = I('ADM-TBL'); if (!el) return;
      try {
        const d = await API('/api/admin/users');
        el.innerHTML = `<div style="overflow-x:auto"><table class="dtbl">
      <thead><tr><th>Username</th><th>Email</th><th>MC Name</th><th>Role</th><th>Joined</th><th>Set Role</th></tr></thead>
      <tbody>${d.map(u => `<tr>
        <td style="font-weight:600">${esc(u.username)}</td>
        <td style="font-size:.75rem;color:var(--tx2)">${esc(u.email)}</td>
        <td>${esc(u.mc_username || '—')}</td>
        <td><span class="rb rb-${u.role}">${u.role}</span></td>
        <td style="font-size:.7rem;color:var(--tx2)">${fmtD(u.created_at)}</td>
        <td><select onchange="aRole(${u.id},this.value)"
          style="background:rgba(0,0,0,.5);border:1px solid var(--bd);color:var(--tx);padding:2px 5px;border-radius:3px;font-size:.7rem">
          ${['player', 'helper', 'mod', 'dev', 'admin', 'owner', 'founder', 'youtube', 'famous'].map(r =>
          `<option value="${r}"${r === u.role ? ' selected' : ''}>${r}</option>`
        ).join('')}
        </select></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
      } catch (e) { el.innerHTML = '<div class="empty" style="color:var(--r2)">Admin access required.</div>'; }
    }
    async function aStats() { try { await API('/api/admin/setstats', { method: 'POST', body: { username: V('AS-U'), gamemode: V('AS-M'), kills: +V('AS-K'), deaths: +V('AS-D'), wins: +V('AS-W'), coins: +V('AS-C') } }); toast('ok', 'Stats saved!'); } catch (e) { toast('err', e.message); } }
    async function aRank() { try { await API('/api/admin/setrank', { method: 'POST', body: { username: V('AR-U'), gamemode: V('AR-M'), rank: V('AR-R') } }); toast('ok', 'Rank set!'); } catch (e) { toast('err', e.message); } }
    async function aEco() { try { await API('/api/admin/seteco', { method: 'POST', body: { username: V('AE-U'), gold: +V('AE-G'), iron: +V('AE-I') } }); toast('ok', 'Economy updated!'); } catch (e) { toast('err', e.message); } }

    // ════════════════════════════════════════════════════
    // TAB SWITCHES
    // ════════════════════════════════════════════════════
    function plT(t) {
      ['T-STATS', 'T-COMPARE', 'T-LB', 'T-GUILD'].forEach((id, i) => I(id).style.display = ['stats', 'compare', 'lb', 'guild'][i] === t ? '' : 'none');
      document.querySelectorAll('#pg-players .tab').forEach((b, i) => b.classList.toggle('ON', ['stats', 'compare', 'lb', 'guild'][i] === t));
      if (t === 'lb') loadLB();
      if (t === 'stats') { renderRecentSearches(); loadShowcase(); }
    }

    // ── Guild Lookup
    async function loadGuild() {
      const uname = V('GLD-IN').trim(); if (!uname) return;
      const el = I('GLD-RES'); const btn = I('GLD-BTN');
      if (btn) btn.disabled = true;
      el.innerHTML = '<div class="ld"><div class="sp"></div>Finding guild...</div>';
      try {
        const r = await fetch(`/api/bwstats/${enc(uname)}`); const d = await r.json();
        if (!d.success || !d.player) { el.innerHTML = '<div class="empty">Player not found.</div>'; if (btn) btn.disabled = false; return; }
        const p = d.player;
        const g = p.guild;
        if (!g) { el.innerHTML = `<div class="empty"><svg class="ic" style="margin-right:8px"><use href="#ic-shield"/></svg>${esc(p.username)} is not in a guild.</div>`; if (btn) btn.disabled = false; return; }
        const lvl = g.level || {};
        const xpPct = lvl.nextCost > 0 ? Math.min((lvl.xp || 0) / lvl.nextCost * 100, 100) : 0;
        el.innerHTML = `
      <div class="bw-header" style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:center;width:72px;height:72px;background:rgba(255,81,47,0.1);border:1px solid rgba(255,81,47,0.2);border-radius:12px;flex-shrink:0">
          <svg class="ic" style="width:2rem;height:2rem;color:var(--g)"><use href="#ic-shield"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span class="bw-name">${esc(g.name)}</span>
            ${g.tag ? `<span class="bw-guild-tag">${esc(g.tag)}</span>` : ''}
            ${lvl.level != null ? `<span class="bw-star"><svg class="ic" style="width:0.8rem;height:0.8rem"><use href="#ic-layers"/></svg> Level ${lvl.level}</span>` : ''}
          </div>
          <div class="bw-meta">
            <span><svg class="ic"><use href="#ic-users"/></svg> ${g.memberCount || 0} / ${g.maxMembers || 125} Members</span>
            ${g.leaderUuid ? `<span><svg class="ic"><use href="#ic-user"/></svg> Searched via: <strong style="color:#fff">${esc(p.username)}</strong></span>` : ''}
          </div>
          ${lvl.nextCost > 0 ? `<div class="bw-level-bar" title="${lvl.xp || 0} / ${lvl.nextCost} XP">
            <div class="bw-level-fill" style="width:${xpPct}%"></div>
          </div>`: ''}
        </div>
      </div>
      <div class="bw-section-title">Guild Stats</div>
      <div class="bw-stats-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="bw-stat-card"><div class="bw-stat-label">Members</div><div class="bw-stat-value">${fmt(g.memberCount || 0)}</div></div>
        <div class="bw-stat-card"><div class="bw-stat-label">Max Members</div><div class="bw-stat-value">${fmt(g.maxMembers || 125)}</div></div>
        <div class="bw-stat-card"><div class="bw-stat-label">Guild Level</div><div class="bw-stat-value gold">${lvl.level != null ? lvl.level : '—'}</div></div>
        <div class="bw-stat-card"><div class="bw-stat-label">Guild XP</div><div class="bw-stat-value blue">${fmt(lvl.xp || 0)}</div></div>
        <div class="bw-stat-card"><div class="bw-stat-label">XP for Next</div><div class="bw-stat-value">${fmt(lvl.nextCost || 0)}</div></div>
        <div class="bw-stat-card"><div class="bw-stat-label">Tag</div><div class="bw-stat-value" style="font-size:1rem">${g.tag ? esc(g.tag) : '—'}</div></div>
      </div>`;
      } catch (e) {
        el.innerHTML = '<div class="empty">Could not load guild info. Please try again.</div>';
      }
      if (btn) btn.disabled = false;
    }

    // ── Compare Two Players
    async function loadCompare() {
      const a = V('CMP-A').trim(), b = V('CMP-B').trim();
      if (!a || !b) { toast('err', 'Enter both player names'); return; }
      const el = I('CMP-RES');
      el.innerHTML = '<div class="ld"><div class="sp"></div>Comparing players...</div>';
      try {
        const [ra, rb] = await Promise.all([fetch(`/api/bwstats/${enc(a)}`), fetch(`/api/bwstats/${enc(b)}`)]);
        const [da, db] = await Promise.all([ra.json(), rb.json()]);
        if (!da.success || !da.player) { el.innerHTML = `<div class="empty">Player "${esc(a)}" not found.</div>`; return; }
        if (!db.success || !db.player) { el.innerHTML = `<div class="empty">Player "${esc(b)}" not found.</div>`; return; }
        const pa = da.player, pb = db.player;
        const oa = pa.groupStats?.overall || {}, ob = pb.groupStats?.overall || {};
        const stats = [
          { label: 'Wins', ka: 'wins', kb: 'wins', color: 'green' },
          { label: 'Losses', ka: 'losses', kb: 'losses', color: 'red', low: true },
          { label: 'W/L Ratio', ka: 'wlr', kb: 'wlr', color: '', dec: 2 },
          { label: 'Kills', ka: 'kills', kb: 'kills', color: 'green' },
          { label: 'Deaths', ka: 'deaths', kb: 'deaths', color: 'red', low: true },
          { label: 'K/D', ka: 'kdr', kb: 'kdr', color: '', dec: 2 },
          { label: 'Final K', ka: 'finalKills', kb: 'finalKills', color: 'green' },
          { label: 'FKDR', ka: 'fkdr', kb: 'fkdr', color: 'blue', dec: 2 },
          { label: 'Beds', ka: 'bedsBroken', kb: 'bedsBroken', color: 'gold' },
          { label: 'Games', ka: 'gamesPlayed', kb: 'gamesPlayed', color: '' },
          { label: 'Winstreak', ka: 'winstreak', kb: 'winstreak', color: 'gold' },
        ];
        const cmpRow = (s) => {
          const va = Number(oa[s.ka] || pa[s.ka] || 0), vb = Number(ob[s.kb] || pb[s.kb] || 0);
          const aWin = s.low ? (va < vb) : (va > vb), bWin = s.low ? (vb < va) : (vb > va);
          const disp = (v) => s.dec ? v.toFixed(s.dec) : fmt(v);
          return `<tr>
        <td style="text-align:right;padding:10px 16px;font-weight:${aWin ? '800' : '400'};color:${aWin ? '#fff' : 'var(--tx2)'}">${disp(va)} ${aWin ? '<svg class="ic" style="width:0.75rem;height:0.75rem;color:var(--grn)"><use href="#ic-chartline"/></svg>' : ''}</td>
        <td style="text-align:center;padding:10px 8px;color:var(--tx3);font-size:0.75rem;font-weight:700;text-transform:uppercase;white-space:nowrap">${s.label}</td>
        <td style="text-align:left;padding:10px 16px;font-weight:${bWin ? '800' : '400'};color:${bWin ? '#fff' : 'var(--tx2)'}">${bWin ? '<svg class="ic" style="width:0.75rem;height:0.75rem;color:var(--grn)"><use href="#ic-chartline"/></svg>' : ''} ${disp(vb)}</td>
      </tr>`;
        };
        el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div class="bw-header" style="padding:16px">
          <img class="bw-avatar" style="width:48px;height:48px;border-radius:8px" src="/api/skin/head/${enc(pa.username)}/48" onerror="this.style.display='none'" alt="">
          <div>
            <div class="bw-name" style="font-size:1.1rem">${esc(pa.username)}</div>
            <div class="bw-meta">${pa.isOnline ? '<span class="bw-online">● Online</span>' : '<span class="bw-offline">● Offline</span>'}</div>
          </div>
        </div>
        <div class="bw-header" style="padding:16px">
          <img class="bw-avatar" style="width:48px;height:48px;border-radius:8px" src="/api/skin/head/${enc(pb.username)}/48" onerror="this.style.display='none'" alt="">
          <div>
            <div class="bw-name" style="font-size:1.1rem">${esc(pb.username)}</div>
            <div class="bw-meta">${pb.isOnline ? '<span class="bw-online">● Online</span>' : '<span class="bw-offline">● Offline</span>'}</div>
          </div>
        </div>
      </div>
      <div class="bw-section-title">Head-to-Head Comparison</div>
      <div style="background:rgba(8,8,8,0.7);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:right;padding:12px 16px;color:var(--tx3);font-size:0.75rem;text-transform:uppercase;font-weight:700;background:rgba(0,0,0,0.3)">${esc(pa.username)}</th>
            <th style="text-align:center;padding:12px 8px;color:var(--tx3);font-size:0.75rem;text-transform:uppercase;font-weight:700;background:rgba(0,0,0,0.3)">STAT</th>
            <th style="text-align:left;padding:12px 16px;color:var(--tx3);font-size:0.75rem;text-transform:uppercase;font-weight:700;background:rgba(0,0,0,0.3)">${esc(pb.username)}</th>
          </tr></thead>
          <tbody>${stats.map(cmpRow).join('')}</tbody>
        </table>
      </div>`;
      } catch (e) {
        el.innerHTML = '<div class="empty">Could not compare players. Please try again.</div>';
      }
    }

    function prT(t) {
      ['PR-OV', 'PR-INV', 'PR-GIFTS', 'PR-TIX'].forEach((id, i) => I(id).style.display = ['ov', 'inv', 'gifts', 'tix'][i] === t ? '' : 'none');
      document.querySelectorAll('#pg-profile .tab').forEach((b, i) => b.classList.toggle('ON', ['ov', 'inv', 'gifts', 'tix'][i] === t));
    }

    // ════════════════════════════════════════════════════
    // API — all calls to Flask backend
    // ════════════════════════════════════════════════════
    async function API(url, opts = {}) {
      // 1. SOURCE OF TRUTH: The browser now handles the cookie automatically.
      // We no longer manually send X-Auth-Token headers.

      const h = {};
      if (opts.body && !(opts.body instanceof FormData)) {
        h['Content-Type'] = 'application/json';
      }

      const res = await fetch(url, {
        method: opts.method || 'GET',
        credentials: 'include', // CRITICAL: Browser will send cookies
        headers: h,
        body: (opts.body && !(opts.body instanceof FormData)) ? JSON.stringify(opts.body) : opts.body
      });

      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // If we get a 401, don't panic immediately. 
        // Verify if the session is ACTUALLY dead.
        if (res.status === 401 && !isCheckingSession) {
          isCheckingSession = true;
          console.warn(`[Auth] 401 detected from ${url}. Verifying session...`);

          window.fetch('/api/auth/me', { credentials: 'include' })
            .then(check => {
              if (check.status === 401) {
                console.error("[Auth] Session confirmed DEAD. Re-opening login.");
                handleSessionExpired();
              } else {
                console.log("[Auth] Session is still ALIVE. Ignoring 401 from " + url);
              }
            })
            .catch(err => console.error("[Auth] Session check failed:", err))
            .finally(() => { isCheckingSession = false; });
        }
        const err = new Error(d.error || `Error ${res.status}`);
        err.data = d;
        err.status = res.status;
        throw err;
      }
      return d;
    }

    // ════════════════════════════════════════════════════
    // TOASTS
    // ════════════════════════════════════════════════════
    function toast(type, msg) {
      const c = I('TOASTS');
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.style.animation = 'slideInRight 0.3s ease forwards';
      el.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">${type === 'ok' ? '✓' : '✗'}</span>
        <span style="font-weight:600">${esc(msg)}</span>
      </div>`;
      c.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        setTimeout(() => el.remove(), 300);
      }, 4000);
    }

    // ════════════════════════════════════════════════════
    // UTILITIES
    // ════════════════════════════════════════════════════
    const I = id => document.getElementById(id);
    const V = id => I(id)?.value || '';
    const SV = (id, v) => { const e = I(id); if (e) e.value = v; };
    const uid = () => (window.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let verifyPoller = null;
    async function startVerificationFlow() {
      try {
        const { code } = await API('/api/verify/start', { method: 'POST' });
        I('VERIFY-CODE-DISPLAY').textContent = code;
        I('VERIFY-OVERLAY').classList.add('OPEN');

        if (verifyPoller) clearInterval(verifyPoller);
        verifyPoller = setInterval(async () => {
          const res = await API('/api/verify/status');
          if (res.is_verified) {
            clearInterval(verifyPoller);
            ME.is_verified = true;
            I('VERIFY-OVERLAY').classList.remove('OPEN');
            toast('ok', 'Account linked successfully! Features unlocked.');
            GO(window.location.pathname.substring(1).replace(/\//g, '-') || 'home');
          }
        }, 3000);
      } catch (e) { toast('err', 'Verification failed to start'); }
    }

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const enc = s => encodeURIComponent(s || '');
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const mIC = m => ({ bedwars: '<svg class="ic"><use href="#ic-bed"/></svg> ', lifesteal: '<svg class="ic" style="color:#e11d48"><use href="#ic-heart"/></svg> ', skywars: '<svg class="ic"><use href="#ic-cloud"/></svg> ', survival: '<svg class="ic"><use href="#ic-tree"/></svg> ', practice: '<svg class="ic"><use href="#ic-swords"/></svg> ' }[m] || '<svg class="ic"><use href="#ic-gamepad"/></svg> ');
    const rbcls = r => r.replace('+', 'plus').toLowerCase();
    const fmtD = s => { try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return s || ''; } };
    const copyIP = () => navigator.clipboard?.writeText('mc.hellcore.net').then(() => toast('ok', '✓ IP copied!'));
    const copyVerifyCmd = () => {
      const code = I('VERIFY-CODE-DISPLAY').textContent;
      navigator.clipboard?.writeText('/verify ' + code).then(() => toast('ok', '📋 Command copied! Run it in-game.'));
    };


    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
      return outputArray;
    }
  