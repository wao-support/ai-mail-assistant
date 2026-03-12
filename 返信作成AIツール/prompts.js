/**
 * AIメールアシスタント - プロンプト置き場 ロジック
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const showPostFormBtn = document.getElementById('showPostFormBtn');
    const cancelPostBtn = document.getElementById('cancelPostBtn');
    const postFormContainer = document.getElementById('postFormContainer');
    const promptPostForm = document.getElementById('promptPostForm');

    const filterDepartment = document.getElementById('filterDepartment');
    const filterCategory = document.getElementById('filterCategory');
    const promptsGrid = document.getElementById('promptsGrid');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorIndicator = document.getElementById('errorIndicator');

    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const promptGasUrlInput = document.getElementById('promptGasUrlInput');
    const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');

    // モーダル関連 (プロンプト詳細)
    const promptDetailModal = document.getElementById('promptDetailModal');
    const closePromptDetailBtn = document.getElementById('closePromptDetailBtn');
    const closePromptDetailFooterBtn = document.getElementById('closePromptDetailFooterBtn');
    const detailPromptTitle = document.getElementById('detailPromptTitle');
    const detailPromptDept = document.getElementById('detailPromptDept');
    const detailPromptCat = document.getElementById('detailPromptCat');
    const detailPromptAuthor = document.getElementById('detailPromptAuthor');
    const detailPromptDate = document.getElementById('detailPromptDate');
    const detailPromptText = document.getElementById('detailPromptText');
    const detailPromptCopyBtn = document.getElementById('detailPromptCopyBtn');
    let currentDetailPromptText = ''; // モーダル内のコピーボタン用

    // --- State ---
    let allPrompts = [];
    let currentDepartment = 'ALL';
    let currentCategory = 'ALL';

    // config.promptGasUrl を使用してリクエストを送信するため、保存領域を準備
    const config = {
        apiKey: localStorage.getItem('ai_mail_assistant_api_key') || '',
        promptGasUrl: localStorage.getItem('ai_mail_assistant_prompt_gas_url') || 'https://script.google.com/macros/s/AKfycbymHzOHxK6zxLVFi6_WijtJhySPk9KHOz6UEadpuOX7h5vYCsSu5kn-1vmsuUSN2b38/exec'
    };

    // --- Initialization ---
    initSettings();
    loadPrompts();

    // --- Event Listeners ---

    // フォーム表示切り替え
    showPostFormBtn.addEventListener('click', () => {
        postFormContainer.style.display = 'block';
        showPostFormBtn.style.display = 'none';
        document.getElementById('postTitle').focus();
    });

    cancelPostBtn.addEventListener('click', () => {
        postFormContainer.style.display = 'none';
        showPostFormBtn.style.display = 'inline-flex';
        promptPostForm.reset();
    });

    // フィルターの変更イベント
    filterDepartment.addEventListener('change', (e) => {
        currentDepartment = e.target.value;
        renderPrompts();
    });

    filterCategory.addEventListener('change', (e) => {
        currentCategory = e.target.value;
        renderPrompts();
    });

    // フォーム送信（プロンプト投稿）
    promptPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!config.promptGasUrl) {
            showError('プロンプト保存用URL（設定画面）が入力されていません。', true);
            settingsModal.style.display = 'flex';
            return;
        }

        const submitBtn = document.getElementById('submitPostBtn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 送信中...';
        submitBtn.disabled = true;

        const postData = {
            title: document.getElementById('postTitle').value,
            department: document.getElementById('postDepartment').value,
            category: document.getElementById('postCategory').value,
            author: document.getElementById('postAuthor').value || '名無しさん',
            content: document.getElementById('postContent').value
        };

        try {
            // URLSearchParams形式でPOST送信（GASのdoPostで受け取りやすいように）
            const params = new URLSearchParams();
            for (let key in postData) {
                params.append(key, postData[key]);
            }

            const response = await fetch(config.promptGasUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString()
            });

            const result = await response.json();

            if (result.status === 'success') {
                showNotification('プロンプトを投稿し、共有しました！');
                promptPostForm.reset();
                postFormContainer.style.display = 'none';
                showPostFormBtn.style.display = 'inline-flex';
                // 一覧を再読み込み
                loadPrompts();
            } else {
                throw new Error(result.message || '投稿に失敗しました');
            }
        } catch (error) {
            console.error('Post Error:', error);
            showNotification(`投稿エラー: ${error.message}`, true);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    // --- Settings Modal Handlers ---
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });

    closeBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    toggleApiKeyVisibility.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleApiKeyVisibility.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            apiKeyInput.type = 'password';
            toggleApiKeyVisibility.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        const newApiKey = apiKeyInput.value.trim();
        const newGasUrl = promptGasUrlInput.value.trim();

        localStorage.setItem('ai_mail_assistant_api_key', newApiKey);
        localStorage.setItem('ai_mail_assistant_prompt_gas_url', newGasUrl);

        config.apiKey = newApiKey;
        config.promptGasUrl = newGasUrl;

        settingsModal.style.display = 'none';
        showNotification('設定を保存しました');

        // GAS URLが設定された場合は一覧を再読み込み
        if (newGasUrl) {
            loadPrompts();
        }
    });

    // プロンプト詳細モーダルを閉じる処理
    const closePromptModal = () => {
        promptDetailModal.style.display = 'none';
        currentDetailPromptText = '';
    };

    closePromptDetailBtn.addEventListener('click', closePromptModal);
    closePromptDetailFooterBtn.addEventListener('click', closePromptModal);

    // 詳細モーダル外クリックで閉じる
    window.addEventListener('click', (e) => {
        if (e.target === promptDetailModal) {
            closePromptModal();
        }
    });

    // 詳細モーダル内のコピーボタン
    detailPromptCopyBtn.addEventListener('click', () => {
        if (!currentDetailPromptText) return;
        navigator.clipboard.writeText(currentDetailPromptText).then(() => {
            const originalHTML = detailPromptCopyBtn.innerHTML;
            detailPromptCopyBtn.innerHTML = '<i class="fa-solid fa-check"></i> コピーしました！';
            detailPromptCopyBtn.classList.add('copy-success');
            setTimeout(() => {
                detailPromptCopyBtn.innerHTML = originalHTML;
                detailPromptCopyBtn.classList.remove('copy-success');
            }, 2000);
        }).catch(err => {
            showNotification('クリップボードへのコピーに失敗しました', true);
        });
    });

    // --- Helper Functions ---

    function initSettings() {
        if (config.apiKey) {
            apiKeyInput.value = config.apiKey;
        }
        if (config.promptGasUrl) {
            promptGasUrlInput.value = config.promptGasUrl;
        }

        // GAS URLが未設定の場合は設定画面を促す
        if (!config.promptGasUrl) {
            showError('プロンプト一覧を表示するには、設定（左下）から「プロンプト管理用 GAS URL」を入力してください。', false);
            // 投稿ボタンも無効化
            showPostFormBtn.disabled = true;
            showPostFormBtn.style.opacity = '0.5';
            showPostFormBtn.title = 'まずは左下から設定を行ってください';
        }
    }

    /**
     * GASからプロンプト一覧を取得する
     */
    async function loadPrompts() {
        if (!config.promptGasUrl) {
            promptsGrid.innerHTML = '';
            return;
        }

        loadingIndicator.style.display = 'block';
        errorIndicator.style.display = 'none';
        promptsGrid.innerHTML = '';
        showPostFormBtn.disabled = false;
        showPostFormBtn.style.opacity = '1';

        try {
            const response = await fetch(config.promptGasUrl);
            const data = await response.json();

            if (data.status === 'error') {
                throw new Error(data.message);
            }

            allPrompts = data;

            if (allPrompts.length === 0) {
                showError('まだプロンプトが投稿されていません。ぜひ最初のプロンプトを投稿してください！', false);
            } else {
                renderPrompts();
            }

        } catch (error) {
            console.error('Load Error:', error);
            showError(`データの読み込みに失敗しました。URLが正しいか確認してください。<br>エラー詳細: ${error.message}`, true);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    /**
     * 取得したプロンプトデータからカードを生成して表示する
     */
    function renderPrompts() {
        promptsGrid.innerHTML = '';

        const filteredPrompts = allPrompts.filter(p => {
            const matchDept = currentDepartment === 'ALL' || p.department === currentDepartment;
            const matchCat = currentCategory === 'ALL' || p.category === currentCategory;
            return matchDept && matchCat;
        });

        if (filteredPrompts.length === 0) {
            promptsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">条件に一致するプロンプトがありません。</div>';
            return;
        }

        filteredPrompts.forEach((prompt, index) => {
            const card = document.createElement('div');
            card.className = 'prompt-card';

            const deptText = prompt.department || '全社';
            const catText = prompt.category || 'その他';

            card.innerHTML = `
                <div class="prompt-header">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <span class="badge badge-gray"><i class="fa-solid fa-building" style="margin-right:0.25rem;"></i>${escapeHTML(deptText)}</span>
                        <span class="badge badge-blue"><i class="fa-solid fa-tag" style="margin-right:0.25rem;"></i>${escapeHTML(catText)}</span>
                    </div>
                    <span class="prompt-date" style="margin-left: auto;">${escapeHTML(prompt.date || '')}</span>
                </div>
                <h3 class="prompt-title">${escapeHTML(prompt.title)}</h3>
                <div class="prompt-author"><i class="fa-solid fa-user"></i> ${escapeHTML(prompt.author || '名無しさん')}</div>
                <div class="prompt-content-preview">
                    <pre>${escapeHTML(prompt.content)}</pre>
                </div>
                <div class="prompt-actions">
                    <button class="copy-prompt-btn" data-index="${index}">
                        <i class="fa-solid fa-copy"></i> テキストをコピー
                    </button>
                    <!-- 将来的にここに「そのままメール作成」ボタン等を追加可能 -->
                </div>
            `;

            // カード全体をクリックしたときの処理
            card.addEventListener('click', () => {
                detailPromptTitle.textContent = prompt.title;
                detailPromptDept.innerHTML = `<i class="fa-solid fa-building" style="margin-right:0.25rem;"></i>${escapeHTML(deptText)}`;
                detailPromptCat.innerHTML = `<i class="fa-solid fa-tag" style="margin-right:0.25rem;"></i>${escapeHTML(catText)}`;
                detailPromptAuthor.innerHTML = `<i class="fa-solid fa-user"></i> ${escapeHTML(prompt.author || '名無しさん')}`;
                detailPromptDate.textContent = prompt.date || '';
                detailPromptText.textContent = prompt.content;
                currentDetailPromptText = prompt.content;

                promptDetailModal.style.display = 'flex';
            });

            promptsGrid.appendChild(card);
        });

        // コピーボタンのイベントリスナーを設定
        document.querySelectorAll('.copy-prompt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // カード自体のクリックイベント（モーダルを開く）を抑止

                const idx = e.currentTarget.dataset.index;
                const textToCopy = filteredPrompts[idx].content;

                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalHTML = e.currentTarget.innerHTML;
                    e.currentTarget.innerHTML = '<i class="fa-solid fa-check"></i> コピーしました！';
                    e.currentTarget.classList.add('copy-success');

                    setTimeout(() => {
                        e.currentTarget.innerHTML = originalHTML;
                        e.currentTarget.classList.remove('copy-success');
                    }, 2000);
                }).catch(err => {
                    console.error('コピー失敗:', err);
                    showNotification('クリップボードへのコピーに失敗しました', true);
                });
            });
        });
    }

    /**
     * エラーメッセージ等を表示するエリア
     */
    function showError(message, isError = true) {
        errorIndicator.style.display = 'block';
        errorIndicator.innerHTML = message;

        if (isError) {
            errorIndicator.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            errorIndicator.style.color = 'var(--error)';
            errorIndicator.style.border = '1px solid var(--error)';
        } else {
            errorIndicator.style.backgroundColor = 'var(--surface-color)';
            errorIndicator.style.color = 'var(--text-main)';
            errorIndicator.style.border = '1px solid var(--border-color)';
        }
    }

    /**
     * 画面右下への通知ポップアップ
     */
    function showNotification(message, isError = false) {
        const notificationArea = document.getElementById('notificationArea');
        const notification = document.createElement('div');
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.innerHTML = `
            <i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-check'}"></i>
            <span>${message}</span>
        `;

        notificationArea.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notificationArea.removeChild(notification);
            }, 300);
        }, 3000);
    }

    /**
     * クロスサイトスクリプティング対策
     */
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
