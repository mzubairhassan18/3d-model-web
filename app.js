import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = { progress: 0 };
const bones = new Map();
const boneLookup = new Map();
const rest = new Map();
const restPositions = new Map();
const standingQuats = new Map();
const _tempQuat = new THREE.Quaternion();
const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);
let renderer, character, shadow, timeline, viewWidth, viewHeight, mobile;
let chapter = -1, soundEnabled = false, greeted = false;
let mixer, walkAction, walkClip;
let pen = null, penLoaded = false;
let lastConfettiCard = -1, cardReveals = [], lastModelClickTime = 0;
// Reading windows exclude the existing walks between alternating sides.
const readingWindows = [[.43, .505], [.545, .605], [.645, .705], [.745, .805], [.845, .915], [.945, 1]];
let scrollSegments = [];
let mobileLayout = null;

// Keep the existing desktop flow; mobile CSS places these groups in opposite columns.
function prepareExperienceLayout() {
  document.querySelectorAll('#experience-deck .exp-card').forEach(card => {
    if (card.querySelector('.exp-heading')) return;
    const heading = document.createElement('div');
    heading.className = 'exp-heading';
    const body = document.createElement('div');
    body.className = 'exp-body';
    Array.from(card.children).forEach(child => {
      (child.matches('.exp-header, .exp-role') ? heading : body).append(child);
    });
    card.append(heading, body);
  });
}

function measureMobileLayout() {
  mobileLayout = null;
  if (!mobile) return;
  const stage = $('.stage').getBoundingClientRect();
  const brand = $('.brand').getBoundingClientRect();
  const introTop = brand.bottom - stage.top + 27;
  document.documentElement.style.setProperty('--mobile-content-top', `${introTop}px`);
  const footer = $('.footer').getBoundingClientRect();
  const floor = footer.top - stage.top - 18;
  const headings = Array.from(document.querySelectorAll('.exp-heading'), heading => {
    const rect = heading.getBoundingClientRect();
    return rect.bottom - stage.top;
  });
  mobileLayout = { width: stage.width, height: stage.height, floor, headings };
  document.querySelectorAll('.exp-body').forEach(body => {
    // Scrollable reading regions can also be reached and scrolled with a keyboard.
    body.tabIndex = body.scrollHeight > body.clientHeight + 1 ? 0 : -1;
  });
}

function readingProgress(index, progress) {
  const [start, end] = readingWindows[index];
  return THREE.MathUtils.clamp((progress - start) / (end - start), 0, 1);
}

const COMPANY_THEMES = [
  {
    name: 'truey',
    primary: '#7c3aed',         // Electric Violet
    secondary: '#a855f7',       // Bright Purple
    darkBg: '#1e1035',
    accentLight: '#f3e8ff',
    badgeBg: '#7c3aed',
    badgeText: '#ffffff',
    bulletDot: '#8b5cf6',
    tagBg: '#ede9fe',
    tagText: '#5b21b6',
    glowBeam: 'linear-gradient(180deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%)',
    speechBg: '#7c3aed',
    speechColor: '#ffffff',
    confetti: ['#7c3aed', '#a855f7', '#c084fc', '#ffffff', '#ec4899'],
  },
  {
    name: 'ustaff',
    primary: '#0284c7',         // Cobalt / Sky Blue
    secondary: '#e11d48',       // Crimson Red from the 'U'
    darkBg: '#0f172a',
    accentLight: '#e0f2fe',
    badgeBg: 'linear-gradient(135deg, #e11d48 0%, #0284c7 100%)',
    badgeText: '#ffffff',
    bulletDot: '#0284c7',
    tagBg: '#e0f2fe',
    tagText: '#0369a1',
    glowBeam: 'linear-gradient(180deg, #e11d48 0%, #0284c7 50%, #38bdf8 100%)',
    speechBg: '#0284c7',
    speechColor: '#ffffff',
    confetti: ['#e11d48', '#0284c7', '#38bdf8', '#ffffff', '#f59e0b'],
  },
  {
    name: 'care',
    primary: '#0891b2',         // Deep Teal / Cyan
    secondary: '#06b6d4',       // Light Electric Cyan
    darkBg: '#083344',
    accentLight: '#cffafe',
    badgeBg: '#0891b2',
    badgeText: '#ffffff',
    bulletDot: '#06b6d4',
    tagBg: '#cffafe',
    tagText: '#155e75',
    glowBeam: 'linear-gradient(180deg, #0e7490 0%, #0891b2 50%, #06b6d4 100%)',
    speechBg: '#0891b2',
    speechColor: '#ffffff',
    confetti: ['#0891b2', '#06b6d4', '#22d3ee', '#ffffff', '#67e8f9'],
  },
  {
    name: 'embrace',
    primary: '#0d9488',         // Aquamarine / Turquoise
    secondary: '#14b8a6',       // Vivid Teal
    darkBg: '#132e35',
    accentLight: '#ccfbf1',
    badgeBg: 'linear-gradient(135deg, #132e35 0%, #0d9488 100%)',
    badgeText: '#ffffff',
    bulletDot: '#14b8a6',
    tagBg: '#ccfbf1',
    tagText: '#115e59',
    glowBeam: 'linear-gradient(180deg, #132e35 0%, #0d9488 50%, #2dd4bf 100%)',
    speechBg: '#0d9488',
    speechColor: '#ffffff',
    confetti: ['#0d9488', '#14b8a6', '#2dd4bf', '#ffffff', '#1e293b'],
  },
  {
    name: 'care_joget',
    primary: '#2563eb',         // Enterprise Royal Blue
    secondary: '#0284c7',       // Cyan Blue
    darkBg: '#1e293b',
    accentLight: '#dbeafe',
    badgeBg: '#2563eb',
    badgeText: '#ffffff',
    bulletDot: '#2563eb',
    tagBg: '#dbeafe',
    tagText: '#1e40af',
    glowBeam: 'linear-gradient(180deg, #1d4ed8 0%, #2563eb 50%, #38bdf8 100%)',
    speechBg: '#2563eb',
    speechColor: '#ffffff',
    confetti: ['#2563eb', '#38bdf8', '#60a5fa', '#ffffff', '#1d4ed8'],
  },
  {
    name: 'connect',
    primary: '#ee6849',         // Warm Brand Coral
    secondary: '#f59e0b',       // Amber
    darkBg: '#291811',
    accentLight: '#ffedd5',
    badgeBg: '#ee6849',
    badgeText: '#ffffff',
    bulletDot: '#ee6849',
    tagBg: '#ffedd5',
    tagText: '#9a3412',
    glowBeam: 'linear-gradient(180deg, #ee6849 0%, #f59e0b 100%)',
    speechBg: '#ee6849',
    speechColor: '#ffffff',
    confetti: ['#ee6849', '#f59e0b', '#849e65', '#ffffff', '#38bdf8'],
  }
];
const raycaster = new THREE.Raycaster();
let hitMesh = null, lastFrameTime = 0;

const interactionState = {
  activeGesture: null, // 'excited' | 'stop' | 'step_back'
  progress: 0,
  duration: 1.45,
  blend: 0,
  speechText: '',
  hoverVariant: 0,
  cooldownUntil: 0,
  isHovered: false,
  pelvisOffset: new THREE.Vector3(),
};

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

const BONE_ALIASES = {
  thigh_l: ['thigh_l', 'thigh_L', 'upperleg_l', 'upperleg_L', 'leftupleg', 'leg_l', 'bip01_l_thigh', 'l_thigh'],
  thigh_r: ['thigh_r', 'thigh_R', 'upperleg_r', 'upperleg_R', 'rightupleg', 'leg_r', 'bip01_r_thigh', 'r_thigh'],
  calf_l: ['calf_l', 'calf_L', 'lowerleg_l', 'lowerleg_L', 'shin_l', 'shin_L', 'leftleg', 'bip01_l_calf', 'l_calf'],
  calf_r: ['calf_r', 'calf_R', 'lowerleg_r', 'lowerleg_R', 'shin_r', 'shin_R', 'rightleg', 'bip01_r_calf', 'r_calf'],
  foot_l: ['foot_l', 'foot_L', 'leftfoot', 'ankle_l', 'bip01_l_foot', 'l_foot'],
  foot_r: ['foot_r', 'foot_R', 'rightfoot', 'ankle_r', 'bip01_r_foot', 'r_foot'],
  pelvis: ['pelvis', 'Pelvis', 'hips', 'Hips', 'root', 'Root', 'bip01_pelvis'],
  spine_01: ['spine_01', 'spine_1', 'Spine1', 'spine1', 'spine', 'Spine', 'bip01_spine'],
  spine_02: ['spine_02', 'spine_2', 'Spine2', 'spine2', 'bip01_spine1'],
  spine_03: ['spine_03', 'spine_3', 'Spine3', 'spine3', 'chest', 'Chest', 'bip01_spine2'],
  neck: ['neck', 'Neck', 'bip01_neck'],
  head: ['head', 'Head', 'bip01_head'],
  jaw: ['jaw', 'Jaw'],
  upperarm_l: ['upperarm_l', 'upperarm_L', 'leftarm', 'bip01_l_upperarm', 'l_upperarm'],
  lowerarm_l: ['lowerarm_l', 'lowerarm_L', 'leftforearm', 'bip01_l_forearm', 'l_forearm'],
  hand_l: ['hand_l', 'hand_L', 'lefthand', 'bip01_l_hand', 'l_hand'],
  upperarm_r: ['upperarm_r', 'upperarm_R', 'rightarm', 'bip01_r_upperarm', 'r_upperarm'],
  lowerarm_r: ['lowerarm_r', 'lowerarm_R', 'rightforearm', 'bip01_r_forearm', 'r_forearm'],
  hand_r: ['hand_r', 'hand_R', 'righthand', 'bip01_r_hand', 'r_hand']
};

function getBone(name) {
  if (!name) return null;
  if (boneLookup.has(name)) return boneLookup.get(name);
  const lower = name.toLowerCase();
  if (boneLookup.has(lower)) return boneLookup.get(lower);
  if (bones.has(name)) return bones.get(name);
  if (bones.has(lower)) return bones.get(lower);
  if (BONE_ALIASES[lower]) {
    for (const alias of BONE_ALIASES[lower]) {
      if (boneLookup.has(alias)) return boneLookup.get(alias);
      if (boneLookup.has(alias.toLowerCase())) return boneLookup.get(alias.toLowerCase());
      if (bones.has(alias)) return bones.get(alias);
      if (bones.has(alias.toLowerCase())) return bones.get(alias.toLowerCase());
    }
  }
  for (const [key, bone] of boneLookup) {
    const k = key.toLowerCase();
    if (k === lower || k.endsWith('_' + lower) || k.endsWith(lower)) return bone;
  }
  return null;
}

// Aim in world space, then convert back to the bone's parent space.
// Fail-safe: handles missing bones or root bones without throwing.
function aimBone(name, childName, direction) {
  const bone = getBone(name), child = getBone(childName);
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, true);
  const current = child.getWorldPosition(v(0, 0)).sub(bone.getWorldPosition(v(0, 0))).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(current, direction.clone().normalize());
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentQuat = (bone.parent && typeof bone.parent.getWorldQuaternion === 'function')
    ? bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    : new THREE.Quaternion();
  bone.quaternion.copy(parentQuat.multiply(delta.multiply(world)));
  bone.updateWorldMatrix(false, true);
}

function turnWorld(name, axis, angle) {
  const bone = getBone(name);
  if (!bone) return;
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentQuat = (bone.parent && typeof bone.parent.getWorldQuaternion === 'function')
    ? bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    : new THREE.Quaternion();
  bone.quaternion.copy(parentQuat.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(world)));
  bone.updateWorldMatrix(false, true);
}

function blendAimBone(name, childName, direction, blend) {
  const bone = getBone(name);
  if (!bone || blend < 0.001) return;
  const baseQ = bone.quaternion.clone();
  aimBone(name, childName, direction);
  if (blend < 0.999) bone.quaternion.slerp(baseQ, 1 - blend);
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
  if (Math.abs(amount) < 0.001) return;
  // World-space forward pitch rotation around world X for athletic, natural knee flexion
  // Deep knees: thigh swings forward (-X pitch), calf swings back (+X pitch), foot dorsiflexes (-X pitch)
  const thighPitch = -amount * 1.35;
  const calfPitch = amount * 2.50;
  const footPitch = -amount * 1.15;

  turnWorld('thigh_l', v(1, 0, 0), thighPitch);
  turnWorld('calf_l', v(1, 0, 0), calfPitch);
  turnWorld('foot_l', v(1, 0, 0), footPitch);

  turnWorld('thigh_r', v(1, 0, 0), thighPitch);
  turnWorld('calf_r', v(1, 0, 0), calfPitch);
  turnWorld('foot_r', v(1, 0, 0), footPitch);

  // Biomechanical torso compensation to balance center of gravity over feet
  turnWorld('spine_01', v(1, 0, 0), -amount * 0.42);
  turnWorld('spine_02', v(1, 0, 0), -amount * 0.30);
  turnWorld('spine_03', v(1, 0, 0), -amount * 0.18);
  turnWorld('head', v(1, 0, 0), amount * 0.32); // Keep gaze forward towards camera/horizon
}

function applyRelaxedHands(weight = 1.0) {
  if (weight < 0.01) return;
  for (const side of ['l', 'r']) {
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      const curl = finger === 'pinky' ? 0.38 : finger === 'ring' ? 0.32 : finger === 'middle' ? 0.26 : 0.22;
      const b2 = getBone(`${finger}_02_${side}`);
      const b3 = getBone(`${finger}_03_${side}`);
      if (b2) b2.rotateZ(curl * weight);
      if (b3) b3.rotateZ((curl * 1.15) * weight);
    }
    const thumb = getBone(`thumb_02_${side}`);
    if (thumb) thumb.rotateZ(0.18 * weight);
  }
}

function applyHumanIdle(time, idleWeight) {
  if (reducedMotion || idleWeight < 0.01) return;

  // 1. Natural human restless waiting cycle (14.0s period) with leg shedding & weight shift
  // Real humans don't oscillate symmetrically like clockwork; they settle on one leg,
  // fidget/shed their free leg, then transition smoothly to the other side.
  const tc = time % 14.0;
  let pelvisX = 0, pelvisRoll = 0, pelvisYaw = 0;
  let shedLeft = 0, shedRight = 0;
  let spineCounterRoll = 0;

  if (tc < 5.5) {
    // Stance A: Bearing weight on Right Leg, Left leg shed & relaxed
    pelvisX = 0.026;
    pelvisRoll = 0.048;
    pelvisYaw = 0.020;
    spineCounterRoll = -0.034;
    shedLeft = 1.0;

    // Mid-stance waiting fidget on relaxed left leg (waiting is restless!)
    if (tc >= 2.4 && tc < 3.8) {
      const u = (tc - 2.4) / 1.4;
      const fidget = Math.sin(u * Math.PI);
      shedLeft += fidget * 0.35;
      turnWorld('foot_l', v(1, 0, 0), -fidget * 0.10 * idleWeight);
    }
  } else if (tc < 7.0) {
    // Transition from Right to Left hip
    const s = smooth(5.5, 7.0, tc);
    pelvisX = THREE.MathUtils.lerp(0.026, -0.026, s);
    pelvisRoll = THREE.MathUtils.lerp(0.048, -0.048, s);
    pelvisYaw = THREE.MathUtils.lerp(0.020, -0.020, s);
    spineCounterRoll = THREE.MathUtils.lerp(-0.034, 0.034, s);
    shedLeft = 1.0 - s;
    shedRight = s;
  } else if (tc < 12.5) {
    // Stance B: Bearing weight on Left Leg, Right leg shed & relaxed
    pelvisX = -0.026;
    pelvisRoll = -0.048;
    pelvisYaw = -0.020;
    spineCounterRoll = 0.034;
    shedRight = 1.0;

    // Mid-stance waiting fidget on relaxed right leg
    if (tc >= 9.4 && tc < 10.8) {
      const u = (tc - 9.4) / 1.4;
      const fidget = Math.sin(u * Math.PI);
      shedRight += fidget * 0.35;
      turnWorld('foot_r', v(1, 0, 0), -fidget * 0.10 * idleWeight);
    }
  } else {
    // Transition back from Left to Right hip
    const s = smooth(12.5, 14.0, tc);
    pelvisX = THREE.MathUtils.lerp(-0.026, 0.026, s);
    pelvisRoll = THREE.MathUtils.lerp(-0.048, 0.048, s);
    pelvisYaw = THREE.MathUtils.lerp(-0.020, 0.020, s);
    spineCounterRoll = THREE.MathUtils.lerp(0.034, -0.034, s);
    shedRight = 1.0 - s;
    shedLeft = s;
  }

  // Apply pelvis weight shift safely
  const pelvisBone = getBone('pelvis');
  if (pelvisBone) {
    pelvisBone.position.x += pelvisX * idleWeight;
    turnWorld('pelvis', v(0, 0, 1), pelvisRoll * idleWeight);
    turnWorld('pelvis', v(0, 1, 0), pelvisYaw * idleWeight);
  }

  // Torso counters pelvis roll to keep shoulders level and upright
  turnWorld('spine_01', v(0, 0, 1), spineCounterRoll * idleWeight);
  turnWorld('spine_02', v(0, 0, 1), spineCounterRoll * 0.6 * idleWeight);

  // Apply leg shedding (soft knee flexion and natural outward foot angle)
  if (shedLeft > 0.01) {
    const sl = shedLeft * idleWeight;
    turnWorld('thigh_l', v(1, 0, 0), -sl * 0.20);
    turnWorld('calf_l', v(1, 0, 0), sl * 0.38);
    turnWorld('foot_l', v(0, 1, 0), -sl * 0.14);
    turnWorld('foot_l', v(0, 0, 1), -sl * 0.05);
  }
  if (shedRight > 0.01) {
    const sr = shedRight * idleWeight;
    turnWorld('thigh_r', v(1, 0, 0), -sr * 0.20);
    turnWorld('calf_r', v(1, 0, 0), sr * 0.38);
    turnWorld('foot_r', v(0, 1, 0), sr * 0.14);
    turnWorld('foot_r', v(0, 0, 1), sr * 0.05);
  }

  // 2. Natural human respiration rhythm (period ~3.6s)
  const breathFreq = time * (Math.PI * 2 / 3.6);
  const breath = Math.sin(breathFreq);
  turnWorld('spine_02', v(1, 0, 0), breath * 0.018 * idleWeight);
  turnWorld('spine_03', v(1, 0, 0), breath * 0.024 * idleWeight);

  // 3. Human gaze micro-motions & saccades (period ~11.0s)
  // Glances at user, checks out cards/portfolio on left, glances thoughtfully, returns
  const gt = time % 11.0;
  let targetYaw = 0, targetPitch = 0, targetRoll = 0.015;
  if (gt < 3.5) {
    targetYaw = 0; targetPitch = 0; targetRoll = 0.015;
  } else if (gt < 4.3) {
    const s = smooth(3.5, 4.3, gt);
    targetYaw = THREE.MathUtils.lerp(0, 0.18, s);
    targetPitch = THREE.MathUtils.lerp(0, -0.04, s);
    targetRoll = THREE.MathUtils.lerp(0.015, 0.035, s);
  } else if (gt < 7.2) {
    targetYaw = 0.18; targetPitch = -0.04; targetRoll = 0.035;
  } else if (gt < 8.0) {
    const s = smooth(7.2, 8.0, gt);
    targetYaw = THREE.MathUtils.lerp(0.18, -0.10, s);
    targetPitch = THREE.MathUtils.lerp(-0.04, 0.04, s);
    targetRoll = THREE.MathUtils.lerp(0.035, -0.030, s);
  } else if (gt < 10.0) {
    targetYaw = -0.10; targetPitch = 0.04; targetRoll = -0.030;
  } else {
    const s = smooth(10.0, 11.0, gt);
    targetYaw = THREE.MathUtils.lerp(-0.10, 0, s);
    targetPitch = THREE.MathUtils.lerp(0.04, 0, s);
    targetRoll = THREE.MathUtils.lerp(-0.030, 0.015, s);
  }

  // Overlay gentle respiration nod on head
  targetPitch += breath * 0.014;
  turnWorld('head', v(0, 1, 0), targetYaw * idleWeight);
  turnWorld('head', v(1, 0, 0), targetPitch * idleWeight);
  turnWorld('head', v(0, 0, 1), targetRoll * idleWeight);

  // 4. Relaxed arms & soft elbow flexion (never fully locked straight)
  turnWorld('lowerarm_l', v(1, 0, 0), -0.22 * idleWeight);
  turnWorld('lowerarm_r', v(1, 0, 0), -0.22 * idleWeight);
  turnWorld('upperarm_l', v(0, 0, 1), breath * 0.014 * idleWeight);
  turnWorld('upperarm_r', v(0, 0, 1), -breath * 0.014 * idleWeight);

  // Relaxed curled fingers
  applyRelaxedHands(idleWeight);

  // 5. Living jaw micro-motion
  const jaw = getBone('jaw');
  if (jaw) jaw.rotateZ(Math.max(0, Math.sin(time * 0.8)) * 0.010 * idleWeight);
}

function applyExcitedGesture(gt, blend, time) {
  // 1. Stretch hands left and right by ~35 degrees with open welcoming arms
  blendAimBone('upperarm_l', 'lowerarm_l', v(0.68, -0.62, 0.22), blend);
  blendAimBone('lowerarm_l', 'hand_l', v(0.76, 0.24, 0.14), blend);
  blendAimBone('hand_l', 'middle_01_l', v(0.85, 0.15, 0.10), blend);

  blendAimBone('upperarm_r', 'lowerarm_r', v(-0.68, -0.62, 0.22), blend);
  blendAimBone('lowerarm_r', 'hand_r', v(-0.76, 0.24, 0.14), blend);
  blendAimBone('hand_r', 'middle_01_r', v(-0.85, 0.15, 0.10), blend);

  applyRelaxedHands(blend * 0.45);

  // 2. Agile small jump / mini-hop:
  // [0.00, 0.18]: crouch windup dip
  // [0.18, 0.65]: airborne hop arc
  // [0.65, 0.85]: landing impact cushion
  // [0.85, 1.00]: elastic return to base
  let hopY = 0;
  if (gt < 0.18) {
    const w = gt / 0.18;
    const dip = Math.sin(w * Math.PI) * 0.07 * blend;
    bendKnees(dip * 2.8);
    hopY = -dip;
  } else if (gt < 0.65) {
    const h = (gt - 0.18) / (0.65 - 0.18);
    hopY = Math.sin(h * Math.PI) * 0.22 * blend;
    bendKnees(hopY * 0.8);
  } else if (gt < 0.85) {
    const l = (gt - 0.65) / (0.85 - 0.65);
    const cushion = Math.sin(l * Math.PI) * 0.06 * blend;
    bendKnees(cushion * 2.5);
    hopY = -cushion;
  }
  interactionState.pelvisOffset.set(0, hopY, 0);

  // 3. Head & cheerful upward facial reaction
  turnWorld('head', v(1, 0, 0), -0.14 * blend);
  turnWorld('head', v(0, 0, 1), Math.sin(time * 10) * 0.03 * blend);
  const jaw = getBone('jaw');
  if (jaw) jaw.rotateZ(0.018 * blend);
}

function applyStopGesture(gt, blend, time) {
  // 1. Right arm raised with palm facing flat toward user ("Wait a second / Hold on / Check this out")
  blendAimBone('upperarm_r', 'lowerarm_r', v(-0.16, -0.22, 0.62), blend);
  blendAimBone('lowerarm_r', 'hand_r', v(-0.04, 0.88, 0.38), blend);
  blendAimBone('hand_r', 'middle_01_r', v(-0.02, 0.95, 0.15), blend);

  for (const finger of ['index', 'middle', 'ring', 'pinky']) {
    const b = getBone(`${finger}_01_r`);
    if (b) b.rotateZ(-0.12 * blend);
  }

  // Left arm resting comfortably at hip
  blendAimBone('upperarm_l', 'lowerarm_l', v(0.20, -1, 0.05), blend);
  blendAimBone('lowerarm_l', 'hand_l', v(-0.05, -1, 0.10), blend);

  // 2. Torso engaged slightly forward toward camera
  turnWorld('spine_01', v(1, 0, 0), 0.09 * blend);

  // 3. Head looking directly at camera with slight inquisitive tilt
  turnWorld('head', v(0, 1, 0), 0.05 * blend);
  turnWorld('head', v(0, 0, 1), 0.08 * blend);

  interactionState.pelvisOffset.set(0, 0, 0);
}

function applyStepBackGesture(gt, blend, time) {
  // 1. Startled evasive step back and to the side
  let shiftX = 0, shiftY = 0, shiftZ = 0;
  if (gt < 0.35) {
    const r = smooth(0, 0.35, gt);
    shiftZ = -0.22 * blend * r;
    shiftX = 0.12 * blend * r;
    shiftY = Math.sin(r * Math.PI) * 0.05 * blend;
  } else if (gt < 0.65) {
    shiftZ = -0.22 * blend;
    shiftX = 0.12 * blend;
  } else {
    const s = smooth(0.65, 1.0, gt);
    shiftZ = -0.22 * blend * (1 - s);
    shiftX = 0.12 * blend * (1 - s);
    shiftY = Math.sin(s * Math.PI) * 0.04 * blend;
  }
  interactionState.pelvisOffset.set(shiftX, shiftY, shiftZ);

  // 2. Both hands held up defensively in front of chest ("Whoa! Don't poke me!")
  blendAimBone('upperarm_l', 'lowerarm_l', v(0.22, -0.28, 0.52), blend);
  blendAimBone('lowerarm_l', 'hand_l', v(0.08, 0.85, 0.28), blend);
  blendAimBone('hand_l', 'middle_01_l', v(0.05, 0.95, 0.20), blend);

  blendAimBone('upperarm_r', 'lowerarm_r', v(-0.22, -0.28, 0.52), blend);
  blendAimBone('lowerarm_r', 'hand_r', v(-0.08, 0.85, 0.28), blend);
  blendAimBone('hand_r', 'middle_01_r', v(-0.05, 0.95, 0.20), blend);

  // 3. Torso startled recoil
  turnWorld('spine_01', v(1, 0, 0), -0.16 * blend);

  // 4. Startled rapid head shake
  const headShake = Math.sin(gt * 26) * 0.24 * blend * (gt < 0.70 ? 1 : (1 - gt) / 0.30);
  turnWorld('head', v(0, 1, 0), headShake);
  turnWorld('head', v(1, 0, 0), -0.08 * blend);

  // 5. Knee flexion during step back
  bendKnees(0.22 * blend);
}

function applyInteractiveGestures(time) {
  const { activeGesture, progress, duration, blend } = interactionState;
  if (!activeGesture || blend < 0.001) return;

  const gt = Math.min(progress / duration, 1.0);

  if (activeGesture === 'excited') {
    applyExcitedGesture(gt, blend, time);
  } else if (activeGesture === 'stop') {
    applyStopGesture(gt, blend, time);
  } else if (activeGesture === 'step_back') {
    applyStepBackGesture(gt, blend, time);
  }
}

function getWritingWordScreenPos(card) {
  const words = card.querySelectorAll('.reveal-word');
  if (!words.length) return null;
  let writingWord = null;
  for (const word of words) {
    const op = parseFloat(word.style.opacity);
    if (!isNaN(op) && op > 0.15 && op < 0.99) { writingWord = word; break; }
  }
  if (!writingWord) {
    for (let i = words.length - 1; i >= 0; i--) {
      const op = parseFloat(words[i].style.opacity);
      if (!isNaN(op) && op >= 0.99) { writingWord = words[i]; break; }
    }
  }
  if (!writingWord) writingWord = words[0];
  const rect = writingWord.getBoundingClientRect();
  return { x: rect.left + rect.width * 0.85, y: rect.top + rect.height * 0.5 };
}

function pose(time) {
  const p = motion.progress;

  // Timeline breakdown:
  // Phase 1: 0.00 - 0.15 -> Greeting wave on the right
  // Phase 2: 0.15 - 0.26 -> Turn left & walk to the left side
  // Phase 3: 0.26 - 0.35 -> About Me summary card on right
  // Phase 4: 0.35 - 0.43 -> High athletic Jump with deep knee compression landing
  // Phase 5: 0.43 - 0.93 -> 5 Experience milestones (Truey, USTAFF360, CARE, Embrace-It, CARE Joget)
  // Phase 6: 0.93 - 1.00 -> Education & Connect

  const raise = smooth(.05, .10, p) * (1 - smooth(.13, .16, p));
  const aboutPoint = smooth(.26, .30, p) * (1 - smooth(.33, .36, p));

  const walkProgress = smooth(.15, .26, p);
  const walkIn = smooth(.14, .18, p);
  const walkOut = smooth(.24, .27, p);
  const walkWeight = walkIn * (1 - walkOut);

  const startX = ((mobile ? .67 : .70) - .5) * viewWidth;
  const targetX = ((mobile ? .14 : .29) - .5) * viewWidth;
  character.position.x = THREE.MathUtils.lerp(startX, targetX, walkProgress);
  let basePosY = 1.5 + (.5 - (mobile ? .835 : .80)) * viewHeight;
  if (mobile && mobileLayout) {
    const h = character.userData.originalHeight || 1.8;
    const experienceBlend = smooth(.40, .43, p);
    const isConnect = p >= 0.93;
    // Reserve the entire heading and speech area, even on a short viewport.
    const headingBottom = Math.max(...mobileLayout.headings, 0);
    const connectPadding = isConnect ? 20 : 94;
    const availableHeight = Math.max(0, mobileLayout.floor - headingBottom - connectPadding);
    const widthFactor = isConnect ? .84 : 1.1;
    const modelPixels = Math.min(mobileLayout.width * widthFactor, availableHeight);
    const experienceHeight = modelPixels / mobileLayout.height * viewHeight;
    const introHeight = Math.min(2.5, viewWidth * .95);
    character.scale.setScalar(THREE.MathUtils.lerp(introHeight, experienceHeight, experienceBlend) / h);
    const floorFraction = THREE.MathUtils.lerp(.835, mobileLayout.floor / mobileLayout.height, experienceBlend);
    basePosY = 1.5 + (.5 - floorFraction) * viewHeight;
  }
  character.position.y = basePosY;
  character.position.z = 0;

  // Turn to face left when walking, face front/camera otherwise
  const turnLeft = smooth(.14, .18, p);
  const turnFront = smooth(.24, .28, p);
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
      const rq = rest.get(name);
      if (rq) bone.quaternion.copy(rq);
      const rp = restPositions.get(name);
      if (rp) bone.position.copy(rp);
    }
  }

  // Determine idle weight: full idle when waiting, suppressed during active gestures
  const jumpActive = p >= 0.35 && p < 0.43;
  let activeGestureWeight = walkWeight + raise + aboutPoint;
  if (p >= 0.43 && p < 0.93) {
    activeGestureWeight = Math.max(activeGestureWeight, 0.4);
  }
  const idleWeight = jumpActive ? 0 : Math.max(0, 1 - activeGestureWeight);

  // --- PHASE 1: GREETING & WAVE ---
  if (p < 0.18 && walkWeight < 0.999) {
    aimBone('upperarm_r', 'lowerarm_r', v(-.18, -1, .02));
    aimBone('lowerarm_r', 'hand_r', v(.07, -1, .16));
    const upper = v(.18, -1, .02).lerp(v(.83, .08, .06), raise);
    const lower = v(-.08, -1, .10).lerp(v(-.06, 1, .14), raise);
    aimBone('upperarm_l', 'lowerarm_l', upper);
    aimBone('lowerarm_l', 'hand_l', lower);
    const waving = reducedMotion ? 0 : Math.sin(p * 85) * .27;
    const handDirection = v(-.03, -1, .04).lerp(v(waving, 1, .08), raise);
    aimBone('hand_l', 'middle_01_l', handDirection);
    turnWorld('hand_l', handDirection.clone().normalize(), raise * -1.55);

    for (const side of ['l', 'r']) {
      const relax = side === 'r' ? .18 : .18 * (1 - raise);
      for (const finger of ['index', 'middle', 'ring', 'pinky']) {
        const b2 = getBone(`${finger}_02_${side}`);
        const b3 = getBone(`${finger}_03_${side}`);
        if (b2) b2.rotateZ(relax);
        if (b3) b3.rotateZ(relax);
      }
    }
    const jaw = getBone('jaw');
    if (!reducedMotion && raise > .4 && jaw) jaw.rotateZ(Math.max(0, Math.sin(time * 9)) * .025 * raise);
  }

  // --- PHASE 2: WALKING ANIMATION ---
  if (mixer && walkClip && walkWeight > 0.001) {
    const totalWalkCycles = 2.4;
    const walkTime = (walkProgress * totalWalkCycles * walkClip.duration) % walkClip.duration;

    if (walkWeight < 0.999) {
      for (const [name, bone] of bones) {
        const sq = standingQuats.get(name);
        if (sq) sq.copy(bone.quaternion);
      }
      mixer.setTime(walkTime);
      for (const [name, bone] of bones) {
        const sq = standingQuats.get(name);
        if (sq) {
          _tempQuat.copy(sq).slerp(bone.quaternion, walkWeight);
          bone.quaternion.copy(_tempQuat);
        }
        const rp = restPositions.get(name);
        if (rp) bone.position.lerp(rp, 1 - walkWeight);
      }
    } else {
      mixer.setTime(walkTime);
    }
  }

  // --- PHASE 3: ABOUT ME POINTING ---
  if (p >= 0.25 && p < 0.35) {
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
        const b = getBone(`${finger}_${joint}_l`);
        if (b) b.rotateZ(aboutPoint * (joint === '01' ? .95 : 1.25));
      }
    }
    const thumb = getBone('thumb_01_l');
    if (thumb) thumb.rotateZ(aboutPoint * .32);
  }

  // --- PHASE 4: ATHLETIC REAL JUMP WITH DEEP KNEES ---
  if (p >= 0.35 && p < 0.43) {
    const jt = (p - 0.35) / (0.43 - 0.35); // 0 to 1
    character.rotation.y = 0; // face front during jump

    if (jt < 0.20) {
      // 1. Crouch preparation: deep spring-loading squat with back-swinging arms
      const s = jt / 0.20;
      const prep = smooth(0, 1, s);
      character.position.y = basePosY - prep * 0.54;
      bendKnees(prep * 1.30);
      aimBone('upperarm_l', 'lowerarm_l', v(.20, -.45, -.82));
      aimBone('lowerarm_l', 'hand_l', v(.12, -.30, -.85));
      aimBone('upperarm_r', 'lowerarm_r', v(-.20, -.45, -.82));
      aimBone('lowerarm_r', 'hand_r', v(-.12, -.30, -.85));
    } else if (jt < 0.28) {
      // 2. Explosive push-off takeoff: rapid leg drive and forward-upward arm throw
      const s = (jt - 0.20) / 0.08;
      const launch = smooth(0, 1, s);
      character.position.y = basePosY - (1 - launch) * 0.54 + launch * 0.16;
      bendKnees((1 - launch) * 1.30);
      const armY = THREE.MathUtils.lerp(-0.45, 0.85, launch);
      const armZ = THREE.MathUtils.lerp(-0.82, 0.35, launch);
      aimBone('upperarm_l', 'lowerarm_l', v(.22, armY, armZ));
      aimBone('lowerarm_l', 'hand_l', v(.14, armY + .1, armZ));
      aimBone('upperarm_r', 'lowerarm_r', v(-.22, armY, armZ));
      aimBone('lowerarm_r', 'hand_r', v(-.14, armY + .1, armZ));
    } else if (jt < 0.62) {
      // 3. High airborne parabolic leap: soaring arc, arms held high, dynamic knee tuck
      const s = (jt - 0.28) / 0.34;
      const jumpArc = Math.sin(s * Math.PI);
      character.position.y = basePosY + jumpArc * 0.88;
      const tuck = jumpArc * 1.20;
      turnWorld('thigh_l', v(1, 0, 0), -tuck * 1.15);
      turnWorld('calf_l', v(1, 0, 0), tuck * 2.15);
      turnWorld('foot_l', v(1, 0, 0), -tuck * 0.65);
      turnWorld('thigh_r', v(1, 0, 0), -tuck * 1.15);
      turnWorld('calf_r', v(1, 0, 0), tuck * 2.15);
      turnWorld('foot_r', v(1, 0, 0), -tuck * 0.65);
      aimBone('upperarm_l', 'lowerarm_l', v(.28, .96, .15));
      aimBone('lowerarm_l', 'hand_l', v(.16, .96, .05));
      aimBone('upperarm_r', 'lowerarm_r', v(-.28, .96, .15));
      aimBone('lowerarm_r', 'hand_r', v(-.16, .96, .05));
      turnWorld('spine_02', v(1, 0, 0), jumpArc * 0.14);
    } else if (jt < 0.84) {
      // 4. Deep landing impact cushioning: shock-absorption squat with deep knee flexion
      const s = (jt - 0.62) / 0.22;
      const impact = Math.sin(s * Math.PI);
      character.position.y = basePosY - impact * 0.60;
      bendKnees(impact * 1.40);
      aimBone('upperarm_l', 'lowerarm_l', v(.44, -.40, .42));
      aimBone('lowerarm_l', 'hand_l', v(.22, -.25, .50));
      aimBone('upperarm_r', 'lowerarm_r', v(-.44, -.40, .42));
      aimBone('lowerarm_r', 'hand_r', v(-.22, -.25, .50));
    } else {
      // 5. Elastic rebound and smooth return to standing stance
      const s = (jt - 0.84) / 0.16;
      const recover = 1 - s;
      character.position.y = basePosY - recover * 0.20;
      bendKnees(recover * 0.45);
      aimBone('upperarm_l', 'lowerarm_l', v(.22, -.80, .10));
      aimBone('lowerarm_l', 'hand_l', v(-.08, -1, .10));
      aimBone('upperarm_r', 'lowerarm_r', v(-.22, -.80, .10));
      aimBone('lowerarm_r', 'hand_r', v(.08, -1, .10));
    }
  }

  // --- PHASE 5 & 6: 5 EXPERIENCE MILESTONES, WALKING TRANSITIONS & 3D PEN ---
  if (p >= 0.43) {
    const leftStanceX = ((mobile ? .25 : .26) - .5) * viewWidth;
    const rightStanceX = ((mobile ? .75 : .74) - .5) * viewWidth;
    const centerStanceX = 0;

    let targetWalkX = leftStanceX;
    let facingAngle = -0.06;
    let cardTransitWalk = 0;
    let cardIndex = 0;
    let isCardOnRight = true;

    if (p < 0.505) {
      // Card 0 (Truey): Zubair on LEFT, card on RIGHT
      cardIndex = 0;
      targetWalkX = leftStanceX;
      facingAngle = 0.08;
      isCardOnRight = true;
    } else if (p < 0.545) {
      // Transit 0 -> 1: Walks from Left to Right
      cardIndex = 0;
      const t = smooth(0.505, 0.545, p);
      targetWalkX = THREE.MathUtils.lerp(leftStanceX, rightStanceX, t);
      cardTransitWalk = Math.sin(t * Math.PI);
      facingAngle = Math.PI * 0.48; // faces right while walking
      isCardOnRight = t < 0.5;
    } else if (p < 0.605) {
      // Card 1 (USTAFF360): Zubair on RIGHT, card on LEFT
      cardIndex = 1;
      targetWalkX = rightStanceX;
      facingAngle = -0.12;
      isCardOnRight = false;
    } else if (p < 0.645) {
      // Transit 1 -> 2: Walks from Right to Left
      cardIndex = 1;
      const t = smooth(0.605, 0.645, p);
      targetWalkX = THREE.MathUtils.lerp(rightStanceX, leftStanceX, t);
      cardTransitWalk = Math.sin(t * Math.PI);
      facingAngle = -Math.PI * 0.48; // faces left while walking
      isCardOnRight = t >= 0.5;
    } else if (p < 0.705) {
      // Card 2 (CARE): Zubair on LEFT, card on RIGHT
      cardIndex = 2;
      targetWalkX = leftStanceX;
      facingAngle = 0.08;
      isCardOnRight = true;
    } else if (p < 0.745) {
      // Transit 2 -> 3: Walks from Left to Right
      cardIndex = 2;
      const t = smooth(0.705, 0.745, p);
      targetWalkX = THREE.MathUtils.lerp(leftStanceX, rightStanceX, t);
      cardTransitWalk = Math.sin(t * Math.PI);
      facingAngle = Math.PI * 0.48;
      isCardOnRight = t < 0.5;
    } else if (p < 0.805) {
      // Card 3 (Embrace-It): Zubair on RIGHT, card on LEFT
      cardIndex = 3;
      targetWalkX = rightStanceX;
      facingAngle = -0.12;
      isCardOnRight = false;
    } else if (p < 0.845) {
      // Transit 3 -> 4: Walks from Right to Left
      cardIndex = 3;
      const t = smooth(0.805, 0.845, p);
      targetWalkX = THREE.MathUtils.lerp(rightStanceX, leftStanceX, t);
      cardTransitWalk = Math.sin(t * Math.PI);
      facingAngle = -Math.PI * 0.48;
      isCardOnRight = t >= 0.5;
    } else if (p < 0.915) {
      // Card 4 (CARE Joget): Zubair on LEFT, card on RIGHT
      cardIndex = 4;
      targetWalkX = leftStanceX;
      facingAngle = 0.08;
      isCardOnRight = true;
    } else if (p < 0.945) {
      // Transit 4 -> 5: Walks from Left to Center
      cardIndex = 4;
      const t = smooth(0.915, 0.945, p);
      targetWalkX = THREE.MathUtils.lerp(leftStanceX, centerStanceX, t);
      cardTransitWalk = Math.sin(t * Math.PI);
      facingAngle = Math.PI * 0.48;
      isCardOnRight = true;
    } else {
      // Card 5 (Connect): centered
      cardIndex = 5;
      targetWalkX = centerStanceX;
      facingAngle = 0;
      isCardOnRight = true;
    }

    character.position.x = targetWalkX;

    // Animate walk cycle when walking between cards
    if (cardTransitWalk > 0.01) {
      if (mixer) mixer.setTime(p * 28 + time * 0.2);
      character.rotation.y = facingAngle;
    } else {
      character.rotation.y = THREE.MathUtils.lerp(character.rotation.y, facingAngle, 0.15);
    }

    const activeIdx = Math.min(5, Math.max(0, cardIndex));
    const sliceProgress = readingProgress(activeIdx, p);

    if (p < 0.93 && cardTransitWalk < 0.20) {
      const isPointing = sliceProgress < 0.78;
      const pointWeight = isPointing ? smooth(0, .12, sliceProgress) * (1 - smooth(.72, .79, sliceProgress)) : 0;
      const yeahWeight = !isPointing ? smooth(.78, .87, sliceProgress) * (1 - smooth(.96, 1.0, sliceProgress)) : 0;

      if (pointWeight > 0.01) {
        // Pointing at card:
        // When card is on RIGHT: point right arm
        // When card is on LEFT: point left arm
        if (isCardOnRight) {
          aimBone('upperarm_l', 'lowerarm_l', v(.18, -1, .02));
          aimBone('lowerarm_l', 'hand_l', v(-.08, -1, .10));

          aimBone('upperarm_r', 'lowerarm_r', v(1, -.52, .15));
          aimBone('lowerarm_r', 'hand_r', v(1, -.18, .08));
          aimBone('hand_r', 'middle_01_r', v(1, -.15, .05));

          for (const finger of ['middle', 'ring', 'pinky']) {
            for (const joint of ['01', '02', '03']) {
              const b = getBone(`${finger}_${joint}_r`);
              if (b) b.rotateZ(pointWeight * (joint === '01' ? -.95 : -1.25));
            }
          }
          const thumb = getBone('thumb_01_r');
          if (thumb) thumb.rotateZ(pointWeight * -.32);
        } else {
          aimBone('upperarm_r', 'lowerarm_r', v(-.18, -1, .02));
          aimBone('lowerarm_r', 'hand_r', v(.07, -1, .16));

          aimBone('upperarm_l', 'lowerarm_l', v(-1, -.52, .15));
          aimBone('lowerarm_l', 'hand_l', v(-1, -.18, .08));
          aimBone('hand_l', 'middle_01_l', v(-1, -.15, .05));

          for (const finger of ['middle', 'ring', 'pinky']) {
            for (const joint of ['01', '02', '03']) {
              const b = getBone(`${finger}_${joint}_l`);
              if (b) b.rotateZ(pointWeight * (joint === '01' ? .95 : 1.25));
            }
          }
          const thumb = getBone('thumb_01_l');
          if (thumb) thumb.rotateZ(pointWeight * .32);
        }
      } else if (yeahWeight > 0.01) {
        // 'Yeah Moment': Hands upward from elbows, knees slightly bent, smiling forward at camera
        character.rotation.y = 0;
        character.position.y = basePosY - yeahWeight * 0.08;
        bendKnees(yeahWeight * 0.38);

        aimBone('upperarm_l', 'lowerarm_l', v(.32, -.45, .12));
        aimBone('lowerarm_l', 'hand_l', v(.12, .92, .20));
        aimBone('hand_l', 'middle_01_l', v(.08, 1, .10));

        aimBone('upperarm_r', 'lowerarm_r', v(-.32, -.45, .12));
        aimBone('lowerarm_r', 'hand_r', v(-.12, .92, .20));
        aimBone('hand_r', 'middle_01_r', v(-.08, 1, .10));

        for (const side of ['l', 'r']) {
          for (const finger of ['index', 'middle', 'ring', 'pinky']) {
            const b = getBone(`${finger}_02_${side}`);
            if (b) b.rotateZ(.35 * yeahWeight);
          }
        }
        const jaw = getBone('jaw');
        if (!reducedMotion && jaw) jaw.rotateZ(0.022 * yeahWeight * (0.8 + 0.2 * Math.sin(time * 6)));
      } else if (cardTransitWalk < 0.01) {
        aimBone('upperarm_r', 'lowerarm_r', v(-.18, -1, .02));
        aimBone('lowerarm_r', 'hand_r', v(.07, -1, .16));
        aimBone('upperarm_l', 'lowerarm_l', v(.18, -1, .02));
        aimBone('lowerarm_l', 'hand_l', v(-.08, -1, .10));
      }
    } else if (p >= 0.93) {
      // Connect / Final card: welcoming celebration
      character.rotation.y = 0;
      aimBone('upperarm_l', 'lowerarm_l', v(.45, -.3, .2));
      aimBone('lowerarm_l', 'hand_l', v(.25, .7, .2));
      aimBone('upperarm_r', 'lowerarm_r', v(-.45, -.3, .2));
      aimBone('lowerarm_r', 'hand_r', v(-.25, .7, .2));
    }

    // 3D Animated Pen (assets/pen.glb)
    if (pen && penLoaded) {
      if (p < 0.93 && activeIdx < 5) {
        pen.visible = true;
        const penMaxDim = pen.userData.maxDim || 1;
        pen.scale.setScalar((mobile ? 0.35 : 0.55) / penMaxDim);
        const revealFactor = THREE.MathUtils.clamp(sliceProgress / 0.74, 0, 1);

        if (revealFactor < 0.98) {
          // Find the currently-writing reveal-word element in the active card
          const activeCard = document.querySelector(`#exp-${activeIdx + 1}`);
          const wordPos = activeCard ? getWritingWordScreenPos(activeCard) : null;
          if (wordPos) {
            const canvas = renderer.domElement;
            const canvasRect = canvas.getBoundingClientRect();
            const ndcX = ((wordPos.x - canvasRect.left) / canvasRect.width) * 2 - 1;
            const ndcY = -((wordPos.y - canvasRect.top) / canvasRect.height) * 2 + 1;
            const targetX = ndcX * viewWidth / 2 + (isCardOnRight ? 0.12 : -0.12);
            const targetY = ndcY * viewHeight / 2 + 0.15;
            // Smooth follow — no time-based oscillation, only scroll-driven
            pen.position.x = THREE.MathUtils.lerp(pen.position.x || targetX, targetX, 0.15);
            pen.position.y = THREE.MathUtils.lerp(pen.position.y || targetY, targetY, 0.15);
          } else {
            const cardSideX = isCardOnRight ? ((mobile ? .74 : .75) - .5) * viewWidth : ((mobile ? .26 : .25) - .5) * viewWidth;
            const penY = basePosY + THREE.MathUtils.lerp(1.70, 1.15, revealFactor);
            pen.position.x = cardSideX;
            pen.position.y = penY;
          }
          pen.position.z = 1.0;
          pen.rotation.x = 0.45;
          pen.rotation.y = isCardOnRight ? 0.25 : -0.25;
          pen.rotation.z = isCardOnRight ? -0.55 : 0.55;
        } else {
          const restSideX = isCardOnRight ? ((mobile ? .88 : .88) - .5) * viewWidth : ((mobile ? .12 : .12) - .5) * viewWidth;
          pen.position.x = THREE.MathUtils.lerp(pen.position.x, restSideX, 0.1);
          pen.position.y = basePosY + 1.35;
          pen.position.z = 0.90;
          pen.rotation.x = 0.25;
          pen.rotation.y = 0;
          pen.rotation.z = isCardOnRight ? -0.28 : 0.28;
        }
      } else {
        pen.visible = false;
      }
    }

    // Dynamic Hand Energy Orb that casts the experience content to the card
    updateHandEnergyOrb(p, activeIdx, isCardOnRight, time);
  } else {
    if (pen) pen.visible = false;
    updateHandEnergyOrb(p, -1, false, time);
  }

  // Apply living human idle motions (weight shifting, head gaze, breathing, arm float)
  applyHumanIdle(time, idleWeight);

  // Apply interactive gestures (hover excited/stop, click startled step-back)
  applyInteractiveGestures(time);

  // Apply position offsets from interactive gestures
  if (interactionState.blend > 0.001) {
    character.position.x += interactionState.pelvisOffset.x;
    character.position.y += interactionState.pelvisOffset.y;
    character.position.z = interactionState.pelvisOffset.z;
  }

  character.updateMatrixWorld(true);
  const jumpHopY = Math.max(0, interactionState.pelvisOffset.y);
  shadow.position.set(character.position.x, basePosY - .016, -.30);
  const baseShadowW = mobile ? (.60 * (p >= 0.93 ? 1.6 : 1)) : .87;
  const baseShadowH = mobile ? (.14 * (p >= 0.93 ? 1.6 : 1)) : .20;
  shadow.scale.set(baseShadowW * (1 - jumpHopY * 0.35), baseShadowH * (1 - jumpHopY * 0.35), 1);
  updateUI(p);
}

function updateUI(p) {
  // 4 Chapters: 0: Meet Zubair, 1: About, 2: Experience, 3: Connect
  const next = p < .18 ? 0 : p < .43 ? 1 : p < .93 ? 2 : 3;
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
  $('#intro').inert = p > .15;
  $('#intro').setAttribute('aria-hidden', String(p > .15));
  $('#greeting').setAttribute('aria-hidden', String(p < .08 || p > .16));

  const showAbout = p >= .25 && p < .35;
  $('#message').inert = !showAbout;
  $('#message').setAttribute('aria-hidden', String(!showAbout));

  // Toggle Experience Deck & Cards (5 roles + 1 connect)
  const showDeck = p >= .42;
  $('#experience-deck').inert = !showDeck;
  $('#experience-deck').setAttribute('aria-hidden', String(!showDeck));

  let activeExp = -1;
  if (p >= .43 && p < .53) activeExp = 0;      // Truey (Current)
  else if (p >= .53 && p < .63) activeExp = 1; // USTAFF360
  else if (p >= .63 && p < .73) activeExp = 2; // CARE
  else if (p >= .73 && p < .83) activeExp = 3; // Embrace-It
  else if (p >= .83 && p < .93) activeExp = 4; // CARE Joget
  else if (p >= .93) activeExp = 5;            // Connect

  // Alternate Experience deck between right, left, and center (for final connect card)
  const deck = $('#experience-deck');
  if (deck) {
    // Cards stay in their columns; clear the stage only while the model walks across.
    const inMobileTransit = mobile && p >= .43 && !readingWindows.some(([start, end]) => p >= start && p <= end);
    deck.classList.toggle('mobile-transit', inMobileTransit);
    if (activeExp === 5) {
      deck.classList.add('pos-center');
      deck.classList.remove('pos-left', 'pos-right');
    } else if (activeExp === 1 || activeExp === 3) {
      deck.classList.add('pos-left');
      deck.classList.remove('pos-right', 'pos-center');
    } else {
      deck.classList.add('pos-right');
      deck.classList.remove('pos-left', 'pos-center');
    }
  }

  const cards = document.querySelectorAll('.exp-card');
  cards.forEach((card, i) => {
    card.inert = i !== activeExp;
    if (i === activeExp) {
      card.classList.add('active');
      card.classList.remove('exit');
      card.removeAttribute('aria-hidden');
    } else if (i < activeExp) {
      card.classList.remove('active');
      card.classList.add('exit');
      card.setAttribute('aria-hidden', 'true');
    } else {
      card.classList.remove('active');
      card.classList.remove('exit');
      card.setAttribute('aria-hidden', 'true');
    }
  });

  // Dynamic company theme colors derived from official logos
  const theme = (activeExp >= 0 && activeExp <= 5) ? COMPANY_THEMES[activeExp] : COMPANY_THEMES[5];
  document.documentElement.style.setProperty('--card-accent', theme.primary);
  document.documentElement.style.setProperty('--card-secondary', theme.secondary);
  document.documentElement.style.setProperty('--card-badge-bg', theme.badgeBg);

  // Apply colors to active card elements (date badge, bullet dots, tech tags)
  if (activeExp >= 0 && activeExp <= 5) {
    const activeCard = cards[activeExp];
    if (activeCard) {
      const badge = activeCard.querySelector('.exp-badge');
      if (badge) badge.style.background = theme.badgeBg;

      const dots = activeCard.querySelectorAll('.bullet-dot');
      dots.forEach(dot => dot.style.background = theme.bulletDot);

      const tags = activeCard.querySelectorAll('.exp-tech-tags span');
      tags.forEach(tag => {
        tag.style.background = theme.tagBg;
        tag.style.color = theme.tagText;
      });
    }
  }

  // Paused GSAP timelines follow scroll in either direction, never elapsed time.
  cardReveals.forEach((reveal, index) => {
    const progress = readingProgress(index, p);
    reveal.timeline.progress(progress);
    reveal.groups.forEach(group => {
      const current = progress >= group.start && progress < group.end;
      if (group.item) group.item.classList.toggle('reading', current);
    });
    // Links are keyboard reachable as soon as their own reveal finishes.
    reveal.links.forEach(({ element, end }) => { element.inert = index !== activeExp || progress < end; });
  });

  // Celebratory confetti burst on Yeah moment of each card
  if (p >= 0.43 && p < 0.93 && activeExp >= 0 && activeExp <= 4) {
    const u = readingProgress(activeExp, p);

    if (u >= 0.86 && u <= 0.96) {
      if (lastConfettiCard !== activeExp) {
        lastConfettiCard = activeExp;
        fireCardConfetti(activeExp);
      }
    } else if (u < 0.80 || u > 0.98) {
      if (lastConfettiCard === activeExp) {
        lastConfettiCard = -1;
      }
    }
  } else {
    lastConfettiCard = -1;
  }

  // Glowing vertical timeline beam tracker with dynamic company colors
  const glowTrack = $('#timeline-glow-track');
  const glowBeam = $('#timeline-glow-beam');
  if (glowTrack && glowBeam) {
    if (p >= 0.41 && p < 0.93) {
      glowTrack.classList.add('active');
      const lineProgress = smooth(0.43, 0.91, p);
      glowBeam.style.height = `${lineProgress * 100}%`;
      glowBeam.style.background = theme.glowBeam;
      glowBeam.style.boxShadow = `0 0 14px ${theme.primary}, 0 0 28px ${theme.secondary}88`;
      const orb = glowBeam.querySelector('.timeline-glow-orb');
      if (orb) {
        orb.style.borderColor = theme.primary;
        orb.style.boxShadow = `0 0 14px ${theme.primary}, 0 0 24px ${theme.secondary}`;
      }
    } else {
      glowTrack.classList.remove('active');
    }
  }

  // Bottom progress bar
  const progressEl = $('#progress');
  if (progressEl) {
    progressEl.style.background = (activeExp >= 0 && activeExp <= 5) ? theme.primary : 'var(--accent)';
  }

  // Dynamic Speech bubble text & visibility
  let speechText = '';
  let speechOpacity = 0;

  if (p >= .08 && p < .17) {
    speechText = 'Hi! I’m Zubair.';
    speechOpacity = smooth(.08, .11, p) * (1 - smooth(.15, .17, p));
  } else if (p >= .26 && p < .35) {
    speechText = 'Take a look.';
    speechOpacity = smooth(.26, .28, p) * (1 - smooth(.33, .35, p));
  } else if (p >= .36 && p < .43) {
    speechText = 'Here we go! 🚀';
    speechOpacity = smooth(.36, .38, p) * (1 - smooth(.42, .43, p));
  } else if (p >= .43 && p < .53) {
    const u = (p - .43) / (.53 - .43);
    speechText = u < .50 ? 'Current Role at Truey 🚀' : 'Thousands of SaaS Users & AI Workflows! ⚡';
    speechOpacity = smooth(.43, .45, p);
  } else if (p >= .53 && p < .63) {
    const u = (p - .53) / (.63 - .53);
    speechText = u < .50 ? 'Healthcare at USTAFF360 🏥' : '50,000+ Daily Users! 🎯';
    speechOpacity = 1;
  } else if (p >= .63 && p < .73) {
    const u = (p - .63) / (.73 - .63);
    speechText = u < .50 ? 'Research & Eng at CARE 🔬' : '15+ Core Modules Modernized! 💼';
    speechOpacity = 1;
  } else if (p >= .73 && p < .83) {
    const u = (p - .73) / (.83 - .73);
    speechText = u < .50 ? 'React 17 at Embrace-It ⚙️' : 'Tech debt cut by 40%! 📈';
    speechOpacity = 1;
  } else if (p >= .83 && p < .93) {
    const u = (p - .83) / (.93 - .83);
    speechText = u < .50 ? 'Enterprise Apps at CARE 🏛️' : 'Production-ready workflows! ✨';
    speechOpacity = 1;
  } else if (p >= .93) {
    speechText = 'Let’s build something great together! 🤝';
    speechOpacity = smooth(.93, .95, p);
  }

  // Override with interactive gesture speech bubble if active
  if (interactionState.activeGesture && interactionState.blend > 0.05) {
    speechText = interactionState.speechText;
    speechOpacity = Math.max(speechOpacity, THREE.MathUtils.clamp(interactionState.blend * 1.5, 0, 1));
    $('#speech').classList.add('interaction-active');
  } else {
    $('#speech').classList.remove('interaction-active');
  }

  $('#speech').textContent = speechText;
  $('#speech').style.opacity = speechOpacity;
  $('#speech').style.visibility = speechOpacity > .01 ? 'visible' : 'hidden';

  // Apply matching brand color to speech bubble
  if (activeExp >= 0 && activeExp <= 5 && speechOpacity > 0.01) {
    $('#speech').style.background = theme.speechBg;
    $('#speech').style.color = theme.speechColor;
    $('#speech').style.boxShadow = `0 6px 22px ${theme.primary}55`;
  } else {
    $('#speech').style.background = '';
    $('#speech').style.color = '';
    $('#speech').style.boxShadow = '';
  }

  // Anchor speech dynamically with variable direction based on Zubair's head position
  const headBone = getBone('head');
  if (headBone) {
    const head = headBone.getWorldPosition(v(0, 0)).project(camera);
    const headScreenX = (head.x * .5 + .5) * 100;
    const headScreenY = (-head.y * .5 + .5) * 100;
    const speechEl = $('#speech');
    speechEl.classList.remove('speech-tail-left', 'speech-tail-right', 'speech-tail-center');

    if (head.x > 0.08) {
      // Model on the right: bubble sits to the left of head with tail pointing right toward him
      speechEl.classList.add('speech-tail-right');
      speechEl.style.left = `${THREE.MathUtils.clamp(headScreenX - (mobile ? 3 : 2), 12, 94)}%`;
    } else if (head.x < -0.08) {
      // Model on the left: bubble sits to the right of head with tail pointing left toward him
      speechEl.classList.add('speech-tail-left');
      speechEl.style.left = `${THREE.MathUtils.clamp(headScreenX + (mobile ? 3 : 2), 6, 88)}%`;
    } else {
      // Model centered: bubble sits centered directly above head
      speechEl.classList.add('speech-tail-center');
      speechEl.style.left = `${THREE.MathUtils.clamp(headScreenX, 15, 85)}%`;
    }
    speechEl.style.top = `${THREE.MathUtils.clamp(headScreenY - (mobile ? 5 : 7), 6, 88)}%`;
    if (mobile && deck.classList.contains('mobile-transit')) speechEl.style.visibility = 'hidden';
  }

  // Keep the final BS Software Engineering panel below shoulders, centered with Zubair's head and shoulders visible above
  if (activeExp === 5 && !mobile) {
    const shoulder = getBone('spine_03');
    if (shoulder) {
      const projected = shoulder.getWorldPosition(v(0, 0)).project(camera);
      const stageHeight = $('#scene').clientHeight;
      const cardHeight = $('#exp-6').offsetHeight;
      const shoulderY = (-projected.y * .5 + .5) * stageHeight + (mobile ? 48 : 82);
      deck.style.setProperty('--connect-top', `${Math.min(shoulderY, stageHeight - cardHeight - 35)}px`);
    }
  }
  $('#speech').classList.toggle('connect-speech', activeExp === 5);

  const walkProgress = smooth(.15, .26, p);
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
  const sceneEl = $('#scene');
  const rect = sceneEl ? sceneEl.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
  const width = rect.width || window.innerWidth || 1200;
  const height = rect.height || window.innerHeight || 800;
  mobile = width <= 600;
  viewHeight = mobile ? 4.4 : 4.0;
  viewWidth = viewHeight * (height > 0 ? width / height : 1.5);
  camera.left = -viewWidth / 2; camera.right = viewWidth / 2;
  camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  if (renderer) {
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  }
  if (character) {
    const origH = character.userData.originalHeight;
    const h = (typeof origH === 'number' && origH > 0.05) ? origH : 1.8;
    character.scale.setScalar((mobile ? Math.min(2.5, viewWidth * .95) : 2.6) / h);
    if (shadow) shadow.scale.set(mobile ? .60 : .87, mobile ? .14 : .20, 1);
  }
  measureMobileLayout();
  if (!mobile) document.querySelectorAll('.exp-body').forEach(body => body.removeAttribute('tabindex'));
}

function makeTimeline() {
  const gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);
  timeline = gsap.timeline({ scrollTrigger: {
    trigger: '#experience', start: 'top top', end: 'bottom bottom', scrub: reducedMotion ? true : .65,
    invalidateOnRefresh: true,
  }});
  // Extend only reading sections; preserve the intro, jump and walking distances.
  let sceneStart = 0, cursor = 0;
  scrollSegments = [];
  const addSegment = (sceneEnd, duration) => {
    scrollSegments.push({ start: sceneStart, end: sceneEnd, time: cursor, duration });
    timeline.to(motion, { progress: sceneEnd, duration, ease: 'none' }, cursor);
    cursor += duration;
    sceneStart = sceneEnd;
  };
  readingWindows.forEach(([start, end], index) => {
    if (start > sceneStart) addSegment(start, start - sceneStart);
    const points = document.querySelectorAll(`#exp-${index + 1} .exp-bullets li`).length;
    addSegment(end, index === 5 ? .32 : .10 + points * .065);
  });
  $('#experience').style.height = `${(1 + 7.8 * cursor) * 100}svh`;
  timeline.to('#progress', { scaleX: 1, duration: cursor, ease: 'none' }, 0)
    .to('#intro', { autoAlpha: 0, y: reducedMotion ? 0 : -24, duration: .06 }, .07)
    .to('.backdrop-word', { opacity: .45, xPercent: -15, duration: .6 }, .10)
    .to('#greeting', { autoAlpha: 1, y: 0, duration: .04 }, .08)
    .to('#greeting', { autoAlpha: 0, y: reducedMotion ? 0 : -20, duration: .04 }, .15)
    .to('#message', { autoAlpha: 1, y: 0, rotate: 0, duration: .06, ease: 'power2.out' }, .25)
    .to('#message', { autoAlpha: 0, y: reducedMotion ? 0 : -30, duration: .05 }, .34);
}

function goTo(progress) {
  const distance = $('#experience').offsetHeight - innerHeight;
  const segment = scrollSegments.find(part => progress <= part.end) || scrollSegments.at(-1);
  const time = segment ? segment.time + segment.duration * THREE.MathUtils.clamp((progress - segment.start) / (segment.end - segment.start), 0, 1) : progress;
  const scrollProgress = timeline ? time / timeline.duration() : progress;
  window.scrollTo({ top: Math.max(0, distance * scrollProgress), behavior: reducedMotion ? 'instant' : 'smooth' });
}
$('#begin').addEventListener('click', () => goTo(.28));
$('#replay').addEventListener('click', () => goTo(0));
$('.brand').addEventListener('click', (event) => { event.preventDefault(); goTo(0); });
document.querySelectorAll('[data-step]').forEach(button => {
  button.addEventListener('click', () => goTo([0, .28, .46, .96][Number(button.dataset.step)]));
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

function getNDCCoordinates(clientX, clientY) {
  if (!renderer || !renderer.domElement) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
}

function onPointerMove(e) {
  if (!renderer || !character) return;
  if (e.pointerType === 'touch') return;
  // If pointer is over interactive UI elements (buttons, links, exp cards), ignore model hover
  const isOverUI = Boolean(e.target.closest('button, a, input, select, textarea, .sound-button, .round-link, .chapters, .exp-card, .contact-pill'));
  if (isOverUI) {
    if (interactionState.isHovered) {
      interactionState.isHovered = false;
      document.body.classList.remove('model-hovered');
    }
    return;
  }

  const ndc = getNDCCoordinates(e.clientX, e.clientY);
  if (!ndc) return;

  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(character, true);
  const isHit = hits.length > 0;

  if (isHit) {
    if (!interactionState.isHovered) {
      interactionState.isHovered = true;
      document.body.classList.add('model-hovered');
      triggerHoverReaction();
    }
  } else {
    if (interactionState.isHovered) {
      interactionState.isHovered = false;
      document.body.classList.remove('model-hovered');
    }
  }
}

function onPointerDown(e) {
  if (!character || !renderer) return;
  // If clicking on UI controls, do not trigger character gesture
  if (e.target.closest('button, a, input, select, textarea, .sound-button, .round-link, .chapters, .exp-card, .contact-pill')) return;

  const ndc = getNDCCoordinates(e.clientX, e.clientY);
  if (!ndc) return;

  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(character, true);
  if (hits.length > 0) {
    const now = performance.now();
    const timeSinceLastClick = now - lastModelClickTime;
    lastModelClickTime = now;

    // Strict double-click requirement: only trigger when two clicks occur within 70ms - 380ms
    // Ignore single clicks and rapid spam clicks so model never gets spammed or hidden
    if (timeSinceLastClick >= 70 && timeSinceLastClick <= 380) {
      if (!interactionState.activeGesture) {
        triggerGesture('step_back');
      }
    }
  }
}

function onPointerLeave() {
  if (interactionState.isHovered) {
    interactionState.isHovered = false;
    document.body.classList.remove('model-hovered');
  }
}

function triggerHoverReaction() {
  const now = performance.now();
  if (interactionState.activeGesture || now < interactionState.cooldownUntil) return;

  // Alternate between 'excited' and 'stop'
  const gestureType = (interactionState.hoverVariant % 2 === 0) ? 'excited' : 'stop';
  interactionState.hoverVariant++;
  triggerGesture(gestureType);
}

function triggerGesture(type) {
  interactionState.activeGesture = type;
  interactionState.progress = 0;
  interactionState.blend = 0;
  interactionState.pelvisOffset.set(0, 0, 0);

  if (type === 'excited') {
    interactionState.duration = 1.45;
    interactionState.speechText = 'Glad you stopped by! 🎉';
  } else if (type === 'stop') {
    interactionState.duration = 1.50;
    interactionState.speechText = 'Wait a second, check this out! ✋';
  } else if (type === 'step_back') {
    interactionState.duration = 1.65;
    interactionState.speechText = 'Hey, don’t poke the dev! ⚡';
  }

  speak(interactionState.speechText);
}

function updateInteraction(delta) {
  if (!interactionState.activeGesture) {
    interactionState.blend = 0;
    interactionState.pelvisOffset.set(0, 0, 0);
    return;
  }

  interactionState.progress += delta;
  const gt = interactionState.progress / interactionState.duration;

  if (gt >= 1.0) {
    interactionState.activeGesture = null;
    interactionState.progress = 0;
    interactionState.blend = 0;
    interactionState.pelvisOffset.set(0, 0, 0);
    interactionState.cooldownUntil = performance.now() + 450;
    return;
  }

  let b = 1;
  if (gt < 0.18) {
    b = smooth(0, 0.18, gt);
  } else if (gt > 0.78) {
    b = 1 - smooth(0.78, 1.0, gt);
  }
  interactionState.blend = b;
}

function initInteractions() {
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true });
}

function updateHandEnergyOrb(p, cardIndex, isCardOnRight, time) {
  const orbEl = $('#hand-energy-orb');
  if (!orbEl) return;

  if (p < 0.43 || p >= 0.93 || cardIndex < 0 || cardIndex > 4) {
    orbEl.style.opacity = '0';
    orbEl.style.visibility = 'hidden';
    return;
  }

  const u = readingProgress(cardIndex, p);
  // Orb launches from hand during initial reading arrival window (u in [0.002, 0.16])
  if (u >= 0.002 && u <= 0.16) {
    orbEl.style.visibility = 'visible';
    const handBone = isCardOnRight ? getBone('hand_r') : getBone('hand_l');
    let handScreenX = isCardOnRight ? 34 : 66;
    let handScreenY = 46;

    if (handBone) {
      const pos = handBone.getWorldPosition(v(0, 0, 0)).project(camera);
      handScreenX = (pos.x * 0.5 + 0.5) * 100;
      handScreenY = (-pos.y * 0.5 + 0.5) * 100;
    }

    const targetCardX = isCardOnRight ? (mobile ? 50 : 72) : (mobile ? 50 : 27.5);
    const targetCardY = mobile ? 38 : 34;

    const orbT = THREE.MathUtils.clamp(u / 0.13, 0, 1);
    const curX = THREE.MathUtils.lerp(handScreenX, targetCardX, orbT);
    const arcLift = Math.sin(orbT * Math.PI) * (mobile ? 5 : 8);
    const curY = THREE.MathUtils.lerp(handScreenY, targetCardY, orbT) - arcLift;

    const theme = COMPANY_THEMES[cardIndex] || COMPANY_THEMES[0];
    orbEl.style.setProperty('--card-accent', theme.primary);
    orbEl.style.setProperty('--card-secondary', theme.secondary);

    let scale = 1;
    let opacity = 1;
    if (orbT < 0.18) {
      scale = smooth(0, 0.18, orbT) * 1.15;
      opacity = smooth(0, 0.15, orbT);
    } else if (orbT > 0.80) {
      const popT = (orbT - 0.80) / 0.20;
      scale = 1.15 + popT * 1.6;
      opacity = 1 - popT;
    } else {
      scale = 1.05 + Math.sin(time * 24) * 0.15;
      opacity = 1;
    }

    orbEl.style.opacity = String(opacity);
    orbEl.style.transform = `translate3d(${curX}vw, ${curY}vh, 0) scale(${scale})`;
  } else {
    orbEl.style.opacity = '0';
    orbEl.style.visibility = 'hidden';
  }
}

function fireCardConfetti(cardIndex) {
  if (reducedMotion) return;
  const isRight = (cardIndex % 2 === 0);
  const charX = isRight ? 0.28 : 0.72;
  const theme = COMPANY_THEMES[cardIndex] || COMPANY_THEMES[5];
  if (typeof window.confetti === 'function') {
    window.confetti({
      particleCount: 85,
      spread: 70,
      startVelocity: 44,
      origin: { x: charX, y: 0.38 },
      colors: theme.confetti
    });
  }
}

function initWordReveal() {
  const cards = document.querySelectorAll('#experience-deck .exp-card');
  cardReveals = [];
  const directions = [[-110, 0, -12], [0, -85, 9], [115, 0, 12], [0, 85, -8], [-80, -65, -10], [85, 60, 10]];

  cards.forEach((card, index) => {
    const reveal = { timeline: window.gsap.timeline({ paused: true }), groups: [], links: [] };
    reveal.timeline.to({}, { duration: 1 }, 0);
    const addWords = (element, start, end, item = null) => {
      if (!element) return;
      const words = [];
      wrapWordsInElement(element, words);
      const duration = end - start;
      reveal.groups.push({ start, end, item });
      reveal.timeline.fromTo(words,
        { opacity: .14, y: reducedMotion ? 0 : 3, filter: reducedMotion ? 'none' : 'blur(1.5px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: duration * .22, stagger: { amount: duration * .78 }, ease: 'none' }, start);
    };

    addWords(card.querySelector('.exp-role'), .02, index === 5 ? .20 : .12);
    const bullets = Array.from(card.querySelectorAll('.exp-bullets li'));
    bullets.forEach((item, point) => {
      const slot = .58 / bullets.length;
      const start = .16 + point * slot;
      // Target the actual nested text span, preserving its bullet and typography.
      addWords(item.querySelector('.exp-text'), start, start + slot - .025, item);
      reveal.timeline.fromTo(item.querySelector('.bullet-dot'), { opacity: .14 }, { opacity: 1, duration: .025, ease: 'none' }, start);
    });
    const summary = card.querySelector('.exp-summary');
    const summaryVariants = summary?.querySelectorAll('.contact-summary-desktop, .contact-summary-mobile');
    if (summaryVariants?.length) {
      // Both variants use the same reading window, including after viewport changes.
      summaryVariants.forEach(variant => addWords(variant, .25, .53));
    } else {
      addWords(summary, .25, .53);
    }

    const tags = Array.from(card.querySelectorAll('.exp-tech-tags > span'));
    tags.forEach((tag, tagIndex) => {
      const [x, y, rotation] = directions[tagIndex % directions.length];
      const start = .76 + tagIndex * (.12 / Math.max(1, tags.length - 1));
      reveal.timeline.fromTo(tag,
        { autoAlpha: 0, x: reducedMotion ? 0 : x, y: reducedMotion ? 0 : y, rotation: reducedMotion ? 0 : rotation, scale: reducedMotion ? 1 : .75 },
        { autoAlpha: 1, x: 0, y: 0, rotation: 0, scale: 1, duration: .10, ease: reducedMotion ? 'none' : 'back.out(1.5)' }, start);
    });

    card.querySelectorAll('.contact-pill').forEach((element, linkIndex) => {
      const start = .57 + linkIndex * .085;
      reveal.timeline.fromTo(element,
        { autoAlpha: 0, y: reducedMotion ? 0 : 12 },
        { autoAlpha: 1, y: 0, duration: .07, ease: 'power2.out' }, start);
      reveal.links.push({ element, end: start + .07 });
    });
    cardReveals.push(reveal);
  });
}

function wrapWordsInElement(element, wordList) {
  // Replace text nodes only: preserve summary variants, emphasis and accessible markup.
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach(node => {
    if (node.parentElement.closest('.reveal-word')) return;
    const fragment = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).filter(Boolean).forEach(part => {
      if (/^\s+$/.test(part)) {
        fragment.append(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = 'reveal-word';
        span.textContent = part;
        fragment.append(span);
      }
    });
    node.replaceWith(fragment);
  });
  wordList.push(...element.querySelectorAll('.reveal-word'));
}

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
        const rawName = object.name;
        const cleanName = rawName.replace(/^rp_nathan_animated_\d+_walking_/i, '').replace(/^rp_nathan_animated_003_walking_/i, '');
        bones.set(cleanName, object);
        boneLookup.set(cleanName, object);
        boneLookup.set(cleanName.toLowerCase(), object);
        boneLookup.set(rawName, object);
        boneLookup.set(rawName.toLowerCase(), object);
        rest.set(cleanName, object.quaternion.clone());
        restPositions.set(cleanName, object.position.clone());
        standingQuats.set(cleanName, new THREE.Quaternion());
      }
      if (object.isMesh) { object.frustumCulled = false; }
    });
    console.log('Available character bones:', Array.from(bones.keys()));
    window.__bones = Array.from(bones.keys());

    for (const name of ['head', 'jaw', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r']) {
      if (!getBone(name)) throw new Error(`The character skeleton is missing ${name}. Restore the supplied 3D GLB model.`);
    }
    if (gltf.animations && gltf.animations.length > 0) {
      walkClip = prepareWalkClip(gltf.animations[0]);
      mixer = new THREE.AnimationMixer(character);
      walkAction = mixer.clipAction(walkClip);
      walkAction.play();
    }
    character.userData.originalHeight = new THREE.Box3().setFromObject(character).getSize(v(0, 0)).y;
    scene.add(character);

    // Load 3D animated pen for writing word-by-word reveal in experience section
    try {
      const penGltf = await new GLTFLoader().loadAsync('./assets/pen.glb');
      pen = penGltf.scene;
      pen.traverse(obj => {
        if (obj.isMesh) {
          obj.frustumCulled = false;
        }
      });
      const penBox = new THREE.Box3().setFromObject(pen);
      const penSize = penBox.getSize(v(0, 0, 0));
      const maxDim = Math.max(penSize.x, penSize.y, penSize.z) || 1;
      const penScale = (mobile ? 0.35 : 0.55) / maxDim;
      pen.scale.setScalar(penScale);
      pen.userData.maxDim = maxDim;
      pen.visible = false;
      scene.add(pen);
      penLoaded = true;
    } catch (penErr) {
      console.warn('Could not load pen.glb:', penErr);
    }

    // Hit-testing cylinder for robust raycasting on hover and click
    const charHeight = (typeof character.userData.originalHeight === 'number' && character.userData.originalHeight > 0.1)
      ? character.userData.originalHeight
      : 1.8;
    const hitGeo = new THREE.CylinderGeometry(0.42, 0.42, charHeight, 12);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.y = charHeight / 2;
    hitMesh.name = 'hit_cylinder';
    character.add(hitMesh);

    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(82,95,54,0.24)'); gradient.addColorStop(.42, 'rgba(122,139,88,0.12)'); gradient.addColorStop(1, 'rgba(122,139,88,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
    scene.add(shadow);
    prepareExperienceLayout(); resize(); makeTimeline(); initWordReveal(); measureMobileLayout();
    document.body.dataset.ready = 'true';
    window.gsap.to('#loader', { autoAlpha: 0, duration: .5, onComplete: () => $('#loader').style.display = 'none' });
    window.ScrollTrigger.refresh();
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const time = clock.getElapsedTime();
      if (document.hidden) return;
      const delta = lastFrameTime > 0 ? Math.min(time - lastFrameTime, 0.08) : 0.016;
      lastFrameTime = time;
      try {
        updateInteraction(delta);
      } catch (interactionErr) {
        console.error('Error in updateInteraction:', interactionErr);
      }
      try {
        pose(time);
      } catch (err) {
        console.error('Error in pose:', err);
      }
      try {
        renderer.render(scene, camera);
      } catch (renderErr) {
        console.error('Error in renderer.render:', renderErr);
      }
    });
    window.addEventListener('resize', resize);
    initInteractions();
    document.fonts.ready.then(() => { measureMobileLayout(); window.ScrollTrigger.refresh(); });
  } catch (error) {
    console.error(error);
    showError(error.message.includes('WebGL') ? 'This browser could not start the 3D view. Try a browser with WebGL and hardware acceleration enabled.' : `Zubair couldn’t load. Open this app through the included local server and check that assets/nathan.glb is present. ${error.message}`);
  }
}

// Modules and deferred scripts can finish in different orders in some browsers.
if (document.readyState === 'complete') init();
else window.addEventListener('load', init, { once: true });
