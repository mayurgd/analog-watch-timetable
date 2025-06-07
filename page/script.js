const LAMBDA_URL = 'https://phflecg2knll4wycatj5lzbqnq0vetpu.lambda-url.ap-southeast-2.on.aws/';

let schedule = [];
let taskIdMapping = {}; // Map array index to task_id
let subtaskIdMapping = {}; // Map checkbox id to subtask_id

let lastRenderMinute = -1;

function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function getCurrentTimeMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function getTaskStatus(timeRange, currentMinutes) {
    const [startTime, endTime] = timeRange.split(' - ');
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    
    if (currentMinutes < startMinutes) {
        return 'upcoming';
    } else if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return 'current';
    } else {
        return 'completed';
    }
}

function calculateProgress() {
    const currentMinutes = getCurrentTimeMinutes();
    const dayStart = timeToMinutes('05:50');
    const dayEnd = timeToMinutes('23:10');
    
    if (currentMinutes < dayStart) return 0;
    if (currentMinutes > dayEnd) return 100;
    
    return ((currentMinutes - dayStart) / (dayEnd - dayStart)) * 100;
}

function calculateColumnProgress(column) {
    const currentMinutes = getCurrentTimeMinutes();
    const columnTasks = schedule.filter(task => task.column === column);
    
    if (columnTasks.length === 0) return 0;
    
    const firstTask = columnTasks[0];
    const lastTask = columnTasks[columnTasks.length - 1];
    
    const startMinutes = timeToMinutes(firstTask.time.split(' - ')[0]);
    const endMinutes = timeToMinutes(lastTask.time.split(' - ')[1]);
    
    if (currentMinutes < startMinutes) return 0;
    if (currentMinutes > endMinutes) return 100;
    
    return ((currentMinutes - startMinutes) / (endMinutes - startMinutes)) * 100;
}

function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const dateString = now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    document.getElementById('clock').textContent = timeString;
    document.getElementById('date').textContent = dateString;
}

function renderSchedule() {
    const currentMinutes = getCurrentTimeMinutes();
    const subtaskStates = loadSubtaskStates();
    
    // Clear all columns
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`schedule-${i}`).innerHTML = '';
    }
    
    schedule.forEach((task, index) => {
        const status = getTaskStatus(task.time, currentMinutes);
        const container = document.getElementById(`schedule-${task.column}`);
        
        // Use API completion state if available, otherwise fall back to localStorage
        const isCompleted = task.hasOwnProperty('is_completed') ? task.is_completed : isTaskCompleted(index);
        
        const taskElement = document.createElement('div');
        taskElement.className = `task ${status} ${isCompleted ? 'manually-completed' : ''}`;
        taskElement.setAttribute('tabindex', '0');
        
        const statusLabel = isCompleted ? 'Done' : 
                          (status === 'completed' ? 'Done' : 
                          status === 'current' ? 'Now' : 'Later');
        
        let subtasksHtml = '';
        if (task.subtasks.length > 0) {
            subtasksHtml = '<div class="subtasks">';
            task.subtasks.forEach((subtask, subIndex) => {
                const checkboxId = `subtask-${index}-${subIndex}`;
                
                // Check if we have subtask completion data from API
                let isSubtaskChecked = false;
                if (task.subtask_details && task.subtask_details[subIndex]) {
                    isSubtaskChecked = task.subtask_details[subIndex].is_completed || false;
                } else {
                    // Fallback to localStorage
                    isSubtaskChecked = subtaskStates[checkboxId] === true;
                }
                
                subtasksHtml += `
                    <div class="subtask ${isSubtaskChecked ? 'completed' : ''}" id="subtask-container-${checkboxId}">
                        <div class="subtask-checkbox ${isSubtaskChecked ? 'checked' : ''}" onclick="toggleSubtask('${checkboxId}')" id="${checkboxId}" tabindex="0" role="checkbox" aria-checked="${isSubtaskChecked}"></div>
                        <span>${subtask}</span>
                    </div>
                `;
            });
            subtasksHtml += '</div>';
        }
        
        taskElement.innerHTML = `
            <div class="task-header">
                <div class="task-info">
                    <div class="task-time">${task.time}</div>
                    <div class="task-name">${task.name}</div>
                </div>
                <div class="task-status status-${isCompleted ? 'completed' : status}" onclick="toggleTaskCompletion(${index})" style="cursor: pointer;">${statusLabel}</div>
            </div>
            ${subtasksHtml}
        `;
        
        container.appendChild(taskElement);
    });
}

function getDateKey() {
    const today = new Date();
    return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

function loadCompletedTasks() {
    const dateKey = getDateKey();
    const stored = JSON.parse(localStorage.getItem(`completedTasks_${dateKey}`)) || [];
    return stored;
}

function saveCompletedTasks(completedTasks) {
    const dateKey = getDateKey();
    localStorage.setItem(`completedTasks_${dateKey}`, JSON.stringify(completedTasks));
}

async function toggleTaskCompletion(taskIndex) {
    const task = schedule[taskIndex];
    const newCompletionState = !task.is_completed;
    
    try {
        const response = await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'update_task_completion',
                task_id: taskIdMapping[taskIndex],
                is_completed: newCompletionState
            })
        });
        
        if (response.ok) {
            // Update local state
            schedule[taskIndex].is_completed = newCompletionState;
            renderSchedule();
        } else {
            console.error('Error updating task completion');
        }
    } catch (error) {
        console.error('Network error:', error);
        // Fallback to localStorage behavior
        toggleTaskCompletionLocal(taskIndex);
    }
}


function loadSubtaskStates() {
    const dateKey = getDateKey();
    const stored = JSON.parse(localStorage.getItem(`subtaskStates_${dateKey}`)) || {};
    return stored;
}

function saveSubtaskStates(subtaskStates) {
    const dateKey = getDateKey();
    localStorage.setItem(`subtaskStates_${dateKey}`, JSON.stringify(subtaskStates));
}

async function toggleSubtask(checkboxId) {
    const subtaskId = subtaskIdMapping[checkboxId];
    const checkbox = document.getElementById(checkboxId);
    const isCurrentlyChecked = checkbox.classList.contains('checked');
    const newState = !isCurrentlyChecked;
    
    if (subtaskId) {
        try {
            const response = await fetch(LAMBDA_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'update_subtask_completion',
                    subtask_id: subtaskId,
                    is_completed: newState
                })
            });
            
            if (response.ok) {
                // Update UI
                updateSubtaskUI(checkboxId, newState);
            } else {
                console.error('Error updating subtask completion');
            }
        } catch (error) {
            console.error('Network error:', error);
            // Fallback to localStorage behavior
            toggleSubtaskLocal(checkboxId);
        }
    } else {
        // Fallback for tasks without subtask IDs
        toggleSubtaskLocal(checkboxId);
    }
}

// Add helper function to update subtask UI
function updateSubtaskUI(checkboxId, isChecked) {
    const checkbox = document.getElementById(checkboxId);
    const subtaskContainer = document.getElementById(`subtask-container-${checkboxId}`);
    
    if (isChecked) {
        checkbox.classList.add('checked');
        subtaskContainer.classList.add('completed');
    } else {
        checkbox.classList.remove('checked');
        subtaskContainer.classList.remove('completed');
    }
    checkbox.setAttribute('aria-checked', isChecked.toString());
}

// Add fallback functions for localStorage behavior
function toggleTaskCompletionLocal(taskIndex) {
    const completedTasks = loadCompletedTasks();
    const taskId = `task_${taskIndex}`;
    
    if (completedTasks.includes(taskId)) {
        const index = completedTasks.indexOf(taskId);
        completedTasks.splice(index, 1);
    } else {
        completedTasks.push(taskId);
    }
    
    saveCompletedTasks(completedTasks);
    renderSchedule();
}

function toggleSubtaskLocal(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    const subtaskContainer = document.getElementById(`subtask-container-${checkboxId}`);
    const isChecked = checkbox.classList.contains('checked');
    
    checkbox.classList.toggle('checked');
    subtaskContainer.classList.toggle('completed');
    checkbox.setAttribute('aria-checked', (!isChecked).toString());
    
    const subtaskStates = loadSubtaskStates();
    subtaskStates[checkboxId] = !isChecked;
    saveSubtaskStates(subtaskStates);
}



function isTaskCompleted(taskIndex) {
    const completedTasks = loadCompletedTasks();
    return completedTasks.includes(`task_${taskIndex}`);
}

function updateWaterLevel() {
    const progress = calculateProgress();
    
    // Calculate progress for each column
    for (let i = 1; i <= 5; i++) {
        const columnProgress = calculateColumnProgress(i);
        const waterOverlay = document.getElementById(`water-overlay-${i}`);
        waterOverlay.style.height = `${columnProgress}%`;
    }
    
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `Day Progress: ${Math.round(progress)}%`;
}

function toggleSubtask(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    const subtaskContainer = document.getElementById(`subtask-container-${checkboxId}`);
    const isChecked = checkbox.classList.contains('checked');
    
    checkbox.classList.toggle('checked');
    subtaskContainer.classList.toggle('completed');
    checkbox.setAttribute('aria-checked', (!isChecked).toString());
}

async function fetchSchedule() {
    try {
        const response = await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_schedule'
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            schedule = data.schedule;
            buildMappings();
            renderSchedule();
        } else {
            console.error('Error fetching schedule:', data.error);
        }
    } catch (error) {
        console.error('Network error:', error);
    }
}

// Add this function to build mapping objects
function buildMappings() {
    taskIdMapping = {};
    subtaskIdMapping = {};
    
    schedule.forEach((task, index) => {
        taskIdMapping[index] = task.task_id;
        
        if (task.subtask_details) {
            task.subtask_details.forEach((subtask, subIndex) => {
                const checkboxId = `subtask-${index}-${subIndex}`;
                subtaskIdMapping[checkboxId] = subtask.subtask_id;
            });
        }
    });
}

function init() {
    updateClock();
    fetchSchedule(); // Fetch from API instead of using static data
    updateWaterLevel();
    
    // Update every second
    setInterval(() => {
        updateClock();
        updateWaterLevel();
        
        // Only re-render schedule if the minute has changed (for status updates)
        const currentMinute = Math.floor(getCurrentTimeMinutes());
        if (currentMinute !== lastRenderMinute) {
            renderSchedule();
            lastRenderMinute = currentMinute;
        }
    }, 1000);
    
    // Refresh schedule from API every 5 minutes
    setInterval(fetchSchedule, 5 * 60 * 1000);
}

// Keyboard accessibility
document.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('subtask-checkbox') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.target.click();
    }
});

// Initialize when page loads
window.addEventListener('load', init);