# Real-Time Zoom Meeting Transcript Display App

This application uses Node.js + Express to build a Zoom App with **Real-Time Media Streams (RTMS)** integration for live meeting transcript display. The app receives live transcripts from Zoom meetings and displays them in real-time within the app interface using WebSocket connections.

## Features

✅ **Real-Time Transcript Display**: Live meeting transcripts streamed directly to the app interface  
✅ **RTMS Integration**: Full Zoom Real-Time Media Streams implementation with WebSocket connections  
✅ **Live WebSocket Streaming**: Native WebSocket connections for real-time data flow  
✅ **AI-Powered Task Detection**: GPT-4 analyzes transcripts to identify task creation opportunities  
✅ **Smart Task Suggestions**: Automatically detects mentions of meetings, Jira tickets, documents, and projects  
✅ **Interactive Task Creation**: One-click task creation with user confirmation  
✅ **Context-Aware Analysis**: Maintains conversation context for accurate task detection  
✅ **Comprehensive Logging**: Detailed console logging for debugging and monitoring transcript flow  
✅ **Speaker Identification**: Displays speaker names and timestamps for each transcript  
✅ **Browser & Zoom Client Support**: Works in both browser testing and Zoom client environments  

## Prerequisites

1. [Node JS](https://nodejs.org/en/)
2. [Ngrok](https://ngrok.com/docs/getting-started)
3. [Zoom Account](https://support.zoom.us/hc/en-us/articles/207278726-Plan-Types-) with RTMS access
4. [OpenAI API Key](https://platform.openai.com/api-keys) for GPT-4 analysis
5. [Zoom App Credentials](#config:-app-credentials) (Instructions below)
    1. Client ID
    2. Client Secret
    3. Redirect URI
    4. Secret Token (for RTMS webhooks)

## Getting started

Open your terminal:

```bash
# Navigate to the project directory
cd zoom-rtms-transcript-app

# run NPM to install the app dependencies
npm install

# initialize your ngrok session
ngrok http 3000
```

### Create your Zoom App

In your web browser, navigate to [Zoom Developer Portal](https://developers.zoom.us/) and register/log into your
developer account.

Click the "Build App" button at the top and choose to "Zoom Apps" application.

1. Name your app
2. Choose whether to list your app on the marketplace or not
3. Click "Create"

For more information on creating Zoom Apps, you can refer to the [Zoom Developer Documentation](https://developers.zoom.us/docs/zoom-apps/).

### Config: App Credentials

In your terminal where you launched `ngrok`, find the `Forwarding` value and copy/paste that into the "Home URL" and "
Redirect URL for OAuth" fields.

```
Home URL:               https://xxxxx.ngrok.io
Redirect URL for OAuth: https://xxxxx.ngrok.io/auth
```

> NOTE: ngrok URLs under ngrok's Free plan are ephemeral, meaning they will only live for up to a couple hours at most, and will change every time you reinitialize the application. This will require you to update these fields every time you restart your ngrok service.

#### OAuth allow list

- `https://example.ngrok.io`

#### Domain allow list

- `appssdk.zoom.us`
- `ngrok.io`

### Config: Information

The following information is required to activate your application:

- Basic Information
    - App name
    - Short description
    - Long description (entering a short message here is fine for now)
- Developer Contact Information
    - Name
    - Email address

> NOTE: if you intend to publish your application on the Zoom Apps Marketplace, more information will be required in this section before submitting.

### Config: App Features

Under the Zoom App SDK section, click the `+ Add APIs` button and enable the following options from their respective
sections:

#### APIs

- shareApp

#### RTMS Configuration

For Real-Time Media Streams functionality, you need to configure:

1. **Event Subscriptions**: Add webhook endpoint URL for RTMS events
   - Webhook URL: `https://[your-ngrok-url]/rtms`
   - Subscribe to: `meeting.rtms_started` and `meeting.rtms_stopped` events

2. **RTMS Features**: Enable Real-Time Media Streams in your app settings

### Scopes

Ensure that the following scopes are selected on the Scopes tab:
- `zoomapp:inmeeting`
- `meeting:read` (for RTMS access)

### Config `.env`

When building for Development, open the `.env` file in your text editor and enter the following information from the App Credentials section you just
configured:

```ini
# Client ID for your Zoom App
ZM_CLIENT_ID=[app_client_id]

# Client Secret for your Zoom app
ZM_CLIENT_SECRET=[app_client_secret]

# Redirect URI set for your app in the Zoom Marketplace
ZM_REDIRECT_URL=https://[xxxx-xx-xx-xxx-x].ngrok.io/auth

# Secret Token for RTMS webhook validation (required for transcript functionality)
ZOOM_SECRET_TOKEN=[your_secret_token]
```

#### Zoom for Government

If you are a [Zoom for Government (ZfG)](https://www.zoomgov.com/) customer you can use the `ZM_HOST` variable to change
the base URL used for Zoom. This will allow you to adjust to the different Marketplace and API Base URLs used by ZfG
customers.

**Marketplace URL:** marketplace.*zoomgov.com*

**API Base URL:** api.*zoomgov.com*

## Start the App

### Development

Run the `dev` npm script to start in development mode using a Docker container.

```shell
npm run dev
```

The `dev` script will:

1. Watch JS files and built to the dist/ folder
1. Watch Server files and build to the dist/ folder
1. Start the application

### Production

When running your application in production no logs are sent to the console by default and the server is not restarted
on file changes.

We use the `NODE_ENV` environment variable here to tell the application to start in prodcution mode.

```shell
# Mac/Linux
NODE_ENV=production npm start

# Windows
set NODE_ENV=production && npm start
````

## Usage

To install the Zoom App, Navigate to the **Home URL** that you set in your browser and click the link to install.

After you authorize the app, Zoom will automatically open the app within the client.

### Real-Time Transcript Display

Once installed and running in a Zoom meeting:

1. **Automatic RTMS Activation**: The app automatically starts Real-Time Media Streams when opened in a meeting
2. **Live Transcript Display**: Transcripts appear in real-time as participants speak
3. **Speaker Identification**: Each transcript shows the speaker's name and timestamp
4. **WebSocket Connection**: The app uses native WebSocket connections for optimal performance

#### Testing the Transcript Feature

**In Browser (Development)**:
- Navigate to `http://localhost:3000` 
- The transcript container will show connection status
- WebSocket connects automatically to receive live transcripts

**In Zoom Meeting**:
- Install the app in your Zoom client
- Join a meeting and open the app
- Start speaking - transcripts will appear in real-time
- Multiple participants' transcripts are displayed with speaker names

#### Troubleshooting

**No Transcripts Appearing**:
1. Check server console for `🎤 INCOMING TRANSCRIPT` logs
2. Verify WebSocket connection: Look for `🔗 WEBSOCKET CLIENT CONNECTED` 
3. Ensure RTMS webhook is properly configured in Zoom Marketplace
4. Check that `ZOOM_SECRET_TOKEN` is set in your `.env` file

**Console Logging**:
The app provides comprehensive logging for debugging:
- `🎯 RTMS WEBHOOK RECEIVED` - Webhook events from Zoom
- `🔌 SIGNALING WEBSOCKET OPENED` - RTMS connection established  
- `🎤 INCOMING TRANSCRIPT` - Live transcript data received
- `🚀 EMITTING TRANSCRIPT TO CLIENTS` - Data sent to frontend
- `🎯 RECEIVED TRANSCRIPT` - Frontend receiving transcript data

### Keeping secrets secret

This application makes use of your Zoom App Client ID and Client Secret as well as a custom secret for signing session
cookies. During development, the application will read from the .env file. ;

In order to align with security best practices, this application does not read from the .env file in production mode.

This means you'll want to set environment variables on the hosting platform that you'
re using instead of within the .env file. This might include using a secret manager or a CI/CD pipeline.

> :warning: **Never commit your .env file to version control:** The file likely contains Zoom App Credentials and Session Secrets

### Code Style

This project uses [prettier](https://prettier.io/) and [eslint](https://eslint.org/) to enforce style and protect
against coding errors along with a pre-commit git hook(s) via [husky](https://typicode.github.io/husky/#/) to ensure
files pass checks prior to commit.

### Testing

At this time there are no e2e or unit tests.

## Architecture

### RTMS Implementation

The app implements Zoom's Real-Time Media Streams (RTMS) with the following architecture:

**Server-Side Components**:
- `server/services/rtms.js` - Core RTMS service with WebSocket connections to Zoom
- `server/routes/rtms.js` - Webhook endpoints and transcript callback management  
- `server/server.js` - WebSocket server for frontend connections
- Native WebSocket implementation (not Socket.IO) for optimal performance

**Frontend Components**:
- Native WebSocket client connection to `/transcript-ws` endpoint
- Real-time transcript display with speaker identification
- Automatic reconnection and error handling

**Data Flow**:
1. Zoom Meeting → RTMS Webhook → Server
2. Server → Zoom RTMS WebSocket → Transcript Data
3. Server → Frontend WebSocket → Live Display
4. Browser → Real-time UI Updates

### Key Files

- `server/services/rtms.js` - RTMS WebSocket connections and transcript processing
- `server/routes/rtms.js` - Webhook handling and callback management
- `server/server.js` - WebSocket server for frontend communication
- `server/views/index.pug` - Frontend template with transcript display
- `app.js` - Express app configuration with CSP settings for WebSocket support

## Need help?

If you're looking for help, try [Developer Support](https://devsupport.zoom.us) or
our [Developer Forum](https://devforum.zoom.us). Priority support is also available
with [Premier Developer Support](https://zoom.us/docs/en-us/developer-support-plans.html) plans.

### Documentation
Make sure to review [our documentation](https://marketplace.zoom.us/docs/zoom-apps/introduction/) as a reference when building your Zoom Apps.