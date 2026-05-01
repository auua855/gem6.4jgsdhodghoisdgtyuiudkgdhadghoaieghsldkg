import { AppState, Elements, saveActiveProfile, loadActiveProfileToUI } from './state.js';

// 入力欄の高さ自動調整
export function initUIElements() {
    const textarea = document.getElementById('user-input');
    if (textarea) {
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }

    // キャッシュテキストの推定トークン数計算
    const cacheTextarea = document.getElementById('cache-text');
    if (cacheTextarea) {
        cacheTextarea.addEventListener('input', function () {
            // 入力状態をAppStateに同期
            AppState.current.pendingCacheText = this.value;
            const charCount = this.value.length;
            const estimatedTokens = charCount * 2;
            const counter = document.getElementById('cache-token-counter');
            if (counter) counter.innerText = `予想トークン数: ${estimatedTokens.toLocaleString()}`;
        });
    }

    const ttsSplitSelect = document.getElementById('tts-split-select');
    if (ttsSplitSelect) {
        ttsSplitSelect.addEventListener('change', function () {
            AppState.current.ttsSplitCount = parseInt(this.value) || 1;
            saveActiveProfile();
            document.getElementById('chat-container').innerHTML = '';
            if (window.loadHistory) window.loadHistory();
        });
    }
}

window.toggleSettings = () => {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.style.display = overlay.style.display === 'block' ? 'none' : 'block';
};

window.switchSettingsTab = (tabId, btn) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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

    if (currentVal.length > 0 && !currentVal.endsWith('\n')) {
        inputEl.value = currentVal + '\n\n' + textToPaste;
    } else {
        inputEl.value = currentVal + textToPaste;
    }
    inputEl.dispatchEvent(new Event('input')); 
    inputEl.focus();
};

window.saveCurrentSessionHistory = () => {
    if (AppState.chatHistory.length === 0) {
        alert("保存する会話履歴がありません！");
        return;
    }

    let sessionText = `\n\n--- [保存日時: ${new Date().toLocaleString()}] ---\n`;
    AppState.chatHistory.forEach(msg => {
        const roleName = msg.role === 'user' ? 'User' : (AppState.current.name || 'AI');
        sessionText += `【${roleName}】\n${msg.parts[0].text}\n\n`;
    });

    AppState.current.persistentHistoryText += sessionText;
    document.getElementById('persistent-history-text').value = AppState.current.persistentHistoryText;
    saveActiveProfile();

    window.toggleSettings();
    window.switchSettingsTab('tab-save', document.getElementById('tab-btn-save'));
};

window.pasteToCacheInput = (sourceId) => {
    const sourceText = document.getElementById(sourceId).value;
    const targetEl = document.getElementById('cache-text');
    if (!sourceText) return;

    targetEl.value = (targetEl.value + "\n\n" + sourceText).trim();
    targetEl.dispatchEvent(new Event('input')); // これでpendingCacheTextにも同期される

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
    saveActiveProfile();
};

// ホーム画面処理 (Home / Profile Management)
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
        totalCharCount: 0,
        pendingCacheText: '',
        pendingCacheFiles: [] // メモリ保持のみ
    };

    AppState.profiles.push(newProfile);
    localStorage.setItem('gemini_profiles', JSON.stringify(AppState.profiles.map(p => { 
        const { pendingCacheFiles, ...rest } = p; 
        return rest;
    })));
    window.renderHomeOverlay();
};

window.switchAI = (id) => {
    if (AppState.activeProfileId === id) {
        document.getElementById('home-overlay').style.display = 'none';
        return;
    }

    saveActiveProfile();

    AppState.activeProfileId = id;
    localStorage.setItem('gemini_active_profile', id);
    loadActiveProfileToUI();

    document.getElementById('chat-container').innerHTML = '';
    if (window.loadHistory) window.loadHistory();
    if (window.updateCharCount) window.updateCharCount();
    if (window.checkCacheWarning) window.checkCacheWarning();
    currentBgCycleIndex = -1; // 背景切り替えインデックスをリセット

    document.getElementById('home-overlay').style.display = 'none';
};

window.deleteAI = (id) => {
    if (AppState.profiles.length <= 1) {
        alert("最後のAIは削除できません。");
        return;
    }
    if (!confirm("本当にこのAIを削除しますか？\n会話履歴や設定はすべて失われます。")) return;

    AppState.profiles = AppState.profiles.filter(p => p.id !== id);
    localStorage.setItem('gemini_profiles', JSON.stringify(AppState.profiles.map(p => { 
        const { pendingCacheFiles, ...rest } = p; 
        return rest;
    })));

    if (AppState.activeProfileId === id) {
        window.switchAI(AppState.profiles[0].id);
    } else {
        window.renderHomeOverlay();
    }
};

// Helper to get element by ID
const El = (id) => document.getElementById(id);

// Function to load active profile data into UI elements
window.loadActiveProfileToUI = () => {
    const profile = AppState.current;
    if (!profile) return;

    if (El('api-key')) El('api-key').value = AppState.settings.apiKey || '';
    if (El('ai-name-input')) El('ai-name-input').value = profile.name || '';
    if (El('persona-setting')) El('persona-setting').value = profile.persona || '';
    if (El('model-select')) El('model-select').value = profile.model || 'gemini-3.1-pro-preview';
    if (El('safety-harassment')) El('safety-harassment').value = profile.safetyHarassment || 'BLOCK_NONE';
    if (El('safety-hate')) El('safety-hate').value = profile.safetyHate || 'BLOCK_NONE';
    if (El('safety-sexually-explicit')) El('safety-sexually-explicit').value = profile.safetySexuallyExplicit || 'BLOCK_NONE';
    if (El('safety-dangerous-content')) El('safety-dangerous-content').value = profile.safetyDangerousContent || 'BLOCK_NONE';
    if (El('tts-model-select')) El('tts-model-select').value = profile.ttsModel || 'gemini-2.5-pro-preview-tts';
    if (El('tts-voice-select')) El('tts-voice-select').value = profile.ttsVoice || 'Puck';
    if (El('tts-style-input')) El('tts-style-input').value = profile.ttsStyle || 'Read aloud in a warm and friendly tone: ';
    if (El('tts-split-select')) El('tts-split-select').value = profile.ttsSplitCount || 1;
    if (El('persistent-cache-text')) El('persistent-cache-text').value = profile.persistentCacheText || '';
    if (El('persistent-history-text')) El('persistent-history-text').value = profile.persistentHistoryText || '';

    if (El('meta-text-1')) El('meta-text-1').value = profile.metaTexts[0] || '';
    if (El('meta-text-2')) El('meta-text-2').value = profile.metaTexts[1] || '';
    if (El('meta-text-3')) El('meta-text-3').value = profile.metaTexts[2] || '';

    const metaRadio = El(`meta-select-${profile.activeMetaIndex}`);
    if (metaRadio) metaRadio.checked = true;

    if (El('return-keyword')) El('return-keyword').value = profile.returnKeyword || '';

    // Background patterns UI update
    const patternsContainer = El('patterns-container');
    if (patternsContainer) {
        patternsContainer.innerHTML = '';
        (profile.bgPatterns || []).forEach(pattern => {
            window.addPatternUI(pattern.keyword, pattern.image);
        });
    }

    // Base background image preview
    const baseBgPreview = El('base-bg-preview');
    if (baseBgPreview) {
        baseBgPreview.style.backgroundImage = profile.baseBgImage ? `url(${profile.baseBgImage})` : 'none';
    }
    window.updateChatBackground(profile.baseBgImage);
};

window.saveSettings = () => {
    AppState.settings.apiKey = document.getElementById('api-key').value;
    localStorage.setItem('gemini_api_key', AppState.settings.apiKey);

    AppState.current.name = document.getElementById('ai-name-input').value;
    AppState.current.persona = document.getElementById('persona-setting').value;
    AppState.current.model = document.getElementById('model-select').value;
    AppState.current.safetyHarassment = document.getElementById('safety-harassment').value;
    AppState.current.safetyHate = document.getElementById('safety-hate').value;
    AppState.current.safetySexuallyExplicit = document.getElementById('safety-sexually-explicit').value;
    AppState.current.safetyDangerousContent = document.getElementById('safety-dangerous-content').value;
    AppState.current.ttsModel = document.getElementById('tts-model-select').value;
    AppState.current.ttsVoice = document.getElementById('tts-voice-select').value;
    AppState.current.ttsStyle = document.getElementById('tts-style-input').value;
    AppState.current.ttsSplitCount = parseInt(document.getElementById('tts-split-select').value) || 1;

    AppState.current.persistentCacheText = document.getElementById('persistent-cache-text').value;
    AppState.current.persistentHistoryText = document.getElementById('persistent-history-text').value;

    AppState.current.metaTexts[0] = document.getElementById('meta-text-1').value;
    AppState.current.metaTexts[1] = document.getElementById('meta-text-2').value;
    AppState.current.metaTexts[2] = document.getElementById('meta-text-3').value;

    const selectedMeta = document.querySelector('input[name="meta-select"]:checked');
    if (selectedMeta) {
        AppState.current.activeMetaIndex = parseInt(selectedMeta.value);
    }

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

    saveActiveProfile();
    loadActiveProfileToUI();
    if (window.checkCacheWarning) window.checkCacheWarning();

    AppState.chatSession = null;
    window.toggleSettings();
};

window.clearHistory = () => {
    if (confirm('会話履歴をすべて消去しますか？')) {
        AppState.chatHistory = [];
        document.getElementById('chat-container').innerHTML = '';
        AppState.chatSession = null;
        AppState.totalCharCount = 0;
        if (window.updateCharCount) window.updateCharCount();

        saveActiveProfile();
        alert('履歴を消去しました');
        window.toggleSettings();
    }
};

export async function compressImage(file) {
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
                const MAX_SIZE = 1280;
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
                resolve(canvas.toDataURL('image/jpeg', 0.7));
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
        if (parent) {
            parent.querySelector('.pattern-preview').style.backgroundImage = `url(${compressed})`;
            parent.querySelector('.pattern-data').value = compressed;
        }
    }
};

export function checkBackgroundPatterns(text) {
    if (AppState.current.returnKeyword && text.includes(AppState.current.returnKeyword)) {
        AppState.current.queuedBgImage = AppState.current.baseBgImage;
        return;
    }
    const patterns = AppState.current.bgPatterns || [];
    for (let i = patterns.length - 1; i >= 0; i--) {
        if (patterns[i].keyword && text.includes(patterns[i].keyword)) {
            AppState.current.queuedBgImage = patterns[i].image;
            return;
        }
    }
}
window.checkBackgroundPatterns = checkBackgroundPatterns; // export equivalent for inline calls if needed

// 手動で背景画像を順番に切り替える処理
let currentBgCycleIndex = -1;
window.cycleBackground = () => {
    const profile = AppState.current;
    if (!profile) return;
    
    // 現在のAIのエントリーされているすべての画像リストを作成する
    const images = [];
    if (profile.baseBgImage) {
        images.push(profile.baseBgImage);
    }
    if (profile.bgPatterns && Array.isArray(profile.bgPatterns)) {
        for (const pt of profile.bgPatterns) {
            if (pt.image) {
                images.push(pt.image);
            }
        }
    }
    
    // 画像が1枚もない場合は何もしない
    if (images.length === 0) {
        alert("現在設定されている画像がありません。設定から画像を追加してください。");
        return;
    }
    
    currentBgCycleIndex++;
    if (currentBgCycleIndex >= images.length) {
        currentBgCycleIndex = 0;
    }
    
    window.updateChatBackground(images[currentBgCycleIndex]);
};

// ファイル処理
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

// キャッシュファイルの一時保存処理
window.handleCacheFileSelect = () => {
    const input = document.getElementById('cache-file-input');
    if (!AppState.current.pendingCacheFiles) AppState.current.pendingCacheFiles = [];
    
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const exists = AppState.current.pendingCacheFiles.some(f => f.name === file.name && f.size === file.size);
        if (!exists) {
            AppState.current.pendingCacheFiles.push(file);
        }
    }
    input.value = ""; 
    window.updateCacheFileListUI();
};

window.updateCacheFileListUI = () => {
    const listEl = document.getElementById('cache-file-list');
    if (!listEl) return;
    listEl.innerHTML = "";
    
    const files = AppState.current.pendingCacheFiles || [];
    files.forEach((f, index) => {
        const div = document.createElement('div');
        div.style.marginBottom = "5px";
        div.innerText = `📎 ${f.name} `;
        const del = document.createElement('span');
        del.innerText = "✖";
        del.style.cursor = "pointer";
        del.style.color = "#ff4444";
        del.style.marginLeft = "10px";
        del.onclick = () => {
            AppState.current.pendingCacheFiles.splice(index, 1);
            window.updateCacheFileListUI();
        };
        div.appendChild(del);
        listEl.appendChild(div);
    });
};

window.saveHistory = function() {
    saveActiveProfile();
};

// --- TTS Splitting Helper ---
function splitTextIntoChunks(text, count) {
    if (count <= 1) return [text];
    let delimiter = '\n\n';
    let pieces = text.split(delimiter);
    if (pieces.length < count) {
        delimiter = '\n';
        pieces = text.split(delimiter);
    }
    if (pieces.length <= count) {
        return pieces.length === 0 ? [text] : pieces;
    }
    
    // 文字数を基準に、指定された分割数にできるだけ均等になるよう段落をグループ化する
    const totalLength = pieces.reduce((sum, p) => sum + p.length, 0);
    let currentLength = 0;
    const prefixSums = pieces.map(p => {
        currentLength += p.length;
        return currentLength;
    });
    
    const chunks = [];
    let lastSplitIndex = -1;
    
    for (let k = 1; k < count; k++) {
        const target = (totalLength * k) / count;
        let bestIndex = lastSplitIndex + 1;
        let minDiff = Infinity;
        
        // 残りのチャンク数分の要素を確保するための最大インデックス
        const maxAllowedIndex = pieces.length - 1 - (count - k);
        
        for (let i = lastSplitIndex + 1; i <= maxAllowedIndex; i++) {
            const diff = Math.abs(prefixSums[i] - target);
            if (diff < minDiff) {
                minDiff = diff;
                bestIndex = i;
            }
        }
        
        chunks.push(pieces.slice(lastSplitIndex + 1, bestIndex + 1).join(delimiter));
        lastSplitIndex = bestIndex;
    }
    
    // 残りを最後のチャンクにする
    if (lastSplitIndex < pieces.length - 1) {
        chunks.push(pieces.slice(lastSplitIndex + 1).join(delimiter));
    }
    
    return chunks;
}

// 境界編集モーダル関連
let currentEditMsgIndex = -1;

window.openBoundaryEditModal = (msgIndex, chunks) => {
    currentEditMsgIndex = msgIndex;
    const textarea = document.getElementById('boundary-edit-textarea');
    textarea.value = chunks.join('\n\n===区切り===\n\n');
    document.getElementById('boundary-edit-modal').style.display = 'flex';
};

window.closeBoundaryEditModal = () => {
    document.getElementById('boundary-edit-modal').style.display = 'none';
    currentEditMsgIndex = -1;
};

window.saveBoundaryEdit = () => {
    if (currentEditMsgIndex >= 0 && AppState.chatHistory[currentEditMsgIndex]) {
        const textarea = document.getElementById('boundary-edit-textarea');
        const newText = textarea.value;
        const newChunks = newText.split('===区切り===').map(c => c.trim()).filter(c => c.length > 0);
        
        AppState.chatHistory[currentEditMsgIndex].customChunks = newChunks;
        
        document.getElementById('chat-container').innerHTML = '';
        window.loadHistory();
        
        saveActiveProfile();
    }
    window.closeBoundaryEditModal();
};

function renderMessageContent(div, text, sender, dateText, msgIndex) {
    if (dateText) {
        const dateDiv = document.createElement('div');
        dateDiv.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 5px;';
        dateDiv.innerText = dateText;
        div.appendChild(dateDiv);
    }

    const isAi = sender === 'ai';
    const splitCount = AppState.current.ttsSplitCount || 1;
    let chunks = [text];

    let msgObj = null;
    if (msgIndex >= 0 && AppState.chatHistory[msgIndex]) {
        msgObj = AppState.chatHistory[msgIndex];
    }
    
    if (msgObj && msgObj.customChunks) {
        chunks = msgObj.customChunks;
    } else if (isAi && splitCount > 1) {
        chunks = splitTextIntoChunks(text, splitCount);
    }

    chunks.forEach((chunkText, index) => {
        const chunkDiv = document.createElement('div');
        chunkDiv.style.marginBottom = index < chunks.length - 1 ? '15px' : '0';
        
        const textSpan = document.createElement('span');
        textSpan.innerText = chunkText;
        chunkDiv.appendChild(textSpan);
        
        if (isAi) {
            const btnBox = document.createElement('div');
            btnBox.style.cssText = 'float: right; margin-left: 10px; display: flex; gap: 8px; align-items: center;';

            if (index === chunks.length - 1) {
                const regenBtn = document.createElement('button');
                regenBtn.innerHTML = '⋮';
                regenBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 18px; color: #aaa; padding: 0;';
                regenBtn.title = 'この返答全体を再生成する';
                regenBtn.onclick = () => window.regenerateLastMessage && window.regenerateLastMessage(div, text);
                btnBox.appendChild(regenBtn);
            }

            const regenTtsBtn = document.createElement('button');
            regenTtsBtn.innerHTML = '🔄<span style="font-size:12px;">🔊</span>';
            regenTtsBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 16px; opacity: 0.7; padding: 0; display:flex; align-items:center;';
            regenTtsBtn.title = '音声を再生成する（キャッシュを破棄して再通信）';
            
            const ttsBtn = document.createElement('button');
            ttsBtn.innerHTML = '🔊';
            ttsBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 18px; opacity: 0.7; padding: 0; width: 24px; text-align:center;';
            ttsBtn.title = '音声で読み上げる（課金発生）';
            ttsBtn.onclick = () => window.playTTS && window.playTTS(chunkText, ttsBtn, false);

            regenTtsBtn.onclick = () => window.playTTS && window.playTTS(chunkText, ttsBtn, true);
            
            const statusSpan = document.createElement('span');
            statusSpan.className = 'tts-status-span';
            statusSpan.style.cssText = 'color: #777; font-size: 12px; margin-left: 5px; display:flex; align-items:center;';
            if (window.checkAudioCacheStatus) {
                window.checkAudioCacheStatus(chunkText).then(isCached => {
                    if (!isCached) statusSpan.innerText = '（未生成）';
                });
            } else {
                statusSpan.innerText = '（未生成）';
            }
            
            btnBox.appendChild(regenTtsBtn);
            btnBox.appendChild(ttsBtn);
            btnBox.appendChild(statusSpan);

            chunkDiv.appendChild(btnBox);
            const clearDiv = document.createElement('div');
            clearDiv.style.clear = 'both';
            chunkDiv.appendChild(clearDiv);
        } else if (sender === 'user') {
            const btnBox = document.createElement('div');
            btnBox.style.cssText = 'margin-top: 5px; text-align: right;';

            const resendBtn = document.createElement('button');
            resendBtn.innerHTML = '↺';
            resendBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 16px; color: rgba(255,255,255,0.5); padding: 0;';
            resendBtn.title = 'このメッセージをもう一度送信する';
            resendBtn.onclick = () => window.resendUserMessage && window.resendUserMessage(text);
            btnBox.appendChild(resendBtn);

            chunkDiv.appendChild(btnBox);
            const clearDiv = document.createElement('div');
            clearDiv.style.clear = 'both';
            chunkDiv.appendChild(clearDiv);
        }
        
        div.appendChild(chunkDiv);

        if (isAi && index < chunks.length - 1) {
            const sepContainer = document.createElement('div');
            sepContainer.style.cssText = 'display: flex; align-items: center; justify-content: center; margin: 15px 0;';
            
            const hr1 = document.createElement('hr');
            hr1.style.cssText = 'flex: 1; border: none; border-top: 1px dashed #555; margin: 0 10px;';
            
            const editBtn = document.createElement('button');
            editBtn.innerText = '境界を編集';
            editBtn.style.cssText = 'background: #333; color: #ccc; border: 1px solid #555; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;';
            editBtn.onclick = () => window.openBoundaryEditModal(msgIndex, chunks);
            
            const hr2 = document.createElement('hr');
            hr2.style.cssText = 'flex: 1; border: none; border-top: 1px dashed #555; margin: 0 10px;';
            
            sepContainer.appendChild(hr1);
            sepContainer.appendChild(editBtn);
            sepContainer.appendChild(hr2);
            
            div.appendChild(sepContainer);
        }
    });
}

window.loadHistory = function() {
    if (AppState.chatHistory && AppState.chatHistory.length > 0) {
        AppState.chatHistory.forEach((msg, index) => {
            const text = msg.parts[0].text;
            const sender = msg.role === 'user' ? 'user' : 'ai';
            const msgDate = msg.timestamp || null;

            const div = document.createElement('div');
            div.className = `msg ${sender}`;
            
            renderMessageContent(div, text, sender, msgDate, index);
            Elements.chatContainer.appendChild(div);
        });
        Elements.chatContainer.scrollTop = Elements.chatContainer.scrollHeight;
    }
};

window.addMessage = function(text, sender, dateText = null) {
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    
    let expectedIndex = AppState.chatHistory.length;
    if (sender === 'ai') {
        if (text.startsWith('エラーみたいだね') || text.includes('キャンセルされました')) {
            expectedIndex = -1;
        } else {
            expectedIndex = AppState.chatHistory.length + 1;
        }
    }

    renderMessageContent(div, text, sender, dateText, expectedIndex);
    
    Elements.chatContainer.appendChild(div);
    Elements.chatContainer.scrollTop = Elements.chatContainer.scrollHeight;
};

window.addLoading = function(id) {
    const div = document.createElement('div');
    div.className = 'ai loading-container msg';
    div.id = id;
    div.style.padding = '8px 16px';
    div.innerHTML = `<div class="spinner"></div><span>応答中...</span>`;
    Elements.chatContainer.appendChild(div);
    Elements.chatContainer.scrollTop = Elements.chatContainer.scrollHeight;
};

window.removeLoading = function(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
};

window.updateCharCount = function() {
    document.getElementById('char-count').innerText = `${AppState.totalCharCount} 文字`;
    localStorage.setItem('gemini_char_count', AppState.totalCharCount.toString());
};

window.splitTextIntoChunks = splitTextIntoChunks;

window.promptSaveReplay = () => {
    const slotStr = prompt("どのスロットにリプレイを保存しますか？ (1, 2, 3 のいずれかを入力)", "1");
    if (!slotStr) return;
    const slot = parseInt(slotStr);
    if (isNaN(slot) || slot < 1 || slot > 3) {
        alert("1, 2, 3のいずれかの数字を入力してください。");
        return;
    }
    if (confirm(`リプレイ ${slot} に現在のチャットと音声を上書き保存しますか？\n(既に保存されている場合は消去されます)`)) {
        if (window.saveReplayData) window.saveReplayData(slot);
    }
};

window.openReplayScreen = async (slot) => {
    if (!window.loadReplayData) return;
    const replay = await window.loadReplayData(slot);
    if (!replay || !replay.history || replay.history.length === 0) {
        alert(`リプレイ ${slot} は保存されていません。`);
        return;
    }
    
    document.getElementById('settings-overlay').style.display = 'none';
    
    // 元のチャット画面を隠す（背景画像だけ残す）
    document.getElementById('header').style.display = 'none';
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('input-area').style.display = 'none';
    
    const replayOverlay = document.getElementById('replay-overlay');
    const container = document.getElementById('replay-chat-container');
    container.innerHTML = '';
    
    replay.history.forEach((msg, index) => {
        const text = msg.text;
        const sender = msg.role === 'user' ? 'user' : 'ai';
        const msgDate = msg.timestamp || null;

        const div = document.createElement('div');
        div.className = `msg ${sender}`;
        
        if (msgDate) {
            const dateDiv = document.createElement('div');
            dateDiv.style.fontSize = '12px';
            dateDiv.style.color = '#888';
            dateDiv.style.marginBottom = '5px';
            dateDiv.innerText = msgDate;
            div.appendChild(dateDiv);
        }

        if (sender === 'user') {
            const lines = text.split('\n');
            lines.forEach((line, i) => {
                const p = document.createElement('p');
                p.style.margin = '0';
                p.innerText = line;
                div.appendChild(p);
                if (i < lines.length - 1) div.appendChild(document.createElement('br'));
            });
        } else {
            const chunks = msg.savedChunks || [{ text: text, hasAudio: false }];
            chunks.forEach((chunk, chunkIndex) => {
                const chunkDiv = document.createElement('div');
                chunkDiv.style.position = 'relative';
                chunkDiv.style.marginBottom = chunkIndex < chunks.length - 1 ? '15px' : '0';
                
                const lines = chunk.text.split('\n');
                lines.forEach((line, i) => {
                    const p = document.createElement('p');
                    p.style.margin = '0';
                    if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
                        p.innerHTML = `<strong>${line.replace(/\*\*/g, '')}</strong>`;
                    } else if (line.trim().startsWith('* ')) {
                        p.innerHTML = `&bull; ${line.substring(2)}`;
                        p.style.paddingLeft = '15px';
                    } else {
                        p.innerText = line;
                    }
                    chunkDiv.appendChild(p);
                    if (i < lines.length - 1) chunkDiv.appendChild(document.createElement('br'));
                });
                
                if (chunk.hasAudio && chunk.audioData) {
                    const playBtn = document.createElement('button');
                    playBtn.innerHTML = '🔊';
                    playBtn.className = 'tts-play-btn';
                    playBtn.onclick = () => {
                        if (window.playReplayAudio) window.playReplayAudio(chunk.audioData, chunk.sampleRate, chunk.mimeType, playBtn);
                    };
                    chunkDiv.appendChild(playBtn);
                } else {
                    const ungenSpan = document.createElement('span');
                    ungenSpan.innerText = '（未生成）';
                    ungenSpan.style.color = '#777';
                    ungenSpan.style.fontSize = '12px';
                    ungenSpan.style.marginLeft = '10px';
                    chunkDiv.appendChild(ungenSpan);
                }
                
                div.appendChild(chunkDiv);
            });
        }
        
        container.appendChild(div);
    });
    
    replayOverlay.style.display = 'flex';
};

window.closeReplayScreen = () => {
    document.getElementById('replay-overlay').style.display = 'none';
    
    // 元のチャット画面を戻す
    document.getElementById('header').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'flex';
    document.getElementById('input-area').style.display = 'flex';
    
    const allBtns = document.querySelectorAll('#replay-chat-container .tts-play-btn');
    allBtns.forEach(b => { if (b.innerHTML === '⏹️' || b.innerHTML === '■') { b.click(); }});
};
