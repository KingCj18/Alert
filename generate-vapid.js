const webpush = require('web-push');
const fs = require('fs');

const keys = webpush.generateVAPIDKeys();

const env = [
  `VAPID_PUBLIC_KEY=${keys.publicKey}`,
  `VAPID_PRIVATE_KEY=${keys.privateKey}`,
  `VAPID_SUBJECT=mailto:you@example.com`,
  `PORT=3000`,
  `POLL_MS=10000`
].join('\n') + '\n';

fs.writeFileSync('.env.example', env);
console.log('\nVAPID keys generated.');
console.log('Copy .env.example to .env and replace VAPID_SUBJECT with your email.\n');
console.log(env);
