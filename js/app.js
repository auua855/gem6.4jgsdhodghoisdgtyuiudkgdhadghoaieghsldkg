import { AppState, Elements, AppInit, loadActiveProfileToUI } from './state.js';
import { initUIElements } from './ui.js';
import './api.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM要素のマッピング
    Elements.chatContainer = document.getElementById('chat-container');
    Elements.textarea = document.getElementById('user-input');

    // UIイベントリスナー等の初期化
    initUIElements();

    // アプリケーションの初期化
    AppInit.initPIN();
    AppInit.loadSettings();
    
    // アクティブなプロファイルをUIにロード
    loadActiveProfileToUI();

    // キャッシュUIの更新
    if (window.updateCacheUI) window.updateCacheUI();
    
    // 履歴と文字カウントの反映
    if (window.loadHistory) window.loadHistory();
    if (window.updateCharCount) window.updateCharCount();

    console.log("Gemini App Initialized with Active Profile:", AppState.activeProfileId);
});
