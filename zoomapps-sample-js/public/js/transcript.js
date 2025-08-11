// Transcript handling for Zoom App
/* global io, zoomSdk */
class TranscriptManager {
    constructor() {
        this.socket = null;
        this.transcripts = [];
        this.maxTranscripts = 50; // Keep last 50 transcripts
        this.isConnected = false;

        this.initializeElements();
        this.initializeWebSocket();
        this.initializeZoomSDK();
    }

    initializeElements() {
        this.statusElement = document.getElementById('transcript-status');
        this.listElement = document.getElementById('transcript-list');
        this.containerElement = document.getElementById('transcript-container');
        
        // Task management elements
        this.completedTasksList = document.getElementById('completed-tasks-list');
        this.pendingTasksList = document.getElementById('pending-tasks-list');
        
        // Initialize task management
        this.initializeTaskManagement();
    }

    initializeWebSocket() {
        // Initialize WebSocket connection (no Socket.IO needed)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/transcript-ws`;
        
        console.log('🔗 Connecting to WebSocket:', wsUrl);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('✅ Connected to transcript WebSocket server');
            this.isConnected = true;
            this.updateStatus('Connected - Ready to receive transcripts from any meeting', 'connected');
        };

        this.socket.onclose = () => {
            console.log('🔌 Disconnected from transcript WebSocket server');
            this.isConnected = false;
            this.updateStatus('Disconnected from transcript server', 'disconnected');
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    console.log('🔄 Attempting to reconnect...');
                    this.initializeWebSocket();
                }
            }, 3000);
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('📨 WebSocket message received:', message);
                
                if (message.type === 'transcript') {
                    console.log('🎯 CLIENT RECEIVED TRANSCRIPT:', {
                        speaker: message.data.speaker_name || message.data.speaker || 'Unknown',
                        text: message.data.transcript || message.data.text,
                        meetingUuid: message.data.meetingUuid,
                        timestamp: message.data.timestamp,
                        taskSuggestion: message.data.taskSuggestion,
                        rawData: message.data,
                    });
                    
                    this.addTranscript(message.data);
                    
                    // Update meeting UUID for task management
                    if (message.data.meetingUuid) {
                        this.updateMeetingUuid(message.data.meetingUuid);
                    }
                    
                    // Handle task suggestion if present
                    if (message.data.taskSuggestion) {
                        console.log('🤖 TASK SUGGESTION RECEIVED:', message.data.taskSuggestion);
                        this.showTaskSuggestion(message.data.taskSuggestion);
                    }
                } else if (message.type === 'connected') {
                    console.log('✅ WebSocket connection confirmed:', message.message);
                } else if (message.type === 'meeting_ended') {
                    console.log('🔴 Meeting ended:', message);
                    this.addSystemMessage(`Meeting ${message.meetingUuid} transcript stream ended`);
                }
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
            }
        };

        this.socket.onerror = (error) => {
            console.error('❌ WebSocket connection error:', error);
            this.updateStatus('WebSocket connection error', 'error');
        };
    }

    async initializeZoomSDK() {
        try {
            // Wait for Zoom SDK to be available
            if (typeof zoomSdk === 'undefined') {
                console.log('Waiting for Zoom SDK...');
                setTimeout(() => this.initializeZoomSDK(), 1000);
                return;
            }

            await zoomSdk.config({
                capabilities: ['getMeetingUUID'],
                version: '0.16.0',
            });

            console.log('Zoom SDK configured successfully');

            // Get meeting UUID for display purposes only
            try {
                const meetingUuidResponse = await zoomSdk.getMeetingUUID();
                const meetingUuid = meetingUuidResponse.meetingUUID;
                console.log('Meeting UUID obtained:', meetingUuid);
                this.addSystemMessage(`Connected to meeting: ${meetingUuid}`);
            } catch (error) {
                console.log('Could not get meeting UUID (may not be in a meeting):', error);
                this.addSystemMessage('Ready to receive transcripts from any meeting');
            }
        } catch (error) {
            console.error('Error initializing Zoom SDK:', error);
            this.addSystemMessage('Zoom SDK not available - transcript display ready');
        }
    }

    updateStatus(message, status) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
            this.statusElement.className = `status-${status}`;
        }
    }

    addTranscript(transcriptData) {
        const transcript = {
            speaker: transcriptData.speaker_name || transcriptData.speaker || 'Unknown',
            text: transcriptData.transcript || transcriptData.text || '',
            timestamp: transcriptData.timestamp || new Date().toISOString(),
            meetingUuid: transcriptData.meetingUuid || 'Unknown',
            id: Date.now() + Math.random(),
            isSystem: transcriptData.isSystem || false
        };

        this.transcripts.unshift(transcript);

        // Keep only the last maxTranscripts
        if (this.transcripts.length > this.maxTranscripts) {
            this.transcripts = this.transcripts.slice(0, this.maxTranscripts);
        }

        this.renderTranscripts();
        this.updateStatus(
            `Received ${this.transcripts.length} transcripts`,
            'active'
        );
    }

    addSystemMessage(message) {
        const transcript = {
            speaker: 'System',
            text: message,
            timestamp: new Date().toISOString(),
            meetingUuid: 'Unknown',
            id: Date.now() + Math.random(),
            isSystem: true
        };

        this.transcripts.unshift(transcript);

        // Keep only the last maxTranscripts
        if (this.transcripts.length > this.maxTranscripts) {
            this.transcripts = this.transcripts.slice(0, this.maxTranscripts);
        }

        this.renderTranscripts();
    }

    renderTranscripts() {
        if (!this.listElement) return;

        this.listElement.innerHTML = '';

        this.transcripts.forEach((transcript) => {
            const item = document.createElement('div');
            item.className = `transcript-item ${transcript.isSystem ? 'system-message' : ''}`;
            
            const meetingInfo = transcript.meetingUuid && transcript.meetingUuid !== 'Unknown' 
                ? `<span class="meeting-uuid">[${transcript.meetingUuid.substring(0, 8)}...]</span>` 
                : '';
            
            item.innerHTML = `
                <div class="transcript-header">
                    <span class="speaker">${transcript.speaker}</span>
                    ${meetingInfo}
                    <span class="timestamp">${new Date(
                        transcript.timestamp
                    ).toLocaleTimeString()}</span>
                </div>
                <div class="transcript-text">${transcript.text}</div>
            `;
            this.listElement.appendChild(item);
        });

        // Auto-scroll to top (newest transcript)
        if (this.containerElement) {
            this.containerElement.scrollTop = 0;
        }
    }

    // Show task suggestion UI
    showTaskSuggestion(taskSuggestion) {
        // Remove any existing task suggestion
        this.removeExistingTaskSuggestion();

        // Store the task suggestion data on the instance to avoid JSON parsing issues
        this.currentTaskSuggestion = taskSuggestion;

        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'task-suggestion';
        suggestionElement.id = 'current-task-suggestion';
        
        const taskIcon = this.getTaskIcon(taskSuggestion.taskType);
        
        suggestionElement.innerHTML = `
            <div class="task-suggestion-header">
                <span class="task-icon">${taskIcon}</span>
                <span class="task-title">AI detected a potential task</span>
                <button class="close-suggestion">×</button>
            </div>
            <div class="task-suggestion-content">
                <div class="task-type">Type: <strong>${taskSuggestion.taskType.toUpperCase()}</strong></div>
                <div class="task-description">${this.escapeHtml(taskSuggestion.taskDescription)}</div>
                <div class="task-action">${this.escapeHtml(taskSuggestion.suggestedAction)}</div>
                <div class="task-confidence">Confidence: ${Math.round(taskSuggestion.confidence * 100)}%</div>
                ${this.getBackendIndicator(taskSuggestion)}
            </div>
            <div class="task-suggestion-actions">
                <button class="btn-create-task">
                    Create ${taskSuggestion.taskType}
                </button>
                <button class="btn-dismiss">
                    Not now
                </button>
            </div>
        `;

        // Insert at the top of the transcript container
        if (this.containerElement) {
            this.containerElement.insertBefore(suggestionElement, this.containerElement.firstChild);
        }

        // Add event listeners for the buttons
        const createButton = suggestionElement.querySelector('.btn-create-task');
        const dismissButton = suggestionElement.querySelector('.btn-dismiss');
        const closeButton = suggestionElement.querySelector('.close-suggestion');

        if (createButton) {
            createButton.addEventListener('click', () => {
                this.createTask(this.currentTaskSuggestion);
            });
        }

        if (dismissButton) {
            dismissButton.addEventListener('click', () => {
                this.dismissTaskSuggestion();
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.dismissTaskSuggestion();
            });
        }

        // Auto-dismiss after 30 seconds
        setTimeout(() => {
            this.dismissTaskSuggestion();
        }, 30000);
    }

    getTaskIcon(taskType) {
        const icons = {
            coding: '💻',
            jira: '🎫',
            meeting: '📅',
            document: '📄',
            task: '✅',
            other: '📋'
        };
        return icons[taskType] || icons.other;
    }

    getBackendIndicator(taskSuggestion) {
        const isCodingTask = taskSuggestion.taskType === 'coding';
        const requiresBackend = taskSuggestion.requiresBackend || isCodingTask;
        
        if (requiresBackend) {
            return '<div class="backend-indicator backend-yes">🚀 Will execute via zoom-code backend</div>';
        } else {
            return '<div class="backend-indicator backend-no">📝 Will be tracked locally</div>';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    removeExistingTaskSuggestion() {
        const existing = document.getElementById('current-task-suggestion');
        if (existing) {
            existing.remove();
        }
    }

    dismissTaskSuggestion() {
        this.removeExistingTaskSuggestion();
    }

    async createTask(taskSuggestion) {
        try {
            console.log('🎯 Creating task:', taskSuggestion);
            
            if (!taskSuggestion) {
                throw new Error('No task suggestion data provided');
            }
            
            // Show loading state
            this.addSystemMessage('🔄 Creating task...');
            
            const response = await fetch('/api/tasks/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    analysisResult: taskSuggestion,
                    userConfirmation: true
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Task creation response:', result);
            
            if (result.success) {
                this.addSystemMessage(`✅ ${result.message}`);
                
                // Show backend integration status if available
                if (result.backendIntegration) {
                    if (result.backendIntegration.success) {
                        this.addSystemMessage(`🚀 Action item sent to zoom-code backend successfully`);
                    } else {
                        this.addSystemMessage(`⚠️ Backend integration failed: ${result.backendIntegration.error}`);
                    }
                }
                
                this.dismissTaskSuggestion();
            } else {
                this.addSystemMessage(`❌ Failed to create task: ${result.error || 'Unknown error'}`);
            }
            
        } catch (error) {
            console.error('❌ Error creating task:', error);
            this.addSystemMessage(`❌ Error creating task: ${error.message}`);
        }
    }

    // Task Management Methods
    initializeTaskManagement() {
        this.currentMeetingUuid = null;
        this.completedTasks = [];
        this.pendingTasks = [];
        
        // Refresh tasks every 5 seconds
        this.taskRefreshInterval = setInterval(() => {
            if (this.currentMeetingUuid) {
                this.refreshTasks();
            }
        }, 5000);
        
        console.log('📋 Task management initialized');
    }

    async refreshTasks() {
        if (!this.currentMeetingUuid) return;
        
        try {
            // Fetch completed tasks
            const completedResponse = await fetch(`/api/tasks/completed/${this.currentMeetingUuid}`);
            if (completedResponse.ok) {
                this.completedTasks = await completedResponse.json();
                this.updateCompletedTasksDisplay();
            }
            
            // Fetch pending task suggestions
            const pendingResponse = await fetch(`/api/tasks/pending/${this.currentMeetingUuid}`);
            if (pendingResponse.ok) {
                this.pendingTasks = await pendingResponse.json();
                this.updatePendingTasksDisplay();
            }
        } catch (error) {
            console.error('❌ Error refreshing tasks:', error);
        }
    }

    updateCompletedTasksDisplay() {
        if (!this.completedTasksList) return;
        
        if (this.completedTasks.length === 0) {
            this.completedTasksList.innerHTML = '<p class="no-tasks">No tasks completed yet.</p>';
            return;
        }
        
        const tasksHtml = this.completedTasks.map(task => this.renderTaskItem(task, 'completed')).join('');
        this.completedTasksList.innerHTML = tasksHtml;
    }

    updatePendingTasksDisplay() {
        if (!this.pendingTasksList) return;
        
        if (this.pendingTasks.length === 0) {
            this.pendingTasksList.innerHTML = '<p class="no-tasks">No pending task suggestions.</p>';
            return;
        }
        
        const tasksHtml = this.pendingTasks.map(task => this.renderTaskItem(task, 'pending')).join('');
        this.pendingTasksList.innerHTML = tasksHtml;
    }

    renderTaskItem(task, status) {
        const timestamp = new Date(task.createdAt || task.timestamp).toLocaleTimeString();
        const description = task.taskDescription || task.description || 'No description';
        const taskType = task.taskType || 'unknown';
        const requiresBackend = task.requiresBackend || task.taskType === 'coding';
        
        const backendIndicator = requiresBackend 
            ? '<span class="task-backend-indicator backend-yes">🚀 Backend execution</span>'
            : '<span class="task-backend-indicator backend-no">📝 Local tracking</span>';
        
        const actionButtons = status === 'pending' 
            ? `<div class="task-actions">
                 <button class="btn-approve-task" onclick="window.transcriptManager.approveTask('${task.id || task.suggestionId}')">✅ Approve</button>
                 <button class="btn-reject-task" onclick="window.transcriptManager.rejectTask('${task.id || task.suggestionId}')">❌ Reject</button>
               </div>`
            : '';
        
        return `
            <div class="task-item">
                <div class="task-item-header">
                    <span class="task-type ${taskType}">${taskType.toUpperCase()}</span>
                    <span class="task-timestamp">${timestamp}</span>
                </div>
                <div class="task-description">${this.escapeHtml(description)}</div>
                ${backendIndicator}
                ${actionButtons}
            </div>
        `;
    }

    async approveTask(taskId) {
        try {
            const response = await fetch('/api/tasks/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ suggestionId: taskId })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Task approved:', result);
                this.addSystemMessage(`✅ Task approved and created: ${result.message}`);
                this.refreshTasks(); // Refresh to update displays
            } else {
                throw new Error('Failed to approve task');
            }
        } catch (error) {
            console.error('❌ Error approving task:', error);
            this.addSystemMessage(`❌ Error approving task: ${error.message}`);
        }
    }

    async rejectTask(taskId) {
        try {
            const response = await fetch('/api/tasks/reject', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ suggestionId: taskId })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('❌ Task rejected:', result);
                this.addSystemMessage(`❌ Task suggestion rejected`);
                this.refreshTasks(); // Refresh to update displays
            } else {
                throw new Error('Failed to reject task');
            }
        } catch (error) {
            console.error('❌ Error rejecting task:', error);
            this.addSystemMessage(`❌ Error rejecting task: ${error.message}`);
        }
    }

    // Update meeting UUID when transcripts are received
    updateMeetingUuid(meetingUuid) {
        if (this.currentMeetingUuid !== meetingUuid) {
            this.currentMeetingUuid = meetingUuid;
            console.log('📋 Meeting UUID updated for task management:', meetingUuid);
            this.refreshTasks(); // Refresh tasks for new meeting
        }
    }

    // Clean up when leaving
    cleanup() {
        if (this.socket && this.meetingUuid) {
            this.socket.emit('leave-meeting', this.meetingUuid);
        }
        
        if (this.taskRefreshInterval) {
            clearInterval(this.taskRefreshInterval);
        }
    }
}

// Initialize transcript manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.transcriptManager = new TranscriptManager();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.transcriptManager) {
        window.transcriptManager.cleanup();
    }
});
