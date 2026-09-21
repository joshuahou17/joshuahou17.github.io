/* The postcards on /joyshua -- this list is the whole content of the page.
 *
 * Each postcard:
 *   title     the handwritten heading on the card and in the viewer
 *   caption   a line or two of handwriting on the back
 *   place     round postmark text (keep it short, it curves)
 *   date      the date stamped in the middle of the postmark
 *   photos    the series you flip through when the card is opened; the first
 *             one is the picture on the front of the card, the second (if any)
 *             is shrunk into the stamp
 *
 * Every photo carries its real width/height, so the viewer can size its frame
 * before the image has loaded and nothing jumps.
 */
window.POSTCARDS = [
  {
    title: 'New York',
    caption: 'late nights, rooftops, the whole skyline lit up for us',
    place: 'NEW YORK · NY',
    date: 'SEP 2026',
    photos: [
      { src: '/photos/4060.webp', w: 1200, h: 900,  alt: 'Friends at a rooftop table with the lit Manhattan skyline behind them.' },
      { src: '/friends.jpg',      w: 1280, h: 831,  alt: 'Three friends walking down a New York City street at night, seen from behind, wearing backpacks.' },
      { src: '/photos/4320.webp', w: 1200, h: 900,  alt: 'An orange sunset over the river and the city skyline.' }
    ]
  },
  {
    title: 'Summer',
    caption: 'grill smoke, string lights, and a lake that went pink at dusk',
    place: 'SOMEWHERE · SUN',
    date: 'JUL 2026',
    photos: [
      { src: '/photos/3999.webp', w: 1200, h: 900,  alt: 'A lake at dusk with low hills along the far shore.' },
      { src: '/photos/3492.webp', w: 900,  h: 1200, alt: 'Four friends standing around a grill in a backyard at dusk, string lights in the hedges behind them.' },
      { src: '/photos/3978.webp', w: 900,  h: 1200, alt: 'Two plates of sliced steak on a wooden table.' },
      { src: '/photos/3730.webp', w: 1200, h: 900,  alt: 'Five friends on a riverside path on a bright day, a bridge in the distance.' }
    ]
  },
  {
    title: 'Home',
    caption: 'the couch, the long table, the photo booth. wish you were here',
    place: 'HOME · SWEET',
    date: 'AUG 2026',
    photos: [
      { src: '/photos/4570.webp', w: 1189, h: 791,  alt: 'A photo booth picture of two people laughing together.' },
      { src: '/photos/3792.webp', w: 1200, h: 900,  alt: 'Friends sprawled across a couch in a living room with a brick wall.' },
      { src: '/photos/4125.webp', w: 1200, h: 900,  alt: 'A laptop open on a long wooden dining table late at night.' }
    ]
  }
];
