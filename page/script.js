const LAMBDA_URL = 'https://phflecg2knll4wycatj5lzbqnq0vetpu.lambda-url.ap-southeast-2.on.aws/';

let schedule = [];
let taskIdMapping = {}; // Map array index to task_id
let subtaskIdMapping = {}; // Map checkbox id to subtask_id
let currentEditingTaskIndex = null;
let lastRenderMinute = -1;
let transactions = [];
let transactionIdMapping = {};

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
                <div class="task-actions">
                    <div class="task-status status-${isCompleted ? 'completed' : status}" onclick="toggleTaskCompletion(${index})" style="cursor: pointer;">${statusLabel}</div>
                </div>
            </div>
            ${subtasksHtml}
        `;

        taskElement.addEventListener('click', function(e) {
            // Don't open edit modal if clicking on status button or subtask checkboxes
            if (e.target.classList.contains('task-status') || 
                e.target.classList.contains('subtask-checkbox') ||
                e.target.closest('.subtask')) {
                return;
            }
            openEditModal(index);
        });

        taskElement.style.cursor = 'pointer';
        
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

function openEditModal(taskIndex) {
    currentEditingTaskIndex = taskIndex;
    const task = schedule[taskIndex];
    
    // Populate form fields
    document.getElementById('editTaskName').value = task.name;
    document.getElementById('editTaskTime').value = task.time;
    document.getElementById('editTaskColumn').value = task.column;
    document.getElementById('editSubtasks').value = task.subtasks.join('\n');
    
    // Show modal
    document.getElementById('editTaskModal').style.display = 'block';
}

// Function to close edit modal
function closeEditModal() {
    document.getElementById('editTaskModal').style.display = 'none';
    currentEditingTaskIndex = null;
}

// Function to handle form submission
async function handleEditTaskSubmit(event) {
    event.preventDefault();
    
    if (currentEditingTaskIndex === null) return;
    
    const formData = new FormData(event.target);
    const taskName = formData.get('taskName').trim();
    const taskTime = formData.get('taskTime').trim();
    const taskColumn = parseInt(formData.get('taskColumn'));
    const subtasksText = formData.get('subtasks').trim();
    const subtasks = subtasksText ? subtasksText.split('\n').map(s => s.trim()).filter(s => s) : [];
    
    // Validate time format (basic validation)
    const timePattern = /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/;
    if (!timePattern.test(taskTime)) {
        alert('Please enter time in format: HH:MM - HH:MM');
        return;
    }
    
    // Disable submit button during API call
    const submitBtn = event.target.querySelector('.btn-save');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    
    const task = schedule[currentEditingTaskIndex];
    const taskId = taskIdMapping[currentEditingTaskIndex];
    
    try {
        const response = await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'update_task',
                task_id: taskId,
                task_name: taskName,
                task_timing: taskTime,
                residing_column: taskColumn,
                subtasks: subtasks
            })
        });
        
        if (response.ok) {
            // Update local schedule data
            schedule[currentEditingTaskIndex] = {
                ...task,
                name: taskName,
                time: taskTime,
                column: taskColumn,
                subtasks: subtasks
            };
            
            // Re-render schedule
            renderSchedule();
            closeEditModal();
            
            console.log('Task updated successfully');
        } else {
            const errorData = await response.json();
            alert('Error updating task: ' + (errorData.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Network error:', error);
        alert('Network error. Please try again.');
    } finally {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
    }
}

// Add event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Form submission
    document.getElementById('editTaskForm').addEventListener('submit', handleEditTaskSubmit);
    
    // Transaction form submission - ADD THIS
    document.getElementById('transactionForm').addEventListener('submit', handleTransactionSubmit);
    
    // Close modal when clicking outside
    document.getElementById('editTaskModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeEditModal();
        }
    });
    
    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && document.getElementById('editTaskModal').style.display === 'block') {
            closeEditModal();
        }
    });
});

// Transaction Functions
function parseTransactionInput(input) {
    const text = input.trim();
    
    // Check for + or - at the end
    const creditMatch = text.match(/^(.+?)\s*\+\s*(\d+(?:\.\d{2})?)$/);
    const debitMatch = text.match(/^(.+?)\s*[-−]\s*(\d+(?:\.\d{2})?)$/);
    
    if (creditMatch) {
        return {
            reason: creditMatch[1].trim(),
            amount: parseFloat(creditMatch[2]),
            type: 'credit'
        };
    } else if (debitMatch) {
        return {
            reason: debitMatch[1].trim(),
            amount: parseFloat(debitMatch[2]),
            type: 'debit'
        };
    } else {
        return null;
    }
}

async function addTransaction(transactionData) {
    try {
        // Format the transaction text according to Lambda expectations
        const transactionText = transactionData.type === 'credit' 
            ? `${transactionData.reason} + ${transactionData.amount}`
            : `${transactionData.reason} - ${transactionData.amount}`;
            
        const response = await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'add_transaction',
                transaction_text: transactionText  // Changed from separate fields to single text
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            await fetchTransactions(); // Refresh the list
            return true;
        } else {
            const errorData = await response.json();
            console.error('Error adding transaction:', errorData.error);
            return false;
        }
    } catch (error) {
        console.error('Network error:', error);
        return false;
    }
}

async function fetchTransactions() {
    try {
        const response = await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_transactions'
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            transactions = data.transactions || [];
            buildTransactionMappings();
            renderTransactions();
            updateTransactionSummary(data.summary); // Pass summary from API
        } else {
            console.error('Error fetching transactions:', data.error);
        }
    } catch (error) {
        console.error('Network error:', error);
    }
}

function buildTransactionMappings() {
    transactionIdMapping = {};
    transactions.forEach((transaction, index) => {
        transactionIdMapping[index] = transaction.transaction_id;
    });
}

function renderTransactions() {
    const container = document.getElementById('transaction-list');
    container.innerHTML = '';
    
    // Sort transactions by timestamp (newest first) - use timestamp instead of date
    const sortedTransactions = [...transactions].sort((a, b) => 
        new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)
    );
    
    sortedTransactions.forEach((transaction) => {
        const transactionElement = document.createElement('div');
        transactionElement.className = 'transaction-item';
        
        // Use timestamp if available, otherwise fall back to date
        const dateStr = transaction.timestamp || transaction.date;
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Handle Decimal amount properly
        const amount = typeof transaction.amount === 'object' && transaction.amount !== null 
            ? parseFloat(transaction.amount) 
            : parseFloat(transaction.amount);
        
        transactionElement.innerHTML = `
            <div class="transaction-info">
                <div class="transaction-reason">${transaction.reason}</div>
                <div class="transaction-date">${formattedDate}</div>
            </div>
            <div class="transaction-amount ${transaction.transaction_type}">
                ${transaction.transaction_type === 'credit' ? '+' : '-'}₹${amount.toFixed(2)}
            </div>
            <button class="btn-delete-transaction" onclick="deleteTransaction(${transactions.indexOf(transaction)})" style="margin-left: 10px; padding: 5px 10px; background: var(--bright-red); color: white; border: none; border-radius: 4px; cursor: pointer;">×</button>
        `;
        
        container.appendChild(transactionElement);
    });
}

function updateTransactionSummary(apiSummary = null) {
    let totalCredit, totalDebit, netAmount;
    
    if (apiSummary) {
        // Use summary from API
        totalCredit = apiSummary.total_credit;
        totalDebit = apiSummary.total_debit;
        netAmount = apiSummary.net_amount;
    } else {
        // Fallback to client-side calculation
        totalCredit = transactions
            .filter(t => t.transaction_type === 'credit')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        
        totalDebit = transactions
            .filter(t => t.transaction_type === 'debit')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        
        netAmount = totalCredit - totalDebit;
    }
    
    document.getElementById('total-credit').textContent = `₹${totalCredit.toFixed(2)}`;
    document.getElementById('total-debit').textContent = `₹${totalDebit.toFixed(2)}`;
    
    const netElement = document.getElementById('net-amount');
    netElement.textContent = `₹${netAmount.toFixed(2)}`;
    netElement.style.color = netAmount >= 0 ? '#00ff00' : 'var(--bright-red)';
}

async function deleteTransaction(transactionIndex) {
    const transactionId = transactionIdMapping[transactionIndex];
    
    try {
        const response = await fetch(LAMBDA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'delete_transaction',
                transaction_id: transactionId
            })
        });
        
        if (response.ok) {
            await fetchTransactions(); // Refresh the list
        } else {
            console.error('Error deleting transaction');
        }
    } catch (error) {
        console.error('Network error:', error);
    }
}

// Handle transaction form submission
function handleTransactionSubmit(event) {
    event.preventDefault();
    
    const input = document.getElementById('transactionText');
    const inputValue = input.value.trim();
    
    if (!inputValue) {
        alert('Please enter a transaction');
        return;
    }
    
    const parsedTransaction = parseTransactionInput(inputValue);
    
    if (!parsedTransaction) {
        alert('Invalid format. Use: "Description + amount" for income or "Description - amount" for expense');
        return;
    }
    
    // Disable form during submission
    const submitBtn = event.target.querySelector('.btn-add-transaction');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';
    
    addTransaction(parsedTransaction).then(success => {
        if (success) {
            input.value = ''; // Clear the input
        } else {
            alert('Failed to add transaction');
        }
        
        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add';
    });
}

function init() {
    updateClock();
    fetchSchedule(); // Fetch from API instead of using static data
    fetchTransactions(); // Add this line
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
    // Refresh transactions every 10 minutes
    setInterval(fetchTransactions, 10 * 60 * 1000);
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