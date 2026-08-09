/* alcoia — site behaviour.
 *
 * Vanilla JS, no build step, no dependencies (brief §14). Everything here is
 * progressive enhancement: the HTML ships fully readable and navigable with
 * this file absent (§7 "site must be fully readable with JavaScript
 * disabled"), and every effect is disabled under prefers-reduced-motion.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // no-js -> js already happened synchronously in a head/body script
  // (see base.html) so .reveal never flashes visible before this runs.

  /* ── footer year ───────────────────────────────────────────────────── */
  var yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ── hero signature moment (§7 moment 1): wordmark is already visible in
     the static HTML; the IPA line fades in ~200ms after via its own
     transition-delay. Not scroll-triggered — it always plays once on load. */
  var heroIpa = document.querySelector('.hero-ipa');
  if (heroIpa) requestAnimationFrame(function () { heroIpa.classList.add('is-visible'); });

  /* ── quick-check quiz cards (e.g. the home-page reading demo) ────────
     Mirrors the real product's rule: a right answer just ends it, a wrong
     one gets an explanation and the correct choice is revealed (§4, §13.1).
     Generic over any [data-quiz] block, not just the one on the home page. */
  document.querySelectorAll('[data-quiz]').forEach(function (group) {
    var choices = group.querySelectorAll('.qcard__choice');
    var feedback = group.parentElement.querySelector('[data-quiz-feedback]');
    var explain = group.parentElement.querySelector('[data-quiz-explain]');

    choices.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var correctBtn = group.querySelector('[data-correct]');
        var pickedCorrect = btn.hasAttribute('data-correct');

        choices.forEach(function (b) { b.disabled = true; });
        if (pickedCorrect) {
          btn.classList.add('is-correct');
        } else {
          btn.classList.add('is-wrong');
          if (correctBtn) correctBtn.classList.add('is-correct');
        }

        if (feedback) {
          feedback.textContent = pickedCorrect
            ? 'Right — that ends it.'
            : 'Not quite — here’s the one that was.';
        }
        if (explain && !pickedCorrect) explain.classList.add('is-visible');
      });
    });
  });

  /* ── mobile nav toggle ─────────────────────────────────────────────── */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.setAttribute('data-open', 'false');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ── scroll reveals ────────────────────────────────────────────────── */
  var revealables = document.querySelectorAll('.reveal, .line-reveal');

  if ('IntersectionObserver' in window && revealables.length) {
    // Stagger siblings that share a .reveal-group parent.
    document.querySelectorAll('.reveal-group').forEach(function (group) {
      var i = 0;
      group.querySelectorAll(':scope > .reveal, :scope > .line-reveal').forEach(function (el) {
        el.style.setProperty('--reveal-delay', i * 75 + 'ms');
        i++;
      });
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target); // reveal once, never re-animate
          }
        });
      },
      { threshold: 0.01, rootMargin: '0px 0px -15% 0px' }
    );
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // Wrap line-reveal text content in a span for the mask/translate effect.
  document.querySelectorAll('.line-reveal').forEach(function (el) {
    if (el.querySelector('span')) return;
    var span = document.createElement('span');
    span.textContent = el.textContent;
    el.textContent = '';
    el.appendChild(span);
  });

  /* ── the pinned reading demo (§9.1, §7 signature moment 2) ──────────
   * A short passage where, as the visitor scrolls through the pinned
   * stage, one paragraph dims and a question card rises in. Pure
   * scroll-position math — no scroll-jacking, native scroll throughout,
   * so it never traps keyboard or wheel input (§11). Under reduced motion
   * or no-JS the CSS fallback (motion.css) shows everything settled.
   */
  var demo = document.querySelector('[data-demo]');
  if (demo && !reduceMotion) {
    var track = demo.querySelector('[data-demo-track]');
    var target = demo.querySelector('[data-demo-target]');
    var others = demo.querySelectorAll('[data-demo-dim]');
    var card = demo.querySelector('[data-demo-card]');

    var onScroll = function () {
      var rect = track.getBoundingClientRect();
      var vh = window.innerHeight;
      // progress: 0 when track top enters viewport, 1 when track bottom leaves
      var total = rect.height - vh;
      var progress = total > 0 ? (-rect.top) / total : 0;
      progress = Math.max(0, Math.min(1, progress));

      if (progress > 0.28) {
        others.forEach(function (p) { p.classList.add('is-dimmed'); });
        target.classList.add('is-target');
      } else {
        others.forEach(function (p) { p.classList.remove('is-dimmed'); });
        target.classList.remove('is-target');
      }
      if (progress > 0.55) {
        card.classList.add('is-visible');
      } else {
        card.classList.remove('is-visible');
      }
    };

    var ticking = false;
    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          requestAnimationFrame(function () {
            onScroll();
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );
    onScroll();
  } else if (demo) {
    // static fallback: show the "after" state permanently
    demo.querySelectorAll('[data-demo-dim]').forEach(function (p) { p.classList.add('is-dimmed'); });
    var t = demo.querySelector('[data-demo-target]');
    if (t) t.classList.add('is-target');
    var c = demo.querySelector('[data-demo-card]');
    if (c) c.classList.add('is-visible');
  }

  /* ── damped wheel scroll (desktop, opt-in "buttery" feel, §7) ────────
   * Applies lerp only to mouse-wheel deltas on a plain page scroll.
   * Deliberately does not touch touch/trackpad momentum (already smooth,
   * and hijacking it is a well-known mobile a11y antipattern), does not
   * touch keyboard scrolling (Page Down / arrows stay native and instant,
   * which keyboard and screen-reader users depend on), and steps aside
   * entirely over any element that scrolls its own overflow (tables,
   * the mobile nav panel) or under reduced motion.
   */
  if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
    var current = window.scrollY;
    var wheelTarget = window.scrollY;
    var raf = null;
    var LERP = 0.09;

    var settle = function () {
      current += (wheelTarget - current) * LERP;
      if (Math.abs(wheelTarget - current) < 0.5) {
        current = wheelTarget;
        raf = null;
        window.scrollTo(0, current);
        return;
      }
      window.scrollTo(0, current);
      raf = requestAnimationFrame(settle);
    };

    window.addEventListener(
      'wheel',
      function (e) {
        if (e.ctrlKey || e.metaKey) return; // pinch-zoom, leave native
        var scrollableParent = e.target.closest('[data-native-scroll]');
        if (scrollableParent) return;

        e.preventDefault();
        var max = document.documentElement.scrollHeight - window.innerHeight;
        wheelTarget = Math.max(0, Math.min(max, wheelTarget + e.deltaY));
        current = window.scrollY;
        if (!raf) raf = requestAnimationFrame(settle);
      },
      { passive: false }
    );

    window.addEventListener('scroll', function () {
      if (!raf) wheelTarget = window.scrollY;
    });
  }

  /* ── home page logo reveal on scroll ─────────────────────────────────
     When hero scrolls out, logo animates in left-to-right. When scrolling
     back, logo animates out right-to-left. */
  var heroWord = document.querySelector('.hero-word');
  var navWordmark = document.querySelector('.site-header .wordmark');
  var siteHeader = document.querySelector('.site-header');
  if (heroWord && navWordmark && siteHeader) {
    document.body.classList.add('is-home');
    var checkLogoVisibility = function () {
      var heroRect = heroWord.getBoundingClientRect();
      var heroOutOfView = heroRect.bottom < 0;
      if (heroOutOfView) {
        if (!navWordmark.classList.contains('is-visible')) {
          navWordmark.classList.remove('is-hiding');
          navWordmark.classList.add('is-visible');
          siteHeader.classList.add('is-visible');
        }
      } else {
        if (navWordmark.classList.contains('is-visible')) {
          navWordmark.classList.remove('is-visible');
          navWordmark.classList.add('is-hiding');
          siteHeader.classList.remove('is-visible');
          setTimeout(function () {
            navWordmark.classList.remove('is-hiding');
          }, 500);
        }
      }
    };
    window.addEventListener('scroll', checkLogoVisibility);
    checkLogoVisibility();
  }
})();
