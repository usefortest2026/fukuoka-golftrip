(function () {
  'use strict';

  var envelopePromise;

  function copy(locale) {
    return locale === 'en' ? {
      password: 'Password',
      unlock: 'Unlock',
      cancel: 'Cancel',
      unlocking: 'Unlocking…',
      incorrect: 'Incorrect password. Please try again.',
      unavailable: 'Private information is unavailable in this browser.',
      reference: 'Booking reference',
      reservedBy: 'Reserved by',
      note: 'Private note'
    } : {
      password: '密碼',
      unlock: '解鎖',
      cancel: '取消',
      unlocking: '解鎖中…',
      incorrect: '密碼錯誤，請再試一次。',
      unavailable: '此瀏覽器無法使用私人資訊功能。',
      reference: '訂位編號',
      reservedBy: '預訂人',
      note: '私人備註'
    };
  }

  function base64Bytes(value) {
    var binary = window.atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function loadEnvelope() {
    if (!envelopePromise) {
      envelopePromise = window.fetch('private-trip-info.enc.json', { cache: 'no-store' }).then(function (response) {
        if (!response.ok) throw new Error('private-info-load');
        return response.json();
      });
    }
    return envelopePromise;
  }

  async function decrypt(password) {
    var envelope = await loadEnvelope();
    var passwordBytes = new TextEncoder().encode(password);
    try {
      var material = await window.crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
      var key = await window.crypto.subtle.deriveKey({
        name: envelope.kdf.name,
        salt: base64Bytes(envelope.salt),
        iterations: envelope.kdf.iterations,
        hash: envelope.kdf.hash
      }, material, {
        name: envelope.cipher.name,
        length: envelope.cipher.length
      }, false, ['decrypt']);
      var plainBuffer = await window.crypto.subtle.decrypt({
        name: envelope.cipher.name,
        iv: base64Bytes(envelope.iv)
      }, key, base64Bytes(envelope.ciphertext));
      return JSON.parse(new TextDecoder().decode(plainBuffer));
    } finally {
      passwordBytes.fill(0);
    }
  }

  function field(label, value) {
    var row = document.createElement('p');
    var title = document.createElement('strong');
    title.textContent = label + '：';
    row.appendChild(title);
    row.appendChild(document.createTextNode(value || '—'));
    return row;
  }

  document.querySelectorAll('.private-trip-info').forEach(function (section) {
    var locale = section.getAttribute('data-private-locale') === 'en' ? 'en' : 'zh';
    var labels = copy(locale);
    var recordId = section.getAttribute('data-private-record');
    var trigger = section.querySelector('.private-info-head');
    var workspace = section.querySelector('.private-info-workspace');
    var isOpen = false;
    var activationCount = 0;
    var activationTimer;

    function resetActivations() {
      window.clearTimeout(activationTimer);
      activationCount = 0;
    }

    function lock() {
      workspace.replaceChildren();
      trigger.setAttribute('aria-expanded', 'false');
      isOpen = false;
      resetActivations();
    }

    function showForm() {
      workspace.replaceChildren();
      var form = document.createElement('form');
      form.className = 'private-info-form';
      var input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'current-password';
      input.required = true;
      input.setAttribute('aria-label', labels.password);
      input.placeholder = labels.password;
      var unlock = document.createElement('button');
      unlock.type = 'submit';
      unlock.textContent = labels.unlock;
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'private-info-cancel';
      cancel.textContent = labels.cancel;
      var status = document.createElement('p');
      status.className = 'private-info-status';
      status.setAttribute('role', 'status');
      form.append(input, unlock, cancel, status);
      workspace.appendChild(form);
      cancel.addEventListener('click', lock);
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        unlock.disabled = true;
        status.textContent = labels.unlocking;
        try {
          var payload = await decrypt(input.value);
          input.value = '';
          var record = payload.records && payload.records[recordId];
          if (!record) throw new Error('private-info-record');
          var content = document.createElement('div');
          content.className = 'private-info-content';
          content.appendChild(field(labels.reference, record.bookingReference));
          content.appendChild(field(labels.reservedBy, record.reservedBy));
          if (record.notes && record.notes[locale]) content.appendChild(field(labels.note, record.notes[locale]));
          workspace.replaceChildren(content);
        } catch (error) {
          input.value = '';
          status.textContent = error && (error.message === 'private-info-load' || error.message === 'private-info-record') ? labels.unavailable : labels.incorrect;
          unlock.disabled = false;
          input.focus();
        }
      });
      input.focus();
    }

    trigger.addEventListener('click', function () {
      activationCount += 1;
      window.clearTimeout(activationTimer);
      if (activationCount < 3) {
        activationTimer = window.setTimeout(resetActivations, 900);
        return;
      }
      resetActivations();
      if (isOpen) {
        lock();
        return;
      }
      isOpen = true;
      trigger.setAttribute('aria-expanded', 'true');
      if (!window.crypto || !window.crypto.subtle) {
        workspace.textContent = labels.unavailable;
        return;
      }
      showForm();
    });

    lock();
  });
})();
