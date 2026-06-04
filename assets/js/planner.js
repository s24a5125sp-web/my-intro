/* planner.js */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let tasks = [];
    let activeCategory = 'study';
    let editingTaskId = null;

    // DOM Elements
    const taskForm = document.getElementById('task-form');
    const titleInput = document.getElementById('task-title-input');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const descInput = document.getElementById('task-desc');
    const categoryBadges = document.querySelectorAll('.category-badge');
    const submitBtn = document.getElementById('submit-btn');
    const timelineGrid = document.querySelector('.timeline-grid');
    const taskListContainer = document.getElementById('task-list-container');
    const currentDateDisplay = document.getElementById('current-date');
    const timeIndicator = document.getElementById('time-indicator');
    const scrollContainer = document.getElementById('timeline-scroll-container');
    const emptyState = document.getElementById('empty-state');

    // Layout configuration
    const HOUR_HEIGHT = 80; // 1 hour = 80px in planner.css

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
        
        // Scroll with animation, centering the current hour
        const containerHeight = scrollContainer.clientHeight;
        scrollContainer.scrollTop = yPos - (containerHeight / 2) + 40;
    }

    // --- LocalStorage Logic ---
    function loadTasks() {
        const stored = localStorage.getItem('ui_planner_tasks');
        if (stored) {
            try {
                tasks = JSON.parse(stored);
            } catch (e) {
                console.error("Failed to parse stored tasks:", e);
                tasks = [];
            }
        } else {
            // Default sample tasks if empty
            tasks = [
                {
                    id: 'sample-1',
                    title: '朝のランニング 🏃‍♂️',
                    startTime: '07:00',
                    endTime: '08:00',
                    category: 'sports',
                    description: '公園を軽くジョギングして目を覚ます',
                    completed: false
                },
                {
                    id: 'sample-2',
                    title: 'プログラミング学習 💻',
                    startTime: '09:30',
                    endTime: '12:00',
                    category: 'study',
                    description: 'JavaScriptとCSSのアニメーションについて学ぶ',
                    completed: false
                },
                {
                    id: 'sample-3',
                    title: 'ランチ 🍱',
                    startTime: '12:00',
                    endTime: '13:00',
                    category: 'life',
                    description: '美味しいご飯を食べる',
                    completed: true
                },
                {
                    id: 'sample-4',
                    title: 'サッカーの練習 ⚽',
                    startTime: '16:00',
                    endTime: '18:00',
                    category: 'sports',
                    description: 'リフティングとシュートの練習',
                    completed: false
                }
            ];
            saveTasks();
        }
    }

    function saveTasks() {
        localStorage.setItem('ui_planner_tasks', JSON.stringify(tasks));
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
    // This smart algorithm resolves overlaps by placing overlapping tasks side-by-side
    function resolveOverlaps(tasksList) {
        // Filter out completed tasks from overlap calculation if desired, but here we include all for structure
        const sorted = [...tasksList].sort((a, b) => {
            return timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime);
        });

        const columns = []; // Array of columns, each containing cards

        sorted.forEach(task => {
            const start = timeStringToMinutes(task.startTime);
            
            let placed = false;
            for (let i = 0; i < columns.length; i++) {
                // Check if this task fits in column i (no overlap with the last task in that column)
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

        // Map task ID to its positioning metadata
        const positionMeta = {};
        columns.forEach((col, colIndex) => {
            col.forEach(task => {
                // We need to know how many columns overlap with this task to set width
                // For simplicity, we find the maximum overlapping columns during this task's active period
                positionMeta[task.id] = {
                    colIndex: colIndex,
                    totalCols: columns.length // Temporary simplification, will refine
                };
            });
        });

        // Refined overlap column count per task
        sorted.forEach(task1 => {
            const start1 = timeStringToMinutes(task1.startTime);
            const end1 = timeStringToMinutes(task1.endTime);
            
            // Find all tasks that overlap with task1
            const overlappingTasks = sorted.filter(task2 => {
                const start2 = timeStringToMinutes(task2.startTime);
                const end2 = timeStringToMinutes(task2.endTime);
                return (start1 < end2 && end1 > start2);
            });

            // The max column index among all overlapping tasks + 1 is a good approximation of width factor
            const cols = overlappingTasks.map(t => positionMeta[t.id].colIndex);
            const maxColIdx = Math.max(...cols);
            
            // Assign refined overlap metadata
            positionMeta[task1.id].totalCols = Math.max(overlappingTasks.length, maxColIdx + 1);
        });

        return positionMeta;
    }

    // --- UI Renderers ---

    // Render both Timeline cards and the Sidebar Task List
    function render() {
        // Clear previous tasks in timeline (keep background grid and indicator)
        const timelineCards = timelineGrid.querySelectorAll('.timeline-card');
        timelineCards.forEach(card => card.remove());

        // Clear Sidebar List
        taskListContainer.innerHTML = '';

        if (tasks.length === 0) {
            emptyState.style.display = 'block';
            return;
        } else {
            emptyState.style.display = 'none';
        }

        // 1. Render Sidebar Task List
        tasks.sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime))
             .forEach(task => {
                 const card = document.createElement('div');
                 card.className = `task-item-card ${task.completed ? 'completed' : ''}`;
                 card.style.borderLeftColor = `var(--cat-${task.category})`;
                 card.dataset.id = task.id;

                 card.innerHTML = `
                     <div class="task-info">
                         <div class="task-title">${escapeHTML(task.title)}</div>
                         <div class="task-time-meta">
                             <span>⏰ ${task.startTime} - ${task.endTime}</span>
                             <span>•</span>
                             <span style="color: var(--cat-${task.category}); font-weight: bold;">
                                 ${getCategoryName(task.category)}
                             </span>
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

                 // Attach Event Listeners to actions
                 card.querySelector('.task-info').addEventListener('click', () => editTask(task.id));
                 card.querySelector('.edit-btn').addEventListener('click', () => editTask(task.id));
                 card.querySelector('.toggle-btn').addEventListener('click', () => toggleTaskComplete(task.id));
                 card.querySelector('.delete-btn').addEventListener('click', () => deleteTask(task.id));

                 taskListContainer.appendChild(card);
             });

        // 2. Render Timeline Cards
        const positionMeta = resolveOverlaps(tasks);

        tasks.forEach(task => {
            const startMins = timeStringToMinutes(task.startTime);
            const endMins = timeStringToMinutes(task.endTime);
            const duration = endMins - startMins;

            const top = minutesToYPosition(startMins);
            const height = minutesToYPosition(duration);

            const card = document.createElement('div');
            card.className = `timeline-card ${task.completed ? 'completed' : ''}`;
            card.dataset.id = task.id;
            card.setAttribute('data-cat', task.category);

            // Styling & Absolute positioning
            card.style.top = `${top}px`;
            card.style.height = `${height}px`;

            // Calculate width and left offset for overlapping tasks
            const meta = positionMeta[task.id];
            const colWidthPercent = 100 / meta.totalCols;
            const leftOffsetPercent = meta.colIndex * colWidthPercent;
            
            // Scale and padding adjustments based on available width
            card.style.width = `calc(${colWidthPercent}% - 20px)`;
            card.style.left = `calc(70px + ${leftOffsetPercent}%)`;
            card.style.zIndex = 2 + meta.colIndex;

            card.innerHTML = `
                <div class="timeline-card-header">
                    <div class="timeline-card-title">${escapeHTML(task.title)}</div>
                    <div class="timeline-card-time">${task.startTime} - ${task.endTime}</div>
                </div>
                ${height > 45 && task.description ? `<div class="timeline-card-desc">${escapeHTML(task.description)}</div>` : ''}
            `;

            // Click to Edit
            card.addEventListener('click', () => editTask(task.id));

            timelineGrid.appendChild(card);
        });
    }

    // --- Task Operations (CRUD) ---

    // Add or Update Task
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const title = titleInput.value.trim();
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;
        const description = descInput.value.trim();

        if (!title) {
            alert('タスクのタイトルを入力してください！');
            return;
        }

        // Time Validation
        const startMins = timeStringToMinutes(startTime);
        const endMins = timeStringToMinutes(endTime);

        if (startMins >= endMins) {
            alert('終了時刻は開始時刻よりも後の時間に設定してください！');
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
                category: activeCategory,
                description,
                completed: false
            };
            tasks.push(newTask);
        }

        saveTasks();
        render();
        taskForm.reset();
        
        // Reset category selection to 'study'
        activeCategory = 'study';
        categoryBadges.forEach(b => {
            b.classList.remove('active');
            if (b.getAttribute('data-cat') === 'study') {
                b.classList.add('active');
            }
        });

        // Adjust scroll to the added task
        const yPos = minutesToYPosition(startMins);
        scrollContainer.scrollTo({
            top: yPos - 100,
            behavior: 'smooth'
        });
    });

    // Populate form with task data for editing
    function editTask(id) {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        editingTaskId = id;
        titleInput.value = task.title;
        startTimeInput.value = task.startTime;
        endTimeInput.value = task.endTime;
        descInput.value = task.description || '';
        
        // Update category selection
        activeCategory = task.category;
        categoryBadges.forEach(b => {
            if (b.getAttribute('data-cat') === task.category) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        // Style changes on button to show Edit Mode
        submitBtn.innerHTML = `<span>💾</span> 変更を保存する`;
        submitBtn.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
        
        // Scroll form into view on mobile
        titleInput.focus();
    }

    // Toggle Complete State
    function toggleTaskComplete(id) {
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            saveTasks();
            render();
        }
    }

    // Delete Task with confirmation
    function deleteTask(id) {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        if (confirm(`予定「${task.title}」を削除しますか？`)) {
            tasks = tasks.filter(t => t.id !== id);
            if (editingTaskId === id) {
                // Cancel edit mode if editing task is deleted
                editingTaskId = null;
                taskForm.reset();
                submitBtn.innerHTML = `<span>➕</span> 予定を追加する`;
                submitBtn.style.background = 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)';
            }
            saveTasks();
            render();
        }
    }

    // --- Helpers ---

    // Translate category keys to Japanese names
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

    // Prevent HTML injection
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
    loadTasks();
    render();
    
    // Set up real-time time line updates
    updateTimeIndicator();
    scrollToCurrentTime();
    
    // Update the line every 60 seconds
    setInterval(() => {
        updateTimeIndicator();
    }, 60000);
});
