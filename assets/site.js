/* =============================================================================
   CWO Strategy Group — site.js
   Nav, gentle scroll reveals, one scroll-linked diagram, and the lead form.
   Zero dependencies, no tracking.
   ========================================================================== */
(function () {
  'use strict';
  var doc = document.documentElement;
  window.__cwo = 1;
  doc.classList.remove('no-js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- nav ---------- */
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav__toggle');
  function closeNav(focusToggle) {
    nav.classList.remove('is-open');
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (focusToggle) toggle.focus();
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { var first = nav.querySelector('.nav__links a'); if (first) first.focus(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) closeNav(true);
    });
    nav.querySelectorAll('.nav__links a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open');
        document.body.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- reveals ---------- */
  var revealEls = document.querySelectorAll('.reveal, .step');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- scroll-linked: nav border, hero ease-out, vault diagram ---------- */
  var hero = document.querySelector('.hero__in[data-scroll]');
  var vaults = Array.prototype.slice.call(document.querySelectorAll('.vault'));
  var ticking = false;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function frame() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    var vh = window.innerHeight;
    if (nav) nav.classList.toggle('is-scrolled', y > 8);
    if (reduce) return;

    if (hero) {
      var t = clamp(y / (vh * 0.9), 0, 1);
      hero.style.transform = 'translate3d(0,' + (t * 40).toFixed(1) + 'px,0) scale(' + (1 - t * 0.04).toFixed(4) + ')';
      hero.style.opacity = (1 - t * 0.75).toFixed(3);
    }
    vaults.forEach(function (v) {
      var r = v.getBoundingClientRect();
      // 0 when the diagram's top enters the bottom of the screen, 1 when its middle reaches 45% height
      var p = clamp((vh - r.top) / (vh * 0.55 + r.height * 0.5), 0, 1);
      v.style.setProperty('--p', p.toFixed(3));
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  frame();

  /* ---------- footer year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });

  /* ---------- lead form ---------- */
  var ENDPOINT = 'https://ajfekzqnajmcpcvqadtj.supabase.co/functions/v1/submit-lead';
  var ANON_KEY = 'sb_publishable_kybffjlfwXJPt97Rs9tRKA_Bs5dWPBm';

  var form = document.querySelector('form[data-lead]');
  if (!form) return;

  // Preselect a service from ?interest=private-ai|websites
  var interest = new URLSearchParams(location.search).get('interest');
  if (interest) {
    var box = form.querySelector('input[name="services"][value="' + interest + '"]');
    if (box) box.checked = true;
  }

  var loadedAt = Date.now();
  var okBox = form.querySelector('[data-alert-ok]');
  var badBox = form.querySelector('[data-alert-bad]');
  var btn = form.querySelector('button[type="submit"]');
  var btnHTML = btn ? btn.innerHTML : '';
  var busy = false;

  function show(kind, msg) {
    [okBox, badBox].forEach(function (b) { if (b) { b.classList.remove('is-shown'); b.textContent = ''; } });
    var b = kind === 'ok' ? okBox : badBox;
    if (b) { b.textContent = msg; b.classList.add('is-shown'); b.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
  }

  function validate() {
    var ok = true;
    form.querySelectorAll('[required]').forEach(function (el) {
      var err = el.closest('.field') && el.closest('.field').querySelector('.err');
      var v = el.value.trim();
      var bad = !v || (el.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v));
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (err) err.textContent = bad ? (el.type === 'email' && v ? 'Enter a valid email address.' : 'This field is required.') : '';
      if (bad) ok = false;
    });
    return ok;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    if (!validate()) { show('bad', 'Please fix the highlighted fields.'); return; }

    // Field names match the submit-lead edge function: name, email, phone,
    // company, website, budget, services, message, hp_check (honeypot).
    var services = Array.prototype.slice.call(form.querySelectorAll('input[name="services"]:checked'))
      .map(function (i) { return i.value; }).join(', ');
    var payload = {
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      company: form.company.value,
      website: form.website.value,
      budget: form.budget.value,
      services: services,
      message: form.message.value,
      hp_check: form.hp_check.value,
      elapsed_ms: Date.now() - loadedAt,
      source_page: location.pathname
    };

    busy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, body: b }; });
    }).then(function (r) {
      busy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = btnHTML; }
      if (r.status === 200 && r.body.ok) {
        form.querySelectorAll('.field, .row, .form__submit').forEach(function (n) { n.style.display = 'none'; });
        show('ok', form.getAttribute('data-success'));
        return;
      }
      show('bad', (r.body && r.body.message) || 'Something went wrong. Please email cwostrategygroup@gmail.com or call 614-965-4283.');
    }).catch(function () {
      busy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = btnHTML; }
      show('bad', 'Could not reach our server. Please email cwostrategygroup@gmail.com or call 614-965-4283.');
    });
  });
})();
