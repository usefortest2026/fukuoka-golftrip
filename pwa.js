(function (root) {
  'use strict';

  var copy = document.documentElement.lang === 'en' ? {
    download: 'Download coupons for offline use',
    downloading: 'Downloading {completed}/{total}',
    retry: 'Retry {count} missing coupon',
    retryMany: 'Retry {count} missing coupons',
    partial: 'Downloaded {completed}/{total}; {failed} failed.',
    ready: 'Available offline'
  } : {
    download: '下載優惠券供離線使用',
    downloading: '正在下載 {completed}/{total}',
    retry: '重試未完成的 {count} 張',
    retryMany: '重試未完成的 {count} 張',
    partial: '已下載 {completed}/{total}，{failed} 張失敗',
    ready: '已可離線使用'
  };
  var couponButton;
  var couponLabel;
  var couponStatus;
  var activeWorker;

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
    heading.insertAdjacentElement('afterend', control);
    couponButton = control.querySelector('.v2-coupon-download');
    couponLabel = control.querySelector('.v2-coupon-download-label');
    couponStatus = control.querySelector('.v2-coupon-download-status');
    couponLabel.textContent = copy.download;
    couponButton.addEventListener('click', function () {
      if (!activeWorker || couponButton.disabled) return;
      couponButton.disabled = true;
      couponButton.dataset.state = 'downloading';
      activeWorker.postMessage({ type: 'CACHE_COUPONS' });
    });
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

  function connectCouponControl(registration) {
    activeWorker = root.navigator.serviceWorker.controller || registration.active;
    if (!activeWorker || !couponButton) return;
    couponButton.disabled = false;
    couponButton.dataset.state = 'idle';
    activeWorker.postMessage({ type: 'GET_COUPON_CACHE_STATUS' });
  }

  function register() {
    if (!root.navigator || !root.navigator.serviceWorker || !root.navigator.serviceWorker.register) {
      return Promise.resolve(null);
    }
    renderCouponControl();
    root.navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && /^COUPON_CACHE_/.test(event.data.type || '')) applyCouponStatus(event.data);
    });
    return root.navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(function (registration) {
        return root.navigator.serviceWorker.ready.then(function () {
          connectCouponControl(registration);
          return registration;
        });
      })
      .catch(function () { return null; });
  }

  root.FukuokaPWA = { register: register };
  register();
})(window);
