/**
 * scraper.js
 *
 * WebView'a inject edilen scraping IIFE'si.
 *
 * RN -> WebView mesaj formatı:
 *   { action: 'scrapePage', listSelector: '<css-selector>' }
 *
 * WebView -> RN yanıt formatı:
 *   { type: 'scrapeResult', data: [...], pageUrl: '<href>' [, error: '...'] }
 *
 * Her item için otomatik çıkarılanlar:
 *   - title: en uzun "kendi (direct)" text'ine sahip descendant
 *   - price: para birimi sembolü veya fiyat regex'iyle eşleşen text
 *   - url:   item ya da içindeki/yakınındaki <a> href
 *   - image: içindeki ilk <img>'in src/currentSrc/data-src'si
 *
 * RN tarafında WebView prop'u olarak kullanım:
 *   <WebView injectedJavaScriptBeforeContentLoaded={scraperScript} ... />
 */

export const scraperScript = `
(function() {
  if (window.__scraper) return;

  // ---------- RN'e mesaj ----------
  function send(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  // ---------- Yardımcılar ----------
  // Bir element'in *kendi* text içeriği (alt elementlerinki hariç)
  function getDirectText(el) {
    if (!el || !el.childNodes) return '';
    var out = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 /* TEXT_NODE */) out += n.nodeValue;
    }
    return out.replace(/\\s+/g, ' ').trim();
  }

  function isSkippableTag(tag) {
    return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT';
  }

  // En uzun "direct text"e sahip descendant'ı bul.
  // Hiçbiri yoksa item'ın tüm innerText'ini fallback olarak ver.
  function findTitle(item) {
    var best = '';
    try {
      var nodes = item.querySelectorAll('*');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (isSkippableTag(el.tagName)) continue;
        var t = getDirectText(el);
        if (t.length > best.length) best = t;
      }
    } catch (_) {}
    if (!best) {
      var fallback = (item.innerText || item.textContent || '');
      best = fallback.replace(/\\s+/g, ' ').trim();
    }
    return best || null;
  }

  // ---------- Fiyat parse helper'ı ----------
  // Öncelik sırası:
  //   1) "₺", "$", "€" veya "TL" içeren bir sayı eşleşmesi
  //   2) Klasik fiyat formatı: 12.99 / 12,99
  //   3) Bulunamazsa null
  function extractPrice(item) {
    var raw = (item.innerText || item.textContent || '');
    if (!raw) return null;
    var text = raw.replace(/\\s+/g, ' ').trim();

    // 1) Para birimi + sayı (her iki yön)
    var currencyRe = /(?:[₺$€]|\\bTL\\b)\\s*\\d+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?\\s*(?:[₺$€]|\\bTL\\b)/i;
    var m = text.match(currencyRe);
    if (m) return m[0].replace(/\\s+/g, ' ').trim();

    // 2) Decimal sayı (12.99 / 12,99) — büyük olasılıkla fiyattır
    var decimalRe = /\\d+[.,]\\d{1,2}\\b/;
    m = text.match(decimalRe);
    if (m) return m[0];

    return null;
  }

  // ---------- URL bulucu ----------
  function findUrl(item) {
    try {
      if (item.tagName === 'A' && item.getAttribute('href')) return item.href;
      var inner = item.querySelector('a[href]');
      if (inner && inner.href) return inner.href;
      if (typeof item.closest === 'function') {
        var ancestor = item.closest('a[href]');
        if (ancestor && ancestor.href) return ancestor.href;
      }
    } catch (_) {}
    return null;
  }

  // ---------- Image bulucu ----------
  function findImage(item) {
    try {
      var img = item.querySelector('img');
      if (img) {
        var src =
          img.currentSrc ||
          img.src ||
          img.getAttribute('data-src') ||
          img.getAttribute('data-original') ||
          img.getAttribute('data-lazy-src');
        if (src) return src;
      }
      // CSS background-image fallback
      var bg = window.getComputedStyle(item).backgroundImage;
      if (bg && bg !== 'none') {
        var match = bg.match(/url\\(["']?(.*?)["']?\\)/);
        if (match && match[1]) return match[1];
      }
    } catch (_) {}
    return null;
  }

  // ---------- Tek item normalize ----------
  function extractItem(item) {
    return {
      title: findTitle(item),
      price: extractPrice(item),
      url: findUrl(item),
      image: findImage(item),
    };
  }

  // ---------- Ana scrape ----------
  function scrapePage(listSelector) {
    var pageUrl = location.href;
    if (!listSelector || typeof listSelector !== 'string') {
      return {
        type: 'scrapeResult',
        data: [],
        pageUrl: pageUrl,
        error: 'Geçersiz listSelector',
      };
    }

    var items;
    try {
      items = document.querySelectorAll(listSelector);
    } catch (err) {
      return {
        type: 'scrapeResult',
        data: [],
        pageUrl: pageUrl,
        error: 'Selector parse hatası: ' + String(err && err.message || err),
      };
    }

    if (!items || items.length === 0) {
      return {
        type: 'scrapeResult',
        data: [],
        pageUrl: pageUrl,
        error: 'Selector ile eşleşen element bulunamadı: ' + listSelector,
      };
    }

    var data = [];
    for (var i = 0; i < items.length; i++) {
      try {
        data.push(extractItem(items[i]));
      } catch (err) {
        data.push({
          title: null,
          price: null,
          url: null,
          image: null,
          _error: String(err && err.message || err),
        });
      }
    }

    return {
      type: 'scrapeResult',
      data: data,
      pageUrl: pageUrl,
      count: data.length,
    };
  }

  // ---------- Sonraki sayfa butonuna tıkla ----------
  function clickNextButton(selector) {
    var pageUrl = location.href;
    if (!selector || typeof selector !== 'string') {
      return {
        type: 'clickResult',
        success: false,
        pageUrl: pageUrl,
        error: 'Geçersiz selector',
      };
    }
    try {
      var el = document.querySelector(selector);
      if (!el) {
        return {
          type: 'clickResult',
          success: false,
          pageUrl: pageUrl,
          error: 'Element bulunamadı: ' + selector,
        };
      }
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
      if (typeof el.click === 'function') {
        el.click();
      } else {
        // Eski tarayıcı fallback'i (jsdom vb.)
        var ev = document.createEvent('MouseEvents');
        ev.initEvent('click', true, true);
        el.dispatchEvent(ev);
      }
      return {
        type: 'clickResult',
        success: true,
        pageUrl: pageUrl,
        selector: selector,
      };
    } catch (err) {
      return {
        type: 'clickResult',
        success: false,
        pageUrl: pageUrl,
        error: String(err && err.message || err),
      };
    }
  }

  // ---------- RN -> WebView mesaj köprüsü ----------
  // Mesaj formatı: { requestId, action, ...payload }
  // Cevap aynı requestId ile döner (varsa).
  function handleIncoming(raw) {
    var requestId = null;
    try {
      var msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!msg || !msg.action) return;
      requestId = (msg.requestId != null) ? msg.requestId : null;

      var result = null;
      if (msg.action === 'scrapePage') {
        result = scrapePage(msg.listSelector);
      } else if (msg.action === 'clickNextButton') {
        result = clickNextButton(msg.nextSelector);
      } else {
        return;
      }

      if (requestId != null) result.requestId = requestId;
      send(result);
    } catch (err) {
      var errResult = {
        type: 'error',
        pageUrl: location.href,
        error: 'Mesaj parse hatası: ' + String(err && err.message || err),
      };
      if (requestId != null) errResult.requestId = requestId;
      send(errResult);
    }
  }

  window.addEventListener('message', function (e) { handleIncoming(e.data); });
  document.addEventListener('message', function (e) { handleIncoming(e.data); });

  // Public API — RN'den \`injectJavaScript\` ile direkt çağırılabilir:
  //   window.__scraper.scrapePage('.product-card')
  window.__scraper = {
    scrapePage: scrapePage,
    extractItem: extractItem,
    extractPrice: extractPrice,
    clickNextButton: clickNextButton,
  };
})();
true;
`;
