/* =============================================================================
   CWO Strategy Group — auth.js
   Minimal Supabase auth + data client. Zero dependencies, no CDN.

   SECURITY POSTURE
   ----------------
   • The publishable key below is PUBLIC by design. It grants nothing on its
     own: every table is behind Row Level Security, and anon has no grants at
     all in the public schema. Data access requires a signed-in user's JWT.
   • Identity is NEVER sent from the client. portal_summary() derives the
     tenant from auth.uid() inside Postgres. There is no client id, site id, or
     email in any request body — so there is no IDOR to exploit.
   • Sign-in is passwordless (magic link). No password is typed, transmitted,
     stored, or reset. create_user is false, so an unknown address cannot
     self-register.
   • Tokens live in sessionStorage, not localStorage: they die with the tab and
     are not shared across tabs or windows. Accepted trade-off: an XSS bug
     could still read them, which is why the CSP forbids inline and remote
     script.
   ========================================================================== */

(function (global) {
  'use strict';

  var CONFIG = {
    url: 'https://ajfekzqnajmcpcvqadtj.supabase.co',
    // Publishable (anon) key — safe to ship. Protected by RLS.
    key: 'sb_publishable_kybffjlfwXJPt97Rs9tRKA_Bs5dWPBm',
    redirectTo: 'https://cwostrategy.com/portal.html'
  };

  var STORE_KEY = 'cwo.session';

  /* ------------------------------------------------------------- storage */
  function readSession() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.access_token) return null;
      if (s.expires_at && Date.now() > s.expires_at - 30000) return s; // let refresh handle it
      return s;
    } catch (e) { return null; }
  }

  function writeSession(s) {
    try {
      if (!s) { sessionStorage.removeItem(STORE_KEY); return; }
      sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) { /* private mode — session stays in memory only */ }
  }

  function normalise(raw) {
    if (!raw || !raw.access_token) return null;
    var ttl = parseInt(raw.expires_in, 10);
    return {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token || null,
      expires_at: Date.now() + (isFinite(ttl) ? ttl : 3600) * 1000,
      email: (raw.user && raw.user.email) || raw.email || null
    };
  }

  /* --------------------------------------------------------------- fetch */
  function api(path, opts) {
    opts = opts || {};
    var headers = {
      'apikey': CONFIG.key,
      'Content-Type': 'application/json'
    };
    if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
    if (opts.headers) {
      Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
    }

    return fetch(CONFIG.url + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors'
    });
  }

  /* ---------------------------------------------- magic link (sign in) */
  function sendMagicLink(email) {
    /* The redirect MUST travel as a query parameter. GoTrue ignores any
       redirect passed in the request body, and silently falls back to the
       project's Site URL — which is how a sign-in link ends up on the
       homepage instead of the portal. */
    var path = '/auth/v1/otp?redirect_to=' + encodeURIComponent(CONFIG.redirectTo);

    return api(path, {
      method: 'POST',
      body: {
        email: String(email || '').trim().toLowerCase(),
        // Closed signup: an address with no account will NOT be created.
        create_user: false
      }
    }).then(function (res) {
      if (res.ok) return { ok: true };
      if (res.status === 429) {
        return { ok: false, reason: 'rate',
                 message: 'Too many sign-in emails requested. Please wait a few minutes and try again.' };
      }
      return res.json().catch(function () { return {}; }).then(function (b) {
        return { ok: false, reason: 'error', message: (b && (b.msg || b.error_description || b.message)) || null };
      });
    });
  }

  /* ------------------------------------- capture tokens from URL hash */
  function captureFromUrl() {
    var hash = global.location.hash || '';
    if (hash.indexOf('access_token=') === -1) {
      if (hash.indexOf('error=') !== -1) {
        var ep = new URLSearchParams(hash.replace(/^#/, ''));
        history.replaceState(null, '', location.pathname + location.search);
        return { error: ep.get('error_description') || ep.get('error') || 'Sign-in link is invalid or expired.' };
      }
      return null;
    }
    var p = new URLSearchParams(hash.replace(/^#/, ''));
    var s = normalise({
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token'),
      expires_in: p.get('expires_in')
    });
    // Strip the tokens out of the address bar immediately.
    history.replaceState(null, '', location.pathname + location.search);
    if (s) writeSession(s);
    return s ? { session: s } : null;
  }

  /* ------------------------------------------------------------ refresh */
  function refresh() {
    var s = readSession();
    if (!s || !s.refresh_token) return Promise.resolve(null);
    return api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: s.refresh_token }
    }).then(function (res) {
      if (!res.ok) { writeSession(null); return null; }
      return res.json().then(function (b) {
        var ns = normalise(b);
        writeSession(ns);
        return ns;
      });
    }).catch(function () { return null; });
  }

  function getValidSession() {
    var s = readSession();
    if (!s) return Promise.resolve(null);
    if (Date.now() < s.expires_at - 60000) return Promise.resolve(s);
    return refresh();
  }

  /* ---------------------------------------------------------- user info */
  function getUser() {
    return getValidSession().then(function (s) {
      if (!s) return null;
      return api('/auth/v1/user', { token: s.access_token }).then(function (res) {
        if (!res.ok) return null;
        return res.json();
      });
    }).catch(function () { return null; });
  }

  /* --------------------------------------------------------------- rpc */
  function rpc(fn, args) {
    return getValidSession().then(function (s) {
      if (!s) return Promise.reject({ code: 'unauthenticated' });
      return api('/rest/v1/rpc/' + encodeURIComponent(fn), {
        method: 'POST',
        token: s.access_token,
        body: args || {}
      }).then(function (res) {
        if (res.status === 401 || res.status === 403) {
          return Promise.reject({ code: 'unauthenticated' });
        }
        if (res.status === 429) return Promise.reject({ code: 'rate' });
        if (!res.ok) {
          return res.text().then(function (t) {
            return Promise.reject({ code: 'http', status: res.status, detail: t });
          });
        }
        return res.json();
      });
    });
  }

  /* ----------------------------------------------------------- sign out */
  function signOut() {
    var s = readSession();
    writeSession(null);
    if (!s) return Promise.resolve();
    return api('/auth/v1/logout', { method: 'POST', token: s.access_token })
      .catch(function () {})
      .then(function () {});
  }

  global.CWOAuth = {
    config: CONFIG,
    sendMagicLink: sendMagicLink,
    captureFromUrl: captureFromUrl,
    getValidSession: getValidSession,
    getUser: getUser,
    rpc: rpc,
    signOut: signOut
  };
})(window);
