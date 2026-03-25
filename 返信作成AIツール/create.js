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

    // Result Elements
    const resSubject = document.getElementById('resSubject');
    const resBody = document.getElementById('resBody');

    // Settings Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const signatureTextInput = document.getElementById('signatureText');
    const staffNameInput = document.getElementById('staffName');

    // Default Signature
    const defaultSignature = `--------------------------------
ワオ株式会社
https://www.wao-cart.com/

担当：[担当者名]
Email: [メールアドレス]
--------------------------------`;

    // GAS URLs
    const GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbymHzOHxK6zxLVFi6_WijtJhySPk9KHOz6UEadpuOX7h5vYCsSu5kn-1vmsuUSN2b38/exec'; // プロンプト置き場（Geminiプロキシ）
    const GAS_LOG_URL = 'https://script.google.com/macros/s/AKfycbzLW95iIn44aujvazfOQGHbjivlHKyGzr0pdljOJmNclZ7C-w6Yeobb1GOwZ9BI6KieDQ/exec'; // ログ記録

    let config = {
        signature: localStorage.getItem('geminiSignature') || defaultSignature,
        staffName: localStorage.getItem('staffName') || ''
    };

    // Initialize
    signatureTextInput.value = config.signature;
    staffNameInput.value = config.staffName;

    // --- Settings Modal Logic ---
    function openSettings() { settingsModal.classList.remove('hidden'); }
    function closeSettings() { settingsModal.classList.add('hidden'); }
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);

    saveSettingsBtn.addEventListener('click', () => {
        const sig = signatureTextInput.value.trim();
        config.signature = sig || defaultSignature;
        config.staffName = staffNameInput.value.trim();

        localStorage.setItem('geminiSignature', config.signature);
        localStorage.setItem('staffName', config.staffName);

        showToast('設定を保存しました');
        closeSettings();
    });

    // --- Utility: Toast ---
    function showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => { toast.classList.add('hidden'); }, duration);
    }

    // --- AI Integration (via GAS Proxy) ---
    async function callGeminiViaGas(prompt, temperature = 0.3) {
        const params = new URLSearchParams({
            action: 'gemini',
            prompt: prompt,
            temperature: temperature.toString()
        });

        const response = await fetch(`${GAS_PROXY_URL}?${params.toString()}`);

        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(data.message || 'GASプロキシエラー');
        }
        return data.text;
    }

    // --- Usage Logging ---
    async function logUsage(logData) {
        try {
            const payload = JSON.stringify({
                timestamp: new Date().toLocaleString('ja-JP'),
                staffName: config.staffName,
                ...logData
            });
            const params = new URLSearchParams({ data: payload });
            await fetch(GAS_LOG_URL, {
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

        emptyState.classList.add('hidden');
        resultContent.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        generateBtn.disabled = true;

        try {
            const resultText = await runGeneration(companyName, recipientName, mainContent, tone);

            let subject = "メールの件名（生成に失敗しました）";
            let body = resultText;

            const subjectMatch = resultText.match(/件名案[：:]\s*(.*?)\n/);
            if (subjectMatch) subject = subjectMatch[1].trim();

            const bodyMatch = resultText.split(/本文[：:]\s*\n?/);
            if (bodyMatch.length > 1) {
                body = bodyMatch.slice(1).join("本文：").trim();
            } else {
                body = resultText.replace(/件名案[：:].*?\n/, '').trim();
            }

            resSubject.textContent = subject;
            resBody.textContent = body;

            loadingOverlay.classList.add('hidden');
            resultContent.classList.remove('hidden');

            logUsage({
                feature: '新規作成',
                category: '',
                tone: tone,
                inputContent: mainContent,
                additionalInstruction: `宛先: ${companyName} ${recipientName}`.trim(),
                generatedSubject: subject,
                generatedBody: body
            });

            showToast('メール案を生成しました');
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

        return await callGeminiViaGas(prompt, 0.3);
    }

    // --- Copy Function ---
    copyBtn.addEventListener('click', async () => {
        const txt = resBody.textContent;
        if (!txt) return;

        try {
            await navigator.clipboard.writeText(txt);

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
