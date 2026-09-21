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
      return { src: '/joyshua/photos/' + dir + '/' + n + '.webp', w: p[0], h: p[1], label: p[2], alt: p[3] };
    });
  }

  var P = [1050, 1400];   // most are iPhone portrait

  window.POSTCARDS = [
    {
      title: 'Long Island City',
      front: { src: '/joyshua/photos/lic-postcard.webp', w: 1477, h: 937, alt: 'A vintage illustrated postcard reading "Greetings from Long Island City", with the Queensboro Bridge, the Manhattan skyline and the Pepsi-Cola sign.' },
      photos: set('lic', [
        [P[0], P[1], 'takeout on the floor',  'Dinner spread across a glass coffee table, eaten sitting on the rug.'],
        [P[0], P[1], 'cheers',                'Two hands clinking cocktails over a candlelit bar.'],
        [787,  1400, "i'm lovin' it",         'A selfie of two people lying down wearing paper McDonald\'s hats.'],
        [P[0], P[1], 'instant classic',       'A hand holding a Polaroid of the two of them standing together.'],
        [P[0], P[1], 'by the water',          'Friends lounging on the waterfront lawn chairs at golden hour.'],
        [P[0], P[1], 'home late',             'Walking up to a lit glass building entrance at night.'],
        [P[0], P[1], 'booth for two',         'The two of them smiling in a diner booth by a glass-block window.'],
        [P[0], P[1], 'breakfast bowls',       'Two fruit bowls on a white kitchen counter, her smiling behind them.'],
        [P[0], P[1], 'chef at work',          'Her plating food at the kitchen counter.'],
        [P[0], P[1], 'too close',             'A silly upside-down selfie of two faces pressed together.'],
        [P[0], P[1], 'red light era',         'Someone wearing a glowing red LED face mask.'],
        [P[0], P[1], 'dishwasher stretch',    'Her lunging in pajama pants while loading the dishwasher.'],
        [P[0], P[1], 'ice cream in bed',      'Her eating a pint of ice cream in bed.'],
        [P[0], P[1], 'wfh',                   'Her working at a standing desk with two monitors by the window.'],
        [P[0], P[1], 'chop chop',             'Her slicing food on a cutting board in the kitchen.'],
        [P[0], P[1], 'dinner for two',        'Her cooking at the counter with a bowl of soup ready.']
      ])
    },
    {
      title: 'Ithaca',
      front: { src: '/joyshua/photos/ithaca-postcard.webp', w: 1484, h: 948, alt: 'A vintage illustrated postcard reading "Greetings from Ithaca, NY", with a waterfall, the lake and a clock tower.' },
      photos: set('ithaca', [
        [P[0], P[1], 'hi ithaca',        'Her waving on a sunny street lined with old houses.'],
        [P[0], P[1], 'the red door',     'Her posing in front of a yellow house with a red front door.'],
        [P[0], P[1], 'collegetown',      'Her standing beside a car outside a yellow apartment building.'],
        [P[0], P[1], 'sunny walk',       'Her in a blue cap on a tree-lined sidewalk.'],
        [P[0], P[1], 'the library',      'Her standing in a tall ornate library with iron balconies.'],
        [P[0], P[1], 'fruit cheers',     'Three hands clinking cups of cut fruit.'],
        [P[0], P[1], 'night out',        'Her grinning in a crowded bar at night.'],
        [787,  1400, 'new friend',       'Her standing next to two alpacas on a farm.'],
        [P[0], P[1], 'alpaca farm',      'Walking through a field of alpacas under a big sky.'],
        [P[0], P[1], 'hello??',          'An alpaca pushing its nose right into the camera.'],
        [P[0], P[1], 'the falls',        'A selfie of the two of them in front of a tall waterfall in a gorge.'],
        [1400, 1050, 'apple picking',    'A kiss in the apple orchard, her biting an apple.'],
        [P[0], P[1], 'eggplant!',        'Her sticking her tongue out next to a huge eggplant.'],
        [P[0], P[1], 'last dinner',      'Her resting her chin on her hands at a restaurant table.']
      ])
    }
  ];
})();
