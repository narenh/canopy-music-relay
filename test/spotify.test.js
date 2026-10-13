// node test/spotify.test.js — checks where spotify.js forwards each kind of callback.
"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { forwardTarget } = require(path.join(__dirname, "..", "spotify.js"));

const enc = (obj) => Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)).toString("base64url");
const N = "q3Jk8sXo1fYx2TbZ";
const tv = (host, port) => enc(port === undefined ? { v: 1, n: N, to: "tv", host } : { v: 1, n: N, to: "tv", host, port });
const app = enc({ v: 1, n: N, to: "app" });
const go = (q) => forwardTarget("?" + q);

let count = 0;
function check(name, query, expected) {
  assert.equal(go(query), expected, name);
  count++;
}

// Apple TV
const tvState = tv("bedroom-tv.local", 80);
check("tv, .local, port 80", `code=abc&state=${tvState}`, `http://bedroom-tv.local/spotify/callback?code=abc&state=${tvState}`);
check("tv, no port", `code=abc&state=${tv("Living-Room.local")}`, `http://Living-Room.local/spotify/callback?code=abc&state=${tv("Living-Room.local")}`);
check("tv, port 8080", `code=abc&state=${tv("tv.local", 8080)}`, `http://tv.local:8080/spotify/callback?code=abc&state=${tv("tv.local", 8080)}`);
check("tv, 192.168", `code=abc&state=${tv("192.168.1.20", 80)}`, `http://192.168.1.20/spotify/callback?code=abc&state=${tv("192.168.1.20", 80)}`);
check("tv, 10/8", `code=abc&state=${tv("10.0.0.5", 8080)}`, `http://10.0.0.5:8080/spotify/callback?code=abc&state=${tv("10.0.0.5", 8080)}`);
check("tv, 172.31", `code=abc&state=${tv("172.31.255.1")}`, `http://172.31.255.1/spotify/callback?code=abc&state=${tv("172.31.255.1")}`);
check("tv, error", `error=access_denied&state=${tvState}`, `http://bedroom-tv.local/spotify/callback?error=access_denied&state=${tvState}`);

// iPad / Mac app
check("app, code", `code=AQB-x_y&state=${app}`, `canopy-music://spotify-callback?code=AQB-x_y&state=${app}`);
check("app, error", `error=access_denied&state=${app}`, `canopy-music://spotify-callback?error=access_denied&state=${app}`);
check("app, code is encoded", `code=a%26b%3Dc%20d&state=${app}`, `canopy-music://spotify-callback?code=a%26b%3Dc%20d&state=${app}`);
check("extra params are dropped", `code=abc&state=${app}&evil=1`, `canopy-music://spotify-callback?code=abc&state=${app}`);

// Refused: hosts outside the LAN
for (const host of [
  "evil.com", "evil.com/.local", "tv.local.evil.com", "a.b.local", "-tv.local", "tv-.local", "tv.local:80", "tv.local/x",
  "user@tv.local", "8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.0.1", "127.0.0.1", "169.254.1.1", "0.0.0.0",
  "010.0.0.1", "10.0.0.256", "10.0.0", "10.0.0.1.2", "[::1]", "fe80::1", "", " tv.local",
]) {
  check(`refuse host ${JSON.stringify(host)}`, `code=abc&state=${tv(host)}`, null);
}
check("refuse host that isn't a string", `code=abc&state=${enc({ v: 1, n: N, to: "tv", host: ["tv.local"] })}`, null);

// Refused: bad ports
for (const port of [0, 65536, -1, 80.5, "80", null]) {
  check(`refuse port ${JSON.stringify(port)}`, `code=abc&state=${tv("tv.local", port)}`, null);
}
check("port 65535", `code=abc&state=${tv("tv.local", 65535)}`, `http://tv.local:65535/spotify/callback?code=abc&state=${tv("tv.local", 65535)}`);

// Refused: bad state or parameters
check("no state", "code=abc", null);
check("empty state", "code=abc&state=", null);
check("no code or error", `state=${app}`, null);
check("both code and error", `code=abc&error=x&state=${app}`, null);
check("empty code", `code=&state=${app}`, null);
check("two codes", `code=a&code=b&state=${app}`, null);
check("two states", `code=a&state=${app}&state=${app}`, null);
check("not base64url", "code=abc&state=%7B%22v%22%3A1%7D", null);
check("padded base64", `code=abc&state=${app}%3D`, null);
check("not JSON", `code=abc&state=${enc("hello")}`, null);
check("JSON array", `code=abc&state=${enc("[1]")}`, null);
check("JSON null", `code=abc&state=${enc("null")}`, null);
check("wrong version", `code=abc&state=${enc({ v: 2, n: N, to: "app" })}`, null);
check("no nonce", `code=abc&state=${enc({ v: 1, to: "app" })}`, null);
check("short nonce", `code=abc&state=${enc({ v: 1, n: "abc", to: "app" })}`, null);
check("unknown target", `code=abc&state=${enc({ v: 1, n: N, to: "web", host: "tv.local" })}`, null);
check("too long", `code=abc&state=${enc({ v: 1, n: N, to: "app", pad: "x".repeat(600) })}`, null);
check("empty query", "", null);

console.log(`ok: ${count} cases`);
console.log("example tv state: " + tvState);
console.log("example app state: " + app);
