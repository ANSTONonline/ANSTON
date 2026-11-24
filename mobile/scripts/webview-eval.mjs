// Runs a JavaScript expression inside the app's web view (debug builds only)
// through Chrome DevTools, and prints the result. Used by screenshots.sh.
// Usage: node webview-eval.mjs "<expression>"
const expr = process.argv[2];
const pages = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = pages.find((p) => p.type === "page");
if (!page) { console.log("no web view page found"); process.exit(0); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } }));
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id === 1) { console.log(JSON.stringify(msg.result?.result?.value ?? msg.result)); ws.close(); process.exit(0); }
};
setTimeout(() => { console.log("timeout"); process.exit(0); }, 15000);
