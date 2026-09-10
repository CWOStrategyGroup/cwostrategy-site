/* =============================================================================
   CWO Strategy Group — portal.js  (v2)
   Client dashboard logic. Zero dependencies.

   SECURITY POSTURE
   ----------------
   • Holds ZERO secrets. Anything shipped to a browser is public. Auth is an
     HttpOnly session cookie this script cannot read.
   • Identity is NEVER sent from the client. No user id, no property id. The
     server derives both from the session. That closes the IDOR hole where
     someone edits a hidden input to read another client's analytics.
   • Everything written to the DOM goes through textContent or escapeHtml().
     No innerHTML with server data, ever.
   ============================================================================= */

(function () {
  'use strict';

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isDemo = new URLSearchParams(window.location.search).get('demo') === '1';

  /* ------------------------------------------------------------ Utilities */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setText(sel, value) {
    var el = $(sel);
    if (el && value != null) el.textContent = String(value);
  }

  function fmt(n) {
    return typeof n === 'number' ? n.toLocaleString('en-US') : n;
  }

  /* ------------------------------------------- 1. Scroll-drawn chart line */
  function initChartDraw() {
    var path = $('[data-draw]');
    if (!path) return;

    var len;
    try { len = path.getTotalLength(); } catch (e) { return; }
    if (!len) return;

    if (REDUCED || !('IntersectionObserver' in window)) return;

    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;

    new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        path.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.22,1,.36,1)';
        path.style.strokeDashoffset = 0;
        obs.unobserve(e.target);
      });
    }, { threshold: 0.25 }).observe(path);
  }

  /* --------------------------------------------------- 2. Load dashboard */
  function loadDashboard() {
    if (isDemo) return;              // leave static demo markup in place

    /* No API deployed yet — leave the demo banner and data rather than
       throwing a fetch error at the user. Remove this guard once
       /api/portal/summary exists. */
    if (!window.CWO_API_READY) return;

    fetch('/api/portal/summary', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
      cache: 'no-store'
    })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          location.replace('login.html');
          throw new Error('unauthenticated');
        }
        if (res.status === 429) throw new Error('rate-limited');
        if (!res.ok) throw new Error('http-' + res.status);
        return res.json();
      })
      .then(render)
      .catch(function (err) {
        if (err && err.message === 'unauthenticated') return;
        showError(err && err.message === 'rate-limited'
          ? 'Too many requests. Please wait a moment and refresh.'
          : 'We couldn\u2019t load your analytics just now. Refresh, or email cwostrategygroup@gmail.com.');
      });
  }

  function showError(msg) {
    var banner = $('[data-demo-banner]');
    if (!banner) return;
    banner.className = 'alert alert--bad is-shown';
    banner.textContent = msg;
  }

  /* ------------------------------------------------------- 3. Rendering */
  function render(data) {
    if (!data || typeof data !== 'object') return;

    var banner = $('[data-demo-banner]');
    if (banner) banner.remove();

    /* Display only — never used to scope a request. */
    setText('[data-user-name]', data.accountName);
    setText('[data-user-email]', data.userEmail);
    setText('[data-property]', data.property);

    if (Array.isArray(data.kpis)) {
      var cards = $$('.kpi');
      data.kpis.slice(0, cards.length).forEach(function (k, i) {
        var card = cards[i];
        var kEl = $('.kpi__k', card), vEl = $('.kpi__v', card), dEl = $('.kpi__d', card);
        if (kEl && k.label) kEl.textContent = k.label;
        if (vEl && k.value != null) vEl.textContent = fmt(k.value);
        if (dEl && k.delta) {
          dEl.textContent = k.delta;
          dEl.className = 'kpi__d ' + (k.direction === 'down' ? 'down' : 'up');
        }
      });
    }

    if (Array.isArray(data.topPages)) fillTable(0, data.topPages, ['page', 'views', 'avgTime']);
    if (Array.isArray(data.sources))  fillTable(1, data.sources,  ['source', 'sessions', 'share']);
    if (Array.isArray(data.keywords)) fillTable(2, data.keywords, ['keyword', 'position', 'change', 'volume']);
    if (Array.isArray(data.requests)) fillRequests(data.requests);
  }

  function fillTable(index, rows, fields) {
    var body = $$('.tbl tbody')[index];
    if (!body) return;
    body.innerHTML = rows.map(function (r) {
      return '<tr>' + fields.map(function (f) {
        return '<td>' + escapeHtml(fmt(r[f])) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function fillRequests(rows) {
    var bodies = $$('.tbl tbody');
    var body = bodies[bodies.length - 1];
    if (!body) return;

    var TAG = { open: 'tag--open', in_progress: 'tag--prog', done: 'tag--done' };
    var LABEL = { open: 'Open', in_progress: 'In progress', done: 'Done' };

    body.innerHTML = rows.map(function (r) {
      var key = String(r.status || 'open').toLowerCase();
      return '<tr>' +
        '<td>' + escapeHtml(r.ref) + '</td>' +
        '<td>' + escapeHtml(r.summary) + '</td>' +
        '<td>' + escapeHtml(r.submitted) + '</td>' +
        '<td><span class="tag ' + (TAG[key] || 'tag--open') + '">' +
          (LABEL[key] || 'Open') + '</span></td>' +
        '</tr>';
    }).join('');
  }

  /* --------------------------------------------------------- 4. Sign out */
  function initLogout() {
    $$('[data-logout]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (!window.CWO_API_READY) return;   // plain link to login.html
        e.preventDefault();
        /* POST, not GET — a GET logout can be fired by an <img> on another
           site (logout CSRF). */
        fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-Requested-With': 'fetch' }
        }).catch(function () {}).then(function () {
          location.replace('login.html');
        });
      });
    });
  }

  /* ------------------------------------------------- 5. Idle auto-logout */
  function initIdleTimeout() {
    if (isDemo || !window.CWO_API_READY) return;

    var LIMIT = 30 * 60 * 1000;
    var timer;

    function reset() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        location.replace('login.html');
      }, LIMIT);
    }

    ['click', 'keydown', 'scroll', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, reset, { passive: true });
    });
    reset();
  }

  /* ------------------------------------------------------------- Boot */
  function boot() {
    [initChartDraw, loadDashboard, initLogout, initIdleTimeout].forEach(function (fn) {
      try { fn(); } catch (err) {
        if (window.console) console.warn('[cwo-portal] module failed:', err);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
