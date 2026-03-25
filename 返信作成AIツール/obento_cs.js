document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    const emailBodyInput = document.getElementById('emailBody');
    const companyNameInput = document.getElementById('companyName');
    const recipientNameInput = document.getElementById('recipientName');
    const policySelect = document.getElementById('policySelect');
    const policyDetailInput = document.getElementById('policyDetail');
    const useFaqCheck = document.getElementById('useFaq');
    const usePastLogCheck = document.getElementById('usePastLog');
    const toneSelect = document.getElementById('toneSelect');
    const generateBtn = document.getElementById('generateBtn');

    const emptyState = document.getElementById('emptyState');
    const resultContent = document.getElementById('resultContent');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const resSubjectEl = document.getElementById('resSubject');
    const resBodyEl = document.getElementById('resBody');
    const copyBtn = document.getElementById('copyBtn');

    const resPolicyEl = document.getElementById('resPolicy');
    const resFaqUsedEl = document.getElementById('resFaqUsed');
    const resLogUsedEl = document.getElementById('resLogUsed');

    const settingsModal = document.getElementById('settingsModal');
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const signatureTextInput = document.getElementById('signatureText');
    const staffNameInput = document.getElementById('staffName');

    // Default CS Signature
    const defaultCsSignature = `--------------------------------
お弁当デリ カスタマーサポート窓口
https://obentodeli.jp/
Email: support@obentodeli.jp
--------------------------------`;

    // GAS Proxy URL (manages Gemini API key server-side)
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbzLW95iIn44aujvazfOQGHbjivlHKyGzr0pdljOJmNclZ7C-w6Yeobb1GOwZ9BI6KieDQ/exec';

    let config = {
        signature: localStorage.getItem('geminiSignature') || defaultCsSignature,
        staffName: localStorage.getItem('staffName') || ''
    };

    // Initialize
    signatureTextInput.value = config.signature;
    staffNameInput.value = config.staffName;

    // FAQ Data Cache
    let cachedFaqText = "";
    async function getFaqData() {
        if (cachedFaqText) return cachedFaqText;
        try {
            const res = await fetch('faq.txt');
            if (res.ok) {
                cachedFaqText = await res.text();
            } else {
                console.warn("Failed to load faq.txt: HTTP", res.status);
            }
        } catch (e) {
            console.warn("Failed to fetch faq.txt:", e);
        }
        return cachedFaqText;
    }

    // Past Log Data Cache
    let cachedPastLogText = "";
    async function getPastLogData() {
        if (cachedPastLogText) return cachedPastLogText;
        try {
            const res = await fetch('past_logs.txt');
            if (res.ok) {
                cachedPastLogText = await res.text();
            } else {
                console.warn("Failed to load past_logs.txt: HTTP", res.status);
            }
        } catch (e) {
            console.warn("Failed to fetch past_logs.txt:", e);
        }
        return cachedPastLogText;
    }

    // --- Settings Modal Logic ---
    function openSettings() { settingsModal.classList.remove('hidden'); }
    function closeSettings() { settingsModal.classList.add('hidden'); }
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });

    saveSettingsBtn.addEventListener('click', () => {
        const sig = signatureTextInput.value.trim();
        config.signature = sig || defaultCsSignature;
        config.staffName = staffNameInput.value.trim();
        localStorage.setItem('geminiSignature', config.signature);
        localStorage.setItem('staffName', config.staffName);
        showToast('設定を保存しました');
        closeSettings();
    });

    // --- Loading & Toast ---
    function showToast(message) {
        let toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // --- Preprocessing ---
    function preprocessEmailBody(text) {
        if (!text) return "";
        let pText = text.replace(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*/g, '[EMAIL]');
        pText = pText.replace(/\b\d{2,4}[-(]?\d{2,4}[-)]?\d{3,4}\b/g, '[TEL]');
        pText = pText.replace(/\b(?:\d[- ]*){13,16}\b/g, '[CREDIT_CARD]');
        return pText;
    }

    // --- AI Integration (via GAS Proxy) ---
    async function callGeminiViaGas(prompt, temperature = 0.3) {
        const params = new URLSearchParams({
            action: 'gemini',
            prompt: prompt,
            temperature: temperature.toString()
        });

        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: params
        });

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
            await fetch(GAS_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: params
            });
        } catch (error) {
            console.error('Failed to send usage log', error);
        }
    }

    // --- Flow: Generate CS Reply ---
    generateBtn.addEventListener('click', async () => {
        const rawEmail = emailBodyInput.value.trim();
        if (!rawEmail) {
            showToast('受信メール本文を入力してください');
            return;
        }

        const companyName = companyNameInput.value.trim();
        const recipientName = recipientNameInput.value.trim();
        const selectedPolicyType = policySelect.value;
        const policyDetail = policyDetailInput.value.trim();
        const tone = toneSelect.value;
        const useFaq = useFaqCheck.checked;
        const usePastLog = usePastLogCheck.checked;

        emptyState.classList.add('hidden');
        resultContent.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        generateBtn.disabled = true;

        try {
            const processedEmail = preprocessEmailBody(rawEmail);

            let recipientParts = [];
            if (companyName) recipientParts.push(companyName);
            if (recipientName) recipientParts.push(recipientName);
            const recipientHeader = recipientParts.join("\\n");

            let prompt = `あなたは「お弁当デリ」のカスタマーサポート担当者です。
お客様からの受信メールの内容を分析し、**自動で問い合わせのカテゴリを判定**した上で、適切なカスタマーサポートの返信メールを作成してください。

### 条件
* コールセンターとしての丁寧な敬語・クッション言葉を使用
* 指定トーン「${tone}」に合わせる
* 不確かな約束による補償・返金確約は行わない
* 推測で断りきれない場合や不明点がある場合は、確認の要素を入れる
* **「拝啓」「敬具」「前略」「草々」などの頭語・結語は絶対に使用しないでください**

### メールの構成ルール
1. 宛名：
${recipientHeader ? recipientHeader : "（入力された宛名なし。一般的な宛名として作成してください。）"}
2. 固定の挨拶文：必ず以下の2行から始めること。
平素は大変お世話になっております。
お弁当デリ事務局でございます。
3. 本文の展開
4. 結びの言葉`;

            if (selectedPolicyType || policyDetail) {
                prompt += `\n\n### 特に重視する対応方針・指示事項\n`;
                if (selectedPolicyType === "確認") prompt += `【確認】：お客様への事実確認や、情報不足を丁寧に質問してください。\n`;
                if (selectedPolicyType === "了解") prompt += `【了解】：ご要望を承諾した旨を伝え、手配進行や完了を伝えてください。\n`;
                if (selectedPolicyType === "拒否") prompt += `【拒否】：理由を添えてご要望に対し丁重にお断りし、対応不可である旨を伝えてください。\n`;
                if (policyDetail) prompt += `【具体的な指示内容】：${policyDetail}\n`;
            }

            prompt += `
### 出力フォーマット（厳守）
【判定カテゴリ】: （※「注文・変更・キャンセル」「配送・遅延・未着」「商品不良・異物混入」「請求・領収書・支払い」「その他」の中から1つ選んで出力）
【件名案】:
【本文】:

### 署名（必ず末尾に追加）
${config.signature}
`;

            if (useFaq) {
                const faqDataText = await getFaqData();
                prompt += `\n### 参照：FAQデータ\n以下のFAQ情報を参考に、正しい仕様やルールを案内してください。\n${faqDataText || "（※FAQデータが見つかりませんでした）"}\n`;
            }

            if (usePastLog) {
                const pastLogDataText = await getPastLogData();
                prompt += `\n### 参照：過去の類似対応\n以下の過去の対応ログのトーンや言葉遣い、クッション言葉の使い方などを参考にしてください。\n${pastLogDataText || "（※過去ログが見つかりませんでした）"}\n`;
            }

            prompt += `\n### お客様からの受信メール\n## ${processedEmail}`;

            const resultText = await callGeminiViaGas(prompt, 0.3);

            // Parse result
            let category = "その他";
            let subject = "Re: お問い合わせにつきまして";
            let body = resultText;

            const categoryMatch = resultText.match(/【判定カテゴリ】[：:]\s*(.*?)(?:\n|$)/);
            if (categoryMatch) category = categoryMatch[1].trim();

            const subjectMatch = resultText.match(/【件名案】[：:]\s*(.*?)(?:\n|$)/);
            if (subjectMatch) subject = subjectMatch[1].trim();

            const bodySplit = resultText.split(/【本文】[：:]\s*\n?/);
            if (bodySplit.length > 1) {
                body = bodySplit.slice(1).join("【本文】：").trim();
            } else {
                body = resultText.replace(/【判定カテゴリ】.*?\n/g, '').replace(/【件名案】.*?\n/g, '').trim();
            }

            // Set UI
            resSubjectEl.textContent = subject;
            resBodyEl.innerHTML = formatBodyText(body);

            let policyText = "-";
            if (selectedPolicyType) policyText = selectedPolicyType;
            if (policyDetail) policyText += ` (${policyDetail})`;
            resPolicyEl.innerHTML = `${policyText}<br>- 判定カテゴリ: <strong>${category}</strong>`;
            resFaqUsedEl.textContent = useFaq ? "使用した" : "使用していない";
            resLogUsedEl.textContent = usePastLog ? "使用した" : "使用していない";

            loadingOverlay.classList.add('hidden');
            resultContent.classList.remove('hidden');

            logUsage({
                feature: 'CS返信（お弁当デリ）',
                category: category,
                tone: tone,
                inputContent: processedEmail,
                additionalInstruction: [selectedPolicyType, policyDetail].filter(Boolean).join(' / '),
                generatedSubject: subject,
                generatedBody: resBodyEl.innerText
            });

            showToast('CS用返信文を生成しました');
            document.querySelector('.output-panel .panel-body').scrollTop = 0;

        } catch (error) {
            console.error(error);
            loadingOverlay.classList.add('hidden');
            emptyState.classList.remove('hidden');
            alert('生成エラー: ' + error.message);
        } finally {
            generateBtn.disabled = false;
        }
    });

    // --- Utility Formatting & Copy ---
    function formatBodyText(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
    }

    copyBtn.addEventListener('click', async () => {
        let textToCopy = resBodyEl.innerText.replace(/\n\n+/g, '\n');
        try {
            await navigator.clipboard.writeText(textToCopy);
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
            alert('コピーに失敗しました。');
        }
    });
});
