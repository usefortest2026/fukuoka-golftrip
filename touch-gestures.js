(function (root, document) {
  'use strict';

  var standalone = root.navigator && root.navigator.standalone === true;
  if (!standalone && root.matchMedia) standalone = root.matchMedia('(display-mode: standalone)').matches;
  if (!standalone) return;

  // Some iOS Home Screen versions ignore touch-action: manipulation for double taps.
  // Cancel only the second blank-area tap; keep controls, scrolling, and pinch zoom native.
  var interactive = 'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"])';
  var activeTouch = null;
  var lastTap = null;

  function reset() {
    activeTouch = null;
    lastTap = null;
  }

  function near(a, b, distance) {
    return Math.abs(a.clientX - b.clientX) <= distance && Math.abs(a.clientY - b.clientY) <= distance;
  }

  document.addEventListener('touchstart', function (event) {
    if (event.touches.length !== 1 || !event.target.closest || event.target.closest(interactive)) {
      reset();
      return;
    }
    var point = event.touches[0];
    activeTouch = { identifier: point.identifier, clientX: point.clientX, clientY: point.clientY, time: event.timeStamp };
  }, { passive: true });

  document.addEventListener('touchmove', function (event) {
    if (activeTouch && (event.touches.length !== 1 || !near(activeTouch, event.touches[0], 10))) reset();
  }, { passive: true });

  document.addEventListener('touchcancel', reset, { passive: true });

  document.addEventListener('touchend', function (event) {
    var start = activeTouch;
    activeTouch = null;
    if (!start || event.touches.length || event.changedTouches.length !== 1) {
      lastTap = null;
      return;
    }
    var point = event.changedTouches[0];
    if (point.identifier !== start.identifier || event.timeStamp - start.time > 300 || !near(start, point, 10)) {
      lastTap = null;
      return;
    }
    if (lastTap && event.timeStamp - lastTap.time <= 350 && near(lastTap, point, 24)) {
      if (event.cancelable) event.preventDefault();
      lastTap = null;
      return;
    }
    lastTap = { clientX: point.clientX, clientY: point.clientY, time: event.timeStamp };
  }, { passive: false });
})(window, document);
