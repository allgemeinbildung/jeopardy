// --- CONFIGURATION ---
const API_KEY_STORAGE_ITEM = 'wissensChampionApiKey_v2';
const MODEL_NAME = 'gemini-2.0-flash';

// --- DOM Elements ---
const setupScreen = document.getElementById('setup-screen');
const mainGameArea = document.getElementById('main-game-area');
const gameScreen = document.getElementById('game-screen');
const questionScreenContainer = document.getElementById('question-screen-container');

const startGameBtn = document.getElementById('start-game-btn');
const apiKeyInput = document.getElementById('api-key-input');
const textInput = document.getElementById('text-input');
const keywordsInput = document.getElementById('keywords-input');
const numCategoriesInput = document.getElementById('num-categories');
const numQuestionsInput = document.getElementById('num-questions');
const numTeamsInput = document.getElementById('num-teams');
const teamNameInputsContainer = document.getElementById('team-name-inputs');
const errorMessage = document.getElementById('error-message');
const loadingIndicator = document.getElementById('loading-indicator');

const scoreboard = document.getElementById('scoreboard');
const whiteboardLinksContainer = document.getElementById('whiteboard-links');
const gameBoard = document.getElementById('game-board');

const questionCategory = document.getElementById('question-category');
const questionText = document.getElementById('question-text');
const answerText = document.getElementById('answer-text');
const revealAnswerBtn = document.getElementById('reveal-answer-btn');
const backToBoardBtn = document.getElementById('back-to-board-btn');
const teacherControls = document.getElementById('teacher-controls');
const whiteboardCheckLinks = document.getElementById('whiteboard-check-links');

// --- Game State ---
let gameState = {
    teams: [],
    scores: {},
    whiteboardUrls: {},
    currentQuestion: null,
    categories: [],
    gameConfig: {}
};

// --- AI Integration ---
async function generateQuizWithGemini(apiKey, sourceContent, inputType, numCategories, numQuestions) {
    let prompt;

    if (inputType === 'text') {
        prompt = `Du bist ein Quizmaster-Assistent. Basierend auf dem folgenden Text, generiere ein Quiz im Jeopardy-Stil.

    Text-Inhalt:
    \`\`\`
    ${sourceContent}
    \`\`\`

    Anforderungen:
    1.  **Sprache**: Die gesamte Ausgabe muss auf Deutsch sein.
    2.  **Kategorien**: Erstelle genau ${numCategories} aussagekräftige und unterschiedliche Kategorien, die die Themen im Text gut zusammenfassen.
    3.  **Fragen**: Erstelle für jede Kategorie genau ${numQuestions} neue Fragen. Formuliere die Fragen um, teste das Verständnis und kombiniere Konzepte. Kopiere nicht einfach Sätze aus dem Text.
    4.  **Schwierigkeit**: Ordne die Fragen in jeder Kategorie nach aufsteigendem Schwierigkeitsgrad.
    5.  **Format**: Die Ausgabe muss ein einziges, valides JSON-Objekt sein, das dem vorgegebenen Schema entspricht. Keine einleitenden oder abschließenden Texte.`;
    } else { // keywords
        prompt = `Du bist ein Quizmaster-Assistent. Erfinde und generiere ein komplettes Quiz im Jeopardy-Stil basierend auf den folgenden Stichwörtern.

    Stichwörter: "${sourceContent}"

    Anforderungen:
    1.  **Sprache**: Die gesamte Ausgabe muss auf Deutsch sein.
    2.  **Kategorien**: Erstelle genau ${numCategories} aussagekräftige Kategorien, die zu den Stichwörtern passen.
    3.  **Fragen & Antworten**: Erstelle für jede Kategorie genau ${numQuestions} Fragen mit den passenden Antworten. Die Fragen sollten das Wissen zu den Stichwörtern testen.
    4.  **Schwierigkeit**: Ordne die Fragen in jeder Kategorie nach aufsteigendem Schwierigkeitsgrad.
    5.  **Format**: Die Ausgabe muss ein einziges, valides JSON-Objekt sein, das dem vorgegebenen Schema entspricht. Keine einleitenden oder abschließenden Texte.`;
    }


    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "subchapters": {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "subchapter_title": { type: "STRING" },
                                "questions": {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            "question_text": { type: "STRING" },
                                            "answer_text": { type: "STRING" }
                                        },
                                        required: ["question_text", "answer_text"]
                                    }
                                }
                            },
                            required: ["subchapter_title", "questions"]
                        }
                    }
                },
                required: ["subchapters"]
            }
        }
    };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorBody = await response.json();
        const errorMsg = errorBody?.error?.message || 'Unbekannter API-Fehler.';
        throw new Error(`API-Fehler (HTTP ${response.status}): ${errorMsg}`);
    }
    const result = await response.json();
    if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0]) {
        const text = result.candidates[0].content.parts[0].text;
        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.error("Failed to parse JSON response:", text);
            throw new Error("Die KI hat eine ungültige JSON-Antwort zurückgegeben.");
        }
    } else {
        console.error("Unexpected API response structure:", result);
        throw new Error("Konnte keine validen Quizdaten von der KI erhalten.");
    }
}

// --- URL Shortening ---
async function shortenUrl(longUrl) {
    const apiUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`;
    try {
        const response = await fetch(apiUrl);
        if (response.ok) return await response.text();
        return longUrl;
    } catch (error) {
        console.error('URL shortening failed:', error);
        return longUrl;
    }
}

// --- Game Logic ---
function loadApiKeyFromStorage() {
    const savedKey = localStorage.getItem(API_KEY_STORAGE_ITEM);
    if (savedKey) apiKeyInput.value = savedKey;
}

function renderTeamNameInputs() {
    const teamCount = parseInt(numTeamsInput.value, 10);
    if (isNaN(teamCount) || teamCount < 2 || teamCount > 4) {
        numTeamsInput.value = Math.max(2, Math.min(4, teamCount || 2));
        return;
    }

    const existingNames = [];
    const currentInputs = teamNameInputsContainer.querySelectorAll('input[type="text"]');
    currentInputs.forEach(input => existingNames.push(input.value));

    teamNameInputsContainer.innerHTML = ''; // Clear existing inputs

    const defaultTeamNames = ["Team Blau", "Team Rot", "Team Grün", "Team Gelb"];

    for (let i = 0; i < teamCount; i++) {
        const teamDiv = document.createElement('div');
        const teamId = `team${i + 1}-name`;
        const teamName = existingNames[i] || defaultTeamNames[i] || `Team ${i + 1}`;

        teamDiv.innerHTML = `
            <label for="${teamId}" class="block text-sm font-medium mb-2">Team ${i + 1} Name</label>
            <input type="text" id="${teamId}" value="${teamName}" class="w-full bg-gray-800 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-400 focus:outline-none">
        `;
        teamNameInputsContainer.appendChild(teamDiv);
    }
}

async function initializeGame() {
    errorMessage.textContent = '';
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        errorMessage.textContent = 'Bitte geben Sie einen gültigen API-Schlüssel ein.';
        return;
    }
    localStorage.setItem(API_KEY_STORAGE_ITEM, apiKey);

    const activeTab = document.querySelector('.tab-link.active').dataset.tab;
    const inputType = activeTab === 'text-input-tab' ? 'text' : 'keywords';
    const sourceContent = (inputType === 'text' ? textInput.value : keywordsInput.value).trim();

    if (!sourceContent) {
        errorMessage.textContent = 'Bitte geben Sie Text oder Stichwörter als Grundlage für das Quiz ein.';
        return;
    }

    // Dynamically set up teams
    gameState.teams = [];
    gameState.scores = {};
    const teamInputs = teamNameInputsContainer.querySelectorAll('input[type="text"]');
    teamInputs.forEach(input => {
        const teamName = input.value.trim();
        if (teamName) {
            gameState.teams.push(teamName);
            gameState.scores[teamName] = 0;
        }
    });

    if (gameState.teams.length < 2) {
        errorMessage.textContent = 'Es müssen mindestens 2 Teams mit Namen vorhanden sein.';
        return;
    }

    gameState.gameConfig = {
        numCategories: parseInt(numCategoriesInput.value, 10),
        numQuestions: parseInt(numQuestionsInput.value, 10),
    };

    loadingIndicator.classList.remove('hidden');
    loadingIndicator.classList.add('flex');
    startGameBtn.disabled = true;
    startGameBtn.textContent = 'Generiere...';

    try {
        await generateWhiteboardLinks();

        const rawJson = await generateQuizWithGemini(apiKey, sourceContent, inputType, gameState.gameConfig.numCategories, gameState.gameConfig.numQuestions);

        if (!rawJson.subchapters || rawJson.subchapters.length === 0) {
            throw new Error("KI hat keine gültigen Kategorien ('subchapters') zurückgegeben.");
        }

        gameState.categories = rawJson.subchapters
            .filter(cat => cat && cat.questions && cat.questions.length > 0)
            .map(cat => ({
                title: cat.subchapter_title,
                questions: cat.questions
            }));

        if (gameState.categories.length === 0) {
            throw new Error("Die von der KI generierten Daten enthalten keine spielbaren Fragen.");
        }

        renderScoreboard();
        renderGameBoard();
        setupScreen.classList.add('hidden');
        mainGameArea.classList.remove('hidden');

    } catch (e) {
        console.error("Fehler in initializeGame:", e);
        errorMessage.textContent = `Fehler: ${e.message}`;
    } finally {
        loadingIndicator.classList.add('hidden');
        loadingIndicator.classList.remove('flex');
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Spiel generieren & starten!';
    }
}

function generateExcalidrawKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 22; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateRoomName() {
    return `wissen-champ-${Date.now()}`;
}

async function generateWhiteboardLinks() {
    whiteboardLinksContainer.innerHTML = '';
    gameState.whiteboardUrls = {};
    const linkPromises = gameState.teams.map(async (team) => {
        const roomName = generateRoomName();
        const encryptionKey = generateExcalidrawKey();
        const excalidrawUrl = `https://excalidraw.com/#room=${roomName},${encryptionKey}`;
        const shortUrl = await shortenUrl(excalidrawUrl);
        gameState.whiteboardUrls[team] = shortUrl;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(excalidrawUrl)}&qzone=1&bgcolor=1f2937&color=e5e7eb`;
        const linkElement = document.createElement('div');
        linkElement.className = 'bg-gray-800 p-4 rounded-lg border border-gray-600 hover:border-indigo-400 transition-colors flex flex-col items-center';
        linkElement.innerHTML = `<h3 class="text-lg font-bold mb-3 text-center text-yellow-300">${team}</h3><div class="flex flex-col items-center"><a href="${excalidrawUrl}" target="_blank" title="Excalidraw Whiteboard für ${team}"><img src="${qrCodeUrl}" alt="QR Code für ${team} - Excalidraw" class="rounded border border-gray-500 hover:border-indigo-400 transition-colors"></a><p class="text-xs text-gray-400 mt-2 text-center">Scanne für Whiteboard oder klicke Link:</p><a href="${shortUrl}" target="_blank" class="text-sm text-indigo-300 hover:underline mt-1 break-all">${shortUrl}</a></div>`;
        return linkElement;
    });
    const linkElements = await Promise.all(linkPromises);
    linkElements.forEach(element => whiteboardLinksContainer.appendChild(element));
}

function renderScoreboard() {
    scoreboard.innerHTML = '';
    gameState.teams.forEach(team => {
        const scoreElement = document.createElement('div');
        scoreElement.className = 'bg-gray-800 p-3 rounded-lg shadow-lg w-32';
        scoreElement.innerHTML = `<h3 class="text-md font-bold truncate">${team}</h3><p id="score-${team.replace(/\s+/g, '-')}" class="text-3xl font-bold text-yellow-300 mt-1">${gameState.scores[team]}</p>`;
        scoreboard.appendChild(scoreElement);
    });
}

function renderGameBoard() {
    const {
        categories,
        gameConfig
    } = gameState;
    gameBoard.innerHTML = '';
    gameScreen.classList.remove('hidden');
    const numColumns = categories.length;
    if (numColumns === 0) return;
    gameBoard.style.gridTemplateColumns = `repeat(${numColumns}, minmax(0, 1fr))`;
    categories.forEach(category => {
        const headerEl = document.createElement('div');
        headerEl.className = 'text-center font-bold text-sm sm:text-base bg-indigo-800 p-3 rounded-t-lg h-full flex items-center justify-center';
        headerEl.textContent = category.title;
        gameBoard.appendChild(headerEl);
    });
    for (let qIndex = 0; qIndex < gameConfig.numQuestions; qIndex++) {
        categories.forEach((category, catIndex) => {
            if (qIndex < category.questions.length) {
                const points = (qIndex + 1) * 100;
                const tile = document.createElement('div');
                tile.className = 'game-board-tile flex items-center justify-center text-xl sm:text-2xl font-bold h-20 sm:h-24 rounded-lg';
                tile.textContent = points;
                tile.dataset.catIndex = catIndex;
                tile.dataset.qIndex = qIndex;
                tile.dataset.points = points;
                tile.addEventListener('click', selectQuestion);
                gameBoard.appendChild(tile);
            } else {
                const emptyTile = document.createElement('div');
                gameBoard.appendChild(emptyTile);
            }
        });
    }
}

function selectQuestion(event) {
    const tile = event.currentTarget;
    if (tile.classList.contains('answered')) return;
    const {
        catIndex,
        qIndex,
        points
    } = tile.dataset;
    const category = gameState.categories[catIndex];
    const question = category.questions[qIndex];
    if (!question) {
        console.error(`Error: Question not found for catIndex ${catIndex}, qIndex ${qIndex}.`);
        return;
    }
    gameState.currentQuestion = { ...question,
        points: parseInt(points),
        tileElement: tile
    };
    questionCategory.textContent = `${category.title} - Für ${points} Punkte`;
    questionText.textContent = question.question_text;
    answerText.textContent = question.answer_text;
    answerText.classList.add('hidden');
    revealAnswerBtn.classList.remove('hidden');
    backToBoardBtn.classList.add('hidden');
    teacherControls.classList.add('hidden');
    whiteboardCheckLinks.classList.add('hidden');
    whiteboardCheckLinks.innerHTML = '';
    questionScreenContainer.classList.remove('hidden');
    questionScreenContainer.classList.add('flex');
    renderTeacherControls();
}

function renderTeacherControls() {
    teacherControls.innerHTML = '';
    const points = gameState.currentQuestion.points;
    gameState.teams.forEach(team => {
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'flex gap-2 items-center bg-gray-800 p-2 rounded-lg';
        buttonGroup.innerHTML = `<span class="font-bold w-24 truncate text-right">${team}</span><button class="btn btn-correct px-4 py-2" onclick="updateScore('${team}', ${points})">+${points}</button><button class="btn btn-incorrect px-4 py-2" onclick="updateScore('${team}', -${points})">-${points}</button>`;
        teacherControls.appendChild(buttonGroup);
    });
}

function revealAnswer() {
    answerText.classList.remove('hidden');
    revealAnswerBtn.classList.add('hidden');
    backToBoardBtn.classList.remove('hidden');
    teacherControls.classList.remove('hidden');
    whiteboardCheckLinks.innerHTML = '';
    for (const team in gameState.whiteboardUrls) {
        const url = gameState.whiteboardUrls[team];
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.className = 'btn btn-secondary';
        link.textContent = `Whiteboard ${team} prüfen`;
        whiteboardCheckLinks.appendChild(link);
    }
    whiteboardCheckLinks.classList.remove('hidden');
}

function updateScore(team, points) {
    gameState.scores[team] += points;
    const scoreDisplay = document.getElementById(`score-${team.replace(/\s+/g, '-')}`);
    scoreDisplay.textContent = gameState.scores[team];
    scoreDisplay.classList.add('transform', 'scale-125', 'text-green-400');
    setTimeout(() => {
        scoreDisplay.classList.remove('transform', 'scale-125', 'text-green-400');
        scoreDisplay.classList.add('text-yellow-300');
    }, 300);
}

function backToBoard() {
    if (gameState.currentQuestion?.tileElement) {
        gameState.currentQuestion.tileElement.textContent = '';
        gameState.currentQuestion.tileElement.classList.add('answered');
    }
    gameState.currentQuestion = null;
    questionScreenContainer.classList.add('hidden');
    questionScreenContainer.classList.remove('flex');
    whiteboardCheckLinks.classList.add('hidden');
    whiteboardCheckLinks.innerHTML = '';
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadApiKeyFromStorage();
    numTeamsInput.addEventListener('input', renderTeamNameInputs);
    renderTeamNameInputs(); // Initial render for default 2 teams

    // Tab functionality
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;

            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
});
startGameBtn.addEventListener('click', initializeGame);
revealAnswerBtn.addEventListener('click', revealAnswer);
backToBoardBtn.addEventListener('click', backToBoard);
