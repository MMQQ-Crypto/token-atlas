const { parentPort } = require('node:worker_threads');
const { Scanner } = require('./scanner.cjs');
const scanner = new Scanner();
parentPort.on('message', async settings => {
  try { parentPort.postMessage({ data: await scanner.scan(settings) }); }
  catch (e) { parentPort.postMessage({ error: e.message }); }
});
