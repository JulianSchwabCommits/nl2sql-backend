/**
 * Comprehensive endpoint test for all backend routes
 * Tests: Health, Auth (signup/login/refresh/logout/profile/delete), Agent chat (HTTP & WS)
 *
 * Usage:
 *   node test-all-endpoints.mjs
 */

import { io } from "socket.io-client";

const BASE_URL = "http://localhost:3000";
const TEST_EMAIL = `testuser-${Date.now()}@example.com`;
const TEST_PASSWORD = "Test1234!";
const PROMPT = "What is 2+2?";

let accessToken = null;
let refreshTokenCookie = null;

// ── Test Results ──────────────────────────────────────────────────────────
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function log(test, status, message = "") {
  const icon = status === "✓" ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  const detail = message ? ` - ${message}` : "";
  console.log(`${icon} ${test}${detail}`);
  results.tests.push({ test, status, message });
  if (status === "✓") results.passed++;
  else results.failed++;
}

// ── 1. Health Check (GET /) ───────────────────────────────────────────────
async function testHealthCheck() {
  try {
    const res = await fetch(`${BASE_URL}/`, {
      method: "GET",
    });
    if (res.ok) {
      const text = await res.text();
      log("GET /", "✓", text.substring(0, 30));
    } else {
      log("GET /", "✗", `Status ${res.status}`);
    }
  } catch (err) {
    log("GET /", "✗", err.message);
  }
}

// ── 2. Auth: Signup (POST /auth/signup) ───────────────────────────────────
async function testSignup() {
  try {
    const res = await fetch(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    if (res.ok) {
      const body = await res.json();
      accessToken = body.accessToken;
      // Extract refresh token from Set-Cookie header
      const setCookie = res.headers.getSetCookie?.() || [];
      for (const cookie of setCookie) {
        if (cookie.includes("refresh_token=")) {
          refreshTokenCookie = cookie.split(";")[0];
        }
      }
      log("POST /auth/signup", "✓", "User created");
    } else if (res.status === 409) {
      log("POST /auth/signup", "✓", "User already exists");
    } else {
      const err = await res.json().catch(() => ({}));
      log("POST /auth/signup", "✗", `Status ${res.status}`);
    }
  } catch (err) {
    log("POST /auth/signup", "✗", err.message);
  }
}

// ── 3. Auth: Login (POST /auth/login) ─────────────────────────────────────
async function testLogin() {
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    if (res.ok) {
      const body = await res.json();
      accessToken = body.accessToken;
      // Extract refresh token from Set-Cookie header
      const setCookie = res.headers.getSetCookie?.() || [];
      for (const cookie of setCookie) {
        if (cookie.includes("refresh_token=")) {
          refreshTokenCookie = cookie.split(";")[0];
        }
      }
      log(
        "POST /auth/login",
        "✓",
        `Token obtained, refresh_token ${refreshTokenCookie ? "exists" : "missing"}`,
      );
    } else {
      const err = await res.json().catch(() => ({}));
      log("POST /auth/login", "✗", `Status ${res.status}`);
    }
  } catch (err) {
    log("POST /auth/login", "✗", err.message);
  }
}

// ── 4. Auth: Get Profile (GET /auth/profile) ──────────────────────────────
async function testGetProfile() {
  if (!accessToken) {
    log("GET /auth/profile", "✗", "No access token");
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/auth/profile`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const body = await res.json();
      log("GET /auth/profile", "✓", `User: ${body.email || "unknown"}`);
    } else {
      log("GET /auth/profile", "✗", `Status ${res.status}`);
    }
  } catch (err) {
    log("GET /auth/profile", "✗", err.message);
  }
}

// ── 5. Auth: Refresh Token (POST /auth/refresh) ───────────────────────────
async function testRefresh() {
  if (!accessToken || !refreshTokenCookie) {
    log("POST /auth/refresh", "✗", "No access token or refresh token");
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Cookie: refreshTokenCookie,
      },
    });
    if (res.ok) {
      const body = await res.json();
      accessToken = body.accessToken;
      log("POST /auth/refresh", "✓", "New token obtained");
    } else {
      const err = await res.json().catch(() => ({}));
      log(
        "POST /auth/refresh",
        "✗",
        `Status ${res.status}: ${err?.message || JSON.stringify(err)}`,
      );
    }
  } catch (err) {
    log("POST /auth/refresh", "✗", err.message);
  }
}

// ── 6. Agent: Chat HTTP (POST /agent/chat) ────────────────────────────────
async function testAgentChatHTTP() {
  if (!accessToken) {
    log("POST /agent/chat", "✗", "No access token");
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ prompt: PROMPT }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (
        res.status === 400 &&
        err?.message?.includes("HTTP chat endpoint is not supported")
      ) {
        log(
          "POST /agent/chat",
          "✓",
          "Correctly returns error (WebSocket only)",
        );
      } else {
        log(
          "POST /agent/chat",
          "✗",
          `Unexpected error: ${err?.message || JSON.stringify(err)}`,
        );
      }
    } else {
      log(
        "POST /agent/chat",
        "✗",
        "Should not succeed - HTTP endpoint disabled",
      );
    }
  } catch (err) {
    log("POST /agent/chat", "✗", err.message);
  }
}

// ── 7. Agent: Chat WebSocket (agent:chat event) ───────────────────────────
async function testAgentChatWS() {
  if (!accessToken) {
    log("WebSocket agent:chat", "✗", "No access token");
    return;
  }
  return new Promise((resolve) => {
    const socket = io(`${BASE_URL}/agent`, {
      auth: { token: accessToken },
      transports: ["websocket"],
      reconnectionDelay: 1000,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      log("WebSocket agent:chat", "✗", "Timeout (15s)");
      resolve();
    }, 15000);

    socket.on("connect", () => {
      socket.emit("agent:chat", { prompt: PROMPT });
    });

    socket.on("agent:response", ({ reply }) => {
      clearTimeout(timer);
      socket.disconnect();
      const preview = reply ? reply.substring(0, 50) + "..." : "empty";
      log("WebSocket agent:chat", "✓", preview);
      resolve();
    });

    socket.on("agent:error", (err) => {
      clearTimeout(timer);
      socket.disconnect();
      log("WebSocket agent:chat", "✗", err?.message || "Unknown error");
      resolve();
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.disconnect();
      log("WebSocket agent:chat", "✗", `Connection error: ${err.message}`);
      resolve();
    });
  });
}

// ── 8. Auth: Logout (POST /auth/logout) ───────────────────────────────────
async function testLogout() {
  if (!accessToken) {
    log("POST /auth/logout", "✗", "No access token");
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    if (res.ok) {
      log("POST /auth/logout", "✓", "Logged out");
      accessToken = null;
    } else {
      log("POST /auth/logout", "✗", `Status ${res.status}`);
    }
  } catch (err) {
    log("POST /auth/logout", "✗", err.message);
  }
}

// ── 9. Auth: Delete Profile (DELETE /auth/profile) ────────────────────────
async function testDeleteProfile() {
  // Sign up and login again for deletion test
  try {
    const deleteEmail = `delete-test-${Date.now()}@example.com`;
    const deletePassword = "Delete1234!";

    // Signup
    await fetch(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: deleteEmail, password: deletePassword }),
    });

    // Login
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: deleteEmail, password: deletePassword }),
    });

    if (!loginRes.ok) {
      log("DELETE /auth/profile", "✗", "Could not login for deletion test");
      return;
    }

    const { accessToken: deleteToken } = await loginRes.json();

    // Delete
    const deleteRes = await fetch(`${BASE_URL}/auth/profile`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${deleteToken}` },
      credentials: "include",
    });

    if (deleteRes.ok) {
      log("DELETE /auth/profile", "✓", "Account deleted");
    } else {
      log("DELETE /auth/profile", "✗", `Status ${deleteRes.status}`);
    }
  } catch (err) {
    log("DELETE /auth/profile", "✗", err.message);
  }
}

// ── Main Test Runner ──────────────────────────────────────────────────────
async function runTests() {
  console.log("\n" + "=".repeat(60));
  console.log("BACKEND ENDPOINT TESTS");
  console.log("=".repeat(60) + "\n");

  console.log("1️⃣  Health Check");
  await testHealthCheck();

  console.log("\n2️⃣  Authentication");
  await testSignup();
  await testLogin();

  console.log("\n3️⃣  Profile Management");
  await testGetProfile();

  console.log("\n4️⃣  Token Management");
  await testRefresh();

  console.log("\n5️⃣  Agent Communication");
  await testAgentChatHTTP();
  await testAgentChatWS();

  console.log("\n6️⃣  Logout");
  await testLogout();

  console.log("\n7️⃣  Account Deletion");
  await testDeleteProfile();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log("=".repeat(60) + "\n");

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
