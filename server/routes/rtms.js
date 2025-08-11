import express from 'express';
import crypto from 'crypto';
import { handleError, sanitize } from '../helpers/routing.js';
import { startRTMS, stopRTMS } from '../services/rtms.js';
import { zoomApp } from '../../config.js';
import debug from 'debug';

const router = express.Router();
const dbg = debug('zoom-app:rtms-routes');

// Store for transcript callbacks - maps meeting UUID to Socket.IO room
const transcriptCallbacks = new Map();

/**
 * Set transcript callback for a meeting
 */
export function setTranscriptCallback(meetingUuid, callback) {
    transcriptCallbacks.set(meetingUuid, callback);
}

/**
 * Remove transcript callback for a meeting
 */
export function removeTranscriptCallback(meetingUuid) {
    transcriptCallbacks.delete(meetingUuid);
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

        // Create transcript callback for this meeting
        const onTranscript = (meetingUuid, transcriptData) => {
            console.log('📝 PROCESSING TRANSCRIPT CALLBACK:', {
                meetingUuid,
                hasCallback: transcriptCallbacks.has(meetingUuid),
                transcriptData,
            });
            const callback = transcriptCallbacks.get(meetingUuid);
            if (callback) {
                callback(transcriptData);
            }
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
        removeTranscriptCallback(meeting_uuid);
    }
});

/**
 * API endpoint to get transcript status
 */
router.get('/status/:meetingUuid', async (req, res, next) => {
    try {
        sanitize(req);
        const { meetingUuid } = req.params;

        const hasCallback = transcriptCallbacks.has(meetingUuid);

        res.json({
            meetingUuid,
            isActive: hasCallback,
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
