document.addEventListener('DOMContentLoaded', () => {
    let standardQuestions = [];
    let caqQuestions = [];
    let allQuestions = [];
    let currentBank = 'standard';
    
    let topicsMap = new Map(); 
    let currentTopicName = '';
    let currentQuizIndex = 0;
    let currentQuizQuestions = [];
    
    // Speedrun Mode State
    let currentQuestionIndex = 0;
    let score = 0;
    
    // Mastery Mode State
    let isMasteryMode = localStorage.getItem('quizMode') === 'mastery';
    let masteryQueue = [];
    let masteryTracking = {};
    let totalMasteryRequired = 0;
    
    // Load scores from localStorage
    let scoresData = JSON.parse(localStorage.getItem('quizScores')) || {};
    let masteryScoresData = JSON.parse(localStorage.getItem('quizMasteryScores')) || {};

    // DOM Elements
    const topicScreen = document.getElementById('topic-screen');
    const subtopicScreen = document.getElementById('subtopic-screen');
    const quizScreen = document.getElementById('quiz-screen');
    const resultsScreen = document.getElementById('results-screen');
    
    const topicContainer = document.getElementById('topic-container');
    const subtopicContainer = document.getElementById('subtopic-container');
    const subtopicTitle = document.getElementById('subtopic-title');
    
    const modeToggle = document.getElementById('mode-toggle');
    const speedrunLabel = document.getElementById('speedrun-label');
    const masteryLabel = document.getElementById('mastery-label');
    const modeDescription = document.getElementById('mode-description');
    
    const questionText = document.getElementById('question-text');
    const choicesContainer = document.getElementById('choices-container');
    const nextBtn = document.getElementById('next-btn');
    const backBtn = document.getElementById('back-btn');
    const backToTopicsBtn = document.getElementById('back-to-topics-btn');
    const homeBtn = document.getElementById('home-btn');
    
    const progressText = document.getElementById('progress-text');
    const progressFill = document.getElementById('progress-fill');
    const currentScoreEl = document.getElementById('current-score');
    
    const finalScoreText = document.getElementById('final-score-text');
    const scoreMessage = document.getElementById('score-message');

    // Modal Logic
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmResetBtn = document.getElementById('confirm-reset-btn');
    const cancelResetBtn = document.getElementById('cancel-reset-btn');

    let onConfirmCallback = null;

    function showConfirmModal(message, callback) {
        confirmMessage.textContent = message;
        onConfirmCallback = callback;
        confirmModal.classList.add('active');
    }

    cancelResetBtn.addEventListener('click', () => {
        confirmModal.classList.remove('active');
        onConfirmCallback = null;
    });

    confirmResetBtn.addEventListener('click', () => {
        confirmModal.classList.remove('active');
        if (onConfirmCallback) onConfirmCallback();
    });

    // Session Persistence
    const ACTIVE_SESSION_KEY = 'quizActiveSession';

    function saveSession() {
        const sessionData = {
            topicName: currentTopicName,
            quizIndex: currentQuizIndex,
            mode: isMasteryMode ? 'mastery' : 'speedrun',
            currentQuizQuestions,
            currentQuestionIndex,
            score,
            masteryQueue,
            masteryTracking,
            totalMasteryRequired
        };
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(sessionData));
    }

    function clearSession(topicName, quizIndex) {
        let savedSessionStr = localStorage.getItem(ACTIVE_SESSION_KEY);
        if (savedSessionStr) {
            let savedSession = JSON.parse(savedSessionStr);
            let shouldClear = true;
            if (topicName && savedSession.topicName !== topicName) shouldClear = false;
            if (quizIndex !== undefined && savedSession.quizIndex !== quizIndex) shouldClear = false;
            
            if (shouldClear) {
                localStorage.removeItem(ACTIVE_SESSION_KEY);
            }
        }
    }

    const btnBankStandard = document.getElementById('btn-bank-standard');
    const btnBankCaq = document.getElementById('btn-bank-caq');

    // Fetch data
    Promise.all([
        fetch('extracted_questions.json', { cache: 'no-cache' }).then(res => res.json()).catch(err => { console.error(err); return []; }),
        fetch('caq_questions.json', { cache: 'no-cache' }).then(res => res.json()).catch(err => { console.error(err); return []; })
    ]).then(([standardData, caqData]) => {
        let globalId = 0;
        standardQuestions = standardData.map(q => ({ ...q, id: globalId++ }));
        caqQuestions = caqData.map(q => ({ ...q, id: globalId++ }));
        
        allQuestions = standardQuestions;
        processTopics();
    }).catch(err => {
        console.error('Error loading questions:', err);
        topicContainer.innerHTML = `<p style="color:var(--wrong); grid-column: 1/-1; text-align: center;">Failed to load questions. Please ensure you are viewing this via a local web server.</p>`;
    });

    btnBankStandard.addEventListener('click', () => {
        currentBank = 'standard';
        btnBankStandard.classList.add('active');
        btnBankCaq.classList.remove('active');
        allQuestions = standardQuestions;
        processTopics();
    });

    btnBankCaq.addEventListener('click', () => {
        currentBank = 'caq';
        btnBankCaq.classList.add('active');
        btnBankStandard.classList.remove('active');
        allQuestions = caqQuestions;
        processTopics();
    });

    modeToggle.checked = isMasteryMode;

    function updateModeUI() {
        if(isMasteryMode) {
            masteryLabel.style.color = '#a855f7';
            masteryLabel.style.fontWeight = '600';
            speedrunLabel.style.color = 'var(--text-muted)';
            speedrunLabel.style.fontWeight = 'normal';
            modeDescription.innerHTML = `<strong>Mastery Mode:</strong> Questions repeat until answered correctly twice in a row. Best for deep learning and retention!`;
        } else {
            speedrunLabel.style.color = 'var(--primary)';
            speedrunLabel.style.fontWeight = '600';
            masteryLabel.style.color = 'var(--text-muted)';
            masteryLabel.style.fontWeight = 'normal';
            modeDescription.innerHTML = `<strong>Speedrun Mode:</strong> Answer each question once. Good for a quick test of your current knowledge.`;
        }
    }

    updateModeUI();

    modeToggle.addEventListener('change', (e) => {
        isMasteryMode = e.target.checked;
        localStorage.setItem('quizMode', isMasteryMode ? 'mastery' : 'speedrun');
        updateModeUI();
        renderTopics(); // Refresh topic cards to show current mode's stats
    });

    function processTopics() {
        topicsMap.clear();
        
        let tempMap = new Map();
        allQuestions.forEach(q => {
            if (!tempMap.has(q.topic_name)) {
                tempMap.set(q.topic_name, []);
            }
            tempMap.get(q.topic_name).push(q);
        });

        tempMap.forEach((questions, topicName) => {
            let chunks = [];
            for (let i = 0; i < questions.length; i += 50) {
                chunks.push(questions.slice(i, i + 50));
            }
            topicsMap.set(topicName, chunks);
        });

        renderTopics();
    }

    function renderTopics() {
        topicContainer.innerHTML = '';
        topicsMap.forEach((quizzes, topicName) => {
            const card = document.createElement('div');
            card.className = 'topic-card';
            card.style.position = 'relative';
            let displayName = topicName.replace(/_/g, ' ');
            
            let totalQuestions = quizzes.reduce((sum, q) => sum + q.length, 0);
            let scoreText = '';
            
            let savedSessionStr = localStorage.getItem(ACTIVE_SESSION_KEY);
            let savedSession = savedSessionStr ? JSON.parse(savedSessionStr) : null;

            if (isMasteryMode) {
                let topicMasteryData = masteryScoresData[topicName] || {};
                let masteredQuestionsCount = 0;
                Object.keys(topicMasteryData).forEach(quizIndex => {
                    masteredQuestionsCount += quizzes[quizIndex].length;
                });
                let masteredPercentage = Math.round((masteredQuestionsCount / totalQuestions) * 100);
                let isActiveHere = savedSession && savedSession.topicName === topicName && savedSession.mode === 'mastery';
                
                if (masteredQuestionsCount > 0) {
                    scoreText = `<p class="score-badge">Mastered: ${masteredPercentage}%</p>`;
                } else if (isActiveHere) {
                    let currentMasteryPoints = 0;
                    Object.values(savedSession.masteryTracking).forEach(val => currentMasteryPoints += val);
                    let percentage = Math.round((currentMasteryPoints / savedSession.totalMasteryRequired) * 100);
                    scoreText = `<p class="score-badge untouched" style="color: #fbbf24; border-color: rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.1);">In Progress: ${percentage}%</p>`;
                } else {
                    scoreText = `<p class="score-badge untouched">Not mastered</p>`;
                }
            } else {
                let topicScoreData = scoresData[topicName] || {};
                let answeredScore = 0;
                let answeredTotal = 0; 
                
                Object.values(topicScoreData).forEach(quizScore => {
                    answeredScore += quizScore.score;
                    answeredTotal += quizScore.total;
                });
                
                let isActiveHere = savedSession && savedSession.topicName === topicName && savedSession.mode === 'speedrun';

                if (answeredTotal > 0) {
                    scoreText = `<p class="score-badge">Score: ${answeredScore}/${totalQuestions} (${Math.round((answeredScore / totalQuestions) * 100)}%)</p>`;
                } else if (isActiveHere) {
                    scoreText = `<p class="score-badge untouched" style="color: #fbbf24; border-color: rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.1);">In Progress: Q${savedSession.currentQuestionIndex + 1}/${savedSession.currentQuizQuestions.length}</p>`;
                } else {
                    scoreText = `<p class="score-badge untouched">Not started</p>`;
                }
            }

            card.innerHTML = `
                <button class="reset-btn" title="Reset Topic Score">↺</button>
                <h3>${displayName}</h3>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-top:0.5rem;">${totalQuestions} Questions (${quizzes.length} Parts)</p>
                ${scoreText}
            `;
            
            const resetBtn = card.querySelector('.reset-btn');
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirmModal(`Are you sure you want to reset your score for ${displayName}?`, () => {
                    clearSession(topicName);
                    if (isMasteryMode) {
                        delete masteryScoresData[topicName];
                        localStorage.setItem('quizMasteryScores', JSON.stringify(masteryScoresData));
                    } else {
                        delete scoresData[topicName];
                        localStorage.setItem('quizScores', JSON.stringify(scoresData));
                    }
                    renderTopics();
                });
            });

            card.addEventListener('click', () => showSubtopics(topicName));
            topicContainer.appendChild(card);
        });
    }

    function showSubtopics(topicName) {
        currentTopicName = topicName;
        let displayName = topicName.replace(/_/g, ' ');
        subtopicTitle.textContent = displayName;
        subtopicContainer.innerHTML = '';
        
        const quizzes = topicsMap.get(topicName);
        let topicScoreData = scoresData[topicName] || {};

        quizzes.forEach((quizQuestions, index) => {
            const card = document.createElement('div');
            card.className = 'topic-card';
            card.style.position = 'relative';
            
            let startNum = index * 50 + 1;
            let endNum = startNum + quizQuestions.length - 1;
            
            let scoreHtml = '';
            
            let savedSessionStr = localStorage.getItem(ACTIVE_SESSION_KEY);
            let savedSession = savedSessionStr ? JSON.parse(savedSessionStr) : null;
            
            if (isMasteryMode) {
                let topicMasteryData = masteryScoresData[topicName] || {};
                let isMastered = topicMasteryData[index];
                let isActiveHere = savedSession && savedSession.topicName === topicName && savedSession.quizIndex === index && savedSession.mode === 'mastery';
                
                if (isMastered) {
                    scoreHtml = `<p class="score-badge">Mastered ✓</p>`;
                } else if (isActiveHere) {
                    let currentMasteryPoints = 0;
                    Object.values(savedSession.masteryTracking).forEach(val => currentMasteryPoints += val);
                    let percentage = Math.round((currentMasteryPoints / savedSession.totalMasteryRequired) * 100);
                    scoreHtml = `<p class="score-badge untouched" style="color: #fbbf24; border-color: rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.1);">In Progress: ${percentage}%</p>`;
                } else {
                    scoreHtml = `<p class="score-badge untouched">Not mastered</p>`;
                }
            } else {
                let topicScoreData = scoresData[topicName] || {};
                let bestScore = topicScoreData[index];
                let isActiveHere = savedSession && savedSession.topicName === topicName && savedSession.quizIndex === index && savedSession.mode === 'speedrun';
                
                if (isActiveHere) {
                    scoreHtml = `<p class="score-badge untouched" style="color: #fbbf24; border-color: rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.1);">In Progress: Q${savedSession.currentQuestionIndex + 1}/${savedSession.currentQuizQuestions.length}</p>`;
                } else if (bestScore) {
                    scoreHtml = `<p class="score-badge">Best Score: ${bestScore.score}/${bestScore.total} (${Math.round((bestScore.score/bestScore.total)*100)}%)</p>`;
                } else {
                    scoreHtml = `<p class="score-badge untouched">Not started</p>`;
                }
            }

            card.innerHTML = `
                <button class="reset-btn" title="Reset Quiz Score">↺</button>
                <h3>Quiz ${index + 1}</h3>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-top:0.5rem;">Questions ${startNum} - ${endNum}</p>
                ${scoreHtml}
            `;
            
            const resetBtn = card.querySelector('.reset-btn');
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirmModal(`Are you sure you want to reset your score for Quiz ${index + 1}?`, () => {
                    clearSession(topicName, index);
                    if (isMasteryMode) {
                        if (masteryScoresData[topicName]) {
                            delete masteryScoresData[topicName][index];
                            localStorage.setItem('quizMasteryScores', JSON.stringify(masteryScoresData));
                        }
                    } else {
                        if (scoresData[topicName]) {
                            delete scoresData[topicName][index];
                            localStorage.setItem('quizScores', JSON.stringify(scoresData));
                        }
                    }
                    showSubtopics(topicName);
                });
            });

            card.addEventListener('click', () => startQuiz(topicName, index));
            subtopicContainer.appendChild(card);
        });
        
        switchScreen(subtopicScreen);
    }

    function startQuiz(topicName, quizIndex) {
        currentTopicName = topicName;
        currentQuizIndex = quizIndex;
        
        let savedSessionStr = localStorage.getItem(ACTIVE_SESSION_KEY);
        let savedSession = savedSessionStr ? JSON.parse(savedSessionStr) : null;
        let modeStr = isMasteryMode ? 'mastery' : 'speedrun';

        if (savedSession && 
            savedSession.topicName === topicName && 
            savedSession.quizIndex === quizIndex && 
            savedSession.mode === modeStr) {
            
            currentQuizQuestions = savedSession.currentQuizQuestions;
            if (isMasteryMode) {
                masteryQueue = savedSession.masteryQueue;
                masteryTracking = savedSession.masteryTracking;
                totalMasteryRequired = savedSession.totalMasteryRequired;
            } else {
                currentQuestionIndex = savedSession.currentQuestionIndex;
                score = savedSession.score;
            }
        } else {
            currentQuizQuestions = [...topicsMap.get(topicName)[quizIndex]];
            shuffleArray(currentQuizQuestions);
            
            if (isMasteryMode) {
                masteryQueue = [...currentQuizQuestions];
                masteryTracking = {};
                currentQuizQuestions.forEach(q => masteryTracking[q.id] = 0);
                totalMasteryRequired = currentQuizQuestions.length * 2;
            } else {
                currentQuestionIndex = 0;
                score = 0;
            }
        }
        
        switchScreen(quizScreen);
        renderQuestion();
    }

    function renderQuestion() {
        saveSession();
        let question;
        if (isMasteryMode) {
            question = masteryQueue[0];
            
            let currentMasteryPoints = 0;
            Object.values(masteryTracking).forEach(val => currentMasteryPoints += val);
            
            currentScoreEl.textContent = `${currentMasteryPoints}/${totalMasteryRequired} pts`;
            progressText.textContent = `Queue: ${masteryQueue.length} unmastered`;
            
            const progressPercentage = (currentMasteryPoints / totalMasteryRequired) * 100;
            progressFill.style.width = `${progressPercentage}%`;
        } else {
            question = currentQuizQuestions[currentQuestionIndex];
            
            currentScoreEl.textContent = score;
            progressText.textContent = `Question ${currentQuestionIndex + 1} of ${currentQuizQuestions.length}`;
            const progressPercentage = ((currentQuestionIndex) / currentQuizQuestions.length) * 100;
            progressFill.style.width = `${progressPercentage}%`;
        }
        
        questionText.textContent = question.question_text;
        choicesContainer.innerHTML = '';
        nextBtn.classList.add('hidden');
        
        const choices = shuffleChoices(question.choices);
        
        choices.forEach(choiceText => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choiceText;
            btn.addEventListener('click', () => handleChoice(btn, choiceText, question.answer, question));
            choicesContainer.appendChild(btn);
        });
    }

    function handleChoice(selectedBtn, selectedText, correctText, question) {
        const allBtns = choicesContainer.querySelectorAll('.choice-btn');
        allBtns.forEach(btn => btn.disabled = true);
        
        const isCorrect = selectedText === correctText;
        
        if (isCorrect) {
            selectedBtn.classList.add('correct');
            if (isMasteryMode) {
                masteryTracking[question.id]++;
            } else {
                score++;
                currentScoreEl.textContent = score;
            }
        } else {
            selectedBtn.classList.add('wrong');
            allBtns.forEach(btn => {
                if (btn.textContent === correctText) {
                    btn.classList.add('correct');
                }
            });
            if (isMasteryMode) {
                masteryTracking[question.id] = 0;
            }
        }
        
        if (isMasteryMode) {
            let currentMasteryPoints = 0;
            Object.values(masteryTracking).forEach(val => currentMasteryPoints += val);
            currentScoreEl.textContent = `${currentMasteryPoints}/${totalMasteryRequired} pts`;
            
            const progressPercentage = (currentMasteryPoints / totalMasteryRequired) * 100;
            progressFill.style.width = `${progressPercentage}%`;
            
            let isDone = masteryTracking[question.id] === 2;
            if (masteryQueue.length === 1 && isDone) {
                nextBtn.textContent = 'Finish Quiz →';
            } else {
                nextBtn.textContent = 'Next Question →';
            }
        } else {
            const progressPercentage = ((currentQuestionIndex + 1) / currentQuizQuestions.length) * 100;
            progressFill.style.width = `${progressPercentage}%`;
            
            if (currentQuestionIndex < currentQuizQuestions.length - 1) {
                nextBtn.textContent = 'Next Question →';
            } else {
                nextBtn.textContent = 'Finish Quiz →';
            }
        }
        
        nextBtn.classList.remove('hidden');
    }

    function nextQuestion() {
        if (isMasteryMode) {
            let justAnswered = masteryQueue.shift();
            
            if (masteryTracking[justAnswered.id] < 2) {
                // Requeue at a random position
                let insertIndex = Math.floor(Math.random() * (masteryQueue.length + 1));
                masteryQueue.splice(insertIndex, 0, justAnswered);
            }
            
            if (masteryQueue.length > 0) {
                renderQuestion();
            } else {
                finishQuiz();
            }
        } else {
            currentQuestionIndex++;
            if (currentQuestionIndex < currentQuizQuestions.length) {
                renderQuestion();
            } else {
                finishQuiz();
            }
        }
    }

    function finishQuiz() {
        clearSession();
        if (isMasteryMode) {
            if (!masteryScoresData[currentTopicName]) masteryScoresData[currentTopicName] = {};
            masteryScoresData[currentTopicName][currentQuizIndex] = true;
            localStorage.setItem('quizMasteryScores', JSON.stringify(masteryScoresData));
            showResults();
        } else {
            if (!scoresData[currentTopicName]) scoresData[currentTopicName] = {};
            let previousBest = scoresData[currentTopicName][currentQuizIndex];
            
            if (!previousBest || score > previousBest.score) {
                scoresData[currentTopicName][currentQuizIndex] = { score: score, total: currentQuizQuestions.length };
                localStorage.setItem('quizScores', JSON.stringify(scoresData));
            }
            
            showResults(score);
        }
    }

    function showResults(finalScore) {
        switchScreen(resultsScreen);
        
        if (isMasteryMode) {
            finalScoreText.textContent = `Mastered!`;
            scoreMessage.textContent = 'You successfully mastered all questions in this part.';
        } else {
            finalScoreText.textContent = `${finalScore}/${currentQuizQuestions.length}`;
            
            const percentage = finalScore / currentQuizQuestions.length;
            if (percentage >= 0.9) scoreMessage.textContent = 'Excellent! You mastered this part.';
            else if (percentage >= 0.7) scoreMessage.textContent = 'Great job! You have a solid understanding.';
            else if (percentage >= 0.5) scoreMessage.textContent = 'Good effort! A little more practice will help.';
            else scoreMessage.textContent = 'Keep studying! You will get better next time.';
        }
    }

    function switchScreen(screenEl) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screenEl.classList.add('active');
        window.scrollTo(0, 0);
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function shuffleChoices(choices) {
        const specialRegex = /all of the above|all of these|none of the above|none of these|both.*and|neither.*nor/i;
        let normalChoices = [];
        let specialChoices = [];
        
        choices.forEach(c => {
            if(specialRegex.test(c)) {
                specialChoices.push(c);
            } else {
                normalChoices.push(c);
            }
        });
        
        shuffleArray(normalChoices);
        return [...normalChoices, ...specialChoices];
    }

    nextBtn.addEventListener('click', nextQuestion);
    
    backBtn.addEventListener('click', () => {
        showSubtopics(currentTopicName);
    });
    
    backToTopicsBtn.addEventListener('click', () => {
        renderTopics();
        switchScreen(topicScreen);
    });
    
    homeBtn.addEventListener('click', () => {
        showSubtopics(currentTopicName); 
    });
});
