// Canopy Music's Spotify sign-in relay.
//
// Spotify sends the browser here with ?code=…&state=… (or ?error=…&state=…).
// This script forwards the browser, with those parameters, to wherever the
// sign-in started, as named in `state` (see README.md for the format):
//   to "app" -> canopy-music://spotify-callback?…
//   to "tv"  -> http://<.local name or private IPv4>[:port]/spotify/callback?…
// Anything else is refused. It never calls Spotify, stores nothing and sends
// nothing anywhere else.
(function () {
  "use strict";

  // A Bonjour name: one label of letters, digits and hyphens, then ".local".
  const LOCAL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/i;

  // 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16, written as four plain decimals.
  function isPrivateIPv4(host) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return false;
    const parts = m.slice(1);
    if (parts.some((p) => p.length > 1 && p[0] === "0")) return false; // no octal-looking parts
    const [a, b, c, d] = parts.map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }

  // base64url (no padding) of a JSON object; null if it isn't one.
  function decodeState(state) {
    if (state.length > 512 || !/^[A-Za-z0-9_-]+$/.test(state)) return null;
    try {
      const b64 = state.replace(/-/g, "+").replace(/_/g, "/");
      const value = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (e) {
      return null;
    }
  }

  // Where to send the browser for this query string, or null to refuse.
  function forwardTarget(search) {
    const params = new URLSearchParams(search);
    const one = (key) => (params.getAll(key).length === 1 ? params.get(key) : null);
    const state = one("state");
    const code = one("code");
    const error = one("error");
    if (!state || (code === null) === (error === null)) return null; // need state, and code or error
    if (!(code || error)) return null;

    const s = decodeState(state);
    if (!s || s.v !== 1 || typeof s.n !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(s.n)) return null;

    const query =
      (code !== null ? "code=" + encodeURIComponent(code) : "error=" + encodeURIComponent(error)) +
      "&state=" + encodeURIComponent(state);

    if (s.to === "app") return "canopy-music://spotify-callback?" + query;

    if (s.to === "tv") {
      const host = s.host;
      if (typeof host !== "string" || !(LOCAL_NAME.test(host) || isPrivateIPv4(host))) return null;
      let port = "";
      if (s.port !== undefined) {
        if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) return null;
        if (s.port !== 80) port = ":" + s.port;
      }
      return "http://" + host + port + "/spotify/callback?" + query;
    }

    return null;
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { forwardTarget }; // for test/spotify.test.js
    return;
  }

  const status = document.getElementById("status");
  const target = forwardTarget(location.search);
  if (!target) {
    status.textContent = "This link isn't for this page. Start signing in to Spotify again from Canopy Music.";
    return;
  }
  status.textContent = "Returning to Canopy Music…";
  location.replace(target);
  if (target.startsWith("canopy-music:")) {
    // Still here: the app didn't open (or the browser is asking first).
    setTimeout(() => {
      status.textContent = "Open Canopy Music to finish signing in.";
    }, 2000);
  }
})();
