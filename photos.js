/* Click the photo for another one.
 *
 * The pictures are a mix of landscape and portrait, and at this column width a
 * portrait shot stands about 190px taller than a landscape one. Left alone, the
 * footer underneath would jump by that much on every click. So the slot's height
 * is computed from the aspect ratio of whichever photo is showing and eased
 * between the two, and the footer glides instead of snapping.
 *
 * Every photo's dimensions are known up front, so the height is set before the
 * new image has loaded -- the layout never settles twice.
 */
(function () {
  'use strict';

  var MAX_W = 380;      // matches .photo max-width
  var MAX_H = 440;      // matches .photo max-height
  var MAX_VH = 0.48;    // ...which is also capped against the viewport, so a portrait
                        // shot cannot push the footer off a short window
  var GUTTER = 40;      // body padding on the narrow breakpoint

  var SHOTS = [
    { src: 'friends.jpg',      w: 1280, h: 831,  alt: 'Three friends walking down a New York City street at night, seen from behind, wearing backpacks.' },
    { src: 'photos/3492.webp', w: 900,  h: 1200, alt: 'Four friends standing around a grill in a backyard at dusk, string lights in the hedges behind them.' },
    { src: 'photos/3730.webp', w: 1200, h: 900,  alt: 'Five friends on a riverside path on a bright day, a bridge in the distance.' },
    { src: 'photos/3792.webp', w: 1200, h: 900,  alt: 'Friends sprawled across a couch in a living room with a brick wall.' },
    { src: 'photos/3978.webp', w: 900,  h: 1200, alt: 'Two plates of sliced steak on a wooden table.' },
    { src: 'photos/3999.webp', w: 1200, h: 900,  alt: 'A lake at dusk with low hills along the far shore.' },
    { src: 'photos/4060.webp', w: 1200, h: 900,  alt: 'Friends at a rooftop table with the lit Manhattan skyline behind them.' },
    { src: 'photos/4125.webp', w: 1200, h: 900,  alt: 'A laptop open on a long wooden dining table late at night.' },
    { src: 'photos/4320.webp', w: 1200, h: 900,  alt: 'An orange sunset over the river and the city skyline.' },
    { src: 'photos/4570.webp', w: 1189, h: 791,  alt: 'A photo booth picture of two people laughing together.' }
  ];

  var slot, button, img;
  var current = 0;
  var queue = [];

  function slotHeight(shot) {
    var maxW = Math.min(MAX_W, window.innerWidth - GUTTER);
    var maxH = Math.min(MAX_H, window.innerHeight * MAX_VH);
    return Math.round(Math.min(maxW / (shot.w / shot.h), maxH));
  }

  function setHeight() {
    slot.style.height = slotHeight(SHOTS[current]) + 'px';
  }

  // A proper shuffle: walk the whole set before any repeat, and never start a new
  // pass on the photo that is already showing.
  function refill() {
    var rest = [];
    for (var i = 0; i < SHOTS.length; i++) if (i !== current) rest.push(i);
    for (var j = rest.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = rest[j]; rest[j] = rest[k]; rest[k] = t;
    }
    queue = rest;
  }

  function preload(i) {
    if (i == null) return;
    var p = new Image();
    p.src = SHOTS[i].src;
  }

  function show(i) {
    var shot = SHOTS[i];
    current = i;
    img.src = shot.src;
    img.alt = shot.alt;
    img.width = shot.w;
    img.height = shot.h;
    setHeight();
    preload(queue[0]);
  }

  function next() {
    if (!queue.length) refill();
    show(queue.shift());
  }

  function ready() {
    slot = document.querySelector('.shots');
    button = document.querySelector('.shot');
    img = document.querySelector('.photo');
    if (!slot || !button || !img) return;

    refill();
    setHeight();
    preload(queue[0]);

    button.addEventListener('click', next);

    var pending = false;
    window.addEventListener('resize', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; setHeight(); });
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
