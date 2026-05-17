# Firebase Setup Guide — Durian Rush

**For educators and professors running Durian Rush in a classroom.**
No software engineering background required. Estimated time: **20 minutes**.

> **It costs nothing.** This entire setup runs on Firebase's free Spark plan.
> Realtime Database, Anonymous Authentication, and Hosting are all included at no charge.
> Firebase does not ask for a credit card for the Spark plan.

---

## Before you start

You will need:
- A Google account (Gmail is fine)
- The Durian Rush project files on your computer (cloned from GitHub)
- Node.js installed ([nodejs.org](https://nodejs.org) — download the LTS version)

---

## Step 1 — Create a Firebase account and project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Sign in with your Google account
3. Click **Add project**
4. Enter a project name — something like `durian-rush-myuniversity`
5. On the next screen, **disable Google Analytics** (toggle it off — you don't need it)
6. Click **Create project**
7. Wait about 30 seconds, then click **Continue**

You are now inside your Firebase project dashboard.

---

## Step 2 — Enable Realtime Database

The game uses Firebase Realtime Database to sync player orders and scores live.

1. In the left sidebar, click **Build** → **Realtime Database**
2. Click **Create database**
3. For the location, select **Singapore (asia-southeast1)**
   - If you are running the game outside Asia, any region works — Singapore is recommended because the game is set in Malaysia
4. On the next screen, select **Start in test mode**
5. Click **Enable**

The database is now live. Now apply the proper security rules:

1. Click the **Rules** tab (at the top of the Realtime Database page)
2. Delete everything in the editor and paste this instead:

```json
{
  "rules": {
    "game": {
      ".read": true,
      ".write": true
    },
    "players": {
      ".read": true,
      "$uid": {
        ".write": true
      }
    },
    "ai": {
      ".read": true,
      ".write": true
    }
  }
}
```

3. Click **Publish**

What these rules do: the game data (scores, orders, AI results) is open for reading and writing. This is intentional for a classroom tool — the admin is protected by a PIN, and player data is not sensitive.

---

## Step 3 — Enable Authentication (Anonymous)

Players join the game without creating an account. Firebase Anonymous Auth handles this silently — players get a temporary identity the moment they open the player page.

1. In the left sidebar, click **Build** → **Authentication**
2. Click **Get started**
3. Under the **Sign-in method** tab, find **Anonymous** in the list
4. Click on **Anonymous**
5. Toggle the **Enable** switch to on
6. Click **Save**

That's it. Do not enable any other providers — you do not need Phone, Google, or Email for this game.

---

## Step 4 — Register a web app and get your config

1. Click the gear icon next to **Project Overview** in the top-left sidebar → **Project settings**
2. Scroll down to the **Your apps** section
3. Click the **</>** (web) icon to add a web app
4. Give the app a nickname — `durian-rush-web` works fine
5. Check the box **Also set up Firebase Hosting for this app**
6. Click **Register app**
7. You will see a block of JavaScript config that looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project-id.firebaseapp.com",
  databaseURL: "https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project-id",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

Keep this page open — you will copy these values in the next step.

8. Click **Continue to console**

---

## Step 5 — Fill in your .env file

In the Durian Rush project folder on your computer, find the file called `.env.example`. Make a copy of it and name the copy `.env` (no `.example`).

Open `.env` in any text editor (Notepad, TextEdit, VS Code) and fill in each line using the values from the Firebase config you just saw:

```
VITE_FIREBASE_API_KEY=        ← paste the apiKey value
VITE_FIREBASE_AUTH_DOMAIN=    ← paste the authDomain value
VITE_FIREBASE_DATABASE_URL=   ← paste the databaseURL value
VITE_FIREBASE_PROJECT_ID=     ← paste the projectId value
VITE_FIREBASE_MESSAGING_SENDER_ID=  ← paste the messagingSenderId value
VITE_FIREBASE_APP_ID=         ← paste the appId value

VITE_PLAY_URL=https://your-project-id.web.app/play

VITE_ADMIN_PIN=choose-a-pin
```

For `VITE_PLAY_URL`, replace `your-project-id` with your actual Firebase project ID (the same one that appears in `authDomain`).

For `VITE_ADMIN_PIN`, choose any PIN you will remember — 4 to 8 characters. This is the PIN you will enter to access `/admin` before your session. **Change it from the default (`demo1234`) before running a real class.**

Save the file. Do not share this file or commit it to GitHub — it contains your project credentials.

---

## Step 6 — Install Firebase CLI and log in

The Firebase CLI is a small command-line tool that lets you deploy the game from your computer.

Open a terminal (Terminal on Mac, Command Prompt or PowerShell on Windows) and run:

```bash
npm install -g firebase-tools
```

Then log in to Firebase:

```bash
firebase login
```

A browser window will open asking you to sign in with your Google account. Use the same account you used in Step 1. When you see "Firebase CLI Login Successful", return to the terminal.

---

## Step 7 — Initialize Firebase Hosting

Still in the terminal, navigate to the Durian Rush project folder:

```bash
cd path/to/durian-rush
```

Then run:

```bash
firebase init hosting
```

Answer the prompts as follows:

- **Which Firebase project to use?** → Select **Use an existing project**, then choose the project you created in Step 1
- **What do you want to use as your public directory?** → type `dist` and press Enter
- **Configure as a single-page app?** → type `y` and press Enter
- **Set up automatic builds with GitHub?** → type `n` and press Enter
- **File dist/index.html already exists. Overwrite?** → type `n` and press Enter

Firebase is now configured for hosting.

---

## Step 8 — Build and deploy

Install the project dependencies (only needed once):

```bash
npm install
```

Build the game:

```bash
npm run build
```

Deploy to Firebase Hosting:

```bash
firebase deploy --only hosting
```

When the command finishes, you will see a line like:

```
Hosting URL: https://your-project-id.web.app
```

Your game is live.

---

## Step 9 — Test that everything works

1. Open `https://your-project-id.web.app/admin` in a browser on your laptop
   - Enter the PIN you set in `VITE_ADMIN_PIN` (default: `demo1234`)
   - You should see the Durian Rush admin control panel
2. Open `https://your-project-id.web.app/play` on your phone (or scan the QR code on the admin screen)
   - You should see the player registration screen
3. Enter your name and email on your phone, then tap **JOIN**
   - No SMS or code required — you join instantly
4. Back on the admin screen, the lobby counter should jump to **1 player joined**

If the counter updates, your Firebase connection is working correctly. You are ready to run the game.

---

## Something went wrong?

**"Permission denied" error when joining as a player**

Your security rules may not have saved. Go back to Firebase Console → Build → Realtime Database → Rules, paste the rules from Step 2 again, and click Publish.

**The lobby counter stays at 0 even after a player joins**

Your `.env` file may have an incorrect `VITE_FIREBASE_DATABASE_URL`. Check that the URL ends in `.firebasedatabase.app` and includes the region (e.g. `asia-southeast1`). After fixing `.env`, run `npm run build && firebase deploy --only hosting` again.

**"Firebase: No Firebase App" error in the browser console**

The `.env` file was not loaded during the build. Make sure the file is named exactly `.env` (not `.env.txt` or `.env.example`) and is in the root of the project folder, then rebuild.

**Players get stuck after entering their name — nothing happens**

Anonymous Authentication may not be enabled. Go to Firebase Console → Build → Authentication → Sign-in method, and confirm that Anonymous is toggled on and saved.

---

## You're done

Your game is deployed and free to run as many times as you like. The Spark plan has no time limit — your Firebase project stays active indefinitely.

For questions about the game mechanics or facilitation, see `docs/facilitator-guide.md`.
