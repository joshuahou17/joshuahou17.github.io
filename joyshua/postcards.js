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
        w: p[0], h: p[1], label: p[2], alt: p[3],
        taken: p[4]                                              // when the picture was taken
      };
    });
  }

  var P = [1050, 1400];   // most are iPhone portrait

  window.POSTCARDS = [
    {
      title: 'Long Island City',
      front: { src: '/joyshua/photos/lic-postcard.webp', w: 1477, h: 937, alt: 'A vintage illustrated postcard reading "Greetings from Long Island City", with the Queensboro Bridge, the Manhattan skyline and the Pepsi-Cola sign.' },
      photos: set('lic', [
        [P[0], P[1], 'Groundhog Day!',        'Dinner spread across a glass coffee table, eaten sitting on the rug.', '2026-05-29T23:52'],
        [P[0], P[1], 'Bar Enzo',              'Two hands clinking cocktails over a candlelit bar.', '2026-05-30T01:24'],
        [787,  1400, "i'm lovin' it",         'A selfie of two people lying down wearing paper McDonald\'s hats.', '2026-05-30T23:40'],
        [P[0], P[1], 'first picture together','A hand holding a Polaroid of the two of them standing together.', '2026-05-31T01:33'],
        [P[0], P[1], 'Post-Groundhog Day',    'Friends lounging on the waterfront lawn chairs at golden hour.', '2026-06-01T00:21'],
        [P[0], P[1], 'home late',             'Walking up to a lit glass building entrance at night.', '2026-06-22T04:25'],
        [P[0], P[1], 'booth for two',         'The two of them smiling in a diner booth by a glass-block window.', '2026-07-20T03:50'],
        [P[0], P[1], 'breakfast bowls',       'Two fruit bowls on a white kitchen counter, her smiling behind them.', '2026-08-02T12:13'],
        [P[0], P[1], 'chef at work',          'Her plating food at the kitchen counter.', '2026-08-15T16:53'],
        [P[0], P[1], 'too close',             'A silly upside-down selfie of two faces pressed together.', '2026-08-16T01:12'],
        [P[0], P[1], 'Red light therapy',     'Someone wearing a glowing red LED face mask.', '2026-08-28T17:41'],
        [P[0], P[1], 'dishwasher stretch',    'Her lunging in pajama pants while loading the dishwasher.', '2026-08-28T17:51'],
        [P[0], P[1], 'She said yes!',         'Her eating a pint of ice cream in bed.', '2026-09-08T02:33'],
        [P[0], P[1], 'wfh',                   'Her working at a standing desk with two monitors by the window.', '2026-09-08T14:35'],
        [P[0], P[1], 'chop chop',             'Her slicing food on a cutting board in the kitchen.', '2026-09-11T17:09'],
        [P[0], P[1], "Mom's famous lentil soup",'Her cooking at the counter with a bowl of soup ready.', '2026-09-18T12:39']
      ])
    },
    {
      title: 'Ithaca',
      front: { src: '/joyshua/photos/ithaca-postcard.webp', w: 1484, h: 948, alt: 'A vintage illustrated postcard reading "Greetings from Ithaca, NY", with a waterfall, the lake and a clock tower.' },
      photos: set('ithaca', [
        [P[0], P[1], 'Home sweet home',  'Her waving on a sunny street lined with old houses.', '2026-09-18T17:58'],
        [P[0], P[1], 'collegetown',      'Her posing in front of a yellow house with a red front door.', '2026-09-18T18:47'],
        [P[0], P[1], 'Old room',         'Her standing beside a car outside a yellow apartment building.', '2026-09-18T18:48'],
        [P[0], P[1], 'Lin Street??',     'Her in a blue cap on a tree-lined sidewalk.', '2026-09-18T19:44'],
        [P[0], P[1], 'the library',      'Her standing in a tall ornate library with iron balconies.', '2026-09-18T20:58'],
        [P[0], P[1], 'God bless Toni Morrison','Three hands clinking cups of cut fruit.', '2026-09-18T22:16'],
        [P[0], P[1], 'night out',        'Her grinning in a crowded bar at night.', '2026-09-19T02:40'],
        [787,  1400, 'new friend',       'Her standing next to two alpacas on a farm.', '2026-09-19T15:09'],
        [P[0], P[1], 'alpaca farm',      'Walking through a field of alpacas under a big sky.', '2026-09-19T15:12'],
        [P[0], P[1], 'hello??',          'An alpaca pushing its nose right into the camera.', '2026-09-19T15:15'],
        [P[0], P[1], 'Ithaca is gorges', 'A selfie of the two of them in front of a tall waterfall in a gorge.', '2026-09-19T19:17'],
        [1400, 1050, 'apple picking',    'A kiss in the apple orchard, her biting an apple.', '2026-09-19T20:10'],
        [P[0], P[1], 'Fairytale eggplants >>','Her sticking her tongue out next to a huge eggplant.', '2026-09-19T20:22'],
        [P[0], P[1], 'Gangnam Style!',   'Her resting her chin on her hands at a restaurant table.', '2026-09-19T23:32']
      ])
    },
    {
      title: 'Manhattan',
      front: { src: '/joyshua/photos/manhattan-postcard.webp', w: 1489, h: 952, alt: 'A vintage illustrated postcard reading "Greetings from Manhattan, NY", with the Brooklyn Bridge and the skyline at sunset.' },
      photos: set('manhattan', [
        [P[0], P[1], 'first real date??',                  'Her taking a big bite of a taco at a counter.', '2026-06-06T21:27'],
        [787,  1400, 'upside down',                        'A sideways selfie of the two of them, faces close.', '2026-06-06T23:53'],
        [P[0], P[1], 'mirror selfie',                      'A mirror selfie of the two of them in a red-and-white diner.', '2026-06-07T07:15'],
        [787,  1400, 'last night before leaving Evercore', 'The two of them in blue Knicks caps in a crowd.', '2026-06-10T23:01'],
        [1400, 1050, 'still in our caps',                  'The two of them in Knicks caps at a restaurant booth.', '2026-06-11T02:29'],
        [P[0], P[1], 'our conference room',                '"J & J 6/11/26" written in pencil on a white wall.', '2026-06-11T04:35'],
        [P[0], P[1], 'signing goodbye',                    'Her standing at a big office window at night.', '2026-06-11T04:35'],
        [P[0], P[1], 'late at the office',                 'Their reflection in an office window over the city lights.', '2026-06-11T04:36'],
        [P[0], P[1], 'minetta tavern celebration',         'Her eating at a warmly lit restaurant bar.', '2026-06-12T00:18'],
        [P[0], P[1], 'joyce!',                             'Her on a quiet city street at night.', '2026-06-12T04:05'],
        [P[0], P[1], 'first indian food',                  'Her smiling at a candlelit table with a plate of food.', '2026-06-14T23:05'],
        [P[0], P[1], 'froyo!',                             'Her walking down an empty tree-lined street at night.', '2026-06-15T01:38'],
        [P[0], P[1], 'Georgies!',                          'Her at a restaurant table with a big pizza and pasta.', '2026-07-06T02:59'],
        [P[0], P[1], 'Asleep at Google office',            'Her curled up in an armchair with a laptop.', '2026-07-17T20:27'],
        [P[0], P[1], 'the bean (tribeca edition)',         'A mirror selfie of the two of them hugging, reflected in a shiny sculpture.', '2026-07-27T01:46'],
        [P[0], P[1], "Joyce's High School",                'Her posing outside Stuyvesant High School.', '2026-07-27T02:43'],
        [P[0], P[1], 'hard at work before The Odyssey',    'Her at a cafe table in a park lit up at night.', '2026-07-31T01:12'],
        [P[0], P[1], 'Cucumber monster',                   'Her walking between glass towers holding a cucumber.', '2026-07-31T23:35'],
        [1400, 788,  'tongues out',                        'A close-up selfie of the two of them sticking their tongues out.', '2026-08-03T00:55'],
        [1400, 788,  'on the train',                       'A selfie of the two of them smiling on the subway.', '2026-08-03T03:00'],
        [1400, 1050, 'Monkey Bar!',                        'The two of them with a giant slice of carrot cake.', '2026-08-04T17:45'],
        [P[0], P[1], 'Spiderman is also from Queens',      'Her in a red recliner at a movie theater.', '2026-08-09T21:21'],
        [1400, 788,  'twin',                               'A warm selfie of the two of them.', '2026-08-09T22:44'],
        [1400, 1050, 'walking couple',                     'A selfie of the two of them by a pond reflecting the skyline at night.', '2026-08-10T01:00'],
        [1400, 1050, 'upstairs at osamil',                 'The two of them smiling in a dim bar.', '2026-08-17T00:37'],
        [P[0], P[1], 'best birthday dinner OAT',           'Her holding a glass of white wine at a bar.', '2026-08-28T21:16'],
        [1000, 1400, 'rainy 5th ave mile',                 'The two of them running arm in arm through the rain at the 5th Avenue Mile.', '2026-09-15T18:42'],
        [P[0], P[1], 'inkind demons',                      'Her at a table full of plates by a window onto tall buildings.', '2026-09-17T22:39'],
        [P[0], P[1], 'off to school!',                     'Her leading the way by the hand onto a subway platform.', '2026-09-17T23:46']
      ])
    },
    {
      title: 'Brooklyn',
      front: { src: '/joyshua/photos/brooklyn-postcard.webp', w: 1489, h: 954, alt: 'A vintage illustrated postcard reading "Greetings from Brooklyn, NY", with the Brooklyn Bridge, a pizzeria and the Manhattan skyline.' },
      photos: set('brooklyn', [
        [P[0], P[1], 'radio bakery!',       'Her biting into a pastry on the sidewalk.', '2026-07-11T12:15'],
        [P[0], P[1], 'Smorgasburg',         'Her grinning behind a cup of meat skewers at an outdoor market.', '2026-07-11T15:25'],
        [P[0], P[1], 'peach please',        'Her taking a bite of a peach in a leafy backyard.', '2026-07-11T18:12'],
        [P[0], P[1], 'Laser Wolf',          'A selfie of the two of them at a restaurant counter.', '2026-07-12T00:05'],
        [1400, 1050, 'One of our favorite dinners','Dinner on a rooftop with the sun setting over the Manhattan skyline.', '2026-07-12T00:05'],
        [P[0], P[1], "who's the real dumbo?",'Her posing on a bridge walkway by a DUMBO sign.', '2026-09-13T22:33'],
        [1400, 1050, 'picnic in the park',  'A kiss on a picnic blanket in the grass, food spread out beside them.', '2026-09-13T23:07']
      ])
    },
    {
      title: 'Los Angeles',
      front: { src: '/joyshua/photos/la-postcard.webp', w: 1230, h: 786, alt: 'A vintage illustrated postcard reading "Greetings from Los Angeles, CA", with palm trees, the Hollywood sign, the beach and the Griffith Observatory.' },
      photos: set('la', [
        [787,  1400, 'wheels up',            'A sideways selfie of the two of them, cheek to cheek.', '2026-08-22T10:34'],
        [1400, 788,  'are we there yet',     'The two of them sticking their tongues out on a plane.', '2026-08-22T19:40'],
        [1400, 1050, 'golden hills',         'Her silhouetted against the sun over rolling hills.', '2026-08-23T11:22'],
        [1400, 1050, 'hike selfie',          'A sunny selfie of the two of them on a hilltop.', '2026-08-23T11:22'],
        [P[0], P[1], 'the getty',            'Her on the white stone steps of the Getty Center below a sculpture.', '2026-08-26T20:03'],
        [1400, 1050, 'view from the getty',  'The two of them on a stone terrace overlooking the hills.', '2026-08-26T20:10'],
        [P[0], P[1], 'in bloom',             'The two of them under trees of pink bougainvillea.', '2026-08-26T20:50'],
        [P[0], P[1], 'garden walk',          'A selfie of the two of them on a shady garden path.', '2026-08-26T20:52'],
        [P[0], P[1], 'secret garden',        'Her looking up under a leafy arch in a garden.', '2026-08-26T20:55'],
        [P[0], P[1], 'Newport Beach',        'The two of them standing under a vine-covered arbor.', '2026-08-26T20:56'],
        [1400, 788,  'blue skies',           'A selfie of the two of them against a bright blue sky.', '2026-08-26T23:13'],
        [P[0], P[1], 'cotton candy sky',     'Her on a path by the green at sunset under pink clouds.', '2026-08-26T23:35'],
        [P[0], P[1], 'drivedrivedrive',      'Her driving, smiling out the windshield.', '2026-08-27T01:14'],
        [1400, 788,  'Country club couple',  'Him hugging her from behind in front of a stone house.', '2026-08-27T02:35'],
        [P[0], P[1], 'marina mornings',      'Her walking along a marina boardwalk past the boats.', '2026-08-27T14:45'],
        [P[0], P[1], "airport mcd's",        'Her by the McDonald\'s at the airport with her suitcase.', '2026-08-27T17:07'],
        [P[0], P[1], 'matching eye masks',   'The two of them in sleep masks on a plane.', '2026-08-27T22:12']
      ])
    }
  ];
})();
