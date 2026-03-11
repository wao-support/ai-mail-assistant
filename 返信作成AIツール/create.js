document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const companyNameInput = document.getElementById('companyName');
    const recipientNameInput = document.getElementById('recipientName');
    const mainContentInput = document.getElementById('mainContent');
    const toneSelect = document.getElementById('toneSelect');

    const generateBtn = document.getElementById('generateBtn');
    const copyBtn = document.getElementById('copyBtn');

    const emptyState = document.getElementById('emptyState');
    const resultContent = document.getElementById('resultContent');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    // Result Elements
    const resSubject = document.getElementById('resSubject');
    const resBody = document.getElementById('resBody');

    // Settings Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const apiKeyInput = document.getElementById('apiKey');
    const signatureTextInput = document.getElementById('signatureText');
    const staffNameInput = document.getElementById('staffName');

    // Default Signature
    const defaultSignature = `--------------------------------
ワオ株式会社
https://www.wao-cart.com/

担当：[担当者名]
Email: [メールアドレス]
--------------------------------`;

    // Config (Shared with app.js via localStorage)
    let config = {
        apiKey: localStorage.getItem('geminiApiKey') || '',
        model: 'gemini-2.5-flash',
        signature: localStorage.getItem('geminiSignature') || defaultSignature,
        gasUrl: localStorage.getItem('gasUrl') || 'https://script.google.com/macros/s/AKfycbzLW95iIn44aujvazfOQGHbjivlHKyGzr0pdljOJmNclZ7C-w6Yeobb1GOwZ9BI6KieDQ/exec',
        staffName: localStorage.getItem('staffName') || ''
    };

    // Initialize
    if (!config.apiKey) {
        openSettings();
    }
    apiKeyInput.value = config.apiKey;
    signatureTextInput.value = config.signature;
    staffNameInput.value = config.staffName;

    // --- Settings Modal Logic ---
    function openSettings() {
        settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
        if (!config.apiKey) {
            showToast('APIキーが設定されていません。機能が制限されます。');
        }
        settingsModal.classList.add('hidden');
    }

    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);

    saveSettingsBtn.addEventListener('click', () => {
        const val = apiKeyInput.value.trim();
        const sig = signatureTextInput.value.trim();
        if (val) {
            config.apiKey = val;
            config.signature = sig || defaultSignature;
            config.staffName = staffNameInput.value.trim();

            localStorage.setItem('geminiApiKey', val);
            localStorage.setItem('geminiSignature', config.signature);
            localStorage.setItem('staffName', config.staffName);

            showToast('設定を保存しました');
            closeSettings();
        } else {
            alert('APIキーを入力してください');
        }
    });

    // --- Utility: Toast ---
    function showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    }

    // --- AI Integration (Gemini API) ---
    async function callGeminiApi(prompt) {
        if (!config.apiKey) {
            throw new Error('APIキーが設定されていません。右上の設定アイコンから設定してください。');
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.3 // Slightly higher than reply logic, as it's a creative task from scratch
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("API Error details:", data);
                throw new Error(data.error?.message || 'APIリクエストに失敗しました');
            }

            if (data.candidates && data.candidates[0].content.parts[0].text) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('予期せぬレスポンス形式です');
            }
        } catch (error) {
            console.error('Gemini API Error:', error);
            throw error;
        }
    }

    // --- Usage Logging ---
    async function logUsage(logData) {
        if (!config.gasUrl) return;
        try {
            const payload = JSON.stringify({
                timestamp: new Date().toLocaleString('ja-JP'),
                staffName: config.staffName,
                ...logData
            });
            const params = new URLSearchParams({ data: payload });
            await fetch(config.gasUrl, {
                method: 'POST',
                mode: 'no-cors',
                body: params
            });
        } catch (error) {
            console.error('Failed to send usage log', error);
        }
    }

    // --- Flow: Generate New Email ---
    generateBtn.addEventListener('click', async () => {
        const companyName = companyNameInput.value.trim();
        const recipientName = recipientNameInput.value.trim();
        const mainContent = mainContentInput.value.trim();
        const tone = toneSelect.value;

        if (!mainContent) {
            showToast('「伝えたい内容」は必須です');
            mainContentInput.focus();
            return;
        }

        // Show loading
        emptyState.classList.add('hidden');
        resultContent.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingText.textContent = '新規メールを生成しています...';
        generateBtn.disabled = true;

        try {
            await runGeneration(companyName, recipientName, mainContent, tone);

            loadingOverlay.classList.add('hidden');
            resultContent.classList.remove('hidden');

            // Send Usage Log
            logUsage({
                feature: '新規作成',
                category: '',
                tone: tone,
                inputContent: mainContent,
                additionalInstruction: `宛先: ${companyName} ${recipientName}`.trim(),
                generatedSubject: resSubject.textContent,
                generatedBody: resBody.textContent
            });

            showToast('メール案を生成しました');

            // Scroll down slightly if needed or just show
            document.querySelector('.output-panel .panel-body').scrollTop = 0;

        } catch (error) {
            loadingOverlay.classList.add('hidden');
            emptyState.classList.remove('hidden');
            alert('生成エラー: ' + error.message);
        } finally {
            generateBtn.disabled = false;
        }
    });

    async function runGeneration(companyName, recipientName, mainContent, tone) {

        let recipientHeader = "";
        if (companyName) recipientHeader += companyName + " ";
        if (recipientName) recipientHeader += recipientName + " ";
        recipientHeader = recipientHeader.trim();

        const prompt = `あなたは企業のカスタマーサポート・営業担当者です。
ゼロから新規で送信するメールの文案を作成してください。

### 条件
* ビジネスメールとして自然な日本語
* 指定トーンに合わせる
* 情報が箇条書きにできる場合は適宜活用し、見やすくする
* 挨拶と締めの言葉を含める

### 出力フォーマット（厳守）
件名案：
本文：

### 必須構造（本文）
1. 宛名（${recipientHeader ? recipientHeader : "指定なし。一般的な宛名として作成してください。"}）
2. 挨拶（例: お世話になっております。ワオ株式会社の[氏名]です。など自然なものを生成）
3. 伝えたい内容の展開
4. 締めの言葉
5. 署名（以下の固定署名を必ず挿入）

### 固定署名（必ず末尾に追加）
${config.signature}

### 入力情報
【宛先の会社名】
${companyName || '（指定なし）'}

【宛先の担当者名】
${recipientName || '（指定なし）'}

【メインとなる伝えたい内容】
${mainContent}

【希望するトーン】
${tone}`;

        const resultText = await callGeminiApi(prompt);

        // Parse the result
        let subject = "メールの件名（生成に失敗しました）";
        let body = resultText;

        const subjectMatch = resultText.match(/件名案[：:]\s*(.*?)\n/);
        if (subjectMatch) {
            subject = subjectMatch[1].trim();
        }

        const bodyMatch = resultText.split(/本文[：:]\s*\n?/);
        if (bodyMatch.length > 1) {
            body = bodyMatch.slice(1).join("本文：").trim();
        } else {
            // Remove subject from output if regex split failed
            body = resultText.replace(/件名案[：:].*?\n/, '').trim();
        }

        // Set UI
        resSubject.textContent = subject;
        resBody.textContent = body;
    }

    // --- Copy Function ---
    copyBtn.addEventListener('click', async () => {
        const txt = resBody.textContent;
        if (!txt) return;

        try {
            await navigator.clipboard.writeText(txt);

            // Visual feedback
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> コピー完了';
            copyBtn.classList.add('copied');

            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.classList.remove('copied');
            }, 2000);

            showToast('クリップボードにコピーしました');
        } catch (err) {
            console.error('Failed to copy: ', err);
            alert('コピーに失敗しました。ブラウザの権限を確認してください。');
        }
    });
});
