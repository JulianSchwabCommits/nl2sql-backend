/**
 * Manual integration test for the agent chat flow:
 *   1. Signup (silently ignored if user already exists)
 *   2. Login  → get accessToken
 *   3. Connect to Socket.io /agent namespace with the token
 *   4. Emit  agent:chat  { prompt }
 *   5. Print agent:response
 *
 * Usage:
 *   node test-agent-chat.mjs
 *
 * Requires socket.io-client:
 *   npm install --save-dev socket.io-client
 */

import { io } from "socket.io-client";

const BASE_URL = "http://localhost:3000";
const EMAIL = "testuser@example.com";
const PASSWORD = "Test1234!";
const PROMPT = "Who is the president of the USA?";

// ── 1. Signup ──────────────────────────────────────────────────────────────
async function signup() {
  const res = await fetch(`${BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (res.ok) {
    console.log("[signup] Account created.");
  } else {
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      console.log("[signup] Account already exists, skipping.");
    } else {
      console.warn(`[signup] Unexpected status ${res.status}:`, body);
    }
  }
}

// ── 2. Login ───────────────────────────────────────────────────────────────
async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`[login] Failed (${res.status}): ${JSON.stringify(body)}`);
  }

  const { accessToken } = await res.json();
  console.log("[login] Got access token.");
  return accessToken;
}

// ── 3 + 4 + 5. Connect → emit → receive ───────────────────────────────────
function chatOverWs(token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${BASE_URL}/agent`, {
      // Pass the JWT so WsAuthGuard can verify it
      auth: { token },
      transports: ["websocket"], // skip long-polling — WSS only
    });

    socket.on("connect", () => {
      console.log(`[ws] Connected  (id: ${socket.id})`);
      console.log(`[ws] Sending prompt: "${PROMPT}"`);
      socket.emit("agent:chat", { prompt: PROMPT });
    });

    socket.on("agent:response", ({ reply }) => {
      console.log("\n[agent:response]");
      console.log("─".repeat(60));
      console.log(reply);
      console.log("─".repeat(60));
      socket.disconnect();
      resolve(reply);
    });

    socket.on("agent:error", (err) => {
      console.error("[agent:error]", err);
      socket.disconnect();
      reject(new Error(err?.message ?? "Unknown agent error"));
    });

    socket.on("connect_error", (err) => {
      reject(new Error(`[ws] Connection error: ${err.message}`));
    });

    // Safety timeout — fail after 15 s if no response
    setTimeout(() => {
      socket.disconnect();
      reject(new Error("[ws] Timed out waiting for agent:response (15 s)"));
    }, 15_000);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    await signup();
    const token = await login();
    await chatOverWs(token);
    process.exit(0);
  } catch (err) {
    console.error("\n[ERROR]", err.message);
    process.exit(1);
  }
})();
