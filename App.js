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

export default function App() {
  const [url, setUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [delay, setDelay] = useState('2');
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('Hazır');
  const [nextButtonSelector, setNextButtonSelector] = useState(null);
  const [listItemSelector, setListItemSelector] = useState(null);

  const webViewRef = useRef(null);

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

  const handleLocateNextButton = () => {
    console.log('[Locate Next Button] seçici modu');
    setStatus('Sonraki sayfa butonunu seçin');
  };

  const handleLocateListItem = () => {
    console.log('[Locate List Item] seçici modu');
    setStatus('Liste öğesini seçin');
  };

  const handleStart = () => {
    console.log('[Başla] delay:', delay, 'sn');
    setIsRunning(true);
    setStatus('Çalışıyor...');
  };

  const handleStop = () => {
    console.log('[Durdur]');
    setIsRunning(false);
    setStatus('Durduruldu');
  };

  const handleExportJson = () => {
    console.log('[Export JSON]');
    setStatus('JSON dışa aktarılıyor...');
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
            <Text style={styles.btnText}>Export JSON</Text>
          </TouchableOpacity>
        </View>

        {/* 3. WebView */}
        <View style={styles.webViewWrap}>
          {currentUrl ? (
            <WebView
              ref={webViewRef}
              source={{ uri: currentUrl }}
              style={styles.webView}
              originWhitelist={['*']}
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
});
