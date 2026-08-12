/**
 * Re-shoots the user-manual screenshots in public/manual/ — one set per locale.
 *
 * Needs the app running on APP_URL with demo data (`npm run db:demo`) so the pages
 * are not empty. Drives headless Chrome over CDP directly; no browser dependency.
 *
 *   node scripts/manual-shots.mjs
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const PORT = 9333;
const OUT = new URL("../public/manual/", import.meta.url);
const LOCALES = ["az", "ru", "en", "ka"];
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const env = Object.fromEntries(
  (await readFile(new URL("../.env", import.meta.url), "utf8"))
    .split("\n")
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);

const ADMIN = [env.ADMIN_EMAIL ?? "admin@ady.az", env.ADMIN_PASSWORD];
// The admin credentials come from .env; the demo operator's password is whatever the seed ran
// with, so pass OPERATOR_PASSWORD if it is not the compose default.
const OPERATOR = ["operator.bk@ady.az", process.env.OPERATOR_PASSWORD ?? env.OPERATOR_PASSWORD ?? "bkgrtb2026!"];
/** [file name, path]. Shot as the operator first, then everything else as the admin. */
const OPERATOR_SHOTS = [
  ["turnarounds", "/turnarounds"],
  ["new-turnaround", "/turnarounds/new"],
];
const ADMIN_SHOTS = [
  ["dashboard", "/dashboard"],
  ["journal", "/reports/journal"],
  ["admin-users", "/admin/users"],
  ["admin-locomotives", "/admin/locomotives"],
  ["admin-maintenance", "/admin/maintenance"],
  ["admin-operations", "/admin/operations"],
  ["admin-audit", "/admin/audit"],
];

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/railops-shots",
  "--no-first-run",
  "--hide-scrollbars",
  "--force-device-scale-factor=2",
  "--window-size=1440,980",
]);
chrome.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

/* ---------- minimal CDP client ------------------------------------------------------------- */
let nextId = 0;
const pending = new Map();
const socket = await connect();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      const ws = new WebSocket(webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const settle = pending.get(message.id);
        if (settle) {
          pending.delete(message.id);
          if (message.error) settle.reject(new Error(message.error.message));
          else settle.resolve(message.result);
        }
      };
      return ws;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome did not expose a debugger");
}

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

/* ---------- page helpers -------------------------------------------------------------------- */
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);

await call("Page.enable");
await call("Network.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 980,
  deviceScaleFactor: 2,
  mobile: false,
});

const evaluate = async (expression) =>
  (await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

const viewport = (height) =>
  call("Emulation.setDeviceMetricsOverride", { width: 1440, height, deviceScaleFactor: 2, mobile: false });

async function go(path) {
  await call("Page.navigate", { url: `${APP}${path}` });
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await evaluate("document.readyState")) === "complete") break;
    await sleep(250);
  }
  await sleep(900); // client components, fonts, the odd fetch
  // The dev-mode Next badge is not part of the product.
  await evaluate(
    "document.head.insertAdjacentHTML('beforeend','<style>nextjs-portal{display:none!important}</style>')",
  );
}

async function setLocale(locale) {
  await call("Network.setCookie", { name: "railops_locale", value: locale, url: APP });
}

async function signIn([email, password], locale) {
  // The session cookie is httpOnly — only CDP can drop it, and dropping it takes the locale with it.
  await call("Network.clearBrowserCookies");
  await setLocale(locale);
  await go("/login");
  // Retried: the form only submits once React has hydrated the action onto it.
  for (let attempt = 0; attempt < 10; attempt++) {
    await evaluate(`(() => {
      const form = document.querySelector('form');
      form.email.value = ${JSON.stringify(email)};
      form.password.value = ${JSON.stringify(password)};
      form.requestSubmit();
    })()`);
    for (let wait = 0; wait < 10; wait++) {
      await sleep(300);
      if (!(await evaluate("location.pathname")).startsWith("/login")) return;
    }
  }
  throw new Error(
    `Sign-in failed for ${email}: ${await evaluate("document.querySelector('[role=alert]')?.textContent ?? document.title")}`,
  );
}

async function shoot(name, locale) {
  // Crop to the content: a manual figure with half a page of white below it reads as a bug.
  const content = await evaluate("document.documentElement.scrollHeight");
  await viewport(Math.min(Math.max(content, 620), 2200));
  await sleep(250);
  const { data } = await call("Page.captureScreenshot", { format: "webp", quality: 82 });
  await viewport(980);
  await writeFile(new URL(`${name}.${locale}.webp`, OUT), Buffer.from(data, "base64"));
  console.log(`${name}.${locale}.webp`);
}

/* ---------- the run -------------------------------------------------------------------------- */
await mkdir(OUT, { recursive: true });

for (const locale of LOCALES) {
  await call("Network.clearBrowserCookies");
  await setLocale(locale);
  await go("/login");
  await shoot("login", locale);

  await signIn(OPERATOR, locale);
  for (const [name, path] of OPERATOR_SHOTS) {
    await go(path);
    await shoot(name, locale);
  }

  // The detail shot has to be a turnaround this operator may actually edit, so take whatever
  // their own list is offering rather than a fixed id.
  await go("/turnarounds");
  const detail = await evaluate(`[...document.querySelectorAll('tbody a[href^="/turnarounds/"]')]
    .map((a) => a.getAttribute('href'))
    .find((href) => href !== '/turnarounds/new')`);
  await go(detail ?? "/turnarounds/1");
  await shoot("turnaround-detail", locale);

  await signIn(ADMIN, locale);
  for (const [name, path] of ADMIN_SHOTS) {
    await go(path);
    await shoot(name, locale);
  }
}

socket.close();
chrome.kill();
