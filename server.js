const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const POLL_MS = Number(process.env.POLL_MS || 10000);

const METADATA_URL = 'https://yp.cdnstream1.com/metadata/10586_96k/current.json';
const ARTIST_TARGET = 'twenty one pilots';

// Supabase setup
const supabaseUrl = 'https://blkhvofpdikepknlstnt.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
let supabase;

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase connected successfully.');
  } else {
    console.log('⚠️ Supabase credentials missing. Using memory-only storage.');
  }
} catch (err) {
  console.error('❌ Supabase connection error:', err.message);
}

let subscriptions = [];
let current = { artist: '', title: '', raw: null, updatedAt: null };
let lastAlertKey = '';
let lastPollAt = null;
let lastError = null;

async function loadSubscriptions() {
  if (!supabase) {
    console.log('⚠️ Supabase not available. Subscriptions will not persist across restarts.');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*');
    
    if (error) throw error;
    
    subscriptions = data.map(row => ({
      endpoint: row.endpoint,
      keys: { auth: row.keys_auth, p256dh: row.keys_p256dh }
    }));
    console.log(`✅ Loaded ${subscriptions.length} subscriptions from Supabase.`);
  } catch (err) {
    console.error('❌ Failed to load subscriptions from Supabase:', err.message);
  }
}

async function saveSubscription(subscription) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('subscriptions')
      .insert({
        endpoint: subscription.endpoint,
        keys_auth: subscription.keys.auth,
        keys_p256dh: subscription.keys.p256dh
      });
    
    if (error) throw error;
    console.log('✅ Subscription saved to Supabase.');
  } catch (err) {
    console.error('❌ Failed to save subscription:', err.message);
  }
}

async function removeSubscription(endpoint) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('endpoint', endpoint);
    
    if (error) throw error;
    console.log('✅ Subscription removed from Supabase.');
  } catch (err) {
    console.error('❌ Failed to remove subscription:', err.message);
  }
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseMetadata(data) {
  if (Array.isArray(data) && data.length > 0) {
    data = data[0];
  }
  
  if (!data || typeof data !== 'object') {
    return { artist: '', title: '' };
  }
  
  const artist = data.TPE1 || data.artist || data.artistName || data.performer || '';
  const title = data.TIT2 || data.TTI2 || data.title || data.song || data.songTitle || data.track || '';
  
  if (artist && title) {
    return { artist: String(artist).trim(), title: String(title).trim() };
  }
  
  return { artist: '', title: '' };
}

async function fetchMetadata() {
  const response = await fetch(METADATA_URL, {
    headers: { 'User-Agent': 'TOP-1073-ALTCLE-Alert/1.0' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON response from metadata endpoint');
  }
}

async function sendPush(payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    console.log('⚠️ VAPID keys are not configured; skipping push.');
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
      if (err.statusCode !== 404 && err.statusCode !== 410) remaining.push(sub);
      else await removeSubscription(sub.endpoint);
    }
  }

  subscriptions = remaining;
}

async function poll() {
  try {
    // Safety: If fetchMetadata fails, don't crash the interval
    let data;
    try {
      data = await fetchMetadata();
    } catch (fetchErr) {
      console.error('⚠️ Fetch error (continuing):', fetchErr.message);
      lastError = fetchErr.message;
      return; // Exit poll() gracefully, interval keeps running
    }

    let parsed;
    try {
      parsed = parseMetadata(data);
    } catch (parseErr) {
      console.error('⚠️ Parse error (continuing):', parseErr.message);
      lastError = parseErr.message;
      return; // Exit poll() gracefully, interval keeps running
    }

    current = {
      artist: parsed.artist || '',
      title: parsed.title || '',
      raw: data,
      updatedAt: new Date().toISOString()
    };
    lastPollAt = new Date().toISOString();
    lastError = null;

    const artistMatch = normalize(parsed.artist) === ARTIST_TARGET;
    const key = `${normalize(parsed.artist)}|${normalize(parsed.title)}`;

    if (artistMatch && key && key !== lastAlertKey) {
      lastAlertKey = key;
      console.log(`🎵 Twenty One Pilots detected: ${parsed.title}`);
      try {
        await sendPush({
          title: 'Twenty One Pilots is on Emma Radio 🎵',
          body: parsed.title ? `${parsed.title} — tune in now!` : 'Tune in now!',
          url: '/?top=playing',
          tag: 'top-playing'
        });
      } catch (pushErr) {
        console.error('Push error:', pushErr.message);
      }
    }

    console.log(`[${new Date().toLocaleTimeString()}] ${parsed.artist} — ${parsed.title}`);
  } catch (err) {
    lastError = String(err.message || err);
    console.error('❌ Poll error (wrapped):', lastError);
    // The interval continues — we don't crash here!
  }
}

// Routes
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

app.post('/api/subscribe', async (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

  const exists = subscriptions.some(x => x.endpoint === sub.endpoint);
  if (!exists) {
    subscriptions.push(sub);
    await saveSubscription(sub);
  }

  res.json({ ok: true, subscribers: subscriptions.length });
});

app.post('/api/unsubscribe', async (req, res) => {
  const endpoint = req.body?.endpoint;
  subscriptions = subscriptions.filter(x => x.endpoint !== endpoint);
  await removeSubscription(endpoint);
  res.json({ ok: true });
});

app.post('/api/test', async (req, res) => {
  const subscription = req.body.subscription;
  
  if (!subscription) {
    return res.status(400).json({ error: 'Missing subscription' });
  }
  
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  try {
    await webpush.sendNotification(subscription, JSON.stringify({
      title: 'Emma is watching test 👀',
      body: 'Notifications are working!',
      url: '/?test=1',
      tag: 'top-test'
    }));
    res.json({ ok: true });
  } catch (err) {
    console.error('Test notification failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Watchdog: If poll() hasn't run in 60 seconds, force a restart
let lastPollSuccess = Date.now();
const originalPoll = poll;
poll = async function() {
  lastPollSuccess = Date.now();
  await originalPoll();
};

setInterval(() => {
  const secondsSinceLastPoll = (Date.now() - lastPollSuccess) / 1000;
  if (secondsSinceLastPoll > 60) {
    console.error(`⚠️ No poll for ${secondsSinceLastPoll}s. Restarting process...`);
    process.exit(1); // Render will restart the server
  }
}, 30000);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 TOP Alert running on port ${PORT}`);
  await loadSubscriptions();
  poll();
  setInterval(poll, POLL_MS);
});
