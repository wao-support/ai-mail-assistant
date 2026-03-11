document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const emailBodyInput = document.getElementById('emailBody');
    const categorySelect = document.getElementById('categorySelect');
    const toneSelect = document.getElementById('toneSelect');
    const additionalInstructionInput = document.getElementById('additionalInstruction');

    const autoCategorizeBtn = document.getElementById('autoCategorizeBtn');
    const generateBtn = document.getElementById('generateBtn');
    const copyBtn = document.getElementById('copyBtn');

    const emptyState = document.getElementById('emptyState');
    const resultContent = document.getElementById('resultContent');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    // Result Elements
    const resCategory = document.getElementById('resCategory');
    const resConfidence = document.getElementById('resConfidence');
    const resReason = document.getElementById('resReason');
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

    // Config
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
    async function callGeminiApi(prompt, systemInstruction = null) {
        if (!config.apiKey) {
            throw new Error('APIキーが設定されていません。右上の設定アイコンから設定してください。');
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.2 // Lower temp for more consistent results fitting strict requirements
            }
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

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

    // --- Preprocessing ---
    function preprocessEmailBody(text) {
        if (!text) return "";

        // 簡易マスキング (Privacy Masking)
        let processed = text;
        // Email
        processed = processed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
        // Phone (Japanese common formats)
        processed = processed.replace(/0\d{1,4}-\d{1,4}-\d{4}/g, '[TEL]');
        processed = processed.replace(/0[789]0\d{8}/g, '[TEL]');
        // 簡易的な口座番号・クレカっぽい連続数字
        processed = processed.replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[NUMBER]');

        // 引用符(>)が連続する部分はカットまたは省略するなどの処理が可能だが、
        // 現時点ではマスキングのみ実施
        return processed;
    }

    // --- Flow 1: Categorization ---
    autoCategorizeBtn.addEventListener('click', async () => {
        const rawEmail = emailBodyInput.value.trim();
        if (!rawEmail) {
            showToast('受信メール本文を入力してください');
            emailBodyInput.focus();
            return;
        }

        autoCategorizeBtn.disabled = true;
        const originalText = autoCategorizeBtn.innerHTML;
        autoCategorizeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 判定中...';

        try {
            await runCategorization(rawEmail);
            showToast('カテゴリを自動判定しました');
        } catch (error) {
            alert('カテゴリ判定エラー: ' + error.message);
        } finally {
            autoCategorizeBtn.disabled = false;
            autoCategorizeBtn.innerHTML = originalText;
        }
    });

    async function runCategorization(rawEmail) {
        const processedEmail = preprocessEmailBody(rawEmail);

        const prompt = `あなたは「ワオ株式会社」のカスタマーサポート・営業担当です。
以下の受信メールを読んで、問い合わせカテゴリを1つ選んでください。

### カテゴリ（この中から必ず1つ）
* お弁当デリ／営業
* お弁当デリ／注文
* お弁当デリ／問い合わせ
* お弁当デリ／配送
* お弁当デリ／加盟店
* 社食DELi／営業
* 社食DELi／スタッフ
* 社食DELi／取引先
* 採用
* その他

### ルール
* 出力は必ずJSONのみ（説明文は禁止）
* confidence は "high" / "medium" / "low" のいずれか
* reason は日本語で短く（1文）

### 受信メール
## ${processedEmail}`;

        const resultText = await callGeminiApi(prompt);

        // Parse JSON
        try {
            // Remove markdown code blocks if AI included them despite instructions
            const cleanText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(cleanText);

            // Set UI
            if (result.category) {
                // select option
                const optionExists = Array.from(categorySelect.options).some(opt => opt.value === result.category);
                if (optionExists) {
                    categorySelect.value = result.category;
                } else {
                    categorySelect.value = "その他";
                }
            }

            // Save result for the final output display
            window.latestCategorizationResult = result;

        } catch (e) {
            console.error("JSON Parse Error", resultText, e);
            throw new Error(`AIが不正な形式を返しました: ${e.message}`);
        }
    }

    // --- Flow 2: Generate Reply ---
    generateBtn.addEventListener('click', async () => {
        const rawEmail = emailBodyInput.value.trim();
        if (!rawEmail) {
            showToast('受信メール本文を入力してください');
            return;
        }

        const category = categorySelect.value;
        if (!category) {
            showToast('問い合わせカテゴリを選択するか、自動判定を実行してください');
            return;
        }

        const tone = toneSelect.value;
        const additional = additionalInstructionInput.value.trim();

        // Show loading
        emptyState.classList.add('hidden');
        resultContent.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingText.textContent = '返信文を生成しています...';
        generateBtn.disabled = true;

        try {
            const processedEmail = preprocessEmailBody(rawEmail);
            await runGeneration(processedEmail, category, tone, additional);

            // Display categorization info if available
            if (window.latestCategorizationResult) {
                resCategory.textContent = window.latestCategorizationResult.category;

                resConfidence.className = 'confidence-badge ' + window.latestCategorizationResult.confidence;

                let confJp = "高";
                if (window.latestCategorizationResult.confidence === "medium") confJp = "中";
                if (window.latestCategorizationResult.confidence === "low") confJp = "低";

                resConfidence.textContent = `確信度: ${confJp}`;
                resReason.textContent = window.latestCategorizationResult.reason;
            } else {
                resCategory.textContent = category;
                resConfidence.className = 'confidence-badge hidden';
                resReason.textContent = '手動選択または判定情報なし';
            }

            loadingOverlay.classList.add('hidden');
            resultContent.classList.remove('hidden');

            // Send Usage Log
            logUsage({
                feature: '返信作成',
                category: category,
                tone: tone,
                inputContent: processedEmail,
                additionalInstruction: additional,
                generatedSubject: resSubject.textContent,
                generatedBody: resBody.textContent
            });

            showToast('返信文を生成しました');

            // Scroll to top
            document.querySelector('.output-panel .panel-body').scrollTop = 0;

        } catch (error) {
            loadingOverlay.classList.add('hidden');
            emptyState.classList.remove('hidden');
            alert('生成エラー: ' + error.message);
        } finally {
            generateBtn.disabled = false;
        }
    });

    async function runGeneration(emailBody, category, tone, additionalInstruction) {
        const prompt = `あなたは企業のカスタマーサポート・営業担当者です。
以下の受信メールに対する返信メール文案を作成してください。

### 条件
* ビジネスメールとして自然な日本語
* 指定トーンに合わせる
* 丁寧な敬語
* 長すぎない（必要十分）
* 推測で断定しない
* 不足情報があれば質問として明確に記載

### 出力フォーマット（厳守）
件名案：
本文：

### 挨拶（必ず冒頭に入れる）
お世話になっております。

### 締め（必ず入れる）
何卒よろしくお願いいたします。

### 署名（必ず末尾に追加）
${config.signature}

### 問い合わせカテゴリ
${category}

### 返信トーン
${tone}

### 追加指示
${additionalInstruction || '特になし'}

### 受信メール
## ${emailBody}`;

        const resultText = await callGeminiApi(prompt);

        // Parse the result
        // We expect "件名案：" and "本文："
        let subject = "返信の件名（生成に失敗しました）";
        let body = resultText; // Default fallback

        const subjectMatch = resultText.match(/件名案[：:]\s*(.*?)\n/);
        if (subjectMatch) {
            subject = subjectMatch[1].trim();
        }

        const bodyMatch = resultText.split(/本文[：:]\s*\n?/);
        if (bodyMatch.length > 1) {
            body = bodyMatch.slice(1).join("本文：").trim(); // In case "本文：" appears again
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

            showToast('本文をクリップボードにコピーしました');
        } catch (err) {
            console.error('Failed to copy: ', err);
            alert('コピーに失敗しました。ブラウザの権限を確認してください。');
        }
    });

    // UX Enhancements
    let hasCategorized = false;
    emailBodyInput.addEventListener('change', () => {
        if (!hasCategorized && emailBodyInput.value.length > 10 && config.apiKey) {
            hasCategorized = true;
            autoCategorizeBtn.click();
        }
    });
});
