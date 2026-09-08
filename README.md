# Twenty One Pilots — 107.3 ALTCLE Web Alert

This is a web/PWA version of the radio alert app.

Confirmed station metadata endpoint:
https://yp.cdnstream1.com/metadata/10586_96k/current.json

What it does:
- Polls the ALTCLE Now Playing metadata every 10 seconds.
- Detects when the artist is Twenty One Pilots.
- Sends a web push notification to subscribed devices.
- Does NOT send any SMS automatically.
- Shows the current song in the web app.
- Can be installed on an iPhone Home Screen as a PWA.

## Important iPhone note

For Web Push on iPhone/iPad, install the website to the Home Screen first:
Safari -> Share -> Add to Home Screen.

Then open the Home Screen app and tap "Enable Notifications".

## Run locally

Requires Node.js 18+.

1. Install dependencies:
   npm install

2. Generate VAPID keys:
   npm run generate-vapid

3. Start:
   npm start

Open:
http://localhost:3000

Localhost is okay for development. iPhone push notifications require the deployed site to use HTTPS.

## Deploy

Use any Node.js host that keeps the process running continuously and provides HTTPS.

Set the generated VAPID values in the host's environment variables:
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT

Example VAPID_SUBJECT:
mailto:you@example.com

The server should remain running so it can poll the station even when the iPhone web app is closed.

## Test notification

After subscribing, open:
POST /api/test

A convenient button is included in the app.

## How detection works

The server compares the artist from the metadata feed after normalizing case and punctuation. It only alerts once per unique Twenty One Pilots track, so it won't repeatedly notify every 10 seconds while the same song remains on air.
