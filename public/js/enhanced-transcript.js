/**
 * Enhanced Transcript Display with Error Handling and Accessibility
 * Zoom Hackathon Frontend Enhancement
 */

class TranscriptManager {
    constructor() {
        this.sessionStartTime = Date.now();
        this.totalTranscripts = 0;
        this.uniqueSpeakers = new Set();
        this.totalWords = 0;
        this.recentTranscripts = [];
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        // DOM elements
        this.transcriptDisplay = null;
        this.statusDisplay = null;
        this.analyticsElements = {};
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    init() {
        try {
            this.initDOM();
            this.initWebSocket();
            this.startAnalyticsUpdater();
            console.log('✅ TranscriptManager initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize TranscriptManager:', error);
            this.showErrorMessage('Failed to initialize transcript display');
        }
    }
    
    initDOM() {
        // Get DOM elements with error checking
        this.transcriptDisplay = document.getElementById('transcript-list');
        this.statusDisplay = document.getElementById('transcript-status');
        
        if (!this.transcriptDisplay || !this.statusDisplay) {
            throw new Error('Required DOM elements not found');
        }
        
        // Get analytics elements
        this.analyticsElements = {
            totalTranscripts: document.getElementById('total-transcripts'),
            activeSpeakers: document.getElementById('active-speakers'),
            sessionDuration: document.getElementById('session-duration'),
            wordsPerMinute: document.getElementById('words-per-minute')
        };
        
        // Add accessibility attributes
        this.transcriptDisplay.setAttribute('aria-live', 'polite');
        this.transcriptDisplay.setAttribute('aria-label', 'Live transcript messages');
        this.statusDisplay.setAttribute('aria-live', 'assertive');
        this.statusDisplay.setAttribute('aria-label', 'Connection status');
    }
    
    initWebSocket() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const meetingUuid = urlParams.get('meetingUuid') || 'S/N3ZB7NQj+1oNKkv+t5zA==';
            
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/transcript-ws`;
            
            console.log('🔌 Connecting to transcript WebSocket:', wsUrl);
            
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocketHandlers(meetingUuid);
            
        } catch (error) {
            console.error('❌ Failed to initialize WebSocket:', error);
            this.handleConnectionError('Failed to establish WebSocket connection');
        }
    }
    
    setupWebSocketHandlers(meetingUuid) {
        this.ws.onopen = () => {
            console.log('✅ Transcript WebSocket connected');
            this.reconnectAttempts = 0;
            this.updateStatus('🟢 Connected. Waiting for transcripts...', 'connected');
            
            // Join the meeting room
            this.sendMessage({
                type: 'join-meeting',
                meetingUuid: meetingUuid
            });
            console.log('🏠 Joined meeting room:', meetingUuid);
        };
        
        this.ws.onmessage = (event) => {
            try {
                this.handleWebSocketMessage(event);
            } catch (error) {
                console.error('❌ Error handling WebSocket message:', error);
                this.showErrorMessage('Error processing transcript message');
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ Transcript WebSocket error:', error);
            this.handleConnectionError('WebSocket connection error occurred');
        };
        
        this.ws.onclose = (event) => {
            console.log('🔌 Transcript WebSocket closed', event.code, event.reason);
            
            if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.attemptReconnect();
            } else {
                this.updateStatus('🟠 Disconnected from transcript service', 'disconnected');
            }
        };
    }
    
    handleWebSocketMessage(event) {
        console.log('📨 WebSocket message received:', event.data);
        
        const message = JSON.parse(event.data);
        
        if (message.type === 'joined') {
            console.log('✅ Successfully joined meeting:', message.meetingUuid);
            this.updateStatus(`🟢 Connected to meeting: ${message.meetingUuid}`, 'connected');
            
        } else if (message.type === 'transcript' && message.data) {
            this.processTranscript(message.data);
            
        } else if (message.type === 'error') {
            console.error('❌ Server error:', message.error);
            this.showErrorMessage(`Server error: ${message.error}`);
        }
    }
    
    processTranscript(data) {
        console.log('🎯 Processing transcript:', data);
        
        // Clear "no transcripts" message
        const noTranscriptsMsg = this.transcriptDisplay.querySelector('.no-transcripts');
        if (noTranscriptsMsg) {
            noTranscriptsMsg.remove();
        }
        
        const transcriptText = data.transcript || data.text || 'No text';
        const speaker = data.speaker || 'Unknown Speaker';
        const timestamp = new Date(data.timestamp || Date.now());
        
        // Update analytics
        this.updateAnalyticsData(transcriptText, speaker);
        
        // Create and display transcript element
        this.createTranscriptElement(speaker, transcriptText, timestamp);
        
        // Update status
        this.updateStatus(`🟢 Last transcript: ${timestamp.toLocaleTimeString()}`, 'connected');
        
        // Update analytics display immediately
        this.updateAnalyticsDisplay();
        
        // Announce to screen readers (for accessibility)
        this.announceTranscript(speaker, transcriptText);
    }
    
    updateAnalyticsData(transcriptText, speaker) {
        this.totalTranscripts++;
        this.uniqueSpeakers.add(speaker);
        
        const wordCount = transcriptText.split(/\s+/).filter(word => word.length > 0).length;
        this.totalWords += wordCount;
        
        // Track recent transcripts for WPM calculation
        this.recentTranscripts.push({
            timestamp: Date.now(),
            wordCount: wordCount
        });
        
        // Clean old transcripts (keep only last hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.recentTranscripts = this.recentTranscripts.filter(t => t.timestamp > oneHourAgo);
    }
    
    createTranscriptElement(speaker, transcriptText, timestamp) {
        // Determine speaker color/ID for styling
        const speakerArray = Array.from(this.uniqueSpeakers);
        const speakerIndex = speakerArray.indexOf(speaker);
        const speakerId = `speaker-${(speakerIndex % 5) + 1}`;
        
        // Create enhanced transcript element
        const transcriptDiv = document.createElement('div');
        transcriptDiv.className = 'transcript-item';
        transcriptDiv.setAttribute('data-speaker', speakerId);
        transcriptDiv.setAttribute('role', 'article');
        transcriptDiv.setAttribute('aria-label', `Message from ${speaker}`);
        
        transcriptDiv.innerHTML = `
            <div class="transcript-header">
                <div class="transcript-speaker" role="heading" aria-level="3">${this.escapeHtml(speaker)}</div>
                <div class="transcript-time" role="time" datetime="${timestamp.toISOString()}">${timestamp.toLocaleTimeString()}</div>
            </div>
            <div class="transcript-text" role="main">${this.escapeHtml(transcriptText)}</div>
        `;
        
        // Add to transcript list (newest at top)
        this.transcriptDisplay.insertBefore(transcriptDiv, this.transcriptDisplay.firstChild);
        
        // Limit displayed transcripts to prevent memory issues (keep last 50)
        const items = this.transcriptDisplay.querySelectorAll('.transcript-item');
        if (items.length > 50) {
            items[items.length - 1].remove();
        }
    }
    
    updateAnalyticsDisplay() {
        try {
            const currentTime = Date.now();
            const sessionDuration = Math.floor((currentTime - this.sessionStartTime) / 1000);
            const minutes = Math.floor(sessionDuration / 60);
            const seconds = sessionDuration % 60;
            
            // Update UI elements if they exist
            if (this.analyticsElements.totalTranscripts) {
                this.analyticsElements.totalTranscripts.textContent = this.totalTranscripts;
            }
            
            if (this.analyticsElements.activeSpeakers) {
                this.analyticsElements.activeSpeakers.textContent = this.uniqueSpeakers.size;
            }
            
            if (this.analyticsElements.sessionDuration) {
                this.analyticsElements.sessionDuration.textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (this.analyticsElements.wordsPerMinute) {
                // Calculate words per minute (based on recent 5-minute window)
                const fiveMinutesAgo = currentTime - (5 * 60 * 1000);
                const recentWords = this.recentTranscripts
                    .filter(t => t.timestamp > fiveMinutesAgo)
                    .reduce((sum, t) => sum + t.wordCount, 0);
                const minutesElapsed = Math.min(5, sessionDuration / 60);
                const wpm = minutesElapsed > 0 ? Math.round(recentWords / minutesElapsed) : 0;
                this.analyticsElements.wordsPerMinute.textContent = wpm;
            }
            
        } catch (error) {
            console.error('❌ Error updating analytics:', error);
        }
    }
    
    startAnalyticsUpdater() {
        // Update analytics every second
        setInterval(() => {
            this.updateAnalyticsDisplay();
        }, 1000);
        
        // Initialize display
        this.updateAnalyticsDisplay();
    }
    
    updateStatus(message, className) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = message;
            this.statusDisplay.className = `status-${className}`;
        }
    }
    
    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('⚠️ Cannot send message: WebSocket not connected');
        }
    }
    
    attemptReconnect() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        
        this.updateStatus(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'disconnected');
        
        setTimeout(() => {
            console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            this.initWebSocket();
        }, delay);
    }
    
    handleConnectionError(message) {
        this.updateStatus(`🔴 ${message}`, 'error');
        console.error('Connection error:', message);
    }
    
    showErrorMessage(message) {
        console.error('Error:', message);
        
        // Show error in UI
        if (this.transcriptDisplay) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.setAttribute('role', 'alert');
            errorDiv.innerHTML = `
                <div style="background: var(--error-color); color: white; padding: var(--spacing-md); border-radius: var(--border-radius-md); margin: var(--spacing-md) 0;">
                    <strong>⚠️ Error:</strong> ${this.escapeHtml(message)}
                </div>
            `;
            
            this.transcriptDisplay.insertBefore(errorDiv, this.transcriptDisplay.firstChild);
            
            // Remove error message after 10 seconds
            setTimeout(() => {
                errorDiv.remove();
            }, 10000);
        }
    }
    
    announceTranscript(speaker, text) {
        // Create announcement for screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.textContent = `New message from ${speaker}: ${text}`;
        
        document.body.appendChild(announcement);
        
        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    destroy() {
        if (this.ws) {
            this.ws.close(1000, 'Component destroyed');
        }
    }
}

// Initialize the transcript manager
window.transcriptManager = new TranscriptManager();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.transcriptManager) {
        window.transcriptManager.destroy();
    }
});