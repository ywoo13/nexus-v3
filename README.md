# Nexus — Avatar-Based Social 3D Game (Prototype)

A web-based multiplayer 3D social world scaffold built with Three.js (React Three Fiber) and Colyseus.

> **Avatar system history (Aug 2026):** this project went through two external avatar-creation APIs before settling on a self-hosted solution. It originally used **Ready Player Me**, which was acquired by Netflix and shut down its entire public platform — avatar creator, PlayerZero, developer APIs, all of it — on January 31, 2026. It was then switched to **MetaPerson Creator (Avatar SDK)**, which is *not* shut down, but turned out to require a paid Pro subscription for embeddable/authenticated use, and its free personal-login flow was unreliable when embedded in an iframe on another domain (third-party cookie blocking in modern browsers). After hitting both of those walls, the avatar system was rebuilt to have **zero external dependencies**: `PresetAvatarModel.jsx` renders a small gallery of simple humanoid characters entirely in code (procedural Three.js geometry, no GLB files, no accounts, no network calls). This is less flexible than "make an avatar from your selfie," but it can never go down, get paywalled, or break from a browser policy change.

## Project Structure

```
nexus/
├── server/              # Colyseus real-time server
│   ├── public/
│   │   └── index.html       # Landing page shown when you hit the server root
│   ├── admin/
│   │   └── manager.html      # Developer-only admin dashboard (kept outside public/ so it's never served without auth)
│   └── src/
│       ├── index.js         # Server entry point (landing page + status API + auth/manager routers)
│       ├── db.js            # Postgres connection pool + users/bans schema
│       ├── auth.js          # Google + Naver login verification / session issue+restore / profile save routes
│       ├── manager.js       # Admin dashboard router (page + registered users / ban list / custom room APIs)
│       ├── storage.js       # Saves/deletes uploaded room .glb files — Supabase Storage if configured, else local disk
│       ├── basicAuth.js     # HTTP Basic Auth middleware protecting /manager and /monitor
│       ├── admin.js         # Checks ADMIN_EMAILS whitelist for admin status
│       ├── bans.js          # Ban list read/insert/delete — keyed by account (provider:providerId) or IP
│       ├── rooms/
│       │   └── WorldRoom.js # Room logic: join/leave/move/chat/emote, kick/ban commands, mapId/custom-room resolution
│       └── schema/
│           └── State.js     # Synced state schema (Player, WorldState incl. mapId/modelUrl)
│   └── uploads/models/       # .glb files uploaded from /manager, local-disk fallback only (git-ignored, created at boot when used)
│
├── client/              # React + Three.js client
    └── src/
        ├── App.jsx                  # Screen flow (auth → avatar → room select → world)
        ├── scenes/World.jsx         # 3D canvas, lighting, ground, picks PlazaMap vs CustomRoomMap by mapId
        ├── components/
        │   ├── SplashScreen.jsx     # Logo screen shown briefly on launch
        │   ├── AuthScreen.jsx       # Google / Naver login / guest entry screen
        │   ├── LoadingScreen.jsx    # Loading overlay (server connect, etc.)
        │   ├── RoomSelectScreen.jsx # Pre-join: pick Main Plaza or a custom room before connecting
        │   ├── RoomSwitcher.jsx     # In-world 🌐 button/panel to move to another room mid-session
        │   ├── GraphicsSettings.jsx # In-world ⚙️ button/panel to toggle high-quality FX / film grain shader
        │   ├── FilmGrain.jsx        # React wrapper for the custom effects/filmGrainEffect.js shader
        │   ├── TouchDPad.jsx        # Mobile/tablet movement D-pad
        │   ├── TouchActionButtons.jsx # Mobile run/jump buttons
        │   ├── CameraRig.jsx        # Camera + PerspectiveCamera live inside a group that follows the player; OrbitControls orbits a fixed local point
        │   ├── AvatarCustomizer.jsx # Pre-join: avatar preset gallery → nickname entry
        │   ├── PresetAvatarModel.jsx # Self-hosted preset avatar gallery (no external API) + walk/run/jump/emote animation
        │   ├── PlazaMap.jsx         # Real GLTF map loader (falls back to PlazaBackdrop/PlazaProps automatically)
        │   ├── CustomRoomMap.jsx    # GLTF loader for admin-uploaded custom rooms (falls back to a plain floor)
        │   ├── PlazaProps.jsx       # Fountain/benches/boundary walls (with physics colliders, part of the fallback)
        │   ├── PlazaBackdrop.jsx    # Fallback backdrop: buildings/lamps/trees/floor pattern (no collision, fallback only)
        │   ├── Player.jsx           # Renders other players (interpolation + kinematic collider)
        │   ├── LocalPlayerController.jsx # Local character movement (keyboard/touch shared) + physics
        │   └── ChatBox.jsx          # Chat + emote UI (collapsible on mobile)
        ├── effects/
        │   └── filmGrainEffect.js   # Custom GLSL postprocessing shader (film grain + chromatic aberration)
        ├── input/
        │   └── movementInput.js     # Movement input shared by keyboard (WASD) and the touch D-pad
        ├── auth/
        │   ├── googleAuth.js         # Loads/renders the Google sign-in button (Google Identity Services)
        │   └── session.js            # App token storage (localStorage) + login/session-restore/profile-save API calls + API_BASE
        ├── network/
        │   ├── room.js               # Colyseus client connection/messaging, auto-reconnect, switchRoom()
        │   └── roomsApi.js           # Shared "fetch available rooms" helper used by RoomSelectScreen + RoomSwitcher
        └── state/
            ├── store.js                 # zustand global state (player list, current mapId/modelUrl, etc.)
            ├── graphicsSettings.js      # zustand + localStorage: high-quality FX / film-grain shader toggle
            └── localPlayerPosition.js   # Local player's latest position, read by the camera
└── render2.yaml          # Render deployment blueprint (server Web Service + client Static Site)
```

## Getting Started

> **`.env` files already exist** (`server/.env`, `client/.env`) — the Google client ID is filled in, and `JWT_SECRET`/`MANAGER_PASSWORD` are pre-generated random values, so you can just run `npm install && npm run dev`. Check `server/.env` for the `MANAGER_PASSWORD` value to log into `/manager`. `ADMIN_EMAILS` is empty by default — add your own account to see the 👑 badge in-game. **`DATABASE_URL` is empty and must be filled in** (see [Database](#database-postgres) below) before login/ban features will work.

### 1. Start the server

```bash
cd server
npm install
npm run dev
```

Runs on `ws://localhost:2567` by default:

- `http://localhost:2567` — **server landing page** (status, active rooms, online players, refreshed every 4s)
- `http://localhost:2567/monitor` — detailed Colyseus room/client monitor (password required, see `MANAGER_PASSWORD` in `server/.env`)
- `http://localhost:2567/api/status` — JSON status API polled by the landing page (`{ rooms, players, uptime }`)

### 2. Start the client

```bash
cd client
npm install
npm run dev
```

`.env` already exists, so no copying is needed (edit `client/.env` directly if you need to change a value).

Open `http://localhost:5173`. Open multiple browser tabs to test several simultaneous users.

## Database (Postgres)

Login accounts and the ban list are stored in Postgres. This project used to ship with an embedded SQLite file, but **Render's free web service tier wipes the filesystem on every redeploy**, so a real hosted database is required.

### Setup

1. Create a free Postgres project on **[Neon](https://neon.tech)** or **[Supabase](https://supabase.com)** — both offer a permanent free tier (no hard expiration, though the instance may sleep when idle).
   - ⚠️ Render's own free Postgres **expires 30 days after creation** (14-day grace period, then it's deleted) — not suitable for a persistent accounts database, so it isn't recommended here.
2. Copy the connection string it gives you (format: `postgresql://user:password@host:5432/dbname?sslmode=require`).
3. Paste it into `server/.env` as `DATABASE_URL`.
4. Start the server — `users` and `bans` tables are created automatically on boot if they don't exist yet (`initDb()` in `db.js`).

If `DATABASE_URL` is left empty, the server still starts (so you can develop/test as a guest), but login, profile saving, and ban features are disabled and a warning is printed to the console.

### Notes

- All DB access is centralized in `server/src/db.js` (`pg` connection pool + a handful of exported async functions) and `server/src/bans.js`, so swapping providers or adding new queries only touches those two files.
- SSL is enabled automatically for any non-localhost `DATABASE_URL` (`rejectUnauthorized: false`, since most hosted Postgres providers use certificates that aren't in Node's default trust store).
- `.env` is git-ignored, so your connection string is never committed.

## Features

- **Mobile/tablet support** — on touch devices (`pointer: coarse`) a D-pad appears automatically and chat becomes a collapsible panel. Camera control is one-finger drag to rotate, two-finger pinch to zoom (OrbitControls default).
- **Startup flow** — logo splash (2s, tap to skip) → login/guest screen → avatar creation → server-connect loading screen → enter the plaza.
- **Loading indicators** — a spinner while connecting to the server, and drei's `<Loader />` for 3D asset loading progress (GLB avatars, etc.).
- **Physics-based collision** — Rapier physics for real collision with walls, the fountain, benches, and other players (`@react-three/rapier`).
- **Preset avatar gallery** — pick from a small set of simple characters, all rendered procedurally in code (no external API, no account, no network request). See the avatar system history note near the top of this README.
- **Procedural walk/idle animation** — arm/leg swing and knee bend computed in real time from bone rotations based on movement state (no external animation files needed).
- WASD movement, mouse-drag camera rotate/zoom.
- Every player's position/rotation syncs in real time (20 updates/sec + client-side interpolation).
- Global chat — broadcast to everyone in the room, auto-scroll, your messages vs. others' visually distinguished, join/leave system messages, online count.
- Simple emotes (an emoji appears above the character's head for 2 seconds).
- **Kick/Ban** — admins can moderate other players via chat slash commands (see [Manager & In-Game Admin](#developer-only-admin-page-manager--in-game-admin) below).
- **Multi-room / custom rooms** — an admin can upload a `.glb` from `/manager` to spin up an additional room (e.g. "room2"); players choose Main Plaza or a custom room on entry, and can move between rooms mid-session via an in-world panel (see [Multi-Room / Custom Rooms](#multi-room--custom-rooms) below).

### Physics (collision) notes

- The local player is a **dynamic RigidBody** (capsule collider); rotation is locked (`enabledRotations`) and only velocity is driven. Colliding with walls, obstacles, or other players is handled by the physics engine automatically.
- Other players use a **kinematic RigidBody** that follows the networked position, but still has a collider so the local player can't walk through them.
- The floor, fountain, benches, and plaza boundary walls are all **fixed RigidBody**s. The boundary walls are rendered semi-transparent so players can visually tell where the plaza ends (`PlazaProps.jsx`).
- The same pattern works for a custom GLTF map: wrap the visual mesh in `<RigidBody type="fixed" colliders="trimesh">` to generate a collider matching the exact map geometry (useful for complex terrain — prefer simpler colliders like `cuboid`/`hull` where possible for performance).

### Preset avatar gallery notes

- No setup required — `PresetAvatarModel.jsx` exports `AVATAR_PRESETS`, an array of ~6 simple characters (color scheme, head shape, accessories) built entirely from Three.js primitives (boxes/spheres/cones/capsules). Add more by appending to that array; no assets to source or license.
- **Walk/idle motion is implemented as procedural animation that directly manipulates joint-group rotations, with no external animation files.** The rig (hips → spine → arms/legs, each a `<group>` with a `useRef`) is deliberately shaped like a Mixamo skeleton, and reuses the exact same walk-cycle math that both previous GLB-avatar integrations (Ready Player Me, then MetaPerson) used: legs/arms swing in opposite phase while moving, knees bend, and everything eases back to rest pose when idle.
- **v3 animation pass:** arms got an elbow joint (`leftForearm`/`rightForearm` refs) so they bend during walk/run instead of staying ramrod-straight; landing now has a brief squash-and-stretch instead of snapping straight to idle; mid-air poses are split into "rising" vs "falling" using a `verticalVelocityRef` passed down from `LocalPlayerController.jsx` (real physics velocity) or `Player.jsx` (a `Δy/Δt` estimate for remote players, since only position is networked); and clicking an emote (`👋😂❤️🎉😢` in `ChatBox.jsx`) now plays a matching full-body pose (`playEmote()` in `PresetAvatarModel.jsx`) driven by the same `player.emote` state field that already showed the floating emoji, instead of only showing the emoji. All transitions use `THREE.MathUtils.damp` (frame-rate-independent easing, same primitive `LocalPlayerController.jsx` already used for movement) so switching between idle/walk/run/jump/emote never pops.
- Selecting a preset just sets a short string ID (`avatarPreset`, e.g. `"coral"`) that's synced through Colyseus state and validated server-side against a simple `/^[a-z0-9_-]{1,32}$/` pattern (`WorldRoom.js`) — there's no URL, file, or iframe in the data path at all.
- Because there's nothing to load, there's no `Suspense`/loading state for avatars anymore — `PresetAvatarModel` renders synchronously.
- Previously this project used Ready Player Me, then MetaPerson — see the avatar system history note near the top of this README for why both were dropped in favor of this approach.

### Mobile/tablet notes

- Touch detection relies solely on the CSS media query `@media (pointer: coarse)` (no separate device-detection JS), so it's testable directly via Chrome DevTools' device toolbar, not just on a real phone/tablet.
- Movement input is unified in `input/movementInput.js`, shared by the keyboard (WASD) and the D-pad. To add an analog joystick later, you'd just add one function that feeds analog values in place of `setTouchDirection`.
- The chat panel is expanded by default on desktop and collapsed by default on touch devices to keep the screen clear (tap the 💬 button bottom-right to open it).
- `index.html` sets `user-scalable=no` and `viewport-fit=cover` so a two-finger pinch always zooms the camera (never the page), and buttons stay clear of notches on devices with a safe-area inset.

## Deployment (Render — both server and client)

The server (Colyseus, needs a persistent WebSocket connection) and the client (static build) both deploy to Render. The server is a **Web Service**; the client is a **Static Site**.

### Option A — One-shot via Blueprint (recommended)

The `render2.yaml` at the repo root defines both services.

1. Render dashboard → **New → Blueprint** → select this repo. Render's default auto-detected filename is `render.yaml`; since this project uses `render2.yaml`, point the Blueprint file path at `render2.yaml` in the setup screen (Render lets you specify a custom blueprint filename there).
2. Render reads `render2.yaml` and sets up `nexus-server` (Web Service) and `nexus-client` (Static Site) automatically.
3. `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` are already filled in inside `render2.yaml` (OAuth client IDs are safe to expose publicly, so they're committed as-is) — nothing to type there.
4. You'll be prompted to fill in the remaining values marked `sync: false`:
   - `DATABASE_URL` — your Postgres connection string (see [Database](#database-postgres) above)
   - `MANAGER_PASSWORD` — password for `/manager` and `/monitor`
   - `ADMIN_EMAILS` — emails (Google or Naver accounts) that should show the 👑 in-game admin badge (comma-separated)
   - `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REDIRECT_URI` — only needed if you want Naver login; leave blank to skip it (see [Setup — Naver](#setup--naver) above)
   - `ALLOWED_ORIGIN`, `VITE_SERVER_URL` — **leave these empty on the very first deploy.** Once both services are live and you have real URLs (e.g. `https://nexus-server.onrender.com`), fill them in per "Post-deploy steps" below and redeploy.
5. `JWT_SECRET` is auto-generated by Render as a secure random value (nothing to enter).
6. Click `Deploy Blueprint`.

### Option B — Create the two services manually in the dashboard

**Server (Web Service)**
1. New → Web Service → this repo, Root Directory: `server`
2. Build Command: `npm install`, Start Command: `npm start`
3. In the Environment tab, add `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `DATABASE_URL`, `MANAGER_USER`, `MANAGER_PASSWORD`, `ADMIN_EMAILS`, `ALLOWED_ORIGIN` (`PORT` is injected automatically by Render).

**Client (Static Site)**
1. New → Static Site → same repo, Root Directory: `client`
2. Build Command: `npm install && npm run build`, Publish Directory: `dist`
3. In the Environment tab, add `VITE_SERVER_URL`, `VITE_GOOGLE_CLIENT_ID`.

### Post-deploy steps (both options)

Both services need to be live once before you have real URLs, so deploy first with the values below left blank, then fill them in and redeploy.

1. Find your server URL, e.g. `https://nexus-server.onrender.com` (auto-assigned by Render based on the service name).
2. Find your client URL, e.g. `https://nexus-client.onrender.com`.
3. On the **server**, set `ALLOWED_ORIGIN=https://nexus-client.onrender.com` → redeploy.
4. On the **client**, set `VITE_SERVER_URL=wss://nexus-server.onrender.com` (⚠️ `wss`, not `https`) → redeploy.
5. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), add the client URL to your OAuth client ID's **Authorized JavaScript origins**:
   ```
   http://localhost:5173              (keep this for local dev)
   https://nexus-client.onrender.com  (add this for production)
   ```

### Notes

- Render's free tier spins services down after a period of inactivity; the first request afterward can take tens of seconds to wake back up (this is expected).
- If you move to a custom domain, remember to update `ALLOWED_ORIGIN`/`VITE_SERVER_URL` to match.

## Developer-Only Admin Page (/manager) & In-Game Admin

### /manager — password-protected dashboard

Visiting `http://localhost:2567/manager` triggers your browser's built-in login prompt (HTTP Basic Auth). You need `MANAGER_USER`/`MANAGER_PASSWORD` from `server/.env` to get in.

- Active room count / online players (refreshes every 5s)
- List of registered accounts — Google and Naver (nickname, email, avatar preset, signup date, last login)
- **Ban list** — accounts/IPs banned in-game via `/ban`, with an "Unban" button
- **Room management** — upload a `.glb` to create a new room (e.g. "room2"), see all custom rooms, delete them (see [Multi-Room / Custom Rooms](#multi-room--custom-rooms) below)
- If `MANAGER_PASSWORD` isn't set, the page refuses to load at all (prevents accidentally leaving it open)
- `/monitor` (the built-in Colyseus room monitor), which used to be open with no auth at all, is now protected by the same password

### Multi-Room / Custom Rooms

Beyond the built-in Main Plaza (`client/public/models/plaza.glb`, bundled with the client), an admin logged into `/manager` can add extra rooms on the fly:

1. On `/manager`, click **"+ 방 추가" ("+ Add room")** under **방 관리 ("Room management")**.
2. Enter a room name and pick a **self-contained `.glb` file** (multi-file `.gltf` isn't supported — the whole scene, including textures, has to be baked into one binary file). Max size 150MB.
3. On upload, the server slugifies the name into a URL-safe `mapId` (e.g. "회의실" → `room2` if that slug's taken, or a name-derived slug), stores the file under `server/uploads/models/`, and adds a row to the `rooms` table.
4. That room immediately shows up for players — no restart needed.

**How players use it:**
- After picking a nickname/avatar, players see a **room-select screen** listing Main Plaza plus every custom room, and pick one to join.
- While in-world, the **🌐 button** (top-right) opens a panel to move to a different room without disconnecting — the client leaves the current Colyseus room (consented, so no ghost/reconnect logic kicks in) and rejoins a different one with the same nickname/avatar, and the local player is re-spawned at the new room's server-assigned position.

**How it's wired up (server):**
- `gameServer.define("world", WorldRoom).filterBy(["mapId"])` — Colyseus treats each distinct `mapId` as a separate pool of room instances, so Main Plaza and every custom room are fully isolated (separate player lists, separate chat).
- `WorldRoom#onCreate` looks up the requested `mapId` in the `rooms` table and puts the resolved `mapId`/`modelUrl` into synced state; an unknown or deleted `mapId` safely falls back to Main Plaza instead of erroring.
- `GET /api/rooms` (public, no auth) lists custom rooms for the client's room-select/room-switch UI. `GET/POST/DELETE /manager/api/rooms` (Basic Auth-protected) manage them.

**Where uploaded `.glb` files are stored:**
- If `SUPABASE_SERVICE_ROLE_KEY` is set in `server/.env`, files go to a **Supabase Storage** bucket (public bucket, default name `room-models`) and stay there permanently. The project URL is auto-detected from `DATABASE_URL` when it's a Supabase Postgres connection string — set `SUPABASE_URL` explicitly only if your DB is hosted elsewhere (e.g. Neon) but you still want Supabase Storage. See the setup steps in `server/.env.example`.
- Otherwise, files fall back to local disk at `server/uploads/models/`, served by the server itself.

**Limitations to know about:**
- ⚠️ On hosts with an ephemeral filesystem (e.g. Render's free tier, which wipes disk on every redeploy/restart), local-disk uploads are lost along with everything else that isn't in Postgres. **Set up Supabase Storage (or another external store) before deploying anywhere with an ephemeral filesystem** — local disk is fine for local development only.
- The Main Plaza's model stays a client-bundled asset (not swappable from `/manager`) — only additional rooms go through the upload flow.

### In-game admin (email whitelist)

List developer emails in `server/.env`'s `ADMIN_EMAILS` (comma-separated) — this works regardless of whether the account logged in with Google or Naver, since it's matched on email address. Anyone who logs in with one of those accounts gets a **👑** badge next to their name in-game, plus kick/ban privileges.

```
ADMIN_EMAILS=you@gmail.com,teammate@naver.com
```

**How it's secured**: the client never just claims "I'm an admin" (that could be forged via devtools). Instead:

1. After logging in, the client holds a server-signed app token (JWT).
2. That token is sent along when joining the plaza (the game server, `WorldRoom`).
3. The game server verifies the token's signature during `onAuth` and re-queries the database for that account's email to check it against the whitelist (this happens at the "should this connection even be allowed" stage, so all validation is done up front).
4. A forged token or an email not on the whitelist is simply treated as a regular user.

Nametag display follows three tiers: **👑 admin** > **✓ logged-in account** > no badge (guest).

### Kick / Ban

Admins (👑) can moderate other players using slash commands typed directly into the existing chat box — no extra UI needed.

```
/kick nickname    # Immediate disconnect. Not recorded in the ban list — they can rejoin freely.
/ban nickname     # Disconnect + permanently recorded in the ban list. Reconnecting is refused outright.
```

- Admin status is checked purely from the server-held `sender.isAdmin` (the whitelist result computed above) — a non-admin typing `/kick` is simply ignored by the server.
- You can't target yourself or another admin.
- **Bans record both the account (`provider:providerId`, e.g. `google:1093...` or `naver:aB3x...`) and the IP.** Logged-in users are banned by account; guests are banned by IP (IP-based bans have known limitations on shared Wi-Fi/mobile data/dynamic IPs — someone else on the same coffee-shop Wi-Fi could briefly be affected).
- **Kicked/banned sessions can't exploit the auto-reconnect feature.** Since Colyseus's `client.leave(code)` still reports as an "unintended disconnect" (`consented = false`) even when the server forces it, a kick without special handling would just trigger the 20-second auto-reconnect and undo itself. Forced disconnects are tracked separately so reconnection is explicitly skipped for them (`forcedLeaveSessions`).
- Bans can be lifted anytime from the "Ban list" section of `/manager`.

## Login (Google + Naver) + Per-Account Avatar Storage

Logging in restores your avatar/nickname on your next visit. Guest play remains fully available (no login required, same as before). Two providers are supported — **Google** and **Naver** — and either one gives the same account features (saved avatar/nickname, ✓/👑 badges, ban-by-account).

### Account model

Internally, an account is identified by `(provider, providerId)` — e.g. `("google", "109385...")` or `("naver", "aB3xZ9...")` — rather than a single Google ID, so the same Postgres `users` table can hold both kinds of accounts side by side. The app's own login token (JWT) carries both fields (`{ sub: providerId, provider }`).

### How Google login works

1. The client shows a Google sign-in button via Google Identity Services; on success it receives a Google-signed **ID token**.
2. That token is sent to the server (`POST /api/auth/google`), which verifies it's a genuine Google-issued token using `google-auth-library`.
3. First-time accounts get a new row in Postgres; returning accounts just get their `last_login_at` updated.
4. The server issues its own signed **app token (JWT, 30-day expiry)**, which the client stores in `localStorage`.

### How Naver login works

Naver doesn't offer a client-side ID-token flow like Google — it's a traditional OAuth2 **authorization code** flow that requires a client secret, which must stay server-side. So the server drives the whole thing:

1. Clicking "네이버로 로그인" opens a small **popup window** pointed at `GET /api/auth/naver/start`.
2. The server generates a CSRF-protection `state` value, stores it in a short-lived (5 min) `httpOnly` cookie scoped to `/api/auth/naver`, and redirects the popup to Naver's login page.
3. After the user logs in/consents on Naver, Naver redirects the popup back to `GET /api/auth/naver/callback` with an authorization `code`.
4. The callback checks the `state` cookie matches, exchanges the `code` for an access token (`POST` to `nid.naver.com/oauth2.0/token` using `NAVER_CLIENT_SECRET`), and fetches the profile from `openapi.naver.com/v1/nid/me`.
5. The account is created/updated in Postgres exactly like the Google path, and the server issues the same kind of app JWT.
6. The popup sends the result back to the main window via `window.opener.postMessage(...)` (restricted to the app's own origin) and closes itself — the token is never put in a URL, so it can't leak through browser history or `Referer` headers.

Both providers converge on the same downstream behavior:

- On the next visit, the saved app token is used to call `GET /api/auth/session` for automatic login, pre-filling the saved avatar preset/nickname into the avatar screen.
- When joining the plaza (`PUT /api/auth/profile`), whatever avatar/nickname was just chosen is saved to the account so it's restored next time.

### Setup — Google

> This project ships with the Google client ID already filled into `server/.env` and `client/.env`, and `http://localhost:5173` already registered as an authorized origin. Follow these steps only if you need to set it up from scratch.

1. Create an **OAuth Client ID** at [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) (type: **Web application**).
2. Add `http://localhost:5173` to **Authorized JavaScript origins** (add your production domain too once deployed).
3. Put the client ID in **both** places (must match):
   - `client/.env` → `VITE_GOOGLE_CLIENT_ID`
   - `server/.env` → `GOOGLE_CLIENT_ID`
4. Change `server/.env`'s `JWT_SECRET` to a random string (used to sign app tokens).
5. `npm install && npm run dev` (both server and client).

### Setup — Naver

Naver login is **optional** — without it configured, the button just shows a "not configured" error and everything else (Google, guest play) works as before.

1. Register an application at [Naver Developers → Application](https://developers.naver.com/apps) ("애플리케이션 등록").
2. Under **사용 API (APIs used)**, add **네이버 로그인 (Naver Login)**.
3. Under **제공 정보 선택 (information to request)**, enable at least **이메일 (email)** and **이름 (name)** if you want those to show up on the account (name falls back to your Naver nickname if not granted).
4. Set:
   - **서비스 URL** → your client's URL (`http://localhost:5173` for local dev).
   - **네이버 로그인 Callback URL** → your server's `/api/auth/naver/callback` (`http://localhost:2567/api/auth/naver/callback` for local dev). This must match `NAVER_REDIRECT_URI` **exactly**.
5. Copy the issued **Client ID** / **Client Secret** into `server/.env`:
   ```
   NAVER_CLIENT_ID=...
   NAVER_CLIENT_SECRET=...
   NAVER_REDIRECT_URI=http://localhost:2567/api/auth/naver/callback
   ```
   (Nothing goes in `client/.env` — the client only ever talks to your own server, never to Naver directly.)
6. When deploying, also set `ALLOWED_ORIGIN` to your deployed client URL — the popup uses it to know which origin it's allowed to `postMessage` the login result to — and set `NODE_ENV=production` so the CSRF-protection cookie gets the `Secure` flag over HTTPS.

The app works fine without any of this — the login buttons just won't do anything (or show an error), and "Continue as guest" still works exactly as before.

### Notes

- **Nickname display**: your nickname is always shown above your avatar, logged in or not. Accounts logged in with Google or Naver get a **✓ verified badge** (admins get **👑**) so other players can tell them apart from guests. This flag is never taken from client-side claims — it's determined by the game server verifying the login token itself; see "In-game admin" above for details. Guests type a fresh nickname every session and it's never saved — **one-time use only**.
- Logging in and clicking "아바타 다시 고르기" (pick a different avatar) to choose a new preset, then rejoining, updates the saved avatar on your account at that point.
- **Upgrading an existing deployment**: if you already had this project running with the old Google-only schema (`users.google_id` as the primary key), the server migrates it automatically and safely on next boot (see `initDb()` in `server/src/db.js`) — no manual SQL needed, and existing Google accounts/logins keep working.

## Movement Improvements (Acceleration, Running, Jumping)

- **Acceleration/deceleration** — movement used to stop dead the instant you released a key; now `THREE.MathUtils.damp` smoothly ramps velocity toward the target speed (tunable via `ACCEL_LAMBDA` in `LocalPlayerController.jsx`).
- **Running** — hold **Shift** on desktop, or the 🏃 button (bottom-right) on mobile, to go from WALK_SPEED (4) to RUN_SPEED (7.5). Arm/leg swing amplitude and speed also increase while running.
- **Jumping** — **Space** on desktop, or the ⤴ button on mobile. Only works while grounded (no infinite air-jumping), and switches to a tucked-legs jump pose while airborne.
- **Synced to other players too** — `Player.jsx` used to ignore other players' y-coordinate and always draw them at floor height. It now interpolates the real y value received from the server, so other players' jumps are visible, and running is inferred from per-frame movement distance to drive the animation.

## Fallback 3D Plaza Backdrop (v1, shown automatically when there's no real map)

`PlazaBackdrop.jsx` adds a **placeholder backdrop** made purely of primitive shapes (Box/Cylinder/Cone) — meant to keep the plaza from feeling empty before a real Blender map exists.

- A simple skyline of ~22 buildings ringing the plaza (colors cycle through the brand palette)
- 4 street lamps (with point lights for a subtle glow accent)
- 4 trees, plus a circular paving pattern around the fountain
- **No physics colliders** — purely decorative, so it's currently walkable-through.
- `Environment`'s `background` option is enabled so the sky actually renders (previously it only affected lighting/reflections, not visible sky).
- As of v2, `PlazaMap.jsx` automatically decides whether to show this fallback or a real map (see the next section).

## v2 — Real Map Loader

### Real map (Blender GLTF) loader

Drop a file at `client/public/models/plaza.glb` and it's picked up automatically — no code changes needed, thanks to `PlazaMap.jsx`.

- If the file exists: it's loaded via `useGLTF` and wrapped in `<RigidBody type="fixed" colliders="trimesh">` — collision geometry exactly matches the model shape.
- If the file is missing or fails to load: the existing fallback (`PlazaBackdrop` + `PlazaProps`) is shown automatically instead. (`Suspense` handles the loading wait; a custom `MapErrorBoundary` handles load failures like a 404.)
- A map-building checklist (export settings, character scale reference, etc.) lives in `client/public/models/README.md`.
- `World.jsx`'s floor safety net stays active regardless of whether a real map is loaded — it exists so players never fall through infinitely if the map has gaps or no floor yet.

> Chat was briefly switched to proximity-based, then reverted back to **global chat** (broadcast to everyone in the room). As a spam mitigation, the server now caps each client to 5 messages per 3 seconds (`CHAT_RATE_LIMIT` in `WorldRoom.js`).

## Security Updates & Input Validation

- **Server no longer trusts client input blindly** — `move` (position), `emote`, `chat`, and `avatar` messages are all type/format/range-validated before being applied. For example, non-numeric or out-of-range coordinates are dropped, and avatar preset IDs must match `/^[a-z0-9_-]{1,32}$/` (`WorldRoom.js`).
- **The same validation was added to `PUT /api/auth/profile`** — this endpoint used to accept anything and write it straight to the database, even though the game server validated its own inputs. Both paths now share the same rules.
- **Chat spam prevention** — capped at 5 messages per 3 seconds per client.
- **Rate limiting** — `/api/auth/*` (login, etc.) and `/manager` are both rate-limited per minute to slow down brute-force/abuse attempts (`express-rate-limit`).
- **Security headers** — `helmet` adds standard HTTP security headers. Since the client (Render Static Site) and server (Render Web Service) live on different domains, CSP/COEP/CORP are relaxed just enough that they don't block that legitimate cross-origin traffic.
- **No more `postMessage`-based avatar iframe** — both previous avatar providers (Ready Player Me, then MetaPerson) embedded a cross-origin iframe and listened for `postMessage` events with an avatar URL in them, which meant validating message origin/format to stop a malicious page from injecting a fake avatar. The preset avatar gallery has no iframe, no `postMessage`, and no URL at all — that entire attack surface is gone by construction, not by validation.
- **`JWT_SECRET` default-value warning** — if the server starts with `JWT_SECRET` unset or still at its default value, it prints a console warning (using the default lets login tokens be forged).
- `/monitor` is protected by the same password as `/manager` (see above).
- **Kick/Ban authorization** — admin status isn't re-sent by the client with every message; it's resolved once during `onAuth` and trusted only from room state (`sender.isAdmin`). A non-admin sending `/kick` or `/ban` is silently ignored by the server.
- **Reconnect vs. forced-disconnect conflict avoided** — Colyseus's `client.leave(code)` still reports as an "unintended disconnect" (`consented = false`) even when the *server* forces it, meaning a naive kick implementation would trigger auto-reconnect and undo itself. Forced-leave sessions are tracked separately (`forcedLeaveSessions`) so reconnection logic is explicitly skipped for them.
- **IP-ban limitations documented** — the `x-forwarded-for` header is trusted on the assumption the server sits behind a trusted proxy like Render. If you expose this server directly without a proxy in front, a client could spoof this header to bypass IP bans (documented in code comments and here).
- **CORS scoped down to `/api/auth` (fixed a CSRF/info-disclosure vulnerability)** — `cors()` used to be applied globally, which included `/manager` and `/monitor`. Those routes are protected by HTTP Basic Auth, which browsers automatically re-attach on every request; combined with "allow any origin" CORS, an admin who had `/manager` open while visiting a malicious site could have had that site silently read the registered-user email list (`GET`) or unban someone (`DELETE`) in the background. CORS is now applied only to `/api/auth`, which genuinely needs cross-origin access; `/manager` and `/monitor` have no CORS headers at all, so cross-origin requests to them are blocked by the browser itself.
- **CSRF design overall** — the login token (JWT) is stored in `localStorage`, not a cookie, and attached to each request explicitly via the `Authorization` header in JS. Since it isn't auto-attached by the browser the way a cookie would be, a malicious site can't forge a request on a victim's behalf without somehow reading their token first — so state-changing endpoints like `/api/auth/profile` are CSRF-safe by design. The one place this broke down was `/manager` (fixed above), because Basic Auth *is* auto-attached like a cookie.
- **XSS review** — `dangerouslySetInnerHTML`/`innerHTML` are never used anywhere in the React code; the only place raw DOM strings are built is `server/admin/manager.html`, which is plain JS (not React). Every piece of user-controlled data rendered there (nickname, email, avatar preset, ban target, reason) is confirmed to pass through an `escapeHtml()` helper (the `textContent` trick) before insertion. Chat messages/nicknames elsewhere are rendered via React JSX (`{message}`), which escapes by default, and in-scene nametags are WebGL text, not HTML, so they're not an XSS surface at all.

## v3 — Naver Login Added

- **New login provider: Naver** — full end-to-end support alongside Google (see [Login (Google + Naver) + Per-Account Avatar Storage](#login-google--naver--per-account-avatar-storage) above for how it works and how to set it up). Naver uses a server-driven OAuth2 authorization-code flow (Naver doesn't offer a client-only ID-token flow like Google does), completed via a popup + `postMessage` handshake so the login token never touches a URL.
- **Account schema generalized** — `users` moved from a Google-only `google_id TEXT PRIMARY KEY` to `(provider, provider_id)` as the composite identity, so any number of login providers can share the same table. Existing deployments migrate automatically on next boot (`initDb()` in `db.js`), no manual SQL required.
- **Bans generalized the same way** — ban records now use `target_type = 'account'` with a `provider:providerId` value; old `google_id`-typed ban rows from before this change are still honored.
- A full pass through the rest of the (now much larger — multi-room, custom room uploads, graphics settings, film grain shader) v3 codebase turned up no further bugs beyond what's listed in "Latest Code Review Pass" below, which was carried forward unchanged.

## Latest Code Review Pass

- **🔴 Timing attack on `/manager` and `/monitor` login** — the Basic Auth check compared the submitted username/password with plain `===`, which can leak how many leading characters matched through response-time differences. Switched to `crypto.timingSafeEqual` (`basicAuth.js`), and fixed a related edge case where a malformed `Authorization` header with no `:` separator could produce an unintended comparison.
- **🔴 Google email not checked for `email_verified`** — `POST /api/auth/google` trusted the `email` field from the Google ID token payload without checking `email_verified`, even though that email is what's matched against `ADMIN_EMAILS`. Now rejected with 401 if Google reports the email as unverified (`auth.js`).
- **🟠 JWT algorithm not pinned** — `jwt.sign`/`jwt.verify` didn't explicitly restrict which signing algorithm to accept. Since only a single HMAC secret is used, this wasn't directly exploitable here, but it's now pinned to `algorithms: ["HS256"]` on both sign and verify calls (`auth.js`, `WorldRoom.js`) as defense-in-depth against algorithm-confusion attacks.
- **🟠 Chat rate-limit state leaked across room instances** — `chatTimestamps` (used to cap chat to 5 messages/3s per client) was a module-level `Map`, so it outlived any individual `WorldRoom` instance and was shared across all of them if the plaza ever spawned more than one room. Moved to a per-room instance property that's naturally cleaned up when the room disposes (`WorldRoom.js`).
- **🟡 Google sign-in button permanently broken after one failed script load** — if the Google Identity Services script failed to load once (ad blocker, flaky network), the failed load `Promise` was cached forever, so every subsequent attempt to show the sign-in button (e.g. logging out and returning to the auth screen) failed instantly without retrying — even after the network recovered. The cache is now cleared on failure so the next attempt retries from scratch (`googleAuth.js`).
- **🟡 Possible duplicate join request** — pressing Enter inside the nickname field could, in some browsers, still submit the form even while the "입장 중…" (joining) button was disabled, firing a second `connectToWorld` call. `handleSubmit` now also bails out early while a join is already in progress (`AvatarCustomizer.jsx`).
- **🟢 Per-frame allocation in the movement loop** — `LocalPlayerController` created a new `THREE.Vector3` every single animation frame just to compute movement direction, adding unnecessary GC pressure during gameplay. Replaced with a reusable scratch vector (`LocalPlayerController.jsx`).

## Bugs Found & Fixed During Code Review (from a priority checklist)

The following were reviewed and fixed after receiving a prioritized bug list:

- **🔴 No reconnection after disconnect** — previously, a dropped connection just showed a "Connection lost" banner and nothing else. Auto-reconnect now attempts to rejoin the same session for up to 20 seconds using Colyseus's official reconnection API (`allowReconnection` / `client.reconnect`). Intentional leaves (`consented`) never trigger a reconnect attempt.
- **🟠 Ghost players lingering after disconnect** — if reconnection failed, or someone else joined/left while you were disconnected, they could remain stuck on-screen. The player list is now reset (`resetPlayers`) and repopulated from the server's current state both on final disconnect and on successful reconnect.
- **🔴/🟠 Server move values vs. client physics mismatch / remote interpolation vs. collision position mismatch** — a fully server-authoritative physics model (prediction + reconciliation) is a much bigger architectural undertaking, so this was mitigated pragmatically instead: move updates now send 20/sec (up from 15), and remote-player interpolation was tightened from 0.15 to 0.3, shrinking the window where positions can visibly disagree.
- **🟠 "Grounded" detection broken on real maps** — grounded status used to be an absolute-height comparison assuming the floor is always at y=0, so stairs or platforms on a real map would leave the player permanently "airborne." It now uses vertical velocity (real physics velocity locally, frame-to-frame y delta for remote players) instead, which works regardless of terrain height. A short cooldown prevents double-jumping when velocity briefly nears zero at the top of a jump arc.
- **🟠 Double collision between the real GLB and the safety-net floor** — the safety floor used to be a visible mesh + collider always sitting at y=0, which overlapped a real map's own floor. It's now an invisible collider-only volume at y=-8, and the old visible floor mesh moved into the fallback backdrop bundle so it never renders/collides at all once a real map is present.
- **🟠 Mobile D-pad could get stuck** — if a touch was interrupted without a pointerup/pointercancel event (e.g. an incoming call, pulling down notifications), a direction key could remain stuck "pressed." All touch input is now force-released whenever the tab goes to the background or the window loses focus.
- **🟡 Join chat message timing** — the server used to broadcast the join announcement so quickly that the newly-joined player themselves sometimes missed it. It's now delayed 150ms to give the client time to register its message handler.
- **🟡 Silent failure when the Google script fails to load** — if an ad blocker or network issue prevented the Google sign-in script from loading, the button slot just stayed empty with only a console error. The screen now shows a message and reminds the player they can continue as a guest.

## Recent Bug Fixes & Visual Improvements

- **🔴 Ready Player Me shutdown broke avatar creation entirely** — RPM shut down its whole public platform on January 31, 2026, so the avatar creator just showed a dead/unreachable page and avatar creation was completely broken for anyone without a previously-saved avatar. First fix: switched to MetaPerson Creator (Avatar SDK), integrated the same way (iframe + `postMessage`).
- **🔴 MetaPerson "Authentication failed" screen when credentials were unset** — found during live testing: with credentials left empty, the integration still sent an `authenticate` request with blank strings, which MetaPerson rejected outright and showed an unrecoverable in-iframe error. Fixed by only sending `authenticate` when real credentials were configured.
- **🔴 MetaPerson turned out to be a dead end too** — further testing surfaced that (a) embeddable/authenticated use requires a paid Pro subscription, not just a free account, and (b) even the credential-free personal-login path inside the iframe hung indefinitely, most likely because modern browsers block third-party cookies for cross-origin iframes, breaking MetaPerson's login session. **Final fix: dropped external avatar-creation APIs entirely.** `PresetAvatarModel.jsx` now renders a small gallery of procedural characters built from plain Three.js geometry — no iframe, no account, no network request, no third-party service that can shut down or start requiring payment out from under this project. See the avatar system history note near the top of this README for the full account.
- **Fixed camera-follow bug** — the camera's look-at target used to be pinned to the origin, so walking away moved the character off-screen. `CameraRig.jsx` now smoothly follows the local player's position every frame (while preserving the user's own rotate/zoom control).
- **Fixed input loss on failed connection** — a failed server connection used to remount the entire avatar screen, wiping out the avatar/nickname the player had just picked. The loading screen is now a pure overlay, and the avatar screen stays mounted throughout.
- **Lighting/color improvements** — switched the `Environment` preset to `sunset` and added fog for depth. Nametags got a white outline for readability against any background, and plaza props (fountain/benches/boundary walls) were retinted to match the coral/mint brand palette.
- Added hover interactions on preset cards/buttons/links and a gradient accent line at the top of cards for overall visual polish.
- **Lighting/postprocessing pass (v3):** switched to a proper 3-point rig (sun key light + sky/ground `hemisphereLight` fill + a cool rim light on the far side, so characters don't get lost against the backdrop), added `SoftShadows` (drei's PCSS approximation) for softer shadow edges, tuned `shadow-bias`/`shadow-normalBias` on the key light to reduce shadow acne, and switched the renderer to ACES filmic tone mapping for a less "flat" look. Added a light `@react-three/postprocessing` stack (mipmap `Bloom`, `Vignette`, a small `HueSaturation` boost) to both `World.jsx` and `AvatarPreviewCanvas.jsx` so the character-creation screen matches in-game color grading. Also fixed a real bug along the way: GLTF maps (`PlazaMap.jsx`'s real map, `CustomRoomMap.jsx`) never had `castShadow`/`receiveShadow` enabled on their meshes, so uploaded/imported maps were completely unlit by shadows — fixed by traversing the loaded scene once and turning both on.
- **Graphics settings toggle + a hand-written shader (v3.1):** added a ⚙️ button (`GraphicsSettings.jsx`, `state/graphicsSettings.js`) so people on older/weaker devices can turn off the heavier effects — "고품질 그래픽" drops `SoftShadows`, `Bloom`/`Vignette`/`HueSaturation`, halves shadow-map resolution, and caps `dpr` to 1x. The preference is saved to `localStorage` and persists across sessions. Also added a genuinely custom effect (not one of the library's built-ins): `effects/filmGrainEffect.js` is a GLSL fragment shader — written against `postprocessing`'s `Effect` base class the same way its own built-in `ChromaticAberration` effect is — that layers a subtle animated film-grain noise with a small radial chromatic aberration (samples `inputBuffer` at UV-offset R/B channels near the screen edges). It's wired up as its own independent toggle ("필름 그레인") separate from the high-quality switch, via `FilmGrain.jsx` (the standard `useMemo` + `<primitive>` wrapper pattern for custom `@react-three/postprocessing` effects).
- **Camera-follow rewrite (v3.2) — fixed a real jitter bug:** `CameraRig.jsx` used to manually shift `camera.position` and `OrbitControls.target` by hand every frame, then call `controls.update()`. That collided with `OrbitControls`' own internal `update()` call inside its pointer-drag handler (which fires mid-frame, before our target change lands), so dragging to orbit *while walking* made both update() calls fight over two different targets in the same frame — a violent camera shake that got worse the more you moved. Fixed by restructuring: the camera now lives inside a `<group>` that smoothly chases the player (`THREE.MathUtils.damp`), while `OrbitControls.target` stays at a **permanently fixed local point** (`(0, 0.9, 0)`, since panning is disabled) that's never touched again after the initial mount. Orbiting/zooming and following are now fully decoupled transforms that can never race each other, and `enableDamping` was turned on for a smoother drag feel now that it's safe to do so.
- **Shadow bugs fixed (v3.3):** drei's `SoftShadows` (a global `THREE.ShaderChunk` patch used for the PCSS-style soft shadows added in v3) turned out to leave already-compiled shader programs in a broken/stuck state — shadows that had already rendered wouldn't clear, and toggling "고품질 그래픽" off didn't remove them either, since unmounting the component doesn't force already-compiled materials to recompile. Replaced it with `<Canvas shadows="soft">`, which just sets the renderer to the standard, well-tested `THREE.PCFSoftShadowMap` and has none of those issues. Also fixed the actual "shadow looks weird" cause: the key light's shadow camera frustum was a world-fixed 40×40 unit box with default near/far (0.5–500, terrible depth precision) — now `FollowSun` (in `World.jsx`) keeps the light + its shadow target locked to the local player's X/Z position every frame, so the frustum can be a much tighter 20×20 box with near/far tuned to 1–30, giving noticeably crisper, more correct-looking shadows at the same resolution. `ContactShadows` and `castShadow` on the key light are now both gated by the `highQuality` toggle too, so turning it off actually removes shadow rendering like it's supposed to (previously they ignored the toggle entirely).

## Ideas for What's Next

1. **More avatar presets** — `AVATAR_PRESETS` in `PresetAvatarModel.jsx` is easy to extend with new characters; the animation rig (elbow/knee joints, landing squash, rise/fall jump poses, emote poses) is shared automatically by any new preset, since it's all procedural.
2. ~~Real map import~~ — done in v2 (see above). Proximity chat was tried and reverted back to global chat.
3. **Interactive objects** — a couple of clickable objects like a bench you can sit on or a photo-booth spot.
4. **Inventory / friends list** — broader social features.
5. **Voice chat** — extend beyond text chat via WebRTC.
6. ~~Low-end device graphics toggle~~ — done in v3.1 (see above): the ⚙️ button lets people drop `SoftShadows`/`Bloom`/`Vignette` and shadow resolution independently of the film-grain shader.

Working through this list one item at a time is a good way to keep raising the bar on this as a portfolio piece.
