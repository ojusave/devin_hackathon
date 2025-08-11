import http from 'http';
import debug from 'debug';
import { WebSocketServer } from 'ws';
import { appName } from '../config.js';
// No imports needed from rtms.js - using broadcast approach

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

    // Store all connected clients (no meeting UUID required)
    const connectedClients = new Set();

    // Global transcript broadcast function
    const broadcastTranscript = (transcriptData) => {
        console.log('🚀 BROADCASTING TRANSCRIPT TO ALL CLIENTS:', {
            connectedClients: connectedClients.size,
            transcriptData,
        });

        // Send to all connected clients
        connectedClients.forEach((client) => {
            if (client.readyState === client.OPEN) {
                client.send(
                    JSON.stringify({
                        type: 'transcript',
                        data: transcriptData,
                    })
                );
            }
        });
    };

    // Handle WebSocket connections
    wss.on('connection', (ws, req) => {
        console.log('🔗 WEBSOCKET CLIENT CONNECTED:', req.url);
        dbg(`WebSocket client connected from: ${req.url}`);

        // Add client to global set
        connectedClients.add(ws);
        console.log('📊 TOTAL CONNECTED CLIENTS:', connectedClients.size);

        // Send welcome message
        ws.send(
            JSON.stringify({
                type: 'connected',
                message: 'Ready to receive transcripts from any meeting',
                timestamp: new Date().toISOString(),
            })
        );

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                console.log('📨 WEBSOCKET MESSAGE RECEIVED:', data);
                
                // Handle ping/pong for connection health
                if (data.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                }
            } catch (error) {
                console.error('❌ Error processing WebSocket message:', error);
            }
        });

        ws.on('close', () => {
            console.log('🔌 WEBSOCKET CLIENT DISCONNECTED');
            dbg('WebSocket client disconnected');

            // Remove client from global set
            connectedClients.delete(ws);
            console.log('📊 REMAINING CONNECTED CLIENTS:', connectedClients.size);
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
        });
    });

    // let the user know when we're serving
    server.on('listening', () => {
        const addr = server.address();
        const bind = `http://localhost:${addr.port}`;
        dbg(`Listening on ${bind}`);
        console.log('✅ HTTP server running on port', port);
        console.log('🔌 WebSocket server integrated for transcript streaming');
        console.log('📡 Broadcasting mode: All transcripts will be sent to all connected clients');

        // Export broadcast function for use by RTMS routes
        server.broadcastTranscript = broadcastTranscript;
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

    // Export broadcast function for use by RTMS routes
    server.broadcastTranscript = broadcastTranscript;

    // Listen on provided port, on all network interfaces
    return server.listen(port);
}
