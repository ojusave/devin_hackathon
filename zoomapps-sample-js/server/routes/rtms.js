import express from 'express';
import crypto from 'crypto';
import { handleError, sanitize } from '../helpers/routing.js';
import { startRTMS, stopRTMS } from '../services/rtms.js';
import { zoomApp } from '../../config.js';
import debug from 'debug';

const router = express.Router();
const dbg = debug('zoom-app:rtms-routes');

// Global broadcast function reference (will be set by server)
let globalBroadcastFunction = null;

/**
 * Set global broadcast function from server
 */
export function setBroadcastFunction(broadcastFn) {
    globalBroadcastFunction = broadcastFn;
    console.log('📡 Global broadcast function set for RTMS');
}

/**
 * Broadcast transcript to all connected clients
 */
function broadcastTranscript(transcriptData) {
    if (globalBroadcastFunction) {
        globalBroadcastFunction(transcriptData);
    } else {
        console.warn('⚠️ No global broadcast function available');
    }
}

/**
 * Webhook endpoint for RTMS events
 */
router.post('/webhook', (req, res) => {
    res.sendStatus(200);
    console.log('🎯 RTMS WEBHOOK RECEIVED:', JSON.stringify(req.body, null, 2));
    dbg('RTMS Webhook received:', JSON.stringify(req.body, null, 2));

    const { event, payload } = req.body;

    // Handle URL validation event
    if (event === 'endpoint.url_validation' && payload?.plainToken) {
        const hash = crypto
            .createHmac(
                'sha256',
                process.env.ZOOM_SECRET_TOKEN || zoomApp.clientSecret
            )
            .update(payload.plainToken)
            .digest('hex');
        dbg('Responding to URL validation challenge');
        return res.json({
            plainToken: payload.plainToken,
            encryptedToken: hash,
        });
    }

    // Handle RTMS started event
    if (event === 'meeting.rtms_started') {
        console.log('🟢 RTMS STARTED EVENT:', {
            event,
            meeting_uuid: payload.meeting_uuid,
            rtms_stream_id: payload.rtms_stream_id,
            server_urls: payload.server_urls,
            timestamp: new Date().toISOString(),
        });
        dbg('RTMS Started event received');
        const { meeting_uuid, rtms_stream_id, server_urls } = payload;

        // Create global transcript callback (no meeting UUID needed)
        const onTranscript = (meetingUuid, transcriptData) => {
            console.log('📝 PROCESSING TRANSCRIPT FOR BROADCAST:', {
                meetingUuid,
                transcriptData,
            });
            
            // Add meeting UUID to transcript data for context
            const enrichedTranscript = {
                ...transcriptData,
                meetingUuid,
                timestamp: new Date().toISOString()
            };
            
            // Broadcast to all connected clients
            broadcastTranscript(enrichedTranscript);
        };

        console.log('🔄 STARTING RTMS CONNECTION...', {
            meeting_uuid,
            rtms_stream_id,
        });
        startRTMS(meeting_uuid, rtms_stream_id, server_urls, onTranscript);
    }

    // Handle RTMS stopped event
    if (event === 'meeting.rtms_stopped') {
        console.log('🔴 RTMS STOPPED EVENT:', {
            event,
            meeting_uuid: payload.meeting_uuid,
            timestamp: new Date().toISOString(),
        });
        dbg('RTMS Stopped event received');
        const { meeting_uuid } = payload;
        stopRTMS(meeting_uuid);
        
        // Broadcast stop notification to all clients
        broadcastTranscript({
            type: 'meeting_ended',
            meetingUuid: meeting_uuid,
            message: 'Meeting transcript stream ended',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * API endpoint to get transcript status
 */
router.get('/status', async (req, res, next) => {
    try {
        sanitize(req);

        res.json({
            broadcastMode: true,
            message: 'Broadcasting transcripts from all meetings to all connected clients',
            hasBroadcastFunction: !!globalBroadcastFunction,
            timestamp: new Date().toISOString(),
        });
    } catch (e) {
        next(handleError(e));
    }
});

/**
 * Test endpoint to simulate transcript data (for debugging)
 */
router.post('/test-transcript/:meetingUuid', async (req, res, next) => {
    try {
        sanitize(req);
        const { meetingUuid } = req.params;
        const {
            speaker = 'Test Speaker',
            text = 'This is a test transcript message',
        } = req.body;

        console.log('🧪 TEST TRANSCRIPT ENDPOINT CALLED:', {
            meetingUuid,
            speaker,
            text,
        });

        const testTranscriptData = {
            transcript: text,
            speaker: speaker,
            timestamp: new Date().toISOString(),
            isTest: true,
        };

        const callback = transcriptCallbacks.get(meetingUuid);
        if (callback) {
            console.log(
                '✅ Found callback for meeting, triggering transcript...'
            );
            callback(testTranscriptData);
            res.json({
                success: true,
                message: 'Test transcript sent',
                testTranscriptData,
            });
        } else {
            console.log('❌ No callback found for meeting:', meetingUuid);
            res.json({
                success: false,
                message: 'No active transcript callback for this meeting',
            });
        }
    } catch (e) {
        next(handleError(e));
    }
});

export default router;
