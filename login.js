/* =============================================================================
   CWO Strategy Group — login.js
   Passwordless sign-in. Zero dependencies.

   Note on enumeration: the success message is identical whether or not the
   address has an account. An attacker cannot use this form to discover who
   our clients are.
   ========================================================================== */

(function () {
  'use strict';

  var form = document.getElementById('loginForm');
  if (!form || !window.CWOAuth) return;

  var btn    = document.getElementById('loginBtn');
  var email  = document.getElementById('email');
  var okBox  = form.querySelector('[data-alert-ok]');
  var badBox = form.querySelector('[data-alert-bad]');
  var hp     = document.getElementById('company_url');
  var loadedAt = Date.now();
  var sending  = false;

  function show(box, msg) {
    [okBox, badBox].forEach(function (b) {
      if (!b) return;
      b.classList.remove('is-shown');
      b.textContent = '';
    });
    if (!box) return;
    box.textContent = msg;
    box.classList.add('is-shown');
  }

  function setBusy(on, label) {
    sending = on;
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? (label || 'Sending…') : 'Email me a sign-in link';
  }

  // Already signed in? Go straight through.
  window.CWOAuth.getValidSession().then(function (s) {
    if (s) location.replace('portal.html');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;

    var value = (email.value || '').trim();

    if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      show(badBox, 'Enter a valid email address.');
      email.focus();
      return;
    }

    // Honeypot + timing floor: both silently succeed so a bot learns nothing.
    if ((hp && hp.value) || Date.now() - loadedAt < 2500) {
      show(okBox, 'If that address has portal access, a sign-in link is on its way.');
      return;
    }

    setBusy(true);

    window.CWOAuth.sendMagicLink(value).then(function (r) {
      setBusy(false);
      if (r.ok || r.reason === 'error') {
        // Deliberately identical for known and unknown addresses.
        show(okBox, 'If that address has portal access, a sign-in link is on its way. '
                  + 'It expires in about an hour — check spam if it hasn’t arrived in a few minutes.');
        form.querySelector('.field').style.display = 'none';
        if (btn) btn.style.display = 'none';
        return;
      }
      if (r.reason === 'rate') {
        show(badBox, r.message);
        return;
      }
      show(badBox, 'Something went wrong sending your link. Email cwostrategygroup@gmail.com and we’ll sort it out.');
    }).catch(function () {
      setBusy(false);
      show(badBox, 'We couldn’t reach the sign-in service. Check your connection and try again.');
    });
  });
})();
