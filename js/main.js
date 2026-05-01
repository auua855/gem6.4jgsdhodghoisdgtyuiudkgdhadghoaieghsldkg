
        // ==========================================
        //          JAVASCRIPT LOGIC
        // ==========================================

        // --- 状態管理 (State Management) ---
        const AppState = {
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
                ttsVoice: 'Puck',
                ttsStyle: 'Read aloud in a warm and friendly tone: ',
                aiName: 'gemini',
                persistentCacheText: '',
                persistentHistoryText: '',
                metaTexts: ['', '', ''],
                activeMetaIndex: 0,
                baseBgImage: '',      // 基本の背景画像 (Base64)
                bgPatterns: [],       // { keyword: '', image: '' }
                returnKeyword: '',    // 元に戻すキーワード
                queuedBgImage: null   // AIの返答時に切り替える予約画像
            }
        };

        // DOM要素のキャッシュ
        const Elements = {
            chatContainer: document.getElementById('chat-container'),
            textarea: document.getElementById('user-input')
        };

        // Service Workerの登録
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('SW registered!', reg))
                .catch(err => console.log('SW registration failed: ', err));
        }

        // --- 初期化ロジック (Initialization) ---
        const AppInit = {
            initPIN() {
                const pinInput = document.getElementById('pin-input');
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
                // 1. グローバル設定の読み込み
                AppState.settings.apiKey = localStorage.getItem('gemini_api_key') || '';

                // 2. プロファイル一覧の取得
                let storedProfiles = localStorage.getItem('gemini_profiles');

                if (!storedProfiles) {
                    // === マイグレーション: 古いデータをプロファイル1として保存 ===
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
                        persistentCacheText: localStorage.getItem('gemini_persistent_cache') || '',
                        persistentHistoryText: localStorage.getItem('gemini_persistent_history') || '',
                        metaTexts: metaTexts,
                        activeMetaIndex: parseInt(localStorage.getItem('gemini_meta_index')) || 0,
                        baseBgImage: '',
                        bgPatterns: [],
                        returnKeyword: '',
                        chatHistory: JSON.parse(localStorage.getItem('gemini_chat_history')) || [],
                        totalCharCount: parseInt(localStorage.getItem('gemini_char_count'), 10) || 0
                    };

                    AppState.profiles = [defaultProfile];
                    AppState.activeProfileId = defaultProfile.id;

                    // 保存してマイグレーション完了
                    localStorage.setItem('gemini_profiles', JSON.stringify(AppState.profiles));
                    localStorage.setItem('gemini_active_profile', AppState.activeProfileId);
                } else {
                    // 通常の読み込み
                    AppState.profiles = JSON.parse(storedProfiles);
                    AppState.activeProfileId = localStorage.getItem('gemini_active_profile');

                    // 万が一アクティブプロファイルが見つからない場合のフォールバック
                    if (!AppState.profiles.find(p => p.id === AppState.activeProfileId)) {
                        AppState.activeProfileId = AppState.profiles[0].id;
                    }
                }

                // UIとカレントStateへの反映
                window.loadActiveProfileToUI();
            }
        };

        window.loadActiveProfileToUI = () => {
            const profile = AppState.profiles.find(p => p.id === AppState.activeProfileId);
            if (!profile) return;

            // アプリの一時状態にマッピング
            Object.assign(AppState.current, profile);
            AppState.chatHistory = profile.chatHistory ? JSON.parse(JSON.stringify(profile.chatHistory)) : [];
            AppState.totalCharCount = profile.totalCharCount || 0;

            // UI反映
            document.getElementById('api-key').value = AppState.settings.apiKey;
            document.getElementById('persona-setting').value = profile.persona;
            document.getElementById('model-select').value = profile.model;
            document.getElementById('tts-voice-select').value = profile.ttsVoice;
            document.getElementById('tts-style-input').value = profile.ttsStyle;
            document.getElementById('ai-name-input').value = profile.name; // IDは 'ai-name-input' のまま
            document.getElementById('ai-name-display').innerText = profile.name;
            document.getElementById('persistent-cache-text').value = profile.persistentCacheText;
            document.getElementById('persistent-history-text').value = profile.persistentHistoryText;

            // キャラクター・背景の反映
            document.getElementById('return-keyword').value = profile.returnKeyword || '';
            document.getElementById('base-bg-preview').style.backgroundImage = profile.baseBgImage ? `url(${profile.baseBgImage})` : 'none';
            window.updateChatBackground(profile.baseBgImage);
            
            const patternsContainer = document.getElementById('patterns-container');
            patternsContainer.innerHTML = '';
            if (profile.bgPatterns) {
                profile.bgPatterns.forEach(p => window.addPatternUI(p.keyword, p.image));
            }

            // メタ指示のUI反映
            document.getElementById('meta-text-1').value = profile.metaTexts[0] || '';
            document.getElementById('meta-text-2').value = profile.metaTexts[1] || '';
            document.getElementById('meta-text-3').value = profile.metaTexts[2] || '';
            const activeRadio = document.querySelector(`input[name="meta-select"][value="${profile.activeMetaIndex}"]`);
            if (activeRadio) activeRadio.checked = true;

            document.title = `${profile.name} Window`;
        };

        // ==========================================
        //  UI & 設定 (UI & Settings)
        // ==========================================

        // 入力欄の高さ自動調整
        const textarea = document.getElementById('user-input');
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // キャッシュテキストの推定トークン数計算
        const cacheTextarea = document.getElementById('cache-text');
        cacheTextarea.addEventListener('input', function () {
            const charCount = this.value.length;
            const estimatedTokens = charCount * 2;
            document.getElementById('cache-token-counter').innerText = `予想トークン数: ${estimatedTokens.toLocaleString()}`;
        });

        window.toggleSettings = () => {
            const overlay = document.getElementById('settings-overlay');
            overlay.style.display = overlay.style.display === 'block' ? 'none' : 'block';
        };

        window.switchSettingsTab = (tabId, btn) => {
            // タブボタンの切り替え
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // コンテンツの切り替え
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        };

        window.pasteMetaInstruction = () => {
            const index = AppState.current.activeMetaIndex;
            const textToPaste = AppState.current.metaTexts ? AppState.current.metaTexts[index] : '';
            if (!textToPaste) {
                alert("選択されているメタ指示が空です。設定の「保存」タブから入力してください。");
                return;
            }
            const inputEl = document.getElementById('user-input');
            const currentVal = inputEl.value;

            // ユーザー指定通り「一番最後」に貼り付ける
            if (currentVal.length > 0 && !currentVal.endsWith('\n')) {
                inputEl.value = currentVal + '\n\n' + textToPaste;
            } else {
                inputEl.value = currentVal + textToPaste;
            }

            inputEl.dispatchEvent(new Event('input')); // 高さを自動調整
            inputEl.focus();
        };

        window.saveCurrentSessionHistory = () => {
            if (AppState.chatHistory.length === 0) {
                alert("保存する会話履歴がありません！");
                return;
            }

            // 履歴をテキストフォーマットに変換
            let sessionText = `\n\n--- [保存日時: ${new Date().toLocaleString()}] ---\n`;
            AppState.chatHistory.forEach(msg => {
                const roleName = msg.role === 'user' ? 'User' : (AppState.current.name || 'AI');
                sessionText += `【${roleName}】\n${msg.parts[0].text}\n\n`;
            });

            // StateとUIを更新
            AppState.current.persistentHistoryText += sessionText;
            document.getElementById('persistent-history-text').value = AppState.current.persistentHistoryText;
            window.saveActiveProfile();

            // 保存タブを開いて見せる
            window.toggleSettings();
            window.switchSettingsTab('tab-save', document.getElementById('tab-btn-save'));
        };

        window.pasteToCacheInput = (sourceId) => {
            const sourceText = document.getElementById(sourceId).value;
            const targetEl = document.getElementById('cache-text');
            if (!sourceText) return;

            targetEl.value = (targetEl.value + "\n\n" + sourceText).trim();
            // 入力イベントを発火させてトークン数を更新
            targetEl.dispatchEvent(new Event('input'));

            // 設定タブに戻って一番下（キャッシュ欄）までスクロールさせる
            window.switchSettingsTab('tab-settings', document.querySelector('.tab-btn:first-child'));
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };

        window.clearPersistentStorage = (sourceId) => {
            if (!confirm("この枠の保存テキストをすべて削除しますか？\n（元には戻せません）")) return;

            document.getElementById(sourceId).value = '';
            if (sourceId === 'persistent-cache-text') {
                AppState.current.persistentCacheText = '';
            } else if (sourceId === 'persistent-history-text') {
                AppState.current.persistentHistoryText = '';
            }
            window.saveActiveProfile();
        };

        window.saveActiveProfile = () => {
            const index = AppState.profiles.findIndex(p => p.id === AppState.activeProfileId);
            if (index !== -1) {
                // 現在のUIや一時Stateの内容をプロファイルオブジェクトに反映
                AppState.profiles[index] = {
                    ...AppState.profiles[index],
                    ...AppState.current,
                    chatHistory: AppState.chatHistory ? JSON.parse(JSON.stringify(AppState.chatHistory)) : [],
                    totalCharCount: AppState.totalCharCount
                };
                localStorage.setItem('gemini_profiles', JSON.stringify(AppState.profiles));
            }
        };

        // ==========================================
        //  ホーム画面処理 (Home / Profile Management)
        // ==========================================

        window.openHomeOverlay = () => {
            document.getElementById('home-overlay').style.display = 'block';
            window.renderHomeOverlay();
        };

        window.renderHomeOverlay = () => {
            const container = document.getElementById('ai-list-container');
            container.innerHTML = '';

            AppState.profiles.forEach(p => {
                const isActive = p.id === AppState.activeProfileId;
                const charCount = (p.totalCharCount || 0).toLocaleString();

                const card = document.createElement('div');
                card.className = `ai-card ${isActive ? 'active-ai' : ''}`;
                card.onclick = () => window.switchAI(p.id);

                // 削除ボタン (SVGアイコンに変更)
                const deleteBtn = `<button onclick="event.stopPropagation(); window.deleteAI('${p.id}')" style="background:none; border:none; color:#ff4444; padding:8px; cursor:pointer;" title="このAIを削除">
                    <svg viewBox="0 0 24 24" style="width:20px; height:20px; fill:currentColor;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>`;

                card.innerHTML = `
                    <div class="ai-info">
                        <div class="ai-name">${p.name} ${isActive ? '<span style="color:#4CAF50; font-size:12px;">(選択中)</span>' : ''}</div>
                        <div class="ai-stats">モデル: ${p.model} | 会話文字数: ${charCount} 文字</div>
                    </div>
                    ${AppState.profiles.length > 1 ? deleteBtn : ''}
                `;
                container.appendChild(card);
            });
        };

        window.createNewAI = () => {
            const newProfile = {
                id: 'ai_' + Date.now(),
                name: '新しいAI ' + (AppState.profiles.length + 1),
                model: 'gemini-3.1-pro-preview',
                persona: '',
                ttsVoice: 'Puck',
                ttsStyle: 'Read aloud in a warm and friendly tone: ',
                persistentCacheText: '',
                persistentHistoryText: '',
                metaTexts: ['', '', ''],
                activeMetaIndex: 0,
                baseBgImage: '',
                bgPatterns: [],
                returnKeyword: '',
                chatHistory: [],
                totalCharCount: 0
            };

            AppState.profiles.push(newProfile);
            localStorage.setItem('gemini_profiles', JSON.stringify(AppState.profiles));
            window.renderHomeOverlay();
        };

        window.switchAI = (id) => {
            if (AppState.activeProfileId === id) {
                document.getElementById('home-overlay').style.display = 'none';
                return;
            }

            // 切り替える前に今の状態を保存
            window.saveActiveProfile();

            // IDを切り替えてUIを再ロード
            AppState.activeProfileId = id;
            localStorage.setItem('gemini_active_profile', id);
            window.loadActiveProfileToUI();

            // チャット履歴の再構築
            document.getElementById('chat-container').innerHTML = '';
            loadHistory();
            updateCharCount();

            if (window.checkCacheWarning) window.checkCacheWarning();

            document.getElementById('home-overlay').style.display = 'none';
        };

        window.deleteAI = (id) => {
            if (AppState.profiles.length <= 1) {
                alert("最後のAIは削除できません。");
                return;
            }
            if (!confirm("本当にこのAIを削除しますか？\n会話履歴や設定はすべて失われます。")) return;

            AppState.profiles = AppState.profiles.filter(p => p.id !== id);
            localStorage.setItem('gemini_profiles', JSON.stringify(AppState.profiles));

            // もしアクティブなAIを消したなら、残りの中から最初のAIに切り替える
            if (AppState.activeProfileId === id) {
                window.switchAI(AppState.profiles[0].id);
            } else {
                window.renderHomeOverlay();
            }
        };

        window.saveSettings = () => {
            // グローバルAPIキーの保存
            AppState.settings.apiKey = document.getElementById('api-key').value;
            localStorage.setItem('gemini_api_key', AppState.settings.apiKey);

            // カレントプロファイル内容の取得
            AppState.current.name = document.getElementById('ai-name-input').value;
            AppState.current.persona = document.getElementById('persona-setting').value;
            AppState.current.model = document.getElementById('model-select').value;
            AppState.current.ttsVoice = document.getElementById('tts-voice-select').value;
            AppState.current.ttsStyle = document.getElementById('tts-style-input').value;

            // タブのテキストエリアも保存
            AppState.current.persistentCacheText = document.getElementById('persistent-cache-text').value;
            AppState.current.persistentHistoryText = document.getElementById('persistent-history-text').value;

            // メタ指示の保存
            AppState.current.metaTexts[0] = document.getElementById('meta-text-1').value;
            AppState.current.metaTexts[1] = document.getElementById('meta-text-2').value;
            AppState.current.metaTexts[2] = document.getElementById('meta-text-3').value;

            const selectedMeta = document.querySelector('input[name="meta-select"]:checked');
            if (selectedMeta) {
                AppState.current.activeMetaIndex = parseInt(selectedMeta.value);
            }

            // キャラクター・背景設定の保存
            AppState.current.returnKeyword = document.getElementById('return-keyword').value;
            const patternItems = document.querySelectorAll('.pattern-item');
            AppState.current.bgPatterns = [];
            patternItems.forEach(item => {
                const kw = item.querySelector('.pattern-kw').value;
                const img = item.querySelector('.pattern-data').value;
                if (kw || img) {
                    AppState.current.bgPatterns.push({ keyword: kw, image: img });
                }
            });

            // まとめてプロファイルへ保存
            window.saveActiveProfile();

            // 更新された設定をUIへ再読込
            window.loadActiveProfileToUI();

            if (window.checkCacheWarning) window.checkCacheWarning();

            AppState.chatSession = null;
            toggleSettings();
        };

        window.clearHistory = () => {
            if (confirm('会話履歴をすべて消去しますか？')) {
                AppState.chatHistory = [];
                document.getElementById('chat-container').innerHTML = '';
                AppState.chatSession = null;
                AppState.totalCharCount = 0;
                updateCharCount();

                // 履歴を消去しても背景はリセットしない（要望がないため）
                window.saveActiveProfile();
                alert('履歴を消去しました');
                toggleSettings();
            }
        };

        // --- 画像処理 / 背景切り替え ---
        async function compressImage(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (e) => {
                    const img = new Image();
                    img.src = e.target.result;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;
                        const MAX_SIZE = 1280; // 最大長辺
                        if (width > height) {
                            if (width > MAX_SIZE) {
                                height *= MAX_SIZE / width;
                                width = MAX_SIZE;
                            }
                        } else {
                            if (height > MAX_SIZE) {
                                width *= MAX_SIZE / height;
                                height = MAX_SIZE;
                            }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 品質70%のJPG
                    };
                };
            });
        }

        window.updateChatBackground = (base64) => {
            if (base64) {
                document.body.style.backgroundImage = `url(${base64})`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundAttachment = 'fixed';
            } else {
                document.body.style.backgroundImage = 'none';
            }
        };

        window.handleBaseBgSelect = async (input) => {
            if (input.files.length > 0) {
                const compressed = await compressImage(input.files[0]);
                AppState.current.baseBgImage = compressed;
                document.getElementById('base-bg-preview').style.backgroundImage = `url(${compressed})`;
                window.updateChatBackground(compressed);
            }
        };

        window.clearBaseBg = () => {
            AppState.current.baseBgImage = '';
            document.getElementById('base-bg-preview').style.backgroundImage = 'none';
            window.updateChatBackground('');
        };

        window.addPatternUI = (keyword = '', image = '') => {
            const container = document.getElementById('patterns-container');
            const patternId = 'pattern-' + Date.now() + Math.random().toString(36).substr(2, 5);
            const div = document.createElement('div');
            div.id = patternId;
            div.className = 'pattern-item';
            div.style.cssText = 'background: #333; padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #444;';
            div.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                    <input type="text" placeholder="発動キーワード" class="pattern-kw" value="${keyword}" style="flex:1; background:#111; color:#fff; border:1px solid #555; padding:8px; border-radius:4px; font-size:13px;">
                    <button onclick="document.getElementById('img-inv-${patternId}').click()" style="padding: 6px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">画像選択</button>
                    <input type="file" id="img-inv-${patternId}" accept="image/*" style="display:none;" onchange="handlePatternImgSelect(this, '${patternId}')">
                    <button onclick="this.parentElement.parentElement.remove()" style="color:#ff4444; background:none; border:none; cursor:pointer;">✖</button>
                </div>
                <div class="pattern-preview" style="width:100%; height:60px; background-size:contain; background-repeat:no-repeat; background-position:center; background-image: url(${image}); border:1px dashed #555; border-radius:4px;"></div>
                <input type="hidden" class="pattern-data" value="${image}">
            `;
            container.appendChild(div);
        };

        window.handlePatternImgSelect = async (input, parentId) => {
            if (input.files.length > 0) {
                const compressed = await compressImage(input.files[0]);
                const parent = document.getElementById(parentId);
                parent.querySelector('.pattern-preview').style.backgroundImage = `url(${compressed})`;
                parent.querySelector('.pattern-data').value = compressed;
            }
        };

        function checkBackgroundPatterns(text) {
            // 元に戻るキーワード
            if (AppState.current.returnKeyword && text.includes(AppState.current.returnKeyword)) {
                AppState.current.queuedBgImage = AppState.current.baseBgImage;
                return;
            }
            // パターンキーワード (後から追加されたものが優先されるよう逆順でチェック)
            const patterns = AppState.current.bgPatterns || [];
            for (let i = patterns.length - 1; i >= 0; i--) {
                if (patterns[i].keyword && text.includes(patterns[i].keyword)) {
                    AppState.current.queuedBgImage = patterns[i].image;
                    return;
                }
            }
        }

        // ==========================================
        //  ファイル処理 (File Handling)
        // ==========================================

        window.handleFileSelect = () => {
            const input = document.getElementById('file-input');
            if (input.files.length > 0) {
                AppState.selectedFile = input.files[0];
                document.getElementById('file-name').innerText = `添付: ${AppState.selectedFile.name}`;
                document.getElementById('file-preview').style.display = 'block';
            }
        };

        window.clearFile = () => {
            AppState.selectedFile = null;
            document.getElementById('file-input').value = '';
            document.getElementById('file-preview').style.display = 'none';
        };

        // ==========================================
        //  API通信・コアロジック (API & Core Logic)
        // ==========================================

        window.sendMessage = async () => {
            // すでに生成中ならキャンセル処理として働く
            if (AppState.chatAbortController) {
                AppState.chatAbortController.abort();
                return;
            }

            const apiKey = AppState.settings.apiKey;
            const persona = AppState.current.persona;
            const userText = Elements.textarea.value.trim();

            if (!apiKey || (!userText && !AppState.selectedFile)) {
                return;
            }

            // ユーザーのメッセージを表示
            let displayMsg = userText;
            if (AppState.selectedFile) displayMsg = `[📎 ${AppState.selectedFile.name}]\n` + displayMsg;
            addMessage(displayMsg, 'user');

            // ユーザーの入力文字数を加算
            AppState.totalCharCount += userText.length;
            updateCharCount();

            // 入力欄をリセット
            Elements.textarea.value = '';
            Elements.textarea.style.height = 'auto';

            // 送信ボタンを停止ボタン(■)に変更
            const btnSend = document.getElementById('btn-send');
            btnSend.innerHTML = `■`;
            btnSend.classList.add('stop-mode');

            AppState.chatAbortController = new AbortController();

            // 背景パターンのチェック (ユーザー送信時に予約)
            checkBackgroundPatterns(userText);

            // ロード中表示を追加
            const loadingId = 'loading-' + Date.now();
            addLoading(loadingId);

            try {
                const selModel = AppState.current.model;
                const caches = window.getCaches ? window.getCaches() : {};
                const activeCache = caches[`models/${selModel}`];
                const activeCacheName = activeCache ? activeCache.name : null;
                const activeCacheModel = activeCache ? `models/${selModel}` : null;

                let aiText = "";

                // ① キャッシュ存在時 ＆ モデルがキャッシュ作成時と一致している場合は REST API で送信
                if (activeCacheName && activeCacheModel && `models/${selModel}` === activeCacheModel) {
                    let reqParts = [];

                    if (AppState.selectedFile) {
                        if (AppState.selectedFile.type.startsWith('image/') || AppState.selectedFile.type === 'application/pdf') {
                            const base64 = await fileToBase64(AppState.selectedFile);
                            reqParts.push({ inlineData: { data: base64, mimeType: AppState.selectedFile.type } });
                        } else {
                            const textContent = await fileToText(AppState.selectedFile);
                            reqParts.push({ text: `\n\n--- 添付ファイル (${AppState.selectedFile.name}) の内容 ---\n${textContent}` });
                        }
                    }
                    if (userText) {
                        reqParts.push({ text: userText });
                    } else if (AppState.selectedFile) {
                        reqParts.push({ text: `(ファイル添付: ${AppState.selectedFile.name})` });
                    }

                    const formattedHistory = AppState.chatHistory.map(msg => ({
                        role: msg.role === 'ai' || msg.role === 'model' ? 'model' : 'user',
                        parts: msg.parts
                    }));

                    const reqBody = {
                        cachedContent: activeCacheName,
                        contents: [
                            ...formattedHistory,
                            { role: "user", parts: reqParts }
                        ]
                    };

                    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${activeCacheModel}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(reqBody),
                        signal: AppState.chatAbortController.signal
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        if (data.error && data.error.message.includes("not found")) {
                            throw new Error("キャッシュの期限切れか削除済みです。設定から再度作成してください。\n詳細: " + data.error.message);
                        }
                        throw new Error(data.error ? data.error.message : "APIエラー");
                    }
                    aiText = data.candidates[0].content.parts[0].text;
                } else {
                    // ② キャッシュが無い、もしくはモデルが合わない場合は REST API 方式で直接送信
                    if (activeCacheName) {
                        console.warn("モデルが変わったため現在のキャッシュは無視されます");
                    }

                    let nonCacheReqParts = [];
                    if (AppState.selectedFile) {
                        if (AppState.selectedFile.type.startsWith('image/') || AppState.selectedFile.type === 'application/pdf') {
                            const base64 = await fileToBase64(AppState.selectedFile);
                            nonCacheReqParts.push({ inlineData: { data: base64, mimeType: AppState.selectedFile.type } });
                        } else {
                            const textContent = await fileToText(AppState.selectedFile);
                            nonCacheReqParts.push({ text: `\n\n--- 添付ファイル (${AppState.selectedFile.name}) の内容 ---\n${textContent}` });
                        }
                    }

                    if (userText) {
                        nonCacheReqParts.push({ text: userText });
                    } else if (AppState.selectedFile) {
                        nonCacheReqParts.push({ text: `(ファイル添付: ${AppState.selectedFile.name})` });
                    }

                    // REST用に履歴を整形 (roleは user か model)
                    const nonCacheFormattedHistory = AppState.chatHistory.map(msg => ({
                        role: msg.role === 'ai' || msg.role === 'model' ? 'model' : 'user',
                        parts: msg.parts
                    }));

                    const nonCacheReqBody = {
                        contents: [
                            ...nonCacheFormattedHistory,
                            { role: "user", parts: nonCacheReqParts }
                        ]
                    };

                    if (persona) {
                        nonCacheReqBody.systemInstruction = {
                            parts: [{ text: persona }]
                        };
                    }

                    const nonCacheRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selModel}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(nonCacheReqBody),
                        signal: AppState.chatAbortController.signal
                    });

                    const nonCacheData = await nonCacheRes.json();
                    if (!nonCacheRes.ok) throw new Error(nonCacheData.error ? nonCacheData.error.message : "APIエラー");

                    aiText = nonCacheData.candidates[0].content.parts[0].text;
                }

                removeLoading(loadingId);

                // 日時フォーマット生成
                const now = new Date();
                const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日　${now.getHours()}時${now.getMinutes()}分`;

                // 予約されていた背景切り替えを発動 (AIの返答タイミング)
                if (AppState.current.queuedBgImage !== null && AppState.current.queuedBgImage !== undefined) {
                    window.updateChatBackground(AppState.current.queuedBgImage);
                    AppState.current.queuedBgImage = null; // 使い終わったらクリア
                }

                // UI表示用には日付を渡すが、AIの履歴には渡さない
                addMessage(aiText, 'ai', dateStr);

                // 履歴配列を更新 (Geminiのhistory形式に合わせる)
                // ユーザー送信分
                // 画像データなどはlocalStorageに入らないので、簡易的にテキストのみ保存
                // 本来は画像もBase64で保存できるが容量制限があるため、ここではテキスト履歴の維持を優先

                // ユーザーのメッセージ（表示用テキストベース）
                let userHistoryText = userText;
                if (AppState.selectedFile) userHistoryText = `[📎 ${AppState.selectedFile.name}]\n` + userHistoryText;

                AppState.chatHistory.push({
                    role: 'user',
                    parts: [{ text: userHistoryText }]
                });

                // AIの返信履歴（純粋な回答のみ）
                AppState.chatHistory.push({
                    role: 'model',
                    parts: [{ text: aiText }],
                    timestamp: dateStr // 内部保存用として外側に持たせる
                });

                // AIの返信文字数を加算
                AppState.totalCharCount += aiText.length;
                updateCharCount();

                // ファイルの添付状態をクリア
                clearFile();

                // 履歴を保存
                saveHistory();

            } catch (error) {
                removeLoading(loadingId);

                if (error.name === 'AbortError') {
                    addMessage('【キャンセルされました】', 'ai');
                    return;
                }

                // 詳細なエラー表示
                let errorDtl = error.message;
                if (!errorDtl || errorDtl === "Failed to fetch") {
                    errorDtl += ` (Name: ${error.name}, Code: ${error.code})`;
                }
                addMessage('エラーみたいだね：' + errorDtl + '\n\n【デバッグ情報】\n' + (error.stack || String(error)), 'ai');
            } finally {
                // UI状態を元に戻す
                if (AppState.chatAbortController) {
                    AppState.chatAbortController = null;
                    const btnSend = document.getElementById('btn-send');
                    btnSend.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>`;
                    btnSend.classList.remove('stop-mode');
                }
            }
        };



        // ==========================================
        //  UI表示・履歴管理 (UI & History Helpers)
        // ==========================================

        function addMessage(text, sender, dateText = null) {
            const div = document.createElement('div');
            div.className = `msg ${sender}`;

            // 日時要素（もしあれば）
            if (dateText) {
                const dateDiv = document.createElement('div');
                dateDiv.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 5px;';
                dateDiv.innerText = dateText;
                div.appendChild(dateDiv);
            }

            // テキスト部分
            const textSpan = document.createElement('span');
            textSpan.innerText = text;
            div.appendChild(textSpan);

            // AIのメッセージなら読み上げボタンと再生成ボタンを付ける
            if (sender === 'ai') {
                const btnBox = document.createElement('div');
                btnBox.style.cssText = 'float: right; margin-left: 10px; display: flex; gap: 8px; align-items: center;';

                // 再生成ボタン (⋮)
                const regenBtn = document.createElement('button');
                regenBtn.innerHTML = '⋮';
                regenBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 18px; color: #aaa; padding: 0;';
                regenBtn.title = 'この返答を再生成する';
                regenBtn.onclick = () => regenerateLastMessage(div, text);
                btnBox.appendChild(regenBtn);

                // TTS再生成ボタン (🔄)
                const regenTtsBtn = document.createElement('button');
                regenTtsBtn.innerHTML = '🔄<span style="font-size:12px;">🔊</span>';
                regenTtsBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 16px; opacity: 0.7; padding: 0; display:flex; align-items:center;';
                regenTtsBtn.title = '音声を再生成する（キャッシュを破棄して再通信）';
                regenTtsBtn.onclick = () => playTTS(text, ttsBtn, true); // btnElはttsBtnを渡す
                btnBox.appendChild(regenTtsBtn);

                // TTSボタン (🔊)
                const ttsBtn = document.createElement('button');
                ttsBtn.innerHTML = '🔊';
                ttsBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 18px; opacity: 0.7; padding: 0; width: 24px; text-align:center;';
                ttsBtn.title = '音声で読み上げる（課金発生）';
                ttsBtn.onclick = () => playTTS(text, ttsBtn, false);
                btnBox.appendChild(ttsBtn);

                div.appendChild(btnBox);
            } else if (sender === 'user') {
                // ユーザーのメッセージなら「再送信」ボタンを付ける
                const btnBox = document.createElement('div');
                btnBox.style.cssText = 'margin-top: 5px; text-align: right;';

                const resendBtn = document.createElement('button');
                resendBtn.innerHTML = '↺';
                resendBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 16px; color: rgba(255,255,255,0.5); padding: 0;';
                resendBtn.title = 'このメッセージをもう一度送信する（エラー時などに便利です）';
                resendBtn.onclick = () => resendUserMessage(text);
                btnBox.appendChild(resendBtn);

                div.appendChild(btnBox);
            }

            Elements.chatContainer.appendChild(div);
            Elements.chatContainer.scrollTop = Elements.chatContainer.scrollHeight;
        }

        function saveHistory() {
            window.saveActiveProfile();
        }

        function loadHistory() {
            if (AppState.chatHistory && AppState.chatHistory.length > 0) {
                // 画面に復元
                for (const msg of AppState.chatHistory) {
                    // msg = { role: 'user' | 'model', parts: [{ text: '...' }], timestamp: '...' }
                    const text = msg.parts[0].text;
                    const sender = msg.role === 'user' ? 'user' : 'ai';
                    const msgDate = msg.timestamp || null;

                    // addMessageを使うと二重に履歴に追加されてしまうので、直接DOM操作するかフラグで制御
                    const div = document.createElement('div');
                    div.className = `msg ${sender}`;

                    if (msgDate) {
                        const dateDiv = document.createElement('div');
                        dateDiv.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 5px;';
                        dateDiv.innerText = msgDate;
                        div.appendChild(dateDiv);
                    }

                    const textSpan = document.createElement('span');
                    textSpan.innerText = text;
                    div.appendChild(textSpan);

                    if (sender === 'ai') {
                        const btnBox = document.createElement('div');
                        btnBox.style.cssText = 'float: right; margin-left: 10px; display: flex; gap: 8px; align-items: center;';

                        const regenBtn = document.createElement('button');
                        regenBtn.innerHTML = '⋮';
                        regenBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 18px; color: #aaa; padding: 0;';
                        regenBtn.title = 'この返答を再生成する';
                        regenBtn.onclick = () => regenerateLastMessage(div, text);
                        btnBox.appendChild(regenBtn);

                        // TTS再生成ボタン (🔄🔊)
                        const regenTtsBtn = document.createElement('button');
                        regenTtsBtn.innerHTML = '🔄<span style="font-size:12px;">🔊</span>';
                        regenTtsBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 16px; opacity: 0.7; padding: 0; display:flex; align-items:center;';
                        regenTtsBtn.title = '音声を再生成する（キャッシュを破棄して再通信）';
                        regenTtsBtn.onclick = () => playTTS(text, ttsBtn, true); // btnElはttsBtnを渡す
                        btnBox.appendChild(regenTtsBtn);

                        const ttsBtn = document.createElement('button');
                        ttsBtn.innerHTML = '🔊';
                        ttsBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 18px; opacity: 0.7; padding: 0; width: 24px; text-align:center;';
                        ttsBtn.title = '音声で読み上げる（課金発生）';
                        ttsBtn.onclick = () => playTTS(text, ttsBtn, false);
                        btnBox.appendChild(ttsBtn);

                        div.appendChild(btnBox);
                    } else if (sender === 'user') {
                        const btnBox = document.createElement('div');
                        btnBox.style.cssText = 'margin-top: 5px; text-align: right;';

                        const resendBtn = document.createElement('button');
                        resendBtn.innerHTML = '↺';
                        resendBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 16px; color: rgba(255,255,255,0.5); padding: 0;';
                        resendBtn.title = 'このメッセージをもう一度送信する';
                        resendBtn.onclick = () => resendUserMessage(text);
                        btnBox.appendChild(resendBtn);

                        div.appendChild(btnBox);
                    }

                    Elements.chatContainer.appendChild(div);
                }
                Elements.chatContainer.scrollTop = Elements.chatContainer.scrollHeight;
            }
        }

        function addLoading(id) {
            const div = document.createElement('div');
            div.className = 'ai loading-container msg';
            div.id = id;
            div.style.padding = '8px 16px';
            div.innerHTML = `<div class="spinner"></div><span>応答中...</span>`;
            Elements.chatContainer.appendChild(div);
            Elements.chatContainer.scrollTop = Elements.chatContainer.scrollHeight;
        }

        function removeLoading(id) {
            const el = document.getElementById(id);
            if (el) el.remove();
        }

        // 文字数表示を更新
        function updateCharCount() {
            document.getElementById('char-count').innerText = `${AppState.totalCharCount} 文字`;
            localStorage.setItem('gemini_char_count', AppState.totalCharCount.toString());
        }

        // ファイル読み込み用の補助関数
        function fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
            });
        }

        function fileToText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsText(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });
        }

        // ==========================================
        // キャッシュ関連の処理
        // ==========================================
        let cacheFilesArray = [];

        window.handleCacheFileSelect = () => {
            const input = document.getElementById('cache-file-input');
            for (let i = 0; i < input.files.length; i++) {
                // 重複チェック（名前とサイズが同じなら弾く）
                const exists = cacheFilesArray.some(f => f.name === input.files[i].name && f.size === input.files[i].size);
                if (!exists) {
                    cacheFilesArray.push(input.files[i]);
                }
            }
            input.value = ""; // 入力をリセット（同じファイルを再度選べるように）
            window.updateCacheFileList();
        };

        window.updateCacheFileList = () => {
            const listEl = document.getElementById('cache-file-list');
            listEl.innerHTML = "";
            cacheFilesArray.forEach((f, index) => {
                const div = document.createElement('div');
                div.style.marginBottom = "5px";
                div.innerText = `📎 ${f.name} `;
                const del = document.createElement('span');
                del.innerText = "✖";
                del.style.cursor = "pointer";
                del.style.color = "#ff4444";
                del.style.marginLeft = "10px";
                del.onclick = () => {
                    cacheFilesArray.splice(index, 1);
                    window.updateCacheFileList();
                };
                div.appendChild(del);
                listEl.appendChild(div);
            });
        };
        window.getCaches = () => {
            // マイグレーション（古い単一キャッシュの形式を使っていた場合、辞書型に変換する）
            let caches = JSON.parse(localStorage.getItem('gemini_caches') || "{}");
            const oldName = localStorage.getItem('gemini_cached_content_name');
            const oldModel = localStorage.getItem('gemini_cached_model');
            if (oldName && oldModel && !caches[oldModel]) {
                caches[oldModel] = {
                    name: oldName,
                    expireTime: localStorage.getItem('gemini_cached_expire'),
                    meta: JSON.parse(localStorage.getItem('gemini_cached_meta') || "{}")
                };
                localStorage.setItem('gemini_caches', JSON.stringify(caches));
                // Delete old keys to prevent re-migration
                localStorage.removeItem('gemini_cached_content_name');
                localStorage.removeItem('gemini_cached_model');
                localStorage.removeItem('gemini_cached_expire');
                localStorage.removeItem('gemini_cached_meta');
            }
            return caches;
        };

        window.updateCacheUI = () => {
            const currentModel = document.getElementById('model-select').value;
            const caches = window.getCaches();
            const activeCache = caches[`models/${currentModel}`];

            const cacheStatusEl = document.getElementById('cache-status-text');
            const btnDel = document.getElementById('btn-delete-cache');
            if (cacheStatusEl) {
                if (activeCache && activeCache.name) {
                    const date = new Date(activeCache.expireTime);
                    let metaText = "";
                    try {
                        const meta = activeCache.meta;
                        if (meta) {
                            let items = [];
                            if (meta.files && meta.files.length > 0) items.push(`添付: ${meta.files.join(', ')}`);
                            if (meta.hasText) items.push(`追加テキストあり`);
                            if (items.length > 0) metaText = `<br><span style="color:#ddd; font-weight:normal; font-size:12px;">【内容】${items.join(' / ')}</span>`;
                        }
                    } catch (e) { }

                    cacheStatusEl.innerHTML = `現在のキャッシュ: 有効 (期限: ${date.toLocaleString()})${metaText}`;
                    cacheStatusEl.style.color = "#aaffaa";
                    btnDel.style.display = "block";
                } else {
                    cacheStatusEl.innerHTML = `現在のキャッシュ: なし`;
                    cacheStatusEl.style.color = "#ffaa00";
                    btnDel.style.display = "none";
                }
            }
            if (window.checkCacheWarning) window.checkCacheWarning();
        };

        window.checkCacheWarning = () => {
            // 現在のモデルにキャッシュが存在しない場合、かつ全体として何らかの別モデルのキャッシュが存在する場合は警告を出す
            const currentModel = document.getElementById('model-select').value;
            const caches = window.getCaches();
            const hasAnyCache = Object.keys(caches).length > 0;
            const hasCurrentCache = caches[`models/${currentModel}`] !== undefined;

            const warningSettings = document.getElementById('cache-warning-settings');
            const warningChat = document.getElementById('cache-warning-chat');

            if (hasAnyCache && !hasCurrentCache) {
                if (warningSettings) warningSettings.style.display = 'block';
                if (warningChat) warningChat.style.display = 'block';
            } else {
                if (warningSettings) warningSettings.style.display = 'none';
                if (warningChat) warningChat.style.display = 'none';
            }
        };

        window.deleteCache = async () => {
            const currentModel = document.getElementById('model-select').value;
            const caches = window.getCaches();
            const activeCache = caches[`models/${currentModel}`];
            const apiKey = document.getElementById('api-key').value || localStorage.getItem('gemini_api_key');

            if (!activeCache || !activeCache.name || !apiKey) {
                if (caches[`models/${currentModel}`]) {
                    delete caches[`models/${currentModel}`];
                    localStorage.setItem('gemini_caches', JSON.stringify(caches));
                }
                window.updateCacheUI();
                return;
            }
            if (!confirm(`現在選択中のモデル（${currentModel}）のキャッシュを完全に削除（無効化）しますか？\n※他のモデルのキャッシュは消えません。`)) return;

            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${activeCache.name}?key=${apiKey}`, { method: 'DELETE' });
                if (!res.ok) {
                    const data = await res.json();
                    if (data.error && data.error.code !== 404) {
                        throw new Error(data.error.message || "キャッシュ削除APIエラー");
                    }
                }
            } catch (e) { console.error(e); }

            delete caches[`models/${currentModel}`];
            localStorage.setItem('gemini_caches', JSON.stringify(caches));
            alert("現在のモデルのキャッシュを削除しました。");
            window.updateCacheUI();

            // サーバー同期リストが開いていたら再描画する
            if (document.getElementById('server-cache-list').style.display === 'block') {
                window.syncServerCaches();
            }
        };

        // サーバー上のキャッシュを直接確認する機能
        window.syncServerCaches = async () => {
            const apiKey = document.getElementById('api-key').value || localStorage.getItem('gemini_api_key');
            if (!apiKey) return alert("APIキーを設定してください。");

            const listContainer = document.getElementById('server-cache-list');
            const syncBtn = document.getElementById('btn-sync-cache');

            syncBtn.innerText = "🔄 取得中...";
            syncBtn.disabled = true;
            listContainer.style.display = 'block';
            listContainer.innerHTML = '<div style="color: #ccc; font-size: 13px; text-align: center;">サーバーに問い合わせ中...</div>';

            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`, {
                    method: 'GET'
                });
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error ? data.error.message : "キャッシュ一覧の取得に失敗しました");
                }

                if (!data.cachedContents || data.cachedContents.length === 0) {
                    listContainer.innerHTML = '<div style="color: #88ff88; font-size: 13px; text-align: center; padding: 10px; background: #113311; border-radius: 4px;">✅ サーバー上に生きているキャッシュはありません。（課金は発生しません）</div>';
                } else {
                    let html = '<div style="font-size: 12px; color: #ffaa00; margin-bottom: 5px;">⚠️ 以下のキャッシュがサーバー上に存在し、課金対象になっています。不要なものは削除してください。</div>';

                    data.cachedContents.forEach(c => {
                        const createdStr = new Date(c.createTime).toLocaleString();
                        const expireStr = new Date(c.expireTime).toLocaleString();
                        const tokens = c.usageMetadata ? c.usageMetadata.totalTokenCount.toLocaleString() : '不明';
                        // モデル名を取り出す (例: models/gemini-1.5-pro-002)
                        const rawModel = c.model ? c.model.replace('models/', '') : '不明なモデル';

                        html += `
                            <div style="background: #222; border: 1px solid #555; border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                                <div style="font-size: 11px; color: #888; font-family: monospace;">ID: ${c.name}</div>
                                <div style="font-size: 13px; color: #fff; margin: 3px 0;">
                                    <b>モデル:</b> <span style="color:#aaffaa">${rawModel}</span><br>
                                    <b>トークン数:</b> <span style="color:#ffccaa">${tokens}</span> トークン
                                </div>
                                <div style="font-size: 11px; color: #aaa;">作成: ${createdStr}<br>削除予定: <span style="color:#ff8888">${expireStr}</span></div>
                                <button onclick="deleteSpecificCache('${c.name}')" style="margin-top: 6px; width: 100%; padding: 5px; background: #8a2b2b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑 このキャッシュを直接削除する</button>
                            </div>
                        `;
                    });
                    listContainer.innerHTML = html;
                }

            } catch (e) {
                console.error(e);
                listContainer.innerHTML = `<div style="color: #ff4444; font-size: 13px; text-align: center; padding: 10px;">取得エラー: ${e.message}</div>`;
            } finally {
                syncBtn.innerText = "🔄 サーバーのキャッシュを確認";
                syncBtn.disabled = false;
            }
        };

        window.deleteSpecificCache = async (cacheName) => {
            if (!confirm("本当にこのキャッシュをGoogleサーバーから直接削除しますか？\n（現在使用中の場合はエラーになる可能性があります）")) return;

            const apiKey = document.getElementById('api-key').value || localStorage.getItem('gemini_api_key');
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${cacheName}?key=${apiKey}`, {
                    method: 'DELETE'
                });

                if (!res.ok) {
                    const data = await res.json();
                    if (data.error && data.error.code !== 404) {
                        throw new Error(data.error.message || "削除APIエラー");
                    }
                }

                alert("指定されたキャッシュを完全に削除しました！");

                // ローカルのUIと記憶も同期（同じ名前のものがあれば消す）
                const caches = window.getCaches();
                let localDeleted = false;
                for (let model in caches) {
                    if (caches[model].name === cacheName) {
                        delete caches[model];
                        localDeleted = true;
                    }
                }
                if (localDeleted) {
                    localStorage.setItem('gemini_caches', JSON.stringify(caches));
                    window.updateCacheUI();
                }

                // リストを再更新
                window.syncServerCaches();

            } catch (e) {
                console.error(e);
                alert("削除中にエラーが発生しました: " + e.message);
            }
        };

        window.createCache = async () => {
            const apiKey = document.getElementById('api-key').value;
            const persona = document.getElementById('persona-setting').value;
            const cacheText = document.getElementById('cache-text').value;
            const files = cacheFilesArray;
            const ttl = document.getElementById('cache-ttl').value;
            const selModel = document.getElementById('model-select').value;
            const loadingEl = document.getElementById('cache-loading');
            const btnEl = document.getElementById('btn-create-cache');

            if (!apiKey) return alert("まずはAPIキーを入力してください");
            if (!cacheText && files.length === 0) return alert("キャッシュに含めるファイルかテキストを最低1つ指定してください");

            loadingEl.style.display = 'block';
            btnEl.disabled = true;

            try {
                let parts = [];
                if (cacheText) parts.push({ text: cacheText });

                // ファイルを直接Geminiのストレージにアップロード
                for (let i = 0; i < files.length; i++) {
                    const f = files[i];
                    loadingEl.innerText = `アップロード中... ${f.name} (${i + 1}/${files.length})`;

                    // 1. セッション開始
                    const upRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
                        method: 'POST',
                        headers: {
                            'X-Goog-Upload-Protocol': 'resumable',
                            'X-Goog-Upload-Command': 'start',
                            'X-Goog-Upload-Header-Content-Length': f.size.toString(),
                            'X-Goog-Upload-Header-Content-Type': f.type,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ file: { display_name: f.name } })
                    });
                    if (!upRes.ok) throw new Error("アップロード開始に失敗しました");
                    const uploadUrl = upRes.headers.get('x-goog-upload-url');

                    // 2. 実データの送信
                    const upRes2 = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Length': f.size.toString(),
                            'X-Goog-Upload-Offset': '0',
                            'X-Goog-Upload-Command': 'upload, finalize'
                        },
                        body: f
                    });
                    if (!upRes2.ok) throw new Error(`${f.name} のデータ送信に失敗しました`);
                    const fileInfo = await upRes2.json();

                    parts.push({
                        fileData: { fileUri: fileInfo.file.uri, mimeType: f.type }
                    });
                }

                loadingEl.innerText = `クラウド上でキャッシュ作成中...`;

                const modelName = `models/${selModel}`;
                const cacheReqBody = {
                    model: modelName,
                    contents: [{ role: "user", parts: parts }]
                };
                // 無期限（TTLを指定しない）以外のときはttlを設定
                if (ttl !== "unlimited") {
                    cacheReqBody.ttl = ttl;
                }

                // ※ ペルソナもキャッシュに巻き込む！通信量が減る
                if (persona) {
                    cacheReqBody.systemInstruction = { parts: [{ text: persona }] };
                }

                const cacheRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cacheReqBody)
                });
                const cacheData = await cacheRes.json();
                if (!cacheRes.ok || cacheData.error) throw new Error(cacheData.error ? cacheData.error.message : "キャッシュ作成APIエラー");

                const caches = window.getCaches();
                const metaInfo = {
                    files: cacheFilesArray.map(f => f.name),
                    hasText: !!cacheText
                };

                caches[modelName] = {
                    name: cacheData.name,
                    expireTime: cacheData.expireTime,
                    meta: metaInfo
                };
                localStorage.setItem('gemini_caches', JSON.stringify(caches));

                alert(`キャッシュの作成に大成功しました！\n有効期限: ${new Date(cacheData.expireTime).toLocaleString()}\n\n※このキャッシュには大量の背景設定が含まれています。\n※このモデル専用のキャッシュとして記憶されました！他のモデルと切り替えて使うことができます。\n※重複を防ぐため、「会話履歴を画面から消去（リセット）」してから新しくチャットを再開してください。(以降は勝手にキャッシュが乗ってくれます)`);
                window.updateCacheUI();
                cacheFilesArray = [];
                window.updateCacheFileList();
                document.getElementById('cache-text').value = "";

            } catch (e) {
                console.error(e);
                alert("エラーが発生しました。\n・トークン数(文字換算で約10万文字)が32,768以上に満たない場合、エラーになります。Flashなどのモデルはもっと少なくてもOKな場合があります。\n\n詳細: " + e.message);
            } finally {
                loadingEl.style.display = 'none';
                loadingEl.innerText = `処理中... (ファイルが大きいと数分かかります)`;
                btnEl.disabled = false;
            }
        };

        // ロードの最後にUIを再描画
        window.updateCacheUI();

        // ==========================================
        // TTS (音声読み上げ) 関連の処理 (IndexedDB キャッシュ付き)
        // ==========================================

        // --- IndexedDB Helper ---
        const DB_NAME = "GeminiTTSDatabase";
        const DB_VERSION = 1;
        const STORE_NAME = "audioCacheStore";

        function openAudioDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function getCachedAudio(key) {
            try {
                const db = await openAudioDB();
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(STORE_NAME, "readonly");
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.get(key);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            } catch (e) {
                console.warn("IndexedDB Load Error:", e);
                return null;
            }
        }

        async function saveCachedAudio(key, float32Array, sampleRate) {
            try {
                const db = await openAudioDB();
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(STORE_NAME, "readwrite");
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.put({ data: float32Array, sampleRate: sampleRate, timestamp: Date.now() }, key);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            } catch (e) {
                console.warn("IndexedDB Save Error:", e);
            }
        }

        window.clearAudioCache = async () => {
            if (!confirm("保存されている音声キャッシュをすべて削除しますか？\n（再度再生する際に通信料が発生するようになります）")) return;
            try {
                const db = await openAudioDB();
                const transaction = db.transaction(STORE_NAME, "readwrite");
                const store = transaction.objectStore(STORE_NAME);
                store.clear();
                alert("音声キャッシュをすべて削除しました！");
            } catch (e) {
                alert("キャッシュの削除に失敗しました: " + e.message);
            }
        };

        let audioCtx = null;
        let currentSource = null;

        window.playTTS = async (text, btnEl, forceRegenerate = false) => {
            // もし「■」ボタン状態ならキャンセル処理として働く
            if (btnEl.innerHTML === '■' && AppState.ttsAbortController) {
                AppState.ttsAbortController.abort();
                AppState.ttsAbortController = null;
                btnEl.innerHTML = '🔊';
                btnEl.classList.remove('stop-mode');
                return;
            }

            const apiKey = localStorage.getItem('gemini_api_key');
            if (!apiKey) return alert("APIキーが設定されていません。");

            // 再生中なら止める
            if (currentSource) {
                try { currentSource.stop(); } catch (e) { }
                currentSource = null;
                // もし同じボタンを押したなら停止して終了
                if (btnEl.innerHTML === '⏹️') {
                    btnEl.innerHTML = '🔊';
                    return;
                }
            }

            const voiceName = AppState.current.ttsVoice || 'Puck';
            const ttsStyle = AppState.current.ttsStyle || 'Read aloud in a warm and friendly tone: ';

            // --- キャッシュキーの生成 ---
            // テキストから日付部分（先頭の '2026年x月y日 hh時mm分\n\n'）を除外する簡易処理
            let cleanText = text;
            const match = text.match(/^\d{4}年\d{1,2}月\d{1,2}日　\d{1,2}時\d{1,2}分\n\n/);
            if (match) {
                cleanText = text.substring(match[0].length);
            }
            // 不要な記号やMarkdownを除去
            cleanText = cleanText.replace(/[\*#_]/g, '');

            // テキストとボイス名とスタイル指示を混ぜて一意のキーにする
            const cacheKey = `tts_${btoa(encodeURIComponent(voiceName + "|" + ttsStyle + "|" + cleanText.substring(0, 500)))}`;

            // ボタンをローディング中（兼停止ボタン）に
            if (AppState.ttsAbortController) AppState.ttsAbortController.abort();
            AppState.ttsAbortController = new AbortController();

            const originalText = '🔊';
            btnEl.innerHTML = '■';
            btnEl.classList.add('stop-mode');
            btnEl.disabled = false; // クリックしてキャンセルできるように有効化

            try {
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }

                // forceRegenerate が true なら、キャッシュを一旦削除する
                if (forceRegenerate) {
                    try {
                        const db = await openAudioDB();
                        const transaction = db.transaction(STORE_NAME, "readwrite");
                        const store = transaction.objectStore(STORE_NAME);
                        store.delete(cacheKey);
                    } catch (e) {
                        console.warn("IndexedDB Delete Error:", e);
                    }
                }

                // 1. IndexedDBからキャッシュを探す
                const cached = forceRegenerate ? null : await getCachedAudio(cacheKey);

                if (cached && cached.data) {
                    try {
                        // キャッシュがあった場合はAPIを叩かずに即再生
                        const binaryStr = atob(cached.data);
                        const numSamples = binaryStr.length / 2;
                        const float32Array = new Float32Array(numSamples);

                        for (let i = 0; i < numSamples; i++) {
                            const low = binaryStr.charCodeAt(i * 2);
                            const high = binaryStr.charCodeAt(i * 2 + 1);
                            let int16 = low | (high << 8);
                            if (int16 >= 0x8000) int16 -= 0x10000;
                            float32Array[i] = int16 / 32768.0;
                        }

                        const buffer = audioCtx.createBuffer(1, numSamples, cached.sampleRate);
                        buffer.getChannelData(0).set(float32Array);

                        currentSource = audioCtx.createBufferSource();
                        currentSource.buffer = buffer;
                        currentSource.connect(audioCtx.destination);

                        btnEl.innerHTML = '⏹️';
                        btnEl.classList.remove('stop-mode');
                        btnEl.disabled = false;

                        currentSource.onended = () => {
                            btnEl.innerHTML = '🔊';
                            currentSource = null;
                        };

                        currentSource.start();
                        return; // ここで終了（API通信はしない）
                    } catch (decodeError) {
                        console.warn("キャッシュのデコードに失敗しました。再生成します:", decodeError);
                        // 壊れたキャッシュを削除して、API通信にフォールバックする
                        try {
                            const db = await openAudioDB();
                            const transaction = db.transaction(STORE_NAME, "readwrite");
                            transaction.objectStore(STORE_NAME).delete(cacheKey);
                        } catch (e) { }
                    }
                }

                // キャッシュがなかった場合はAPI通信を行う
                const reqBody = {
                    contents: [{
                        role: "user",
                        parts: [{ text: `${ttsStyle}\n\n${cleanText}` }]
                    }],
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: voiceName
                                }
                            }
                        }
                    }
                };

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reqBody),
                    signal: AppState.ttsAbortController.signal
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error ? data.error.message : "TTS APIエラー");

                const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
                if (inlineData && inlineData.data) {
                    if (!audioCtx) {
                        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    }

                    if (inlineData.mimeType && (inlineData.mimeType.startsWith('audio/pcm') || inlineData.mimeType.startsWith('audio/L16'))) {
                        let sampleRate = 24000; // Gemini TTS 規定
                        const rateMatch = inlineData.mimeType.match(/rate=(\d+)/);
                        if (rateMatch) sampleRate = parseInt(rateMatch[1], 10);

                        // Base64をデコードして16bit PCMとしてFloat32に変換
                        const binaryStr = atob(inlineData.data);
                        const numSamples = binaryStr.length / 2;
                        const float32Array = new Float32Array(numSamples);

                        for (let i = 0; i < numSamples; i++) {
                            const low = binaryStr.charCodeAt(i * 2);
                            const high = binaryStr.charCodeAt(i * 2 + 1);
                            let int16 = low | (high << 8);
                            if (int16 >= 0x8000) int16 -= 0x10000;
                            float32Array[i] = int16 / 32768.0;
                        }

                        // --- キャッシュに保存 (IndexedDB) ---
                        // 非同期で裏でこっそり保存しておく (スマホ互換のため生Base64のまま保存)
                        saveCachedAudio(cacheKey, inlineData.data, sampleRate);

                        const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
                        buffer.getChannelData(0).set(float32Array);

                        currentSource = audioCtx.createBufferSource();
                        currentSource.buffer = buffer;
                        currentSource.connect(audioCtx.destination);
                    } else {
                        throw new Error(`サポートされていない音声形式です: ${inlineData.mimeType}`);
                    }

                    // 再生中は停止ボタンにする
                    btnEl.innerHTML = '⏹️';
                    btnEl.disabled = false;

                    currentSource.onended = () => {
                        btnEl.innerHTML = '🔊';
                        currentSource = null;
                    };

                    currentSource.start();
                } else {
                    throw new Error("音声データが返されませんでした。");
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return; // キャンセルされたら単に無視
                }
                console.error(error);
                alert("音声読み上げエラー: " + error.message);
                btnEl.innerHTML = originalText;
                btnEl.classList.remove('stop-mode');
                btnEl.disabled = false;
            } finally {
                if (AppState.ttsAbortController && btnEl.innerHTML === '■') {
                    AppState.ttsAbortController = null;
                    btnEl.innerHTML = originalText;
                    btnEl.classList.remove('stop-mode');
                }
            }
        };

        // ==========================================
        // 再生成関連の処理
        // ==========================================
        window.regenerateLastMessage = async (msgDiv, aiText) => {
            // 現在の履歴が最低2つ（ユーザー、AI）あるか確認
            if (AppState.chatHistory.length < 2) {
                alert("再生成できる会話履歴がありません。");
                return;
            }

            // クリックしたのが「一番最後のAIメッセージ」かチェック
            const lastAiMsg = AppState.chatHistory[AppState.chatHistory.length - 1];
            if (lastAiMsg.role !== 'model' || !lastAiMsg.parts[0].text.includes(aiText)) {
                alert("再生成できるのは、一番最後のAIの返信だけです。");
                return;
            }

            if (!confirm("直前のAIの返答を取り消して、もう一度生成し直しますか？\n（※通信料が新たに発生します）")) return;

            // 1. 直近のAIメッセージを履歴と画面から削除
            const poppedAi = AppState.chatHistory.pop();
            AppState.totalCharCount -= (poppedAi.parts[0].text.length || 0);
            msgDiv.remove();

            // 2. その前にあるユーザーのメッセージを取得し、履歴と画面から削除
            const poppedUser = AppState.chatHistory.pop();
            // 本来ならユーザーの画面上の文字も消すべきだが、sendMessageの中身を使いまわすため、
            // 「一番最後のuserのDOM」を探して消す
            const allMsgs = document.querySelectorAll('.msg');
            let lastUserDom = null;
            for (let i = allMsgs.length - 1; i >= 0; i--) {
                if (allMsgs[i].classList.contains('user')) {
                    lastUserDom = allMsgs[i];
                    break;
                }
            }
            if (lastUserDom) lastUserDom.remove();

            AppState.totalCharCount -= (poppedUser.parts[0].text.length || 0);
            updateCharCount();

            // 3. ユーザーのテキストをtextareaに戻して、再度sendMessageを発火させる
            Elements.textarea.value = poppedUser.parts[0].text;
            Elements.textarea.style.height = 'auto'; // 再展開
            Elements.textarea.style.height = (Elements.textarea.scrollHeight) + 'px';

            saveHistory(); // ここで一旦保存

            // 少し待ってから送信（UI描画のため）
            setTimeout(() => {
                sendMessage();
            }, 100);
        };

        // ==========================================
        // ユーザーのプロンプトを再送信する処理
        // ==========================================
        window.resendUserMessage = (text) => {
            // 現在入力欄にあるテキストはいったん退避させたほうが親切かもしれないが、
            // そのまま上書きして送信するシンプルな挙動にする
            Elements.textarea.value = text;
            Elements.textarea.style.height = 'auto';
            Elements.textarea.style.height = (Elements.textarea.scrollHeight) + 'px';
            sendMessage();
        };

        // --- 初期実行 (Initialization Execution) ---
        // モジュール内の全ての window.関数 名が定義された後に実行する必要があります
        AppInit.initPIN();
        AppInit.loadSettings();

        if (window.updateCacheUI) window.updateCacheUI();
        loadHistory();
        updateCharCount();
    </script>
</body>

</html>
