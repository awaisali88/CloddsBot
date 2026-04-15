// Quick env diagnostic — safe to run, prints no secrets.
// Usage:  node check-env.js
require('dotenv').config();

const keys = [
  'BINANCE_API_KEY',
  'BINANCE_API_SECRET',
  'BYBIT_API_KEY',
  'BYBIT_API_SECRET',
  'MEXC_API_KEY',
  'MEXC_API_SECRET',
  'HYPERLIQUID_WALLET',
  'HYPERLIQUID_PRIVATE_KEY',
  'ANTHROPIC_API_KEY',
  'SOLANA_PRIVATE_KEY',
];

console.log('cwd:', process.cwd());
console.log('--- env var health ---');
for (const k of keys) {
  const v = process.env[k] || '';
  const present = v.length > 0;
  const trimmed = v.trim();
  const hasWhitespace = v !== trimmed;
  const hasQuotes = /^['"]|['"]$/.test(v);
  console.log(
    `${k.padEnd(28)} present=${String(present).padEnd(5)}  length=${String(v.length).padEnd(4)}  ${hasWhitespace ? 'WHITESPACE ' : ''}${hasQuotes ? 'QUOTES' : ''}`.trimEnd()
  );
}
