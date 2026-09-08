const $ = id => document.getElementById(id);

async function getStatus() {
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    const s = await r.json();
    $('artist').textContent = s.current.artist || 'No song data yet';
    $('title').textContent = s.current.title || 'Waiting for station metadata…';
    $('updated').textContent = s.lastPollAt
      ? `Last checked ${new Date(s.lastPollAt).toLocaleTimeString()}`
      : '';
  } catch {
    $('artist').textContent = 'Connection problem';
    $('title').textContent = 'Trying again…';
  }
}

async function enableNotifications() {
  const msg = $('message');

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    msg.textContent = 'This browser does not support Web Push. On iPhone, add the site to your Home Screen and open it there.';
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      msg.textContent = 'Notifications were not allowed. You can enable them in iPhone Settings later.';
      return;
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const keyResponse = await fetch('/api/vapid-public-key');
    let { publicKey } = await keyResponse.json();
if (publicKey) publicKey = publicKey.trim();
if (!publicKey) throw new Error('Server VAPID key is not configured.');

    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch('/api/subscribe', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(subscription)
    });

    msg.textContent = 'Notifications are ON. You’re all set. 🎵';
    $('notifyBtn').textContent = 'Notifications Enabled ✓';
  } catch (e) {
    msg.textContent = e.message || 'Could not enable notifications.';
  }
}

async function testNotification() {
  const msg = $('message');
  try {
    const r = await fetch('/api/test', { method: 'POST' });
    const data = await r.json();
    msg.textContent = data.ok
      ? 'Test sent. Check your notification banner.'
      : 'Test failed.';
  } catch {
    msg.textContent = 'Test failed.';
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

$('notifyBtn').addEventListener('click', enableNotifications);
$('testBtn').addEventListener('click', testNotification);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
getStatus();
setInterval(getStatus, 10000);
