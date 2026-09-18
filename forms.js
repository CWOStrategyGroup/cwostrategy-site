/* =============================================================================
   CWO Strategy Group — forms.js
   Real submission for the public lead form and the portal request form.
   Zero dependencies.

   Replaces the demo handler in scroll.js, which showed a success message and
   then discarded the submission.
   ========================================================================== */

(function () {
  'use strict';

  var ENDPOINT = 'https://ajfekzqnajmcpcvqadtj.supabase.co/functions/v1/submit-lead';
  var ANON_KEY = 'sb_publishable_kybffjlfwXJPt97Rs9tRKA_Bs5dWPBm';

  function alertBox(form, kind) {
    return form.querySelector(kind === 'ok' ? '[data-alert-ok]' : '[data-alert-bad]');
  }

  function show(form, kind, msg) {
    ['ok', 'bad'].forEach(function (k) {
      var b = alertBox(form, k);
      if (b) { b.classList.remove('is-shown'); b.textContent = ''; }
    });
    var box = alertBox(form, kind);
    if (box) { box.textContent = msg; box.classList.add('is-shown'); }
  }

  function collect(form) {
    var out = {};
    Array.prototype.slice.call(form.elements).forEach(function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') {
        if (el.checked) out[el.name] = (out[el.name] ? out[el.name] + ', ' : '') + (el.value || 'yes');
      } else if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value;
      } else {
        out[el.name] = el.value;
      }
    });
    return out;
  }

  function validate(form) {
    var ok = true;
    Array.prototype.slice.call(form.querySelectorAll('[required]')).forEach(function (el) {
      var err = el.parentNode.querySelector('.err')
             || (el.closest('.field') && el.closest('.field').querySelector('.err'));
      var bad = !el.value.trim()
             || (el.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value.trim()));
      if (bad) {
        ok = false;
        el.setAttribute('aria-invalid', 'true');
        if (err) err.textContent = el.type === 'email' && el.value.trim()
          ? 'Enter a valid email address.' : 'This field is required.';
      } else {
        el.removeAttribute('aria-invalid');
        if (err) err.textContent = '';
      }
    });
    return ok;
  }

  /* ------------------------------------------------- public lead form */
  function initLeadForm(form) {
    var loadedAt = Date.now();
    var btn = form.querySelector('button[type="submit"]');
    var original = btn ? btn.innerHTML : '';
    var busy = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      if (!validate(form)) { show(form, 'bad', 'Please fix the highlighted fields.'); return; }

      var payload = collect(form);
      payload.elapsed_ms = Date.now() - loadedAt;
      payload.source_page = location.pathname;

      busy = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (b) {
          return { status: res.status, body: b };
        });
      }).then(function (r) {
        busy = false;
        if (btn) { btn.disabled = false; btn.innerHTML = original; }

        if (r.status === 200 && r.body.ok) {
          show(form, 'ok', form.getAttribute('data-success')
            || 'Thanks — your message is in. We reply within one business day.');
          form.reset();
          Array.prototype.slice.call(form.querySelectorAll('.field, .btn-row'))
            .forEach(function (n) { n.style.display = 'none'; });
          return;
        }
        if (r.status === 429) {
          show(form, 'bad', r.body.message || 'Too many messages. Please email us directly.');
          return;
        }
        if (r.status === 422) {
          show(form, 'bad', r.body.message || 'Please check your details and try again.');
          return;
        }
        show(form, 'bad', 'We couldn’t send that. Email cwostrategygroup@gmail.com and we’ll pick it up there.');
      }).catch(function () {
        busy = false;
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        show(form, 'bad', 'Network problem — your message didn’t send. Email cwostrategygroup@gmail.com instead.');
      });
    });
  }

  /* ---------------------------------------------- portal request form */
  function initRequestForm(form) {
    var btn = form.querySelector('button[type="submit"]');
    var original = btn ? btn.innerHTML : '';
    var busy = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy || !window.CWOAuth) return;
      if (!validate(form)) { show(form, 'bad', 'Please fix the highlighted fields.'); return; }

      var data = collect(form);
      var summary = (data.summary || data.message || data.details || '').trim();
      if (!summary) { show(form, 'bad', 'Describe what you’d like changed.'); return; }

      busy = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      window.CWOAuth.rpc('submit_portal_request', { p_summary: summary })
        .then(function (ref) {
          busy = false;
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
          show(form, 'ok', 'Request ' + ref + ' received. You’ll see it in the table above.');
          form.reset();
          setTimeout(function () { location.reload(); }, 1800);
        })
        .catch(function (err) {
          busy = false;
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
          if (err && err.code === 'unauthenticated') { location.replace('login.html'); return; }
          show(form, 'bad', 'We couldn’t submit that. Refresh and try again, or email us.');
        });
    });
  }

  function boot() {
    Array.prototype.slice.call(document.querySelectorAll('form[data-lead]')).forEach(initLeadForm);
    Array.prototype.slice.call(document.querySelectorAll('form[data-portal-request]')).forEach(initRequestForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
