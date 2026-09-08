const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const POLL_MS = Number(process.env.POLL_MS || 10000);

const METADATA_URL = 'https://yp.cdnstream1.com/metadata/10586_96k/current.json';
const ARTIST_TARGET = 'twenty one pilots';
const SUB_FILE = path.join(__dirname, 'subscriptions.json');

let subscriptions = [];
let current = { artist: '', title: '', raw: null, updatedAt: null };
let lastAlertKey = '';
let lastPollAt = null;
let lastError = null;

if (fs.existsSync(SUB_FILE)) {
  try { subscriptions = JSON.parse(fs.readFileSync(SUB_FILE, 'utf8')); }
  catch { subscriptions = []; }
}

function saveSubscriptions() {
  fs.writeFileSync(SUB_FILE, JSON.stringify(subscriptions, null, 2));
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) {
      return String(obj[key]).trim();
    }
  }
  return '';
}

function parseMetadata(data) {
  // Futuri feeds commonly expose artist/title directly. These fallbacks
  // also handle small variations in feed structure.
  const candidates = [];
  if (data && typeof data === 'object') {
    candidates.push(data);
    for (const k of ['nowplaying', 'nowPlaying', 'current', 'song', 'track']) {
      if (data[k] && typeof data[k] === 'object') candidates.push(data[k]);
    }
  }

  let artist = '';
  let title = '';

  for (const c of candidates) {
    artist ||= pick(c, ['artist', 'artistName', 'performer']);
    title ||= pick(c, ['title', 'song', 'songTitle', 'track', 'trackTitle']);
  }

  // Some feeds put "Artist - Title" in a single field.
  if ((!artist || !title) && data && typeof data === 'object') {
    const combined = pick(data, ['now_playing', 'nowPlaying', 'name']);
    if (combined && combined.includes(' - ')) {
      const [a, ...rest] = combined.split(' - ');
      artist ||= a.trim();
      title ||= rest.join(' - ').trim();
    }
  }

  return { artist, title };
}

async function fetchMetadata() {
  const response = await fetch(METADATA_URL, {
    headers: { 'User-Agent': 'TOP-1073-ALTCLE-Alert/1.0' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
  return response.json();
}

async function sendPush(payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    console.log('VAPID keys are not configured; skipping push.');
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const body = JSON.stringify(payload);
  const remaining = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, body);
      remaining.push(sub);
    } catch (err) {
      // 404/410 means the browser subscription expired or was removed.
      if (err.statusCode !== 404 && err.statusCode !== 410) remaining.push(sub);
    }
  }

  subscriptions = remaining;
  saveSubscriptions();
}

async function poll() {
  try {
    const data = await fetchMetadata();
    const parsed = parseMetadata(data);

    current = {
      artist: parsed.artist,
      title: parsed.title,
      raw: data,
      updatedAt: new Date().toISOString()
    };
    lastPollAt = new Date().toISOString();
    lastError = null;

    const artistMatch = normalize(parsed.artist) === ARTIST_TARGET;
    const key = `${normalize(parsed.artist)}|${normalize(parsed.title)}`;

    if (artistMatch && key && key !== lastAlertKey) {
      lastAlertKey = key;
      console.log(`Twenty One Pilots detected: ${parsed.title}`);

      await sendPush({
        title: 'Twenty One Pilots is on 107.3 ALTCLE 🎵',
        body: parsed.title ? `${parsed.title} — tune in now!` : 'Tune in now!',
        url: '/?top=playing',
        tag: 'top-playing'
      });
    }

    console.log(`[${new Date().toLocaleTimeString()}] ${parsed.artist} — ${parsed.title}`);
  } catch (err) {
    lastError = String(err.message || err);
    console.error('Poll error:', lastError);
  }
}

app.get('/api/status', (req, res) => {
  res.json({
    station: '107.3 ALTCLE',
    metadataUrl: METADATA_URL,
    current: {
      artist: current.artist,
      title: current.title,
      updatedAt: current.updatedAt
    },
    monitoring: true,
    lastPollAt,
    lastError,
    subscribers: subscriptions.length
  });
});

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

  const exists = subscriptions.some(x => x.endpoint === sub.endpoint);
  if (!exists) {
    subscriptions.push(sub);
    saveSubscriptions();
  }

  res.json({ ok: true, subscribers: subscriptions.length });
});

app.post('/api/unsubscribe', (req, res) => {
  const endpoint = req.body?.endpoint;
  subscriptions = subscriptions.filter(x => x.endpoint !== endpoint);
  saveSubscriptions();
  res.json({ ok: true });
});

app.post('/api/test', async (req, res) => {
  await sendPush({
    title: 'TOP Alert test 🎵',
    body: 'Notifications are working!',
    url: '/?test=1',
    tag: 'top-test'
  });
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TOP Alert running on port ${PORT}`);
  poll();
  setInterval(poll, POLL_MS);
});
