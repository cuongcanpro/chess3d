import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as X from './xiangqi.js';
import { Puppet } from './rig.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ======================================================================
// Cấu hình
// ======================================================================
const S = 0.085;                       // khoảng cách giữa 2 giao điểm
const BOARD_W = 8 * S + 0.16, BOARD_D = 9 * S + 0.16;
const TABLE_R = 0.82, TABLE_Y = 0.70;  // mặt bàn đá
const BOARD_Y = TABLE_Y + 0.03;        // mặt bàn cờ gỗ
const PIECE_R = S * 0.46, PIECE_H = 0.024;
const MODEL_FRONT = 0;                 // hướng mặt trước của GLB (+Z)

const CHARS = {
  // đứng chơi cờ: model newman/ (đứng, tay buông), gắn xương bằng tools/blender_rig.py + rig_stand.json
  1: { file: 'newMan1', name: 'Ông Ba Râu', pos: [0, 0, 1.06], h: 1.6, role: 'r' },
  2: { file: 'newMan2', name: 'Bác Tư Mũ Nồi', pos: [0, 0, -1.06], h: 1.62, role: 'b' },
  3: { file: 'newMan3', name: 'Chú Năm Hói', pos: [-1.22, 0, -0.62], h: 1.55, role: 'fan', bet: 'b', note: 'Cược Bác Tư thắng', color: '#2fae62' },
  4: { file: 'newMan4', name: 'Ông Sáu Kính', pos: [1.24, 0, -0.5], h: 1.6, role: 'fan', bet: 'r', note: 'Quân sư của Ông Ba', color: '#f07a24' },
  5: { file: 'newMan5', name: 'Bác Bảy Cười', pos: [-1.12, 0, 0.78], h: 1.56, role: 'fan', bet: 'r', note: 'Chỉ đến uống trà', color: '#4f7ce0' },
};

const LINES = {
  idle: ['Quan kỳ bất ngữ chân quân tử nghen…', 'Trà nguội rồi kìa mấy ông!', 'Ván này căng à nha.', 'Pháo đầu đi ông ơi!', 'Đi lẹ lẹ coi, tui đợi muốn ngủ.', 'Hồi trẻ tui đánh hay hơn vầy nhiều.', 'Coi chừng con Mã kìa!'],
  capture: ['Trời đất, ăn luôn!', 'Hay! Nước này hay!', 'Úi, mất quân rồi!', 'Thấy chưa, tui nói rồi mà!', 'Ăn ngon ơ!'],
  captureBig: ['Trời ơi, mất Xe rồi!!', 'Ăn Xe! Ván này xong rồi!', 'Chết cha, con Xe!'],
  check: ['Chiếu! Chiếu!', 'Tướng chạy đâu cho thoát!', 'Coi chừng bí nha!'],
  oppThink: ['Hừm… để tôi tính coi.', 'Nước này khó à nha…', 'Từ từ, đừng hối.', 'Để coi ông tính gì đây.'],
  oppMove: ['Đây, đi nè!', 'Tới ông đó.', 'Hehe.', 'Đỡ nổi không?'],
  // ----- trọc nhau ({X} = người bị trọc, {P} = quân vừa mất)
  gloat: [ // bên ăn quân khoe
    'Con {P} này tui xin nha, con ngan con ngỗng!',
    'Đứng đó cho tui ăn hả? Cờ vịt quá trời!',
    'Quân cho không à? Cảm ơn {X} nha!',
    'Ăn {P} ngon ơ! Cờ này chưa ra giang hồ được đâu {X} ơi!',
    'Nuôi con {P} mập vậy là để tui làm thịt hả?',
    'Giữ có con {P} mà giữ không nổi!',
    'Hehe, mồi ngon dâng tận miệng!',
    'Đánh vậy về nhà chăn vịt đi {X}!',
  ],
  retort: [ // bên bị ăn cãi lại
    'Tui thí đó! Thí quân lấy thế, ông biết gì!',
    'Ăn đi, ăn rồi mắc nghẹn cho coi!',
    'Ăn được con {P} chứ chưa chắc ăn được ván đâu!',
    'Ông may thôi, đừng có vênh váo!',
    'Cho ông ăn đó, nghèo mà ham!',
    'Từ từ, tui gài bẫy ông rồi đó.',
    'Trời ơi, hoa mắt đi lộn…',
    'Lỡ tay! Lỡ tay thôi mà!',
  ],
  heckle: [ // khán giả trọc bên bị ăn
    'Toàn cờ vịt!',
    'Con ngan con ngỗng này, để người ta ăn {P} ngon lành!',
    'Cờ này chưa ra giang hồ được!',
    'Đánh như gà mắc tóc!',
    '{X} ơi, cờ làng cờ xóm thôi!',
    'Đi vậy con nít nó cũng cười!',
    'Tui nói rồi mà không nghe, giờ mất {P} nha!',
    'Cao thủ cờ tướng… trong xóm!',
    'Tập thêm chục năm nữa rồi ra đây nha {X}!',
  ],
  bigGloat: [ // mất Xe
    'Mất Xe rồi còn đánh đấm gì nữa, xin thua đi {X}!',
    'Xe mà cũng dâng, đúng là cờ vịt chính hiệu!',
    'Thí Xe? Thí kiểu này thì thí luôn ván!',
    'Xe đi đâu mất tiêu rồi {X}? Con ngan con ngỗng!',
  ],
  revenge: [ // vừa bị trọc giờ ăn lại
    'Thấy chưa? Giờ ai cờ vịt?',
    'Ăn lại rồi nha! Ngan ngỗng gì đâu!',
    'Hồi nãy ai nói tui chưa ra giang hồ?',
    'Có qua có lại mới toại lòng nhau nha {X}!',
  ],
  hurry: [ // người đang chờ hối người đang nghĩ
    'Nghĩ gì lâu vậy {X}? Cờ vịt mà bày đặt suy nghĩ!',
    'Đi lẹ đi, ngan ngỗng gì mà chậm rì!',
    'Ngủ gật rồi hả {X}?',
    'Nghĩ nát óc cũng vậy thôi!',
  ],
  dumb: [ // chê nước đi dở
    'Nước này đi chi vậy trời?',
    'Đi kiểu này là cờ vịt rồi {X} ơi!',
    'Ông đánh cờ hay ông đánh bài vậy?',
    'Con ngan con ngỗng, đi vậy ai đi!',
  ],
};
const fillLine = (str, v) => str.replace(/\{(\w)\}/g, (_, k) => v[k] ?? '');
function sayLine(id, list, v = {}, ms = 2800) { bubble(id, fillLine(pick(list), v), ms); }
const headOf = id => new THREE.Vector3(CHARS[id].pos[0], CHARS[id].h * 0.85, CHARS[id].pos[2]);

// ======================================================================
// Renderer / Scene / Camera
// ======================================================================
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const FOG = new THREE.Color('#dfeedd');
scene.fog = new THREE.Fog(FOG, 16, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 200);
camera.position.set(9, 6.5, 10);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 1.1;
controls.maxDistance = 11;
controls.maxPolarAngle = 1.42;
controls.enabled = false;

// ---------- Ánh sáng: chiều muộn
scene.add(new THREE.HemisphereLight('#e3f4ff', '#6d8a4a', 1.1));
const sun = new THREE.DirectionalLight('#fff0d2', 2.6);
sun.position.set(5.5, 9, 4.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const fill = new THREE.DirectionalLight('#bfe0ff', 0.5);
fill.position.set(-6, 4, -3);
scene.add(fill);

// ======================================================================
// Texture helpers
// ======================================================================
function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#74b04c'; g.fillRect(0, 0, w, h);
  const cols = ['#5f9d3c', '#81bd56', '#8cc85f', '#548f35', '#6aa846'];
  for (let i = 0; i < 5000; i++) {
    g.strokeStyle = pick(cols); g.lineWidth = 1.2;
    const x = Math.random() * w, y = Math.random() * h, l = rand(2, 6);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-1.5, 1.5), y - l); g.stroke();
  }
}, 34);

const paverTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#b9a88c'; g.fillRect(0, 0, w, h);
  const n = 8, s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const off = (y % 2) * s / 2;
    const l = rand(70, 84);
    g.fillStyle = `hsl(${rand(30, 40)}, ${rand(14, 24)}%, ${l}%)`;
    g.fillRect(x * s + off + 3, y * s + 3, s - 6, s - 6);
    g.fillRect(x * s + off + 3 - w, y * s + 3, s - 6, s - 6);
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(80,60,40,${rand(0.03, 0.09)})`; g.fillRect(rand(0, w), rand(0, h), 2, 2); }
}, 5);

// ======================================================================
// Môi trường: trời, đất, cây, ghế, đèn, hồ…
// ======================================================================
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#58ade0') }, mid: { value: new THREE.Color('#b9e1f1') }, bot: { value: new THREE.Color('#fbe7c3') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top, mid, bot; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h)); c = mix(bot, c, smoothstep(-0.05, 0.16, h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(sky);
}

const M = {
  trunk: new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.95 }),
  trunkDark: new THREE.MeshStandardMaterial({ color: '#5e3f27', roughness: 0.95 }),
  leaves: ['#4f9a3a', '#5fae43', '#3f8a34', '#74bb4c', '#88c45a'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true })),
  stone: new THREE.MeshStandardMaterial({ color: '#a9a49b', roughness: 0.85 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: '#8b867d', roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: '#a56a3a', roughness: 0.7 }),
  iron: new THREE.MeshStandardMaterial({ color: '#2f4a3c', roughness: 0.5, metalness: 0.4 }),
  white: new THREE.MeshStandardMaterial({ color: '#f5f1e6', roughness: 0.4 }),
  redPlastic: new THREE.MeshStandardMaterial({ color: '#d8352a', roughness: 0.45 }),
};

function shadowed(o) { o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }

// Mặt đất
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64), new THREE.MeshStandardMaterial({ map: paverTex, roughness: 0.9 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.006; plaza.receiveShadow = true;
  scene.add(plaza);
  const curb = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.06, 6, 80), M.stone);
  curb.rotation.x = -Math.PI / 2; curb.position.y = 0.02; curb.receiveShadow = true;
  scene.add(curb);
  // lối đi
  const pathMat = new THREE.MeshStandardMaterial({ map: paverTex.clone(), roughness: 0.9 });
  pathMat.map.repeat.set(1.5, 12);
  for (const [x, z, ry] of [[0, -11, 0], [9, 2.5, Math.PI / 2 - 0.25]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2, 16), pathMat);
    p.rotation.set(-Math.PI / 2, 0, ry); p.position.set(x, 0.004, z); p.receiveShadow = true;
    scene.add(p);
  }
}

function tree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.17 * s, 1.7 * s, 7), M.trunk);
  trunk.position.y = 0.85 * s; g.add(trunk);
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const r = rand(0.6, 0.95) * s;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), pick(M.leaves));
    b.position.set(rand(-0.5, 0.5) * s, rand(1.9, 2.6) * s, rand(-0.5, 0.5) * s);
    b.rotation.set(rand(0, 3), rand(0, 3), 0);
    g.add(b);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rand(0, Math.PI * 2);
  return shadowed(g);
}

// Cây đa lớn, rễ phụ thả xuống, treo lồng chim
const banyan = new THREE.Group();
{
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.75, 3.0, 10), M.trunkDark);
  trunk.position.y = 1.5; banyan.add(trunk);
  for (const [ang, tilt] of [[0, 0.9], [2.1, 0.8], [4.2, 1.0], [1.0, 1.1], [3.2, 0.7]]) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 2.4, 7), M.trunkDark);
    br.position.set(Math.cos(ang) * 0.9, 3.3, Math.sin(ang) * 0.9);
    br.rotation.set(Math.sin(ang) * tilt, 0, -Math.cos(ang) * tilt);
    banyan.add(br);
  }
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0.3, 2.6);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.0, 1.6), 1), pick(M.leaves));
    b.position.set(Math.cos(a) * d, rand(3.6, 4.8), Math.sin(a) * d);
    b.scale.y = 0.75;
    banyan.add(b);
  }
  const rootMat = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 1 });
  for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2), d = rand(1.0, 2.6), len = rand(1.6, 3.2);
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, len, 4), rootMat);
    root.position.set(Math.cos(a) * d, 3.5 - len / 2, Math.sin(a) * d);
    banyan.add(root);
  }
  banyan.position.set(-3.6, 0, -3.4);
  scene.add(shadowed(banyan));
}

// Lồng chim treo
const birdCage = new THREE.Group();
let bird;
{
  const barMat = new THREE.MeshStandardMaterial({ color: '#c9974f', roughness: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20), M.wood);
  birdCage.add(base);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 3), barMat);
    bar.position.set(Math.cos(a) * 0.16, 0.17, Math.sin(a) * 0.16);
    birdCage.add(bar);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c9974f', wireframe: true }));
  dome.position.y = 0.34; birdCage.add(dome);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12), barMat);
  hook.position.y = 0.53; birdCage.add(hook);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.2, 3), M.trunkDark);
  string.position.y = 1.15; birdCage.add(string);
  bird = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: '#f2c23a', roughness: 0.5 }));
  body.scale.set(1, 0.9, 1.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), body.material);
  head.position.set(0, 0.04, 0.04);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.025, 6), new THREE.MeshStandardMaterial({ color: '#e0731e' }));
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.04, 0.075);
  const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 4), M.wood);
  perch.rotation.z = Math.PI / 2; perch.position.y = -0.045;
  bird.add(body, head, beak, perch);
  bird.position.y = 0.16;
  birdCage.add(bird);
  birdCage.position.set(-2.25, 1.75, -2.2);
  scene.add(shadowed(birdCage));
}

function bench(x, z, ry) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.11), M.wood);
    s.position.set(0, 0.45, -0.15 + i * 0.13); g.add(s);
  }
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.035), M.wood);
    s.position.set(0, 0.62 + i * 0.16, -0.24); s.rotation.x = -0.15; g.add(s);
  }
  for (const sx of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.42), M.iron);
    leg.position.set(sx, 0.225, -0.03); g.add(leg);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), M.iron);
    back.position.set(sx, 0.7, -0.26); back.rotation.x = -0.15; g.add(back);
  }
  g.position.set(x, 0, z); g.rotation.y = ry;
  scene.add(shadowed(g));
}

const lampGlows = [];
function lamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 3.2, 8), M.iron);
  pole.position.y = 1.6; g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.25, 8), M.iron);
  base.position.y = 0.12; g.add(base);
  const glowMat = new THREE.MeshStandardMaterial({ color: '#fff4cc', emissive: '#ffcf70', emissiveIntensity: 0.6 });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.32, 6), glowMat);
  head.position.y = 3.35; g.add(head);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 6), M.iron);
  cap.position.y = 3.6; g.add(cap);
  lampGlows.push(glowMat);
  g.position.set(x, 0, z);
  scene.add(shadowed(g));
  return g;
}

// Dây đèn lồng đỏ
const lanterns = [];
function lanternString(a, b, n) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * 0.45;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.006, 4), M.trunkDark));
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#e0332a', emissive: '#c4241b', emissiveIntensity: 0.35, roughness: 0.6 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#e8b33a', metalness: 0.4, roughness: 0.4 });
  for (let i = 1; i <= n; i++) {
    const p = curve.getPoint(i / (n + 1));
    const l = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), lanternMat);
    body.scale.y = 0.85; body.position.y = -0.17;
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), goldMat); t1.position.y = -0.05;
    const t2 = t1.clone(); t2.position.y = -0.29;
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.025, 0.12, 6), goldMat); tassel.position.y = -0.36;
    l.add(body, t1, t2, tassel);
    l.position.copy(p);
    l.userData.phase = Math.random() * 6;
    scene.add(shadowed(l));
    lanterns.push(l);
  }
}

// Ghế nhựa đỏ + ấm trà
{
  const stool = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.3), M.redPlastic);
  top.position.y = 0.32; stool.add(top);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.3, 4, 1, true), M.redPlastic);
  side.material = M.redPlastic.clone(); side.material.side = THREE.DoubleSide;
  side.rotation.y = Math.PI / 4; side.position.y = 0.15; stool.add(side);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.015, 0.2), M.wood);
  tray.position.y = 0.345; stool.add(tray);
  const potMat = new THREE.MeshStandardMaterial({ color: '#f1ede2', roughness: 0.25 });
  const blue = new THREE.MeshStandardMaterial({ color: '#2e5d9a', roughness: 0.3 });
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), potMat);
  pot.scale.y = 0.85; pot.position.set(-0.05, 0.395, 0); stool.add(pot);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.053, 0.006, 6, 20), blue);
  band.rotation.x = Math.PI / 2; band.position.copy(pot.position); stool.add(band);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), blue);
  lid.position.set(-0.05, 0.44, 0); stool.add(lid);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.012, 0.06, 6), potMat);
  spout.position.set(0.0, 0.41, 0); spout.rotation.z = -0.9; stool.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI), potMat);
  handle.position.set(-0.1, 0.4, 0); handle.rotation.z = Math.PI / 2; stool.add(handle);
  for (const [cx, cz] of [[0.06, -0.05], [0.08, 0.05], [0.02, 0.06]]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.025, 12), potMat);
    cup.position.set(cx, 0.365, cz); stool.add(cup);
  }
  stool.position.set(0.98, 0, 0.42);
  stool.rotation.y = -0.4;
  scene.add(shadowed(stool));
  // thêm một ghế đỏ trống
  const s2 = stool.clone(); s2.clear();
  s2.add(top.clone(), side.clone());
  s2.position.set(-1.0, 0, -0.1); s2.rotation.y = 0.3;
  scene.add(shadowed(s2));
}

// Hồ nước
{
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshStandardMaterial({ color: '#5fb6c8', roughness: 0.08, metalness: 0.15 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(7.5, 0.02, -7.5); pond.scale.set(1.4, 1, 1);
  scene.add(pond);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.18, 0.3), 0), M.stoneDark);
    st.position.set(7.5 + Math.cos(a) * 3.45 * 1.4, 0.05, -7.5 + Math.sin(a) * 3.45);
    st.scale.y = 0.6; st.rotation.y = rand(0, 3);
    scene.add(shadowed(st));
  }
  const padMat = new THREE.MeshStandardMaterial({ color: '#4c9a3c', roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(rand(0.2, 0.32), 14, 0.3, Math.PI * 1.85), padMat);
    pad.rotation.x = -Math.PI / 2; pad.rotation.z = rand(0, 6);
    pad.position.set(7.5 + rand(-3, 3), 0.03, -7.5 + rand(-2, 2));
    scene.add(pad);
  }
}

// Bụi cây, hoa, cây xa
{
  const flowerCols = ['#ff7aa2', '#ffd23f', '#ffffff', '#ff5d5d', '#c07bff'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), d = rand(4.0, 5.4);
    if (Math.abs(Math.sin(a)) > 0.97 && Math.sin(a) < 0) continue;
    const bush = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.28, 0.45), 1), pick(M.leaves));
      b.position.set(rand(-0.3, 0.3), 0.25, rand(-0.3, 0.3)); bush.add(b);
    }
    for (let k = 0; k < 6; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), pick(flowerCols));
      f.position.set(rand(-0.4, 0.4), rand(0.35, 0.6), rand(-0.4, 0.4)); bush.add(f);
    }
    bush.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    scene.add(shadowed(bush));
  }
  let placed = 0;
  while (placed < 46) {
    const a = rand(0, Math.PI * 2), d = rand(6.5, 26);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 1.6 && z < 0) continue;              // lối đi phía sau
    if (Math.hypot(x - 7.5, z + 7.5) < 5.5) continue;      // hồ
    if (Math.hypot(x + 3.6, z + 3.4) < 3.5) continue;      // cây đa
    scene.add(tree(x, z, rand(0.9, 1.6)));
    placed++;
  }
  const hillMat = new THREE.MeshStandardMaterial({ color: '#7fae6a', roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(10, 16), 1), hillMat);
    h.position.set(Math.cos(a) * 55, -6, Math.sin(a) * 55); h.scale.y = 0.5;
    scene.add(h);
  }
}

bench(3.0, -2.1, -0.95);
bench(-3.1, 1.9, 2.2);
lamp(-2.95, 2.5);
const lampB = lamp(2.9, -3.0);
lanternString(new THREE.Vector3(-2.8, 3.2, -2.5), new THREE.Vector3(2.85, 3.3, -3.0), 6);
lanternString(new THREE.Vector3(-2.95, 3.2, 2.5), new THREE.Vector3(-2.75, 3.3, -2.4), 5);

// Mây
const clouds = [];
{
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, fog: false, emissive: '#ffffff', emissiveIntensity: 0.25 });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.6, 2.8), 1), cloudMat);
      p.position.set(k * 1.8 - 3.6, rand(-0.4, 0.6), rand(-1, 1)); p.scale.y = 0.6; c.add(p);
    }
    const a = rand(0, Math.PI * 2);
    c.position.set(Math.cos(a) * rand(35, 60), rand(18, 28), Math.sin(a) * rand(35, 60));
    c.lookAt(0, c.position.y, 0);
    scene.add(c); clouds.push(c);
  }
}

// Lá rơi
const LEAVES = 70;
const leafMesh = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.07, 0.045),
  new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }),
  LEAVES
);
const leafData = [];
{
  const cols = ['#e3a43a', '#d9772b', '#9bbf4a', '#c9562f', '#f0c64a'];
  for (let i = 0; i < LEAVES; i++) {
    leafData.push({ p: new THREE.Vector3(rand(-6, 3), rand(0, 5), rand(-6, 3)), s: rand(0.2, 0.45), ph: rand(0, 6), r: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)) });
    leafMesh.setColorAt(i, new THREE.Color(pick(cols)));
  }
  leafMesh.castShadow = true;
  scene.add(leafMesh);
}
// Lá nằm trên sân
{
  const fallen = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.045), new THREE.MeshStandardMaterial({ roughness: 0.9 }), 160);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const cols = ['#d9a046', '#c97a35', '#a8b84f', '#b8583a'];
  for (let i = 0; i < 160; i++) {
    const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * 5.5;
    q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rand(0, 6)));
    m.compose(new THREE.Vector3(-2 + Math.cos(a) * d, 0.012, -2 + Math.sin(a) * d), q, new THREE.Vector3(1, 1, 1));
    fallen.setMatrixAt(i, m);
    fallen.setColorAt(i, new THREE.Color(pick(cols)));
  }
  fallen.receiveShadow = true;
  scene.add(fallen);
}

// ======================================================================
// Bàn đá + bàn cờ
// ======================================================================
{
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R - 0.03, 0.09, 48), M.stone);
  top.position.y = TABLE_Y - 0.045;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R - 0.01, 0.02, 8, 64), M.stone);
  lip.rotation.x = Math.PI / 2; lip.position.y = TABLE_Y - 0.01;
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, TABLE_Y - 0.12, 16), M.stoneDark);
  ped.position.y = (TABLE_Y - 0.12) / 2 + 0.06;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 24), M.stoneDark);
  base.position.y = 0.04;
  g.add(top, lip, ped, base);
  scene.add(shadowed(g));
}

let boardTopMesh;
function buildBoard() {
  const W = 1024, H = Math.round(W * BOARD_D / BOARD_W);
  const tex = canvasTex(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#e2b06a'); grd.addColorStop(1, '#c98f4a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) {
      g.strokeStyle = `rgba(120,70,20,${rand(0.02, 0.09)})`; g.lineWidth = rand(1, 3.5);
      g.beginPath();
      const y = rand(0, H), f = rand(0.004, 0.012), a = rand(2, 9);
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 24) g.lineTo(x, y + Math.sin(x * f + i) * a);
      g.stroke();
    }
    const ppm = W / BOARD_W, sp = S * ppm;
    const ox = (W - 8 * sp) / 2, oy = (H - 9 * sp) / 2;
    const P = (c, r) => [ox + c * sp, oy + r * sp];
    const line = (a, b) => { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
    g.strokeStyle = '#5a2e10'; g.lineCap = 'round';
    g.lineWidth = 8; g.strokeRect(ox - 18, oy - 18, 8 * sp + 36, 9 * sp + 36);
    g.lineWidth = 3;
    for (let r = 0; r < 10; r++) line(P(0, r), P(8, r));
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) line(P(c, 0), P(c, 9));
      else { line(P(c, 0), P(c, 4)); line(P(c, 5), P(c, 9)); }
    }
    line(P(3, 0), P(5, 2)); line(P(5, 0), P(3, 2)); line(P(3, 7), P(5, 9)); line(P(5, 7), P(3, 9));
    // dấu vị trí Pháo / Tốt
    const mark = (c, r) => {
      const [x, y] = P(c, r), d = 7, l = 16;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
        g.beginPath(); g.moveTo(x + sx * d, y + sy * (d + l)); g.lineTo(x + sx * d, y + sy * d); g.lineTo(x + sx * (d + l), y + sy * d); g.stroke();
      }
    };
    g.lineWidth = 2.5;
    for (const [c, r] of [[1, 2], [7, 2], [1, 7], [7, 7]]) mark(c, r);
    for (let c = 0; c < 9; c += 2) { mark(c, 3); mark(c, 6); }
    // sông
    g.fillStyle = '#5a2e10';
    g.font = `900 ${Math.round(sp * 0.56)}px "Noto Serif TC"`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const ry = oy + 4.5 * sp + 4;
    g.fillText('楚  河', ox + 2 * sp, ry);
    g.fillText('漢  界', ox + 6 * sp, ry);
  });
  const sideMat = new THREE.MeshStandardMaterial({ color: '#8a5326', roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, 0.03, BOARD_D), sideMat);
  body.position.y = BOARD_Y - 0.015;
  boardTopMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_D), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  boardTopMesh.rotation.x = -Math.PI / 2;
  boardTopMesh.position.y = BOARD_Y + 0.0005;
  boardTopMesh.receiveShadow = true;
  body.castShadow = body.receiveShadow = true;
  scene.add(body, boardTopMesh);
}

// ======================================================================
// Quân cờ
// ======================================================================
const cellPos = (r, c) => new THREE.Vector3((c - 4) * S, BOARD_Y, (r - 4.5) * S);
const BOARD_CENTER = new THREE.Vector3(0, BOARD_Y, 0);
const pieceTex = {};
let pieceBodyGeo, pieceTopGeo, pieceBodyMat;
function buildPieceAssets() {
  const R = PIECE_R, H = PIECE_H;
  const prof = [[0, 0], [R * 0.9, 0], [R, 0.004], [R, H - 0.005], [R * 0.95, H], [0, H]].map(([x, y]) => new THREE.Vector2(x, y));
  pieceBodyGeo = new THREE.LatheGeometry(prof, 40);
  pieceTopGeo = new THREE.CircleGeometry(R * 0.95, 40);
  pieceBodyMat = new THREE.MeshStandardMaterial({ color: '#d9a55f', roughness: 0.5 });
  for (const s of ['r', 'b']) for (const t of 'kabnrcp') {
    const col = s === 'r' ? '#c7261c' : '#1b1b1b';
    pieceTex[s + t] = canvasTex(256, 256, (g, w) => {
      const grd = g.createRadialGradient(100, 90, 10, 128, 128, 140);
      grd.addColorStop(0, '#fff8e6'); grd.addColorStop(1, '#efd9ad');
      g.fillStyle = grd; g.fillRect(0, 0, w, w);
      g.strokeStyle = col; g.lineWidth = 7;
      g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2;
      g.beginPath(); g.arc(128, 128, 94, 0, Math.PI * 2); g.stroke();
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 130px "Noto Serif TC"';
      g.fillText(X.GLYPH[s][t], 128, 136);
    });
  }
}

const pieceMeshes = new Map(); // id -> group
function makePiece(p) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(pieceBodyGeo, pieceBodyMat);
  const top = new THREE.Mesh(pieceTopGeo, new THREE.MeshStandardMaterial({ map: pieceTex[p.s + p.t], roughness: 0.45 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = PIECE_H + 0.0004;
  g.add(body, top);
  g.userData.piece = p;
  shadowed(g);
  scene.add(g);
  pieceMeshes.set(p.id, g);
  return g;
}

// Khay quân bị ăn (đặt trên mặt bàn đá, hai bên bàn cờ)
function trayPos(capturer, i) {
  const col = i % 3, row = Math.floor(i / 3);
  const x = BOARD_W / 2 + 0.075 + col * 0.072;
  const z = 0.32 - row * 0.075;
  return capturer === 'r' ? new THREE.Vector3(x, TABLE_Y, z) : new THREE.Vector3(-x, TABLE_Y, -z);
}

// ---------- Marker trên bàn
const markerGroup = new THREE.Group();
scene.add(markerGroup);
function flatMesh(geo, color, opacity = 1) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}
const selRing = flatMesh(new THREE.RingGeometry(PIECE_R * 1.08, PIECE_R * 1.32, 40), '#ffd34d');
selRing.visible = false; markerGroup.add(selRing);
const checkRing = flatMesh(new THREE.RingGeometry(PIECE_R * 1.08, PIECE_R * 1.45, 40), '#ff3b2f');
checkRing.visible = false; markerGroup.add(checkRing);
const hintRings = [0, 1].map(() => { const m = flatMesh(new THREE.RingGeometry(PIECE_R * 1.1, PIECE_R * 1.4, 40), '#37d39a'); m.visible = false; markerGroup.add(m); return m; });
const lastMarks = [0, 1].map(() => {
  const m = flatMesh(new THREE.RingGeometry(PIECE_R * 1.18, PIECE_R * 1.32, 4, 1, Math.PI / 4), '#ff9f1a', 0.9);
  m.visible = false; markerGroup.add(m); return m;
});
const dotGeo = new THREE.CircleGeometry(0.013, 20);
const capGeo = new THREE.RingGeometry(PIECE_R * 1.05, PIECE_R * 1.25, 32);
const dots = [];
function showTargets(list) {
  dots.forEach(d => (d.visible = false));
  list.forEach(([r, c], i) => {
    const isCap = !!state.board[r][c];
    let d = dots[i];
    if (!d) { d = flatMesh(dotGeo, '#2fbf71', 0.85); markerGroup.add(d); dots.push(d); }
    d.geometry = isCap ? capGeo : dotGeo;
    d.material.color.set(isCap ? '#ff4d3a' : '#20b864');
    d.position.copy(cellPos(r, c)).setY(BOARD_Y + 0.002 + (isCap ? PIECE_H : 0));
    d.visible = true;
  });
}

// ======================================================================
// Nhân vật
// ======================================================================
const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);
function loadGLB(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}
function loadCharacters() {
  return Promise.all(Object.entries(CHARS).map(async ([id, ch]) => {
    // bản đã gắn xương (tools/blender_rig.py); thiếu thì dùng model gốc, chỉ lắc lư cả người
    const gltf = await loadGLB(`../newman/rigged/${ch.file}.glb`).catch(() => loadGLB(`../newman/${ch.file}.glb`));
    const m = gltf.scene;
    m.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (o.material) {
          o.material.envMapIntensity = 0.8;
          o.material.side = THREE.DoubleSide; // chỗ vá sau khi tách tay khỏi thân
          if ('metalness' in o.material) o.material.metalness = Math.min(o.material.metalness, 0.1);
        }
      }
    });
    const box = new THREE.Box3().setFromObject(m);
    const sc = ch.h / box.getSize(new THREE.Vector3()).y;
    m.scale.setScalar(sc);
    box.setFromObject(m);
    const ctr = box.getCenter(new THREE.Vector3());
    m.position.set(-ctr.x, -box.min.y, -ctr.z);
    const pivot = new THREE.Group(); // pivot ở chân → dồn trọng tâm, lắc lư tự nhiên
    pivot.add(m);
    const holder = new THREE.Group();
    holder.add(pivot);
    holder.position.set(...ch.pos);
    holder.rotation.y = Math.atan2(-ch.pos[0], -ch.pos[2]) + MODEL_FRONT;
    scene.add(holder);
    holder.updateMatrixWorld(true);
    const puppet = new Puppet(m);
    puppet.look = BOARD_CENTER;
    Object.assign(ch, { id: +id, obj: holder, pivot, puppet, baseScale: 1, phase: Math.random() * 6, mood: 'idle', moodT: 0 });
  }));
}

// ---------- Bong bóng thoại (HTML chiếu theo vị trí đầu)
const bubbleEls = {};
function bubble(id, text, ms = 2600, emote = false) {
  const ch = CHARS[id];
  let el = bubbleEls[id];
  if (!el) { el = document.createElement('div'); el.className = 'bubble'; $('#bubbles').appendChild(el); bubbleEls[id] = el; }
  el.classList.toggle('emote', emote);
  el.innerHTML = emote ? text : `<span class="nm">${ch.name}</span>${text}`;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
  if (!emote) addChat(id, text);
}
const _v = new THREE.Vector3();
function updateBubbles() {
  for (const [id, el] of Object.entries(bubbleEls)) {
    const ch = CHARS[id];
    if (!ch.obj) continue;
    _v.set(ch.pos[0], ch.h + 0.12, ch.pos[2]).project(camera);
    let vis = _v.z < 1;
    // giữ bong bóng trong khung hình (đầu nhân vật có thể nằm ngoài màn hình)
    let x = Math.min(innerWidth - 120, Math.max(120, (_v.x * 0.5 + 0.5) * innerWidth));
    let y = Math.max(150, (-_v.y * 0.5 + 0.5) * innerHeight);
    // góc người chơi: camera ở ngay trên đầu Ông Ba -> neo bong bóng của ông trên thẻ người chơi
    if (+id === 1 && viewIdx === 0) {
      const card = $('#card-r').getBoundingClientRect();
      x = Math.max(130, card.left + card.width / 2); y = card.top - 4; vis = true;
    }
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) translateY(-10px)`;
    el.style.visibility = vis ? '' : 'hidden';
  }
}

function setMood(id, mood, dur = 1.2) { const ch = CHARS[id]; if (ch) { ch.mood = mood; ch.moodT = dur; } }

// ======================================================================
// Cử chỉ tay chân (rig.js) + AI chạy trong Web Worker
// ======================================================================
const PLAYER = { r: 1, b: 2 };
const ADVISORS = [3, 4, 5];
const ADDR = { r: 'Ông Ba', b: 'Bác Tư' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const puppet = id => CHARS[id] && CHARS[id].puppet;

function gesture(id, name, opts = {}) {
  const p = puppet(id);
  if (!p || !p.ok) return Promise.resolve();
  const hold = CHARS[id].hold; // tay đang cầm đồ (gậy) thì không dùng
  if (hold) {
    const free = hold === 'L' ? 'R' : 'L';
    if (name === 'clap') name = 'cheer';
    opts.side = free; opts.only = free;
  }
  if (opts.target && !opts.side) opts.side = p.sideFor(typeof opts.target === 'function' ? opts.target() : opts.target);
  if (!opts.side) opts.side = Math.random() < 0.5 ? 'L' : 'R';
  return p.play(name, opts);
}
const pieceTop = v => v.clone().setY(BOARD_Y + PIECE_H + 0.01);

let worker = null, reqId = 0;
const pending = new Map();
try {
  worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => { const r = pending.get(e.data.id); if (r) { pending.delete(e.data.id); r(e.data); } };
  worker.onerror = () => { worker = null; };
} catch { worker = null; }
function ai(type, payload) {
  const board = state.board.map(row => row.slice());
  if (!worker) { // dự phòng: tính ngay trên luồng chính
    if (type === 'best') return Promise.resolve({ move: X.bestMove(board, payload.side, payload.depth, payload.noise) });
    return Promise.resolve({ list: X.topMoves(board, payload.side, payload.n, payload.depth).map(o => ({ ...o, note: X.notation(board, o.m), why: X.describe(board, o.m) })) });
  }
  const id = ++reqId;
  return new Promise(res => { pending.set(id, res); worker.postMessage({ id, type, board, ...payload }); });
}

// ---------- Mũi tên mách nước trên bàn cờ
const arrows = {};
function arrowFor(id) {
  if (arrows[id]) return arrows[id];
  const mat = new THREE.MeshBasicMaterial({ color: CHARS[id].color, transparent: true, opacity: 0.9, depthWrite: false });
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  shaft.rotation.x = -Math.PI / 2;
  const tri = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const head = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat);
  head.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(PIECE_R * 1.05, PIECE_R * 1.3, 32), mat);
  ring.rotation.x = -Math.PI / 2;
  g.add(shaft, head, ring);
  g.renderOrder = 5;
  g.visible = false;
  g.userData = { shaft, head, ring, mat };
  scene.add(g);
  return (arrows[id] = g);
}
function showArrow(id, m) {
  const g = arrowFor(id), { shaft, head, ring } = g.userData;
  const a = cellPos(m[0], m[1]), b = cellPos(m[2], m[3]);
  const d = b.clone().sub(a), len = d.length();
  const w = 0.018, hl = 0.045;
  g.position.copy(a).setY(BOARD_Y + PIECE_H + 0.006);
  g.rotation.set(0, Math.atan2(d.x, d.z), 0);
  // trong toạ độ của group: trục +Z là hướng đi
  shaft.scale.set(w, Math.max(0.001, len - hl - PIECE_R * 0.6), 1);
  shaft.position.set(0, 0, PIECE_R * 0.6 + (len - hl - PIECE_R * 0.6) / 2);
  shaft.rotation.set(-Math.PI / 2, 0, 0);
  head.scale.set(0.05, hl, 1);
  head.position.set(0, 0.0005, len - hl);
  head.rotation.set(Math.PI / 2, Math.PI, 0);
  ring.position.set(0, 0, 0);
  g.visible = true;
  g.userData.t0 = clock.elapsedTime;
}
function hideArrows() { Object.values(arrows).forEach(g => (g.visible = false)); }

// ---------- Quân sư mách nước
let advice = [], adviceToken = 0, adviceDone = Promise.resolve();
const TAG = { mate: 'Chiếu bí', capcheck: 'Ăn + chiếu', cap: 'Ăn quân', check: 'Chiếu', escape: 'Chạy quân', threat: 'Dọa quân', develop: 'Ra quân', pawn: 'Đẩy tốt', solid: 'Chắc chắn' };
function reasonText(w) {
  const N = w.t ? X.NAMES[w.t] : '';
  switch (w.kind) {
    case 'mate': return 'chiếu bí luôn!';
    case 'capcheck': return `ăn ${N} còn chiếu nữa!`;
    case 'cap': return pick([`ăn ${N} ngon ơ!`, `xơi con ${N} đi!`]);
    case 'check': return pick(['chiếu tướng nó!', 'chiếu một phát coi!']);
    case 'escape': return `chạy ${N} kẻo mất!`;
    case 'threat': return `dọa ăn ${N}!`;
    case 'develop': return `ra ${N} cho sớm!`;
    case 'pawn': return 'đẩy Tốt chiếm đất!';
    default: return pick(['đi vầy chắc ăn.', 'nước này vững nè.', 'thủ chắc rồi tính.']);
  }
}
const sameMove = (a, b) => a && b && a.every((v, i) => v === b[i]);

function cancelAdvice() {
  adviceToken++;
  hideArrows();
  ADVISORS.forEach(id => { const p = puppet(id); if (p) p.stopAll('point'); });
}

function adviseTurn(lead = 350) {
  cancelAdvice();
  const token = adviceToken, side = state.turn;
  advice = [];
  renderAdvice(side, true);
  adviceDone = (async () => {
    const res = await ai('top', { side, n: 3, depth: 3 });
    if (token !== adviceToken || state.over) return;
    const who = ADVISORS.slice().sort(() => Math.random() - 0.5);
    advice = res.list.map((a, i) => ({ ...a, by: who[i] }));
    renderAdvice(side);
    for (let i = 0; i < advice.length; i++) {
      await wait(i === 0 ? lead : 1050);
      if (token !== adviceToken || state.over) return;
      speakAdvice(advice[i], side);
    }
    await wait(900);
  })();
}

function speakAdvice(a, side) {
  const from = pieceTop(cellPos(a.m[0], a.m[1])), to = pieceTop(cellPos(a.m[2], a.m[3]));
  const t0 = clock.elapsedTime;
  showArrow(a.by, a.m);
  // chỉ vào quân cần đi rồi chỉ sang ô đích
  gesture(a.by, 'point', { target: () => (clock.elapsedTime - t0 < 0.9 ? from : to), duration: 2.8 });
  setMood(a.by, 'happy', 0.6);
  bubble(a.by, `${ADDR[side]}! ${a.note}, ${reasonText(a.why)}`, 3000);
  $$('#advice li').forEach(li => li.classList.toggle('speaking', +li.dataset.by === a.by));
}

function renderAdvice(side, loading = false) {
  const el = $('#advice');
  if (!el) return;
  $('#advice-title').textContent = `Mách nước cho ${ADDR[side]} (${side === 'r' ? 'Đỏ' : 'Đen'})`;
  if (loading) { el.innerHTML = '<li class="empty">Mấy ông đang ngó bàn cờ…</li>'; return; }
  el.innerHTML = advice.map((a, i) => `
    <li data-i="${i}" data-by="${a.by}" class="${side === 'r' ? 'clickable' : ''}" style="--c:${CHARS[a.by].color}">
      <div class="avatar sm" data-char="${a.by}"></div>
      <div class="adv-main"><b>${a.note}</b><span>${CHARS[a.by].name}</span></div>
      <span class="adv-tag">${TAG[a.why.kind] || ''}</span>
    </li>`).join('') || '<li class="empty">Không còn nước nào…</li>';
}
document.addEventListener('click', e => {
  const li = e.target.closest('#advice li.clickable');
  if (!li || !canPlay()) return;
  const a = advice[+li.dataset.i];
  if (!a) return;
  deselect(); select(a.m[0], a.m[1]);
  hintRings[1].position.copy(cellPos(a.m[2], a.m[3])).setY(BOARD_Y + 0.002);
  hintRings[1].visible = true;
  speakAdvice(a, 'r');
});

// phản ứng sau khi một bên đi: có nghe lời quân sư không?
function reactToAdvice(m, list, side) {
  if (!list.length) return;
  const hit = list.find(a => sameMove(a.m, m));
  if (hit) {
    setTimeout(() => {
      bubble(hit.by, pick(['Thấy chưa! Nghe tui là đúng!', 'Đó, nước của tui đó!', 'Hay! Đúng ý tui!', 'Có vậy chứ!']), 2200);
      gesture(hit.by, Math.random() < 0.6 ? 'cheer' : 'clap', { duration: 1.8 });
    }, 250);
  } else if (Math.random() < 0.55) {
    const a = pick(list);
    setTimeout(() => {
      bubble(a.by, pick(['Trời, sao không nghe tui…', 'Đi vậy cũng được…', 'Ý tui khác à nghen.', `Hồi nãy ${a.note} mới hay!`]), 2200);
      gesture(a.by, Math.random() < 0.5 ? 'facepalm' : 'shrug', { duration: 1.8 });
    }, 250);
  }
}

// ---------- Người chơi với tay ra bàn
let reachG = null;
function reachSelected() {
  const p = puppet(1);
  if (!p || !state.selected) return;
  if (reachG) p.stopAll();
  const sel = () => {
    const pc = state.selected && state.board[state.selected[0]][state.selected[1]];
    const g = pc && pieceMeshes.get(pc.id);
    return g ? pieceTop(g.position) : pieceTop(BOARD_CENTER);
  };
  reachG = gesture(1, 'reach', { target: sel, side: 'R', duration: 60, fadeIn: 0.3 });
}
function releaseReach() { const p = puppet(1); if (p) p.stopAll(); reachG = null; }

// cử chỉ vu vơ khi rảnh
setInterval(() => {
  if (!state.started || state.over || document.hidden) return;
  const id = pick(ADVISORS), p = puppet(id);
  if (!p || p.busy() || Math.random() < 0.4) return;
  const g = pick(['behind', 'behind', 'cross', 'think', 'scratch', 'behind']);
  gesture(id, g, { duration: g === 'behind' || g === 'cross' ? rand(5, 9) : rand(2, 3.5), look: BOARD_CENTER });
}, 4500);

// ======================================================================
// Âm thanh (WebAudio tổng hợp, không cần file)
// ======================================================================
let actx = null, soundOn = true;
function tock(kind = 'move') {
  if (!soundOn) return;
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  const t = actx.currentTime;
  const hit = (when, freq, vol) => {
    const o = actx.createOscillator(), gn = actx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq, when); o.frequency.exponentialRampToValueAtTime(freq * 0.5, when + 0.08);
    gn.gain.setValueAtTime(vol, when); gn.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
    o.connect(gn).connect(actx.destination); o.start(when); o.stop(when + 0.13);
    const buf = actx.createBuffer(1, 2205, 44100), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    const n = actx.createBufferSource(), f = actx.createBiquadFilter(), g2 = actx.createGain();
    n.buffer = buf; f.type = 'bandpass'; f.frequency.value = 2200; g2.gain.value = vol * 0.9;
    n.connect(f).connect(g2).connect(actx.destination); n.start(when);
  };
  if (kind === 'move') hit(t, 620, 0.35);
  if (kind === 'capture') { hit(t, 560, 0.45); hit(t + 0.09, 760, 0.35); }
  if (kind === 'check') { hit(t, 880, 0.3); hit(t + 0.12, 1180, 0.3); }
  if (kind === 'select') hit(t, 980, 0.12);
}

// ======================================================================
// Tween
// ======================================================================
const tweens = [];
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
function animate(dur, fn) {
  return new Promise(res => tweens.push({ t: 0, dur, fn, res }));
}

// ======================================================================
// Trạng thái game
// ======================================================================
let drag = null; // quân đang được kéo
const state = {
  board: null, turn: 'r', history: [], selected: null, targets: [],
  busy: false, over: false, started: false, hints: 3,
  time: { r: 600, b: 600 },
};

function capturedBy(side) {
  return state.history.filter(h => h.side === side && h.captured).map(h => h.captured);
}

function syncPieces() {
  const onBoard = new Set();
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = state.board[r][c];
    if (!p) continue;
    onBoard.add(p.id);
    const g = pieceMeshes.get(p.id) || makePiece(p);
    g.position.copy(cellPos(r, c)); g.rotation.set(0, 0, 0); g.visible = true;
  }
  for (const side of ['r', 'b']) capturedBy(side).forEach((p, i) => {
    const g = pieceMeshes.get(p.id);
    if (g) { g.position.copy(trayPos(side, i)); g.rotation.set(0, 0, 0); }
  });
}

function newGame() {
  state.board = X.initialBoard();
  for (const g of pieceMeshes.values()) scene.remove(g);
  pieceMeshes.clear();
  Object.assign(state, { turn: 'r', history: [], selected: null, targets: [], busy: false, over: false, hints: 3, taunted: null, time: { r: 600, b: 600 } });
  syncPieces();
  clearMarks();
  renderMoves(); renderCaptured(); updateTurnUI();
  $('#hint-left').textContent = state.hints;
  $('#btn-hint').disabled = false;
}

function clearMarks() {
  selRing.visible = false; checkRing.visible = false;
  hintRings.forEach(h => (h.visible = false));
  lastMarks.forEach(h => (h.visible = false));
  showTargets([]);
}

function select(r, c) {
  state.selected = [r, c];
  state.targets = X.legalMoves(state.board, r, c);
  selRing.position.copy(cellPos(r, c)).setY(BOARD_Y + 0.002);
  selRing.visible = true;
  showTargets(state.targets);
  tock('select');
  reachSelected();
}
function deselect() {
  if (state.selected) {
    const p = state.board[state.selected[0]][state.selected[1]];
    const g = p && pieceMeshes.get(p.id);
    if (g) g.position.y = BOARD_Y;
  }
  state.selected = null; state.targets = [];
  selRing.visible = false; showTargets([]);
  if (reachG) releaseReach();
}

async function doMove(m) {
  const [fr, fc, tr, tc] = m;
  const B = state.board;
  const piece = B[fr][fc];
  const note = X.notation(B, m);
  const captured = B[tr][tc];
  const side = piece.s;
  state.busy = true;
  deselect();
  hintRings.forEach(h => (h.visible = false));
  const heard = advice;
  cancelAdvice();

  X.makeMove(B, m);
  state.history.push({ m, piece, captured, side, note });

  // người chơi với tay ra cầm quân, tay đi theo quân cờ
  const g = pieceMeshes.get(piece.id);
  const mover = PLAYER[side], mp = puppet(mover);
  const flight = 0.28 + g.position.distanceTo(cellPos(tr, tc)) * 0.35;
  if (mp && mp.ok) {
    mp.stopAll();
    gesture(mover, 'reach', { target: () => pieceTop(g.position), side: side === 'r' ? 'R' : undefined, duration: flight + 0.75, fadeIn: 0.3, fadeOut: 0.4 });
    await wait(side === 'r' ? 200 : 320);
  }
  const a = g.position.clone(), b = cellPos(tr, tc);
  const dist = a.distanceTo(b);
  await animate(0.28 + dist * 0.35, k => {
    const e = ease(k);
    g.position.lerpVectors(a, b, e);
    g.position.y = BOARD_Y + Math.sin(k * Math.PI) * (0.05 + dist * 0.12);
  });
  g.position.y = BOARD_Y;
  if (captured) {
    const cg = pieceMeshes.get(captured.id);
    const ca = cg.position.clone(), cb = trayPos(side, capturedBy(side).length - 1);
    animate(0.55, k => {
      cg.position.lerpVectors(ca, cb, ease(k));
      cg.position.y = ca.y + Math.sin(k * Math.PI) * 0.18;
      cg.rotation.x = k * Math.PI * 2;
    }).then(() => { cg.rotation.set(0, 0, 0); cg.position.copy(cb); });
  }
  tock(captured ? 'capture' : 'move');

  lastMarks[0].position.copy(cellPos(fr, fc)).setY(BOARD_Y + 0.002);
  lastMarks[1].position.copy(cellPos(tr, tc)).setY(BOARD_Y + 0.002);
  lastMarks.forEach(l => (l.visible = true));

  state.turn = X.opp(side);
  renderMoves(); renderCaptured();
  reactToAdvice(m, heard, side);

  const oppMoves = X.allLegal(B, state.turn);
  const check = X.inCheck(B, state.turn);
  if (check) {
    const [kr, kc] = X.findKing(B, state.turn);
    checkRing.position.copy(cellPos(kr, kc)).setY(BOARD_Y + 0.002);
    checkRing.visible = true;
  } else checkRing.visible = false;

  // phản ứng của mấy ông ngồi xem
  const fans = [3, 4, 5];
  if (!oppMoves.length) {
    // hết
  } else if (check) {
    toast('CHIẾU TƯỚNG!');
    tock('check');
    const king = pieceTop(cellPos(...X.findKing(B, state.turn)));
    const f0 = pick(fans);
    setTimeout(() => { bubble(f0, pick(LINES.check)); gesture(f0, 'point', { target: king, duration: 2 }); }, 300);
    fans.filter(f => f !== f0).forEach(f => gesture(f, CHARS[f].bet === side ? 'cheer' : 'facepalm', { duration: 1.6 }));
    fans.forEach(f => setMood(f, 'excited', 1.4));
  } else if (captured) {
    const big = captured.t === 'r';
    // trọc nhau: người ăn khoe -> người bị ăn cãi -> khán giả phe kia trọc thêm
    const winP = PLAYER[side], loseP = PLAYER[X.opp(side)];
    const v = { X: ADDR[X.opp(side)], P: X.NAMES[captured.t] };
    const revenge = state.taunted === side;
    state.taunted = X.opp(side);
    if (revenge) { sayLine(winP, LINES.revenge, v); gesture(winP, 'cheer', { duration: 1.6 }); }
    else if (big || Math.random() < 0.75) { sayLine(winP, big ? LINES.bigGloat : LINES.gloat, v); gesture(winP, 'point', { target: headOf(loseP), duration: 1.8 }); }
    setTimeout(() => { if (!state.over && Math.random() < 0.65) sayLine(loseP, LINES.retort, v); }, 1400);
    const heckler = pick(fans.filter(f => CHARS[f].bet === side)) || pick(fans);
    setTimeout(() => {
      if (state.over) return;
      sayLine(heckler, big ? LINES.bigGloat : LINES.heckle, v);
      gesture(heckler, Math.random() < 0.5 ? 'point' : 'clap', { target: headOf(loseP), duration: 1.6 });
    }, 2500);
    setMood(side === 'r' ? 1 : 2, 'happy', 1.2);
    fans.forEach(f => f !== heckler && Math.random() < 0.6 && gesture(f, CHARS[f].bet === side ? 'clap' : (big ? 'facepalm' : 'scratch'), { duration: 1.6 }));
    setTimeout(() => gesture(PLAYER[X.opp(side)], big ? 'facepalm' : 'scratch', { duration: 1.6 }), 500);
    fans.forEach(f => setMood(f, 'excited', 1));
  } else if (Math.random() < 0.18) {
    setTimeout(() => bubble(pick(fans), pick(LINES.idle), 2800), 500);
  } else if (heard.length && !heard.some(a => sameMove(a.m, m)) && Math.random() < 0.3) {
    // không nghe quân sư mà còn đi dở -> bị chê
    const f = pick(fans.filter(f => CHARS[f].bet !== side)) || pick(fans);
    setTimeout(() => sayLine(f, LINES.dumb, { X: ADDR[side] }), 600);
  }

  if (!oppMoves.length) { endGame(side, check ? 'chiếu bí' : 'hết nước đi'); return; }

  updateTurnUI();
  state.busy = false;
  adviseTurn(captured ? 3600 : 350);
  if (state.turn === 'b') aiTurn();
}

async function aiTurn() {
  state.busy = true;
  $('#card-b').classList.add('thinking');
  setMood(2, 'think', 99);
  const token = adviceToken;
  gesture(2, 'think', { side: 'L', duration: 4, look: BOARD_CENTER });
  if (Math.random() < 0.45) bubble(2, pick(LINES.oppThink), 2000);
  const [res] = await Promise.all([ai('best', { side: 'b', depth: 3, noise: 18 }), wait(rand(1400, 2000))]);
  await Promise.race([adviceDone, wait(8000)]); // nghe mấy ông quân sư nói xong đã
  if (state.over || token !== adviceToken) { state.busy = false; return; }
  let m = res.move;
  // 50%: Bác Tư nghe theo một ông quân sư (cả 3 nước đều có lý)
  if (advice.length && Math.random() < 0.5) m = pick(advice).m;
  $('#card-b').classList.remove('thinking');
  setMood(2, 'idle');
  if (!m) { state.busy = false; return; }
  if (Math.random() < 0.15) bubble(2, pick(LINES.oppMove), 1600);
  doMove(m);
}

function endGame(winner, why) {
  state.over = true; state.busy = false;
  updateTurnUI();
  const win = winner === 'r';
  bubble(win ? 4 : 3, win ? 'Hay quá! Ông Ba thắng rồi!' : 'Thấy chưa, Bác Tư đánh lâu năm mà!', 3500);
  fanCheer(win);
  setTimeout(() => {
    $('#result-title').textContent = win ? 'THẮNG!' : 'THUA RỒI';
    $('#result-title').classList.toggle('lose', !win);
    $('#result-avatar').dataset.char = win ? '1' : '2';
    $('#result-text').textContent = win
      ? `Bác Tư Mũ Nồi đã bị ${why}. Cả công viên vỗ tay!`
      : `Ông Ba Râu ${why === 'xin thua' ? 'đã xin thua' : 'bị ' + why}. Thôi, uống chén trà rồi làm ván nữa.`;
    $('#stat-moves').textContent = Math.ceil(state.history.length / 2);
    $('#stat-caps').textContent = capturedBy('r').length;
    $('#stat-coins').textContent = win ? '+120' : '+10';
    $('#modal').hidden = false;
  }, 1400);
}
function fanCheer(redWins) {
  cancelAdvice();
  for (const f of [3, 4, 5]) {
    const happy = CHARS[f].bet === (redWins ? 'r' : 'b');
    setMood(f, happy ? 'excited' : 'sad', 3);
    gesture(f, happy ? 'cheer' : 'facepalm', { duration: 3 });
  }
  setMood(1, redWins ? 'excited' : 'sad', 3);
  setMood(2, redWins ? 'sad' : 'excited', 3);
  gesture(1, redWins ? 'cheer' : 'facepalm', { duration: 3 });
  gesture(2, redWins ? 'shrug' : 'cheer', { duration: 3 });
}

// ======================================================================
// UI
// ======================================================================
function toast(text, info = false, ms = 1300) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.toggle('info', info);
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), ms);
}

function fmt(s) { s = Math.max(0, Math.ceil(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

function updateTurnUI() {
  const tb = $('#turn-banner');
  tb.className = 'turn-banner ' + (state.over ? 'over' : state.turn === 'r' ? 'red' : 'black');
  tb.textContent = state.over ? 'Ván cờ kết thúc' : state.turn === 'r' ? 'Lượt của bạn' : 'Bác Tư đang tính…';
  $('#card-r').classList.toggle('active', !state.over && state.turn === 'r');
  $('#card-b').classList.toggle('active', !state.over && state.turn === 'b');
  $('#card-r .status').textContent = state.over ? 'Hết ván' : state.turn === 'r' ? 'Đến lượt' : 'Đang chờ';
  $('#card-b .status').textContent = state.over ? 'Hết ván' : state.turn === 'b' ? 'Đang suy nghĩ' : 'Đang chờ';
  $('#btn-undo').disabled = state.over || state.history.length < 2;
}

function renderMoves() {
  const ol = $('#moves');
  if (!state.history.length) { ol.innerHTML = '<li class="empty">Chưa có nước đi. Đỏ đi trước.</li>'; return; }
  let html = '';
  for (let i = 0; i < state.history.length; i += 2) {
    const a = state.history[i], b = state.history[i + 1];
    const last = state.history.length - 1;
    html += `<li><span class="no">${i / 2 + 1}.</span><span class="mv-r"><span class="${i === last ? 'latest' : ''}">${a.note}</span></span><span class="mv-b">${b ? `<span class="${i + 1 === last ? 'latest' : ''}">${b.note}</span>` : ''}</span></li>`;
  }
  ol.innerHTML = html;
  ol.scrollTop = ol.scrollHeight;
}

function renderCaptured() {
  for (const side of ['r', 'b']) {
    $('#cap-' + side).innerHTML = capturedBy(side).map(p => `<span class="chip ${p.s}">${X.GLYPH[p.s][p.t]}</span>`).join('');
  }
}

function addChat(id, text) {
  const log = $('#chat-log');
  const el = document.createElement('div');
  el.className = 'chat-msg';
  el.innerHTML = `<div class="avatar" data-char="${id}"></div><div><div class="who">${CHARS[id].name}${id == 1 ? ' (Bạn)' : ''}</div><div class="txt"></div></div>`;
  el.querySelector('.txt').textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  if ($('[data-body="chat"]').hidden) $('#chat-badge').hidden = false;
}

function renderCrowd() {
  $('#crowd').innerHTML = [3, 4, 5].map(id => {
    const c = CHARS[id];
    return `<li><div class="avatar sm" data-char="${id}"></div><div><b>${c.name}</b><span>${c.note}</span></div><span class="bet ${c.bet}">${c.bet === 'r' ? 'Phe Đỏ' : 'Phe Đen'}</span></li>`;
  }).join('') + '<li><div><b>+20 người xem online</b><span>Đang theo dõi bàn số 7</span></div></li>';
}

// Tabs
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.tab-body').forEach(b => (b.hidden = b.dataset.body !== t.dataset.tab));
  if (t.dataset.tab === 'chat') $('#chat-badge').hidden = true;
}));
$('#btn-panel').addEventListener('click', () => $('#side-panel').classList.toggle('open'));

$('#chat-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#chat-input').value.trim();
  if (!v) return;
  bubble(1, v, 3000);
  $('#chat-input').value = '';
  if (Math.random() < 0.6) setTimeout(() => { const w = pick([2, 3, 4, 5]); bubble(w, pick(['Nói ít thôi, đánh đi!', 'Ừ, chí phải.', 'Hahaha!', 'Ông cứ khéo nói.'])); gesture(w, pick(['clap', 'shrug', 'scratch']), { duration: 1.6 }); }, 1200);
});

$$('[data-emote]').forEach(b => b.addEventListener('click', () => {
  bubble(1, b.dataset.emote, 1600, true);
  setMood(1, 'happy', 1);
  const gname = { '👍': 'cheer', '😂': 'clap', '😮': 'facepalm', '🍵': 'think' }[b.dataset.emote];
  if (gname && !state.selected) gesture(1, gname, { duration: 1.8, side: 'R' });
}));

$('#btn-sound').addEventListener('click', e => { soundOn = !soundOn; e.currentTarget.classList.toggle('off', !soundOn); });

$('#btn-hint').addEventListener('click', async () => {
  if (state.busy || state.over || state.turn !== 'r' || state.hints <= 0) return;
  const m = (await ai('best', { side: 'r', depth: 3, noise: 0 })).move;
  if (!m || !canPlay()) return;
  state.hints--;
  $('#hint-left').textContent = state.hints;
  if (!state.hints) $('#btn-hint').disabled = true;
  hintRings[0].position.copy(cellPos(m[0], m[1])).setY(BOARD_Y + 0.002);
  hintRings[1].position.copy(cellPos(m[2], m[3])).setY(BOARD_Y + 0.002);
  hintRings.forEach(h => (h.visible = true));
  bubble(4, `Đi ${X.notation(state.board, m)} đi ông!`, 3000);
  gesture(4, 'point', { target: pieceTop(cellPos(m[2], m[3])), duration: 2.6 });
});

$('#btn-undo').addEventListener('click', () => {
  if (state.busy || state.over || state.history.length < 2) return;
  for (let i = 0; i < 2; i++) {
    const h = state.history.pop();
    X.unmakeMove(state.board, h.m, h.captured);
  }
  state.turn = 'r';
  deselect(); clearMarks(); syncPieces(); renderMoves(); renderCaptured(); updateTurnUI();
  bubble(2, 'Đi lại hả? Lần này thôi nghen!', 2200);
  gesture(2, 'shrug', { duration: 1.8 });
  adviseTurn();
});

$('#btn-draw').addEventListener('click', () => {
  if (state.over) return;
  toast('Đã gửi lời cầu hòa…', true);
  setTimeout(() => { bubble(2, pick(['Còn sớm mà, hòa gì!', 'Hòa? Tui đang ưu thế nha.', 'Đánh tiếp đi ông!']), 2400); gesture(2, 'shrug', { duration: 1.8 }); }, 900);
});

$('#btn-resign').addEventListener('click', () => { if (!state.over) $('#confirm').hidden = false; });
$('#btn-cancel').addEventListener('click', () => ($('#confirm').hidden = true));
$('#btn-confirm-resign').addEventListener('click', () => { $('#confirm').hidden = true; endGame('b', 'xin thua'); });
$('#btn-review').addEventListener('click', () => { $('#modal').hidden = true; setView(2); });
$('#btn-new').addEventListener('click', () => { $('#modal').hidden = true; newGame(); setView(0); bubble(5, 'Ván mới! Tui pha ấm trà khác nha.', 2600); setTimeout(adviseTurn, 1500); });

// ---------- Camera views
const VIEWS = [
  { name: 'Góc người chơi', pos: [0, 2.1, 1.05], target: [0, 0.73, -0.05], portrait: { pos: [0, 2.45, 0.92], target: [0, 0.72, 0.0] } }, // ngay trên đầu Ông Ba (đứng thì đầu ông che bàn nếu đặt sau gáy)
  { name: 'Nhìn từ trên', pos: [0, 2.6, 0.32], target: [0, 0.7, 0], portrait: { pos: [0, 2.75, 0.2], target: [0, 0.7, 0.02] } },
  { name: 'Toàn cảnh', pos: [3.4, 2.5, 3.6], target: [0, 0.8, -0.3], portrait: { pos: [4.2, 3.0, 4.6], target: [0, 0.8, -0.3] } },
];
const isPortrait = () => innerWidth / innerHeight < 0.9;
let viewIdx = 0;
function setView(i, dur = 1.1) {
  viewIdx = i;
  if (CHARS[1].puppet) CHARS[1].puppet.leanScale = i === 0 ? 0.15 : 1;
  const base = VIEWS[i], v = isPortrait() && base.portrait ? base.portrait : base;
  $('#view-name').textContent = base.name;
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const p1 = new THREE.Vector3(...v.pos), t1 = new THREE.Vector3(...v.target);
  controls.enabled = false;
  return animate(dur, k => {
    const e = ease(k);
    camera.position.lerpVectors(p0, p1, e);
    controls.target.lerpVectors(t0, t1, e);
  }).then(() => (controls.enabled = true));
}
$('#btn-view').addEventListener('click', () => setView((viewIdx + 1) % VIEWS.length));

// ---------- Picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BOARD_Y + PIECE_H));
const _hit = new THREE.Vector3();
function boardPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(pickPlane, _hit);
}
function cellAt(ev) {
  const p = boardPoint(ev);
  if (!p) return null;
  const c = Math.round(p.x / S + 4), r = Math.round(p.z / S + 4.5);
  if (r < 0 || r > 9 || c < 0 || c > 8) return null;
  const d = Math.hypot(p.x - (c - 4) * S, p.z - (r - 4.5) * S);
  return d < S * 0.55 ? [r, c] : null;
}
const canPlay = () => state.started && !state.busy && !state.over && state.turn === 'r';
const isTarget = (r, c) => state.targets.some(([tr, tc]) => tr === r && tc === c);

// Hỗ trợ cả 2 cách: bấm quân → bấm ô đích, hoặc kéo-thả quân.
// Listener ở pha capture để chạy trước OrbitControls: cầm quân thì không xoay camera.
let downAt = null;
canvas.addEventListener('pointerdown', e => {
  downAt = [e.clientX, e.clientY];
  if (!canPlay() || e.button > 0) return;
  const cell = cellAt(e);
  const p = cell && state.board[cell[0]][cell[1]];
  if (!p || p.s !== 'r') return;
  const same = state.selected && state.selected[0] === cell[0] && state.selected[1] === cell[1];
  if (!same) { deselect(); select(...cell); }
  drag = { from: cell, g: pieceMeshes.get(p.id), moved: false, wasSelected: same, ctrl: controls.enabled };
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
}, true);

canvas.addEventListener('pointermove', e => {
  if (!state.started) return;
  if (drag) {
    if (!drag.moved && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) drag.moved = true;
    const p = drag.moved && boardPoint(e);
    if (p) drag.g.position.set(p.x, BOARD_Y + 0.045, p.z);
    return;
  }
  const cell = cellAt(e);
  let pointer = false;
  if (cell && canPlay()) {
    const p = state.board[cell[0]][cell[1]];
    pointer = (p && p.s === 'r') || isTarget(...cell);
  }
  canvas.style.cursor = pointer ? 'pointer' : 'grab';
});

canvas.addEventListener('pointerup', e => {
  const cell = cellAt(e);
  if (drag) {
    const d = drag;
    drag = null;
    controls.enabled = d.ctrl;
    canvas.style.cursor = 'pointer';
    if (d.moved) {
      if (cell && isTarget(...cell)) doMove([...d.from, ...cell]);
      else d.g.position.copy(cellPos(...d.from)); // thả sai chỗ → quân về chỗ cũ, vẫn giữ chọn
    } else if (d.wasSelected) deselect(); // bấm lại quân đang chọn → bỏ chọn
    return;
  }
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return; // là thao tác xoay camera
  downAt = null;
  if (!canPlay()) return;
  if (cell && state.selected && isTarget(...cell)) doMove([...state.selected, ...cell]);
  else deselect();
});

// ---------- Timer
setInterval(() => {
  if (!state.started || state.over) return;
  state.time[state.turn] -= 1;
  for (const s of ['r', 'b']) {
    const el = $('#timer-' + s);
    el.textContent = fmt(state.time[s]);
    el.classList.toggle('low', state.time[s] < 60);
  }
  if (state.time[state.turn] <= 0) endGame(X.opp(state.turn), 'hết giờ');
}, 1000);

// Khán giả thỉnh thoảng bình luận
setInterval(() => {
  if (!state.started || state.over || document.hidden) return;
  if (Math.random() < 0.22) sayLine(PLAYER[X.opp(state.turn)], LINES.hurry, { X: ADDR[state.turn] });
  else if (Math.random() < 0.35) bubble(pick([3, 4, 5]), pick(LINES.idle), 2800);
  $('#viewers').textContent = 20 + Math.floor(rand(0, 9));
}, 9000);

// ======================================================================
// Vòng lặp render
// ======================================================================
const clock = new THREE.Clock();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
let introSpin = true;
function step() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  const t = clock.elapsedTime;

  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += Math.min(raw, 0.5); // tween theo thời gian thực, không phụ thuộc fps
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }

  if (introSpin) {
    const a = t * 0.08;
    camera.position.set(Math.sin(a) * 7.5, 4.2, Math.cos(a) * 7.5);
    camera.lookAt(0, 0.9, 0);
  } else controls.update();

  // nhân vật: thở, suy nghĩ, phấn khích
  for (const ch of Object.values(CHARS)) {
    if (!ch.pivot) continue;
    const p = ch.pivot;
    if (ch.moodT > 0) { ch.moodT -= dt; if (ch.moodT <= 0) ch.mood = 'idle'; }
    const breathe = 1 + Math.sin(t * 1.8 + ch.phase) * 0.006;
    let rz = Math.sin(t * 0.6 + ch.phase) * 0.012, rx = 0, y = 0;
    if (ch.mood === 'think') { rz = Math.sin(t * 1.4) * 0.035; rx = 0.04 + Math.sin(t * 0.9) * 0.015; }
    if (ch.mood === 'excited') { y = Math.abs(Math.sin(t * 9 + ch.phase)) * 0.045; rz = Math.sin(t * 9) * 0.03; }
    if (ch.mood === 'happy') { rz = Math.sin(t * 6) * 0.05; }
    if (ch.mood === 'sad') { rx = 0.08; rz = 0; }
    p.scale.set(1, breathe, 1);
    p.rotation.z += (rz - p.rotation.z) * 0.2;
    p.rotation.x += (rx - p.rotation.x) * 0.1;
    p.position.y += (y - p.position.y) * 0.4;
    if (ch.puppet) ch.puppet.update(dt);
  }

  // quân đang chọn nhún nhẹ (trừ khi đang kéo)
  if (state.selected && !drag) {
    const p = state.board[state.selected[0]][state.selected[1]];
    const g = p && pieceMeshes.get(p.id);
    if (g) g.position.y = BOARD_Y + 0.018 + Math.sin(t * 6) * 0.006;
    selRing.material.opacity = 0.7 + Math.sin(t * 6) * 0.3;
  }
  if (checkRing.visible) checkRing.material.opacity = 0.55 + Math.sin(t * 10) * 0.45;
  hintRings.forEach(h => (h.material.opacity = 0.6 + Math.sin(t * 5) * 0.4));
  for (const g of Object.values(arrows)) {
    if (!g.visible) continue;
    const age = t - g.userData.t0;
    g.userData.mat.opacity = age < 3 ? 0.75 + Math.sin(t * 8) * 0.2 : 0.35;
  }

  // lá rơi
  for (let i = 0; i < LEAVES; i++) {
    const L = leafData[i];
    L.p.y -= L.s * dt;
    L.p.x += Math.sin(t * 1.3 + L.ph) * dt * 0.25 + dt * 0.12;
    L.p.z += Math.cos(t * 0.9 + L.ph) * dt * 0.15;
    L.r.x += dt * 1.8; L.r.y += dt * 1.1;
    if (L.p.y < 0.02) L.p.set(-3.6 + rand(-3, 3), rand(3.8, 5), -3.4 + rand(-3, 3));
    _q.setFromEuler(L.r);
    _m.compose(L.p, _q, _s);
    leafMesh.setMatrixAt(i, _m);
  }
  leafMesh.instanceMatrix.needsUpdate = true;

  birdCage.rotation.z = Math.sin(t * 0.9) * 0.04;
  bird.rotation.y = Math.sin(t * 0.7) * 1.2;
  bird.position.y = 0.16 + Math.abs(Math.sin(t * 3.1)) * (Math.sin(t * 0.5) > 0.7 ? 0.03 : 0);
  lanterns.forEach(l => (l.rotation.z = Math.sin(t * 1.2 + l.userData.phase) * 0.08));
  clouds.forEach((c, i) => c.position.applyAxisAngle(THREE.Object3D.DEFAULT_UP, dt * 0.004 * (1 + i * 0.1)));

  renderer.render(scene, camera);
  updateBubbles();
}
function tick() { step(); requestAnimationFrame(tick); }

window.__game = { camera, controls, state, CHARS, scene, setView, renderer, step, doMove, X };

let wasPortrait = isPortrait();
function fitCamera() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = isPortrait() ? 56 : 42;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
fitCamera();
addEventListener('resize', () => {
  fitCamera();
  if (state.started && isPortrait() !== wasPortrait) setView(viewIdx, 0.5);
  wasPortrait = isPortrait();
});

// ======================================================================
// Khởi động
// ======================================================================
manager.onProgress = (url, loaded, total) => {
  $('#load-bar').style.width = `${(loaded / total) * 100}%`;
  $('#load-note').textContent = `Đang mời các cụ ra công viên… (${loaded}/${total})`;
};

(async function boot() {
  requestAnimationFrame(tick);
  await Promise.all([document.fonts.load('900 64px "Noto Serif TC"', '帥將楚河漢界'), document.fonts.load('700 20px "Baloo 2"')]).catch(() => {});
  buildBoard();
  buildPieceAssets();
  newGame();
  renderCrowd();
  try {
    await loadCharacters();
    $('#load-note').textContent = 'Bàn cờ đã sẵn sàng. Trà đã pha xong!';
  } catch (err) {
    console.error(err);
    $('#load-note').textContent = 'Không tải được mô hình nhân vật (cần chạy qua HTTP server).';
  }
  $('#load-bar').style.width = '100%';
  const btn = $('#btn-enter');
  btn.disabled = false;
  btn.addEventListener('click', async () => {
    $('#loading').classList.add('done');
    $('#hud').hidden = false;
    introSpin = false;
    camera.lookAt(0, 0.9, 0);
    controls.target.set(0, 0.9, 0);
    state.started = true;
    tock('select');
    await setView(0, 2.2);
    bubble(2, 'Ông Ba, mời ông đi trước!', 2600);
    gesture(2, 'point', { target: pieceTop(cellPos(9, 4)), duration: 2 });
    setTimeout(() => bubble(5, 'Quan kỳ bất ngữ nha mấy ông!', 2600), 1800);
    setTimeout(adviseTurn, 3200);
  }, { once: true });
})();
