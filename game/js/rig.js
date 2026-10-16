// Điều khiển cử động cho nhân vật đã gắn xương (xuất từ tools/blender_rig.py).
// Không dùng clip animation: mỗi frame đưa xương về tư thế gốc rồi cộng các cử chỉ thủ tục
// (chỉ tay, xoa cằm, gãi đầu, ăn mừng, ôm mặt, với tay cầm quân, nhìn theo mục tiêu).
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _id = new THREE.Quaternion();
const smooth = k => k * k * (3 - 2 * k);

const BONE_NAMES = ['root', 'spine', 'head', 'upperArm.L', 'lowerArm.L', 'hand.L', 'upperArm.R', 'lowerArm.R', 'hand.R', 'thigh.L', 'shin.L', 'thigh.R', 'shin.R'];

export class Puppet {
  /** @param {THREE.Object3D} root  gltf.scene đã đặt vào holder */
  constructor(root) {
    this.root = root;
    this.bones = {};
    root.traverse(o => {
      if (o.isBone) this.bones[o.name.replace(/[._]?([LR])$/, '.$1')] = o;
      if (o.isSkinnedMesh) { o.frustumCulled = false; this.mesh = o; }
    });
    this.ok = BONE_NAMES.slice(0, 9).every(n => this.bones[n]);
    this.rest = new Map(Object.values(this.bones).map(b => [b, b.quaternion.clone()]));
    this.active = [];
    this.look = null;      // Vector3 thế giới hoặc hàm trả về Vector3
    this.lookW = 0;        // trọng số nhìn hiện tại (lọc mượt)
    this.lookTarget = 0;
    this.phase = Math.random() * 10;
    this.t = 0;
  }

  // ----- hệ trục của nhân vật trong không gian thế giới
  axes() {
    const q = this.root.getWorldQuaternion(_qi);
    return {
      fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
      left: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
      up: UP,
    };
  }
  unit() { // độ dài thế giới của 1 đơn vị model
    return this.root.getWorldScale(_a).y;
  }
  pos(name, out = new THREE.Vector3()) { return this.bones[name].getWorldPosition(out); }

  // ----- phép quay thế giới áp vào xương
  rotateWorld(bone, axisWorld, angle) {
    if (!angle) return;
    bone.parent.getWorldQuaternion(_qp);
    _a.copy(axisWorld).applyQuaternion(_qp.invert()).normalize();
    _q.setFromAxisAngle(_a, angle);
    bone.quaternion.premultiply(_q);
    bone.updateMatrixWorld(true);
  }
  // xoay xương sao cho hướng (xương -> child) chỉ về target, theo trọng số w
  aim(boneName, childName, target, w) {
    if (w <= 0) return;
    const bone = this.bones[boneName], child = this.bones[childName];
    const p = bone.getWorldPosition(_a), c = child.getWorldPosition(_b);
    const cur = c.sub(p).normalize();
    const want = _c.copy(target).sub(p).normalize();
    _qi.setFromUnitVectors(cur, want);
    _q.slerpQuaternions(_id, _qi, Math.min(1, w));
    bone.parent.getWorldQuaternion(_qp);
    const local = _qp.clone().invert().multiply(_q).multiply(_qp);
    bone.quaternion.premultiply(local);
    bone.updateMatrixWorld(true);
  }

  // ----- phát cử chỉ
  play(name, opts = {}) {
    if (!this.ok || !GESTURES[name]) return Promise.resolve();
    const g = { name, t: 0, dur: opts.duration ?? 2.5, fadeIn: opts.fadeIn ?? 0.35, fadeOut: opts.fadeOut ?? 0.45, p: opts, w: 0 };
    // cử chỉ dùng cùng tay thì thay thế cái cũ
    this.active.forEach(a => { if (GESTURES[a.name].arms(a.p) & GESTURES[name].arms(opts)) a.dur = Math.min(a.dur, a.t + a.fadeOut); });
    this.active.push(g);
    return new Promise(res => (g.res = res));
  }
  busy() { return this.active.some(a => a.t < a.dur - a.fadeOut); }
  stopAll(name) { this.active.forEach(a => { if (!name || a.name === name) a.dur = Math.min(a.dur, a.t + a.fadeOut); }); }

  update(dt) {
    if (!this.ok) return;
    this.t += dt;
    const t = this.t + this.phase;
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    this.root.updateMatrixWorld(true);
    const ax = this.axes();

    for (let i = this.active.length - 1; i >= 0; i--) {
      const g = this.active[i];
      g.t += dt;
      g.w = smooth(Math.min(1, g.t / g.fadeIn, Math.max(0, (g.dur - g.t) / g.fadeOut)));
      if (g.t >= g.dur) { this.active.splice(i, 1); g.res && g.res(); }
    }

    // 1) thân: thở + nghiêng người theo các cử chỉ
    let lean = Math.sin(t * 1.7) * 0.012, twist = 0, side = 0;
    let lookAt = null, lookW = 0;
    for (const g of this.active) {
      const s = GESTURES[g.name].body?.(this, g, t, ax) || {};
      lean += (s.lean || 0) * g.w; twist += (s.twist || 0) * g.w; side += (s.side || 0) * g.w;
      if (s.look && g.w > lookW) { lookAt = s.look; lookW = g.w; }
    }
    lean *= this.leanScale ?? 1; // góc nhìn thứ nhất: cúi ít để đầu không che camera
    const spine = this.bones.spine;
    // đứng lâu: dồn trọng tâm sang chân này rồi chân kia (hông nghiêng, chân giữ thẳng)
    const sway = (Math.sin(t * 0.45) * 0.8 + Math.sin(t * 0.17) * 0.4) * 0.03;
    if (this.bones['thigh.L'] && this.bones['thigh.R']) {
      this.rotateWorld(this.bones.root, ax.fwd, sway);
      this.rotateWorld(this.bones['thigh.L'], ax.fwd, -sway);
      this.rotateWorld(this.bones['thigh.R'], ax.fwd, -sway);
      side -= sway * 0.7;
    }
    this.rotateWorld(spine, ax.left, lean);
    this.rotateWorld(spine, UP, twist);
    this.rotateWorld(spine, ax.fwd, side);

    // 2) đầu: nhìn mục tiêu (cử chỉ ưu tiên hơn ánh nhìn mặc định)
    this.lookTarget = lookAt ? 1 : this.look ? 0.75 : 0;
    this.lookW += (Math.max(this.lookTarget, lookW) - this.lookW) * Math.min(1, dt * 4);
    const tgt = lookAt || (typeof this.look === 'function' ? this.look() : this.look);
    if (tgt && this.lookW > 0.01) this.lookHead(tgt, this.lookW, ax);
    else this.rotateWorld(this.bones.head, UP, Math.sin(t * 0.4) * 0.12);
    for (const g of this.active) GESTURES[g.name].head?.(this, g, t, ax);

    // 3) tay
    for (const g of this.active) GESTURES[g.name].pose?.(this, g, t, ax);
  }

  lookHead(target, w, ax) {
    const head = this.bones.head;
    const hp = head.getWorldPosition(_a);
    const d = _b.copy(typeof target === 'function' ? target() : target).sub(hp);
    const x = d.dot(ax.left), y = d.y, z = d.dot(ax.fwd);
    const yaw = THREE.MathUtils.clamp(Math.atan2(x, Math.max(z, 0.05)), -1.0, 1.0);
    const pitch = THREE.MathUtils.clamp(Math.atan2(y, Math.hypot(x, z)), -0.6, 0.45);
    this.rotateWorld(head, UP, yaw * w * 0.8);
    this.rotateWorld(head, ax.left, -pitch * w * 0.7);
  }

  // tay gần mục tiêu hơn (theo trục trái/phải của nhân vật)
  sideFor(target) {
    const ax = this.axes();
    const d = _a.copy(target).sub(this.pos('spine', _b));
    return d.dot(ax.left) >= 0 ? 'L' : 'R';
  }
}

const val = v => (typeof v === 'function' ? v() : v);
const ARM = { L: 1, R: 2 };
const armsOf = p => ARM[p.side] || 3;
const both = p => (p.only ? ARM[p.only] : 3);
const sidesOf = p => (p.only ? [p.only] : ['L', 'R']);

// Mỗi cử chỉ: arms (bitmask tay dùng), body (nghiêng thân / nhìn), head (thêm), pose (tay)
const GESTURES = {
  // chỉ tay vào một điểm trên bàn cờ, nhấp nhấp ngón tay
  point: {
    arms: armsOf,
    body: (P, g, t) => ({ lean: 0.3, twist: 0, look: val(g.p.target) }),
    pose(P, g, t, ax) {
      const s = g.p.side, u = P.unit();
      const T = _c.copy(val(g.p.target));
      T.y += Math.max(0, Math.sin(g.t * 9)) * 0.06 * u * 2; // nhấp ngón tay
      const target = T.clone();
      P.aim(`upperArm.${s}`, `lowerArm.${s}`, target.clone().addScaledVector(UP, 0.18 * u), g.w);
      P.aim(`lowerArm.${s}`, `hand.${s}`, target, g.w);
    },
  },
  // với tay cầm quân (người chơi), target có thể là hàm -> tay đi theo quân cờ
  reach: {
    arms: armsOf,
    body: (P, g) => ({ lean: 0.5, look: val(g.p.target) }),
    pose(P, g) {
      const s = g.p.side, T = val(g.p.target).clone();
      P.aim(`upperArm.${s}`, `lowerArm.${s}`, T.clone().addScaledVector(UP, 0.12 * P.unit()), g.w);
      P.aim(`lowerArm.${s}`, `hand.${s}`, T, g.w);
    },
  },
  // xoa cằm suy nghĩ
  think: {
    arms: armsOf,
    body: (P, g, t) => ({ lean: 0.05, side: Math.sin(t * 0.8) * 0.03, look: g.p.look ? val(g.p.look) : null }),
    head: (P, g, t, ax) => P.rotateWorld(P.bones.head, ax.fwd, 0.12 * g.w * (g.p.side === 'L' ? -1 : 1)),
    pose(P, g, t, ax) {
      const s = g.p.side, u = P.unit();
      const sh = P.pos(`upperArm.${s}`);
      const neck = P.pos('head');
      const chin = neck.clone().addScaledVector(ax.fwd, 0.3 * u).addScaledVector(UP, 0.12 * u + Math.sin(t * 5) * 0.015 * u);
      const elbow = sh.clone().addScaledVector(ax.fwd, 0.45 * u).addScaledVector(UP, -0.28 * u);
      P.aim(`upperArm.${s}`, `lowerArm.${s}`, elbow, g.w);
      P.aim(`lowerArm.${s}`, `hand.${s}`, chin, g.w);
    },
  },
  // gãi đầu (bối rối)
  scratch: {
    arms: armsOf,
    body: () => ({ lean: -0.03 }),
    head: (P, g, t, ax) => P.rotateWorld(P.bones.head, ax.fwd, 0.15 * g.w * (g.p.side === 'L' ? -1 : 1)),
    pose(P, g, t, ax) {
      const s = g.p.side, u = P.unit(), sgn = s === 'L' ? 1 : -1;
      const sh = P.pos(`upperArm.${s}`);
      const top = P.pos('head').addScaledVector(UP, 0.45 * u).addScaledVector(ax.left, sgn * 0.12 * u)
        .addScaledVector(ax.fwd, Math.sin(t * 14) * 0.04 * u);
      const elbow = sh.clone().addScaledVector(ax.left, sgn * 0.5 * u).addScaledVector(UP, 0.25 * u).addScaledVector(ax.fwd, 0.15 * u);
      P.aim(`upperArm.${s}`, `lowerArm.${s}`, elbow, g.w);
      P.aim(`lowerArm.${s}`, `hand.${s}`, top, g.w);
    },
  },
  // hai tay giơ cao ăn mừng
  cheer: {
    arms: both,
    body: (P, g, t) => ({ lean: -0.08 + Math.sin(t * 10) * 0.03 }),
    pose(P, g, t, ax) {
      const u = P.unit();
      for (const s of sidesOf(g.p)) {
        const sgn = s === 'L' ? 1 : -1;
        const sh = P.pos(`upperArm.${s}`);
        const wave = Math.sin(t * 10 + (s === 'L' ? 0 : 1.5)) * 0.12 * u;
        const up = sh.clone().addScaledVector(UP, 1.0 * u).addScaledVector(ax.left, sgn * (0.45 * u + wave)).addScaledVector(ax.fwd, 0.15 * u);
        P.aim(`upperArm.${s}`, `lowerArm.${s}`, up, g.w);
        P.aim(`lowerArm.${s}`, `hand.${s}`, up.clone().addScaledVector(UP, 0.6 * u), g.w);
      }
    },
  },
  // chắp tay sau lưng (dáng ông cụ đứng xem cờ)
  behind: {
    arms: both,
    body: () => ({ lean: 0.06 }),
    pose(P, g, t, ax) {
      const u = P.unit();
      const back = P.pos('spine').addScaledVector(UP, 0.2 * u).addScaledVector(ax.fwd, -0.36 * u);
      for (const s of sidesOf(g.p)) {
        const sgn = s === 'L' ? 1 : -1;
        const sh = P.pos(`upperArm.${s}`);
        P.aim(`upperArm.${s}`, `lowerArm.${s}`, sh.clone().addScaledVector(UP, -0.4 * u).addScaledVector(ax.fwd, -0.22 * u).addScaledVector(ax.left, sgn * 0.08 * u), g.w);
        P.aim(`lowerArm.${s}`, `hand.${s}`, back.clone().addScaledVector(ax.left, -sgn * 0.08 * u), g.w);
      }
    },
  },
  // khoanh tay trước ngực
  cross: {
    arms: both,
    body: () => ({ lean: -0.03 }),
    pose(P, g, t, ax) {
      const u = P.unit();
      for (const s of sidesOf(g.p)) {
        const sgn = s === 'L' ? 1 : -1;
        const sh = P.pos(`upperArm.${s}`);
        const elbow = sh.clone().addScaledVector(UP, -0.34 * u).addScaledVector(ax.fwd, 0.3 * u).addScaledVector(ax.left, sgn * 0.06 * u);
        const hand = P.pos('spine').addScaledVector(UP, (s === 'L' ? 0.5 : 0.56) * u).addScaledVector(ax.fwd, 0.5 * u).addScaledVector(ax.left, -sgn * 0.26 * u);
        P.aim(`upperArm.${s}`, `lowerArm.${s}`, elbow, g.w);
        P.aim(`lowerArm.${s}`, `hand.${s}`, hand, g.w);
      }
    },
  },
  // vỗ tay
  clap: {
    arms: both,
    body: () => ({ lean: 0.05 }),
    pose(P, g, t, ax) {
      const u = P.unit();
      const chest = P.pos('spine').addScaledVector(UP, 0.45 * u).addScaledVector(ax.fwd, 0.55 * u);
      const open = (Math.sin(t * 16) * 0.5 + 0.5) * 0.12 * u;
      for (const s of sidesOf(g.p)) {
        const sgn = s === 'L' ? 1 : -1;
        const sh = P.pos(`upperArm.${s}`);
        P.aim(`upperArm.${s}`, `lowerArm.${s}`, sh.clone().addScaledVector(ax.fwd, 0.4 * u).addScaledVector(UP, -0.3 * u).addScaledVector(ax.left, sgn * 0.1 * u), g.w);
        P.aim(`lowerArm.${s}`, `hand.${s}`, chest.clone().addScaledVector(ax.left, sgn * open), g.w);
      }
    },
  },
  // ôm mặt / thất vọng
  facepalm: {
    arms: armsOf,
    body: () => ({ lean: 0.18 }),
    head: (P, g, t, ax) => P.rotateWorld(P.bones.head, ax.left, 0.25 * g.w),
    pose(P, g, t, ax) {
      const s = g.p.side, u = P.unit(), sgn = s === 'L' ? 1 : -1;
      const sh = P.pos(`upperArm.${s}`);
      const face = P.pos('head').addScaledVector(UP, 0.32 * u).addScaledVector(ax.fwd, 0.3 * u).addScaledVector(ax.left, sgn * 0.05 * u);
      P.aim(`upperArm.${s}`, `lowerArm.${s}`, sh.clone().addScaledVector(ax.fwd, 0.5 * u).addScaledVector(UP, -0.1 * u), g.w);
      P.aim(`lowerArm.${s}`, `hand.${s}`, face, g.w);
    },
  },
  // nhún vai (chịu thua)
  shrug: {
    arms: both,
    body: () => ({ lean: -0.04 }),
    head: (P, g, t, ax) => P.rotateWorld(P.bones.head, ax.fwd, 0.15 * g.w),
    pose(P, g, t, ax) {
      const u = P.unit();
      for (const s of sidesOf(g.p)) {
        const sgn = s === 'L' ? 1 : -1;
        const sh = P.pos(`upperArm.${s}`);
        const el = sh.clone().addScaledVector(ax.left, sgn * 0.35 * u).addScaledVector(UP, -0.35 * u);
        P.aim(`upperArm.${s}`, `lowerArm.${s}`, el, g.w * 0.8);
        P.aim(`lowerArm.${s}`, `hand.${s}`, el.clone().addScaledVector(ax.left, sgn * 0.4 * u).addScaledVector(UP, 0.25 * u).addScaledVector(ax.fwd, 0.2 * u), g.w);
      }
    },
  },
};
export const GESTURE_NAMES = Object.keys(GESTURES);
