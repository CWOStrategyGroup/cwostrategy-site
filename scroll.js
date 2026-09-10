/* =============================================================================
   CWO Strategy Group — scroll.js  (v4)
   Zero dependencies. No GSAP, no CDN, no build step.

   Modules
   -------
   1. Nav + accessible off-canvas mobile drawer
   2. Copyright year
   3. Scroll progress bar
   4. IntersectionObserver reveals
   5. Hero word stagger
   6. Pinned horizontal rail          ← rewritten in v4
   7. Animated counters
   8. Parallax
   9. Form validation + honeypot + timing check
   10. Password visibility toggle

   Every module is wrapped in try/catch — one failure can never blank the page.

   v4 rail notes
   -------------
   The v3 rail computed travel against a track that was width-capped by .wrap,
   so `scrollWidth - innerWidth` was usually <= 0 and the pin appeared broken
   or juddered. v4:
     • measures the real track width (cap removed in CSS),
     • WRITES the section height as stickyHeight + travel, so 1px of vertical
       scroll moves the track exactly 1px sideways — no speed mismatch,
     • re-measures on resize and on font/image load,
     • tears everything down below 900px and under reduced motion.
   ============================================================================= */

(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.remove('no-js');

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* rAF-throttled scroll subscription — one listener for the whole page. */
  var readers = [];
  var ticking = false;

  function onFrame() {
    ticking = false;
    for (var i = 0; i < readers.length; i++) {
      try { readers[i](); } catch (e) { /* keep the rest alive */ }
    }
  }
  function requestFrame() {
    if (!ticking) { ticking = true; requestAnimationFrame(onFrame); }
  }
  function subscribe(fn) { readers.push(fn); fn(); }

  window.addEventListener('scroll', requestFrame, { passive: true });

  /* Resize handlers that need to re-measure before the next paint. */
  var resizers = [];
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizers.forEach(function (fn) { try { fn(); } catch (e) {} });
      requestFrame();
    }, 120);
  }, { passive: true });

  /* ====================================================================== */
  /*  1. NAV + MOBILE DRAWER                                                */
  /* ====================================================================== */
  function initNav() {
    var nav = $('[data-nav]');
    var toggle = $('[data-nav-toggle]');
    var panel = $('[data-nav-panel]');
    var scrim = $('[data-nav-scrim]');
    var lastFocused = null;

    if (nav && !nav.classList.contains('is-stuck')) {
      subscribe(function () {
        nav.classList.toggle('is-stuck', window.scrollY > 20);
      });
    }

    if (!toggle || !panel) return;

    var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea';

    function isOpen() { return panel.classList.contains('is-open'); }

    function open() {
      lastFocused = document.activeElement;
      panel.classList.add('is-open');
      if (scrim) scrim.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('is-locked');
      document.addEventListener('keydown', onKey);
      var first = $(FOCUSABLE, panel);
      if (first) first.focus();
    }

    function close(restore) {
      panel.classList.remove('is-open');
      if (scrim) scrim.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', onKey);
      if (restore !== false && lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;

      var items = $$(FOCUSABLE, panel).filter(function (el) {
        return el.offsetParent !== null;
      });
      if (!items.length) return;

      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    toggle.addEventListener('click', function () { isOpen() ? close() : open(); });
    if (scrim) scrim.addEventListener('click', function () { close(); });

    /* Closing on link click matters for same-page anchors, where no navigation
       happens and the drawer would otherwise stay open over the target. */
    $$('a', panel).forEach(function (a) {
      a.addEventListener('click', function () { if (isOpen()) close(false); });
    });

    /* Growing past the breakpoint while open must not leave body locked. */
    var mq = window.matchMedia('(min-width: 901px)');
    var onMQ = function (e) { if (e.matches && isOpen()) close(false); };
    if (mq.addEventListener) mq.addEventListener('change', onMQ);
    else if (mq.addListener) mq.addListener(onMQ);
  }

  /* ====================================================================== */
  /*  2. COPYRIGHT YEAR                                                     */
  /* ====================================================================== */
  function initYear() {
    var y = String(new Date().getFullYear());
    $$('[data-year]').forEach(function (el) { el.textContent = y; });
  }

  /* ====================================================================== */
  /*  3. SCROLL PROGRESS BAR                                                */
  /* ====================================================================== */
  function initProgress() {
    var bar = $('.progress');
    if (!bar) return;

    subscribe(function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? window.scrollY / h : 0;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    });
  }

  /* ====================================================================== */
  /*  4. REVEALS                                                            */
  /* ====================================================================== */
  function initReveal() {
    /* Rail children are excluded — an element parked off-screen to the right
       never intersects the viewport, so it would stay invisible forever. */
    var els = $$('.reveal, .step').filter(function (el) { return !el.closest('.rail'); });
    if (!els.length) return;

    if (REDUCED || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    els.forEach(function (el) { io.observe(el); });

    /* Safety net — nothing stays invisible if the observer misfires. */
    setTimeout(function () {
      $$('.reveal:not(.is-in), .step:not(.is-in)').forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in');
      });
    }, 2500);
  }

  /* ====================================================================== */
  /*  5. HERO WORD STAGGER                                                  */
  /* ====================================================================== */
  function initWords() {
    $$('[data-split]').forEach(function (h) {
      if (REDUCED) return;

      var i = 0;
      /* Wrap bare words only — inline tags such as the gradient span survive. */
      h.innerHTML = h.innerHTML.replace(/([^\s<>]+)(?![^<]*>)/g, function (w) {
        return '<span class="word" style="--i:' + (i++) + '"><span>' + w + '</span></span>';
      });
    });
  }

  /* ====================================================================== */
  /*  6. PINNED HORIZONTAL RAIL                                             */
  /* ====================================================================== */
  function initRail() {
    var rails = $$('[data-rail]');
    if (!rails.length) return;

    var desktop = window.matchMedia('(min-width: 901px)');

    rails.forEach(function (rail) {
      var sticky = $('.rail__sticky', rail);
      var track = $('.rail__track', rail);
      if (!sticky || !track) return;

      var travel = 0;      // horizontal distance the track must cover
      var active = false;

      function teardown() {
        active = false;
        rail.style.height = '';
        track.style.transform = '';
      }

      /* Measure, then size the section so vertical scroll maps 1:1 to
         horizontal travel. Called on load, resize, and font settle. */
      function measure() {
        if (REDUCED || !desktop.matches) { teardown(); return; }

        /* Clear the transform before measuring — a translated track reports
           the same scrollWidth, but clearing avoids a visible jump if the
           new travel is shorter than the current offset. */
        track.style.transform = 'translate3d(0,0,0)';
        rail.style.height = '';

        var stickyH = sticky.offsetHeight;
        travel = Math.max(0, track.scrollWidth - window.innerWidth);

        if (travel < 40) { teardown(); return; }   // nothing worth pinning

        active = true;
        rail.style.height = (stickyH + travel) + 'px';
        update();
      }

      function update() {
        if (!active) return;

        var rect = rail.getBoundingClientRect();
        var stickyH = sticky.offsetHeight;
        var scrollable = rail.offsetHeight - stickyH;
        if (scrollable <= 0) return;

        /* rect.top is 0 when the pin begins (allowing for the nav offset). */
        var navOffset = parseFloat(getComputedStyle(sticky).top) || 0;
        var progress = clamp((navOffset - rect.top) / scrollable, 0, 1);

        /* Rounding kills sub-pixel shimmer on the text inside the panels. */
        var x = Math.round(progress * travel);
        track.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
      }

      subscribe(update);
      resizers.push(measure);

      measure();

      /* Late layout shifts (system font metrics, SVG sizing) change
         scrollWidth after first paint. Re-measure twice, cheaply. */
      window.addEventListener('load', measure);
      setTimeout(measure, 400);

      var mq = window.matchMedia('(min-width: 901px)');
      var onMQ = function () { measure(); };
      if (mq.addEventListener) mq.addEventListener('change', onMQ);
      else if (mq.addListener) mq.addListener(onMQ);
    });
  }

  /* ====================================================================== */
  /*  7. ANIMATED COUNTERS                                                  */
  /* ====================================================================== */
  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length) return;

    function paint(el, value, decimals, suffix, prefix) {
      var n = decimals
        ? value.toFixed(decimals)
        : Math.round(value).toLocaleString('en-US');
      el.textContent = (prefix || '') + n + (suffix || '');
    }

    function run(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      if (isNaN(target)) return;

      var suffix = el.getAttribute('data-suffix') || '';
      var prefix = el.getAttribute('data-prefix') || '';
      var decimals = (String(target).split('.')[1] || '').length;

      if (REDUCED) { paint(el, target, decimals, suffix, prefix); return; }

      var start = null;
      var DUR = 1500;

      function step(ts) {
        if (start === null) start = ts;
        var p = clamp((ts - start) / DUR, 0, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        paint(el, target * eased, decimals, suffix, prefix);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if (!('IntersectionObserver' in window)) {
      els.forEach(run);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        run(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.4 });

    els.forEach(function (el) { io.observe(el); });
  }

  /* ====================================================================== */
  /*  8. PARALLAX                                                           */
  /* ====================================================================== */
  function initParallax() {
    var els = $$('[data-parallax]');
    if (!els.length || REDUCED) return;

    subscribe(function () {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) return;
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.15;
        var offset = (rect.top + rect.height / 2 - vh / 2) * speed;
        el.style.transform = 'translate3d(0,' + Math.round(-offset) + 'px,0)';
      });
    });
  }

  /* ====================================================================== */
  /*  9. FORMS                                                              */
  /* ====================================================================== */
  function initForms() {
    var EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

    $$('form[data-validate]').forEach(function (form) {
      var loadedAt = Date.now();
      var ok = $('[data-alert-ok]', form);
      var bad = $('[data-alert-bad]', form);
      var hp = $('.hp input', form);

      function setError(field, msg) {
        var input = $('.input', field);
        var slot = $('.err', field);
        if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (slot) {
          slot.textContent = msg || '';
          slot.classList.toggle('is-shown', !!msg);
        }
        return !msg;
      }

      function validateField(field) {
        var input = $('.input', field);
        if (!input) return true;

        var value = (input.value || '').trim();
        var label = (($('label', field) || {}).textContent || 'This field')
          .replace('*', '').trim();

        if (input.required && !value) return setError(field, label + ' is required.');
        if (value && input.type === 'email' && !EMAIL.test(value))
          return setError(field, 'Enter a valid email address.');
        if (value && input.minLength > 0 && value.length < input.minLength)
          return setError(field, 'Must be at least ' + input.minLength + ' characters.');

        return setError(field, '');
      }

      $$('.field', form).forEach(function (field) {
        var input = $('.input', field);
        if (!input) return;
        input.addEventListener('blur', function () { validateField(field); });
        input.addEventListener('input', function () {
          if (input.getAttribute('aria-invalid') === 'true') validateField(field);
        });
      });

      form.addEventListener('submit', function (e) {
        var fields = $$('.field', form);
        var valid = true;
        var firstBad = null;

        fields.forEach(function (field) {
          if (!validateField(field)) {
            valid = false;
            if (!firstBad) firstBad = field;
          }
        });

        if (!valid) {
          e.preventDefault();
          if (bad) {
            bad.textContent = 'Please fix the highlighted fields.';
            bad.classList.add('is-shown');
          }
          var input = firstBad && $('.input', firstBad);
          if (input) input.focus();
          return;
        }

        if (bad) bad.classList.remove('is-shown');

        /* --- Invisible bot filters -------------------------------------
           Honeypot: a real user never sees the field, so any value is a bot.
           Timing floor: nobody reads and completes a form in under 2.5s.
           Both fail SILENTLY with a success message so commodity spam
           software believes it worked and doesn't adapt.               */
        var isBot = (hp && hp.value) || (Date.now() - loadedAt < 2500);

        var demo = form.getAttribute('action') === '#' ||
                   !form.getAttribute('action');

        if (isBot || demo) {
          e.preventDefault();
          if (ok) {
            ok.textContent = form.getAttribute('data-success') ||
              'Thanks — your message is in. We reply within one business day.';
            ok.classList.add('is-shown');
          }
          if (!isBot) form.reset();
          return;
        }
        /* Real endpoint configured: let the browser submit normally. */
      });
    });
  }

  /* ====================================================================== */
  /*  10. PASSWORD VISIBILITY TOGGLE                                        */
  /* ====================================================================== */
  function initPwToggle() {
    $$('[data-pw-toggle]').forEach(function (btn) {
      var input = document.getElementById(btn.getAttribute('data-pw-toggle'));
      if (!input) return;

      btn.addEventListener('click', function () {
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.textContent = showing ? 'SHOW' : 'HIDE';
        btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
        btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        input.focus();
      });
    });
  }

  /* ====================================================================== */
  /*  BOOT                                                                  */
  /* ====================================================================== */
  function boot() {
    [
      initNav, initYear, initProgress, initWords, initReveal,
      initRail, initCounters, initParallax, initForms, initPwToggle
    ].forEach(function (fn) {
      try { fn(); } catch (err) {
        if (window.console) console.warn('[cwo] module failed:', err);
      }
    });
    requestFrame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
