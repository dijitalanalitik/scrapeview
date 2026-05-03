import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 30000;
const NAVIGATION_TIMEOUT_MS = 30000;
const CLICK_TIMEOUT_MS = 10000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeForInjection(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * useScraper
 *
 * App.js ile WebView arasında promise-tabanlı mesajlaşma + otomatik
 * sayfalama döngüsü.
 *
 * Köprü: her request'e benzersiz requestId verilir, scraper.js cevabında
 * aynı id'yi döndürür, hook bekleyen promise'i resolve eder.
 *
 * Navigasyon bekleme: sonraki butonuna tıklamadan ÖNCE navigation Promise'i
 * kurulur, click sonrası onWebViewLoadEnd resolve eder.
 *
 * Public:
 *  - state: isRunning, currentPage, totalCollected, collectedData
 *  - eylemler: start(), stop(), clear()
 *  - WebView'a bağlanacaklar: tryHandleMessage(parsedData), onWebViewLoadEnd(event)
 */
export function useScraper({
  webViewRef,
  nextButtonSelector,
  listItemSelector,
  delay,
  onStatus,
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCollected, setTotalCollected] = useState(0);
  const [collectedData, setCollectedData] = useState([]);

  // Async loop için "canlı" referanslar (re-render'a takılmayan değerler)
  const isRunningRef = useRef(false);
  const nextSelectorRef = useRef(nextButtonSelector);
  const listSelectorRef = useRef(listItemSelector);
  const delayRef = useRef(delay);
  const onStatusRef = useRef(onStatus);

  useEffect(() => { nextSelectorRef.current = nextButtonSelector; }, [nextButtonSelector]);
  useEffect(() => { listSelectorRef.current = listItemSelector; }, [listItemSelector]);
  useEffect(() => { delayRef.current = delay; }, [delay]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  // requestId -> { resolve, reject }
  const pendingRef = useRef(new Map());
  const nextRequestIdRef = useRef(1);

  // Bekleyen navigasyonun resolver'ı (varsa)
  const navResolverRef = useRef(null);

  const setStatus = useCallback((msg) => {
    if (typeof onStatusRef.current === 'function') onStatusRef.current(msg);
  }, []);

  // ---------- Köprü: RN -> WebView (requestId + Promise) ----------
  const request = useCallback(
    (action, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) =>
      new Promise((resolve, reject) => {
        if (!webViewRef.current) {
          reject(new Error('WebView hazır değil'));
          return;
        }
        const requestId = String(nextRequestIdRef.current++);
        const timer = setTimeout(() => {
          if (pendingRef.current.has(requestId)) {
            pendingRef.current.delete(requestId);
            reject(new Error(`Timeout: ${action}`));
          }
        }, timeoutMs);

        pendingRef.current.set(requestId, {
          resolve: (data) => { clearTimeout(timer); resolve(data); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        });

        const msg = JSON.stringify({ requestId, action, ...payload });
        const escaped = escapeForInjection(msg);
        webViewRef.current.injectJavaScript(`
          window.dispatchEvent(new MessageEvent('message', { data: '${escaped}' }));
          true;
        `);
      }),
    [webViewRef]
  );

  // ---------- Köprü: WebView -> RN ----------
  // App.js'in onMessage handler'ından çağrılır. Mesaj kayıtlı bir
  // requestId taşıyorsa eşleşen promise'i resolve eder ve true döner.
  const tryHandleMessage = useCallback((data) => {
    if (!data || data.requestId == null) return false;
    const id = String(data.requestId);
    const handler = pendingRef.current.get(id);
    if (!handler) return false;
    pendingRef.current.delete(id);
    handler.resolve(data);
    return true;
  }, []);

  // ---------- Navigasyon bekleme ----------
  const waitForNavigation = useCallback(
    (timeoutMs = NAVIGATION_TIMEOUT_MS) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          navResolverRef.current = null;
          reject(new Error('Navigation timeout'));
        }, timeoutMs);
        navResolverRef.current = (url) => {
          clearTimeout(timer);
          resolve(url);
        };
      }),
    []
  );

  const onWebViewLoadEnd = useCallback((event) => {
    const url = event?.nativeEvent?.url;
    const resolver = navResolverRef.current;
    if (resolver) {
      navResolverRef.current = null;
      resolver(url);
    }
  }, []);

  // ---------- Public eylemler ----------
  const stop = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
  }, []);

  const clear = useCallback(() => {
    setCollectedData([]);
    setTotalCollected(0);
    setCurrentPage(0);
  }, []);

  const start = useCallback(async () => {
    if (isRunningRef.current) return;
    const listSelector = listSelectorRef.current;
    if (!listSelector) {
      setStatus('Önce "Locate List Item" ile bir seçici belirleyin');
      return;
    }
    if (!webViewRef.current) {
      setStatus('WebView hazır değil');
      return;
    }

    isRunningRef.current = true;
    setIsRunning(true);
    setCurrentPage(0);
    setStatus('Scraping başlatıldı');

    let lastUrl = null;
    let stoppedReason = null;

    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (!isRunningRef.current) {
          stoppedReason = 'Kullanıcı durdurdu';
          break;
        }
        setCurrentPage(page);
        setStatus(`Sayfa ${page} taranıyor...`);

        // 1) scrape
        let result;
        try {
          result = await request('scrapePage', { listSelector });
        } catch (err) {
          stoppedReason = `Scrape hatası: ${err.message}`;
          break;
        }
        if (result.error) {
          stoppedReason = `Sayfa ${page}: ${result.error}`;
          break;
        }

        const items = Array.isArray(result.data) ? result.data : [];
        if (items.length > 0) {
          setCollectedData((prev) => {
            const next = prev.concat(items);
            setTotalCollected(next.length);
            return next;
          });
        }
        lastUrl = result.pageUrl || lastUrl;
        setStatus(`Sayfa ${page}: +${items.length} item`);

        const nextSelector = nextSelectorRef.current;
        if (!nextSelector) {
          stoppedReason = 'Sonraki sayfa seçicisi yok';
          break;
        }

        // 2) delay
        const delayMs = Math.max(0, (parseFloat(delayRef.current) || 0) * 1000);
        if (delayMs > 0) await sleep(delayMs);
        if (!isRunningRef.current) {
          stoppedReason = 'Kullanıcı durdurdu';
          break;
        }

        // 3) navigasyon promise'ini click'ten ÖNCE kur (race önleme)
        const navPromise = waitForNavigation();

        // 4) click
        let clickResult;
        try {
          clickResult = await request(
            'clickNextButton',
            { nextSelector },
            CLICK_TIMEOUT_MS
          );
        } catch (err) {
          navResolverRef.current = null;
          stoppedReason = `Click hatası: ${err.message}`;
          break;
        }
        if (!clickResult.success) {
          navResolverRef.current = null;
          stoppedReason = `Next button: ${clickResult.error || 'tıklanamadı'}`;
          break;
        }

        // 5) sayfanın yüklenmesini bekle
        let newUrl;
        try {
          newUrl = await navPromise;
        } catch (err) {
          stoppedReason = `Navigasyon: ${err.message}`;
          break;
        }
        if (newUrl && newUrl === lastUrl) {
          stoppedReason = `URL değişmedi (${newUrl})`;
          break;
        }
        lastUrl = newUrl || lastUrl;
      }

      if (!stoppedReason && isRunningRef.current) {
        stoppedReason = `Maksimum ${MAX_PAGES} sayfa limitine ulaşıldı`;
      }
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
      navResolverRef.current = null;
      setStatus(`Tamamlandı — ${stoppedReason || 'bitti'}`);
    }
  }, [request, setStatus, waitForNavigation, webViewRef]);

  return {
    isRunning,
    currentPage,
    totalCollected,
    collectedData,
    start,
    stop,
    clear,
    tryHandleMessage,
    onWebViewLoadEnd,
  };
}
