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

    // Skip the fetch – hardcode the key directly
    const publicKey = 'BHuwp-gnJHOf1GiamwMrnCzKA5iglhGF4uXd5sm2FrNVtqavPf9UNkvgtB7O_216DtQjzRprsM0MOb5mngRl_5A';
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
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      msg.textContent = 'Please enable notifications first.';
      return;
    }
    
    const r = await fetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription })
    });
    const data = await r.json();
    msg.textContent = data.ok
      ? 'Test sent. Check your notification banner.'
      : 'Test failed: ' + (data.error || '');
  } catch (e) {
    msg.textContent = 'Test failed: ' + e.message;
  }
}

function urlBase64ToUint8Array(base64String) {
  // Remove any whitespace or line breaks
  base64String = base64String.replace(/\s/g, '');
  // Add padding if needed
  while (base64String.length % 4 !== 0) {
    base64String += '=';
  }
  // Convert to standard base64
  const raw = atob(base64String.replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

$('notifyBtn').addEventListener('click', enableNotifications);
$('testBtn').addEventListener('click', testNotification);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
getStatus();
setInterval(getStatus, 10000);
