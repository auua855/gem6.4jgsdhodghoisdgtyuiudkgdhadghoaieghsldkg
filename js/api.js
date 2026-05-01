import { AppState, Elements, saveActiveProfile } from './state.js';

// ファイル操作用
export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

export function fileToText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

window.getCaches = () => {
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
        localStorage.removeItem('gemini_cached_content_name');
        localStorage.removeItem('gemini_cached_model');
        localStorage.removeItem('gemini_cached_expire');
        localStorage.removeItem('gemini_cached_meta');
    }
    return caches;
};

window.sendMessage = async () => {
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

    let displayMsg = userText;
    if (AppState.selectedFile) displayMsg = `[📎 ${AppState.selectedFile.name}]\n` + displayMsg;
    if (window.addMessage) window.addMessage(displayMsg, 'user');

    AppState.totalCharCount += userText.length;
    if (window.updateCharCount) window.updateCharCount();

    Elements.textarea.value = '';
    Elements.textarea.style.height = 'auto';

    const btnSend = document.getElementById('btn-send');
    if (btnSend) {
        btnSend.innerHTML = `■`;
        btnSend.classList.add('stop-mode');
    }

    AppState.chatAbortController = new AbortController();
    if (window.checkBackgroundPatterns) window.checkBackgroundPatterns(userText);

    const loadingId = 'loading-' + Date.now();
    if (window.addLoading) window.addLoading(loadingId);

    try {
        const selModel = AppState.current.model;
        const caches = window.getCaches();
        const activeCache = caches[`models/${selModel}`];
        const activeCacheName = activeCache ? activeCache.name : null;
        const activeCacheModel = activeCache ? `models/${selModel}` : null;

        let aiText = "";

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

            const safetyArr = [];
            safetyArr.push({ category: "HARM_CATEGORY_HARASSMENT", threshold: AppState.current.safetyHarassment || 'BLOCK_NONE' });
            safetyArr.push({ category: "HARM_CATEGORY_HATE_SPEECH", threshold: AppState.current.safetyHate || 'BLOCK_NONE' });
            safetyArr.push({ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: AppState.current.safetySexuallyExplicit || 'BLOCK_NONE' });
            safetyArr.push({ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: AppState.current.safetyDangerousContent || 'BLOCK_NONE' });
            
            if (safetyArr.length > 0) {
                reqBody.safetySettings = safetyArr;
            }

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

            const nonCacheSafetyArr = [];
            nonCacheSafetyArr.push({ category: "HARM_CATEGORY_HARASSMENT", threshold: AppState.current.safetyHarassment || 'BLOCK_NONE' });
            nonCacheSafetyArr.push({ category: "HARM_CATEGORY_HATE_SPEECH", threshold: AppState.current.safetyHate || 'BLOCK_NONE' });
            nonCacheSafetyArr.push({ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: AppState.current.safetySexuallyExplicit || 'BLOCK_NONE' });
            nonCacheSafetyArr.push({ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: AppState.current.safetyDangerousContent || 'BLOCK_NONE' });
            
            if (nonCacheSafetyArr.length > 0) {
                nonCacheReqBody.safetySettings = nonCacheSafetyArr;
            }

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

        if (window.removeLoading) window.removeLoading(loadingId);

        const now = new Date();
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日　${now.getHours()}時${now.getMinutes()}分`;

        if (AppState.current.queuedBgImage !== null && AppState.current.queuedBgImage !== undefined) {
            if (window.updateChatBackground) window.updateChatBackground(AppState.current.queuedBgImage);
            AppState.current.queuedBgImage = null; 
        }

        if (window.addMessage) window.addMessage(aiText, 'ai', dateStr);

        let userHistoryText = userText;
        if (AppState.selectedFile) userHistoryText = `[📎 ${AppState.selectedFile.name}]\n` + userHistoryText;

        AppState.chatHistory.push({
            role: 'user',
            parts: [{ text: userHistoryText }]
        });

        AppState.chatHistory.push({
            role: 'model',
            parts: [{ text: aiText }],
            timestamp: dateStr 
        });

        AppState.totalCharCount += aiText.length;
        if (window.updateCharCount) window.updateCharCount();

        if (window.clearFile) window.clearFile();

        saveActiveProfile();

    } catch (error) {
        if (window.removeLoading) window.removeLoading(loadingId);

        if (error.name === 'AbortError') {
            if (window.addMessage) window.addMessage('【キャンセルされました】', 'ai');
            return;
        }

        let errorDtl = error.message;
        if (!errorDtl || errorDtl === "Failed to fetch") {
            errorDtl += ` (Name: ${error.name}, Code: ${error.code})`;
        }
        if (window.addMessage) window.addMessage('エラーみたいだね：' + errorDtl + '\n\n【デバッグ情報】\n' + (error.stack || String(error)), 'ai');
    } finally {
        if (AppState.chatAbortController) {
            AppState.chatAbortController = null;
            const btnSend = document.getElementById('btn-send');
            if (btnSend) {
                btnSend.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>`;
                btnSend.classList.remove('stop-mode');
            }
        }
    }
};

window.updateCacheUI = () => {
    const currentModelEl = document.getElementById('model-select');
    if (!currentModelEl) return;
    const currentModel = currentModelEl.value;
    const caches = window.getCaches();
    const activeCache = caches[`models/${currentModel}`];

    const cacheStatusEl = document.getElementById('cache-status-text');
    const btnDel = document.getElementById('btn-delete-cache');
    if (cacheStatusEl && btnDel) {
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
    const currentModelEl = document.getElementById('model-select');
    if (!currentModelEl) return;
    const currentModel = currentModelEl.value;
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

    const cacheListEl = document.getElementById('server-cache-list');
    if (cacheListEl && cacheListEl.style.display === 'block') {
        window.syncServerCaches();
    }
};

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
    const files = AppState.current.pendingCacheFiles || [];
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

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            loadingEl.innerText = `アップロード中... ${f.name} (${i + 1}/${files.length})`;

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
        if (ttl !== "unlimited") {
            cacheReqBody.ttl = ttl;
        }

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
            files: files.map(f => f.name),
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
        
        AppState.current.pendingCacheFiles = [];
        if (window.updateCacheFileListUI) window.updateCacheFileListUI();
        document.getElementById('cache-text').value = "";
        document.getElementById('cache-text').dispatchEvent(new Event('input'))

    } catch (e) {
        console.error(e);
        alert("エラーが発生しました。\n・トークン数(文字換算で約10万文字)が32,768以上に満たない場合、エラーになります。Flashなどのモデルはもっと少なくてもOKな場合があります。\n\n詳細: " + e.message);
    } finally {
        loadingEl.style.display = 'none';
        loadingEl.innerText = `処理中... (ファイルが大きいと数分かかります)`;
        btnEl.disabled = false;
    }
};

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

window.checkAudioCacheStatus = async (chunkText) => {
    let cleanText = chunkText;
    const match = chunkText.match(/^\d{4}年\d{1,2}月\d{1,2}日　\d{1,2}時\d{1,2}分\n\n/);
    if (match) cleanText = chunkText.substring(match[0].length);
    cleanText = cleanText.replace(/[\*#_]/g, '');

    const voiceName = AppState.current.ttsVoice || 'Puck';
    const ttsModel = AppState.current.ttsModel || 'gemini-2.5-pro-preview-tts';
    const ttsStyle = AppState.current.ttsStyle || 'Read aloud in a warm and friendly tone: ';

    const cacheKey = `tts_${btoa(encodeURIComponent(ttsModel + "|" + voiceName + "|" + ttsStyle + "|" + cleanText.substring(0, 500)))}`;
    const cached = await getCachedAudio(cacheKey);
    return !!(cached && cached.data);
};

async function saveCachedAudio(key, base64Data, sampleRate, mimeType = null) {
    try {
        const db = await openAudioDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ data: base64Data, sampleRate: sampleRate, mimeType: mimeType, timestamp: Date.now() }, key);
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

// ==========================================
// Replay Database (IndexedDB)
// ==========================================
const REPLAY_DB_NAME = "GeminiReplayDatabase";
const REPLAY_DB_VERSION = 1;
const REPLAY_STORE_NAME = "replayStore";

function openReplayDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(REPLAY_DB_NAME, REPLAY_DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(REPLAY_STORE_NAME)) {
                db.createObjectStore(REPLAY_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

window.saveReplayData = async (slot) => {
    if (!AppState.chatHistory || AppState.chatHistory.length === 0) {
        alert("保存するチャット履歴がありません。");
        return;
    }

    const replayKey = `replay_${AppState.activeProfileId}_${slot}`;
    const replayHistory = [];

    const voiceName = AppState.current.ttsVoice || 'Puck';
    const ttsModel = AppState.current.ttsModel || 'gemini-2.5-pro-preview-tts';
    const ttsStyle = AppState.current.ttsStyle || 'Read aloud in a warm and friendly tone: ';

    // Helper to get text chunks same way as UI
    function getChunks(msgObj, text) {
        if (msgObj && msgObj.customChunks) return msgObj.customChunks;
        const splitCount = AppState.current.ttsSplitCount || 1;
        if (splitCount > 1) {
            // we need to access splitTextIntoChunks, but it's not exported.
            // Let's implement a simple version or expose it on window.
            if (window.splitTextIntoChunks) return window.splitTextIntoChunks(text, splitCount);
        }
        return [text];
    }

    for (const msg of AppState.chatHistory) {
        if (msg.role === 'model') {
            const text = msg.parts[0].text;
            const chunks = getChunks(msg, text);
            const savedChunks = [];

            for (const chunkText of chunks) {
                let cleanText = chunkText;
                const match = chunkText.match(/^\d{4}年\d{1,2}月\d{1,2}日　\d{1,2}時\d{1,2}分\n\n/);
                if (match) cleanText = chunkText.substring(match[0].length);
                cleanText = cleanText.replace(/[\*#_]/g, '');

                const cacheKey = `tts_${btoa(encodeURIComponent(ttsModel + "|" + voiceName + "|" + ttsStyle + "|" + cleanText.substring(0, 500)))}`;
                const cached = await getCachedAudio(cacheKey);

                savedChunks.push({
                    text: chunkText,
                    hasAudio: !!(cached && cached.data),
                    audioData: cached ? cached.data : null,
                    sampleRate: cached ? cached.sampleRate : null,
                    mimeType: cached ? cached.mimeType : null
                });
            }

            replayHistory.push({
                role: 'model',
                text: text,
                timestamp: msg.timestamp,
                savedChunks: savedChunks
            });
        } else {
            replayHistory.push({
                role: 'user',
                text: msg.parts[0].text,
                timestamp: msg.timestamp
            });
        }
    }

    const replayData = {
        profileId: AppState.activeProfileId,
        slot: slot,
        timestamp: Date.now(),
        history: replayHistory
    };

    try {
        const db = await openReplayDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(REPLAY_STORE_NAME, "readwrite");
            const store = transaction.objectStore(REPLAY_STORE_NAME);
            const request = store.put(replayData, replayKey);
            request.onsuccess = () => {
                alert(`リプレイ${slot} に保存しました！`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("Replay Save Error:", e);
        alert("リプレイの保存に失敗しました。");
    }
};

window.loadReplayData = async (slot) => {
    const replayKey = `replay_${AppState.activeProfileId}_${slot}`;
    try {
        const db = await openReplayDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(REPLAY_STORE_NAME, "readonly");
            const store = transaction.objectStore(REPLAY_STORE_NAME);
            const request = store.get(replayKey);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("Replay Load Error:", e);
        return null;
    }
};

let audioCtx = null;
let currentSource = null;

window.playReplayAudio = async (base64Data, sampleRate, mimeType, btnEl) => {
    const isPlayingThis = (btnEl.innerHTML === '⏹️' || btnEl.innerHTML === '■');

    if (currentSource) {
        try { currentSource.stop(); } catch (e) { }
        currentSource = null;
        const allBtns = document.querySelectorAll('.tts-play-btn');
        allBtns.forEach(b => { if (b.innerHTML === '⏹️' || b.innerHTML === '■') { b.innerHTML = '🔊'; b.classList.remove('stop-mode'); }});
        
        if (isPlayingThis) {
            return; // 自分が再生中だった場合は停止して終了
        }
    }

    const originalText = '🔊';
    btnEl.innerHTML = '■';
    btnEl.classList.add('stop-mode');
    btnEl.disabled = false;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        const isWav = mimeType && mimeType.toLowerCase().startsWith('audio/wav');
        
        if (isWav) {
            const binaryStr = atob(base64Data);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
            
            const buffer = await new Promise((resolve, reject) => {
                audioCtx.decodeAudioData(bytes.buffer, resolve, reject);
            });
            currentSource = audioCtx.createBufferSource();
            currentSource.buffer = buffer;
            currentSource.connect(audioCtx.destination);
        } else {
            const binaryStr = atob(base64Data);
            const numSamples = binaryStr.length / 2;
            const float32Array = new Float32Array(numSamples);

            for (let i = 0; i < numSamples; i++) {
                const low = binaryStr.charCodeAt(i * 2);
                const high = binaryStr.charCodeAt(i * 2 + 1);
                let int16 = low | (high << 8);
                if (int16 >= 0x8000) int16 -= 0x10000;
                float32Array[i] = int16 / 32768.0;
            }

            const buffer = audioCtx.createBuffer(1, numSamples, sampleRate || 24000);
            buffer.getChannelData(0).set(float32Array);

            currentSource = audioCtx.createBufferSource();
            currentSource.buffer = buffer;
            currentSource.connect(audioCtx.destination);
        }

        btnEl.innerHTML = '⏹️';
        btnEl.classList.remove('stop-mode');

        currentSource.onended = () => {
            btnEl.innerHTML = '🔊';
            currentSource = null;
        };

        currentSource.start();
    } catch (e) {
        console.error("Replay Play Error:", e);
        alert("再生エラー: " + e.message);
        btnEl.innerHTML = originalText;
        btnEl.classList.remove('stop-mode');
    }
};

window.playTTS = async (text, btnEl, forceRegenerate = false) => {
    if (btnEl.innerHTML === '■' && AppState.ttsAbortController) {
        AppState.ttsAbortController.abort();
        AppState.ttsAbortController = null;
        btnEl.innerHTML = '🔊';
        btnEl.classList.remove('stop-mode');
        return;
    }

    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return alert("APIキーが設定されていません。");

    if (currentSource) {
        try { currentSource.stop(); } catch (e) { }
        currentSource = null;
        if (btnEl.innerHTML === '⏹️') {
            btnEl.innerHTML = '🔊';
            return;
        }
    }

    const voiceName = AppState.current.ttsVoice || 'Puck';
    const ttsModel = AppState.current.ttsModel || 'gemini-2.5-pro-preview-tts';
    const ttsStyle = AppState.current.ttsStyle || 'Read aloud in a warm and friendly tone: ';

    let cleanText = text;
    const match = text.match(/^\d{4}年\d{1,2}月\d{1,2}日　\d{1,2}時\d{1,2}分\n\n/);
    if (match) {
        cleanText = text.substring(match[0].length);
    }
    cleanText = cleanText.replace(/[\*#_]/g, '');

    const cacheKey = `tts_${btoa(encodeURIComponent(ttsModel + "|" + voiceName + "|" + ttsStyle + "|" + cleanText.substring(0, 500)))}`;

    if (AppState.ttsAbortController) AppState.ttsAbortController.abort();
    AppState.ttsAbortController = new AbortController();

    const originalText = '🔊';
    btnEl.innerHTML = '■';
    btnEl.classList.add('stop-mode');
    btnEl.disabled = false; 

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

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

        const cached = forceRegenerate ? null : await getCachedAudio(cacheKey);

        if (cached && cached.data) {
            try {
                const isWav = cached.mimeType && cached.mimeType.startsWith('audio/wav');
                
                if (isWav) {
                    const binaryStr = atob(cached.data);
                    const len = binaryStr.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }
                    
                    const buffer = await new Promise((resolve, reject) => {
                        audioCtx.decodeAudioData(bytes.buffer, resolve, reject);
                    });
                    currentSource = audioCtx.createBufferSource();
                    currentSource.buffer = buffer;
                    currentSource.connect(audioCtx.destination);
                } else {
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

                    const buffer = audioCtx.createBuffer(1, numSamples, cached.sampleRate || 24000);
                    buffer.getChannelData(0).set(float32Array);

                    currentSource = audioCtx.createBufferSource();
                    currentSource.buffer = buffer;
                    currentSource.connect(audioCtx.destination);
                }

                btnEl.innerHTML = '⏹️';
                btnEl.classList.remove('stop-mode');
                btnEl.disabled = false;
                
                const statusSpan = btnEl.parentElement.querySelector('.tts-status-span');
                if (statusSpan) statusSpan.innerText = '';

                currentSource.onended = () => {
                    btnEl.innerHTML = '🔊';
                    currentSource = null;
                };

                currentSource.start();
                return; 
            } catch (decodeError) {
                console.warn("キャッシュのデコードに失敗しました。再生成します:", decodeError);
                try {
                    const db = await openAudioDB();
                    const transaction = db.transaction(STORE_NAME, "readwrite");
                    transaction.objectStore(STORE_NAME).delete(cacheKey);
                } catch (e) { }
            }
        }

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

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`, {
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

            const isWav = inlineData.mimeType && inlineData.mimeType.toLowerCase().startsWith('audio/wav');
            const isPcm = inlineData.mimeType && (inlineData.mimeType.toLowerCase().startsWith('audio/pcm') || inlineData.mimeType.toLowerCase().startsWith('audio/l16'));

            if (isWav) {
                const binaryStr = atob(inlineData.data);
                const len = binaryStr.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }

                saveCachedAudio(cacheKey, inlineData.data, null, inlineData.mimeType);

                const buffer = await new Promise((resolve, reject) => {
                    audioCtx.decodeAudioData(bytes.buffer, resolve, reject);
                });
                currentSource = audioCtx.createBufferSource();
                currentSource.buffer = buffer;
                currentSource.connect(audioCtx.destination);
            } else if (isPcm) {
                let sampleRate = 24000; 
                const rateMatch = inlineData.mimeType.match(/rate=(\d+)/);
                if (rateMatch) sampleRate = parseInt(rateMatch[1], 10);

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

                saveCachedAudio(cacheKey, inlineData.data, sampleRate, inlineData.mimeType);

                const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
                buffer.getChannelData(0).set(float32Array);

                currentSource = audioCtx.createBufferSource();
                currentSource.buffer = buffer;
                currentSource.connect(audioCtx.destination);
            } else {
                throw new Error(`サポートされていない音声形式です: ${inlineData.mimeType}`);
            }

            btnEl.innerHTML = '⏹️';
            btnEl.disabled = false;

            const statusSpan = btnEl.parentElement.querySelector('.tts-status-span');
            if (statusSpan) statusSpan.innerText = '';

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
            return; 
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

window.regenerateLastMessage = async (msgDiv, aiText) => {
    if (AppState.chatHistory.length < 2) {
        alert("再生成できる会話履歴がありません。");
        return;
    }

    const lastAiMsg = AppState.chatHistory[AppState.chatHistory.length - 1];
    if (lastAiMsg.role !== 'model' || !lastAiMsg.parts[0].text.includes(aiText)) {
        alert("再生成できるのは、一番最後のAIの返信だけです。");
        return;
    }

    if (!confirm("直前のAIの返答を取り消して、もう一度生成し直しますか？\n（※通信料が新たに発生します）")) return;

    const poppedAi = AppState.chatHistory.pop();
    AppState.totalCharCount -= (poppedAi.parts[0].text.length || 0);
    msgDiv.remove();

    const poppedUser = AppState.chatHistory.pop();
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
    if (window.updateCharCount) window.updateCharCount();

    Elements.textarea.value = poppedUser.parts[0].text;
    Elements.textarea.style.height = 'auto'; 
    Elements.textarea.style.height = (Elements.textarea.scrollHeight) + 'px';

    saveActiveProfile(); 

    setTimeout(() => {
        window.sendMessage && window.sendMessage();
    }, 100);
};

window.resendUserMessage = (text) => {
    Elements.textarea.value = text;
    Elements.textarea.style.height = 'auto';
    Elements.textarea.style.height = (Elements.textarea.scrollHeight) + 'px';
    window.sendMessage && window.sendMessage();
};
