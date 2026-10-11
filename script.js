let questionsBank = [];
let generatedQuiz = [];
let currentQuestionIndex = 0;
let userScore = 0;
let selectedAnswerIndex = null;
let userTypedAnswerText = "";
let studentAnswersLog = [];
let countdownTimer = null;
let timeRemaining = 90;
let antiCheatWarnings = 0;
let currentStudent = null;
let examStartTime = 0;

const screens = {
    welcome: document.getElementById('screen-welcome'),
    dashboard: document.getElementById('screen-dashboard'),
    quiz: document.getElementById('screen-quiz'),
    result: document.getElementById('screen-result')
};

window.addEventListener('DOMContentLoaded', async () => {
    await fetchQuestions();
    setupSecurity();
    checkExistingAccount();

    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-start-new-exam').addEventListener('click', startExam);
    document.getElementById('btn-next').addEventListener('click', handleNext);
    document.getElementById('btn-back-dashboard').addEventListener('click', showDashboard);
    document.getElementById('btn-ack').addEventListener('click', dismissWarning);
});

async function fetchQuestions() {
    try {
        const res = await fetch('questions.json');
        questionsBank = await res.json();
    } catch (err) {
        console.error("خطأ في جلب الأسئلة:", err);
        alert("تعذر تحميل ملف questions.json. تأكد من وجوده في المستودع.");
    }
}

function checkExistingAccount() {
    const savedUser = localStorage.getItem('medlab_current_student');
    if (savedUser) {
        currentStudent = JSON.parse(savedUser);
        loadDashboardData();
        switchScreen('dashboard');
    } else {
        switchScreen('welcome');
    }
}

function handleLogin() {
    const nameInput = document.getElementById('student-name').value.trim();
    if (!nameInput) {
        alert("يرجى إدخال اسمك الثلاثي للبدء.");
        return;
    }

    let allStudents = JSON.parse(localStorage.getItem('medlab_all_profiles') || '{}');
    if (!allStudents[nameInput]) {
        allStudents[nameInput] = {
            name: nameInput,
            points: 0,
            examsCount: 0,
            bestScore: 0,
            history: []
        };
    }

    currentStudent = allStudents[nameInput];
    localStorage.setItem('medlab_current_student', JSON.stringify(currentStudent));
    localStorage.setItem('medlab_all_profiles', JSON.stringify(allStudents));

    loadDashboardData();
    switchScreen('dashboard');
}

function handleLogout() {
    localStorage.removeItem('medlab_current_student');
    document.getElementById('student-name').value = '';
    switchScreen('welcome');
}

function loadDashboardData() {
    let allStudents = JSON.parse(localStorage.getItem('medlab_all_profiles') || '{}');
    if (allStudents[currentStudent.name]) {
        currentStudent = allStudents[currentStudent.name];
    }

    document.getElementById('dash-name').textContent = currentStudent.name;
    document.getElementById('dash-total-points').textContent = currentStudent.points;
    document.getElementById('dash-total-exams').textContent = currentStudent.examsCount;
    document.getElementById('dash-best-score').textContent = currentStudent.bestScore + '%';

    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (currentStudent.history.length === 0) {
        historyList.innerHTML = '<div class="history-item"><span>لا توجد اختبارات مسجلة بعد. ابدأ الآن!</span></div>';
    } else {
        currentStudent.history.slice().reverse().forEach(record => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `<span>📅 ${record.date}</span> <span>النتيجة: <strong>${record.score}/20</strong> (${record.percentage})</span>`;
            historyList.appendChild(item);
        });
    }
}

function showDashboard() {
    loadDashboardData();
    switchScreen('dashboard');
}

function startExam() {
    if (questionsBank.length === 0) {
        alert("قاعدة بيانات الأسئلة فارغة.");
        return;
    }

    generatedQuiz = generateRandomExam(questionsBank, 20);
    currentQuestionIndex = 0;
    userScore = 0;
    antiCheatWarnings = 0;
    studentAnswersLog = [];
    examStartTime = Date.now();

    document.getElementById('display-student-name').textContent = currentStudent.name;

    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }

    switchScreen('quiz');
    loadQuestion();
}

// دالة خلط خيارات الاختيار من متعدد عشوائياً وتحديث موقع الإجابة الصحيحة
function shuffleOptionsAndGetNewIndex(optionsArray, originalCorrectIndex) {
    const combined = optionsArray.map((opt, idx) => ({
        text: opt,
        isCorrect: idx === originalCorrectIndex
    }));

    // خلط عشوائي خوارزمي (Fisher-Yates Shuffle)
    for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    const newCorrectIndex = combined.findIndex(item => item.isCorrect);
    const shuffledOptions = combined.map(item => item.text);

    return {
        options: shuffledOptions,
        correctIndex: newCorrectIndex,
        correctText: shuffledOptions[newCorrectIndex]
    };
}

function generateRandomExam(pool, count) {
    const shuffledPool = [...pool].sort(() => 0.5 - Math.random());
    const selectedPool = shuffledPool.slice(0, count);

    return selectedPool.map(item => {
        const isTypeOne = Math.random() < 0.5; // مزيج عشوائي بين النوعين
        
        if (isTypeOne) {
            return {
                image: item.image,
                type: 'text',
                question: item.type1.question,
                correctAnswer: item.type1.answer
            };
        } else {
            // تطبيق خلط الخيارات عشوائياً لضمان عدم ثبات الإجابة الصحيحة في مكان واحد
            const shuffledData = shuffleOptionsAndGetNewIndex(item.type2.options, item.type2.answer);
            return {
                image: item.image,
                type: 'mcq',
                question: item.type2.question,
                options: shuffledData.options,
                answerIndex: shuffledData.correctIndex,
                correctAnswerText: shuffledData.correctText
            };
        }
    });
}

function loadQuestion() {
    clearInterval(countdownTimer);
    timeRemaining = 90;
    updateTimerUI();

    selectedAnswerIndex = null;
    userTypedAnswerText = "";
    document.getElementById('btn-next').disabled = true;

    const q = generatedQuiz[currentQuestionIndex];
    document.getElementById('current-q-num').textContent = currentQuestionIndex + 1;
    document.getElementById('slide-image').src = q.image; // عرض الصورة المخصصة بدقة
    document.getElementById('question-title').textContent = q.question;

    const answerArea = document.getElementById('answer-area');
    answerArea.innerHTML = '';

    if (q.type === 'text') {
        const inputField = document.createElement('input');
        inputField.type = 'text';
        inputField.className = 'futuristic-input';
        inputField.placeholder = 'اكتب الإجابة التشخيصية هنا...';
        inputField.addEventListener('input', (e) => {
            userTypedAnswerText = e.target.value.trim();
            document.getElementById('btn-next').disabled = userTypedAnswerText === '';
        });
        answerArea.appendChild(inputField);
    } else {
        const optionsGrid = document.createElement('div');
        optionsGrid.className = 'options-container';
        q.options.forEach((optText, idx) => {
            const btn = document.createElement('div');
            btn.className = 'option-btn';
            btn.textContent = optText;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedAnswerIndex = idx;
                document.getElementById('btn-next').disabled = false;
            });
            optionsGrid.appendChild(btn);
        });
        answerArea.appendChild(optionsGrid);
    }

    startTimer();
}

function startTimer() {
    countdownTimer = setInterval(() => {
        timeRemaining--;
        updateTimerUI();
        if (timeRemaining <= 0) {
            clearInterval(countdownTimer);
            handleNext();
        }
    }, 1000);
}

function updateTimerUI() {
    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    document.getElementById('timer-text').textContent = `${m}:${s}`;
}

function handleNext() {
    clearInterval(countdownTimer);

    const q = generatedQuiz[currentQuestionIndex];
    let isCorrect = false;
    let studentGivenAns = "";
    let correctAnsText = "";

    if (q.type === 'text') {
        studentGivenAns = userTypedAnswerText || "(لم يتم الإدخال)";
        correctAnsText = q.correctAnswer;
        const typed = studentGivenAns.toLowerCase();
        const correct = q.correctAnswer.toLowerCase();
        if (typed.length > 0 && (correct.includes(typed) || typed.includes(correct))) {
            userScore++;
            isCorrect = true;
        }
    } else {
        studentGivenAns = selectedAnswerIndex !== null ? q.options[selectedAnswerIndex] : "(لم يتم الاختيار)";
        correctAnsText = q.correctAnswerText;
        if (selectedAnswerIndex === q.answerIndex) {
            userScore++;
            isCorrect = true;
        }
    }

    studentAnswersLog.push({
        question: q.question,
        studentAnswer: studentGivenAns,
        correctAnswer: correctAnsText,
        isCorrect: isCorrect
    });

    currentQuestionIndex++;
    if (currentQuestionIndex < generatedQuiz.length) {
        loadQuestion();
    } else {
        finishExam();
    }
}

function finishExam() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    const totalSec = Math.floor((Date.now() - examStartTime) / 1000);
    const timeFormatted = `${Math.floor(totalSec / 60).toString().padStart(2, '0')}:${(totalSec % 60).toString().padStart(2, '0')}`;
    const percentage = Math.round((userScore / 20) * 100);
    const currentDate = new Date().toLocaleString('ar-EG');

    currentStudent.points += userScore;
    currentStudent.examsCount += 1;
    if (percentage > currentStudent.bestScore) {
        currentStudent.bestScore = percentage;
    }

    const examRecord = {
        date: currentDate,
        score: userScore,
        percentage: percentage + '%',
        time: timeFormatted,
        details: studentAnswersLog
    };
    currentStudent.history.push(examRecord);

    let allStudents = JSON.parse(localStorage.getItem('medlab_all_profiles') || '{}');
    allStudents[currentStudent.name] = currentStudent;
    localStorage.setItem('medlab_all_profiles', JSON.stringify(allStudents));
    localStorage.setItem('medlab_current_student', JSON.stringify(currentStudent));

    document.getElementById('res-student-name').textContent = currentStudent.name;
    document.getElementById('res-date').textContent = currentDate;
    document.getElementById('final-score').textContent = userScore;
    document.getElementById('final-percentage').textContent = percentage + '%';
    document.getElementById('stat-points').textContent = `+${userScore}`;
    document.getElementById('stat-time').textContent = timeFormatted;

    const evalText = document.getElementById('evaluation-text');
    if (percentage >= 85) evalText.textContent = "أداء استثنائي مذهل! كفاءة عالية في تشخيص الشرائح.";
    else if (percentage >= 65) evalText.textContent = "أداء جيد جداً، مهاراتك المختبرية واعدة.";
    else evalText.textContent = "تحتاج لمراجعة إضافية للشرائح النسيجية.";

    const reviewList = document.getElementById('review-list');
    reviewList.innerHTML = '';

    studentAnswersLog.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = `review-card ${item.isCorrect ? 'correct' : 'wrong'}`;
        card.innerHTML = `
            <div class="review-q">س${idx + 1}: ${item.question}</div>
            <div class="review-ans">
                <span class="user-ans">إجابتك: ${item.studentAnswer}</span>
                <span class="correct-ans">الإجابة الصحيحة: ${item.correctAnswer}</span>
            </div>
        `;
        reviewList.appendChild(card);
    });

    switchScreen('result');
}

function setupSecurity() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && screens.quiz.classList.contains('active')) {
            antiCheatWarnings++;
            document.getElementById('warn-count').textContent = antiCheatWarnings;
            document.getElementById('anti-cheat-overlay').style.display = 'flex';
            clearInterval(countdownTimer);

            if (antiCheatWarnings >= 3) {
                alert("تم تجاوز الحد الأقصى للتنبيهات الأمنية. إنهاء الاختبار تلقائياً.");
                finishExam();
            }
        }
    });
}

function dismissWarning() {
    document.getElementById('anti-cheat-overlay').style.display = 'none';
    if (currentQuestionIndex < generatedQuiz.length) {
        startTimer();
    }
}

function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}