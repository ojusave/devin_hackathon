/**
 * Main Application Controller for Zoom RTMS Transcript App
 * Manages UI state, statistics, controls, and integrates with transcript functionality
 */

class ZoomTranscriptApp {
    constructor() {
        this.isTranscriptActive = false;
        this.sessionStartTime = null;
        this.transcripts = [];
        this.speakers = new Set();
        this.searchTerm = '';
        this.sessionStats = {
            totalMessages: 0,
            uniqueSpeakers: 0,
            sessionDuration: 0,
            averageWPM: 0,
            totalWords: 0
        };

        this.initializeApp();
    }

    async initializeApp() {
        try {
            console.log('🚀 Initializing Zoom RTMS Transcript App...');
            
            this.initializeElements();
            this.bindEventListeners();
            this.startSessionTimer();
            this.hideLoadingOverlay();
            
            // Wait a moment for transcript manager to initialize
            setTimeout(() => {
                this.integrateWithTranscriptManager();
            }, 1000);

            console.log('✅ App initialization complete');
        } catch (error) {
            console.error('❌ App initialization failed:', error);
            this.showError('Failed to initialize application');
        }
    }

    initializeElements() {
        // Status and connection elements
        this.connectionStatus = document.getElementById('connection-status');
        this.meetingId = document.getElementById('meeting-id');
        this.meetingStatus = document.getElementById('meeting-status');
        this.participantCount = document.getElementById('participant-count');

        // Control elements
        this.toggleTranscriptBtn = document.getElementById('toggle-transcript');
        this.clearTranscriptBtn = document.getElementById('clear-transcript');
        this.downloadTranscriptBtn = document.getElementById('download-transcript');
        this.searchInput = document.getElementById('search-transcript');

        // Statistics elements
        this.sessionDurationEl = document.getElementById('session-duration');
        this.uniqueSpeakersEl = document.getElementById('unique-speakers');
        this.totalMessagesEl = document.getElementById('total-messages');
        this.avgWpmEl = document.getElementById('avg-wpm');

        // Transcript elements
        this.transcriptCount = document.getElementById('transcript-count');
        this.lastUpdate = document.getElementById('last-update');
        this.transcriptList = document.getElementById('transcript-list');

        // Loading overlay
        this.loadingOverlay = document.getElementById('loading-overlay');

        console.log('📝 UI elements initialized');
    }

    bindEventListeners() {
        // Control button listeners
        if (this.toggleTranscriptBtn) {
            this.toggleTranscriptBtn.addEventListener('click', () => this.toggleTranscript());
        }

        if (this.clearTranscriptBtn) {
            this.clearTranscriptBtn.addEventListener('click', () => this.clearTranscripts());
        }

        if (this.downloadTranscriptBtn) {
            this.downloadTranscriptBtn.addEventListener('click', () => this.downloadTranscripts());
        }

        // Search functionality
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            this.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(e.target.value);
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        console.log('🎧 Event listeners bound');
    }

    integrateWithTranscriptManager() {
        if (window.transcriptManager) {
            console.log('🔗 Integrating with transcript manager');
            
            // Override the addTranscript method to include our statistics
            const originalAddTranscript = window.transcriptManager.addTranscript.bind(window.transcriptManager);
            
            window.transcriptManager.addTranscript = (transcriptData) => {
                originalAddTranscript(transcriptData);
                this.handleNewTranscript(transcriptData);
            };

            // Update meeting info if available
            if (window.transcriptManager.meetingUuid) {
                this.updateMeetingInfo(window.transcriptManager.meetingUuid);
            }

            // Monitor connection status
            if (window.transcriptManager.socket) {
                this.monitorSocketConnection(window.transcriptManager.socket);
            }
        } else {
            console.warn('⚠️ Transcript manager not available, retrying in 2 seconds...');
            setTimeout(() => this.integrateWithTranscriptManager(), 2000);
        }
    }

    monitorSocketConnection(socket) {
        socket.on('connect', () => {
            this.updateConnectionStatus('Connected', 'connected');
            this.updateMeetingStatus('Active');
        });

        socket.on('disconnect', () => {
            this.updateConnectionStatus('Disconnected', 'disconnected');
            this.updateMeetingStatus('Disconnected');
        });

        socket.on('connect_error', () => {
            this.updateConnectionStatus('Connection Error', 'warning');
            this.updateMeetingStatus('Error');
        });
    }

    handleNewTranscript(transcriptData) {
        // Update statistics
        this.sessionStats.totalMessages++;
        this.speakers.add(transcriptData.speaker || 'Unknown');
        this.sessionStats.uniqueSpeakers = this.speakers.size;

        // Calculate words and WPM
        const text = transcriptData.transcript || transcriptData.text || '';
        const wordCount = this.countWords(text);
        this.sessionStats.totalWords += wordCount;
        this.sessionStats.averageWPM = this.calculateAverageWPM();

        // Store transcript
        this.transcripts.unshift({
            ...transcriptData,
            timestamp: Date.now(),
            wordCount: wordCount
        });

        // Update UI
        this.updateStatistics();
        this.updateTranscriptInfo();

        console.log('📊 Stats updated:', this.sessionStats);
    }

    updateConnectionStatus(message, status) {
        if (this.connectionStatus) {
            const statusSpan = this.connectionStatus.querySelector('span');
            const statusIcon = this.connectionStatus.querySelector('i');
            
            if (statusSpan) statusSpan.textContent = message;
            
            this.connectionStatus.className = `status-indicator ${status}`;
            
            if (statusIcon) {
                statusIcon.className = status === 'connected' ? 'fas fa-circle' : 
                                    status === 'disconnected' ? 'fas fa-times-circle' : 
                                    'fas fa-exclamation-circle';
            }
        }
    }

    updateMeetingInfo(meetingUuid) {
        if (this.meetingId) {
            const shortId = meetingUuid.length > 20 ? 
                `${meetingUuid.substring(0, 8)}...${meetingUuid.substring(meetingUuid.length - 8)}` : 
                meetingUuid;
            this.meetingId.textContent = shortId;
        }
    }

    updateMeetingStatus(status) {
        if (this.meetingStatus) {
            this.meetingStatus.textContent = status;
            this.meetingStatus.className = `status-badge ${status.toLowerCase()}`;
        }
    }

    toggleTranscript() {
        this.isTranscriptActive = !this.isTranscriptActive;
        
        if (this.toggleTranscriptBtn) {
            const icon = this.toggleTranscriptBtn.querySelector('i');
            const span = this.toggleTranscriptBtn.querySelector('span');
            
            if (this.isTranscriptActive) {
                if (icon) icon.className = 'fas fa-pause';
                if (span) span.textContent = 'Pause Transcript';
                this.toggleTranscriptBtn.classList.remove('btn-primary');
                this.toggleTranscriptBtn.classList.add('btn-secondary');
                
                if (!this.sessionStartTime) {
                    this.sessionStartTime = Date.now();
                }
            } else {
                if (icon) icon.className = 'fas fa-play';
                if (span) span.textContent = 'Start Transcript';
                this.toggleTranscriptBtn.classList.remove('btn-secondary');
                this.toggleTranscriptBtn.classList.add('btn-primary');
            }
        }
        
        console.log(`🎮 Transcript ${this.isTranscriptActive ? 'started' : 'paused'}`);
    }

    clearTranscripts() {
        if (confirm('Are you sure you want to clear all transcripts? This action cannot be undone.')) {
            this.transcripts = [];
            this.speakers.clear();
            this.sessionStats = {
                totalMessages: 0,
                uniqueSpeakers: 0,
                sessionDuration: 0,
                averageWPM: 0,
                totalWords: 0
            };

            // Clear the transcript list in the DOM
            if (this.transcriptList) {
                this.transcriptList.innerHTML = `
                    <div class="no-transcripts">
                        <i class="fas fa-microphone-slash"></i>
                        <p>No transcripts available yet</p>
                        <small>Start speaking in the meeting to see transcripts appear here</small>
                    </div>
                `;
            }

            this.updateStatistics();
            this.updateTranscriptInfo();
            
            console.log('🗑️ Transcripts cleared');
        }
    }

    downloadTranscripts() {
        if (this.transcripts.length === 0) {
            alert('No transcripts available to download.');
            return;
        }

        const transcriptData = this.generateTranscriptReport();
        const blob = new Blob([transcriptData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `zoom-transcript-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        console.log('💾 Transcript downloaded');
    }

    generateTranscriptReport() {
        const header = `ZOOM RTMS TRANSCRIPT REPORT
Generated: ${new Date().toLocaleString()}
Meeting Duration: ${this.formatDuration(this.sessionStats.sessionDuration)}
Total Messages: ${this.sessionStats.totalMessages}
Unique Speakers: ${this.sessionStats.uniqueSpeakers}
Average WPM: ${this.sessionStats.averageWPM}

${'='.repeat(50)}

`;

        const transcriptContent = this.transcripts
            .reverse() // Show chronological order in export
            .map(transcript => {
                const time = new Date(transcript.timestamp).toLocaleTimeString();
                const speaker = transcript.speaker || 'Unknown';
                const text = transcript.transcript || transcript.text || 'No text';
                return `[${time}] ${speaker}: ${text}`;
            })
            .join('\n\n');

        return header + transcriptContent;
    }

    handleSearch(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase().trim();
        
        if (this.searchTerm === '') {
            // Show all transcripts
            this.displayFilteredTranscripts(this.transcripts);
        } else {
            // Filter transcripts
            const filtered = this.transcripts.filter(transcript => {
                const text = (transcript.transcript || transcript.text || '').toLowerCase();
                const speaker = (transcript.speaker || '').toLowerCase();
                return text.includes(this.searchTerm) || speaker.includes(this.searchTerm);
            });
            
            this.displayFilteredTranscripts(filtered);
        }
    }

    performSearch(searchTerm) {
        this.handleSearch(searchTerm);
        console.log(`🔍 Search performed: "${searchTerm}" (${this.getFilteredCount()} results)`);
    }

    displayFilteredTranscripts(filteredTranscripts) {
        // This would integrate with the transcript manager's display logic
        // For now, we'll just log the filtered results
        console.log(`📋 Filtered transcripts: ${filteredTranscripts.length} results`);
    }

    getFilteredCount() {
        if (this.searchTerm === '') return this.transcripts.length;
        
        return this.transcripts.filter(transcript => {
            const text = (transcript.transcript || transcript.text || '').toLowerCase();
            const speaker = (transcript.speaker || '').toLowerCase();
            return text.includes(this.searchTerm) || speaker.includes(this.searchTerm);
        }).length;
    }

    updateStatistics() {
        if (this.sessionDurationEl) {
            this.sessionDurationEl.textContent = this.formatDuration(this.sessionStats.sessionDuration);
        }
        
        if (this.uniqueSpeakersEl) {
            this.uniqueSpeakersEl.textContent = this.sessionStats.uniqueSpeakers;
        }
        
        if (this.totalMessagesEl) {
            this.totalMessagesEl.textContent = this.sessionStats.totalMessages;
        }
        
        if (this.avgWpmEl) {
            this.avgWpmEl.textContent = Math.round(this.sessionStats.averageWPM);
        }
    }

    updateTranscriptInfo() {
        if (this.transcriptCount) {
            const count = this.transcripts.length;
            this.transcriptCount.textContent = `${count} message${count !== 1 ? 's' : ''}`;
        }
        
        if (this.lastUpdate) {
            this.lastUpdate.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        }
    }

    startSessionTimer() {
        this.sessionStartTime = Date.now();
        
        setInterval(() => {
            if (this.sessionStartTime) {
                this.sessionStats.sessionDuration = Date.now() - this.sessionStartTime;
                this.updateStatistics();
            }
        }, 1000);
    }

    calculateAverageWPM() {
        if (this.sessionStats.sessionDuration === 0) return 0;
        
        const durationMinutes = this.sessionStats.sessionDuration / (1000 * 60);
        return durationMinutes > 0 ? this.sessionStats.totalWords / durationMinutes : 0;
    }

    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    formatDuration(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    handleKeyboardShortcuts(event) {
        // Ctrl/Cmd + K for search focus
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            if (this.searchInput) {
                this.searchInput.focus();
            }
        }
        
        // Space bar to toggle transcript (when not in input field)
        if (event.key === ' ' && !event.target.matches('input, textarea')) {
            event.preventDefault();
            this.toggleTranscript();
        }
        
        // Escape to clear search
        if (event.key === 'Escape' && this.searchInput === document.activeElement) {
            this.searchInput.value = '';
            this.handleSearch('');
            this.searchInput.blur();
        }
    }

    hideLoadingOverlay() {
        if (this.loadingOverlay) {
            setTimeout(() => {
                this.loadingOverlay.classList.add('hidden');
            }, 1500); // Show loading for 1.5 seconds
        }
    }

    showError(message) {
        console.error('❌ Error:', message);
        
        // You could implement a toast notification system here
        if (this.connectionStatus) {
            this.updateConnectionStatus(message, 'warning');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM loaded, initializing Zoom RTMS App...');
    window.zoomApp = new ZoomTranscriptApp();
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZoomTranscriptApp;
}