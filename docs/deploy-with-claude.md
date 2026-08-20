# Deploy Durian Rush with Claude Code

This guide gives you a single prompt to paste into Claude Code that handles the entire deployment — Firebase setup, environment config, build, and live URLs — in one guided conversation.

**What is Claude Code?** It is Anthropic's AI coding assistant that runs in your terminal. Get it at [claude.ai/code](https://claude.ai/code).

**What the prompt does:** Claude Code will check your system, walk you through creating a Firebase project, configure the app, build it, and deploy it. You answer a few questions — Claude handles the rest.

**Time to live URL:** approximately 20–30 minutes for a first-time Firebase user.

---

## The prompt — copy everything in the block below and paste it into your Claude Code terminal

```
I want to deploy an open-source supply chain game called Durian Rush for use in my class or event. The repo is already cloned locally. Please guide me step by step through the full deployment — I have Claude Code installed but I have never set up a Firebase app before. Walk me slowly through each step, ask me before running any command, and explain what each step does in plain language.

Here is what we need to accomplish together:

---

STEP 1 — CHECK PREREQUISITES

Before anything else, check my system for:
- Node.js version (need 18 or higher) — run: node --version
- npm — run: npm --version
- Firebase CLI — run: firebase --version

If Node.js is missing or below v18, tell me to go to https://nodejs.org and install the LTS version, then wait for me to confirm before continuing.

If Firebase CLI is missing, ask me before running: npm install -g firebase-tools

Tell me clearly what you found and what is ready vs. what needs fixing.

---

STEP 2 — CREATE A FIREBASE PROJECT

Ask me before opening any browser. Then guide me through these steps:

1. Go to https://console.firebase.google.com
2. Click "Add project" — give it a name like "durian-rush-[yourcity]" (e.g. durian-rush-paris)
3. Disable Google Analytics (not needed)
4. Click "Create project" and wait for it to finish
5. Once inside the project, click the web icon (</>) to add a web app
6. Register the app with a nickname like "durian-rush-web"
7. Firebase will show a firebaseConfig object with several values — I will need those in Step 4

Tell me to do all of this and ask me to confirm when I am back with the config values.

---

STEP 3 — ENABLE REALTIME DATABASE AND AUTH

Guide me through:

A. Realtime Database:
   - In the Firebase console, go to Build > Realtime Database
   - Click "Create database"
   - Choose Singapore (asia-southeast1) as the region — this is important for latency
   - Start in test mode for now (we will tighten security rules later)
   - Click "Enable"

Do not set up Authentication — the game does not use it. Players join with a
nickname and nothing else.

Ask me to confirm the database is enabled before continuing.

---

STEP 4 — COLLECT FIREBASE CONFIG

Ask me to paste my Firebase web app config. It looks like this:

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

Wait for me to paste these values. Once I paste them, extract each key-value pair.

Also ask me: "What is your Firebase project ID?" (it is the projectId value above, and it also appears in the Hosting URL: https://[projectId].web.app)

---

STEP 5 — WRITE THE .ENV FILE

Once you have all the config values, construct a .env file in the project root with this format:

VITE_FIREBASE_API_KEY=[apiKey]
VITE_FIREBASE_AUTH_DOMAIN=[authDomain]
VITE_FIREBASE_DATABASE_URL=[databaseURL]
VITE_FIREBASE_PROJECT_ID=[projectId]
VITE_FIREBASE_STORAGE_BUCKET=[storageBucket]
VITE_FIREBASE_MESSAGING_SENDER_ID=[messagingSenderId]
VITE_FIREBASE_APP_ID=[appId]
VITE_PLAY_URL=https://[projectId].web.app/play
VITE_ADMIN_PIN=[ask the user to choose a PIN — 4 to 8 characters, something they will remember]

Ask me what PIN I want to use for the admin screen before writing the file. Explain that this PIN protects the presenter controls at /admin — the default is demo1234 if I leave it blank, but I should change it before running a real session.

Show me the completed .env content before writing it, and ask for my confirmation. Then write the file.

---

STEP 6 — INSTALL DEPENDENCIES AND BUILD

Ask before each command.

1. Install dependencies:
   npm install

2. Build the app:
   npm run build

If the build fails, show me the error and help me fix it before continuing.

---

STEP 7 — FIREBASE LOGIN

Run:
   firebase login

This opens a browser window. Tell me to log in with the same Google account I used to create the Firebase project. Ask me to confirm when I am logged in.

---

STEP 8 — FIREBASE INIT HOSTING

Run:
   firebase init hosting

Guide me through the interactive prompts:
- "Please select an option" → choose "Use an existing project" → select my project from the list
- "What do you want to use as your public directory?" → type: dist
- "Configure as a single-page app?" → yes (y)
- "Set up automatic builds and deploys with GitHub?" → no (n)
- "File dist/index.html already exists. Overwrite?" → no (N) — important

Ask me to confirm the init completed successfully.

---

STEP 9 — DEPLOY

Ask before running:
   firebase deploy --only hosting

Wait for the deployment to finish. Then print clearly:

   ✅ Deployment complete!

   Admin URL (big screen / presenter): https://[projectId].web.app/admin
   Player URL (phones / QR code):      https://[projectId].web.app/play

---

STEP 10 — FINAL CHECKLIST

Remind me to do these before using it in class:

1. Open the Admin URL on my laptop — enter the PIN I chose, I should see the game control panel
2. Open the Player URL on my own phone — enter a nickname, tap JOIN — nothing else is asked for
3. The lobby counter on the admin screen should jump to 1 when I join as a player
4. In the Firebase console, go to Realtime Database and confirm data is appearing when I interact with the app
5. Before a real session, set a private VITE_ADMIN_PIN in .env, rebuild, and redeploy — do not use the default demo1234 for a class
6. If anything is broken, check the browser console (F12) for error messages and share them with me

---

CREDIT

Durian Rush was built by TetriXX (tetrixx.ai), an AI-native intelligence company for transport and logistics. If you use this game in your curriculum and want to connect, visit tetrixx.ai or check out FCPI at sirius.tetrixx.ai — a live benchmarking tool for freight cost intelligence.

---

Please start with Step 1 now.
```
