/* Push the swing.
 *
 * The idle swing is pure CSS -- if nobody ever clicks it, this file does nothing
 * but add one listener. A click adds energy the way a real push does: the arc gets
 * wider, the rhythm does not change. A pendulum's period is independent of its
 * amplitude, so leaving the CSS animation's duration alone is both the physically
 * correct behaviour and the reason the swing never jumps mid-arc when clicked.
 *
 * The decay back to rest is a CSS transition on --swing-amp (a registered custom
 * property, so it interpolates). No per-frame JavaScript anywhere.
 */
(function () {
  'use strict';

  var REST = 10;    // degrees, matches --swing-amp in the stylesheet
  var PUSH = 8;     // added per click
  var MAX = 22;     // a shove, not a loop-the-loop; also keeps the hands on screen

  function currentAmp(el) {
    var raw = getComputedStyle(el).getPropertyValue('--swing-amp');
    var deg = parseFloat(raw);
    return isNaN(deg) ? REST : deg;
  }

  function push(el) {
    var next = Math.min(currentAmp(el) + PUSH, MAX);
    // Jump to the wider arc, then let the stylesheet's transition ease it back down.
    el.style.transition = 'none';
    el.style.setProperty('--swing-amp', next + 'deg');
    void el.offsetWidth; // flush, so the jump is not swallowed by the transition
    el.style.transition = '';
    el.style.removeProperty('--swing-amp');
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
