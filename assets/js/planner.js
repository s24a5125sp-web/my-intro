/* planner.js */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let tasks = [];
    let exams = [];
    let activeCategory = 'study';
    let editingTaskId = null;
    let notifiedTasks = {};

    // DOM Elements - Tasks
    const taskForm = document.getElementById('task-form');
    const titleInput = document.getElementById('task-title-input');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const reminderTimeInput = document.getElementById('reminder-time');
    const descInput = document.getElementById('task-desc');
    const categoryBadges = document.querySelectorAll('.category-badge');
    const submitBtn = document.getElementById('submit-btn');
    const timelineGrid = document.querySelector('.timeline-grid');
    const taskListContainer = document.getElementById('task-list-container');
    const currentDateDisplay = document.getElementById('current-date');
    const timeIndicator = document.getElementById('time-indicator');
    const scrollContainer = document.getElementById('timeline-scroll-container');
    const emptyState = document.getElementById('empty-state');

    // DOM Elements - Exams
    const examForm = document.getElementById('exam-form');
    const examTitleInput = document.getElementById('exam-title-input');
    const examDateInput = document.getElementById('exam-date-input');
    const examListContainer = document.getElementById('exam-list-container');

    // DOM Elements - Global
    const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    const toastContainer = document.getElementById('toast-container');

    // Layout configuration
    const HOUR_HEIGHT = 80; // 1 hour = 80px in planner.css

    // --- Notification Helpers ---
    function initNotifications() {
        if (!('Notification' in window)) {
            enableNotificationsBtn.style.display = 'none';
            return;
        }

        if (Notification.permission === 'granted') {
            updateNotificationBtn(true);
        } else {
            updateNotificationBtn(false);
        }

        enableNotificationsBtn.addEventListener('click', () => {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    updateNotificationBtn(true);
                    showToast('🔔 通知が有効になりました', '今後のリマインダーはこちらに通知されます。');
                } else {
                    updateNotificationBtn(false);
                }
            });
        });
    }

    function updateNotificationBtn(granted) {
        if (granted) {
            enableNotificationsBtn.textContent = '🔔 通知設定: ON';
            enableNotificationsBtn.classList.add('granted');
        } else {
            enableNotificationsBtn.textContent = '🔔 通知を許可する';
            enableNotificationsBtn.classList.remove('granted');
        }
    }

    // Play synthesized sound via Web Audio API (No external asset needed)
    function playNotificationSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const playBeep = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                
                osc.start(startTime);
                osc.stop(startTime + duration);
            };
            
            const now = ctx.currentTime;
            playBeep(880, now, 0.12);       // A5
            playBeep(1100, now + 0.1, 0.2); // C#6
        } catch (e) {
            console.error("Audio playback failed:", e);
        }
    }

    // App internal Toast Notification
    function showToast(title, body, actions = null) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        
        toast.innerHTML = `
            <div class="toast-header">
                <span class="toast-title">🔔 ${escapeHTML(title)}</span>
                <button class="toast-close">×</button>
            </div>
            <div class="toast-body">${escapeHTML(body)}</div>
        `;

        if (actions) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'toast-actions';
            
            actions.forEach(act => {
                const btn = document.createElement('button');
                btn.className = `toast-btn ${act.primary ? 'toast-btn-primary' : 'toast-btn-secondary'}`;
                btn.textContent = act.text;
                btn.addEventListener('click', () => {
                    act.onClick();
                    dismissToast();
                });
                actionsDiv.appendChild(btn);
            });
            toast.appendChild(actionsDiv);
        }

        const dismissToast = () => {
            toast.classList.add('closing');
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        };

        toast.querySelector('.toast-close').addEventListener('click', dismissToast);
        
        // Auto-dismiss after 8 seconds if no custom actions (like snooze/complete)
        if (!actions) {
            setTimeout(dismissToast, 8000);
        }

        toastContainer.appendChild(toast);
        playNotificationSound();
    }

    // Push Notification using Web Notification API
    function showWebNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body: body
                });
            } catch (e) {
                console.error("Failed to trigger web notification:", e);
            }
        }
    }

    // --- Date & Time Helper Functions ---

    // Update Current Date Display
    function updateDateDisplay() {
        const now = new Date();
        const options = { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' };
        currentDateDisplay.textContent = now.toLocaleDateString('ja-JP', options);
    }

    // Convert time string "HH:MM" to minutes from 00:00
    function timeStringToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // Convert minutes from 00:00 to absolute Y position (pixels)
    function minutesToYPosition(minutes) {
        return (minutes / 60) * HOUR_HEIGHT;
    }

    // Update Current Time Indicator position
    function updateTimeIndicator() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        const yPos = minutesToYPosition(totalMinutes);
        
        timeIndicator.style.top = `${yPos}px`;
        timeIndicator.style.display = 'block';
    }

    // Scroll to current time position
    function scrollToCurrentTime() {
        const now = new Date();
        const hours = now.getHours();
        const totalMinutes = hours * 60;
        const yPos = minutesToYPosition(totalMinutes);
        
        const containerHeight = scrollContainer.clientHeight;
        scrollContainer.scrollTop = yPos - (containerHeight / 2) + 40;
    }

    // --- LocalStorage Logic ---
    function loadData() {
        // Load Tasks
        const storedTasks = localStorage.getItem('ui_planner_tasks');
        if (storedTasks) {
            try {
                tasks = JSON.parse(storedTasks);
            } catch (e) {
                console.error("Failed to parse stored tasks:", e);
                tasks = [];
            }
        } else {
            // Default sample tasks
            tasks = [
                {
                    id: 'sample-1',
                    title: '数学の復習 📝',
                    startTime: '09:00',
                    endTime: '10:30',
                    category: 'study',
                    reminderTime: '5',
                    description: '教科書の第3章の例題を解く',
                    completed: false
                },
                {
                    id: 'sample-2',
                    title: '英単語の暗記 🇬🇧',
                    startTime: '13:00',
                    endTime: '14:00',
                    category: 'study',
                    reminderTime: '0',
                    description: 'ターゲット1900のセクション10を復習',
                    completed: false
                },
                {
                    id: 'sample-3',
                    title: '夕方のリフレッシュラン 🏃‍♂️',
                    startTime: '17:00',
                    endTime: '18:00',
                    category: 'sports',
                    reminderTime: 'none',
                    description: '近くの運動公園を3周走る',
                    completed: false
                }
            ];
            saveTasks();
        }

        // Load Exams
        const storedExams = localStorage.getItem('ui_planner_exams');
        if (storedExams) {
            try {
                exams = JSON.parse(storedExams);
            } catch (e) {
                console.error("Failed to parse stored exams:", e);
                exams = [];
            }
        } else {
            // Sample exam
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 3);
            tomorrow.setHours(9, 0, 0, 0);
            
            exams = [
                {
                    id: 'sample-exam-1',
                    title: '期末テスト (数学I)',
                    date: tomorrow.toISOString()
                }
            ];
            saveExams();
        }

        // Load Notified log
        const storedLog = localStorage.getItem('ui_planner_notified_log');
        if (storedLog) {
            try {
                notifiedTasks = JSON.parse(storedLog);
            } catch (e) {
                notifiedTasks = {};
            }
        }
    }

    function saveTasks() {
        localStorage.setItem('ui_planner_tasks', JSON.stringify(tasks));
    }

    function saveExams() {
        localStorage.setItem('ui_planner_exams', JSON.stringify(exams));
    }

    function saveNotifiedLog() {
        localStorage.setItem('ui_planner_notified_log', JSON.stringify(notifiedTasks));
    }

    // --- Category Badge Handlers ---
    categoryBadges.forEach(badge => {
        badge.addEventListener('click', () => {
            categoryBadges.forEach(b => b.classList.remove('active'));
            badge.classList.add('active');
            activeCategory = badge.getAttribute('data-cat');
        });
    });

    // --- Timeline Layout Overlap Resolution ---
    function resolveOverlaps(tasksList) {
        const sorted = [...tasksList].sort((a, b) => {
            return timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime);
        });

        const columns = [];

        sorted.forEach(task => {
            const start = timeStringToMinutes(task.startTime);
            
            let placed = false;
            for (let i = 0; i < columns.length; i++) {
                const lastTaskInCol = columns[i][columns[i].length - 1];
                const lastEnd = timeStringToMinutes(lastTaskInCol.endTime);
                
                if (start >= lastEnd) {
                    columns[i].push(task);
                    placed = true;
                    break;
                }
            }
            
            if (!placed) {
                columns.push([task]);
            }
        });

        const positionMeta = {};
        columns.forEach((col, colIndex) => {
            col.forEach(task => {
                positionMeta[task.id] = {
                    colIndex: colIndex,
                    totalCols: columns.length
                };
            });
        });

        sorted.forEach(task1 => {
            const start1 = timeStringToMinutes(task1.startTime);
            const end1 = timeStringToMinutes(task1.endTime);
            
            const overlappingTasks = sorted.filter(task2 => {
                const start2 = timeStringToMinutes(task2.startTime);
                const end2 = timeStringToMinutes(task2.endTime);
                return (start1 < end2 && end1 > start2);
            });

            const cols = overlappingTasks.map(t => positionMeta[t.id].colIndex);
            const maxColIdx = Math.max(...cols);
            
            positionMeta[task1.id].totalCols = Math.max(overlappingTasks.length, maxColIdx + 1);
        });

        return positionMeta;
    }

    // --- Reminder Engine ---
    function checkReminders() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        const currentMinsTotal = currentHour * 60 + currentMin;
        const todayStr = now.toDateString(); // To track days

        tasks.forEach(task => {
            if (task.completed || !task.reminderTime || task.reminderTime === 'none') return;

            const reminderOffset = parseInt(task.reminderTime);
            const startMins = timeStringToMinutes(task.startTime);
            const triggerMins = startMins - reminderOffset;

            // Trigger when current time hits trigger time (and before task end)
            if (currentMinsTotal >= triggerMins && currentMinsTotal < startMins + 5) {
                const logKey = `${task.id}_${triggerMins}_${todayStr}`;
                
                if (!notifiedTasks[logKey]) {
                    // Mark as notified immediately to prevent loops
                    notifiedTasks[logKey] = true;
                    saveNotifiedLog();

                    const timeLabel = reminderOffset === 0 ? '開始時間ちょうど' : `${reminderOffset}分前`;
                    const titleText = `予定の通知: ${task.title}`;
                    const bodyText = `${task.startTime}から予定「${task.title}」が始まります。(${timeLabel})`;

                    // Trigger Native Push Notification
                    showWebNotification(titleText, bodyText);

                    // Trigger Beautiful In-App Toast with actions
                    showToast(titleText, bodyText, [
                        {
                            text: '✅ 完了にする',
                            primary: true,
                            onClick: () => toggleTaskComplete(task.id)
                        },
                        {
                            text: '🔁 5分スヌーズ',
                            primary: false,
                            onClick: () => snoozeTask(task, 5)
                        }
                    ]);
                }
            }
        });
    }

    function snoozeTask(task, minutes) {
        // Find existing task
        const taskIdx = tasks.findIndex(t => t.id === task.id);
        if (taskIdx === -1) return;

        // Calculate new start/end time shifted by snooze minutes
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutes);
        
        const pad = n => String(n).padStart(2, '0');
        const newStart = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        
        // Duration of original task
        const duration = timeStringToMinutes(task.endTime) - timeStringToMinutes(task.startTime);
        const endNow = new Date(now.getTime() + duration * 60000);
        const newEnd = `${pad(endNow.getHours())}:${pad(endNow.getMinutes())}`;

        // Update task times so it triggers again
        tasks[taskIdx].startTime = newStart;
        tasks[taskIdx].endTime = newEnd;
        tasks[taskIdx].reminderTime = '0'; // Trigger immediately when newStart is reached

        saveTasks();
        render();

        showToast('🔁 スヌーズ設定', `${minutes}分後に再度リマインドします。`);
    }

    // --- UI Renderers ---

    function render() {
        // 1. Render Sidebar Task List
        taskListContainer.innerHTML = '';

        if (tasks.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
        }

        // Sort tasks for chronological rendering
        tasks.sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime))
             .forEach(task => {
                 const card = document.createElement('div');
                 card.className = `task-item-card ${task.completed ? 'completed' : ''}`;
                 card.style.borderLeftColor = `var(--cat-${task.category})`;
                 card.dataset.id = task.id;

                 const reminderLabel = task.reminderTime === 'none' ? '通知なし' : 
                                       (task.reminderTime === '0' ? '開始時' : `${task.reminderTime}分前`);

                 card.innerHTML = `
                     <div class="task-info">
                         <div class="task-title">${escapeHTML(task.title)}</div>
                         <div class="task-time-meta">
                             <span>⏰ ${task.startTime} - ${task.endTime}</span>
                             <span>•</span>
                             <span style="color: var(--cat-${task.category}); font-weight: bold;">
                                 ${getCategoryName(task.category)}
                             </span>
                             <span>•</span>
                             <span style="font-size: 0.75rem; opacity: 0.8;">🔔 ${reminderLabel}</span>
                         </div>
                     </div>
                     <div class="task-actions">
                         <button class="action-btn toggle-btn" title="完了状態を切り替え">
                             ${task.completed ? '↩️' : '✅'}
                         </button>
                         <button class="action-btn edit-btn" title="編集">✏️</button>
                         <button class="action-btn delete-btn" title="削除">❌</button>
                     </div>
                 `;

                 // Attach Event Listeners
                 card.querySelector('.task-info').addEventListener('click', () => editTask(task.id));
                 card.querySelector('.edit-btn').addEventListener('click', () => editTask(task.id));
                 card.querySelector('.toggle-btn').addEventListener('click', () => toggleTaskComplete(task.id));
                 card.querySelector('.delete-btn').addEventListener('click', () => deleteTask(task.id));

                 taskListContainer.appendChild(card);
             });

        // 2. Render Timeline Cards (Injecting Virtual Exam Cards if scheduled today)
        const timelineCards = timelineGrid.querySelectorAll('.timeline-card');
        timelineCards.forEach(card => card.remove());

        // Construct task list to render on the timeline (incorporating virtual exam placeholders)
        const timelineTasks = [...tasks];
        
        // Find exams scheduled for today
        const today = new Date();
        exams.forEach(exam => {
            const examDate = new Date(exam.date);
            if (examDate.getDate() === today.getDate() &&
                examDate.getMonth() === today.getMonth() &&
                examDate.getFullYear() === today.getFullYear()) {
                
                // Construct a virtual study slot starting 1.5 hours before the exam, or representing the exam itself
                const startHour = String(examDate.getHours()).padStart(2, '0');
                const startMin = String(examDate.getMinutes()).padStart(2, '0');
                
                // Set duration to 90 mins for the exam window
                const endMinsTotal = examDate.getHours() * 60 + examDate.getMinutes() + 90;
                const endHour = String(Math.floor(endMinsTotal / 60) % 24).padStart(2, '0');
                const endMin = String(endMinsTotal % 60).padStart(2, '0');

                timelineTasks.push({
                    id: `virtual-exam-${exam.id}`,
                    title: `⚠️ 試験: ${exam.title}`,
                    startTime: `${startHour}:${startMin}`,
                    endTime: `${endHour}:${endMin}`,
                    category: 'other', // Red accent
                    description: 'テスト当日です！集中して全力を尽くしましょう。',
                    completed: false,
                    isVirtual: true
                });
            }
        });

        const positionMeta = resolveOverlaps(timelineTasks);

        timelineTasks.forEach(task => {
            const startMins = timeStringToMinutes(task.startTime);
            const endMins = timeStringToMinutes(task.endTime);
            let duration = endMins - startMins;
            if (duration < 0) duration += 24 * 60; // Wrap around midnight

            const top = minutesToYPosition(startMins);
            const height = minutesToYPosition(duration);

            const card = document.createElement('div');
            card.className = `timeline-card ${task.completed ? 'completed' : ''} ${task.isVirtual ? 'virtual-exam-card' : ''}`;
            card.dataset.id = task.id;
            card.setAttribute('data-cat', task.category);

            // Styling & Absolute positioning
            card.style.top = `${top}px`;
            card.style.height = `${height}px`;

            const meta = positionMeta[task.id];
            const colWidthPercent = 100 / (meta ? meta.totalCols : 1);
            const leftOffsetPercent = (meta ? meta.colIndex : 0) * colWidthPercent;
            
            card.style.width = `calc(${colWidthPercent}% - 20px)`;
            card.style.left = `calc(70px + ${leftOffsetPercent}%)`;
            card.style.zIndex = 2 + (meta ? meta.colIndex : 0);

            if (task.isVirtual) {
                card.style.borderLeft = '5px solid #ff3b30';
                card.style.background = 'linear-gradient(135deg, rgba(231, 76, 60, 0.3) 0%, rgba(231, 76, 60, 0.1) 100%)';
            }

            card.innerHTML = `
                <div class="timeline-card-header">
                    <div class="timeline-card-title">${escapeHTML(task.title)}</div>
                    <div class="timeline-card-time">${task.startTime} - ${task.endTime}</div>
                </div>
                ${height > 45 && task.description ? `<div class="timeline-card-desc">${escapeHTML(task.description)}</div>` : ''}
            `;

            // Non-virtual tasks are clickable for edit
            if (!task.isVirtual) {
                card.addEventListener('click', () => editTask(task.id));
            } else {
                card.style.cursor = 'default';
            }

            timelineGrid.appendChild(card);
        });
    }

    // --- Render Exam Countdowns ---
    function renderExams() {
        examListContainer.innerHTML = '';

        if (exams.length === 0) {
            examListContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary); padding: 2.5rem 0; font-size: 0.85rem;">
                    📅 登録された試験はありません。<br>上のフォームから登録しましょう！
                </div>
            `;
            return;
        }

        // Sort by closest date
        exams.sort((a, b) => new Date(a.date) - new Date(b.date));

        const now = new Date();

        exams.forEach(exam => {
            const examDate = new Date(exam.date);
            const diffMs = examDate - now;
            
            let cardClass = 'exam-card';
            let threatLevel = 'low';
            let isUrgent = false;

            if (diffMs <= 0) {
                cardClass += ' threat-high';
                threatLevel = 'high';
            } else if (diffMs <= 3 * 24 * 60 * 60 * 1000) { // 3 days
                cardClass += ' threat-high';
                threatLevel = 'high';
                isUrgent = true;
            } else if (diffMs <= 7 * 24 * 60 * 60 * 1000) { // 7 days
                cardClass += ' threat-medium';
                threatLevel = 'medium';
            } else {
                cardClass += ' threat-low';
            }

            // Calculate countdown fields
            let countdownText = '';
            if (diffMs <= 0) {
                countdownText = '<span style="color: #ff4b2b; font-weight: 800;">🔥 試験当日・終了</span>';
            } else {
                const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

                countdownText = `
                    <span class="countdown-segment">${days}</span>日 
                    <span class="countdown-segment">${hours}</span>時間 
                    <span class="countdown-segment">${mins}</span>分 
                    <span class="countdown-segment">${secs}</span>秒
                `;
            }

            const formattedDate = examDate.toLocaleDateString('ja-JP', {
                month: 'long',
                day: 'numeric',
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });

            const card = document.createElement('div');
            card.className = cardClass;
            card.dataset.id = exam.id;

            card.innerHTML = `
                <div class="exam-header">
                    <span class="exam-title">${escapeHTML(exam.title)}</span>
                    <div class="exam-actions">
                        <button class="action-btn delete-exam-btn" title="試験を削除">❌</button>
                    </div>
                </div>
                <div class="exam-date-meta">
                    <span>📅</span>
                    <span>${formattedDate}</span>
                </div>
                <div class="exam-countdown-timer ${isUrgent ? 'urgent' : ''}">
                    ${countdownText}
                </div>
                ${diffMs > 0 ? `
                    <button class="exam-add-study-btn">
                        <span>✍️</span> この試験の勉強計画を立てる
                    </button>
                ` : ''}
            `;

            // Attach handlers
            card.querySelector('.delete-exam-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteExam(exam.id);
            });

            const studyBtn = card.querySelector('.exam-add-study-btn');
            if (studyBtn) {
                studyBtn.addEventListener('click', () => {
                    prepareStudyPlan(exam.title);
                });
            }

            examListContainer.appendChild(card);
        });
    }

    // --- Task Operations (CRUD) ---

    // Add or Update Task
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const title = titleInput.value.trim();
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;
        const reminderTime = reminderTimeInput.value;
        const description = descInput.value.trim();

        if (!title) {
            showToast('⚠️ 入力エラー', 'タスクのタイトルを入力してください！');
            return;
        }

        const startMins = timeStringToMinutes(startTime);
        const endMins = timeStringToMinutes(endTime);

        if (startMins >= endMins) {
            showToast('⚠️ 時刻設定エラー', '終了時刻は開始時刻よりも後の時間に設定してください！');
            return;
        }

        if (editingTaskId) {
            // Update mode
            const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
            if (taskIndex !== -1) {
                tasks[taskIndex] = {
                    ...tasks[taskIndex],
                    title,
                    startTime,
                    endTime,
                    reminderTime,
                    category: activeCategory,
                    description
                };
            }
            editingTaskId = null;
            submitBtn.innerHTML = `<span>➕</span> 予定を追加する`;
            submitBtn.style.background = 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)';
        } else {
            // Create mode
            const newTask = {
                id: Date.now().toString(),
                title,
                startTime,
                endTime,
                reminderTime,
                category: activeCategory,
                description,
                completed: false
            };
            tasks.push(newTask);
        }

        saveTasks();
        render();
        taskForm.reset();
        
        // Reset category selection
        activeCategory = 'study';
        categoryBadges.forEach(b => {
            b.classList.remove('active');
            if (b.getAttribute('data-cat') === 'study') {
                b.classList.add('active');
            }
        });

        // Focus adjustment
        const yPos = minutesToYPosition(startMins);
        scrollContainer.scrollTo({
            top: yPos - 100,
            behavior: 'smooth'
        });
    });

    function editTask(id) {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        editingTaskId = id;
        titleInput.value = task.title;
        startTimeInput.value = task.startTime;
        endTimeInput.value = task.endTime;
        reminderTimeInput.value = task.reminderTime || 'none';
        descInput.value = task.description || '';
        
        activeCategory = task.category;
        categoryBadges.forEach(b => {
            if (b.getAttribute('data-cat') === task.category) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        submitBtn.innerHTML = `<span>💾</span> 変更を保存する`;
        submitBtn.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
        titleInput.focus();
    }

    function toggleTaskComplete(id) {
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            saveTasks();
            render();
        }
    }

    function deleteTask(id) {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        if (confirm(`予定「${task.title}」を削除しますか？`)) {
            tasks = tasks.filter(t => t.id !== id);
            if (editingTaskId === id) {
                editingTaskId = null;
                taskForm.reset();
                submitBtn.innerHTML = `<span>➕</span> 予定を追加する`;
                submitBtn.style.background = 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)';
            }
            saveTasks();
            render();
        }
    }

    // --- Exam Operations (CRUD) ---

    examForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const title = examTitleInput.value.trim();
        const dateVal = examDateInput.value;

        if (!title || !dateVal) {
            showToast('⚠️ 入力エラー', '試験名と日時を入力してください。');
            return;
        }

        const newExam = {
            id: 'exam-' + Date.now().toString(),
            title: title,
            date: new Date(dateVal).toISOString()
        };

        exams.push(newExam);
        saveExams();
        renderExams();
        render(); // Update timeline virtual exam card
        examForm.reset();

        showToast('📝 試験を追加しました', `${title} のカウントダウンを開始します。`);
    });

    function deleteExam(id) {
        const exam = exams.find(e => e.id === id);
        if (!exam) return;

        if (confirm(`試験「${exam.title}」を削除しますか？`)) {
            exams = exams.filter(e => e.id !== id);
            saveExams();
            renderExams();
            render(); // Update timeline
        }
    }

    // Pre-fill study plan for an exam
    function prepareStudyPlan(examTitle) {
        titleInput.value = `${examTitle}の勉強 ✏️`;
        activeCategory = 'study';
        categoryBadges.forEach(b => {
            if (b.getAttribute('data-cat') === 'study') {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
        reminderTimeInput.value = '10'; // Default to 10 mins before
        descInput.value = `次の試験に向けた直前勉強: ${examTitle}`;
        
        // Scroll to form
        titleInput.focus();
        showToast('✍️ プランナー連動', '試験勉強の予定フォームを自動入力しました。時間を選んで登録してください。');
    }

    // --- Helpers ---

    function getCategoryName(cat) {
        const names = {
            'study': '勉強 📝',
            'sports': '運動 ⚽',
            'hobby': '趣味 🎮',
            'life': '生活 ⏰',
            'sleep': '睡眠 💤',
            'other': 'その他 ⭐️'
        };
        return names[cat] || cat;
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // --- Initialize ---
    updateDateDisplay();
    loadData();
    initNotifications();
    render();
    renderExams();
    
    updateTimeIndicator();
    scrollToCurrentTime();
    
    // Engine Tick (every 1 second for precise countdowns and reminder triggers)
    setInterval(() => {
        updateTimeIndicator();
        checkReminders();
        renderExams(); // Update countdown seconds real-time
    }, 1000);
});
