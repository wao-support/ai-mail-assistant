document.addEventListener('DOMContentLoaded', () => {
    // ==== State ====
    let apiUrl = 'https://script.google.com/macros/s/AKfycbxsQKmqMCNvWu9kjWQ_38tBEjETQSOcDm53m1YVrUZt6npxBmKM92wSwMF16AXwOoqg/exec';
    try { apiUrl = localStorage.getItem('depachika_api_url') || apiUrl; } catch(e) {}
    let globalData = []; // スプレッドシートの全データ
    let currentDepartment = null;
    let pendingSaves = {}; // row_indexに対するタイムアウトIDを保持

    // ==== DOM Elements ====
    const btnSettings = document.getElementById('settings-btn');
    const modalSettings = document.getElementById('settings-modal');
    const inputApiUrl = document.getElementById('api-url-input');
    const btnSaveSettings = document.getElementById('save-settings-btn');
    const btnCloseSettings = document.getElementById('close-settings-btn');

    const screenDepartment = document.getElementById('department-screen');
    const screenStore = document.getElementById('store-screen');
    const listDepartment = document.getElementById('department-list');
    const listStore = document.getElementById('store-list');
    
    const headerTitle = document.getElementById('header-title');
    const btnBack = document.getElementById('back-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    const filterBtns = document.querySelectorAll('.filter-btn');

    // ==== Initialization ====
    if (!apiUrl) {
        modalSettings.classList.remove('hidden');
    } else {
        fetchData();
    }

    // ==== Settings Flow ====
    btnSettings.addEventListener('click', () => {
        inputApiUrl.value = apiUrl;
        modalSettings.classList.remove('hidden');
    });
    
    btnCloseSettings.addEventListener('click', () => {
        if(apiUrl) modalSettings.classList.add('hidden');
    });

    btnSaveSettings.addEventListener('click', () => {
        const val = inputApiUrl.value.trim();
        if (val) {
            apiUrl = val;
            localStorage.setItem('depachika_api_url', apiUrl);
            modalSettings.classList.add('hidden');
            fetchData();
        } else {
            alert('URLを入力してください');
        }
    });

    // ==== API & Data Logging ====
    async function fetchData() {
        showLoading(true);
        try {
            const res = await fetch(`${apiUrl}?t=${Date.now()}`); // キャッシュ回避
            if (!res.ok) throw new Error('Network error');
            const data = await res.json();
            globalData = data.rows || [];
            
            // スプレッドシートの列名が日本語の場合のフォールバック
            globalData.forEach(row => {
                if(!row.department_store && row['百貨店一覧']) row.department_store = row['百貨店一覧'];
                if(!row.brand_name && row['ブランド一覧']) row.brand_name = row['ブランド一覧'];
            });

            renderDepartmentList();
            showLoading(false);
        } catch (e) {
            console.error(e);
            alert('データの取得に失敗しました。URLが正しいか確認してください。');
            showLoading(false);
        }
    }

    async function saveStoreData(row) {
        const rowIndex = row.row_index;
        
        // 状態を「保存中」に更新
        updateCardStatus(rowIndex, 'saving', '保存中...');
        
        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(row)
            });
            const result = await res.json();
            
            if (result.success) {
                row.updated_at = result.updated_at; // 最新の更新日時を反映
                updateCardStatus(rowIndex, 'completed', '保存済み');
            } else {
                throw new Error(result.error);
            }
        } catch (e) {
            console.error(e);
            updateCardStatus(rowIndex, 'error', '保存失敗');
        }
    }

    // ==== UI Renderers ====
    function showLoading(show) {
        if (show) {
            loadingOverlay.classList.remove('hidden');
            listDepartment.innerHTML = '';
        } else {
            loadingOverlay.classList.add('hidden');
        }
    }

    function isRowCompleted(row) {
        // すべての入力項目が埋まる必要はないが、いくつか入力されていれば「保存済み」とする基準
        // 要件にあわせるなら「updated_at」が存在するかで判定
        return !!row.updated_at;
    }

    function renderDepartmentList() {
        listDepartment.innerHTML = '';
        const deps = {};
        
        // 百貨店ごとにグループ化とカウント計算
        globalData.forEach(row => {
            const depName = row.department_store || '未設定百貨店';
            if (!deps[depName]) {
                deps[depName] = { total: 0, completed: 0, rows: [] };
            }
            deps[depName].total++;
            deps[depName].rows.push(row);
            if (isRowCompleted(row)) {
                deps[depName].completed++;
            }
        });

        const tpl = document.getElementById('tpl-department').content;
        
        for (const [depName, info] of Object.entries(deps)) {
            const clone = document.importNode(tpl, true);
            clone.querySelector('.dep-name').textContent = depName;
            clone.querySelector('.dep-progress').textContent = `${info.completed} / ${info.total} 入力済み`;
            
            const btn = clone.querySelector('.department-btn');
            btn.addEventListener('click', () => {
                openStoreList(depName, info.rows);
            });
            listDepartment.appendChild(clone);
        }
    }

    function openStoreList(depName, rows) {
        currentDepartment = { name: depName, rows: rows };
        
        headerTitle.textContent = depName;
        btnBack.classList.remove('hidden');
        
        screenDepartment.classList.remove('active');
        screenStore.classList.add('active');
        
        // フィルタ初期化
        document.querySelector('.filter-btn.active').classList.remove('active');
        document.querySelector('[data-filter="all"]').classList.add('active');
        
        renderStoreList('all');
    }

    btnBack.addEventListener('click', () => {
        // 百貨店選択画面へ戻る際、最新のカウンター状態を反映するため再計算
        renderDepartmentList();
        
        headerTitle.textContent = '百貨店一覧';
        btnBack.classList.add('hidden');
        
        screenStore.classList.remove('active');
        screenDepartment.classList.add('active');
        currentDepartment = null;
    });

    // ==== Store List & Card logic ====
    function renderStoreList(filterMode) {
        listStore.innerHTML = '';
        const tpl = document.getElementById('tpl-store-card').content;
        
        currentDepartment.rows.forEach(row => {
            const completed = isRowCompleted(row);
            
            // フィルタ適用
            if (filterMode === 'pending' && completed) return;
            if (filterMode === 'completed' && !completed) return;
            
            const clone = document.importNode(tpl, true);
            const card = clone.querySelector('.store-card');
            card.dataset.rowIndex = row.row_index;
            
            // 初期状態
            card.dataset.status = completed ? 'completed' : 'pending';
            clone.querySelector('.status-badge').textContent = completed ? '保存済み' : '未入力';
            
            clone.querySelector('.brand-name').textContent = row.brand_name || '名前なし店舗';
            
            // 各フィールドへの値埋め込み
            if(row.segment) {
                const chip = clone.querySelector(`.chip-group[data-field="segment"] .chip[data-val="${row.segment}"]`);
                if(chip) chip.classList.add('selected');
            }
            if(row.has_bento) {
                const rbtn = clone.querySelector(`.radio-btn-group[data-field="has_bento"] .radio-btn[data-val="${row.has_bento}"]`);
                if(rbtn) rbtn.classList.add('selected');
            }
            
            const minInput = clone.querySelector('.price-input[data-field="price_min"]');
            const maxInput = clone.querySelector('.price-input[data-field="price_max"]');
            const countInput = clone.querySelector('.count-input[data-field="item_count"]');
            
            if(row.price_min) minInput.value = row.price_min;
            if(row.price_max) maxInput.value = row.price_max;
            if(row.item_count) countInput.value = row.item_count;

            // イベントバインド
            bindCardEvents(card, row);

            listStore.appendChild(clone);
        });
    }

    // フィルタ切り替え
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('.filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            renderStoreList(e.target.dataset.filter);
        });
    });

    function bindCardEvents(card, row) {
        // チップの選択
        card.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const group = e.target.closest('.chip-group');
                group.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
                e.target.classList.add('selected');
                
                row[group.dataset.field] = e.target.dataset.val;
                triggerSave(row, card);
            });
        });

        // ラジオボタンの選択
        card.querySelectorAll('.radio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const group = e.target.closest('.radio-btn-group');
                group.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                
                row[group.dataset.field] = e.target.dataset.val;
                triggerSave(row, card);
            });
        });

        // テキスト入力の監視 (デバウンス)
        const textInputs = card.querySelectorAll('input[type="number"]');
        textInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                // マイナスを防ぐ
                if(parseFloat(e.target.value) < 0) {
                    e.target.value = 0;
                }
                
                row[e.target.dataset.field] = e.target.value;
                
                // バリデーションチェック (価格の下限上限)
                const min = parseFloat(row.price_min);
                const max = parseFloat(row.price_max);
                const errEl = card.querySelector('.price-error');
                
                if(!isNaN(min) && !isNaN(max) && min > max) {
                    errEl.classList.remove('hidden');
                    return; // 保存しない
                } else {
                    errEl.classList.add('hidden');
                }

                triggerSave(row, card);
            });
        });
    }

    function triggerSave(row, card) {
        const rowIndex = row.row_index;
        
        card.dataset.status = 'pending';
        card.querySelector('.status-badge').textContent = '入力中...';

        // 既存のタイマーをクリア
        if (pendingSaves[rowIndex]) {
            clearTimeout(pendingSaves[rowIndex]);
        }

        // 約1秒後に保存処理を実行
        pendingSaves[rowIndex] = setTimeout(() => {
            saveStoreData(row);
        }, 1000);
    }

    function updateCardStatus(rowIndex, statusStr, labelTxt) {
        const card = document.querySelector(`.store-card[data-row-index="${rowIndex}"]`);
        if (card) {
            card.dataset.status = statusStr;
            card.querySelector('.status-badge').textContent = labelTxt;
        }
    }
});
