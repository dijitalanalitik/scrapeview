/**
 * elementPicker.js
 *
 * WebView'a inject edilen IIFE.
 * - React Native'den `{action: 'startPicking', target: 'nextButton'|'listItem'}`
 *   mesajı gelince "seçim modu" açılır.
 * - Hover / touch'ta element kırmızı outline'la vurgulanır.
 * - Tıklamada benzersiz CSS selector üretilip RN'e geri postlanır,
 *   default click engellenir, mod kapanır.
 *
 * RN tarafında WebView prop'u olarak kullanım:
 *   <WebView injectedJavaScriptBeforeContentLoaded={elementPickerScript} ... />
 */

export const elementPickerScript = `
(function() {
  if (window.__elementPicker) return;

  var STYLE_ID = '__ep-style';
  var HIGHLIGHT_CLASS = '__ep-highlight';

  var state = {
    active: false,
    target: null,
    hovered: null,
  };

  // ---------- Stil ----------
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.' + HIGHLIGHT_CLASS + ' {' +
      '  outline: 2px solid #ef4444 !important;' +
      '  outline-offset: 2px !important;' +
      '  cursor: crosshair !important;' +
      '  background-color: rgba(239, 68, 68, 0.08) !important;' +
      '}';
    (document.head || document.documentElement).appendChild(style);
  }

  function clearHighlight() {
    if (state.hovered) {
      state.hovered.classList.remove(HIGHLIGHT_CLASS);
      state.hovered = null;
    }
  }

  function highlight(el) {
    if (!el || el === state.hovered || el.nodeType !== 1) return;
    clearHighlight();
    state.hovered = el;
    el.classList.add(HIGHLIGHT_CLASS);
  }

  // ---------- Selector üretimi ----------
  // Geçerli, sade CSS id (sayı/punkt içermeyen, harfle başlayan)
  function isSafeId(id) {
    return typeof id === 'string' && /^[A-Za-z][\\w-]*$/.test(id);
  }

  function getUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return null;

    // 1) Element'in kendi id'si benzersizdir
    if (isSafeId(el.id)) return '#' + el.id;

    // 2) Köke kadar nth-of-type zinciri kur, ata id'sine rastlarsan kes
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var tag = node.tagName.toLowerCase();

      if (isSafeId(node.id)) {
        parts.unshift('#' + node.id);
        break;
      }

      var parent = node.parentNode;
      if (parent && parent.children) {
        var sameTagSiblings = Array.prototype.filter.call(
          parent.children,
          function (c) { return c.tagName === node.tagName; }
        );
        if (sameTagSiblings.length > 1) {
          var idx = sameTagSiblings.indexOf(node) + 1;
          tag += ':nth-of-type(' + idx + ')';
        }
      }

      parts.unshift(tag);
      node = parent;
    }

    return parts.join(' > ');
  }

  // ---------- RN'e mesaj ----------
  function send(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  // ---------- Olay dinleyiciler ----------
  function onMouseOver(e) {
    if (!state.active) return;
    highlight(e.target);
  }

  function onMouseOut(e) {
    if (!state.active) return;
    if (e.target === state.hovered) clearHighlight();
  }

  function onTouchStart(e) {
    if (!state.active) return;
    var touch = e.touches && e.touches[0];
    if (!touch) return;
    var el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el) highlight(el);
  }

  function onClickCapture(e) {
    if (!state.active) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }

    var el = e.target;
    var selector = getUniqueSelector(el);
    var pickedTarget = state.target;
    var text = (el.innerText || el.textContent || '').trim().slice(0, 120);

    stop();
    send({
      type: 'elementPicked',
      target: pickedTarget,
      selector: selector,
      tag: el.tagName.toLowerCase(),
      text: text,
    });
  }

  // ---------- Public API ----------
  function start(target) {
    ensureStyle();
    state.active = true;
    state.target = target || null;
    send({ type: 'pickingStarted', target: state.target });
  }

  function stop() {
    clearHighlight();
    state.active = false;
    state.target = null;
  }

  // ---------- RN -> WebView mesaj köprüsü ----------
  function handleIncoming(raw) {
    try {
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data || !data.action) return;
      if (data.action === 'startPicking') start(data.target);
      else if (data.action === 'stopPicking') stop();
    } catch (err) {
      send({ type: 'error', message: 'parse: ' + String(err) });
    }
  }

  // RN tarafında \`injectJavaScript\` ile direkt
  // \`window.__elementPicker.start('nextButton')\` çağırılabilir;
  // ya da \`postMessage\` formatı için bu dinleyiciler vardır.
  window.addEventListener('message', function (e) { handleIncoming(e.data); });
  document.addEventListener('message', function (e) { handleIncoming(e.data); });

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('touchstart', onTouchStart, true);
  document.addEventListener('click', onClickCapture, true);

  window.__elementPicker = {
    start: start,
    stop: stop,
    getUniqueSelector: getUniqueSelector,
  };
})();
true;
`;
