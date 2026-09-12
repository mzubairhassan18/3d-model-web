# 3d-model-web

## Hello, Nathan

A plain HTML, CSS, and JavaScript scroll experience using Three.js and GSAP ScrollTrigger, built around the supplied Nathan GLB.

## Run

With Node.js installed, run `node server.mjs` (or `npm start`) from this folder, then open **http://localhost:3000**. Use a local HTTP server, rather than opening the HTML directly, so the browser can load JavaScript modules and the GLB.

Scroll down to raise Nathan’s hand, see him say **Hi!**, and watch him point at the message card. Scrolling up reverses the sequence. The chapter buttons jump between stages; Replay returns to the beginning. Enable **Sound on** for an optional spoken greeting using your browser’s speech synthesis.

## Customize

- **Message:** edit the `#message` section in `index.html`.
- **Appearance and responsive layout:** edit `styles.css`.
- **Gesture timing and poses:** edit `pose()` and `makeTimeline()` in `app.js`. Timeline positions range from 0 to 1.
- **Character:** `assets/nathan.glb` is a copy of the supplied model. The procedural animation targets its named skeleton; other models need a bone-name/pose adjustment.

The model includes a walking clip. This experience intentionally uses its original skeleton to create a planted greeting, wave, and pointing pose, with the other fingers curled around an extended index finger. No external animation files are required. Speech uses a caption and optional synthesized voice, with a subtle jaw motion rather than phoneme-based lip sync.

Three.js 0.180.0 and GSAP 3.13.0 are vendored locally. The optional Google Fonts stylesheet falls back to system sans-serif when offline. Three.js license is in `vendor/three/LICENSE`; GSAP licensing: https://gsap.com/standard-license/. The character retains its source asset’s licensing terms.

The layout adapts to mobile screens. Reduced-motion preferences disable idle motion and scroll smoothing. The text remains available in HTML, with keyboard-operable chapter controls and a visible loading/error state.
