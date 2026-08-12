import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextCliPath = require.resolve('next/dist/bin/next');

// Next.js may re-exec its CLI. Keep --env-file on this small parent process so
// PORT is inherited normally instead of being propagated as a forbidden Node option.
const nextProcess = spawn(process.execPath, [nextCliPath, 'dev', 'apps/web'], {
  env: process.env,
  stdio: 'inherit',
});

const forwardedSignals = ['SIGINT', 'SIGTERM'];

function forwardSignal(signal) {
  if (!nextProcess.killed) {
    nextProcess.kill(signal);
  }
}

const signalHandlers = forwardedSignals.map((signal) => ({
  handler: () => forwardSignal(signal),
  signal,
}));

for (const { handler, signal } of signalHandlers) {
  process.once(signal, handler);
}

nextProcess.once('error', (error) => {
  console.error(`Unable to start the Next.js development server: ${error.message}`);
  process.exitCode = 1;
});

nextProcess.once('exit', (code) => {
  for (const { handler, signal } of signalHandlers) {
    process.off(signal, handler);
  }

  process.exitCode = code ?? 1;
});
