(function () {
  'use strict';

  var navWeekdays = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  document.querySelectorAll('.tab-btn').forEach(function (button, index) {
    if (!navWeekdays[index] || button.querySelector('.nav-weekday')) return;
    var weekday = document.createElement('span');
    weekday.className = 'nav-weekday';
    weekday.textContent = navWeekdays[index];
    button.appendChild(weekday);
  });

  var summaries = {
    day1: [['08:00', 'Depart Taoyuan Airport'], ['11:15', 'Arrive at Fukuoka Airport'], ['13:00', 'Light lunch in Fukuoka City'], ['15:00+', 'Hotel check-in & city sightseeing'], ['18:00', 'Dinner at Miyanaka Bettei']],
    day2: [['09:10', 'Depart Ritz; pick up group'], ['10:06', 'Arrive at Hisayama Country Club'], ['11:06', 'First tee time (second group 11:14)'], ['18:00', 'Dinner at Chinpunkampun Hakata']],
    day3: [['Morning', 'Itoshima coast & forest stops'], ['Lunch', 'Itoshima lunch options'], ['16:00', 'Leave the final stop by this time'], ['17:30', 'Dinner at Sukiyaki Yamashou']],
    day4: [['07:55', 'Depart Ritz; pick up group'], ['09:00', 'Arrive at Dazaifu Golf Club'], ['10:00', 'First tee time (second group 10:08)'], ['18:00', 'Dinner at Mizutaki Nagano']],
    day5: [['07:50', 'Depart Ritz; pick up group'], ['09:08', 'Arrive at Fukuoka Century Golf Club'], ['10:08', 'First tee time (second group 10:16)'], ['After golf', 'Transfer everyone to Fukuoka Airport first; 2 staying guests then return to the Ritz'], ['20:55', 'BR101 departs Fukuoka']]
  };

  var golfQuickInfo = {
    day2: [['Hotel departure', '09:10 Ritz → Mitsui'], ['Tee Time', '11:06 / 11:14'], ['Dress highlight', 'Wear a jacket or suit on arrival.', 'dress']],
    day4: [['Hotel departure', '07:55 Ritz → Mitsui'], ['Tee Time', '10:00 / 10:08'], ['Dress highlight', 'Wear a jacket or suit on arrival.', 'dress']],
    day5: [['Hotel departure', '07:50 Ritz → Mitsui'], ['Tee Time', '10:08 / 10:16'], ['Dress highlight', 'Wear a blazer or golf jacket.', 'dress']]
  };

  var mapLinks = {
    day2: 'https://www.google.com/maps/search/?api=1&query=Hisayama+Country+Club',
    day4: 'https://www.google.com/maps/search/?api=1&query=Dazaifu+Golf+Club',
    day5: 'https://www.google.com/maps/search/?api=1&query=Fukuoka+Century+Golf+Club'
  };

  var routeStops = [
    ['Sakurai Futamigaura', 'Priority | White torii gate & Couple Rocks', 'https://www.google.com/maps/search/?api=1&query=Sakurai+Futamigaura'],
    ['Palm-tree Swing', 'Priority | PALM BEACH THE GARDENS', 'https://www.google.com/maps/search/?api=1&query=Palm+Tree+Swing+Itoshima'],
    ['Totoro Forest', 'If time allows | Approx. 1 km on foot; short but uneven trail', 'https://www.google.com/maps/search/?api=1&query=Totoro+Forest+Itoshima'],
    ['Keya no Oto', 'If time allows | Boat service depends on weather', 'https://www.google.com/maps/search/?api=1&query=Keya+no+Oto+Itoshima'],
    ['Raizan Sennyoji Daihioin', 'Priority, earlier afternoon | Autumn foliage usually peaks in late November', 'https://www.google.com/maps/search/?api=1&query=Raizan+Sennyoji+Daihioin']
  ];

  var courseDetails = {
    day2: {
      description: [
        'Hisayama opened in Fukuoka in 1964. Designed and supervised by three professional golfers—Torakichi Nakamura, Takehito Fujii and Yoshimasa Fujii—it is one of Fukuoka Prefecture\'s oldest courses. At about 6,075 yards, it may not appear long, but it plays more challenging than the distance suggests. Strategically placed bunkers reward careful landing zones and shot planning.',
        'It hosted the Japan Professional Golf East–West Match in 1970 and the Japan Women\'s Professional Golf Championship in 1974.'
      ],
      dress: [
        ['Clubhouse', ['Wear a jacket or suit on arrival.', 'Avoid T-shirts, tank tops and sleeveless tops.', 'Avoid jeans, sportswear and workwear.', 'Crocs, wooden sandals and flip-flops are not permitted.']],
        ['Course', ['Wear a sleeved collared or mock-neck shirt; crew-neck tops do not meet the code.', 'Tuck shirts into trousers or skirts, except women\'s overblouses.', 'Undershirts and tank tops may not be worn alone.', 'Jeans and workwear are not permitted.', 'Wear soft-spike or spikeless golf shoes; metal spikes are prohibited.', 'A hat is required on the course for safety and heat protection.']]
      ]
    },
    day4: {
      description: [
        'Dazaifu Golf Club is an 18-hole, par-72 course within a short drive of central Fukuoka, with convenient access from the airport and major stations. Its varied terrain includes uphill and downhill shots plus challenging water hazards.',
        'Gently rolling fairways keep the round engaging without becoming overly difficult. The greens use fine-leaved zoysia grass, and the club has hosted the Japan Women\'s Open.'
      ],
      dress: [['', ['Wear a jacket or suit on arrival.', 'Avoid collarless or sleeveless tops and backless shoes such as Crocs or sandals.', 'Tuck shirts into trousers or skirts.', 'Wear soft-spike or spikeless golf shoes; metal spikes are prohibited.', 'A hat is required during play for safety.', 'Repair bunker footprints, divots and ball marks.', 'Maintain pace of play, targeting 2 hours 15 minutes per nine holes.']]]
    },
    day5: {
      description: [
        'One of Kyushu\'s premier courses, often described as both one of the region\'s most challenging and most beautiful. Although set on rolling terrain, the fairways are relatively level and the design calls for every club in the bag. A practice hole on each nine makes it Japan\'s first 20-hole facility.',
        'The club hosted multiple women\'s tournaments from 1973 to 2011, including the Vernal Cup RKB Ladies, the Vernal Ladies and the Fundokin Women\'s tournament. In 2026 it also hosts the NIKKEN Holdings Cup Open Golf Tournament and the Children\'s Cafeteria Support Charity Golf Tournament.'
      ],
      dress: [
        ['Clubhouse', ['Wear a blazer or golf jacket.', 'Slippers and sandals are not permitted.', 'Waist-length tops, sweaters and T-shirts are not permitted.', 'Jeans and work trousers are not permitted.', 'Wear a collared, sleeved shirt tucked into trousers or a skirt.']],
        ['Course', ['Do not drape towels around the neck or shoulders.', 'Knee-high socks are recommended with shorts.', 'Wear a hat to help prevent heatstroke.', 'Wear soft-spike or spikeless golf shoes; metal spikes are prohibited.']]
      ]
    }
  };

  function makeMapButton(url, label) {
    var link = document.createElement('a');
    link.className = 'v2-nav-button';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', label + ' directions in Google Maps');
    link.innerHTML = '<i class="fa-solid fa-location-arrow" aria-hidden="true"></i><span>Directions</span>';
    return link;
  }

  function makeHeading(title) {
    var head = document.createElement('div');
    head.className = 'v2-block-head';
    var heading = document.createElement('h3');
    heading.textContent = title;
    head.appendChild(heading);
    return head;
  }

  Object.keys(summaries).forEach(function (dayId) {
    var page = document.getElementById(dayId);
    var dayHead = page && page.querySelector('.day-head');
    if (!dayHead) return;
    var section = document.createElement('section');
    section.className = 'v2-summary';
    section.setAttribute('aria-label', "Today's Summary");
    var summaryHead = makeHeading("Today's Summary");
    if (dayId === 'day1') {
      var serviceRow = page.querySelector('.v2-service-row');
      var serviceLink = serviceRow && serviceRow.querySelector('.v2-service-link');
      if (serviceLink) {
        summaryHead.appendChild(serviceLink);
        serviceRow.remove();
      }
    }
    section.appendChild(summaryHead);
    var list = document.createElement('ol');
    list.className = 'v2-summary-list';
    summaries[dayId].forEach(function (entry) {
      var item = document.createElement('li');
      var time = document.createElement('time');
      var copy = document.createElement('span');
      time.textContent = entry[0];
      copy.textContent = entry[1];
      item.appendChild(time);
      item.appendChild(copy);
      list.appendChild(item);
    });
    section.appendChild(list);
    dayHead.insertAdjacentElement('afterend', section);
  });

  Object.keys(golfQuickInfo).forEach(function (dayId) {
    var summary = document.querySelector('#' + dayId + ' .v2-summary');
    if (!summary) return;
    var section = document.createElement('section');
    section.className = 'v2-golf-quick';
    section.setAttribute('aria-label', 'Golf day quick information');
    section.appendChild(makeHeading('Golf Day Quick Info'));
    var grid = document.createElement('dl');
    grid.className = 'v2-quick-grid';
    golfQuickInfo[dayId].forEach(function (entry) {
      var cell = document.createElement('div');
      if (entry[2] === 'dress') cell.className = 'v2-quick-dress';
      var term = document.createElement('dt');
      var value = document.createElement('dd');
      term.textContent = entry[0];
      value.textContent = entry[1];
      cell.appendChild(term);
      cell.appendChild(value);
      grid.appendChild(cell);
    });
    section.appendChild(grid);

    if (dayId === 'day4') {
      var paceNote = document.createElement('p');
      paceNote.className = 'v2-pace-note';
      paceNote.textContent = 'Pace reminder: target 2 hr 15 min per nine holes';
      section.appendChild(paceNote);
    }

    var action = document.createElement('div');
    action.className = 'v2-quick-action';
    action.appendChild(makeMapButton(mapLinks[dayId], document.querySelector('#' + dayId + ' .day-head h2').textContent));
    action.querySelector('span').textContent = 'Open in Google Maps';
    section.appendChild(action);
    summary.insertAdjacentElement('afterend', section);
  });

  Object.keys(golfQuickInfo).forEach(function (dayId) {
    var page = document.getElementById(dayId);
    var courseInfo = page && page.querySelector('.course-info');
    if (!courseInfo) return;
    courseInfo.querySelectorAll('.info-cell').forEach(function (cell) {
      var label = cell.querySelector('b');
      if (label && label.textContent.trim() === 'Tee Time') cell.remove();
      if (label && label.textContent.trim() === 'Note') cell.remove();
    });
  });

  document.querySelectorAll('.contact a[href*="google.com/maps"], .contact a[href*="maps.app.goo.gl"]').forEach(function (sourceLink) {
    if (sourceLink.classList.contains('contact-action')) return;
    var item = sourceLink.closest('.item');
    var title = item && item.querySelector('h3');
    if (!title) return;
    sourceLink.classList.add('v2-nav-button');
    sourceLink.setAttribute('aria-label', title.textContent + ' directions in Google Maps');
    sourceLink.innerHTML = '<i class="fa-solid fa-location-arrow" aria-hidden="true"></i><span>Open in Google Maps</span>';
  });

  var hotelMaps = [
    ['The Ritz-Carlton, Fukuoka', 'https://www.google.com/maps/search/?api=1&query=The+Ritz-Carlton+Fukuoka'],
    ['Mitsui Garden Hotel Fukuoka Nakasu', 'https://www.google.com/maps/search/?api=1&query=Mitsui+Garden+Hotel+Fukuoka+Nakasu']
  ];
  var tripToolsSubtitle = document.querySelector('#more > .day-head > p');
  if (tripToolsSubtitle) tripToolsSubtitle.remove();
  document.querySelectorAll('#hotels .hotel').forEach(function (hotel, index) {
    if (!hotelMaps[index]) return;
    var destination = hotel.querySelector('div:last-child');
    var officialLink = destination && destination.querySelector(':scope > a');
    if (!destination || !officialLink) return;
    var actions = document.createElement('div');
    actions.className = 'v2-map-actions v2-hotel-map-actions';
    actions.appendChild(officialLink);
    var mapButton = makeMapButton(hotelMaps[index][1], hotelMaps[index][0]);
    mapButton.querySelector('span').textContent = 'Open in Google Maps';
    actions.appendChild(mapButton);
    destination.appendChild(actions);
  });

  document.querySelectorAll('#day3 .stop-list li').forEach(function (stop) {
    if (stop.textContent.indexOf('Totoro Forest') === 0) stop.textContent = 'Totoro Forest · Approx. 1 km on foot; short but uneven trail';
    if (stop.textContent.indexOf('Raizan Sennyoji Daihioin') === 0) stop.textContent = 'Raizan Sennyoji Daihioin · Autumn foliage usually peaks in late November';
  });

  var day3StopLinks = [
    ['Sakurai Futamigaura', routeStops[0][2]],
    ['Palm-tree swings & PALM BEACH THE GARDENS', routeStops[1][2]],
    ['Totoro Forest', routeStops[2][2]],
    ['Keya no Oto', routeStops[3][2]],
    ['Raizan Sennyoji Daihioin', routeStops[4][2]]
  ];

  document.querySelectorAll('#day3 .timeline > .item:first-child .stop-list > li').forEach(function (item) {
    var fullText = item.textContent.trim();
    var destination = day3StopLinks.find(function (entry) { return fullText.indexOf(entry[0]) === 0; });
    if (!destination) return;
    var link = document.createElement('a');
    link.className = 'v2-inline-map-link';
    link.href = destination[1];
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', destination[0] + ' directions in Google Maps');
    link.textContent = destination[0];
    item.textContent = '';
    item.appendChild(link);
    item.appendChild(document.createTextNode(fullText.slice(destination[0].length)));
  });

  Object.keys(courseDetails).forEach(function (dayId) {
    var page = document.getElementById(dayId);
    var caption = page && page.querySelector('.panel .caption');
    var dress = page && page.querySelector('.dress');
    if (!caption || !dress) return;
    var intro = document.createElement('section');
    intro.className = 'course-intro';
    var introHeading = document.createElement('h3');
    introHeading.textContent = 'Course Overview';
    intro.appendChild(introHeading);
    courseDetails[dayId].description.forEach(function (paragraph) {
      var copy = document.createElement('p');
      copy.textContent = paragraph;
      intro.appendChild(copy);
    });
    caption.insertAdjacentElement('afterend', intro);
    var officialLink = dress.querySelector('.link-pill');
    officialLink = officialLink && officialLink.cloneNode(true);
    dress.textContent = '';
    var dressHeading = document.createElement('h4');
    dressHeading.innerHTML = '<i class="fa-solid fa-shirt" aria-hidden="true"></i>Dress Code';
    dress.appendChild(dressHeading);
    courseDetails[dayId].dress.forEach(function (group) {
      if (group[0]) {
        var groupHeading = document.createElement('p');
        var strong = document.createElement('strong');
        strong.textContent = group[0];
        groupHeading.appendChild(strong);
        dress.appendChild(groupHeading);
      }
      var list = document.createElement('ul');
      group[1].forEach(function (rule) {
        var item = document.createElement('li');
        item.textContent = rule;
        list.appendChild(item);
      });
      dress.appendChild(list);
    });
    if (officialLink) dress.appendChild(officialLink);
  });

  document.querySelectorAll('#day2 .dress, #day4 .dress, #day5 .dress').forEach(function (dress) {
    var wrapper = document.createElement('details');
    wrapper.className = 'v2-accordion';
    var summary = document.createElement('summary');
    summary.textContent = 'Course Rules & Dress Code';
    var content = document.createElement('div');
    content.className = 'v2-accordion-content';
    dress.parentNode.insertBefore(wrapper, dress);
    content.appendChild(dress);
    wrapper.appendChild(summary);
    wrapper.appendChild(content);
  });

  var desktopDetailsQuery = window.matchMedia('(min-width: 1024px)');

  function syncDesktopDetails() {
    document.querySelectorAll('details').forEach(function (details) {
      if (desktopDetailsQuery.matches) {
        if (!details.hasAttribute('data-mobile-open')) {
          details.setAttribute('data-mobile-open', details.open ? 'true' : 'false');
        }
        details.open = true;
        return;
      }
      if (details.hasAttribute('data-mobile-open')) {
        details.open = details.getAttribute('data-mobile-open') === 'true';
        details.removeAttribute('data-mobile-open');
      }
    });
  }

  document.addEventListener('click', function (event) {
    if (!desktopDetailsQuery.matches || !event.target.closest) return;
    if (event.target.closest('details > summary')) event.preventDefault();
  });

  if (desktopDetailsQuery.addEventListener) {
    desktopDetailsQuery.addEventListener('change', syncDesktopDetails);
  } else {
    desktopDetailsQuery.addListener(syncDesktopDetails);
  }
  syncDesktopDetails();

  document.querySelectorAll('.day-weather').forEach(function (weather) {
    var label = weather.querySelector('.v2-weather-label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'v2-weather-label';
      weather.appendChild(label);
    }
    function syncWeatherLabel() {
      label.textContent = weather.classList.contains('wx-live') ? 'Weather reference' : '(Historical)';
    }
    syncWeatherLabel();
    new MutationObserver(syncWeatherLabel).observe(weather, { attributes: true, attributeFilter: ['class'] });
  });

  var tripDays = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
  var nowParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  var parts = {};
  nowParts.forEach(function (part) { parts[part.type] = part.value; });
  var today = parts.year + '-' + parts.month + '-' + parts.day;
  var todayIndex = tripDays.indexOf(today);
  if (todayIndex !== -1) {
    [todayIndex, todayIndex + 1].forEach(function (index, stateIndex) {
      if (!tripDays[index]) return;
      var head = document.querySelector('#day' + (index + 1) + ' .v2-block-head');
      if (!head) return;
      var badge = document.createElement('span');
      badge.className = 'v2-day-state';
      badge.dataset.state = stateIndex === 0 ? 'today' : 'next';
      badge.textContent = stateIndex === 0 ? 'Today' : 'Next';
      head.appendChild(badge);
    });
  }
})();
