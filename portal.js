/* =============================================================================
   CWO Strategy Group — portal.js (v3)
   Client dashboard. Zero dependencies.

   SECURITY POSTURE
   ----------------
   • Holds ZERO secrets. The publishable key in auth.js is public by design and
     grants nothing without a signed-in user's JWT; every table is behind RLS.
   • Identity is NEVER sent from the client. portal_summary() resolves the
     tenant from auth.uid() inside Postgres, so there is no id to tamper with
     and therefore no IDOR.
   • Everything written to the DOM goes through textContent or a DOM node.
     There is no innerHTML with server data anywhere in this file.
   • Numbers are rendered only when the server returns them. Nothing on this
     page is invented, estimated, or carried over from a demo.
   ========================================================================== */

(function () {
  'use strict';

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------ helpers */
  function setText(sel, value) {
    var el = $(sel);
    if (el) el.textContent = value == null || value === '' ? '—' : String(value);
  }

  function fmt(n) {
    if (typeof n === 'number') return n.toLocaleString('en-US');
    var p = parseFloat(n);
    return isFinite(p) ? p.toLocaleString('en-US') : (n == null ? '—' : String(n));
  }

  function status(kind, msg) {
    var box = $('[data-status]');
    if (!box) return;
    box.className = 'alert is-shown' + (kind ? ' alert--' + kind : '');
    box.textContent = msg;
  }

  function clearStatus() {
    var box = $('[data-status]');
    if (box) { box.className = 'alert'; box.textContent = ''; }
  }

  /** Build a <tr> from plain values. No innerHTML, so nothing can inject. */
  function row(values, builders) {
    var tr = document.createElement('tr');
    values.forEach(function (v, i) {
      var td = document.createElement('td');
      if (builders && builders[i]) builders[i](td, v);
      else td.textContent = v == null || v === '' ? '—' : String(v);
      tr.appendChild(td);
    });
    return tr;
  }

  function fillTable(tbody, rows, mapFn, emptyMsg, colspan) {
    if (!tbody) return;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (!rows || !rows.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = colspan || 4;
      td.textContent = emptyMsg;
      td.style.color = 'var(--text-faint)';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    rows.forEach(function (r) { tbody.appendChild(mapFn(r)); });
  }

  /* ------------------------------------------------- 1. KPI rendering */
  function renderKpis(kpis) {
    var wrap = $('[data-kpis]');
    if (!wrap || !Array.isArray(kpis)) return;
    var cards = $$('.kpi', wrap);

    kpis.slice(0, cards.length).forEach(function (k, i) {
      var card = cards[i];
      var kEl = $('.kpi__k', card), vEl = $('.kpi__v', card), dEl = $('.kpi__d', card);
      if (kEl && k.label) kEl.textContent = k.label;
      if (vEl) vEl.textContent = k.value == null ? '—' : fmt(k.value);
      if (dEl) {
        if (k.delta && k.delta !== '—') {
          dEl.textContent = (k.direction === 'down' ? '↓ ' : '↑ ') + k.delta + ' vs. prior period';
          dEl.className = 'kpi__d ' + (k.direction === 'down' ? 'down' : 'up');
        } else {
          dEl.textContent = 'No prior period to compare';
          dEl.className = 'kpi__d';
        }
      }
    });
  }

  /* --------------------------------------------- 2. Traffic trend line */
  function renderTrend(trend) {
    var path = $('[data-draw]');
    if (!path) return;

    if (!Array.isArray(trend) || trend.length < 2) {
      path.removeAttribute('d');
      var chart = path.closest('.chart');
      if (chart && !$('[data-trend-empty]', chart)) {
        var p = document.createElement('p');
        p.setAttribute('data-trend-empty', '');
        p.style.cssText = 'color:var(--text-faint);font-size:.88rem;margin:.6rem 0 0';
        p.textContent = 'Not enough data yet to draw a trend. This fills in as daily analytics arrive.';
        chart.appendChild(p);
      }
      return;
    }

    var vals = trend.map(function (t) { return Number(t.v) || 0; });
    var max  = Math.max.apply(null, vals) || 1;
    var W = 800, H = 200, PAD = 4;
    var step = vals.length > 1 ? W / (vals.length - 1) : W;

    var d = vals.map(function (v, i) {
      var x = Math.round(i * step);
      var y = Math.round(H - PAD - (v / max) * (H - PAD * 2));
      return (i === 0 ? 'M' : 'L') + x + ',' + y;
    }).join(' ');

    path.setAttribute('d', d);

    if (REDUCED) return;
    var len;
    try { len = path.getTotalLength(); } catch (e) { return; }
    if (!len) return;
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    requestAnimationFrame(function () {
      path.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.22,1,.36,1)';
      path.style.strokeDashoffset = 0;
    });
  }

  /* ----------------------------------------------------- 3. Full render */
  function render(data) {
    if (!data || typeof data !== 'object') return;

    if (data.status === 'no_client') {
      status('bad', 'Your sign-in worked, but this account isn’t linked to a client yet. '
                  + 'Email cwostrategygroup@gmail.com and we’ll connect it.');
      return;
    }

    setText('[data-user-name]', data.accountName);
    setText('[data-property]', data.property);
    setText('[data-source]', data.source || 'Cloudflare Web Analytics');

    var range = $('[data-range]');
    if (range && data.rangeStart && data.rangeEnd) {
      range.textContent = data.rangeStart + ' → ' + data.rangeEnd;
    }

    if (data.status === 'no_site') {
      status('', 'No website is linked to your account yet. Once we connect your site, '
               + 'analytics will appear here automatically.');
      return;
    }

    if (data.status === 'awaiting_data') {
      status('', 'Analytics are connected but haven’t collected data for this period yet. '
               + 'Figures usually appear within 24 hours of setup.');
    } else {
      clearStatus();
    }

    renderKpis(data.kpis);
    renderTrend(data.trend);

    var bodies = $$('.tbl tbody');

    // Top pages
    fillTable(bodies[0], data.topPages, function (r) {
      return row([r.page, fmt(r.views)]);
    }, 'No page data for this period yet.', 2);

    // Traffic sources
    fillTable(bodies[1], data.sources, function (r) {
      return row([r.source, fmt(r.sessions)]);
    }, 'No referrer data for this period yet.', 2);

    // Keywords — only shown when genuinely connected
    var kwEmpty = $('[data-keywords-empty]');
    var kwTable = $('[data-keywords-table]');
    if (data.keywordsConnected && Array.isArray(data.keywords) && data.keywords.length) {
      if (kwEmpty) kwEmpty.hidden = true;
      if (kwTable) {
        kwTable.hidden = false;
        fillTable($('tbody', kwTable), data.keywords, function (r) {
          return row([r.keyword, r.position, r.change, r.volume == null ? '—' : fmt(r.volume)]);
        }, 'No keyword data.', 4);
      }
    } else {
      if (kwEmpty) kwEmpty.hidden = false;
      if (kwTable) kwTable.hidden = true;
    }

    // Change requests
    var reqBody = bodies[bodies.length - 1];
    var TAG   = { open: 'tag--open', in_progress: 'tag--prog', done: 'tag--done' };
    var LABEL = { open: 'Open', in_progress: 'In progress', done: 'Done' };

    fillTable(reqBody, data.requests, function (r) {
      var key = String(r.status || 'open').toLowerCase();
      return row([r.ref, r.summary, r.submitted, key], [null, null, null, function (td, v) {
        var span = document.createElement('span');
        span.className = 'tag ' + (TAG[v] || 'tag--open');
        span.textContent = LABEL[v] || 'Open';
        td.appendChild(span);
      }]);
    }, 'No change requests yet.', 4);
  }

  /* ---------------------------------------------------- 4. Boot / guard */
  function boot() {
    if (!window.CWOAuth) return;

    // Magic-link landing: pull tokens out of the URL hash first.
    var captured = window.CWOAuth.captureFromUrl();
    if (captured && captured.error) {
      location.replace('login.html?e=link');
      return;
    }

    window.CWOAuth.getValidSession().then(function (session) {
      if (!session) { location.replace('login.html'); return; }

      window.CWOAuth.getUser().then(function (u) {
        if (u && u.email) setText('[data-user-email]', u.email);
      });

      status('', 'Loading your analytics…');

      return window.CWOAuth.rpc('portal_summary', { window_days: 30 })
        .then(render)
        .catch(function (err) {
          if (err && err.code === 'unauthenticated') { location.replace('login.html'); return; }
          if (err && err.code === 'rate') {
            status('bad', 'Too many requests. Wait a moment and refresh.');
            return;
          }
          status('bad', 'We couldn’t load your analytics just now. Refresh, or email cwostrategygroup@gmail.com.');
        });
    });
  }

  /* --------------------------------------------------------- 5. Sign out */
  function initLogout() {
    $$('[data-logout]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        window.CWOAuth.signOut().then(function () { location.replace('login.html'); });
      });
    });
  }

  /* --------------------------------------------- 6. Idle auto sign-out */
  function initIdleTimeout() {
    var LIMIT = 30 * 60 * 1000;
    var timer;
    function reset() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        window.CWOAuth.signOut().then(function () {
          location.replace('login.html?e=idle');
        });
      }, LIMIT);
    }
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, reset, { passive: true });
    });
    reset();
  }

  function start() {
    [boot, initLogout, initIdleTimeout].forEach(function (fn) {
      try { fn(); } catch (err) {
        if (window.console) console.warn('[cwo-portal] module failed:', err);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
