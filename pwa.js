(function (root) {
  'use strict';

  var copy = document.documentElement.lang === 'en' ? {
    download: 'Save coupons',
    downloading: 'Downloading {completed}/{total}',
    retry: 'Retry {count} missing coupon',
    retryMany: 'Retry {count} missing coupons',
    partial: 'Downloaded {completed}/{total}; {failed} failed.',
    ready: 'Coupons saved',
    offlineTitle: 'Offline use',
    offlinePreparing: 'Preparing the itinerary for offline use…',
    offlineReady: 'Itinerary available offline',
    offlineUnsupported: 'Offline trips are unavailable in this browser',
    networkNote: 'Google Maps, live weather and external sites still require internet.',
    couponUnsupported: 'Offline coupon downloads are unavailable in this browser',
    couponOfflineError: 'This coupon has not been downloaded. Connect to the internet and try again.',
    install: 'Add to Home Screen',
    installGeneric: 'Use your browser menu to add this trip to your Home Screen.',
    installIOS: 'Tap Share → Add to Home Screen.'
  } : {
    download: '儲存優惠券',
    downloading: '正在下載 {completed}/{total}',
    retry: '重試未完成的 {count} 張',
    retryMany: '重試未完成的 {count} 張',
    partial: '已下載 {completed}/{total}，{failed} 張失敗',
    ready: '優惠券已儲存',
    offlineTitle: '離線使用',
    offlinePreparing: '正在準備離線行程…',
    offlineReady: '行程可離線使用',
    offlineUnsupported: '此瀏覽器不支援離線行程',
    networkNote: 'Google Maps、即時天氣與外部網站仍需網路。',
    couponUnsupported: '此瀏覽器不支援優惠券離線下載',
    couponOfflineError: '這張優惠券尚未下載，請連上網路後再試。',
    install: '加入主畫面',
    installGeneric: '可從瀏覽器選單將行程加入主畫面。',
    installIOS: '點分享，再選「加入主畫面」。'
  };
  var couponButton;
  var couponLabel;
  var couponStatus;
  var activeWorker;
  var activeRegistration;
  var installPrompt;
  var installButton;
  var installGuidance;
  var offlineReadyStatus;
  var offlineTools;

  function format(template, values) {
    return template.replace(/\{(\w+)\}/g, function (_, key) { return values[key]; });
  }

  function renderCouponControl() {
    var heading = document.querySelector('.v2-coupon-heading');
    if (!heading || document.querySelector('.v2-coupon-offline')) return;
    var control = document.createElement('div');
    control.className = 'v2-coupon-offline';
    control.innerHTML = '<button class="v2-coupon-download" type="button" disabled data-state="loading">' +
      '<span class="v2-coupon-download-icon" aria-hidden="true">↓</span>' +
      '<span class="v2-coupon-download-label"></span></button>' +
      '<p class="v2-coupon-download-status" role="status" aria-live="polite"></p>';
    (heading.lastElementChild || heading).appendChild(control);
    couponButton = control.querySelector('.v2-coupon-download');
    couponLabel = control.querySelector('.v2-coupon-download-label');
    couponStatus = control.querySelector('.v2-coupon-download-status');
    couponLabel.textContent = copy.download;
    couponButton.addEventListener('click', function () {
      if (couponButton.disabled) return;
      couponButton.disabled = true;
      couponButton.dataset.state = 'downloading';
      if (!postWorkerMessage({ type: 'CACHE_COUPONS' })) showPwaUnavailable();
    });
  }

  function bindCouponImageErrors() {
    function retryCouponImage(image) {
      image.removeAttribute('src');
      image.hidden = false;
      delete image.dataset.offlineFailed;
      image.src = image.dataset.src;
    }

    function showCouponImageError(image) {
      var link = image.closest('.v2-coupon-image-link');
      if (!link) return;
      image.hidden = true;
      image.dataset.offlineFailed = 'true';
      var message = link.parentElement.querySelector('.v2-coupon-image-error');
      if (!message) {
        message = document.createElement('p');
        message.className = 'v2-coupon-image-error';
        message.setAttribute('role', 'status');
        link.insertAdjacentElement('afterend', message);
      }
      message.textContent = copy.couponOfflineError;
    }
    document.querySelectorAll('.v2-coupon-image').forEach(function (image) {
      if (image.dataset.offlineErrorBound === 'true') return;
      image.dataset.offlineErrorBound = 'true';
      image.addEventListener('error', function () { showCouponImageError(image); });
      image.addEventListener('load', function () {
        image.hidden = false;
        delete image.dataset.offlineFailed;
        var details = image.closest('.v2-scan-coupon');
        var message = details && details.querySelector('.v2-coupon-image-error');
        if (message) message.remove();
      });
      var details = image.closest('.v2-scan-coupon');
      if (details) details.addEventListener('toggle', function () {
        if (!details.open) return;
        if (root.navigator.onLine !== false && image.dataset.offlineFailed === 'true') {
          retryCouponImage(image);
          return;
        }
        if (root.navigator.onLine !== false || !root.caches) return;
        root.caches.match(new URL(image.dataset.src, root.location.href).href)
          .then(function (cached) {
            if (!cached && details.open) showCouponImageError(image);
          });
      });
    });
    root.addEventListener('online', function () {
      document.querySelectorAll('.v2-coupon-image[data-offline-failed="true"]').forEach(function (image) {
        var details = image.closest('.v2-scan-coupon');
        if (!details || !details.open) return;
        retryCouponImage(image);
      });
    });
  }

  function isStandalone() {
    return root.navigator.standalone === true ||
      (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(root.navigator.userAgent || '') ||
      /iPad|iPhone|iPod/.test(root.navigator.platform || '') ||
      (root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1);
  }

  function updateInstallUI() {
    if (!installButton || !installGuidance) return;
    if (isStandalone()) {
      installButton.hidden = true;
      installGuidance.hidden = true;
      return;
    }
    if (installPrompt) {
      installButton.hidden = false;
      installGuidance.hidden = true;
      return;
    }
    installButton.hidden = true;
    installGuidance.hidden = false;
    installGuidance.textContent = isIOS() ? copy.installIOS : copy.installGeneric;
  }

  function setOfflineStatus(state, text) {
    if (!offlineReadyStatus) return;
    offlineReadyStatus.dataset.state = state;
    offlineReadyStatus.textContent = text;
  }

  function updateNetworkUI() {
    if (!offlineTools) return;
    offlineTools.dataset.network = root.navigator.onLine === false ? 'offline' : 'online';
  }

  function renderOfflineTools() {
    var footer = document.querySelector('#overview .overview-foot');
    if (!footer || document.querySelector('.v2-offline-tools')) return;
    var tools = document.createElement('section');
    tools.className = 'v2-offline-tools';
    tools.setAttribute('aria-labelledby', 'offline-tools-title');
    tools.innerHTML = '<div class="v2-offline-tools-copy"><h3 id="offline-tools-title"></h3>' +
      '<p class="v2-offline-ready-status" role="status" aria-live="polite"></p>' +
      '<p class="v2-install-guidance"></p>' +
      '<p class="v2-offline-network-note"></p></div>' +
      '<button class="v2-install-button" type="button" hidden></button>';
    footer.insertAdjacentElement('afterend', tools);
    offlineTools = tools;
    tools.querySelector('h3').textContent = copy.offlineTitle;
    offlineReadyStatus = tools.querySelector('.v2-offline-ready-status');
    setOfflineStatus('preparing', copy.offlinePreparing);
    installGuidance = tools.querySelector('.v2-install-guidance');
    tools.querySelector('.v2-offline-network-note').textContent = copy.networkNote;
    installButton = tools.querySelector('.v2-install-button');
    installButton.textContent = copy.install;
    installButton.addEventListener('click', function () {
      if (!installPrompt) return;
      var prompt = installPrompt;
      installPrompt = null;
      prompt.prompt();
      Promise.resolve(prompt.userChoice).finally(updateInstallUI);
    });
    updateNetworkUI();
    updateInstallUI();
  }

  function applyCouponStatus(message) {
    if (!couponButton || !message || typeof message.total !== 'number') return;
    var values = {
      completed: message.completed,
      total: message.total,
      failed: message.failed,
      count: Math.max(0, message.total - message.completed)
    };
    if (message.type === 'COUPON_CACHE_PROGRESS') {
      couponButton.dataset.state = 'downloading';
      couponLabel.textContent = format(copy.downloading, values);
      couponStatus.textContent = message.failed ? format(copy.partial, values) : '';
      return;
    }
    if (message.completed === message.total) {
      couponButton.dataset.state = 'ready';
      couponButton.disabled = true;
      couponLabel.textContent = copy.ready;
      couponStatus.textContent = '';
      return;
    }
    couponButton.disabled = false;
    if (message.failed) {
      couponButton.dataset.state = 'partial';
      couponLabel.textContent = format(values.count === 1 ? copy.retry : copy.retryMany, values);
      couponStatus.textContent = format(copy.partial, values);
    } else {
      couponButton.dataset.state = 'idle';
      couponLabel.textContent = copy.download;
      couponStatus.textContent = '';
    }
  }

  function currentWorker() {
    if (!root.navigator || !root.navigator.serviceWorker) return null;
    return root.navigator.serviceWorker.controller ||
      (activeRegistration && activeRegistration.active) || activeWorker || null;
  }

  function postWorkerMessage(message) {
    var worker = currentWorker();
    if (!worker || !worker.postMessage) return false;
    activeWorker = worker;
    worker.postMessage(message);
    return true;
  }

  function showPwaUnavailable() {
    activeWorker = null;
    setOfflineStatus('unsupported', copy.offlineUnsupported);
    if (couponButton) {
      couponButton.disabled = true;
      couponButton.dataset.state = 'unavailable';
      couponLabel.textContent = copy.couponUnsupported;
      couponStatus.textContent = '';
    }
  }

  function connectCouponControl(registration) {
    activeRegistration = registration || activeRegistration;
    activeWorker = currentWorker();
    if (!activeWorker || !couponButton) return;
    couponButton.disabled = false;
    couponButton.dataset.state = 'idle';
    postWorkerMessage({ type: 'GET_COUPON_CACHE_STATUS' });
    setOfflineStatus('ready', copy.offlineReady);
  }

  function register() {
    renderCouponControl();
    bindCouponImageErrors();
    renderOfflineTools();
    if (!root.navigator || !root.navigator.serviceWorker || !root.navigator.serviceWorker.register) {
      showPwaUnavailable();
      return Promise.resolve(null);
    }
    root.navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && /^COUPON_CACHE_/.test(event.data.type || '')) applyCouponStatus(event.data);
    });
    root.navigator.serviceWorker.addEventListener('controllerchange', function () {
      connectCouponControl(activeRegistration);
    });
    return root.navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(function (registration) {
        activeRegistration = registration;
        return root.navigator.serviceWorker.ready.then(function () {
          connectCouponControl(registration);
          return registration;
        });
      })
      .catch(function () {
        showPwaUnavailable();
        return null;
      });
  }

  root.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    installPrompt = event;
    updateInstallUI();
  });

  root.addEventListener('appinstalled', function () {
    installPrompt = null;
    updateInstallUI();
  });

  root.addEventListener('online', updateNetworkUI);
  root.addEventListener('offline', updateNetworkUI);

  root.FukuokaPWA = { register: register };
  register();
})(window);
