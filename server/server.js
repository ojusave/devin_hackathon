import http from 'http';
import debug from 'debug';
import { WebSocketServer } from 'ws';
import { appName } from '../config.js';
import {
    setTranscriptCallback,
    removeTranscriptCallback,
} from './routes/rtms.js';

const dbg = debug(`${appName}:http`);

/**
 * Start the HTTP server with WebSocket support
 * @param app - Express app to attach to
 * @param {String|number} port - local TCP port to serve from
 */
export async function start(app, port) {
    // Create HTTP server
    const server = http.createServer(app);

    // Initialize WebSocket Server
    const wss = new WebSocketServer({ server, path: '/transcript-ws' });

    // Store connected clients by meeting UUID
    const meetingClients = new Map();

    // Handle WebSocket connections
    wss.on('connection', (ws, req) => {
        console.log('🔗 WEBSOCKET CLIENT CONNECTED:', req.url);
        dbg(`WebSocket client connected from: ${req.url}`);

        let currentMeetingUuid = null;

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                console.log('📨 WEBSOCKET MESSAGE RECEIVED:', data);

                if (data.type === 'join-meeting' && data.meetingUuid) {
                    currentMeetingUuid = data.meetingUuid;

                    // Add client to meeting room
                    if (!meetingClients.has(currentMeetingUuid)) {
                        meetingClients.set(currentMeetingUuid, new Set());
                    }
                    meetingClients.get(currentMeetingUuid).add(ws);

                    console.log('🏠 CLIENT JOINING MEETING ROOM:', {
                        meetingUuid: currentMeetingUuid,
                        clientsInRoom:
                            meetingClients.get(currentMeetingUuid).size,
                    });

                    // Set up transcript callback for this meeting
                    setTranscriptCallback(
                        currentMeetingUuid,
                        (transcriptData) => {
                            const clients =
                                meetingClients.get(currentMeetingUuid);
                            if (clients) {
                                console.log(
                                    '🚀 EMITTING TRANSCRIPT TO CLIENTS:',
                                    {
                                        meetingUuid: currentMeetingUuid,
                                        clientsInRoom: clients.size,
                                        transcriptData,
                                    }
                                );

                                // Send to all clients in this meeting
                                clients.forEach((client) => {
                                    if (client.readyState === client.OPEN) {
                                        client.send(
                                            JSON.stringify({
                                                type: 'transcript',
                                                data: transcriptData,
                                            })
                                        );
                                    }
                                });
                            }
                        }
                    );

                    // Send confirmation
                    ws.send(
                        JSON.stringify({
                            type: 'joined',
                            meetingUuid: currentMeetingUuid,
                        })
                    );
                }
            } catch (error) {
                console.error('❌ Error processing WebSocket message:', error);
            }
        });

        ws.on('close', () => {
            console.log('🔌 WEBSOCKET CLIENT DISCONNECTED');

            // Remove client from meeting room
            if (currentMeetingUuid && meetingClients.has(currentMeetingUuid)) {
                meetingClients.get(currentMeetingUuid).delete(ws);
                if (meetingClients.get(currentMeetingUuid).size === 0) {
                    meetingClients.delete(currentMeetingUuid);
                    removeTranscriptCallback(currentMeetingUuid);
                }
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
        });
    });

    // let the user know when we're serving
    server.on('listening', () => {
        const addr = server.address();
        const bind =
            typeof addr === 'string'
                ? `pipe ${addr}`
                : `http://localhost:${addr.port}`;
        dbg(`Listening on ${bind}`);
        console.log(`🚀 Server started on ${bind}`);
        console.log(
            '📡 RTMS transcript logging is enabled - waiting for Zoom meeting transcripts...'
        );
        console.log(
            '🔍 To test transcripts, make sure your Zoom app is configured with RTMS webhooks'
        );
    });

    server.on('error', async (error) => {
        if (error?.syscall !== 'listen') throw error;

        const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

        // handle specific listen errors with friendly messages
        switch (error?.code) {
            case 'EACCES':
                throw new Error(`${bind} requires elevated privileges`);
            case 'EADDRINUSE':
                throw new Error(`${bind} is already in use`);
            default:
                throw error;
        }
    });

    // Listen on provided port, on all network interfaces
    return server.listen(port);
}
