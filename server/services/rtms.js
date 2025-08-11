import crypto from 'crypto';
import WebSocket from 'ws';
import debug from 'debug';
import { zoomApp } from '../../config.js';

const dbg = debug('zoom-app:rtms');

// Map to keep track of active WebSocket connections
const activeConnections = new Map();

/**
 * Generate signature for RTMS authentication
 */
function generateSignature(clientId, meetingUuid, streamId, clientSecret) {
    dbg('Generating signature for meeting:', meetingUuid);
    const message = `${clientId},${meetingUuid},${streamId}`;
    return crypto
        .createHmac('sha256', clientSecret)
        .update(message)
        .digest('hex');
}

/**
 * Connect to signaling WebSocket server
 */
function connectToSignalingWebSocket(
    meetingUuid,
    streamId,
    serverUrl,
    onTranscript
) {
    dbg(`Connecting to signaling WebSocket for meeting ${meetingUuid}`);

    const ws = new WebSocket(serverUrl);

    // Store connection for cleanup later
    if (!activeConnections.has(meetingUuid)) {
        activeConnections.set(meetingUuid, {});
    }
    activeConnections.get(meetingUuid).signaling = ws;

    ws.on('open', () => {
        console.log('🔌 SIGNALING WEBSOCKET OPENED:', {
            meetingUuid,
            streamId,
        });
        dbg(`Signaling WebSocket connection opened for meeting ${meetingUuid}`);
        const signature = generateSignature(
            zoomApp.clientId,
            meetingUuid,
            streamId,
            zoomApp.clientSecret
        );

        const handshake = {
            msg_type: 1, // SIGNALING_HAND_SHAKE_REQ
            protocol_version: 1,
            meeting_uuid: meetingUuid,
            rtms_stream_id: streamId,
            sequence: Math.floor(Math.random() * 1e9),
            signature,
        };
        ws.send(JSON.stringify(handshake));
        dbg('Sent handshake to signaling server');
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        dbg('Signaling Message:', JSON.stringify(msg, null, 2));

        // Handle successful handshake response
        if (msg.msg_type === 2 && msg.status_code === 0) {
            const mediaUrl = msg.media_server?.server_urls?.all;
            if (mediaUrl) {
                connectToMediaWebSocket(
                    mediaUrl,
                    meetingUuid,
                    streamId,
                    ws,
                    onTranscript
                );
            }
        }

        // Respond to keep-alive requests
        if (msg.msg_type === 12) {
            const keepAliveResponse = {
                msg_type: 13,
                timestamp: msg.timestamp,
            };
            dbg('Responding to Signaling KEEP_ALIVE_REQ');
            ws.send(JSON.stringify(keepAliveResponse));
        }
    });

    ws.on('error', (err) => {
        console.log('⚠️ SIGNALING WEBSOCKET ERROR:', {
            meetingUuid,
            error: err.message,
        });
        dbg('Signaling socket error:', err);
    });

    ws.on('close', () => {
        console.log('🔴 SIGNALING WEBSOCKET CLOSED:', { meetingUuid });
        dbg('Signaling socket closed');
        if (activeConnections.has(meetingUuid)) {
            delete activeConnections.get(meetingUuid).signaling;
        }
    });
}

/**
 * Connect to media WebSocket server for transcript data
 */
function connectToMediaWebSocket(
    mediaUrl,
    meetingUuid,
    streamId,
    signalingSocket,
    onTranscript
) {
    dbg(`Connecting to media WebSocket at ${mediaUrl}`);

    const mediaWs = new WebSocket(mediaUrl, { rejectUnauthorized: false });

    if (activeConnections.has(meetingUuid)) {
        activeConnections.get(meetingUuid).media = mediaWs;
    }

    mediaWs.on('open', () => {
        console.log('🎬 MEDIA WEBSOCKET OPENED:', {
            meetingUuid,
            streamId,
            mediaUrl,
        });
        const signature = generateSignature(
            zoomApp.clientId,
            meetingUuid,
            streamId,
            zoomApp.clientSecret
        );
        const handshake = {
            msg_type: 3, // DATA_HAND_SHAKE_REQ
            protocol_version: 1,
            meeting_uuid: meetingUuid,
            rtms_stream_id: streamId,
            signature,
            media_type: 8, // MEDIA_DATA_TRANSCRIPT
            payload_encryption: false,
        };
        mediaWs.send(JSON.stringify(handshake));
    });

    mediaWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            dbg('Media JSON Message:', JSON.stringify(msg, null, 2));

            // Handle successful media handshake
            if (msg.msg_type === 4 && msg.status_code === 0) {
                console.log(
                    '✅ MEDIA HANDSHAKE SUCCESSFUL - Sending CLIENT_READY_ACK...',
                    {
                        meetingUuid,
                        streamId,
                        mediaParams: msg.media_params,
                        payloadEncrypted: msg.payload_encrypted,
                    }
                );

                const clientReadyAck = {
                    msg_type: 7, // CLIENT_READY_ACK
                    rtms_stream_id: streamId,
                };

                console.log('📤 SENDING CLIENT_READY_ACK:', clientReadyAck);
                signalingSocket.send(JSON.stringify(clientReadyAck));
                dbg('Media handshake successful, sent start streaming request');
            }

            // Handle transcript data (according to Zoom docs: msg_type 17)
            if (msg.msg_type === 17) {
                // MEDIA_DATA_TRANSCRIPT
                console.log('🎤 INCOMING TRANSCRIPT (msg_type 17):', {
                    meetingUuid,
                    speaker: msg.content?.user_name || 'Unknown',
                    text: msg.content?.data || msg.content,
                    timestamp: new Date().toISOString(),
                    fullMessage: msg,
                });

                // Format transcript data for our app
                const transcriptData = {
                    transcript: msg.content?.data || msg.content,
                    speaker: msg.content?.user_name || 'Unknown',
                    timestamp: new Date().toISOString(),
                };
                onTranscript(meetingUuid, transcriptData);
            }

            // Handle legacy format (msg_type 5) - keep for backward compatibility
            else if (msg.msg_type === 5 && msg.payload) {
                // DATA_FRAME
                try {
                    const transcriptData = JSON.parse(msg.payload);
                    if (transcriptData.transcript) {
                        console.log(
                            '🎤 INCOMING TRANSCRIPT (legacy msg_type 5):',
                            {
                                meetingUuid,
                                speaker: transcriptData.speaker || 'Unknown',
                                text: transcriptData.transcript,
                                timestamp: new Date().toISOString(),
                                fullData: transcriptData,
                            }
                        );
                        onTranscript(meetingUuid, transcriptData);
                    }
                } catch (err) {
                    console.log(
                        '❌ Error parsing legacy transcript data:',
                        err
                    );
                    dbg('Error parsing transcript data:', err);
                }
            }

            // Respond to keep-alive requests
            if (msg.msg_type === 12) {
                mediaWs.send(
                    JSON.stringify({
                        msg_type: 13,
                        timestamp: msg.timestamp,
                    })
                );
                dbg('Responded to Media KEEP_ALIVE_REQ');
            }
        } catch (err) {
            // Binary data - not transcript
            console.log('📊 RECEIVED BINARY DATA (not transcript):', {
                meetingUuid,
                dataLength: data.length,
                dataType: typeof data,
                isBuffer: Buffer.isBuffer(data),
            });
            dbg('Received binary data (not transcript)');
        }
    });

    mediaWs.on('error', (err) => {
        console.log('⚠️ MEDIA WEBSOCKET ERROR:', {
            meetingUuid,
            error: err.message,
        });
        dbg('Media socket error:', err);
    });

    mediaWs.on('close', () => {
        console.log('🔴 MEDIA WEBSOCKET CLOSED:', { meetingUuid });
        dbg('Media socket closed');
        if (activeConnections.has(meetingUuid)) {
            delete activeConnections.get(meetingUuid).media;
        }
    });
}

/**
 * Start RTMS connection for a meeting
 */
export function startRTMS(meetingUuid, streamId, serverUrls, onTranscript) {
    console.log('🔗 STARTING RTMS CONNECTION:', {
        meetingUuid,
        streamId,
        serverUrls,
        timestamp: new Date().toISOString(),
    });
    dbg(`Starting RTMS for meeting ${meetingUuid}`);
    connectToSignalingWebSocket(
        meetingUuid,
        streamId,
        serverUrls,
        onTranscript
    );
}

/**
 * Stop RTMS connection for a meeting
 */
export function stopRTMS(meetingUuid) {
    dbg(`Stopping RTMS for meeting ${meetingUuid}`);
    if (activeConnections.has(meetingUuid)) {
        const connections = activeConnections.get(meetingUuid);
        for (const conn of Object.values(connections)) {
            if (conn && typeof conn.close === 'function') {
                conn.close();
            }
        }
        activeConnections.delete(meetingUuid);
    }
}

/**
 * Get active connections count
 */
export function getActiveConnectionsCount() {
    return activeConnections.size;
}
