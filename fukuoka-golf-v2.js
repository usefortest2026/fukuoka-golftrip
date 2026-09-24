(function () {
  'use strict';

  var summaries = {
    day1: [
      ['08:00', '桃園機場起飛'],
      ['11:15', '抵達福岡機場'],
      ['13:00', '福岡市區簡單午餐'],
      ['15:00 後', '飯店入住・市區觀光'],
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
      ['裝備提醒', '帽子、軟釘高爾夫鞋'],
      ['天氣參考', '20° / 13°']
    ],
    day4: [
      ['飯店出發', '07:55 麗思 → 三井'],
      ['抵達球場', '09:00'],
      ['Tee Time', '10:00 / 10:08'],
      ['進行方式', '餐別待確認'],
      ['裝備提醒', '夾克、有領上衣、帽子、軟釘高爾夫鞋'],
      ['天氣參考', '19° / 12°']
    ],
    day5: [
      ['飯店出發', '07:50 麗思 → 三井'],
      ['抵達球場', '09:08'],
      ['Tee Time', '10:08 / 10:16'],
      ['進行方式', '餐別待確認'],
      ['裝備提醒', 'Blazer、有領上衣、帽子、軟釘高爾夫鞋'],
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
    ['龍貓森林', '需步行約 1 公里，步道短但有起伏', 'https://www.google.com/maps/search/?api=1&query=Totoro+Forest+Itoshima'],
    ['芥屋大門', '遊船視天候開航', 'https://www.google.com/maps/search/?api=1&query=Keya+no+Oto+Itoshima'],
    ['雷山千如寺大悲王院', '紅葉期約 11 月下旬', 'https://www.google.com/maps/search/?api=1&query=Raizan+Sennyoji+Daihioin']
  ];

  var courseDetails = {
    day2: {
      description: [
        '久山於 1964 年在福岡開幕。由三位職業高爾夫球手——中村虎吉、藤井武人和藤井義正——設計並監督，是福岡縣內最古老的球場之一。球場全長約 6,075 碼，距離看似不長，但實際擊球頗具挑戰性；沙坑位置設計巧妙，需要仔細考慮落球區與進攻路線。',
        '1970 年舉辦日本職業高爾夫東西向比賽，1974 年舉辦日本女子職業高爾夫錦標賽。'
      ],
      dress: [
        ['會所內', ['抵達會所時，穿著西裝外套或高爾夫外套為可選。', '避免穿著 T 恤、背心或無袖衣物。', '避免穿著牛仔褲、運動服或工作服。', '不可穿著 Crocs、木屐涼鞋或拖鞋。']],
        ['球場內', ['請穿著有袖、有領或高領上衣；圓領上衣不符合規定。', '上衣下襬需紮入褲子或裙子內，女性罩衫除外。', '不可只穿內衣或背心下場。', '不可穿著牛仔褲或工作服下場。', '請穿軟釘高爾夫鞋，禁止金屬釘鞋。', '為避免危險與中暑，場上務必戴帽。']]
      ]
    },
    day4: {
      description: [
        '太宰府高爾夫俱樂部是一座 18 洞、72 桿球場，距離福岡市中心僅短程車程，從機場或主要車站前來都相當方便。球場地形起伏多變，設有上坡與下坡擊球，以及具挑戰性的水障礙，為揮桿增添趣味與多樣性。',
        '球道呈現柔和波動，提升打球感受，同時不會過於艱難。無論是觀光客或商務旅客，太宰府都是靠近城市、位處九州風光中的舒適高爾夫體驗首選。果嶺採用細葉結縷草（Zoysia），並曾舉辦日本女子公開賽（日本女子オープン）。'
      ],
      dress: [
        ['', ['抵達時請穿著夾克或西裝，6～9 月除外。', '避免穿著無領或無袖上衣，以及 Crocs、涼鞋等無後跟鞋。', '上衣下襬需紮入褲子或裙子內。', '請穿軟釘高爾夫鞋，禁止金屬釘鞋。', '比賽時務必戴帽，以避免危險。', '請修復沙坑腳印、草皮痕與果嶺球痕。', '請保持順暢打球速度，半場以 2 小時 15 分鐘為目標。']]
      ]
    },
    day5: {
      description: [
        '九州首屈一指的名門球場，號稱「九州最有挑戰性的球場」及「九州最美球道」。球場建於丘陵，但球道平坦，設計上需要運用 14 支球桿；前 9 洞和後 9 洞各設一個練習球洞，也是全日本第一個 20 洞球場。',
        '1973～2011 年間曾舉辦多項女子高爾夫賽事，包括 2000 年 Vernal Cup RKB 女子競技賽、2001～2009 年 Vernal 女子競技賽及 2010～2011 年 Fundokin Women’s 競技賽。2026 年亦舉辦「NIKKEN ホールディングス杯オープンゴルフトーナメント」及 3 月 20～22 日的「こども食堂応援チャリティーゴルフトーナメント」。'
      ],
      dress: [
        ['會所內', ['請穿著西裝外套或高爾夫外套，6～9 月除外。', '進出會所不可穿拖鞋或涼鞋。', '進出會所不可穿著束腰衣、毛衣或 T 恤。', '進出會所不可穿著牛仔褲或工作褲。', '請穿有領、有袖的上衣，並將上衣紮入褲子或裙子內。']],
        ['球場內', ['不可將毛巾披在脖子或肩膀上。', '穿短褲時，建議搭配高筒襪。', '請戴帽以避免中暑。', '請穿軟釘高爾夫鞋，禁止金屬釘鞋。']]
      ]
    }
  };

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
    var title = sourceLink.closest('.item').querySelector('h3').textContent;
    sourceLink.classList.add('v2-nav-button');
    sourceLink.setAttribute('aria-label', title + ' Google Maps 導航');
    sourceLink.innerHTML = '<i class="fa-solid fa-location-arrow" aria-hidden="true"></i><span>導航</span>';
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

  document.querySelectorAll('#day3 .stop-list li').forEach(function (stop) {
    if (stop.textContent.indexOf('龍貓森林') === 0) {
      stop.textContent = '龍貓森林・需步行約 1 公里，步道短但有起伏';
    }
    if (stop.textContent.indexOf('雷山千如寺大悲王院') === 0) {
      stop.textContent = '雷山千如寺大悲王院・紅葉期約 11 月下旬';
    }
  });

  Object.keys(courseDetails).forEach(function (dayId) {
    var page = document.getElementById(dayId);
    var caption = page && page.querySelector('.panel .caption');
    var dress = page && page.querySelector('.dress');
    if (!caption || !dress) return;

    var intro = document.createElement('section');
    intro.className = 'course-intro';
    var introHeading = document.createElement('h3');
    introHeading.textContent = '球場介紹';
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
    dressHeading.innerHTML = '<i class="fa-solid fa-shirt" aria-hidden="true"></i>服裝規定';
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
