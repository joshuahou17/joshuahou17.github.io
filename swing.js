/* Push the swing.
 *
 * The idle swing is pure CSS -- if nobody ever clicks it, this file does nothing
 * but add one listener.
 *
 * A click adds energy the way a real push does. Two rules make it feel right:
 *
 *   1. Only the AMPLITUDE changes, never the period. A pendulum's timing does not
 *      depend on how hard you push it, so the animation's duration is left alone.
 *      That also means the phase is untouched: he carries on from exactly where he
 *      was, travelling the same way, just further -- and a longer arc in the same
 *      time is literally more speed.
 *   2. The amplitude RAMPS rather than jumps. Setting it instantly moved him to a
 *      new position mid-arc, which read as a glitch; easing it up over a few
 *      hundred milliseconds keeps his position continuous, so the push looks like
 *      a shove rather than a teleport.
 *
 * The ramp up and the long settle back are both CSS transitions on --swing-amp
 * (a registered custom property, so it interpolates). No per-frame JavaScript.
 */
(function () {
  'use strict';

  var REST = 16;      // degrees; matches --swing-amp in the stylesheet
  var PUSH = 9;       // added per click
  var MAX = 34;       // a shove, not a loop-the-loop
  var RAMP = 380;     // ms to reach the wider arc -- the shove itself
  var SETTLE = 7000;  // ms to drift back down to REST

  var RAMP_EASE = 'cubic-bezier(0.18, 0.8, 0.32, 1)';
  var SETTLE_EASE = 'cubic-bezier(0.32, 0.4, 0.3, 1)';

  var timer = null;

  function currentAmp(el) {
    var deg = parseFloat(getComputedStyle(el).getPropertyValue('--swing-amp'));
    return isNaN(deg) ? REST : deg;
  }

  function push(el) {
    var next = Math.min(currentAmp(el) + PUSH, MAX);

    // Ease up to the wider arc. Position stays continuous, so he keeps going the
    // way he was already going -- he just reaches further.
    el.style.transition = '--swing-amp ' + RAMP + 'ms ' + RAMP_EASE;
    el.style.setProperty('--swing-amp', next + 'deg');

    // Then let it bleed off, the way a real swing loses height.
    clearTimeout(timer);
    timer = setTimeout(function () {
      el.style.transition = '--swing-amp ' + SETTLE + 'ms ' + SETTLE_EASE;
      el.style.removeProperty('--swing-amp');
    }, RAMP);
  }

  function ready() {
    var el = document.querySelector('.swing');
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.addEventListener('click', function () { push(el); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
