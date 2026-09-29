(function (root) {
  'use strict';

  function register() {
    if (!root.navigator || !root.navigator.serviceWorker || !root.navigator.serviceWorker.register) {
      return Promise.resolve(null);
    }
    return root.navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .catch(function () { return null; });
  }

  root.FukuokaPWA = { register: register };
  register();
})(window);
