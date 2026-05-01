// ==========================================
// 状態管理 (State Management)
// ==========================================

export const AppState = {
    selectedFile: null,
    totalCharCount: 0,     // Current active profile's count
    chatSession: null,
    chatHistory: [],       // Current active profile's history
    activeProfileId: null, // Points to the currently loaded AI
    profiles: [],          // Array of all AI personas
    settings: {
        apiKey: '',        // Global across all profiles
    },

    // Current active profile's settings below, mapped dynamically:
    current: {
        persona: '',
        model: 'gemini-3.1-pro-preview',
        ttsModel: 'gemini-2.5-pro-preview-tts',
        ttsVoice: 'Puck',
        ttsStyle: 'Read aloud in a warm and friendly tone: ',
        ttsSplitCount: 1,
        aiName: 'gemini',
        persistentCacheText: '',
        persistentHistoryText: '',
        metaTexts: ['', '', ''],
        activeMetaIndex: 0,
        baseBgImage: '',      // 基本の背景画像 (Base64)
        bgPatterns: [],       // { keyword: '', image: '' }
        returnKeyword: '',    // 元に戻すキーワード
        queuedBgImage: null,  // AIの返答時に切り替える予約画像
        
        // 修正: キャッシュ画面の一時状態（テキストと添付ファイル）をAIごとに分離
        pendingCacheText: '',
        pendingCacheFiles: [], // メモリ保持用 (Fileオブジェクト)
        
        safetyHarassment: 'BLOCK_NONE',
        safetyHate: 'BLOCK_NONE',
        safetySexuallyExplicit: 'BLOCK_NONE',
        safetyDangerousContent: 'BLOCK_NONE'
    }
};

export const Elements = {
    // これらの要素は app.js などで初期化時にマッピングされます
    chatContainer: null,
    textarea: null
};

// --- 初期化ロジック (Initialization) ---
export const AppInit = {
    initPIN() {
        const pinInput = document.getElementById('pin-input');
        if (!pinInput) return;
        pinInput.focus();
        pinInput.addEventListener('input', (e) => {
            if (e.target.value.length === 4) {
                if (e.target.value === '6160') {
                    document.getElementById('pin-overlay').style.display = 'none';
                } else {
                    document.getElementById('pin-error').style.display = 'block';
                    e.target.value = '';
                }
            } else {
                document.getElementById('pin-error').style.display = 'none';
            }
        });
    },

    loadSettings() {
        AppState.settings.apiKey = localStorage.getItem('gemini_api_key') || '';

        let storedProfiles = localStorage.getItem('gemini_profiles');

        if (!storedProfiles) {
            console.log("No profiles found. Migrating old storage to Profile 1.");
            let metaTexts = ['', '', ''];
            try { metaTexts = JSON.parse(localStorage.getItem('gemini_meta_texts')) || metaTexts; } catch { }

            const defaultProfile = {
                id: 'ai_' + Date.now(),
                name: localStorage.getItem('gemini_ai_name') || 'gemini',
                model: localStorage.getItem('gemini_model') || 'gemini-3.1-pro-preview',
                persona: localStorage.getItem('gemini_persona') || '',
                ttsVoice: localStorage.getItem('gemini_tts_voice') || 'Puck',
                ttsStyle: localStorage.getItem('gemini_tts_style') || 'Read aloud in a warm and friendly tone: ',
                ttsSplitCount: parseInt(localStorage.getItem('gemini_tts_split')) || 1,
                persistentCacheText: localStorage.getItem('gemini_persistent_cache') || '',
                persistentHistoryText: localStorage.getItem('gemini_persistent_history') || '',
                metaTexts: metaTexts,
                activeMetaIndex: parseInt(localStorage.getItem('gemini_meta_index')) || 0,
                baseBgImage: '',
                bgPatterns: [],
                returnKeyword: '',
                chatHistory: JSON.parse(localStorage.getItem('gemini_chat_history')) || [],
                totalCharCount: parseInt(localStorage.getItem('gemini_char_count'), 10) || 0,
                pendingCacheText: '',
                pendingCacheFiles: []
            };

            AppState.profiles = [defaultProfile];
            AppState.activeProfileId = defaultProfile.id;

            localStorage.setItem('gemini_profiles', JSON.stringify(AppState.profiles));
            localStorage.setItem('gemini_active_profile', AppState.activeProfileId);
        } else {
            AppState.profiles = JSON.parse(storedProfiles);
            AppState.activeProfileId = localStorage.getItem('gemini_active_profile');

            if (!AppState.profiles.find(p => p.id === AppState.activeProfileId)) {
                AppState.activeProfileId = AppState.profiles[0].id;
            }
        }
    }
};

export const saveActiveProfile = () => {
    const index = AppState.profiles.findIndex(p => p.id === AppState.activeProfileId);
    if (index !== -1) {
        // UIや一時Stateの内容をプロファイルオブジェクトに反映
        const profileToSave = {
            ...AppState.profiles[index],
            ...AppState.current,
            chatHistory: AppState.chatHistory ? JSON.parse(JSON.stringify(AppState.chatHistory)) : [],
            totalCharCount: AppState.totalCharCount
        };

        // pendingCacheFilesはFileオブジェクトの配列なのでLocalStorageには保存できないため、除外する
        const { pendingCacheFiles, ...serializableProfile } = profileToSave;

        // メモリ側にはすべて保持
        AppState.profiles[index] = profileToSave;

        // LocalStorageにはシリアライズ可能なプロファイルのみ保存
        const serializableProfiles = AppState.profiles.map(p => {
             const { pendingCacheFiles, ...rest } = p;
             return rest;
        });
        localStorage.setItem('gemini_profiles', JSON.stringify(serializableProfiles));
    }
};

export const loadActiveProfileToUI = () => {
    const profile = AppState.profiles.find(p => p.id === AppState.activeProfileId);
    if (!profile) return;

    Object.assign(AppState.current, profile);
    AppState.chatHistory = profile.chatHistory ? JSON.parse(JSON.stringify(profile.chatHistory)) : [];
    AppState.totalCharCount = profile.totalCharCount || 0;
    
    // 一時データの復旧（メモリ内にあれば）
    AppState.current.pendingCacheText = profile.pendingCacheText || '';
    AppState.current.pendingCacheFiles = profile.pendingCacheFiles || [];

    // UI反映
    const El = (id) => document.getElementById(id);
    
    if (El('api-key')) El('api-key').value = AppState.settings.apiKey;
    if (El('persona-setting')) El('persona-setting').value = profile.persona;
    if (El('model-select')) El('model-select').value = profile.model;
    if (El('tts-model-select')) El('tts-model-select').value = profile.ttsModel || 'gemini-2.5-pro-preview-tts';
    if (El('tts-voice-select')) El('tts-voice-select').value = profile.ttsVoice;
    if (El('tts-style-input')) El('tts-style-input').value = profile.ttsStyle;
    if (El('tts-split-select')) El('tts-split-select').value = profile.ttsSplitCount || 1;
    if (El('ai-name-input')) El('ai-name-input').value = profile.name;
    if (El('ai-name-display')) El('ai-name-display').innerText = profile.name;
    if (El('persistent-cache-text')) El('persistent-cache-text').value = profile.persistentCacheText;
    if (El('persistent-history-text')) El('persistent-history-text').value = profile.persistentHistoryText;

    if (El('return-keyword')) El('return-keyword').value = profile.returnKeyword || '';
    if (El('base-bg-preview')) El('base-bg-preview').style.backgroundImage = profile.baseBgImage ? `url(${profile.baseBgImage})` : 'none';
    
    if (window.updateChatBackground) {
        window.updateChatBackground(profile.baseBgImage);
    }
    
    const patternsContainer = El('patterns-container');
    if (patternsContainer) {
        patternsContainer.innerHTML = '';
        if (profile.bgPatterns && window.addPatternUI) {
            profile.bgPatterns.forEach(p => window.addPatternUI(p.keyword, p.image));
        }
    }

    if (El('meta-text-1')) El('meta-text-1').value = profile.metaTexts[0] || '';
    if (El('meta-text-2')) El('meta-text-2').value = profile.metaTexts[1] || '';
    if (El('meta-text-3')) El('meta-text-3').value = profile.metaTexts[2] || '';
    const activeRadio = document.querySelector(`input[name="meta-select"][value="${profile.activeMetaIndex}"]`);
    if (activeRadio) activeRadio.checked = true;

    // キャッシュ作成画面のUIをこのAI用に復元
    const cacheTextEl = El('cache-text');
    if (cacheTextEl) {
        cacheTextEl.value = AppState.current.pendingCacheText;
        cacheTextEl.dispatchEvent(new Event('input')); // トークン数を更新
    }
    if (window.updateCacheFileListUI) {
        window.updateCacheFileListUI();
    }

    document.title = `${profile.name} Window`;
};
