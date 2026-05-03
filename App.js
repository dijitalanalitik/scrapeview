import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { elementPickerScript } from './src/utils/elementPicker';
import { scraperScript } from './src/utils/scraper';
import { useScraper } from './src/hooks/useScraper';

// İki IIFE'yi tek bir injected string'de birleştir
const injectedScripts = `${elementPickerScript}\n${scraperScript}`;

function SelectorChip({ label, value, onRemove }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue} numberOfLines={1}>
        {value}
      </Text>
      <TouchableOpacity
        style={styles.chipClose}
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.chipCloseText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [url, setUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [delay, setDelay] = useState('2');
  const [status, setStatus] = useState('Hazır');
  const [nextButtonSelector, setNextButtonSelector] = useState(null);
  const [listItemSelector, setListItemSelector] = useState(null);

  const webViewRef = useRef(null);

  const scraper = useScraper({
    webViewRef,
    nextButtonSelector,
    listItemSelector,
    delay,
    onStatus: setStatus,
  });
  const { isRunning, currentPage, totalCollected, collectedData } = scraper;

  const normalizeUrl = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handleGo = () => {
    const target = normalizeUrl(url);
    if (!target) {
      console.log('[Git] boş URL');
      return;
    }
    console.log('[Git] yükleniyor:', target);
    setCurrentUrl(target);
    setStatus(`Yüklendi: ${target}`);
  };

  const triggerPicking = (target) => {
    if (!webViewRef.current || !currentUrl) {
      setStatus('Önce bir URL yükleyin');
      return;
    }
    const payload = JSON.stringify({ action: 'startPicking', target });
    const escaped = payload.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webViewRef.current.injectJavaScript(`
      window.dispatchEvent(new MessageEvent('message', { data: '${escaped}' }));
      true;
    `);
  };

  const handleLocateNextButton = () => {
    console.log('[Locate Next Button] seçici modu');
    setStatus('Sonraki sayfa butonunu seçin');
    triggerPicking('nextButton');
  };

  const handleLocateListItem = () => {
    console.log('[Locate List Item] seçici modu');
    setStatus('Liste öğesini seçin');
    triggerPicking('listItem');
  };

  const handleWebViewMessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      console.warn('[onMessage] parse hatası:', e, event.nativeEvent.data);
      return;
    }
    // Önce scraper köprüsüne bak (requestId taşıyor mu?)
    if (scraper.tryHandleMessage(data)) return;

    // Picker mesajları
    if (data.type === 'elementPicked') {
      console.log('[picker] seçildi:', data.target, '→', data.selector);
      if (data.target === 'nextButton') setNextButtonSelector(data.selector);
      else if (data.target === 'listItem') setListItemSelector(data.selector);
      setStatus(`Seçildi (${data.target}): ${data.selector}`);
    } else if (data.type === 'pickingStarted') {
      setStatus(`Seçim modu açık: ${data.target}`);
    } else if (data.type === 'error') {
      console.warn('[bridge] hata:', data.error || data.message);
    }
  };

  const handleStart = () => {
    console.log('[Başla] delay:', delay, 'sn');
    scraper.start();
  };

  const handleStop = () => {
    console.log('[Durdur]');
    scraper.stop();
  };

  const handleExportJson = () => {
    console.log('[Export JSON] kayıt sayısı:', collectedData.length);
    if (collectedData.length === 0) {
      setStatus('Dışa aktarılacak veri yok');
      return;
    }
    // TODO: expo-file-system + expo-sharing entegrasyonu (sonraki adım)
    setStatus(`${collectedData.length} kayıt hazır (export henüz aktif değil)`);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 1. URL bar */}
        <View style={styles.urlRow}>
          <TextInput
            style={styles.urlInput}
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com"
            placeholderTextColor="#9aa0a6"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleGo}
          />
          <TouchableOpacity style={styles.goButton} onPress={handleGo}>
            <Text style={styles.goButtonText}>Git</Text>
          </TouchableOpacity>
        </View>

        {/* 2. Kontrol paneli */}
        <View style={styles.controlPanel}>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnNeutral, styles.flex]}
              onPress={handleLocateNextButton}
            >
              <Text style={styles.btnText}>Locate Next Button</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnNeutral, styles.flex]}
              onPress={handleLocateListItem}
            >
              <Text style={styles.btnText}>Locate List Item</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlRow}>
            <View style={styles.delayWrap}>
              <Text style={styles.delayLabel}>Delay (sn)</Text>
              <TextInput
                style={styles.delayInput}
                value={delay}
                onChangeText={setDelay}
                keyboardType="numeric"
                placeholder="2"
                placeholderTextColor="#9aa0a6"
              />
            </View>
            <TouchableOpacity
              style={[styles.btn, styles.btnStart, styles.flex]}
              onPress={handleStart}
              disabled={isRunning}
            >
              <Text style={styles.btnTextLight}>Başla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnStop, styles.flex]}
              onPress={handleStop}
              disabled={!isRunning}
            >
              <Text style={styles.btnTextLight}>Durdur</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnExport]}
            onPress={handleExportJson}
          >
            <Text style={styles.btnText}>
              Export JSON{totalCollected > 0 ? ` (${totalCollected})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 2.5 Seçilen selector chip'leri */}
        {(nextButtonSelector || listItemSelector) && (
          <View style={styles.chipsRow}>
            {nextButtonSelector && (
              <SelectorChip
                label="Next"
                value={nextButtonSelector}
                onRemove={() => {
                  setNextButtonSelector(null);
                  setStatus('Next button silindi');
                }}
              />
            )}
            {listItemSelector && (
              <SelectorChip
                label="Item"
                value={listItemSelector}
                onRemove={() => {
                  setListItemSelector(null);
                  setStatus('List item silindi');
                }}
              />
            )}
          </View>
        )}

        {/* 3. WebView */}
        <View style={styles.webViewWrap}>
          {currentUrl ? (
            <WebView
              ref={webViewRef}
              source={{ uri: currentUrl }}
              style={styles.webView}
              originWhitelist={['*']}
              javaScriptEnabled
              injectedJavaScriptBeforeContentLoaded={injectedScripts}
              onMessage={handleWebViewMessage}
              onLoadEnd={scraper.onWebViewLoadEnd}
            />
          ) : (
            <View style={styles.webViewPlaceholder}>
              <Text style={styles.placeholderText}>
                Bir URL girin ve "Git" tuşuna basın
              </Text>
            </View>
          )}
        </View>

        {/* 4. Status bar */}
        <View style={styles.statusBar}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isRunning ? '#22c55e' : '#9aa0a6' },
            ]}
          />
          <Text style={styles.statusText} numberOfLines={1}>
            {status}
          </Text>
          {(currentPage > 0 || totalCollected > 0) && (
            <Text style={styles.statusMeta}>
              {currentPage > 0 ? `s${currentPage}` : ''}
              {currentPage > 0 && totalCollected > 0 ? ' · ' : ''}
              {totalCollected > 0 ? `${totalCollected} kayıt` : ''}
            </Text>
          )}
        </View>
        </KeyboardAvoidingView>
        <StatusBar style="auto" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f5f6f8',
  },
  flex: {
    flex: 1,
  },

  urlRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d4da',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: '#f0f1f4',
    borderRadius: 8,
    fontSize: 14,
    color: '#1f2329',
  },
  goButton: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  controlPanel: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d4da',
    gap: 8,
  },
  controlRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  btn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnNeutral: {
    backgroundColor: '#e8eaed',
  },
  btnExport: {
    backgroundColor: '#e8eaed',
  },
  btnStart: {
    backgroundColor: '#22c55e',
  },
  btnStop: {
    backgroundColor: '#ef4444',
  },
  btnText: {
    color: '#1f2329',
    fontSize: 13,
    fontWeight: '600',
  },
  btnTextLight: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  delayWrap: {
    width: 90,
    height: 40,
    paddingHorizontal: 10,
    backgroundColor: '#f0f1f4',
    borderRadius: 8,
    justifyContent: 'center',
  },
  delayLabel: {
    fontSize: 9,
    color: '#5f6368',
    marginBottom: 1,
  },
  delayInput: {
    fontSize: 14,
    color: '#1f2329',
    padding: 0,
  },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d4da',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderRadius: 14,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
    maxWidth: '100%',
    gap: 6,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3730a3',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipValue: {
    fontSize: 12,
    color: '#1f2329',
    flexShrink: 1,
    maxWidth: 200,
  },
  chipClose: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c7d2fe',
  },
  chipCloseText: {
    fontSize: 14,
    lineHeight: 16,
    color: '#3730a3',
    fontWeight: '700',
  },

  webViewWrap: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webView: {
    flex: 1,
  },
  webViewPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderText: {
    color: '#9aa0a6',
    fontSize: 14,
    textAlign: 'center',
  },

  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1f2329',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    flex: 1,
  },
  statusMeta: {
    color: '#9aa0a6',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
});
