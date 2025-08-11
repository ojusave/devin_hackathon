// Transcript handling for Zoom App
/* global io, zoomSdk */
class TranscriptManager {
    constructor() {
        this.socket = null;
        this.meetingUuid = null;
        this.transcripts = [];
        this.maxTranscripts = 50; // Keep last 50 transcripts

        this.initializeElements();
        this.initializeSocket();
        this.initializeZoomSDK();
    }

    initializeElements() {
        this.statusElement = document.getElementById('transcript-status');
        this.listElement = document.getElementById('transcript-list');
        this.containerElement = document.getElementById('transcript-container');
    }

    initializeSocket() {
        // Initialize Socket.IO connection
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to transcript server');
            this.updateStatus('Connected to transcript server', 'connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from transcript server');
            this.updateStatus(
                'Disconnected from transcript server',
                'disconnected'
            );
        });

        this.socket.on('transcript', (transcriptData) => {
            console.log('🎯 CLIENT RECEIVED TRANSCRIPT:', {
                speaker: transcriptData.speaker || 'Unknown',
                text: transcriptData.transcript || transcriptData.text,
                timestamp: new Date().toISOString(),
                rawData: transcriptData,
            });
            this.addTranscript(transcriptData);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.updateStatus('Connection error', 'error');
        });
    }

    async initializeZoomSDK() {
        try {
            // Wait for Zoom Apps SDK to be available
            if (typeof zoomSdk !== 'undefined') {
                await this.setupZoomIntegration();
            } else {
                // Fallback: try to get meeting info from URL or other sources
                console.log('Zoom SDK not available, using fallback');
                this.setupFallback();
            }
        } catch (error) {
            console.error('Error initializing Zoom SDK:', error);
            this.updateStatus('Error connecting to meeting', 'error');
        }
    }

    async setupZoomIntegration() {
        try {
            // Get meeting context from Zoom SDK
            const context = await zoomSdk.getMeetingContext();
            this.meetingUuid = context.meetingUUID;

            if (this.meetingUuid) {
                console.log('Joining meeting room:', this.meetingUuid);
                this.socket.emit('join-meeting', this.meetingUuid);
                this.updateStatus(
                    `Connected to meeting: ${this.meetingUuid.substring(
                        0,
                        8
                    )}...`,
                    'connected'
                );
            } else {
                this.updateStatus('No meeting context available', 'warning');
            }
        } catch (error) {
            console.error('Error getting meeting context:', error);
            this.setupFallback();
        }
    }

    setupFallback() {
        // Generate a demo meeting UUID for testing
        this.meetingUuid = 'demo-meeting-' + Date.now();
        console.log('Using demo meeting UUID:', this.meetingUuid);
        this.socket.emit('join-meeting', this.meetingUuid);
        this.updateStatus('Demo mode - transcript ready', 'connected');
    }

    updateStatus(message, status) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
            this.statusElement.className = `status-${status}`;
        }
    }

    addTranscript(transcriptData) {
        // Remove "no transcripts" message if it exists
        const noTranscriptsMsg =
            this.listElement.querySelector('.no-transcripts');
        if (noTranscriptsMsg) {
            noTranscriptsMsg.remove();
        }

        // Create transcript element
        const transcriptElement = this.createTranscriptElement(transcriptData);

        // Add to beginning of list (most recent first)
        this.listElement.insertBefore(
            transcriptElement,
            this.listElement.firstChild
        );

        // Store transcript
        this.transcripts.unshift(transcriptData);

        // Limit number of displayed transcripts
        if (this.transcripts.length > this.maxTranscripts) {
            this.transcripts = this.transcripts.slice(0, this.maxTranscripts);
            const oldElements =
                this.listElement.querySelectorAll('.transcript-item');
            if (oldElements.length > this.maxTranscripts) {
                for (let i = this.maxTranscripts; i < oldElements.length; i++) {
                    oldElements[i].remove();
                }
            }
        }

        // Auto-scroll to show new transcript
        this.containerElement.scrollTop = 0;
    }

    createTranscriptElement(transcriptData) {
        const div = document.createElement('div');
        div.className = 'transcript-item';

        const timestamp = new Date().toLocaleTimeString();
        const speaker = transcriptData.speaker || 'Unknown Speaker';
        const text =
            transcriptData.transcript ||
            transcriptData.text ||
            'No text available';

        div.innerHTML = `
            <div class="transcript-header">
                <span class="transcript-speaker">${this.escapeHtml(
                    speaker
                )}</span>
                <span class="transcript-time">${timestamp}</span>
            </div>
            <div class="transcript-text">${this.escapeHtml(text)}</div>
        `;

        return div;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Clean up when leaving
    cleanup() {
        if (this.socket && this.meetingUuid) {
            this.socket.emit('leave-meeting', this.meetingUuid);
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
