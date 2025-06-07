const schedule = [
    { time: "05:50 - 06:00", name: "Morning Wakeup", subtasks: [], column: 1 },
    { time: "06:00 - 06:30", name: "Freshen Up", subtasks: [], column: 1 },
    { time: "06:30 - 06:45", name: "Preworkout Meal", subtasks: ["Eat banana", "Drink preworkout", "Boil eggs"], column: 1 },
    { time: "06:45 - 07:00", name: "Gym Commute", subtasks: [], column: 1 },
    { time: "07:00 - 08:20", name: "Weight Training", subtasks: [], column: 1 },
    { time: "08:20 - 08:40", name: "Cardio Abs", subtasks: [], column: 1 },
    { time: "08:40 - 09:00", name: "Home Commute", subtasks: ["Buy Chicken"], column: 1 },
    { time: "09:00 - 09:30", name: "Post-Gym Routine", subtasks: ["Take bath", "Clean floor", "Drink protein", "Marinate Chicken"], column: 1 },
    { time: "09:30 - 10:00", name: "Hearty Breakfast", subtasks: ["Eggs", "Oats & Paneer"], column: 1 },
    { time: "10:00 - 11:00", name: "Study Hour", subtasks: [], column: 1 },
    { time: "11:00 - 12:00", name: "Office Work", subtasks: [], column: 1 },
    { time: "12:00 - 14:00", name: "Office Work", subtasks: [], column: 2 },
    { time: "14:00 - 15:30", name: "Lunch Cooking", subtasks: ["Cook chicken", "Make chapati", "Eat meal"], column: 2 },
    { time: "15:30 - 17:00", name: "Office Work", subtasks: [], column: 2 },
    { time: "17:00 - 17:30", name: "Evening Walk", subtasks: [], column: 3 },
    { time: "17:30 - 18:00", name: "Work Wrapup", subtasks: [], column: 3 },
    { time: "18:00 - 19:00", name: "Personal Time", subtasks: [], column: 3 },
    { time: "19:00 - 20:00", name: "Dinner Prep", subtasks: [], column: 3 },
    { time: "20:00 - 21:00", name: "Dinner Time", subtasks: [], column: 3 },
    { time: "21:00 - 21:30", name: "Wind Down", subtasks: [], column: 4 },
    { time: "21:30 - 22:00", name: "Free Time", subtasks: [], column: 4 },
    { time: "22:00 - 23:00", name: "Relaxation", subtasks: [], column: 4 },
    { time: "23:00 - 23:10", name: "Sleep Time", subtasks: [], column: 4 }
];

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
    
    // Clear all columns
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`schedule-${i}`).innerHTML = '';
    }
    
    schedule.forEach((task, index) => {
        const status = getTaskStatus(task.time, currentMinutes);
        const container = document.getElementById(`schedule-${task.column}`);
        
        const taskElement = document.createElement('div');
        taskElement.className = `task ${status}`;
        taskElement.setAttribute('tabindex', '0');
        
        const statusLabel = status === 'completed' ? 'Done' : 
                          status === 'current' ? 'Now' : 'Later';
        
        let subtasksHtml = '';
        if (task.subtasks.length > 0) {
            subtasksHtml = '<div class="subtasks">';
            task.subtasks.forEach((subtask, subIndex) => {
                const checkboxId = `subtask-${index}-${subIndex}`;
                subtasksHtml += `
                    <div class="subtask" id="subtask-container-${checkboxId}">
                        <div class="subtask-checkbox" onclick="toggleSubtask('${checkboxId}')" id="${checkboxId}" tabindex="0" role="checkbox" aria-checked="false"></div>
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
                <div class="task-status status-${status}">${statusLabel}</div>
            </div>
            ${subtasksHtml}
        `;
        
        container.appendChild(taskElement);
    });
}

function updateWaterLevel() {
    const progress = calculateProgress();
    
    // Calculate progress for each column
    for (let i = 1; i <= 4; i++) {
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

function init() {
    updateClock();
    renderSchedule();
    updateWaterLevel();
    
    // Update every second
    setInterval(() => {
        updateClock();
        renderSchedule();
        updateWaterLevel();
    }, 1000);
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