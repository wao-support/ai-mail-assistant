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
    const proxyTokenInput = document.getElementById('proxyToken');
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
        proxyToken: localStorage.getItem('proxyToken') || '',
        model: 'gemini-2.5-flash',
        signature: localStorage.getItem('geminiSignature') || defaultSignature,
        gasUrl: localStorage.getItem('gasUrl') || 'https://script.google.com/macros/s/AKfycbzLW95iIn44aujvazfOQGHbjivlHKyGzr0pdljOJmNclZ7C-w6Yeobb1GOwZ9BI6KieDQ/exec',
        staffName: localStorage.getItem('staffName') || ''
    };

    // Initialize
    if (!config.proxyToken) {
        openSettings();
    }
    proxyTokenInput.value = config.proxyToken;
    signatureTextInput.value = config.signature;
    staffNameInput.value = config.staffName;

    // --- Settings Modal Logic ---
    function openSettings() {
        settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
        if (!config.proxyToken) {
            showToast('アクセストークンが設定されていません。機能が制限されます。');
        }
        settingsModal.classList.add('hidden');
    }

    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);

    saveSettingsBtn.addEventListener('click', () => {
        const token = proxyTokenInput.value.trim();
        const sig = signatureTextInput.value.trim();
        if (token) {
            config.proxyToken = token;
            config.signature = sig || defaultSignature;
            config.staffName = staffNameInput.value.trim();

            localStorage.setItem('proxyToken', token);
            localStorage.setItem('geminiSignature', config.signature);
            localStorage.setItem('staffName', config.staffName);

            showToast('設定を保存しました');
            closeSettings();
        } else {
            alert('アクセストークンを入力してください');
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

    // --- AI Integration (GASプロキシ経由) ---
    async function callGeminiApi(prompt, systemInstruction = null) {
        if (!config.proxyToken) {
            throw new Error('アクセストークンが設定されていません。右上の設定アイコンから設定してください。');
        }

        const params = new URLSearchParams({
            action: 'gemini',
            token: config.proxyToken,
            prompt: prompt,
            temperature: '0.2'
        });
        if (systemInstruction) {
            params.append('systemInstruction', systemInstruction);
        }

        const response = await fetch(config.gasUrl, {
            method: 'POST',
            body: params
        });

        if (!response.ok) {
            throw new Error(`通信エラー: ${response.status}`);
        }

        const data = await response.json();
        if (data.status !== 'success') {
            throw new Error(data.message || 'API呼び出しに失敗しました');
        }
        return data.text;
    }

    // --- AI Integration (GASプロキシ経由・非ストリーミング) ---
    async function streamGeminiApi(prompt, onToken, systemInstruction = null) {
        const text = await callGeminiApi(prompt, systemInstruction);
        onToken(text);
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

            // Display categorization info early so user sees context immediately
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

            // Hide loading early, show result container so we can stream into it
            loadingOverlay.classList.add('hidden');
            resultContent.classList.remove('hidden');

            resSubject.textContent = "考え中...";
            resBody.textContent = "";

            await runGeneration(processedEmail, category, tone, additional);

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
* 受信メールの文章・表現をそのまま引用・繰り返さない
* 受信内容の要約や言い換えは最小限にとどめ、こちらからの返答・対応を中心に書く

### 出力フォーマット（厳守）
件名案：
本文：

### 挨拶（必ず冒頭に入れる）
お世話になっております。ワオ株式会社の${config.staffName || '◯◯'}です。

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

        let resultBuffer = "";

        await streamGeminiApi(prompt, (text) => {
            resultBuffer += text;

            // Try separating subject and body in real-time
            const bodySplit = resultBuffer.split(/本文[：:]\s*\n?/);
            if (bodySplit.length > 1) {
                // Body has started
                const subjectPart = bodySplit[0];
                const subjectMatch = subjectPart.match(/件名案[：:]\s*([^\n]*)/);
                if (subjectMatch) {
                    resSubject.textContent = subjectMatch[1].trim();
                } else {
                    resSubject.textContent = subjectPart.replace(/件名案[：:].*?\n/, '').trim();
                }
                resBody.textContent = bodySplit.slice(1).join("本文：").trimStart();

                // Auto-scroll to bottom of output panel while streaming
                const panelBody = document.querySelector('.output-panel .panel-body');
                panelBody.scrollTop = panelBody.scrollHeight;
            } else {
                // Still generating subject or formatting
                const subjectMatch = resultBuffer.match(/件名案[：:]\s*([^\n]*)/);
                if (subjectMatch) {
                    resSubject.textContent = subjectMatch[1].trim();
                } else {
                    resSubject.textContent = "考え中...";
                }
                resBody.textContent = resultBuffer;
            }
        });

        // Final parsing cleanly just in case formatting got scrambled
        let subject = "返信の件名（生成に失敗しました）";
        let body = resultBuffer;

        const subjectMatch = resultBuffer.match(/件名案[：:]\s*(.*?)\n/);
        if (subjectMatch) {
            subject = subjectMatch[1].trim();
        }

        const bodyMatch = resultBuffer.split(/本文[：:]\s*\n?/);
        if (bodyMatch.length > 1) {
            body = bodyMatch.slice(1).join("本文：").trim();
        } else {
            body = resultBuffer.replace(/件名案[：:].*?\n/, '').trim();
        }

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
