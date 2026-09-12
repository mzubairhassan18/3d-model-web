import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = { progress: 0 };
const bones = new Map();
const rest = new Map();
const restPositions = new Map();
const standingQuats = new Map();
const _tempQuat = new THREE.Quaternion();
const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);
let renderer, character, shadow, timeline, viewWidth, viewHeight, mobile;
let chapter = -1, soundEnabled = false, greeted = false;
let mixer, walkAction, walkClip;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-3, 3, 2, -2, .1, 30);
camera.position.set(0, 1.5, 8);
camera.lookAt(0, 1.5, 0);

function showError(message) {
  $('#loader').hidden = true;
  $('#loader').style.display = 'none';
  $('#error-text').textContent = message;
  $('#error').hidden = false;
}

// Aim in world space, then convert back to the bone's parent space.
// This avoids assuming an FBX rig uses the same local axes as another model.
function aimBone(name, childName, direction) {
  const bone = bones.get(name), child = bones.get(childName);
  bone.updateWorldMatrix(true, true);
  const current = child.getWorldPosition(v(0, 0)).sub(bone.getWorldPosition(v(0, 0))).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(current, direction.clone().normalize());
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(delta.multiply(world)));
  bone.updateWorldMatrix(false, true);
}

function turnWorld(name, axis, angle) {
  const bone = bones.get(name);
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(world)));
  bone.updateWorldMatrix(false, true);
}

function prepareWalkClip(clip) {
  if (!clip) return null;
  // Ensure in-place walking by pinning horizontal drift of root tracks, keeping vertical bobbing
  for (const track of clip.tracks) {
    if (track.name.endsWith('.position')) {
      const initialX = track.values[0];
      const initialZ = track.values[2];
      let maxDrift = 0;
      for (let i = 0; i < track.values.length; i += 3) {
        maxDrift = Math.max(maxDrift, Math.abs(track.values[i] - initialX), Math.abs(track.values[i + 2] - initialZ));
      }
      if (maxDrift > 0.05) {
        for (let i = 0; i < track.values.length; i += 3) {
          track.values[i] = initialX;
          track.values[i + 2] = initialZ;
        }
      }
    }
  }
  return clip;
}

function bendKnees(amount) {
  const thighL = bones.get('thigh_l') || bones.get('LeftUpLeg');
  const calfL = bones.get('calf_l') || bones.get('LeftLeg');
  const thighR = bones.get('thigh_r') || bones.get('RightUpLeg');
  const calfR = bones.get('calf_r') || bones.get('RightLeg');
  if (thighL) thighL.rotateX(-amount * 0.4);
  if (calfL) calfL.rotateX(amount * 0.7);
  if (thighR) thighR.rotateX(-amount * 0.4);
  if (calfR) calfR.rotateX(amount * 0.7);
}

function pose(time) {
  const p = motion.progress;

  // Key phases of the portfolio experience:
  // Phase 1: 0.00 - 0.16 -> Greeting & wave on the right
  // Phase 2: 0.16 - 0.28 -> Walk to the left
  // Phase 3: 0.28 - 0.38 -> About Me summary card on right
  // Phase 4: 0.38 - 0.45 -> Dramatic Jump down into Experience Arena
  // Phase 5: 0.45 - 0.92 -> 4 Experience milestones with Pointing & 'Yeah Moment' celebrations
  // Phase 6: 0.92 - 1.00 -> Education & Connect

  const raise = smooth(.06, .12, p) * (1 - smooth(.15, .18, p));
  const aboutPoint = smooth(.28, .32, p) * (1 - smooth(.36, .39, p));

  const walkProgress = smooth(.16, .28, p);
  const walkIn = smooth(.15, .19, p);
  const walkOut = smooth(.26, .29, p);
  const walkWeight = walkIn * (1 - walkOut);

  const startX = ((mobile ? .67 : .70) - .5) * viewWidth;
  const targetX = ((mobile ? .14 : .29) - .5) * viewWidth;
  character.position.x = THREE.MathUtils.lerp(startX, targetX, walkProgress);
  const basePosY = 1.5 + (.5 - (mobile ? .835 : .80)) * viewHeight;
  character.position.y = basePosY;

  // Turn to face left when walking, face front/camera otherwise
  const turnLeft = smooth(.15, .19, p);
  const turnFront = smooth(.26, .30, p);
  const facingLeft = -Math.PI * 0.48;
  const facingFront = -.06 + aboutPoint * .10;

  character.rotation.y = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(-.06, facingLeft, turnLeft),
    facingFront,
    turnFront
  );

  // Default bone reset
  if (walkWeight < 0.999) {
    for (const [name, bone] of bones) {
      bone.quaternion.copy(rest.get(name));
      if (restPositions.has(name)) bone.position.copy(restPositions.get(name));
    }

    if (!reducedMotion) {
      turnWorld('spine_03', v(0, 0, 1), Math.sin(time * 1.25) * .006 * (1 - walkWeight));
      turnWorld('head', v(0, 0, 1), (Math.sin(time * .75) * .014 - raise * .035) * (1 - walkWeight));
    }
  }

  // --- PHASE 1: GREETING & WAVE ---
  if (p < 0.20 && walkWeight < 0.999) {
    aimBone('upperarm_r', 'lowerarm_r', v(-.18, -1, .02));
    aimBone('lowerarm_r', 'hand_r', v(.07, -1, .16));
    const upper = v(.18, -1, .02).lerp(v(.83, .08, .06), raise);
    const lower = v(-.08, -1, .10).lerp(v(-.06, 1, .14), raise);
    aimBone('upperarm_l', 'lowerarm_l', upper);
    aimBone('lowerarm_l', 'hand_l', lower);
    const waving = reducedMotion ? 0 : Math.sin(p * 70) * .27;
    const handDirection = v(-.03, -1, .04).lerp(v(waving, 1, .08), raise);
    aimBone('hand_l', 'middle_01_l', handDirection);
    turnWorld('hand_l', handDirection.clone().normalize(), raise * -1.55);

    for (const side of ['l', 'r']) {
      const relax = side === 'r' ? .18 : .18 * (1 - raise);
      for (const finger of ['index', 'middle', 'ring', 'pinky']) {
        bones.get(`${finger}_02_${side}`).rotateZ(relax);
        bones.get(`${finger}_03_${side}`).rotateZ(relax);
      }
    }
    if (!reducedMotion && raise > .4) bones.get('jaw').rotateZ(Math.max(0, Math.sin(time * 9)) * .025 * raise);
  }

  // --- PHASE 2: WALKING ANIMATION ---
  if (mixer && walkClip && walkWeight > 0.001) {
    const totalWalkCycles = 2.4;
    const walkTime = (walkProgress * totalWalkCycles * walkClip.duration) % walkClip.duration;

    if (walkWeight < 0.999) {
      for (const [name, bone] of bones) standingQuats.get(name).copy(bone.quaternion);
      mixer.setTime(walkTime);
      for (const [name, bone] of bones) {
        _tempQuat.copy(standingQuats.get(name)).slerp(bone.quaternion, walkWeight);
        bone.quaternion.copy(_tempQuat);
        if (restPositions.has(name)) bone.position.lerp(restPositions.get(name), 1 - walkWeight);
      }
    } else {
      mixer.setTime(walkTime);
    }
  }

  // --- PHASE 3: ABOUT ME POINTING ---
  if (p >= 0.26 && p < 0.38) {
    turnWorld('head', v(0, 1, 0), aboutPoint * .20);
    aimBone('upperarm_r', 'lowerarm_r', v(-.18, -1, .02));
    aimBone('lowerarm_r', 'hand_r', v(.07, -1, .16));
    const upper = v(.18, -1, .02).lerp(mobile ? v(.25, -1, .12) : v(1, -.65, .12), aboutPoint);
    const lower = v(-.08, -1, .10).lerp(v(1, -.24, .05), aboutPoint);
    aimBone('upperarm_l', 'lowerarm_l', upper);
    aimBone('lowerarm_l', 'hand_l', lower);
    aimBone('hand_l', 'middle_01_l', v(1, -.24, .03));

    for (const finger of ['middle', 'ring', 'pinky']) {
      for (const joint of ['01', '02', '03']) {
        bones.get(`${finger}_${joint}_l`).rotateZ(aboutPoint * (joint === '01' ? .95 : 1.25));
      }
    }
    bones.get('thumb_01_l').rotateZ(aboutPoint * .32);
  }

  // --- PHASE 4: DRAMATIC JUMP DOWN ---
  if (p >= 0.38 && p < 0.45) {
    const jt = (p - 0.38) / (0.45 - 0.38); // 0 to 1
    character.rotation.y = 0; // face front during jump

    if (jt < 0.22) {
      // Crouch preparation
      const prep = jt / 0.22;
      character.position.y = basePosY - prep * 0.08;
      bendKnees(prep * 0.45);
      aimBone('upperarm_l', 'lowerarm_l', v(.22, -.7, -.1));
      aimBone('upperarm_r', 'lowerarm_r', v(-.22, -.7, -.1));
    } else if (jt < 0.65) {
      // Airborne leap: hands up above, legs bent
      const air = (jt - 0.22) / 0.43;
      const jumpArc = Math.sin(air * Math.PI);
      character.position.y = basePosY + jumpArc * 0.46;
      bendKnees(0.35 + jumpArc * 0.25);
      // Hands high above
      aimBone('upperarm_l', 'lowerarm_l', v(.20, .90, .10));
      aimBone('lowerarm_l', 'hand_l', v(.10, .95, .05));
      aimBone('upperarm_r', 'lowerarm_r', v(-.20, .90, .10));
      aimBone('lowerarm_r', 'hand_r', v(-.10, .95, .05));
    } else {
      // Landing impact & recovery bounce
      const land = (jt - 0.65) / 0.35;
      const landImpact = Math.sin(land * Math.PI);
      character.position.y = basePosY - landImpact * 0.16;
      bendKnees(landImpact * 0.75);
      // Arms absorb down and outwards
      aimBone('upperarm_l', 'lowerarm_l', v(.35, -.6, .15));
      aimBone('upperarm_r', 'lowerarm_r', v(-.35, -.6, .15));
    }
  }

  // --- PHASE 5 & 6: EXPERIENCE MILESTONES & CELEBRATIONS ---
  if (p >= 0.45) {
    // Slices for the 4 experiences + 1 connect
    const slices = [
      { start: 0.45, end: 0.56 }, // USTAFF360
      { start: 0.56, end: 0.68 }, // CARE
      { start: 0.68, end: 0.80 }, // Embrace-It
      { start: 0.80, end: 0.92 }, // CARE Joget
      { start: 0.92, end: 1.00 }  // Connect
    ];

    let currentSlice = slices[slices.length - 1];
    let sliceProgress = 1;
    for (const slice of slices) {
      if (p >= slice.start && p < slice.end) {
        currentSlice = slice;
        sliceProgress = (p - slice.start) / (slice.end - slice.start);
        break;
      }
    }

    if (p < 0.92) {
      // For each experience:
      // First 52% -> Point at the card on the right
      // Next 48% -> "Yeah Moment" celebration facing camera
      const isPointing = sliceProgress < 0.52;
      const pointWeight = isPointing ? smooth(0, .25, sliceProgress) * (1 - smooth(.42, .54, sliceProgress)) : 0;
      const yeahWeight = !isPointing ? smooth(.48, .64, sliceProgress) * (1 - smooth(.88, 1.0, sliceProgress)) : 0;

      if (pointWeight > 0.01) {
        // Pointing at the card
        character.rotation.y = .04 * pointWeight;
        turnWorld('head', v(0, 1, 0), pointWeight * .22);
        aimBone('upperarm_r', 'lowerarm_r', v(-.18, -1, .02));
        aimBone('lowerarm_r', 'hand_r', v(.07, -1, .16));
        aimBone('upperarm_l', 'lowerarm_l', v(1, -.62, .12));
        aimBone('lowerarm_l', 'hand_l', v(1, -.20, .05));
        aimBone('hand_l', 'middle_01_l', v(1, -.18, .03));

        for (const finger of ['middle', 'ring', 'pinky']) {
          for (const joint of ['01', '02', '03']) {
            bones.get(`${finger}_${joint}_l`).rotateZ(pointWeight * (joint === '01' ? .95 : 1.25));
          }
        }
        bones.get('thumb_01_l').rotateZ(pointWeight * .32);
      } else if (yeahWeight > 0.01) {
        // "Yeah Moment": Hands upward from elbows, knees slightly bent, smiling forward at camera
        character.rotation.y = 0;
        character.position.y = basePosY - yeahWeight * 0.05;
        bendKnees(yeahWeight * 0.32);

        // Left arm: elbows bent up
        aimBone('upperarm_l', 'lowerarm_l', v(.32, -.45, .12));
        aimBone('lowerarm_l', 'hand_l', v(.12, .92, .20));
        aimBone('hand_l', 'middle_01_l', v(.08, 1, .10));

        // Right arm: elbows bent up
        aimBone('upperarm_r', 'lowerarm_r', v(-.32, -.45, .12));
        aimBone('lowerarm_r', 'hand_r', v(-.12, .92, .20));
        aimBone('hand_r', 'middle_01_r', v(-.08, 1, .10));

        for (const side of ['l', 'r']) {
          for (const finger of ['index', 'middle', 'ring', 'pinky']) {
            bones.get(`${finger}_02_${side}`).rotateZ(.35 * yeahWeight);
          }
        }
        if (!reducedMotion) bones.get('jaw').rotateZ(0.022 * yeahWeight * (0.8 + 0.2 * Math.sin(time * 6)));
      } else {
        // Resting posture between gesture transitions
        aimBone('upperarm_r', 'lowerarm_r', v(-.18, -1, .02));
        aimBone('lowerarm_r', 'hand_r', v(.07, -1, .16));
        aimBone('upperarm_l', 'lowerarm_l', v(.18, -1, .02));
        aimBone('lowerarm_l', 'hand_l', v(-.08, -1, .10));
      }
    } else {
      // Connect / Final card: welcoming celebration
      character.rotation.y = 0;
      aimBone('upperarm_l', 'lowerarm_l', v(.45, -.3, .2));
      aimBone('lowerarm_l', 'hand_l', v(.25, .7, .2));
      aimBone('upperarm_r', 'lowerarm_r', v(-.45, -.3, .2));
      aimBone('lowerarm_r', 'hand_r', v(-.25, .7, .2));
    }
  }

  character.updateMatrixWorld(true);
  shadow.position.set(character.position.x, character.position.y - .016, -.30);
  updateUI(p);
}

function updateUI(p) {
  // 4 Chapters: 0: Meet Zubair, 1: About, 2: Experience, 3: Connect
  const next = p < .20 ? 0 : p < .45 ? 1 : p < .92 ? 2 : 3;
  if (next !== chapter) {
    chapter = next;
    document.querySelectorAll('[data-step]').forEach((button, i) => {
      button.classList.toggle('active', i === chapter);
      if (i === chapter) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('#scroll-label').textContent = [
      'SCROLL TO MEET ZUBAIR',
      'KEEP GOING TO LEARN MORE',
      'SCROLL FOR EXPERIENCE',
      'LET’S CONNECT'
    ][chapter];
    if (chapter === 1 && !greeted) {
      speak('Hi! I’m Muhammad Zubair, Senior Frontend Engineer.');
      greeted = true;
    }
    if (chapter === 0) greeted = false;
  }

  // Toggle Intro, Greeting, and About Message
  $('#intro').inert = p > .16;
  $('#intro').setAttribute('aria-hidden', String(p > .16));
  $('#greeting').setAttribute('aria-hidden', String(p < .09 || p > .18));

  const showAbout = p >= .27 && p < .38;
  $('#message').inert = !showAbout;
  $('#message').setAttribute('aria-hidden', String(!showAbout));

  // Toggle Experience Deck & Cards
  const showDeck = p >= .44;
  $('#experience-deck').inert = !showDeck;
  $('#experience-deck').setAttribute('aria-hidden', String(!showDeck));

  let activeExp = -1;
  if (p >= .45 && p < .56) activeExp = 0;
  else if (p >= .56 && p < .68) activeExp = 1;
  else if (p >= .68 && p < .80) activeExp = 2;
  else if (p >= .80 && p < .92) activeExp = 3;
  else if (p >= .92) activeExp = 4;

  document.querySelectorAll('.exp-card').forEach((card, i) => {
    card.classList.toggle('active', i === activeExp);
  });

  // Dynamic Speech bubble text & visibility
  let speechText = '';
  let speechOpacity = 0;

  if (p >= .09 && p < .19) {
    speechText = 'Hi! I’m Zubair.';
    speechOpacity = smooth(.09, .12, p) * (1 - smooth(.16, .19, p));
  } else if (p >= .28 && p < .38) {
    speechText = 'Take a look.';
    speechOpacity = smooth(.28, .30, p) * (1 - smooth(.36, .38, p));
  } else if (p >= .39 && p < .45) {
    speechText = 'Here we go! 🚀';
    speechOpacity = smooth(.39, .41, p) * (1 - smooth(.44, .45, p));
  } else if (p >= .45 && p < .56) {
    const u = (p - .45) / (.56 - .45);
    speechText = u < .52 ? 'Healthcare at USTAFF360' : '50,000+ daily users! ⚡';
    speechOpacity = smooth(.45, .47, p);
  } else if (p >= .56 && p < .68) {
    const u = (p - .56) / (.68 - .56);
    speechText = u < .52 ? 'Research & Eng at CARE' : '15+ Core Modules Modernized!';
    speechOpacity = 1;
  } else if (p >= .68 && p < .80) {
    const u = (p - .68) / (.80 - .68);
    speechText = u < .52 ? 'React 17 at Embrace-It' : 'Tech debt cut by 40%! 🎯';
    speechOpacity = 1;
  } else if (p >= .80 && p < .92) {
    const u = (p - .80) / (.92 - .80);
    speechText = u < .52 ? 'Enterprise Apps at CARE' : 'Production-ready workflows!';
    speechOpacity = 1;
  } else if (p >= .92) {
    speechText = 'Let’s build together!';
    speechOpacity = smooth(.92, .94, p);
  }

  $('#speech').textContent = speechText;
  $('#speech').style.opacity = speechOpacity;
  $('#speech').style.visibility = speechOpacity > .01 ? 'visible' : 'hidden';

  // Anchor speech to head position
  const head = bones.get('head').getWorldPosition(v(0, 0)).project(camera);
  $('#speech').style.left = `${(head.x * .5 + .5) * 100 + (mobile ? 2 : 3)}%`;
  $('#speech').style.top = `${(-head.y * .5 + .5) * 100 - 8}%`;

  const walkProgress = smooth(.16, .28, p);
  $('.character-label').style.left = `${THREE.MathUtils.lerp(mobile ? 67 : 70, mobile ? 18 : 29, walkProgress)}%`;
  $('.character-label').style.opacity = mobile ? 1 - walkProgress : 1;
}

function speak(text) {
  if (!soundEnabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = 'en-US'; speech.rate = .92; speech.pitch = 1;
  speechSynthesis.speak(speech);
}

function resize() {
  const { width, height } = $('#scene').getBoundingClientRect();
  mobile = width <= 600;
  viewHeight = mobile ? 4.4 : 4.0;
  viewWidth = viewHeight * width / height;
  camera.left = -viewWidth / 2; camera.right = viewWidth / 2;
  camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  if (character) {
    character.scale.setScalar((mobile ? 1.95 : 2.6) / character.userData.originalHeight);
    shadow.scale.set(mobile ? .60 : .87, mobile ? .14 : .20, 1);
  }
}

function makeTimeline() {
  const gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);
  timeline = gsap.timeline({ scrollTrigger: {
    trigger: '#experience', start: 'top top', end: 'bottom bottom', scrub: reducedMotion ? true : .65,
    invalidateOnRefresh: true,
  }});
  timeline.to(motion, { progress: 1, duration: 1, ease: 'none' }, 0)
    .to('#progress', { scaleX: 1, duration: 1, ease: 'none' }, 0)
    .to('#intro', { autoAlpha: 0, y: reducedMotion ? 0 : -24, duration: .07 }, .08)
    .to('.backdrop-word', { opacity: .45, xPercent: -15, duration: .6 }, .12)
    .to('#greeting', { autoAlpha: 1, y: 0, duration: .04 }, .09)
    .to('#greeting', { autoAlpha: 0, y: reducedMotion ? 0 : -20, duration: .04 }, .18)
    .to('#message', { autoAlpha: 1, y: 0, rotate: 0, duration: .07, ease: 'power2.out' }, .27)
    .to('#message', { autoAlpha: 0, y: reducedMotion ? 0 : -30, duration: .05 }, .37);
}

function goTo(progress) {
  const distance = $('#experience').offsetHeight - innerHeight;
  window.scrollTo({ top: Math.max(0, distance * progress), behavior: reducedMotion ? 'instant' : 'smooth' });
}
$('#begin').addEventListener('click', () => goTo(.31));
$('#replay').addEventListener('click', () => goTo(0));
$('.brand').addEventListener('click', (event) => { event.preventDefault(); goTo(0); });
document.querySelectorAll('[data-step]').forEach(button => {
  button.addEventListener('click', () => goTo([0, .31, .48, .95][Number(button.dataset.step)]));
});
$('#sound').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) {
    $('#sound span').textContent = 'Voice unavailable';
    $('#sound').disabled = true;
    return;
  }
  soundEnabled = !soundEnabled;
  $('#sound').setAttribute('aria-pressed', String(soundEnabled));
  $('#sound').setAttribute('aria-label', soundEnabled ? 'Mute voice' : 'Enable voice');
  $('#sound span').textContent = soundEnabled ? 'Sound on' : 'Sound off';
  if (soundEnabled) {
    speak(chapter === 3 ? 'Feel free to get in touch. Let’s connect!' : chapter === 2 ? 'Here are my enterprise roles and achievements.' : chapter === 1 ? 'Specialized in React, TypeScript, and modern web.' : 'Hi! I’m Muhammad Zubair.');
  } else {
    speechSynthesis.cancel();
  }
});

async function init() {
  try {
    if (!window.gsap || !window.ScrollTrigger) throw new Error('The animation libraries could not load. Please reload this page.');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    $('#scene').appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); showError('The 3D view was interrupted. Reload to bring Zubair back.'); });
    scene.add(new THREE.HemisphereLight(0xfffbf0, 0x899074, 2.6));
    const key = new THREE.DirectionalLight(0xfff5e5, 3.0); key.position.set(-3, 5, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xe4eaff, 1.4); fill.position.set(3, 3, 1); scene.add(fill);
    const gltf = await new GLTFLoader().loadAsync('./assets/nathan.glb', event => {
      if (event.total) $('#load-progress').style.width = `${Math.round(event.loaded / event.total * 100)}%`;
    });
    character = gltf.scene;
    character.traverse(object => {
      if (object.isBone) {
        const name = object.name.replace('rp_nathan_animated_003_walking_', '');
        bones.set(name, object);
        rest.set(name, object.quaternion.clone());
        restPositions.set(name, object.position.clone());
        standingQuats.set(name, new THREE.Quaternion());
      }
      if (object.isMesh) { object.frustumCulled = false; }
    });
    for (const name of ['head', 'jaw', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r']) {
      if (!bones.has(name)) throw new Error(`The character skeleton is missing ${name}. Restore the supplied 3D GLB model.`);
    }
    if (gltf.animations && gltf.animations.length > 0) {
      walkClip = prepareWalkClip(gltf.animations[0]);
      mixer = new THREE.AnimationMixer(character);
      walkAction = mixer.clipAction(walkClip);
      walkAction.play();
    }
    character.userData.originalHeight = new THREE.Box3().setFromObject(character).getSize(v(0, 0)).y;
    scene.add(character);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(82,95,54,0.24)'); gradient.addColorStop(.42, 'rgba(122,139,88,0.12)'); gradient.addColorStop(1, 'rgba(122,139,88,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
    scene.add(shadow);
    resize(); makeTimeline();
    document.body.dataset.ready = 'true';
    window.gsap.to('#loader', { autoAlpha: 0, duration: .5, onComplete: () => $('#loader').style.display = 'none' });
    window.ScrollTrigger.refresh();
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const time = clock.getElapsedTime();
      if (document.hidden) return;
      pose(time);
      renderer.render(scene, camera);
    });
    window.addEventListener('resize', resize);
    document.fonts.ready.then(() => window.ScrollTrigger.refresh());
  } catch (error) {
    console.error(error);
    showError(error.message.includes('WebGL') ? 'This browser could not start the 3D view. Try a browser with WebGL and hardware acceleration enabled.' : `Zubair couldn’t load. Open this app through the included local server and check that assets/nathan.glb is present. ${error.message}`);
  }
}

// Modules and deferred scripts can finish in different orders in some browsers.
if (document.readyState === 'complete') init();
else window.addEventListener('load', init, { once: true });
