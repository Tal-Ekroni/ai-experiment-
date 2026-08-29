# Putting Jolt on your iPhone

The game is a web build wrapped with Capacitor. The wrap itself is committed;
the only step that needs a Mac is building and signing in Xcode.

## One-time setup (on a Mac with Xcode installed)

    cd jolt
    npm install
    npm run build            # emits dist/
    npx cap sync ios         # copies dist/ + plugins into the Xcode project
    npx cap open ios         # opens ios/App/App.xcworkspace in Xcode

In Xcode: select your team under Signing & Capabilities, plug in your iPhone,
pick it as the run target, press Run. For a personal device build no paid
account is needed (7-day provisioning); App Store distribution needs the
developer program.

## Motion permissions

iOS only fires DeviceMotion/DeviceOrientation after an explicit permission
prompt from a user gesture, and only in secure contexts. Inside the Capacitor
WKWebView this works out of the box; the game already asks as part of
onboarding (the "MOVES: MOTION" flow) and falls back to touch-only commands if
denied, so no Info.plist motion key is required. Speech (the announcer) uses
the system speechSynthesis voices — no entitlement needed.

## Iterating

After any game change:

    npm run build && npx cap sync ios

then rebuild in Xcode. Never edit files under ios/App/App/public — they are
overwritten by every sync; the source of truth is src/.
