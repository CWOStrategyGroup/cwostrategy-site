/**
 * CWO Strategy Group — Global JavaScript
 *
 * ROOT-CAUSE FIX (CORS):
 * The previous code sent Content-Type: application/json which triggers
 * a CORS preflight OPTIONS request. Google Apps Script cannot respond
 * to OPTIONS requests, so the browser blocks ALL requests before they
 * reach the server — producing "Unable to connect" on every page.
 *
 * Fix: Use Content-Type: text/plain;charset=utf-8 (a "simple" CORS
 * request). The browser sends it without preflight. Apps Script reads
 * the JSON body from e.postData.contents regardless of content-type.
 */

// ── Configuration ─────────────────────────────────────────────────
// SETUP INSTRUCTIONS:
//   1. Deploy Code.gs as a Web App (see Code.gs header for full steps).
//   2. Paste the Web App URL into APPS_SCRIPT_URL below.
//   3. In Stripe Dashboard → Developers → Payment Links, create links for
//      each plan and paste them below. Use live links in production,
//      test links during development.
//   4. When APPS_SCRIPT_URL is set, IS_DEMO_MODE turns off automatically
//      and all forms/portals connect to your live backend.
const CONFIG = {
  // Your deployed Google Apps Script Web App URL.
  // Get this from: Apps Script → Deploy → Manage Deployments → URL
  APPS_SCRIPT_URL:    'https://script.google.com/macros/s/AKfycbxrfwtXppyaGMq4DbDQyN3yL8R2FBTByyvjgDkefVVjqBz0_QDPhDUpyTXz_Z5QUGpw/exec',

  // Stripe Payment Links — replace test_ links with live_ links before going live.
  // Monthly Growth Plan ($50/month):
  STRIPE_MONTHLY_LINK:'https://buy.stripe.com/test_fZu28r5fN5UWbEJdVZdjO00',
  // One-Time Website Launch ($300):
  STRIPE_ONETIME_LINK:'https://buy.stripe.com/test_5kQ00jfUr2IK5glbNRdjO01',
};

// Demo mode is active when the URL has not been configured.
// Demo mode activates when APPS_SCRIPT_URL is not set or is a placeholder.
// When active: form submissions are blocked, a banner is shown, portals use mock data.
const IS_DEMO_MODE = (
  !CONFIG.APPS_SCRIPT_URL ||
  CONFIG.APPS_SCRIPT_URL === '' ||
  CONFIG.APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE'
);

// ── Utilities ─────────────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
  );
}

function showToast(message, type = 'success', duration = 4500) {
  let container = $('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

/**
 * apiPost(action, data)
 *
 * THE CRITICAL FIX is on the Content-Type line below.
 * 'text/plain;charset=utf-8' is one of the three content types that
 * qualify as a "simple" CORS request and require no preflight.
 * 'application/json' is NOT a simple type — it triggers a preflight
 * OPTIONS request that Apps Script cannot answer, killing all requests.
 */
async function apiPost(action, data = {}) {
  if (IS_DEMO_MODE) {
    throw new Error('DEMO_MODE');
  }

  const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method:   'POST',
    headers:  { 'Content-Type': 'text/plain;charset=utf-8' }, // ← CORS fix
    body:     JSON.stringify({ action, ...data }),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Server returned invalid JSON: ' + text.slice(0, 120));
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr || '—';
  return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}

function initials(name = '') {
  return String(name).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
}

// ── Navigation ────────────────────────────────────────────────────
function initNav() {
  const nav = $('.nav');
  if (!nav) return;

  const handleScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  const currentFile = window.location.pathname.split('/').pop() || 'index.html';
  $$('.nav__link').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href === currentFile || (currentFile === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  const hamburger = $('.nav__hamburger');
  const mobileMenu = $('.nav__mobile');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = hamburger.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(open));
      mobileMenu.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    $$('.nav__mobile-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }
}

// ── Scroll Animations ─────────────────────────────────────────────
function initScrollAnimations() {
  if (!window.IntersectionObserver) return;
  const observer = new IntersectionObserver(
    entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }),
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  $$('.fade-up').forEach(el => observer.observe(el));
}

// ── Counters ──────────────────────────────────────────────────────
function animateCounter(el, target, duration = 1800) {
  const suffix  = el.dataset.suffix || '';
  const isFloat = target % 1 !== 0;
  const start   = performance.now();
  const update  = ts => {
    const p = Math.min((ts - start) / duration, 1);
    const v = (1 - Math.pow(1 - p, 3)) * target;
    el.textContent = (isFloat ? v.toFixed(1) : Math.round(v)) + suffix;
    if (p < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function initCounters() {
  if (!window.IntersectionObserver) return;
  const observer = new IntersectionObserver(
    entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target, parseFloat(entry.target.dataset.target));
        observer.unobserve(entry.target);
      }
    }),
    { threshold: 0.5 }
  );
  $$('[data-target]').forEach(el => observer.observe(el));
}

// ── Mailing List ──────────────────────────────────────────────────
function initMailingList() {
  $$('.mailing-form').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const input    = form.querySelector('.mailing-input');
      const btn      = form.querySelector('.mailing-btn');
      const email    = input?.value?.trim() || '';
      const original = btn.textContent;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Please enter a valid email address.', 'error');
        return;
      }

      btn.textContent = 'Subscribing...';
      btn.disabled = true;

      try {
        const res = await apiPost('subscribe', { email });
        if (res.success) {
          showToast('You have been added to our mailing list.', 'success');
          input.value = '';
        } else {
          showToast(res.message || 'Subscription failed. Please try again.', 'error');
        }
      } catch (err) {
        if (err.message === 'DEMO_MODE') {
          showToast('Backend not configured yet — see README.md for setup.', 'info');
        } else {
          showToast('Unable to subscribe at this time. Please try again.', 'error');
        }
      } finally {
        btn.textContent = original;
        btn.disabled = false;
      }
    });
  });
}

// ── Consultation Form ─────────────────────────────────────────────
function initConsultationForm() {
  const form = $('#consultation-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn  = form.querySelector('[type=submit]');
    const data = Object.fromEntries(new FormData(form));

    for (const field of ['name','email','business','service','message']) {
      if (!data[field]?.trim()) {
        showToast(`Please complete the "${field}" field.`, 'error');
        return;
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Sending...';
    btn.disabled  = true;

    try {
      const res = await apiPost('consultation', data);
      if (res.success) {
        form.innerHTML = `
          <div style="text-align:center;padding:56px 24px">
            <div style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;color:var(--gold);margin-bottom:16px">
              Thank you, ${escHtml(data.name)}.
            </div>
            <p style="color:var(--text-secondary);max-width:480px;margin:0 auto">
              Your consultation request has been received. A member of our
              team will be in touch within one business day to schedule your
              free strategy call.
            </p>
          </div>`;
        return;
      }
      showToast(res.message || 'Submission failed. Please try again.', 'error');
    } catch (err) {
      if (err.message === 'DEMO_MODE') {
        showToast('Backend not configured yet. See README.md for setup instructions.', 'info');
      } else {
        showToast('Network error. Please try again shortly.', 'error');
      }
    }

    btn.innerHTML = orig;
    btn.disabled  = false;
  });
}

// ── Accordion ─────────────────────────────────────────────────────
function initAccordion() {
  $$('.accordion-item').forEach(item => {
    const trigger  = item.querySelector('.accordion-trigger');
    const content  = item.querySelector('.accordion-content');
    const iconWrap = item.querySelector('.accordion-icon');
    if (!trigger || !content) return;

    trigger.addEventListener('click', () => {
      const open = item.classList.toggle('open');
      content.style.maxHeight = open ? content.scrollHeight + 'px' : '0';
      if (iconWrap) iconWrap.style.transform = open ? 'rotate(45deg)' : 'rotate(0)';
      trigger.setAttribute('aria-expanded', String(open));
    });
  });
}

// ── Tabs ──────────────────────────────────────────────────────────
function initTabs() {
  $$('.tabs').forEach(group => {
    const triggers = group.querySelectorAll('[data-tab]');
    const panels   = group.querySelectorAll('[data-panel]');
    triggers.forEach(trigger => {
      trigger.addEventListener('click', () => {
        const id = trigger.dataset.tab;
        triggers.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
        panels.forEach(p => p.classList.toggle('active', p.dataset.panel === id));
      });
    });
  });
}

// ── Smooth Scroll ─────────────────────────────────────────────────
function initSmoothScroll() {
  $$('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        window.scrollTo({
          top: target.getBoundingClientRect().top + window.scrollY - 96,
          behavior: 'smooth',
        });
      }
    });
  });
}

/**
 * buildStarRating(container, inputId)
 *
 * Renders 5 interactive star buttons inside `container`.
 * When a star is clicked, the hidden input with id `inputId` is updated.
 *
 * Named buildStarRating (not initStarRating) to avoid overwriting
 * initAutoStarRatings below when this is re-declared inside portals.
 */
function buildStarRating(container, inputId) {
  if (!container) return;
  if (container.dataset.built) return; // prevent double-init
  container.dataset.built = '1';

  const input  = inputId ? document.getElementById(inputId) : null;
  let selected = 0;

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.style.cssText = 'cursor:pointer;display:inline-block;margin-right:4px';
    star.setAttribute('role', 'button');
    star.setAttribute('tabindex', '0');
    star.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
    star.innerHTML = `<svg viewBox="0 0 20 20" style="width:26px;height:26px;stroke:var(--gold);stroke-width:1;fill:none;transition:fill 0.15s"><polygon points="10,1 12.9,7 19.5,7.6 14.5,12.1 16.2,18.5 10,15 3.8,18.5 5.5,12.1 0.5,7.6 7.1,7"/></svg>`;

    const fill = n => container.querySelectorAll('svg').forEach((s, idx) => {
      s.style.fill = idx < n ? 'var(--gold)' : 'none';
    });

    star.addEventListener('mouseenter', () => fill(i));
    star.addEventListener('mouseleave', () => fill(selected));
    star.addEventListener('click', () => { selected = i; if (input) input.value = i; fill(i); });
    star.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault(); selected = i; if (input) input.value = i; fill(i);
      }
    });
    container.appendChild(star);
  }
}

// Auto-init any .star-rating element that has a following hidden input
function initAutoStarRatings() {
  $$('.star-rating').forEach(el => {
    const input = el.nextElementSibling;
    const id    = input?.id || null;
    buildStarRating(el, id);
  });
}

// ── Demo mode banner on public pages ──────────────────────────────
function initDemoModeBanner() {
  // Only show on pages that have interactive forms
  const hasForms = !!($('#consultation-form') || $('.mailing-form'));
  if (!IS_DEMO_MODE || !hasForms) return;

  const bar = document.createElement('div');
  bar.setAttribute('role', 'status');
  bar.style.cssText = [
    'position:fixed;bottom:0;left:0;right:0;z-index:9999',
    'background:rgba(7,11,23,0.95);border-top:1px solid rgba(201,168,76,0.4)',
    'color:var(--gold);font-size:0.78rem;text-align:center;padding:9px 16px',
    'font-family:Outfit,sans-serif;letter-spacing:0.05em',
  ].join(';');
  bar.textContent = 'DEMO MODE — Set APPS_SCRIPT_URL in script.js to enable backend. See README.md.';
  document.body.appendChild(bar);
}

// ── DOMContentLoaded Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initScrollAnimations();
  initCounters();
  initMailingList();
  initConsultationForm();
  initAccordion();
  initTabs();
  initSmoothScroll();
  initAutoStarRatings();
  initDemoModeBanner();
});
