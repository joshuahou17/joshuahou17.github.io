/* Cursor-tracking mascot. Vanilla port of page-mascot's React component:
   same sectors, hysteresis, dead zone, boop reactions and squash timing.
   Two 3x3 sheets shown at background-size 300%, so switching cells is just
   a background-position step. No per-frame JS, no dependencies. */
(function () {
  'use strict';

  var DIRECTIONS = ['up-left', 'up', 'up-right', 'left', 'center', 'right', 'down-left', 'down', 'down-right'];
  var REACTIONS = ['blink', 'heart', 'sparkle', 'surprised', 'wink', 'bashful', 'sleepy', 'dizzy', 'delighted'];

  // Clockwise from the right, matching atan2 with y pointing down.
  var CLOCKWISE = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
  var SECTOR = (Math.PI * 2) / CLOCKWISE.length;
  var HYSTERESIS = 0.12;
  var DEAD_ZONE = 70;

  var PAYOFFS = ['heart', 'sparkle', 'delighted'];
  var BOOP_PAYOFF = 120;
  var BOOP_END = 560;
  var SQUASH_MS = 420;
  var DIZZY_AFTER = 4;
  var DIZZY_WINDOW = 1600;
  var DIZZY_END = 1100;

  var SQUASH = [
    { transform: 'scale(1, 1)', easing: 'ease-in' },
    { transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
    { transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
    { transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
    { transform: 'scale(1, 1)' }
  ];

  function cellPosition(index) {
    return (index % 3) * 50 + '% ' + Math.floor(index / 3) * 50 + '%';
  }

  function wrap(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function layerStyle(node, url) {
    node.style.position = 'absolute';
    node.style.inset = '0';
    node.style.backgroundImage = 'url("' + url + '")';
    node.style.backgroundSize = '300% 300%';
    node.style.backgroundRepeat = 'no-repeat';
  }

  function mountMascot(host) {
    var directions = host.getAttribute('data-directions');
    var reactions = host.getAttribute('data-reactions');
    if (!directions || !reactions) return;

    var size = parseInt(host.getAttribute('data-size'), 10) || 140;
    var label = host.getAttribute('data-label') || 'mascot';

    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Boop the ' + label);
    button.style.cssText =
      'position:relative;display:block;flex-shrink:0;padding:0;border:0;' +
      'background:transparent;appearance:none;-webkit-appearance:none;' +
      'cursor:pointer;user-select:none;-webkit-user-select:none;';
    button.style.width = size + 'px';
    button.style.height = size + 'px';

    var squash = document.createElement('span');
    squash.style.cssText = 'position:relative;display:block;width:100%;height:100%;transform-origin:50% 78%;';

    var dirLayer = document.createElement('span');
    var reactLayer = document.createElement('span');
    layerStyle(dirLayer, directions);
    layerStyle(reactLayer, reactions);
    dirLayer.style.backgroundPosition = cellPosition(DIRECTIONS.indexOf('center'));
    // Always present so the sheet is fetched up front, never on the first click.
    reactLayer.style.backgroundPosition = cellPosition(REACTIONS.indexOf('blink'));
    reactLayer.style.opacity = '0';

    squash.appendChild(dirLayer);
    squash.appendChild(reactLayer);
    button.appendChild(squash);
    host.appendChild(button);

    function setDirection(name) {
      dirLayer.style.backgroundPosition = cellPosition(DIRECTIONS.indexOf(name));
    }

    function setReaction(name) {
      if (name) {
        reactLayer.style.backgroundPosition = cellPosition(REACTIONS.indexOf(name));
        reactLayer.style.opacity = '1';
        dirLayer.style.opacity = '0';
      } else {
        reactLayer.style.opacity = '0';
        dirLayer.style.opacity = '1';
      }
    }

    /* ---- cursor tracking ---- */
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      var sector = -1;
      var pointer = null;

      var aim = function () {
        if (!pointer) return;
        var box = button.getBoundingClientRect();
        var dx = pointer.x - (box.left + box.width / 2);
        var dy = pointer.y - (box.top + box.height / 2);

        if (Math.hypot(dx, dy) < DEAD_ZONE) {
          sector = -1;
          setDirection('center');
          return;
        }

        // Hold the current sector until the pointer is well past its edge.
        var angle = Math.atan2(dy, dx);
        if (sector !== -1 && Math.abs(wrap(angle - sector * SECTOR)) < SECTOR / 2 + HYSTERESIS) {
          return;
        }

        sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length;
        setDirection(CLOCKWISE[sector]);
      };

      window.addEventListener('pointermove', function (event) {
        pointer = { x: event.clientX, y: event.clientY };
        aim();
      }, { passive: true });
      window.addEventListener('scroll', aim, { passive: true });
    }

    /* ---- boop ---- */
    var timers = [];
    var boops = { count: 0, at: 0 };

    button.addEventListener('click', function () {
      timers.forEach(clearTimeout);
      timers = [];

      var later = function (ms, next) {
        timers.push(setTimeout(function () { setReaction(next); }, ms));
      };

      var now = Date.now();
      boops.count = now - boops.at < DIZZY_WINDOW ? boops.count + 1 : 1;
      boops.at = now;

      if (boops.count >= DIZZY_AFTER) {
        boops.count = 0;
        setReaction('dizzy');
        later(DIZZY_END, null);
      } else {
        setReaction('blink');
        later(BOOP_PAYOFF, PAYOFFS[(boops.count - 1) % PAYOFFS.length]);
        later(BOOP_END, null);
      }

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      // Per-keyframe easing with the effect itself linear: an easing on the effect
      // would reinterpret every offset and front-load the whole bounce.
      if (squash.animate) squash.animate(SQUASH, { duration: SQUASH_MS, easing: 'linear' });
    });
  }

  function init() {
    var hosts = document.querySelectorAll('[data-mascot]');
    for (var i = 0; i < hosts.length; i++) mountMascot(hosts[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
