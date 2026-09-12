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

function pose(time) {
  const p = motion.progress;
  const raise = smooth(.13, .28, p) * (1 - smooth(.38, .44, p));
  const point = smooth(.74, .84, p);
  const wave = raise;

  const walkProgress = smooth(.46, .74, p);
  const walkIn = smooth(.43, .49, p);
  const walkOut = smooth(.71, .77, p);
  const walkWeight = walkIn * (1 - walkOut);

  const startX = ((mobile ? .67 : .70) - .5) * viewWidth;
  const targetX = ((mobile ? .14 : .29) - .5) * viewWidth;
  character.position.x = THREE.MathUtils.lerp(startX, targetX, walkProgress);
  character.position.y = 1.5 + (.5 - (mobile ? .835 : .80)) * viewHeight;

  // Turn to face left when moving, face front-right when standing
  const turnLeft = smooth(.42, .48, p);
  const turnFront = smooth(.72, .78, p);
  const facingLeft = -Math.PI * 0.48;
  const facingFront = -.06 + point * .10;
  character.rotation.y = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(-.06, facingLeft, turnLeft),
    facingFront,
    turnFront
  );

  // Standing/planted procedural pose
  if (walkWeight < 0.999) {
    for (const [name, bone] of bones) {
      bone.quaternion.copy(rest.get(name));
      if (restPositions.has(name)) bone.position.copy(restPositions.get(name));
    }

    if (!reducedMotion) {
      turnWorld('spine_03', v(0, 0, 1), Math.sin(time * 1.25) * .006 * (1 - walkWeight));
      turnWorld('head', v(0, 0, 1), (Math.sin(time * .75) * .014 - wave * .035) * (1 - walkWeight));
    }
    turnWorld('head', v(0, 1, 0), point * .20);

    aimBone('upperarm_r', 'lowerarm_r', v(-.18, -1, .02));
    aimBone('lowerarm_r', 'hand_r', v(.07, -1, .16));
    const upper = v(.18, -1, .02).lerp(v(.83, .08, .06), raise).lerp(mobile ? v(.25, -1, .12) : v(1, -.65, .12), point);
    const lower = v(-.08, -1, .10).lerp(v(-.06, 1, .14), raise).lerp(v(1, -.24, .05), point);
    aimBone('upperarm_l', 'lowerarm_l', upper);
    aimBone('lowerarm_l', 'hand_l', lower);
    const waving = reducedMotion ? 0 : Math.sin(p * 53) * .27;
    const handDirection = v(-.03, -1, .04).lerp(v(waving, 1, .08), raise).lerp(v(1, -.24, .03), point);
    aimBone('hand_l', 'middle_01_l', handDirection);
    turnWorld('hand_l', handDirection.clone().normalize(), wave * -1.55);

    // Curl the other three fingers for a readable pointing index finger.
    for (const finger of ['middle', 'ring', 'pinky']) {
      for (const joint of ['01', '02', '03']) {
        const bone = bones.get(`${finger}_${joint}_l`);
        bone.rotateZ(point * (joint === '01' ? .95 : 1.25));
      }
    }
    bones.get('thumb_01_l').rotateZ(point * .32);
    for (const side of ['l', 'r']) {
      const relax = side === 'r' ? .18 : .18 * (1 - raise);
      for (const finger of ['index', 'middle', 'ring', 'pinky']) {
        bones.get(`${finger}_02_${side}`).rotateZ(relax);
        bones.get(`${finger}_03_${side}`).rotateZ(relax);
      }
    }
    if (!reducedMotion && wave > .5) bones.get('jaw').rotateZ(Math.max(0, Math.sin(time * 9)) * .025 * wave);
  }

  // Walking animation & smooth blending
  if (mixer && walkClip && walkWeight > 0.001) {
    const totalWalkCycles = 2.4;
    const walkTime = (walkProgress * totalWalkCycles * walkClip.duration) % walkClip.duration;

    if (walkWeight < 0.999) {
      // Capture current procedural standing pose
      for (const [name, bone] of bones) {
        standingQuats.get(name).copy(bone.quaternion);
      }
      // Evaluate walk clip
      mixer.setTime(walkTime);
      // Blend bone quaternions and root position between standing pose and walk clip
      for (const [name, bone] of bones) {
        _tempQuat.copy(standingQuats.get(name)).slerp(bone.quaternion, walkWeight);
        bone.quaternion.copy(_tempQuat);
        if (restPositions.has(name)) {
          bone.position.lerp(restPositions.get(name), 1 - walkWeight);
        }
      }
    } else {
      // Pure walking motion
      mixer.setTime(walkTime);
    }
  }

  character.updateMatrixWorld(true);
  shadow.position.set(character.position.x, character.position.y - .016, -.30);
  updateUI(p);
}

function updateUI(p) {
  const next = p < .23 ? 0 : p < .70 ? 1 : 2;
  if (next !== chapter) {
    chapter = next;
    document.querySelectorAll('[data-step]').forEach((button, i) => {
      button.classList.toggle('active', i === chapter);
      if (i === chapter) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('#scroll-label').textContent = ['SCROLL TO SAY HELLO', 'KEEP GOING, THERE’S MORE', 'SCROLL UP TO MEET AGAIN'][chapter];
    const text = ['', 'Hi!', 'Take a look.'][chapter];
    $('#speech').textContent = text;
    if (chapter === 1 && !greeted) { speak('Hi! Good to see you here.'); greeted = true; }
    if (chapter === 0) greeted = false;
  }
  const showMessage = p > .67;
  $('#message').inert = !showMessage;
  $('#message').setAttribute('aria-hidden', String(!showMessage));
  $('#greeting').setAttribute('aria-hidden', String(chapter !== 1));
  $('#intro').inert = p > .22;
  $('#intro').setAttribute('aria-hidden', String(p > .22));
  const speechOpacity = smooth(.24, .30, p) * (1 - smooth(.40, .46, p)) + smooth(.75, .81, p);
  $('#speech').style.opacity = speechOpacity;
  $('#speech').style.visibility = speechOpacity > .01 ? 'visible' : 'hidden';
  // Anchor the speech to the actual head, so it follows every screen size.
  const head = bones.get('head').getWorldPosition(v(0, 0)).project(camera);
  $('#speech').style.left = `${(head.x * .5 + .5) * 100 + (mobile ? 2 : 3)}%`;
  $('#speech').style.top = `${(-head.y * .5 + .5) * 100 - 8}%`;
  const walkProgress = smooth(.46, .74, p);
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
    .to('#intro', { autoAlpha: 0, y: reducedMotion ? 0 : -24, duration: .12 }, .11)
    .to('.backdrop-word', { opacity: .45, xPercent: -15, duration: .6 }, .16)
    .to('#greeting', { autoAlpha: 1, y: 0, duration: .1 }, .24)
    .to('#greeting', { autoAlpha: 0, y: reducedMotion ? 0 : -20, duration: .1 }, .40)
    .to('#message', { autoAlpha: 1, y: 0, rotate: 0, duration: .19, ease: 'power2.out' }, .68);
}

function goTo(progress) {
  const distance = $('#experience').offsetHeight - innerHeight;
  window.scrollTo({ top: Math.max(0, distance * progress), behavior: reducedMotion ? 'instant' : 'smooth' });
}
$('#begin').addEventListener('click', () => goTo(.32));
$('#replay').addEventListener('click', () => goTo(0));
$('.brand').addEventListener('click', (event) => { event.preventDefault(); goTo(0); });
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => goTo([0, .32, 1][Number(button.dataset.step)])));
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
  if (soundEnabled) speak(chapter === 2 ? 'Take a look. Good things start with hello.' : 'Hi! I’m Nathan.');
  else speechSynthesis.cancel();
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
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); showError('The 3D view was interrupted. Reload to bring Nathan back.'); });
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
      if (!bones.has(name)) throw new Error(`The character skeleton is missing ${name}. Restore the supplied Nathan GLB.`);
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
    showError(error.message.includes('WebGL') ? 'This browser could not start the 3D view. Try a browser with WebGL and hardware acceleration enabled.' : `Nathan couldn’t load. Open this app through the included local server and check that assets/nathan.glb is present. ${error.message}`);
  }
}

// Modules and deferred scripts can finish in different orders in some browsers.
if (document.readyState === 'complete') init();
else window.addEventListener('load', init, { once: true });
