# canopy-music-relay

The static site at [music.canopysf.com](https://music.canopysf.com/), served by Cloudflare Pages:

- `/` (`index.html`): a short page about [Canopy Music](https://github.com/narenh/canopy-music).
- `/support` (`support.html`): where to get help; the App Store support URL.
- `/spotify` (`spotify.html` + `spotify.js`): the relay for Canopy Music's Spotify sign-in.

No build step. Deploy the repository root as is. Canopy Music uses `https://music.canopysf.com/spotify` by default; you can also [host your own](#host-your-own).

## Why the relay exists

Since 2025 Spotify rejects plain `http` redirect URIs, except loopback addresses. An Apple TV running a party can't receive an `https` one: it has no browser, and the phone you sign in on can only reach it at a plain `http` address on your Wi-Fi. The relay gives Spotify one fixed, recognisable HTTPS address, and the page sends the browser on to the iPad or Mac app, or to the Apple TV on your network. iPad and Apple TV hosts register the same URI, so one Spotify developer app works for both.

Register this redirect URI in the [Spotify developer dashboard](https://developer.spotify.com/dashboard) (or your own relay's address, set in Canopy Music's "Spotify sign-in page" setting):

```
https://music.canopysf.com/spotify
```

The app must send exactly the same `redirect_uri` in both the authorize request and the token exchange.

## The marker

`spotify.html` carries `<meta name="canopy-music-relay" content="1">`. Before saving a custom sign-in page, the apps load the address and check for this tag; `1` is the version of the `state` format below.

## The `state` parameter

The app puts where the sign-in started into `state`: compact JSON, UTF-8, then base64url without padding (`A–Z a–z 0–9 - _`, at most 512 characters).

| Field  | Value |
| ------ | ----- |
| `v`    | `1` |
| `n`    | Random nonce, 16–128 base64url characters. The app keeps it and rejects a callback whose nonce doesn't match. |
| `to`   | `"app"` (iPad or Mac) or `"tv"` (Apple TV) |
| `host` | `tv` only: the TV's `.local` name, or its private IPv4 address |
| `port` | `tv` only, optional: a number 1–65535; leave it out for 80 |

```
{"v":1,"n":"q3Jk8sXo1fYx2TbZ","to":"tv","host":"bedroom-tv.local","port":80}
→ eyJ2IjoxLCJuIjoicTNKazhzWG8xZll4MlRiWiIsInRvIjoidHYiLCJob3N0IjoiYmVkcm9vbS10di5sb2NhbCIsInBvcnQiOjgwfQ

{"v":1,"n":"q3Jk8sXo1fYx2TbZ","to":"app"}
→ eyJ2IjoxLCJuIjoicTNKazhzWG8xZll4MlRiWiIsInRvIjoiYXBwIn0
```

The page passes `state` on unchanged.

## Forwarding rules

Spotify calls the relay with `?code=…&state=…`, or `?error=…&state=…` (for example when the user cancels). The page forwards `code` or `error`, and `state`, with `location.replace` (so Back doesn't return to the code):

- `to: "app"` → `canopy-music://spotify-callback?code=…&state=…`
- `to: "tv"` → `http://{host}[:{port}]/spotify/callback?code=…&state=…`, only when `host` is a single-label `.local` name (letters, digits, hyphens) or an IPv4 address in 10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16, and `port` is 1–65535.

Anything else (no or malformed `state`, a different version, a short nonce, another host, both or neither of `code` and `error`, repeated parameters) isn't forwarded: the page says "This link isn't for this page. Start signing in to Spotify again from Canopy Music." Other query parameters are dropped.

## Security

- **Only the code passes through.** It's an authorization code for PKCE: useless without the code verifier, which never leaves the device that started the sign-in. There's no client secret.
- **Nothing is stored or sent.** The page has no analytics, makes no requests besides its own files, never calls Spotify, and keeps nothing (no cookies or storage). `Cache-Control: no-store` and `Referrer-Policy: no-referrer` keep the code out of caches and referrers. The site is static files on Cloudflare Pages, with no server code of its own; like any host, Cloudflare sees the requested URL.
- **No open redirect.** The only destinations are the app's scheme and `http` addresses on a private network, with a fixed path.
- **Strict CSP** on `/spotify`: `default-src 'none'`, and scripts, styles, and images only from this site. It's set twice: as a header in `_headers` (Cloudflare Pages), and as a `<meta http-equiv>` tag in the page so hosts that can't set headers get it too. Browsers ignore `frame-ancestors` in a meta tag, so only the header version stops the page being framed. The referrer policy is likewise both a header and a meta tag. The whole relay is [`spotify.js`](spotify.js), short enough to read in a minute.

`node test/spotify.test.js` checks the forwarding rules.

## Host your own

**GitHub Pages**

1. Fork this repository.
2. In the fork: **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch **master**, folder **/ (root)**. Save.
3. Your address is `https://<you>.github.io/canopy-music-relay/spotify`. Open it: it should say "This link isn't for this page. Start signing in to Spotify again from Canopy Music."
4. In Canopy Music, paste that address into the **Spotify sign-in page** setting.
5. In your Spotify developer app, add the same address to the redirect URIs.

GitHub Pages serves `spotify.html` at `/spotify` without a redirect, so the query string arrives intact. It ignores `_headers`, so you get the meta-tag protections only: no `frame-ancestors`, no `Cache-Control: no-store` (GitHub sends its own short cache time), and no `X-Content-Type-Options` unless GitHub adds it.

**Cloudflare Pages**

Create a Pages project from your fork with no framework preset, no build command and the root as the output directory. Your address is `https://<project>.pages.dev/spotify`, or `/spotify` on your custom domain. Then do steps 3–5 above. `_headers` applies as is.
