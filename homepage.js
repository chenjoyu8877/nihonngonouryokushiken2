// 頁面載入完成後，執行
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('hashchange', renderHomePage);
    renderHomePage();
});

let globalConfig = null; // 儲存 config.json
let allListConfigs = {}; 

// ⭐️ 輔助函式：遞迴收集所有 list ID
function collectAllListConfigs(items) {
    if (!items) return;
    for (const item of items) {
        if (item.type === 'list' && item.enabled !== false) {
            allListConfigs[item.id] = { name: item.name, modes: item.modes };
        }
        if (item.type === 'category') {
            collectAllListConfigs(item.items);
        }
    }
}

// ⭐️ 輔助函式：異步載入外部 JSON 檔案 ⭐️
async function loadExternalConfig(path) {
    try {
        const response = await fetch(path + '?v=' + new Date().getTime());
        if (!response.ok) {
            console.error(`無法讀取外部配置: ${path}`, response.statusText);
            return []; 
        }
        return await response.json();
    } catch (error) {
        console.error(`載入外部配置失敗: ${path}`, error);
        return [];
    }
}

async function renderHomePage() {
    try {
        if (!globalConfig) {
            // 1. 讀取主 config.json
            const response = await fetch('config.json?v=' + new Date().getTime());
            if (!response.ok) {
                throw new Error('無法讀取 config.json');
            }
            let initialConfig = await response.json();
            
            // 2. ⭐️ 載入並合併外部配置 (模組化支援) ⭐️
            let finalCatalog = [];
            for (const item of initialConfig.catalog) {
                if (item.type === 'external_category' && item.path) {
                    console.log(`正在載入外部配置: ${item.path}`);
                    const externalItems = await loadExternalConfig(item.path);
                    finalCatalog.push(...externalItems);
                } else {
                    finalCatalog.push(item);
                }
            }
            initialConfig.catalog = finalCatalog; // 更新目錄
            globalConfig = initialConfig;
            document.title = globalConfig.siteTitle || '單字卡練習';
            
            // 3. 收集所有 List 設定 (供 quiz.js 使用)
            allListConfigs = {};
            collectAllListConfigs(globalConfig.catalog);
        }

        const container = document.getElementById('list-container');
        const mainTitle = document.getElementById('main-title');
        const breadcrumbs = document.getElementById('breadcrumbs');
        
        if (!container || !mainTitle || !breadcrumbs) return;

        // 4. 解析 URL Hash
        const path = window.location.hash.substring(1).split('/');
        
        let currentLevelItems = globalConfig.catalog;
        let currentCategory = null;
        let pathSegments = []; 
        let currentHash = '#';

        for (const segment of path) {
            if (segment === "") continue;
            const found = currentLevelItems.find(item => item.id === segment);
            if (found && found.type === 'category') {
                currentLevelItems = found.items;
                currentCategory = found;
                currentHash += segment + '/';
                pathSegments.push({ name: found.name, hash: currentHash.slice(0, -1) });
            } else {
                window.location.hash = '';
                return;
            }
        }

        // 5. 渲染標題與麵包屑
        mainTitle.textContent = currentCategory ? currentCategory.name : globalConfig.siteTitle;

        breadcrumbs.innerHTML = '<li><a href="#" onclick="window.location.hash=\'\'; return false;">首頁</a></li>';
        if (pathSegments.length > 0) {
            pathSegments.forEach((segment, index) => {
                const isActive = index === pathSegments.length - 1;
                breadcrumbs.innerHTML += `
                    <li>
                        ${isActive ? 
                            `<span>${segment.name}</span>` : 
                            `<a href="${segment.hash}">${segment.name}</a>`
                        }
                    </li>
                `;
            });
        }

        // 6. ⭐️ 渲染雙導航按鈕 (返回上一層 & 返回主選單) ⭐️
        let allHtml = ''; 
        if (currentCategory) { 
            let parentHash = '#'; 
            if (pathSegments.length > 1) {
                parentHash = pathSegments[pathSegments.length - 2].hash;
            }
            
            allHtml += `
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <a href="${parentHash}" class="option-button back-button" style="flex: 1; text-align: center; min-height: 50px; display: flex; align-items: center; justify-content: center;">
                        &larr; 返回上一層
                    </a>
                    <a href="#" onclick="window.location.hash=''; return false;" class="option-button back-button" style="flex: 1; text-align: center; min-height: 50px; display: flex; align-items: center; justify-content: center; background-color: #7f8c8d;">
                        🏠 返回主選單
                    </a>
                </div>
            `;
        }

        // 7. 渲染列表項目
        if (currentLevelItems) {
            for (const item of currentLevelItems) {
                
                if (item.enabled === false) continue;
                // 忽略尚未展開的外部配置佔位符 (如果載入失敗)
                if (item.type === 'external_category') continue;

                if (item.type === 'category') {
                    // --- 資料夾 (使用深色按鈕樣式) ---
                    const targetHash = (currentHash.substring(1) ? currentHash.substring(1) + '/' : '') + item.id;
                    
                    allHtml += `
                        <a href="javascript:void(0);" 
                           class="option-button list-button" 
                           data-action="navigate" 
                           data-item-id="${item.id}"
                           data-target-hash="${targetHash}"
                           style="text-align: center; margin-bottom: 10px; display: block; text-decoration: none; min-height: 50px; display: flex; align-items: center; justify-content: center;">
                            ${item.name}
                        </a>
                    `;
                } else if (item.type === 'list') {
                    // --- 單字庫 ---
                    
                    // 特殊處理：自選多庫入口 (紫色按鈕)
                    if (item.id === 'MULTI_SELECT_ENTRY') {
                        allHtml += `
                            <a href="quiz.html?list=${item.id}&mode_id=INITIATE_SELECT" 
                               class="option-button list-button mcq-mode" 
                               style="display: flex; justify-content: center; align-items: center; text-decoration: none; margin-bottom: 10px; min-height: 50px;">
                                ${item.name}
                            </a>
                        `;
                    } else {
                        // 一般單字庫 (保持白底卡片樣式 + 模式按鈕)
                        allHtml += `
                            <div class="list-item quiz-item">
                                <h4 class="list-name">${item.name}</h4>
                                <div class="button-group">
                        `;

                        if (item.modes && Array.isArray(item.modes)) {
                            for (const mode of item.modes) {
                                if (mode.enabled) {
                                    allHtml += `
                                        <button class="option-button ${mode.type}-mode" data-list-id="${item.id}" data-mode-id="${mode.id}" data-mode-type="${mode.type}">
                                            ${mode.name}
                                        </button>
                                    `;
                                }
                            }
                        }
                        allHtml += `</div></div>`;
                    }
                }
            }
        }
        
        container.innerHTML = allHtml;
        
        container.removeEventListener('click', handleHomePageClick); 
        container.addEventListener('click', handleHomePageClick); 

    } catch (error) {
        console.error('載入首頁設定失敗:', error);
        const container = document.getElementById('list-container');
        if (container) {
            container.innerHTML = `<p>載入設定檔失敗: ${error.message}</p>`;
        }
    }
}

// 8. 處理點擊事件
function handleHomePageClick(event) {
    const target = event.target.closest('.option-button');
    if (!target) return;

    const listId = target.dataset.listId;
    const modeId = target.dataset.modeId;
    const action = target.dataset.action;
    const targetHash = target.dataset.targetHash;
    
    // 處理分類點擊 (Category Navigation)
    if (action === 'navigate' && targetHash) {
        event.preventDefault(); 
        window.location.hash = targetHash;
        return;
    }

    // 處理測驗模式點擊
    if (listId && modeId) {
        event.preventDefault(); 
        
        const isExam = false; 

        const url = `quiz.html?list=${listId}&mode_id=${modeId}&exam=${isExam}`;
        window.location.href = url;
    }
}
