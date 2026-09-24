(function () {
  'use strict';

  var summaries = {
    day1: [
      ['08:00', '桃園機場起飛'],
      ['11:15', '抵達福岡機場'],
      ['抵達後', '專車接送・福岡市區觀光'],
      ['18:00', '宮中 別邸燒肉晚餐']
    ],
    day2: [
      ['09:10', '麗思出發，依序接人'],
      ['10:06', '抵達久山鄉村俱樂部'],
      ['11:06', '第一組 Tee Time（第二組 11:14）'],
      ['18:00', 'Chinpunkampun Hakata 晚餐']
    ],
    day3: [
      ['上午', '糸島海岸與森林景點'],
      ['午餐', '糸島午餐備選'],
      ['16:00', '最晚由最後一站出發'],
      ['17:30', '壽喜燒 山翔晚餐']
    ],
    day4: [
      ['07:55', '麗思出發，依序接人'],
      ['09:00', '抵達太宰府高爾夫俱樂部'],
      ['10:00', '第一組 Tee Time（第二組 10:08）'],
      ['18:00', '水炊 長野晚餐']
    ],
    day5: [
      ['07:50', '麗思出發，依序接人'],
      ['09:08', '抵達福岡世紀高爾夫俱樂部'],
      ['10:08', '第一組 Tee Time（第二組 10:16）'],
      ['球後', '全員先前往福岡機場'],
      ['20:55', 'BR101 福岡起飛']
    ]
  };

  var golfQuickInfo = {
    day2: [
      ['飯店出發', '09:10 麗思 → 三井'],
      ['抵達球場', '10:06'],
      ['Tee Time', '11:06 / 11:14'],
      ['進行方式', '不休息連續打球'],
      ['裝備提醒', '帽子、高爾夫鞋'],
      ['天氣參考', '20° / 13°']
    ],
    day4: [
      ['飯店出發', '07:55 麗思 → 三井'],
      ['抵達球場', '09:00'],
      ['Tee Time', '10:00 / 10:08'],
      ['進行方式', '餐別待確認'],
      ['裝備提醒', '夾克、有領上衣、帽子'],
      ['天氣參考', '19° / 12°']
    ],
    day5: [
      ['飯店出發', '07:50 麗思 → 三井'],
      ['抵達球場', '09:08'],
      ['Tee Time', '10:08 / 10:16'],
      ['進行方式', '餐別待確認'],
      ['裝備提醒', 'Blazer、有領上衣、高爾夫鞋'],
      ['天氣參考', '20° / 12°']
    ]
  };

  var mapLinks = {
    day2: 'https://www.google.com/maps/search/?api=1&query=Hisayama+Country+Club',
    day4: 'https://www.google.com/maps/search/?api=1&query=Dazaifu+Golf+Club',
    day5: 'https://www.google.com/maps/search/?api=1&query=Fukuoka+Century+Golf+Club'
  };

  var routeStops = [
    ['櫻井二見浦', '白色鳥居與夫婦岩', 'https://www.google.com/maps/search/?api=1&query=Sakurai+Futamigaura'],
    ['棕櫚樹鞦韆', 'PALM BEACH THE GARDENS', 'https://www.google.com/maps/search/?api=1&query=Palm+Tree+Swing+Itoshima'],
    ['龍貓森林', '步道短，但有起伏', 'https://www.google.com/maps/search/?api=1&query=Totoro+Forest+Itoshima'],
    ['芥屋大門', '遊船視天候開航', 'https://www.google.com/maps/search/?api=1&query=Keya+no+Oto+Itoshima'],
    ['雷山千如寺大悲王院', '賞楓', 'https://www.google.com/maps/search/?api=1&query=Raizan+Sennyoji+Daihioin']
  ];

  function makeMapButton(url, label) {
    var link = document.createElement('a');
    link.className = 'v2-nav-button';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', label + ' Google Maps 導航');
    link.innerHTML = '<i class="fa-solid fa-location-arrow" aria-hidden="true"></i><span>導航</span>';
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
    section.setAttribute('aria-label', '今日摘要');
    section.appendChild(makeHeading('今日摘要'));

    var list = document.createElement('ol');
    list.className = 'v2-summary-list';
    summaries[dayId].forEach(function (entry) {
      var item = document.createElement('li');
      var time = document.createElement('time');
      time.textContent = entry[0];
      var text = document.createElement('span');
      text.textContent = entry[1];
      item.appendChild(time);
      item.appendChild(text);
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
    section.setAttribute('aria-label', '高爾夫快速資訊');
    section.appendChild(makeHeading('Golf Day Quick Info'));

    var grid = document.createElement('dl');
    grid.className = 'v2-quick-grid';
    golfQuickInfo[dayId].forEach(function (entry) {
      var cell = document.createElement('div');
      var term = document.createElement('dt');
      var value = document.createElement('dd');
      term.textContent = entry[0];
      value.textContent = entry[1];
      cell.appendChild(term);
      cell.appendChild(value);
      grid.appendChild(cell);
    });
    section.appendChild(grid);
    summary.insertAdjacentElement('afterend', section);
  });

  var day3Summary = document.querySelector('#day3 .v2-summary');
  if (day3Summary) {
    var route = document.createElement('section');
    route.className = 'v2-route';
    route.setAttribute('aria-label', '糸島路線時間軸');
    route.appendChild(makeHeading('Route Timeline'));

    var routeList = document.createElement('ol');
    routeList.className = 'v2-route-list';
    routeStops.forEach(function (stop) {
      var item = document.createElement('li');
      item.className = 'v2-route-stop';
      var copy = document.createElement('div');
      copy.innerHTML = '<b></b><small></small>';
      copy.querySelector('b').textContent = stop[0];
      copy.querySelector('small').textContent = stop[1];
      item.appendChild(copy);
      item.appendChild(makeMapButton(stop[2], stop[0]));
      routeList.appendChild(item);
    });
    route.appendChild(routeList);
    day3Summary.insertAdjacentElement('afterend', route);
  }

  Object.keys(mapLinks).forEach(function (dayId) {
    var courseInfo = document.querySelector('#' + dayId + ' .course-info');
    if (!courseInfo) return;
    var actions = document.createElement('div');
    actions.className = 'v2-map-actions';
    actions.appendChild(makeMapButton(mapLinks[dayId], document.querySelector('#' + dayId + ' .day-head h2').textContent));
    courseInfo.insertAdjacentElement('afterend', actions);
  });

  document.querySelectorAll('.contact a[href*="google.com/maps"], .contact a[href*="maps.app.goo.gl"]').forEach(function (sourceLink) {
    var actions = document.createElement('span');
    actions.className = 'v2-map-actions';
    actions.appendChild(makeMapButton(sourceLink.href, sourceLink.closest('.item').querySelector('h3').textContent));
    sourceLink.closest('.contact').insertAdjacentElement('afterend', actions);
  });

  var hotelMaps = [
    ['福岡麗思卡爾頓酒店', 'https://www.google.com/maps/search/?api=1&query=The+Ritz-Carlton+Fukuoka'],
    ['三井花園飯店福岡中洲', 'https://www.google.com/maps/search/?api=1&query=Mitsui+Garden+Hotel+Fukuoka+Nakasu']
  ];
  document.querySelectorAll('#hotels .hotel').forEach(function (hotel, index) {
    if (!hotelMaps[index]) return;
    var actions = document.createElement('div');
    actions.className = 'v2-map-actions';
    actions.appendChild(makeMapButton(hotelMaps[index][1], hotelMaps[index][0]));
    hotel.querySelector('div:last-child').appendChild(actions);
  });

  document.querySelectorAll('#day2 .dress, #day4 .dress, #day5 .dress').forEach(function (dress) {
    var wrapper = document.createElement('details');
    wrapper.className = 'v2-accordion';
    var summary = document.createElement('summary');
    summary.textContent = '球場規範與服裝提醒';
    var content = document.createElement('div');
    content.className = 'v2-accordion-content';
    dress.parentNode.insertBefore(wrapper, dress);
    content.appendChild(dress);
    wrapper.appendChild(summary);
    wrapper.appendChild(content);
  });

  document.querySelectorAll('.day-weather').forEach(function (weather) {
    var label = document.createElement('span');
    label.className = 'v2-weather-label';
    function syncWeatherLabel() {
      label.textContent = weather.classList.contains('wx-live') ? '天氣參考' : '歷年氣溫參考';
    }
    syncWeatherLabel();
    weather.appendChild(label);
    new MutationObserver(syncWeatherLabel).observe(weather, { attributes: true, attributeFilter: ['class'] });
  });

  var tripDays = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
  var nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
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
