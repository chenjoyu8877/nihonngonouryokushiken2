// 獲取 HTML 元素
const flashcard = document.getElementById('flashcard');
const cardFront = document.getElementById('card-front');
const cardBack = document.getElementById('card-back');
const nextButton = document.getElementById('next-button');
const answerInput = document.getElementById('answer-input');
const quizInputArea = document.getElementById('quiz-input-section');
const mcqOptionsArea = document.getElementById('mcq-options-section');
const examProgress = document.getElementById('exam-progress-bar');
const operationToggle = document.getElementById('operation-toggle');

// 確保給予變數賦值
const giveUpButton = document.getElementById('give-up-button');

// 獲取「區域」元素
const modeChoiceArea = document.getElementById('mode-choice-area');
const practiceExamChoiceArea = document.getElementById('practice-exam-choice-area');
const examSetupArea = document.getElementById('exam-setup-area');
const mainArea = document.getElementById('quiz-main-area');
const resultsArea = document.getElementById('exam-results-area');

// 獲取「按鈕」和「標題」
const modeChoiceTitle = document.getElementById('mode-choice-title');
const modeButtonContainer = document.getElementById('mode-button-container');
const practiceExamTitle = document.getElementById('practice-exam-title');
const examSetupTitle = document.getElementById('exam-setup-title');
const startPracticeBtn = document.getElementById('start-practice-btn');
const startExamSetupBtn = document.getElementById('start-exam-setup-btn');
const startExamFinalBtn = document.getElementById('start-exam-final-btn');

// 獲取多選區塊元素
const multiSelectArea = document.getElementById('multi-select-area');
const multiSelectTitle = document.getElementById('multi-select-title');
const listCheckboxContainer = document.getElementById('list-checkbox-container');
const nextToModeSelectionBtn = document.getElementById('next-to-mode-selection-btn');
const multiSelectCount = document.getElementById('multi-select-count');
const multiModeChoiceArea = document.getElementById('multi-mode-choice-area');
const multiModeTitle = document.getElementById('multi-mode-title');
const selectedListsSummary = document.getElementById('selected-lists-summary');
const multiModeButtonContainer = document.getElementById('multi-mode-button-container');

// 獲取單列表摘要元素
const singleListSummary = document.getElementById('single-list-summary');

// 獲取自訂輸入元素
const qCustomRadio = document.getElementById('qCustomRadio');
const qCustomInput = document.getElementById('qCustomInput');


// 考試模式變數
let isExamMode = false;
let examTotalQuestions = 0;
let examCurrentQuestion = 0;
let examIncorrectCount = 0;
let testedIndices = new Set();
let currentCardMarkedWrong = false;

// 儲存錯題的單字數據
let examIncorrectWords = [];
let currentCardData = {};

// 全局變數
let QUESTION_FIELD = '';
let ANSWER_FIELD = '';
let BACK_CARD_FIELDS = [];

let vocabulary = [];          // 當前測驗用的題庫 (會變動、被刪除)
let originalVocabulary = [];  // 用於重置練習/考試的備份
let globalOptionPool = [];    // ⭐️ 新增：總選項庫 (永遠完整，用於生成 MCQ 選項)

let currentCardIndex = 0;
let currentCorrectAnswer = "";
let currentMode = 'review';

// ⭐️ 新增：紀錄最原始的模式類型 (用於 Mixed 判斷)
let originalModeType = ''; 

let touchStartX = 0;
let touchStartY = 0;

// 全局狀態
let allListConfigs = {};
let selectedListIDs = [];
let multiSelectEntryConfig = null;
let config = null;

// 輔助函式：Fisher-Yates 洗牌演算法
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// 輔助函式：遞迴收集所有 list ID
function findListById(items) {
    if (!items) return;
    for (const item of items) {
        allListConfigs[item.id] = item;
        if (item.type === 'category' || item.type === 'list') {
             if(item.items) findListById(item.items);
        }
    }
}

// 輔助函式：全域遞迴搜尋模式設定
function findModeRecursive(items, targetModeId) {
    if (!items || !Array.isArray(items)) return null;

    for (const item of items) {
        if (item.type === 'list' && item.modes) {
            const foundMode = item.modes.find(m => m.id === targetModeId);
            if (foundMode) return foundMode;
        }
        
        if (item.items) {
            const foundInChild = findModeRecursive(item.items, targetModeId);
            if (foundInChild) return foundInChild;
        }
    }
    return null;
}

// 輔助函式：尋找單字庫在首頁的路徑 (Hash)
function findParentHash(items, targetListId, currentPath = '#') {
    if (!items) return null;
    
    for (const item of items) {
        if (item.type === 'list' && item.id === targetListId) {
            return currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
        }
        
        if (item.type === 'category') {
            const newPath = currentPath + (currentPath === '#' ? '' : '/') + item.id;
            const found = findParentHash(item.items, targetListId, newPath);
            if (found) return found;
        }
    }
    return null;
}

// 輔助函式：正規化字串
function normalizeString(str) {
    if (typeof str !== 'string') str = String(str);
    if (!str) return "";
    return str.replace(/～/g, '').replace(/~/g, '').replace(/・/g, '').replace(/\./g, '').replace(/\s/g, '');
}

// 輔助函式：異步載入外部 JSON 檔案
async function loadExternalConfig(path) {
    try {
        const response = await fetch(path + '?v=' + new Date().getTime());
        if (!response.ok) {
            return [];
        }
        return await response.json();
    } catch (error) {
        return [];
    }
}

// --- 初始化與設定 ---
async function initializeQuiz() {
    try {
        const configResponse = await fetch('config.json?v=' + new Date().getTime());
        if (!configResponse.ok) { throw new Error('無法讀取 config.json'); }
        config = await configResponse.json();
    } catch (error) {
        console.error('載入設定失敗:', error);
        return;
    }
    
    // 載入並合併外部配置
    let initialConfig = config;
    let finalCatalog = [];
    
    for (const item of initialConfig.catalog) {
        if (item.type === 'external_category' && item.path) {
            const externalItems = await loadExternalConfig(item.path);
            finalCatalog.push(...externalItems);
        } else {
            finalCatalog.push(item);
        }
    }
    initialConfig.catalog = finalCatalog;
    
    allListConfigs = {};
    if (initialConfig.catalog) {
        initialConfig.catalog.forEach(item => findListById([item]));
    }
    
    const params = new URLSearchParams(window.location.search);
    const listName = params.get('list');
    let modeId = params.get('mode_id');

    if (!listName) {
        modeChoiceArea.style.display = 'none';
        return;
    }
    
    const listConfig = allListConfigs[listName];
    if (!listConfig) {
        modeChoiceTitle.textContent = `錯誤：找不到單字庫 ID: ${listName}`;
        modeChoiceArea.style.display = 'block';
        return;
    }

    // 模式選擇區 (單一列表)
    if (!modeId) {
        if (listConfig.type !== 'list') {
            window.location.href = 'index.html';
            return;
        }

        modeChoiceTitle.textContent = '選擇測驗模式';
        
        const parentHash = findParentHash(initialConfig.catalog, listName);
        const returnBtn = document.querySelector('#mode-choice-area .home-button');
        if (returnBtn) {
            returnBtn.href = parentHash ? `index.html${parentHash}` : 'index.html';
            returnBtn.textContent = "返回上一層";
        }
        
        if (parentHash) {
             window.location.href = `index.html${parentHash}`;
             return;
        }
        
        modeChoiceArea.style.display = 'block';
        return;
    }
    
    // 多選流程處理入口
    if (listName === 'MULTI_SELECT_ENTRY' && modeId === 'INITIATE_SELECT') {
        multiSelectEntryConfig = listConfig;
        hideAllSetupAreas();
        setupMultiSelect();
        return;
    }
    
    // 綜合測驗區的返回
    if (listName === 'MULTI_SELECT_ENTRY' && modeId === 'RESUME_MULTI') {
        multiSelectEntryConfig = listConfig;
        hideAllSetupAreas();
        const selectedIdsFromUrl = params.get('selected_ids');
        if (selectedIdsFromUrl) {
            selectedListIDs = selectedIdsFromUrl.split(',');
        }
        setupMultiModeChoice();
        return;
    }
    
    // 載入數據
    const selectedIdsFromUrl = params.get('selected_ids');
    let listIdsToLoad = [];
    let modeConfig = null;

    if (selectedIdsFromUrl) {
        listIdsToLoad = selectedIdsFromUrl.split(',');
        modeConfig = listConfig.modes ? listConfig.modes.find(m => m.id === modeId) : null;
        if (!modeConfig) {
             modeConfig = findModeRecursive(initialConfig.catalog, modeId);
        }
        multiSelectEntryConfig = listConfig;
    } else if (listName !== 'MULTI_SELECT_ENTRY') {
        listIdsToLoad = [listName];
        modeConfig = findModeRecursive(initialConfig.catalog, modeId);
        
        if (!modeConfig && listConfig.modes) {
            modeConfig = listConfig.modes.find(m => m.id === modeId);
        }
    } else {
        multiSelectEntryConfig = listConfig;
        hideAllSetupAreas();
        setupMultiSelect();
        return;
    }
    
    if (!modeConfig) { throw new Error(`找不到模式 ID: ${modeId}`); }

    currentMode = modeConfig.type;
    // ⭐️ 關鍵修改：保存原始模式類型 (如 'mixed')
    originalModeType = modeConfig.type;

    QUESTION_FIELD = modeConfig.q_field;
    ANSWER_FIELD = modeConfig.a_field || '';
    BACK_CARD_FIELDS = modeConfig.back_fields || [];
    
    vocabulary = [];
    for (const id of listIdsToLoad) {
        try {
            const filePath = `words/${id}.json?v=${new Date().getTime()}`;
            const response = await fetch(filePath);
            if (!response.ok) {
                continue;
            }
            const listData = await response.json();
            vocabulary.push(...listData);
        } catch (e) {
            console.error(`載入 ${id}.json 失敗:`, e);
        }
    }

    if (vocabulary.length > 0) {
        // 備份原始單字庫
        originalVocabulary = JSON.parse(JSON.stringify(vocabulary));
        
        // ⭐️ 新增：初始化選項池 (用於生成 MCQ 選項)
        globalOptionPool = [...vocabulary];

        let backToSetupUrl;
        if (selectedIdsFromUrl) {
            backToSetupUrl = `quiz.html?list=${listName}&mode_id=RESUME_MULTI&selected_ids=${selectedIdsFromUrl}`;
        } else {
            backToSetupUrl = `quiz.html?list=${listName}&mode_id=${modeId}`;
        }
        
        const returnButtons = document.querySelectorAll('.button-return');
        returnButtons.forEach(btn => btn.href = backToSetupUrl);

        const parentHash = findParentHash(initialConfig.catalog, listName);
        const backToCategoryUrl = parentHash ? `index.html${parentHash}` : 'index.html';

        modeChoiceArea.style.display = 'none';
        
        // ⭐️ 關鍵修改：只有 Review 模式直接進入，Mixed 模式現在進入 else (顯示考試選單)
        if (currentMode === 'review') {
            isExamMode = false;
            examSetupArea.style.display = 'none';
            practiceExamChoiceArea.style.display = 'none';
            modeChoiceArea.style.display = 'none';
            mainArea.style.display = 'flex';
            
            const mainAreaReturnBtn = mainArea.querySelector('.button-return');
            if (mainAreaReturnBtn) {
                if (selectedIdsFromUrl) {
                    mainAreaReturnBtn.href = backToSetupUrl;
                } else {
                    mainAreaReturnBtn.href = backToCategoryUrl;
                }
            }
            
            setupApp();
        } else {
            // Quiz, MCQ, Mixed 都會來到這裡
            isExamMode = false;
            practiceExamChoiceArea.style.display = 'block';
            
            practiceExamTitle.textContent = `${listConfig.name} - ${modeConfig.name}`;
            
            if (singleListSummary) {
                let summaryText = "";
                if (selectedIdsFromUrl) {
                    const names = listIdsToLoad.map(id => allListConfigs[id] ? allListConfigs[id].name : id).join('、');
                    summaryText = `已選單字庫: ${names}`;
                } else {
                    summaryText = `已選單字庫: ${listConfig.name}`;
                }
                singleListSummary.textContent = summaryText;
            }

            const practiceExamReturnBtn = practiceExamChoiceArea.querySelector('.button-return');
            if (practiceExamReturnBtn) {
                if (selectedIdsFromUrl) {
                    practiceExamReturnBtn.href = backToSetupUrl;
                } else {
                    practiceExamReturnBtn.href = backToCategoryUrl;
                }
            }

            startPracticeBtn.onclick = () => {
                isExamMode = false;
                vocabulary = JSON.parse(JSON.stringify(originalVocabulary));
                
                practiceExamChoiceArea.style.display = 'none';
                mainArea.style.display = 'flex';
                
                const mainAreaReturnBtn = mainArea.querySelector('.button-return');
                if (mainAreaReturnBtn) {
                    mainAreaReturnBtn.href = backToSetupUrl;
                }
                
                setupApp();
            };
            startExamSetupBtn.onclick = () => {
                isExamMode = true;
                vocabulary = JSON.parse(JSON.stringify(originalVocabulary));
                
                practiceExamChoiceArea.style.display = 'none';
                examSetupArea.style.display = 'block';
                examSetupTitle.textContent = `${listConfig.name} - ${modeConfig.name} 考試設定`;
                startExamFinalBtn.onclick = startGame;
                
                const examSetupReturnBtn = examSetupArea.querySelector('.button-return');
                if (examSetupReturnBtn) {
                    examSetupReturnBtn.href = backToSetupUrl;
                }
            };
        }
    } else {
        mainArea.style.display = 'flex';
        mainArea.innerHTML = `<h1>找不到單字數據。</h1><p>請確認單字庫檔案 (words/${listIdsToLoad.join(', ')}.json) 是否存在。</p><a href="index.html" class="home-button">返回主頁面</a>`;
    }
}

function hideAllSetupAreas() {
    modeChoiceArea.style.display = 'none';
    practiceExamChoiceArea.style.display = 'none';
    examSetupArea.style.display = 'none';
    mainArea.style.display = 'none';
    if(multiSelectArea) multiSelectArea.style.display = 'none';
    if(multiModeChoiceArea) multiModeChoiceArea.style.display = 'none';
}

function setupMultiSelect() {
    hideAllSetupAreas();
    multiSelectArea.style.display = 'block';
    listCheckboxContainer.innerHTML = '';
    
    const availableListIDs = multiSelectEntryConfig.available_lists || [];
    let checkboxHtml = '';
    
    availableListIDs.forEach(listId => {
        const listCfg = allListConfigs[listId];
        if (listCfg) {
            const hasValidModes = listCfg.modes && listCfg.modes.some(m => m.enabled);
            checkboxHtml += `
                <label>
                    <input type="checkbox" name="multi-list" value="${listId}" ${hasValidModes ? '' : 'disabled'}>
                    ${listCfg.name} (${listId}.json) ${hasValidModes ? '' : '(無可用模式)'}
                </label>
            `;
        }
    });
    
    listCheckboxContainer.innerHTML = checkboxHtml;
    listCheckboxContainer.addEventListener('change', updateMultiSelectState);
    nextToModeSelectionBtn.onclick = () => {
        hideAllSetupAreas();
        setupMultiModeChoice();
    };
    
    const parentHash = findParentHash(config.catalog, 'MULTI_SELECT_ENTRY');
    const returnBtn = multiSelectArea.querySelector('.button-return');
    if (returnBtn) {
        returnBtn.href = parentHash ? `index.html${parentHash}` : 'index.html';
    }

    updateMultiSelectState();
}

function updateMultiSelectState() {
    const checkedBoxes = document.querySelectorAll('#list-checkbox-container input[name="multi-list"]:checked');
    selectedListIDs = Array.from(checkedBoxes).map(cb => cb.value);
    
    multiSelectCount.textContent = `已選擇 ${selectedListIDs.length} 個單字庫。`;
    nextToModeSelectionBtn.disabled = selectedListIDs.length === 0;
}

function setupMultiModeChoice() {
    multiModeChoiceArea.style.display = 'block';
    
    if (selectedListIDs.length === 0) {
        const params = new URLSearchParams(window.location.search);
        const selectedIdsFromUrl = params.get('selected_ids');
        if (selectedIdsFromUrl) {
            selectedListIDs = selectedIdsFromUrl.split(',');
        }
    }
    
    const summaryNames = selectedListIDs.map(id => allListConfigs[id] ? allListConfigs[id].name : id).join('、');
    selectedListsSummary.textContent = summaryNames;

    const returnButton = multiModeChoiceArea.querySelector('.button-return-to-select-list');
    returnButton.onclick = (event) => {
        event.preventDefault();
        hideAllSetupAreas();
        setupMultiSelect();
    };

    multiModeButtonContainer.innerHTML = '';
    
    multiSelectEntryConfig.modes.forEach(mode => {
        if (mode.enabled) {
            const button = document.createElement('button');
            button.className = `option-button ${mode.type}-mode`;
            button.textContent = mode.name;
            button.dataset.modeId = mode.id;

            button.onclick = (event) => {
                const finalModeId = event.target.dataset.modeId;
                const url = `quiz.html?list=${multiSelectEntryConfig.id}&mode_id=${finalModeId}&selected_ids=${selectedListIDs.join(',')}`;
                window.location.href = url;
            };
            multiModeButtonContainer.appendChild(button);
        }
    });
}

function startGame() {
    vocabulary = JSON.parse(JSON.stringify(originalVocabulary));

    examSetupArea.style.display = 'none';
    mainArea.style.display = 'flex';

    const selectedLength = document.querySelector('input[name="exam-length"]:checked').value;
    
    if (selectedLength === 'all') {
        examTotalQuestions = vocabulary.length;
    } else if (selectedLength === 'custom') {
        let customValue = parseInt(qCustomInput.value);
        if (isNaN(customValue) || customValue <= 0) {
            alert('請輸入有效的自訂題數！');
            examSetupArea.style.display = 'block';
            mainArea.style.display = 'none';
            return;
        }
        examTotalQuestions = customValue;
    } else {
        examTotalQuestions = parseInt(selectedLength);
    }
    
    if (examTotalQuestions > vocabulary.length) {
        examTotalQuestions = vocabulary.length;
        alert(`題數超過單字庫總數，已自動設定為最大題數：${vocabulary.length} 題。`);
    }

    shuffleArray(vocabulary);

    examCurrentQuestion = 0;
    examIncorrectCount = 0;
    testedIndices.clear();
    updateExamProgress();
    examIncorrectWords = [];
    
    const params = new URLSearchParams(window.location.search);
    const listName = params.get('list');
    const modeId = params.get('mode_id');
    const selectedIds = params.get('selected_ids');
    
    let backToSetupUrl;
    if (selectedIds) {
        backToSetupUrl = `quiz.html?list=${listName}&mode_id=RESUME_MULTI&selected_ids=${selectedIds}`;
    } else {
        backToSetupUrl = `quiz.html?list=${listName}&mode_id=${modeId}`;
    }
    
    const mainAreaReturnBtn = mainArea.querySelector('.button-return');
    if (mainAreaReturnBtn) {
        mainAreaReturnBtn.href = backToSetupUrl;
    }
    
    setupApp();
}

function updateOperationNotes() {
    const notesContainer = document.querySelector('#operation-notes ul');
    if (!notesContainer) return;

    let html = '';
    
    if (currentMode === 'quiz') {
        html = `
            <li>**Enter**：檢查答案 / 下一張。</li>
            <li>**Tab** / **Esc**：我不會 (顯示答案)。</li>
            <li>**Shift**：切換中英/大寫 (無特殊功能)。</li>
            <li>點擊卡片：<span style="color:red;">作答期間禁止</span>。</li>
        `;
    } else if (currentMode === 'mcq') {
        html = `
            <li>**1~4**：選擇答案 (對應選項)。</li>
            <li>**Shift**：<span style="color:red;">已停用</span>。</li>
            <li>點擊卡片：<span style="color:red;">作答期間禁止</span>。</li>
        `;
    } else {
        html = `
            <li>點擊卡片 / **Shift**：翻轉卡片。</li>
            <li>**Enter**：下一張。</li>
        `;
    }
    
    notesContainer.innerHTML = html;
}

function setupApp() {
    flashcard.addEventListener('click', flipCard);
    nextButton.addEventListener('click', handleButtonPress);

    const cardContainer = document.querySelector('.flashcard-container');
    if (cardContainer) {
        cardContainer.addEventListener('touchstart', handleTouchStart, false);
        cardContainer.addEventListener('touchmove', handleTouchMove, false);
        cardContainer.addEventListener('touchend', handleTouchEnd, false);
    }
    
    document.addEventListener('keydown', handleGlobalKey);
    
    if (giveUpButton) {
        giveUpButton.addEventListener('click', revealAnswer);
    }
    
    if (operationToggle) {
        operationToggle.addEventListener('click', toggleOperationNotes);
    }
    
    // ⭐️ 確保在 Setup 時根據模式顯示正確的 UI
    if (currentMode === 'quiz') {
        if(quizInputArea) quizInputArea.style.display = 'block';
        if(mcqOptionsArea) mcqOptionsArea.style.display = 'none';
        
        if(giveUpButton) giveUpButton.style.display = 'inline-block';
        
        const answerLabelData = BACK_CARD_FIELDS.find(f => f.key === ANSWER_FIELD);
        const answerLabel = answerLabelData ? answerLabelData.label : "答案";
        answerInput.placeholder = `請輸入 ${answerLabel}(多個答案用、分隔)`;
        
        if (answerInput) answerInput.focus();
        
    } else if (currentMode === 'mcq') {
        if(quizInputArea) quizInputArea.style.display = 'none';
        if(mcqOptionsArea) mcqOptionsArea.style.display = 'flex';
        if(giveUpButton) giveUpButton.style.display = 'none';
    } else {
        if(quizInputArea) quizInputArea.style.display = 'none';
        if(mcqOptionsArea) mcqOptionsArea.style.display = 'none';
        if(giveUpButton) giveUpButton.style.display = 'none';
    }
    
    updateOperationNotes();
    loadNextCard();
}

function toggleOperationNotes() {
    const notes = document.getElementById('operation-notes');
    const toggleBtn = document.getElementById('operation-toggle');
    
    if (notes) {
        notes.classList.toggle('expanded');
    }
    if (toggleBtn) {
        toggleBtn.classList.toggle('expanded');
    }
}

async function loadNextCard() {
    // ⭐️ 關鍵修改：混合模式邏輯 (Mixed Mode Logic) ⭐️
    if (originalModeType === 'mixed') {
        // 1. 隨機決定這一題是 "quiz" (填空) 還是 "mcq" (選擇)
        const randomMode = Math.random() < 0.5 ? 'quiz' : 'mcq';
        currentMode = randomMode;
        
        // 2. 自動切換欄位 (針對您的 bunbou1 結構：填空用 qus-1，選擇用 qus-2)
        if (currentMode === 'quiz') {
            QUESTION_FIELD = 'qus-1';
            ANSWER_FIELD = 'ans-1';
        } else {
            QUESTION_FIELD = 'qus-2';
            ANSWER_FIELD = 'ans-2';
        }
        
        // 3. 動態切換介面顯示
        if (currentMode === 'quiz') {
            quizInputArea.style.display = 'block';
            mcqOptionsArea.style.display = 'none';
            if(giveUpButton) giveUpButton.style.display = 'inline-block';
            nextButton.textContent = "檢查答案";
            
            // 更新 placeholder
            const answerLabelData = BACK_CARD_FIELDS.find(f => f.key === ANSWER_FIELD);
            const answerLabel = answerLabelData ? answerLabelData.label : "答案";
            answerInput.placeholder = `請輸入 ${answerLabel}`;

        } else {
            quizInputArea.style.display = 'none';
            mcqOptionsArea.style.display = 'flex';
            if(giveUpButton) giveUpButton.style.display = 'none';
        }
        
        // 更新操作說明文字
        updateOperationNotes();
    }

    // 重置卡片樣式
    if (flashcard) {
        flashcard.style.boxShadow = '';
        flashcard.style.border = '';
    }

    // 重置 Diff 比對顯示區域
    const diffContainer = document.getElementById('diff-result');
    if (diffContainer) diffContainer.innerHTML = '';

    if (isExamMode && examCurrentQuestion >= examTotalQuestions) {
        showExamResults();
        return;
    }
    
    if (!isExamMode && vocabulary.length === 0) {
        showPracticeComplete();
        return;
    }
    
    // 如果卡片是翻開的，先翻回來
    if (flashcard.classList.contains('is-flipped')) {
        flashcard.classList.remove('is-flipped');
        await new Promise(resolve => setTimeout(resolve, 610));
    }
    
    let card;
    let newIndex = currentCardIndex;

    if (isExamMode) {
        examCurrentQuestion++;
        updateExamProgress();
        currentCardMarkedWrong = false;
        newIndex = examCurrentQuestion - 1;
    } else {
        updateExamProgress();
        currentCardMarkedWrong = false;

        const oldIndex = currentCardIndex;
        if (vocabulary.length <= 1) { 
            currentCardIndex = 0; 
        } else {
            let safeGuard = 0;
            do { 
                currentCardIndex = Math.floor(Math.random() * vocabulary.length); 
                safeGuard++;
            } while (currentCardIndex === oldIndex && safeGuard < 10);
        }
        newIndex = currentCardIndex;
    }
    
    card = vocabulary[newIndex];
    if (!card) return; 

    currentCardData = card;

    // ⭐️ 雙重保險：如果切換到該模式但該欄位沒資料，嘗試切回另一種
    if (originalModeType === 'mixed' && !card[QUESTION_FIELD]) {
         if (currentMode === 'mcq' && card['qus-1']) {
             currentMode = 'quiz';
             QUESTION_FIELD = 'qus-1';
             ANSWER_FIELD = 'ans-1';
             quizInputArea.style.display = 'block';
             mcqOptionsArea.style.display = 'none';
         }
    }

    cardFront.textContent = card[QUESTION_FIELD] || "";
    currentCorrectAnswer = card[ANSWER_FIELD] || "";

    let backHtml = '';
    for (const field of BACK_CARD_FIELDS) {
        const value = card[field.key];
        if (value !== undefined && value !== null && value !== "") {
            const isAnswer = (field.key === ANSWER_FIELD);
            const valueClass = isAnswer ? "back-value answer" : "back-value";
            backHtml += `
                <div class="back-item">
                    <span class="back-label">${field.label}:</span>
                    <span class="${valueClass}">${value}</span>
                </div>
            `;
        }
    }
    cardBack.innerHTML = backHtml;
    
    if (currentMode === 'quiz') {
        answerInput.value = "";
        answerInput.disabled = false;
        answerInput.classList.remove('correct', 'incorrect');
        
        // 確保按鈕文字正確
        nextButton.textContent = "檢查答案";
        nextButton.disabled = false;
        if (answerInput) answerInput.focus();
        
        if (giveUpButton) {
            giveUpButton.disabled = false;
            giveUpButton.style.display = 'inline-block'; 
        }
        
    } else if (currentMode === 'mcq') {
        generateMcqOptions();
        nextButton.textContent = "下一張";
        nextButton.disabled = true;
        
    } else {
        nextButton.textContent = "顯示答案";
        nextButton.disabled = false;
    }
}

function checkAnswer() {
    const userInputRaw = answerInput.value.trim();
    if (!userInputRaw) {
        answerInput.classList.add('shake');
        setTimeout(() => answerInput.classList.remove('shake'), 500);
        return;
    }

    const normalizedInput = normalizeString(userInputRaw);
    let correctAnswers = currentCorrectAnswer.split('/').map(s => s.trim());
    
    // 檢查答案是否正確
    const isCorrect = correctAnswers.some(answer => normalizeString(answer) === normalizedInput);
    const diffContainer = document.getElementById('diff-result');

    if (isCorrect) {
        // --- 🟢 答對了 ---
        answerInput.classList.add('correct');
        answerInput.classList.remove('incorrect');
        answerInput.disabled = true; // 鎖定
        
        // 練習模式且「從未試錯過」才刪除
        if (!isExamMode && !currentCardMarkedWrong) {
            vocabulary.splice(currentCardIndex, 1);
            updateExamProgress(); 
        }

        if(diffContainer) diffContainer.innerHTML = ''; // 清空比對區

        nextButton.textContent = "下一張";
        nextButton.disabled = false;
        
        // 隱藏「我不會」按鈕
        if (giveUpButton) giveUpButton.style.display = 'none';
        
        flipCard(); // 翻開卡片

    } else {
        // --- 🔴 答錯了 (給予重試機會) ---
        answerInput.classList.add('incorrect');
        answerInput.classList.remove('correct');
        
        // 震動回饋
        answerInput.classList.add('shake');
        setTimeout(() => answerInput.classList.remove('shake'), 500);
        
        // ⭐️ 關鍵：這裡「不」鎖定、「不」翻卡、「不」顯示 Diff
        // 讓使用者可以刪除文字重新輸入
        
        // 但必須標記此題已髒 (考試模式扣分，練習模式保留單字)
        if (!currentCardMarkedWrong) {
            currentCardMarkedWrong = true;
            if (isExamMode) {
                examIncorrectCount++;
                examIncorrectWords.push({
                    question: currentCardData[QUESTION_FIELD],
                    answer: currentCorrectAnswer
                });
            }
        }
        
        // 確保「我不會」按鈕是顯示的，讓使用者真的想放棄時可以按
        if (giveUpButton) giveUpButton.style.display = 'inline-block';
        
        // 聚焦回輸入框，方便直接修改
        answerInput.focus();
    }
}

function revealAnswer() {
    // 只有在測驗模式且卡片還沒翻開時有效
    if (currentMode === 'quiz' && !flashcard.classList.contains('is-flipped')) {
        
        // 標記錯誤 (如果之前沒試錯過，現在放棄也算錯)
        if (!currentCardMarkedWrong) {
            currentCardMarkedWrong = true;
            if (isExamMode) {
                examIncorrectCount++;
                examIncorrectWords.push({
                    question: currentCardData[QUESTION_FIELD],
                    answer: currentCorrectAnswer
                });
            }
        }
        updateExamProgress();
        
        const diffContainer = document.getElementById('diff-result');
        const userInputRaw = answerInput.value.trim();
        const mainCorrectAnswer = currentCorrectAnswer.split('/')[0].trim();

        // ⭐️ 關鍵邏輯：
        // 放棄時，系統會看你「現在輸入框裡留著什麼」來做比對
        
        if (userInputRaw !== "") {
            // 情況 A：你有嘗試打字，但最後放棄 -> 顯示 Diff (你的答案 vs 正確答案)
            if (diffContainer) {
                const diffHtml = generateDiffHtml(userInputRaw, mainCorrectAnswer);
                diffContainer.innerHTML = `比對：${diffHtml}`;
            }
        } else {
            // 情況 B：你完全空白就放棄 -> 直接幫你填入正確答案，不顯示 Diff
            answerInput.value = mainCorrectAnswer;
            if (diffContainer) diffContainer.innerHTML = "";
        }
        
        // 鎖定介面
        answerInput.classList.remove('incorrect'); // 移除紅色錯誤框，避免干擾閱讀
        answerInput.disabled = true; // 鎖定輸入
        
        flipCard(); // 翻開卡片看詳解
        
        nextButton.textContent = "下一張";
        nextButton.disabled = false;
        
        // 放棄按鈕隱藏
        if (giveUpButton) giveUpButton.style.display = 'none';
    }
}

function handleButtonPress() {
    const buttonState = nextButton.textContent;

    if (currentMode === 'quiz') {
        if (buttonState === "檢查答案") {
            checkAnswer();
        } else {
            loadNextCard();
        }
    } else if (currentMode === 'review') {
        if (buttonState === "顯示答案") {
            flipCard();
            if (flashcard.classList.contains('is-flipped')) {
                nextButton.textContent = "下一張";
            }

        } else {
            loadNextCard();
        }
    } else if (currentMode === 'mcq') {
        loadNextCard();
    }
}

// 按鍵處理
function handleGlobalKey(event) {
    const isTyping = (currentMode === 'quiz' && document.activeElement === answerInput);

    if (event.key === 'Enter') {
        event.preventDefault();
        if (examSetupArea.style.display === 'block' && startExamFinalBtn) {
            startExamFinalBtn.click();
            return;
        }
        if (!nextButton.disabled) {
             handleButtonPress();
        }
        return;
    }
    
    if (event.key === 'Tab' || event.key === 'Escape') {
        if (currentMode === 'quiz') {
            event.preventDefault(); 
            revealAnswer();
            return;
        }
    }

    if (currentMode === 'mcq') {
        if (event.key >= "1" && event.key <= "4") {
            const index = parseInt(event.key, 10) - 1;
            const options = document.querySelectorAll('.mcq-option');
            if (options[index]) {
                options[index].click();
                event.preventDefault(); 
            }
        }
    }

    if (event.key === 'Shift') {
        if (currentMode === 'mcq') return; 
        if (isTyping) return; 
        
        event.preventDefault();
        flipCard(); 
    }
}

// ⭐️ 修正後的 flipCard (加入防偷看邏輯)
function flipCard() {
    // 🛡️ 防偷看邏輯：
    // 如果是 Quiz 或 MCQ 模式 (無論是練習還是考試)，在還沒作答完成前，禁止翻開卡片背面。
    // 判斷標準：
    // 1. Quiz: 輸入框沒被鎖定 (!answerInput.disabled) 代表還沒答對或放棄。
    // 2. MCQ: 下一題按鈕被鎖定 (nextButton.disabled) 代表還沒選出結果。
    
    if (currentMode === 'quiz' || currentMode === 'mcq') {
        // 只有當卡片「目前是正面」且「還沒答完」時，才攔截。
        // (如果卡片已經是背面，允許點擊翻回正面看題目)
        if (!flashcard.classList.contains('is-flipped')) {
             if (currentMode === 'quiz' && !answerInput.disabled) {
                 return; // 禁止翻頁
             }
             if (currentMode === 'mcq' && nextButton.disabled) {
                 return; // 禁止翻頁
             }
        }
    }

    const wasFlipped = flashcard.classList.contains('is-flipped');
    flashcard.classList.toggle('is-flipped');
    
    if (wasFlipped && !flashcard.classList.contains('is-flipped')) {
        if (currentMode === 'review') {
            nextButton.textContent = "顯示答案";
        }
    }
}

function handleTouchStart(event) {
    touchStartX = event.changedTouches[0].screenX;
    touchStartY = event.changedTouches[0].screenY;
}
function handleTouchMove(event) {
    let diffX = Math.abs(event.changedTouches[0].screenX - touchStartX);
    let diffY = Math.abs(event.changedTouches[0].screenY - touchStartY);
    if (diffX > diffY) {
        event.preventDefault();
    }
}
function handleTouchEnd(event) {
    let touchEndX = event.changedTouches[0].screenX;
    let touchEndY = event.changedTouches[0].screenY;
    
    let swipeDistanceX = touchStartX - touchEndX;
    let swipeDistanceY = touchStartY - touchEndY;

    const minSwipeThreshold = 50;
    
    if (Math.abs(swipeDistanceX) > Math.abs(swipeDistanceY) && Math.abs(swipeDistanceX) > minSwipeThreshold) {
        if (swipeDistanceX < 0) {
            triggerNextCardAction();
        } else {
            flipCard();
        }
    }
    touchStartX = 0;
    touchStartY = 0;
}
function triggerNextCardAction() {
    if (!nextButton.disabled) {
        handleButtonPress();
    }
}

// ⭐️ 修正後的 MCQ 選項生成 (防止重複答案出現)
function generateMcqOptions() {
    const correctAnswer = currentCorrectAnswer;
    
    // 1. 準備一個 Set 來記錄「已經選用的答案文字」
    // 用途：確保選項內不會有重複的文字 (例如已經有「ば」就不會再選另一個「ば」)
    let usedAnswersSet = new Set();
    
    // 先把「正確答案」正規化後放入 Set，避免錯誤選項跟正確答案長得一樣
    usedAnswersSet.add(normalizeString(correctAnswer));

    let distractors = [];
    let retries = 0;
    const maxRetries = 50; // 增加嘗試次數，因為重複率高，需要多找幾次

    // 計算我們需要幾個錯誤選項 (最多 3 個，如果題庫太少則減少)
    // 這裡我們檢查的是 unique 的數量，比較難精確估算，所以主要靠 retry 限制
    const targetCount = 3;

    while (distractors.length < targetCount && retries < maxRetries) {
        retries++;
        
        // 從總題庫隨機抽一個
        const randomIndex = Math.floor(Math.random() * globalOptionPool.length);
        const randomWord = globalOptionPool[randomIndex];
        
        if (!randomWord[ANSWER_FIELD]) continue;
        
        const distractorText = randomWord[ANSWER_FIELD];
        const distractorNormalized = normalizeString(distractorText);
        
        // ⭐️ 核心判斷：
        // 如果這個答案的文字，已經在 Set 裡面 (代表跟正確答案一樣，或跟已選的錯誤選項一樣)
        // 則跳過，重新抽
        if (usedAnswersSet.has(distractorNormalized)) {
            continue;
        }
        
        // 如果是新的答案，加入 Set 和 列表
        usedAnswersSet.add(distractorNormalized);
        distractors.push(distractorText);
    }
    
    // 合併正確答案與錯誤選項
    let options = [correctAnswer, ...distractors];
    
    // 洗牌 (打亂順序)
    shuffleArray(options);
    
    // --- 以下是渲染按鈕的程式碼 (保持原本樣式) ---
    mcqOptionsArea.innerHTML = '';
    mcqOptionsArea.style.display = 'grid';
    mcqOptionsArea.style.gridTemplateColumns = '1fr 1fr';
    mcqOptionsArea.style.gap = '15px'; 
    
    options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'mcq-option';
        button.textContent = `${index + 1}. ${option}`; 
        
        button.dataset.answer = option;
        button.addEventListener('click', (event) => handleMcqAnswer(event.target));
        mcqOptionsArea.appendChild(button);
    });
}
function handleMcqAnswer(selectedButton) {
    selectedButton.blur();
    const selectedAnswer = selectedButton.dataset.answer;
    
    const allButtons = mcqOptionsArea.querySelectorAll('button');
    allButtons.forEach(button => button.disabled = true);

    if (normalizeString(selectedAnswer) === normalizeString(currentCorrectAnswer)) {
        selectedButton.style.backgroundColor = '#00E676'; 
        selectedButton.style.color = '#fff';
        selectedButton.style.boxShadow = '0 0 15px #00E676'; 
        
        flashcard.style.boxShadow = '0 0 25px #00E676'; 
        flashcard.style.border = '2px solid #00E676';
        
        selectedButton.classList.add('correct'); 

        // 練習模式答對：必須是「清白之身」才刪除
        if (!isExamMode && !currentCardMarkedWrong) {
            vocabulary.splice(currentCardIndex, 1);
            updateExamProgress(); 
        }
        
        setTimeout(() => {
            loadNextCard();
        }, 1000); 
    } else {
        selectedButton.style.backgroundColor = '#FF1744'; 
        selectedButton.style.color = '#fff';
        selectedButton.style.boxShadow = '0 0 15px #FF1744';
        
        flashcard.style.boxShadow = '0 0 25px #FF1744';
        flashcard.style.border = '2px solid #FF1744';
        
        selectedButton.classList.add('incorrect');
        
        // 答錯了！標記為「已髒」
        if (!currentCardMarkedWrong) {
            currentCardMarkedWrong = true;
            if (isExamMode) {
                examIncorrectCount++;
                examIncorrectWords.push({
                    question: currentCardData[QUESTION_FIELD],
                    answer: currentCorrectAnswer
                });
            }
        }
        
        allButtons.forEach(button => {
            if (normalizeString(button.dataset.answer) === normalizeString(currentCorrectAnswer)) {
                button.classList.add('correct'); 
            }
        });

        // 答錯後，啟用「下一張」按鈕，並翻開卡片給使用者看正確答案
        nextButton.disabled = false;
        flipCard(); 
    }
}

function updateExamProgress() {
    if (!examProgress) return;
    
    if (isExamMode) {
        examProgress.style.display = 'flex';
        let score = 'N/A';
        if (examCurrentQuestion > 0) {
            const correctCount = (examCurrentQuestion - examIncorrectCount);
            score = Math.round((correctCount / examCurrentQuestion) * 100);
        }
        
        examProgress.innerHTML = `
            <span>題數: ${examCurrentQuestion} / ${examTotalQuestions}</span>
            <span>答錯: ${examIncorrectCount}</span>
            <span>分數: ${score === 'N/A' ? 'N/A' : score + '%'}</span>
        `;
    } else {
        examProgress.style.display = 'flex';
        examProgress.innerHTML = `
            <span style="font-weight: bold;">剩餘單字: ${vocabulary.length}</span>
        `;
    }
}

function showExamResults() {
    if(mainArea) mainArea.style.display = 'none';
    if(resultsArea) resultsArea.style.display = 'block';

    const correctCount = examTotalQuestions - examIncorrectCount;
    const finalScore = Math.round((correctCount / examTotalQuestions) * 100);
    let message = '';
    if (finalScore == 100) message = '太完美了！ (Perfect!)';
    else if (finalScore >= 80) message = '非常厲害！ (Great Job!)';
    else if (finalScore >= 60) message = '不錯喔！ (Good!)';
    else message = '再加油！ (Keep Trying!)';
    
    let incorrectListHtml = '';
    if (examIncorrectWords.length > 0) {
        incorrectListHtml = '<h2>📚 錯誤清單</h2><ul class="incorrect-list">';
        examIncorrectWords.forEach((word, index) => {
            incorrectListHtml += `
                <li>
                    <strong>${index + 1}. 問題:</strong> ${word.question} <br>
                    <strong>答案:</strong> <span style="color: #c62828;">${word.answer}</span>
                </li>
            `;
        });
        incorrectListHtml += '</ul>';
    }
    
    const params = new URLSearchParams(window.location.search);
    const listName = params.get('list');
    const modeId = params.get('mode_id');
    const selectedIds = params.get('selected_ids');

    let backToSetupUrl;
    if (selectedIds) {
        backToSetupUrl = `quiz.html?list=${listName}&mode_id=RESUME_MULTI&selected_ids=${selectedIds}`;
    } else {
        backToSetupUrl = `quiz.html?list=${listName}&mode_id=${modeId}`;
    }

    resultsArea.innerHTML = `
        <h1>考試結束！</h1>
        <div class="results-summary">
            <h2>${message}</h2>
            <div class="final-score">${finalScore}%</div>
            <p>總題數: ${examTotalQuestions}</p>
            <p>答對: ${correctCount}</p>
            <p>答錯: ${examIncorrectCount}</p>
        </div>
        ${incorrectListHtml}
        <button id="restart-exam-btn" class="option-button review-mode">再考一次</button>
        <a href="${backToSetupUrl}" class="home-button">返回設定頁</a>
    `;
    
    document.getElementById('restart-exam-btn').addEventListener('click', () => {
        resultsArea.style.display = 'none';
        startGame();
    });
}

function showPracticeComplete() {
    mainArea.style.display = 'none';
    resultsArea.style.display = 'block';

    const params = new URLSearchParams(window.location.search);
    const listName = params.get('list');
    const modeId = params.get('mode_id');
    const selectedIds = params.get('selected_ids');

    let backToSetupUrl;
    if (selectedIds) {
        backToSetupUrl = `quiz.html?list=${listName}&mode_id=RESUME_MULTI&selected_ids=${selectedIds}`;
    } else {
        backToSetupUrl = `quiz.html?list=${listName}&mode_id=${modeId}`;
    }

    resultsArea.innerHTML = `
        <h1>練習完成！</h1>
        <div class="results-summary">
            <h2>恭喜！🎉</h2>
            <p>太棒了！您已經答對並消滅了所有單字。</p>
            <div class="final-score">💯</div>
        </div>
        <button id="restart-exam-btn" class="option-button review-mode">重新練習</button>
        <a href="${backToSetupUrl}" class="home-button">返回設定頁</a>
    `;
    
    document.getElementById('restart-exam-btn').addEventListener('click', () => {
        vocabulary = JSON.parse(JSON.stringify(originalVocabulary));
        resultsArea.style.display = 'none';
        mainArea.style.display = 'flex';
        setupApp();
    });
}
// ⭐️ 新增：簡易 Diff 演算法 (LCS 實作)
// 回傳 HTML 字串：刪除的部分用 .diff-del 包裹，新增的部分用 .diff-ins 包裹
function generateDiffHtml(oldStr, newStr) {
    // 簡單的正規化
    oldStr = normalizeString(oldStr);
    newStr = normalizeString(newStr);

    const m = oldStr.length;
    const n = newStr.length;
    
    // 建立 LCS 矩陣
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldStr[i - 1] === newStr[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // 回溯產生 Diff
    let i = m, j = n;
    let html = '';
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldStr[i - 1] === newStr[j - 1]) {
            html = `<span class="diff-common">${oldStr[i - 1]}</span>` + html;
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            html = `<span class="diff-ins">${newStr[j - 1]}</span>` + html;
            j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
            html = `<span class="diff-del">${oldStr[i - 1]}</span>` + html;
            i--;
        }
    }
    return html;
}

initializeQuiz();