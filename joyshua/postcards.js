/* The postcards on /joyshua -- this list is the whole content of the page.
 *
 * Each postcard:
 *   title     shown under the photos in the viewer
 *   front     the postcard art on the desk (with its real width/height)
 *   photos    the series you flip through when the card is opened, oldest first.
 *             `label` is the words on that photo's scrapbook banner; the banner's
 *             style is picked by position, so neighbouring photos never match.
 *
 * Every image carries its real width/height, so the viewer can size its frame
 * before the image has loaded and nothing jumps. Photos were resized to 1400px
 * and stripped of all metadata (the originals carried GPS).
 */
(function () {
  function set(dir, list) {
    return list.map(function (p, i) {
      var n = (i < 9 ? '0' : '') + (i + 1);
      return {
        src: '/joyshua/photos/' + dir + '/' + n + '.webp',
        thumb: '/joyshua/photos/' + dir + '/t/' + n + '.webp',   // 360px square, for the grid
        w: p[0], h: p[1], label: p[2], alt: p[3]
      };
    });
  }

  var P = [1050, 1400];   // most are iPhone portrait

  window.POSTCARDS = [
    {
      title: 'Long Island City',
      front: { src: '/joyshua/photos/lic-postcard.webp', w: 1477, h: 937, alt: 'A vintage illustrated postcard reading "Greetings from Long Island City", with the Queensboro Bridge, the Manhattan skyline and the Pepsi-Cola sign.' },
      photos: set('lic', [
        [P[0], P[1], 'Groundhog Day!',        'Dinner spread across a glass coffee table, eaten sitting on the rug.'],
        [P[0], P[1], 'Bar Enzo',              'Two hands clinking cocktails over a candlelit bar.'],
        [787,  1400, "i'm lovin' it",         'A selfie of two people lying down wearing paper McDonald\'s hats.'],
        [P[0], P[1], 'first picture together','A hand holding a Polaroid of the two of them standing together.'],
        [P[0], P[1], 'Post-Groundhog Day',    'Friends lounging on the waterfront lawn chairs at golden hour.'],
        [P[0], P[1], 'home late',             'Walking up to a lit glass building entrance at night.'],
        [P[0], P[1], 'booth for two',         'The two of them smiling in a diner booth by a glass-block window.'],
        [P[0], P[1], 'breakfast bowls',       'Two fruit bowls on a white kitchen counter, her smiling behind them.'],
        [P[0], P[1], 'chef at work',          'Her plating food at the kitchen counter.'],
        [P[0], P[1], 'too close',             'A silly upside-down selfie of two faces pressed together.'],
        [P[0], P[1], 'Red light therapy',     'Someone wearing a glowing red LED face mask.'],
        [P[0], P[1], 'dishwasher stretch',    'Her lunging in pajama pants while loading the dishwasher.'],
        [P[0], P[1], 'She said yes!',         'Her eating a pint of ice cream in bed.'],
        [P[0], P[1], 'wfh',                   'Her working at a standing desk with two monitors by the window.'],
        [P[0], P[1], 'chop chop',             'Her slicing food on a cutting board in the kitchen.'],
        [P[0], P[1], "Mom's famous lentil soup",'Her cooking at the counter with a bowl of soup ready.']
      ])
    },
    {
      title: 'Ithaca',
      front: { src: '/joyshua/photos/ithaca-postcard.webp', w: 1484, h: 948, alt: 'A vintage illustrated postcard reading "Greetings from Ithaca, NY", with a waterfall, the lake and a clock tower.' },
      photos: set('ithaca', [
        [P[0], P[1], 'Home sweet home',  'Her waving on a sunny street lined with old houses.'],
        [P[0], P[1], 'collegetown',      'Her posing in front of a yellow house with a red front door.'],
        [P[0], P[1], 'Old room',         'Her standing beside a car outside a yellow apartment building.'],
        [P[0], P[1], 'Lin Street??',     'Her in a blue cap on a tree-lined sidewalk.'],
        [P[0], P[1], 'the library',      'Her standing in a tall ornate library with iron balconies.'],
        [P[0], P[1], 'God bless Toni Morrison','Three hands clinking cups of cut fruit.'],
        [P[0], P[1], 'night out',        'Her grinning in a crowded bar at night.'],
        [787,  1400, 'new friend',       'Her standing next to two alpacas on a farm.'],
        [P[0], P[1], 'alpaca farm',      'Walking through a field of alpacas under a big sky.'],
        [P[0], P[1], 'hello??',          'An alpaca pushing its nose right into the camera.'],
        [P[0], P[1], 'Ithaca is gorges', 'A selfie of the two of them in front of a tall waterfall in a gorge.'],
        [1400, 1050, 'apple picking',    'A kiss in the apple orchard, her biting an apple.'],
        [P[0], P[1], 'Fairytale eggplants >>','Her sticking her tongue out next to a huge eggplant.'],
        [P[0], P[1], 'Gangnam Style!',   'Her resting her chin on her hands at a restaurant table.']
      ])
    },
    {
      title: 'Manhattan',
      front: { src: '/joyshua/photos/manhattan-postcard.webp', w: 1489, h: 952, alt: 'A vintage illustrated postcard reading "Greetings from Manhattan, NY", with the Brooklyn Bridge and the skyline at sunset.' },
      photos: set('manhattan', [
        [P[0], P[1], 'taco night',         'Her taking a big bite of a taco at a counter.'],
        [787,  1400, 'upside down',        'A sideways selfie of the two of them, faces close.'],
        [P[0], P[1], 'mirror selfie',      'A mirror selfie of the two of them in a red-and-white diner.'],
        [787,  1400, 'knicks fans',        'The two of them in blue Knicks caps in a crowd.'],
        [1400, 1050, 'still in our caps',  'The two of them in Knicks caps at a restaurant booth.'],
        [P[0], P[1], 'office views',       'Her standing at a big office window at night.'],
        [P[0], P[1], 'late at the office', 'Their reflection in an office window over the city lights.'],
        [P[0], P[1], 'first bite',         'Her eating at a warmly lit restaurant bar.'],
        [P[0], P[1], 'night walk',         'Her on a quiet city street at night.'],
        [P[0], P[1], 'date night',         'Her smiling at a candlelit table with a plate of food.'],
        [P[0], P[1], 'midnight stroll',    'Her walking down an empty tree-lined street at night.'],
        [P[0], P[1], 'pizza night',        'Her at a restaurant table with a big pizza and pasta.'],
        [P[0], P[1], 'coworking',          'Her curled up in an armchair with a laptop.'],
        [P[0], P[1], 'mirror, mirror',     'A mirror selfie of the two of them hugging on the street.'],
        [P[0], P[1], 'stuy',               'Her posing outside Stuyvesant High School.'],
        [P[0], P[1], 'park nights',        'Her at a cafe table in a park lit up at night.'],
        [P[0], P[1], 'snack walk',         'Her walking between glass towers holding a cucumber.'],
        [1400, 788,  'tongues out',        'A close-up selfie of the two of them sticking their tongues out.'],
        [1400, 788,  'on the train',       'A selfie of the two of them smiling on the subway.'],
        [1400, 1050, 'carrot cake',        'The two of them with a giant slice of carrot cake.'],
        [P[0], P[1], 'movie night',        'Her in a red recliner at a movie theater.'],
        [1400, 788,  'golden hour',        'A warm selfie of the two of them.'],
        [1400, 1050, 'city lights',        'A selfie of the two of them by a pond reflecting the skyline at night.'],
        [1400, 1050, 'cocktail hour',      'The two of them smiling in a dim bar.'],
        [P[0], P[1], 'wine o\'clock',      'Her holding a glass of white wine at a bar.'],
        [P[0], P[1], 'lunch with a view',  'Her at a table full of plates by a window onto tall buildings.'],
        [P[0], P[1], 'off we go',          'Her leading the way by the hand onto a subway platform.']
      ])
    }
  ];
})();
