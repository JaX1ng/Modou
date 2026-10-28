'use strict';
/* 角色：状态机、物理（跑动、跳跃惯性、空中微调）、朝向、出招/取消、特殊动作（闪步/推挡/爆气/泼墨/过肩摔/坠山）、动画与发带物理
   1.8.0：擒住与后续（提膝 / 别腿摔 / 过肩摔 / 推开 / 抱腿摔）、挣脱、截击、踩腿、借力摔、滚身起 */

/* ============================================================
   角色
   朝向规则（1.9.0）：按着方向不出招 = 跑，马上朝那边（没有后退、不粘手）；
   不按左右 / 蹲 / 格挡 / 挡住的硬直：自动面向对手（不管远近，game.js 和 groundCtl 里做）；
   出招：对手在 ASSIST_R 以内一律朝对手打（按对手出手时的位置估），远了才照按的方向
   ============================================================ */
const ACTIONABLE = new Set(['idle', 'run', 'crouch', 'block']);
const dirOf = h => (h.right ? 1 : 0) - (h.left ? 1 : 0);
/* 1.9.4 出招不冲过人：招式的前冲（lunge）冲进对手身子里（两人中心只差 gap ≤ 一个身子半宽）就停，
   不会冲过对手、招打在身后的空气上（以前跑着贴脸按重，沉肩靠会冲过去打空）。
   对手在空中不挡（能从底下钻过去）；冲刺是 script 动作，不走这里（就是要穿过去） */
const lungeStop = (gap, o) => !o.airborne && gap >= 0 && gap <= PUSH;
const PULL_K = lerpK(0.3);          // 擒住时每帧把对手往怀里带三成 → 每步带多少（2.6）
// 画面上「每帧往目标挪 k」换成每步（只是画面，可以用缓存；联机重算时不跑）
const LK_CACHE = {};
const lk = k => LK_CACHE[k] || (LK_CACHE[k] = lerpK(k));
// 发带（2.6 Jack：短一点点、细一点点）：8 个点、每节 6.5 → 5.7（长 45 → 40）；画的宽度在 render.js
// 2.7（Jack：飘得太快，和待机、打斗的动作都对不上；再短一点点）：每节 5.7 → 5.1（长 40 → 36）；
//     风变小、变慢（自己一阵一阵晃的那点：一秒多一下、上下甩 20 多像素 → 两三秒一下、几像素），阻尼大一点（每帧剩 86% → 80%）：
//     站着时跟着呼吸轻轻摆，动起来是身子带着它甩，不自己乱扑腾
const RIB_N = 8, RIB_SEG = 5.1, RIB_DAMP = rootDT(0.8);
const RIB_WIND = 0.15, RIB_GUST = [0.024, 0.03];   // 风往身后吹多大；一阵一阵晃的两层（慢的那层两三秒一下）
// 对手正起跳下蹲：马上要跳出去的水平速度（和 update 里 jumpsquat 那段一样算）
function takeoffVx(o) {
  const dir = dirOf(o.inp.held);
  return o.takeoffV > 0 && dir !== -o.facing ? o.facing * Math.max(o.takeoffV * RUN_CARRY, JUMP_VX) : dir * JUMP_VX;
}
/* ---------- 跑步循环 ----------
   一条腿一个周期 u∈[0,1)：0 脚在身前落地 → 0~RUN_ST 踩地往后蹬（脚相对髋匀速后移 = 跑速，不打滑）
   → 离地、脚跟往后上方收 → 提膝往前带 → 小腿前伸准备落地。另一条腿差半个周期；两脚都离地时身体腾空。
   手臂按角度算：肩膀前后摆、肘弯着，和同侧腿反着摆（左腿在前时左手在后）。 */
const TAU = Math.PI * 2;
// 1.9.0：以前踩地占三成多、步子小，看着像竞走。现在踩地只占四分之一出头、步子大：
// 蹬地后脚跟往后上方甩到屁股高，再提膝往前带、小腿甩出去 —— 两脚都离地的时间长，人是一窜一窜往前飞的（火影手游那种跑法）
// 2.4 腿长了（69 → 76）：步子、抬腿跟着放大一成
const RUN_ST = 0.26, RUN_X0 = 40, RUN_X1 = -46;           // 踩地占周期的比例、落地点、蹬离点（相对髋）
const RUN_SWING = [[0, RUN_X1, 0], [0.14, -66, 24], [0.34, -44, 51], [0.55, 4, 48], [0.76, 46, 33], [0.9, 51, 13], [1, RUN_X0, 0]];  // [进度, x, 离地高]
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}
function runLeg(u) {
  u -= Math.floor(u);
  if (u < RUN_ST) return [RUN_X0 + (RUN_X1 - RUN_X0) * u / RUN_ST, 0];
  const s = (u - RUN_ST) / (1 - RUN_ST), K = RUN_SWING;
  let i = 0; while (i < K.length - 2 && s > K[i + 1][0]) i++;
  const t = (s - K[i][0]) / (K[i + 1][0] - K[i][0]);
  const a = K[Math.max(0, i - 1)], b = K[i], c = K[i + 1], d = K[Math.min(K.length - 1, i + 2)];
  return [catmull(a[1], b[1], c[1], d[1], t), Math.max(0, catmull(a[2], b[2], c[2], d[2], t))];
}
/* ---------- 过肩摔时对手的路线 ----------
   相对出手方：[进度 0~1, x（按出手方朝向，正 = 身前）, 离地, 转角]。从身前被拽近 → 扛过头顶 → 甩到身后砸地。
   x、离地是战斗逻辑（每帧由出手方摆位置），只用加减乘除算，联机两边算出来一样；转角只给画面用 */
const THROW_LAND = 72;     // 摔到身后多远
const THROW_PATH = [[0, null, 0, 0], [0.25, 42, 26, 30], [0.5, 12, 92, 120], [0.75, -34, 92, 204], [1, -THROW_LAND, 20, 266]];
function throwPath(u, x0) {
  const K = THROW_PATH, X = i => K[clamp(i, 0, K.length - 1)][1] === null ? x0 : K[clamp(i, 0, K.length - 1)][1];
  let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const t = clamp((u - K[i][0]) / (K[i + 1][0] - K[i][0]), 0, 1);
  const x = catmull(X(i - 1), X(i), X(i + 1), X(i + 2), t);
  const alt = catmull(K[Math.max(0, i - 1)][2], K[i][2], K[i + 1][2], K[Math.min(K.length - 1, i + 2)][2], t);
  return [x, Math.max(0.01, alt), K[i][3] + (K[i + 1][3] - K[i][3]) * t];
}
// 手：u 是同侧腿的相位。返回手相对肩膀的位置（世界方向，已经算进上身前倾 tor）
// 1.9.0：摆幅加大 —— 往前摆时手送到肩膀前面，往后摆时整条胳膊甩到身后
// 1.9.4（Jack：小臂别往前伸那么多，往前上一点）：往前摆时大臂少抬一点（80° → 70°）、肘弯得更多，
// 小臂斜着往前上（摆到最前面时小臂高过水平 50° 多），手不再平平地往前够；往后甩不变
// 2.9（Jack：跑步的时候手摆的幅度小一点）：50° / 46° → 34° / 30°（2.5 是 70° / 66°）
const RUN_ARM_F = 34, RUN_ARM_B = 30;
function runArm(u, tor, amp) {
  const c = Math.cos(TAU * (u - 0.04));                  // c=1：同侧腿刚落地 → 这只手摆到最后
  const fwd = c < 0;
  // 2.6（Jack：跑步手臂太甩了）：前后摆幅 70° / 66° → 50° / 46°；2.9 → 34° / 30°
  const th = ((fwd ? -c * RUN_ARM_F : -c * RUN_ARM_B) * amp + 6 - tor * 0.6) * D2R;   // 上臂离竖直向下的角度（正 = 往前）
  // 2.6 摆幅小了，往前送时肘再多弯一点（72 - 14c → 74 - 20c），小臂照旧斜着朝前上（Jack 1.9.4 要的），不是平平地往前够；
  // 2.9 大臂摆得更小，肘再收一点（74 → 92）：小臂还是斜着朝前上，手收在胸口前，不往外甩；往后甩时也收一点（72 → 66）
  const ph = (fwd ? 92 - 20 * c : 66 - 34 * c) * D2R;                    // 肘弯：往前送时弯得多（小臂朝前上），往后甩时半张
  const ex = Math.sin(th) * BONE.ua, ey = Math.cos(th) * BONE.ua;
  return [ex + Math.sin(th + ph) * BONE.fa, ey + Math.cos(th + ph) * BONE.fa];
}

const FIT_KEYS = ['hip', 'neck', 'head', 'shF', 'shB', 'fe', 'be', 'fh', 'bh', 'fk', 'bk', 'ff', 'bf'];   // fitContact 粗看一眼用的关节
const FIT_CORE = new Set(['torso', 'head']), FIT_FEET = new Set(['FF', 'BF']);
class Fighter {
  constructor(idx, cfg) {
    this.idx = idx; this.setLook(cfg.look);
    this.style = cfg.style || STYLE_DEFAULT;   // 2.7.1 拳派（现在只有「传统格斗」trad，见 moves.js 的 STYLES）：出招、取消、连招变招都查这一派的表
    this.inp = new Input(); this.opp = null;
    this.disp = mk(); this.tgt = mk();
    this.maxHp = MAX_HP;
    this.reset(cfg.x, cfg.facing);
  }
  reset(x, facing) {
    this.x = x; this.facing = facing; this.alt = 0; this.vz = 0; this.vx = 0; this.kvx = 0; this.vxCap = AIR_DRIFT; this.takeoffV = 0;
    this.hp = this.maxHp; this.lagHp = this.maxHp; this.state = 'idle'; this.t = 0; this.move = null;
    this.dashEnd = -999; this.info = null; this.comboDmg = 0; this.maxComboDmg = 0; this.prevCombo = null; this.freeAt = -999;
    this.chain = []; this.chainIdle = 99; this.slowJab = 0; this.airUsed = false; this.lowBlock = false;
    this.stunT = 0; this.hurtHeavy = false; this.grabbed = false; this.downPhase = null; this.lieT = LIE_GROUND; this.landT = 4; this.riseT = RISE;
    this.combo = 0; this.comboT = 0; this.comboLive = false; this.comboTaken = 0; this.rushStamped = false;
    this.clock = 0; this.serial = 0; this.walkPhase = 0; this.runT = 0; this.airT = 0; this.leapJump = false;
    this.carried = false; this.carry0 = 0; this.carryRot = 0; this.slam = false; this.qiGlow = 0; this.heat = 0; this.hitFlash = 0; this.hitShake = 0;
    this.lieKind = 0; this.gwalk = 0; this.slipGot = false;   // 2.0：躺姿（画面）、边挡边走（画面）、闪身躲过了重拳（接着回身肘）
    this.flow = 0; this.reelKind = null;                      // 2.9 顺几级（咏春拳）、被什么弄失衡的（拍开 / 耕开 / 截脚……）
    this.stuck = false; this.shook = false; this.prone = false; this.carryPose = null;   // 2.10 被咏春拳黏住（搭手）、刚甩开手（画面）、趴着倒地（画面）、被拽 / 被扛的样子（画面）
    this.stagger = false;                                     // 2.0.2 被回身肘打中、背对着踉跄（在 hit 状态里）
    this.qi = 0; this.reel = false; this.clashed = false; this.noParry = false;
    this.guardOn = -1; this.stompFor = -1; this.reelBy = -1; this.reelKD = false; this.rollDir = 0; this.heldAt = -999;
    this.prevBlock = false; this.blockPress = -999; this.parryOK = false;
    this.prevL = false; this.prevR = false; this.tapL = -999; this.tapR = -999; this.dashT = -999; this.dashDir = facing; this.dashFace = facing;
    this.trail = []; this.ghosts = []; this.history = [];
    this.stats = { hits: 0, maxCombo: 0, blocks: 0, specials: 0, parries: 0, clashes: 0, presses: 0, punishes: 0, escapes: 0, supers: 0 };
    copyPose(this.disp, this.poses.stance); this.hipY = -62; this.J = null;
    this.inp.clear();
    this.fk();
    // 发带：两条从头带结上飘出去（2.0.2 以前还有第三条从腰上飘，改成箍着的腰带了，见 body.js drawWaistBelt）
    this.ribbons = [0, 1].map(() => {
      const a = this.J.knot, pts = [];
      for (let i = 0; i < RIB_N; i++) pts.push({ x: a[0] - facing * i * RIB_SEG, y: a[1] + i * 2, px: a[0] - facing * i * RIB_SEG, py: a[1] + i * 2 });
      return pts;
    });
  }
  // 外观（颜色、名字）只影响画面，不进战斗逻辑。2.0.2 头带、发带、腰带用身体色提亮的那一版（palOf 的 band）
  setLook(id) {
    const p = lookOf(id) || PALETTE[0];
    this.look = p.id; this.color = p.color; this.sash = palOf(p.color).band; this.text = p.text; this.name = p.name;
  }
  get airborne() { return this.alt > 0 || this.vz > 0; }
  get moves() { return styleOf(this).moves; }        // 2.7.1 自己这一派的招式表（传统格斗 MOVES，咏春拳 WMOVES）
  get poses() { return styleOf(this).poses || POSE; } // 2.9 自己这一派的架势（站、蹲、挡……；咏春拳是问手 + 护手、竖掌）
  actionable() { return ACTIONABLE.has(this.state); }
  rollLen(dir) { return dir === this.facing ? ROLL_DIST : ROLL_BACK; }   // 2.7 滚身起滚多远：往前（面朝的方向）96、往后 64
  // 第 r[0] ~ r[1] 帧（含）：2.6 起时间带小数，按「第 k 帧 = [k, k+1)」比
  inFrames(key) {
    const m = this.move, r = m && this.state === 'attack' ? m.def[key] : null;
    return !!r && m.t >= r[0] && m.t < r[1] + 1;
  }
  invuln() { return this.state === 'down' || this.state === 'ko' || this.state === 'win' || this.state === 'tumble' || this.inFrames('inv'); }
  strikeInv() { return this.inFrames('sinv'); }
  airInv() { return this.inFrames('airInv'); }
  // 霸体：重招前摇里，还能硬吃 tier 这一系的打击
  armored(tier) {
    const m = this.move;
    if (this.state !== 'attack' || !m || !m.def.armor || m.armorLeft <= 0) return false;
    const a = m.def.armor;
    return m.t >= a.from && m.t < m.S + 1 && (!tier || a.vs.includes(tier));
  }
  facingTo(other) { return (other.x - this.x) * this.facing >= -4; }
  isBlocking() { return (this.state === 'block' || this.state === 'blockstun') && !this.airborne; }
  isCrouching() { return this.state === 'crouch' || ((this.state === 'block' || this.state === 'blockstun') && this.lowBlock); }
  blockHeightOK(h) { return h === 'low' ? this.lowBlock : h === 'high' ? !this.lowBlock : true; }
  parryReady() { return !this.noParry && this.parryOK && this.clock - this.blockPress < PARRY_WIN + 1; }
  gainQi(n) { this.qi = clamp(Math.round((this.qi + n) * 10) / 10, 0, QI_MAX); }   // 保留一位小数，联机两边算出来一样
  runSpeed() { return Math.min(RUN_MAX, RUN_START + this.runT * RUN_ACC); }
  // 贴得很近时朝向对方
  snapFace() {
    const dx = this.opp.x - this.x;
    if (dx && Math.abs(dx) < FACE_SNAP) this.facing = dx > 0 ? 1 : -1;
  }
  /* 出招朝哪边（1.9.4 aimSide，代替 1.9.0 的 oppSide）。
     把这一招从按下到判定结束这几帧，两个人会走到哪，照 update / separate 的算法推一遍：
       自己 —— 这一招的前冲（贴到对手身上就停）、跑着 / 冲刺带的惯性、在空中的水平速度（坠山腾起来时只剩三成）；
       对手 —— 在空中的照惯性飞、会落地，正起跳下蹲的按马上要跳的方向跳；在地上跑、冲刺不猜（从身边挤过去、冲刺穿过去算他躲开了）；
       两人都在地上、身子叠着就互相推开（软碰撞）。
     朝左、朝右各推一遍：判定那几帧里打得到对手的帧多的那边赢（地上的招还要看对手是不是跳得太高）；
     一样多（都打得到 / 都打不到）就看判定开始那一帧，朝哪边对手更在面前（差不多就不转；对手还蹲着没起跳，就当他不跳来算）。
     1.9.0 只估「出手那一帧」，自己的前冲、坠山腾起来减速都没算进去：跳着往前、离对手近的时候按坠山，会转身往反方向踩。
     只用加减乘除，联机两边算出来一样 */
  // 正在冲刺、冲刺的前冲还没走完（这时回身出招，人还往原来的方向滑）
  dashTurning() { const m = this.move; return this.state === 'attack' && !!m && m.name === 'dash' && m.t < m.def.lunge[1]; }
  aimSide(d) {
    // 2.6 一步一步推（DT 帧一步，和 update 一样的物理）；判定帧按「第 k 帧 = [k, k+1)」：S + 1 起、到 S + A + 1 之前
    const me = this, o = this.opp, air = this.airborne, S = d.S, n = d.dive ? S + FE : S + d.A + FE;   // 坠山只看出脚那一刻（出脚时还会再瞄一次，见 aimDive）
    const lg = !air && !d.script && d.lunge ? d.lunge : null, lstep = lg ? lg[2] / (lg[1] - lg[0]) : 0;
    const keepR = dirOf(this.inp.held) ? 1 : AIR_DRAG_DT.r, keepC = dirOf(this.inp.held) ? DT : AIR_DRAG_DT.cp;
    const run = this.state === 'run' ? this.facing * this.runSpeed() * 0.5 : 0;   // 跑着出招带的惯性（startAttack / beginMove 里加的）
    const dashIn = !air && !d.script && d.kind !== 'push' && ((this.state === 'attack' && !!this.move && this.move.name === 'dash') || this.clock - this.dashEnd <= DASH_IN_WIN);
    const turnKv = this.dashTurning() ? this.facing * DASH_TURN_KV : 0;   // 冲刺里回身：往原来的方向滑（startAttack）
    // 地上的招打得到多高（和 combat.js reaches 一样）：对空招更高；对手在出坠山、空中出腿时另算；擒拿只抓得到离地 24 以内的（grabIntent）
    const om = o.state === 'attack' ? o.move : null;
    const reachUp = air ? Infinity : d.kind === 'grab' ? 24 : Math.max(d.antiAir || AIR_SAFE, om && om.def.dive ? DIVE_AA_ALT : 0,
      d.tier === 'kick' && d.height !== 'low' && om && om.air && om.def.kind === 'kick' ? KICK_AA_ALT : 0);
    /* 2.0.2（Jack：坠山在头顶上的时候，底下的人还没等它跳到身后就往身后打，打空了）：对手在空中怎么飞，照 update 的算法推得更准 ——
       · 对手在出坠山（还没踩中）：前摇里重力减半、横着匀速飘（方向键管不了，只剩起跳时三成的速度）；出脚那一帧（t === S）
         他会按「我」这时候在哪重新瞄（和 aimDive 一样），然后直线往下踩、落在我身上 —— 以前当他照惯性一直往前飞，算出来他会落到我身后，就转身往后打空了；
       · 普通跳在空中按着方向：会加速 / 减速（AIR_ACC，有上限），松开才慢慢变慢（以前一律按松开算）；
       · 被顶回去翻跟头（tumble）：横着匀速飞，方向键管不了；
       · 他空中的招（坠山、飞踢、挥拳、坠山击）在判定帧里够到我了：他就停在那儿 —— 真打起来是我先挨这一下，
         以前接着按惯性推，推出来他「飞过我、落到我身后」，我的招慢一点就转身往后打，结果背对着挨踢 / 挨踩 */
    const odir = o.state === 'tumble' ? 0 : dirOf(o.inp.held);
    const oam = om && om.air && !om.hit && !om.blocked ? om : null, odv = oam && oam.def.dive ? oam : null;
    const ducks = !air && d.height === 'low';               // 我这一招身子压得低：飞踢踢不到（evadeCrouch）
    const inR = (r, t) => !!r && t >= r[0] && t < r[1] + 1;
    const immune = t => inR(d.inv, t) || inR(d.sinv, t) || (!odv && inR(d.airInv, t));   // 我这一招第 t 帧打不中（无敌、托天掌的对空无敌）
    const meAlt = air ? me.alt : 0;
    const sim = (f, fly) => {                               // fly = false：对手正起跳下蹲也当他不跳（只用来定「一样多」时转不转）
      let sx = me.x, kv = me.kvx + run + (dashIn && f === me.dashFace ? f * 5 : 0) + (f !== me.facing ? turnKv : 0), sv = air ? me.vx * (d.dive ? 0.3 : 1) : 0;
      let ox = o.x, oz = o.alt, ovz = o.vz, okv = o.kvx, ov = o.airborne ? o.vx : 0, oAir = o.airborne, ocap = o.vxCap;
      let squat = fly && o.state === 'jumpsquat' ? Math.max(DT, 3 - o.t) : 0;
      let dt = oam ? oam.t : 0, dface = o.facing, ddvx = odv ? odv.dvx : undefined, ostop = false, mt = 0;
      const oStep = () => {                                  // 对手走一步
        if (ostop) return;
        if (odv && oAir && dt === odv.S + FE) {              // 坠山出脚：重新瞄准我（aimDive）
          const f0 = Math.max(1, Math.ceil((oz - meAlt - odv.def.vreach) / DIVE_VZ)), dx = sx - ox;
          if (Math.abs(dx) >= 3) dface = dx > 0 ? 1 : -1;
          ddvx = clamp((dx * dface - DIVE_AIM) / f0, 0, DIVE_VX);
        }
        if (oam) dt += DT;
        ox += okv * KB_DAMP.c; okv *= KB_DAMP.r;
        if (squat > 0) { ox += o.facing * o.takeoffV * DT; squat -= DT; if (squat > 1e-9) return; ov = takeoffVx(o); ovz = JUMP_V; oz = 0.01; oAir = true; ocap = Math.max(AIR_DRIFT, Math.abs(ov)); }
        if (!oAir) return;
        let cx = DT;
        if (odv) {                                           // 坠山
          const div = dt >= odv.S + 1;
          if (div) { ovz = -DIVE_VZ; ov = dface * (ddvx === undefined ? DIVE_VX : ddvx); oz += ovz * DT; }
          else { oz += ovz * DT + GRAV * 0.5 * GH; ovz -= GRAV * 0.5 * DT; }
        } else {
          oz += ovz * DT + GRAV * GH; ovz -= GRAV * DT;
          if (o.state !== 'tumble') {
            if (odir) {
              const same = odir * ov > 0; if (!same) ocap = AIR_DRIFT;
              const lim = same ? Math.max(AIR_DRIFT, ocap) : AIR_DRIFT;
              ov += odir * AIR_ACC * DT; if (odir * ov > lim) ov = odir * lim;
            } else { ov *= AIR_DRAG_DT.r; ocap = AIR_DRIFT; cx = AIR_DRAG_DT.cp; }
          }
        }
        ox += ov * cx;
        if (oz <= 0) { oz = 0; oAir = false; okv += ov * 0.5; ov = 0; }
        // 他空中的招打到我了（和 combat.js reaches 一样：我在他面前 -6 ~ reach、离他脚下 vreach 以内、在判定帧里）：他就停在那儿
        if (oam && oAir && dt >= oam.S + 1 && (odv || dt < oam.S + oam.def.A + 1) && !(oam.def.evadeCrouch && ducks) && !immune(mt)) {
          const fd = (sx - ox) * dface; if (fd >= -6 && fd <= oam.def.reach && oz - meAlt <= (oam.def.vreach || 999)) ostop = true;
        }
      };
      let sx0 = me.x, kv0 = me.kvx, sv0 = sv;                // sx0：要是不出这一招（没有前冲、不推挤），我会在哪（定「转不转」用）
      const meMove = () => {
        sx += kv * KB_DAMP.c; kv *= KB_DAMP.r; sx0 += kv0 * KB_DAMP.c; kv0 *= KB_DAMP.r;
        if (air) { if (d.dive) { sx += sv * DT; sx0 += sv0 * DT; } else { sv *= keepR; sv0 *= keepR; sx += sv * keepC; sx0 += sv0 * keepC; } }
      };
      const push = () => {                                   // 两人都在地上、身子叠着：互相推开（和 combat.js separate 一样）
        const dd = ox - sx, ad = Math.abs(dd);
        if (air || oAir || ad >= 2 * PUSH) return;
        const p = Math.min((2 * PUSH - ad) / 2, SOFT_PUSH * DT), s = dd > 0 ? 1 : dd < 0 ? -1 : (me.facing > 0 ? 1 : -1);
        sx -= s * p; ox += s * p;
      };
      // 按下这一步：自己 update 剩下的物理照走；对手这一步要是还没动（他排在后面）也走一下；最后推挤
      meMove(); if (me.idx === 0) oStep(); push();
      let hits = 0, side = 0, side0 = 0;
      const t0 = Math.min(S + 1, n);
      for (let t = DT; t <= n + 1e-9; t += DT) {             // t = 这一招走到哪（判定是 S+1 ~ S+A+1 之前）
        mt = t;
        if (me.idx === 1) oStep();
        if (lg && t - 1 >= lg[0] && t - 1 < lg[1] && !(f * (ox - sx) >= 0 && f * (ox - sx) <= PUSH && !oAir)) sx += f * lstep * DT;
        meMove();
        if (me.idx === 0) oStep();
        if (Math.abs(t - t0) < 1e-9) { side = ox - sx; side0 = ox - sx0; }
        if (t >= S + 1 && f * (ox - sx) >= -6 && f * (ox - sx) <= d.reach && oz <= reachUp) hits++;
        push();
      }
      return { hits, front: f * side, side0 };              // front：判定开始那一刻对手在我面前多远（负数 = 在身后）；side0：对手离「不出招的我」多远
    };
    let a = sim(this.facing, true), b = sim(-this.facing, true);
    if (a.hits !== b.hits) return a.hits > b.hits ? this.facing : -this.facing;
    // 对手还蹲着没起跳（人还在地上、在面前）：两边都打不中的话不按他「会跳到哪」转身 —— 他人明明在面前，一按就转身往后打像 bug；
    // 已经跳起来了才按落点算（他从头顶飞过去，转身迎他是对的）
    if (o.state === 'jumpsquat') { a = sim(this.facing, false); b = sim(-this.facing, false); }
    // 一样多（两边都打不中、或者都打得中）：看「要是没出这一招、站着不动，判定那一刻对手在我哪边」——
    // 他到了身后 3 × FACE_HYST 以外才转。2.0.2（Jack：坠山悬在头顶上，还没飘到身后就往后打空了）：
    // 以前两边各按各的前冲算，朝后打那一遍自己往反方向冲了一截，对手正好在头顶上时就显得「在身后」，转身往后打空；
    // 现在不算这一招的前冲（往前冲一下也不会把自己「冲过了」对手），门槛也放宽一点：头顶上差几像素不转
    return a.side0 * this.facing < -3 * FACE_HYST ? -this.facing : this.facing;
  }
  /* 坠山出脚那一帧（1.9.4）：按对手这时候在哪重新定朝向（腾空那十几帧里对手可能跑到身后、自己也可能飘过了头），
     再定往前下踩的斜度 —— 对手离得够远就照常斜着踩（DIVE_VX）；近了就踩得陡一点，最陡直着往下踩，
     让脚够得着对手的那一帧两人中心差 DIVE_AIM：脚落在对手身上，不会踩过头、也不会往反方向踩 */
  aimDive(m) {
    const o = this.opp;
    const f0 = Math.max(1, Math.ceil((this.alt - o.alt - m.def.vreach) / DIVE_VZ));   // 再过几帧脚往下够得着对手
    const dx = o.x + (o.airborne ? o.vx * f0 : 0) - this.x;
    if (Math.abs(dx) >= 3) this.facing = dx > 0 ? 1 : -1;
    m.dvx = clamp((dx * this.facing - DIVE_AIM) / f0, 0, DIVE_VX);
  }
  oppSide() { return this.opp.x >= this.x ? 1 : -1; }
  /* 闪身（2.0，边挡边冲刺）：按着挡、朝对手双击。从对手身边钻过去，落到他身后 SLIP_PAST 那么远（太近太远按 SLIP_MIN / SLIP_MAX 算）。
     冲多远开头就定好（按两人这时候的位置，联机两边算出来一样），存在这一招身上 */
  beginSlip() {
    const o = this.opp, f = this.oppSide();
    this.facing = f; this.stunT = 0; this.lowBlock = false; this.gwalk = 0; this.runT = 0;
    this.startScript('slip');
    this.move.lungePx = clamp(Math.abs(o.x - this.x) + SLIP_PAST, SLIP_MIN, SLIP_MAX);
    this.slipGot = false;
    slipFx(this); Sound.whoosh(0.7);
  }
  /* 回身肘（2.0.2）：闪身躲过了重拳、钻到对手身后，转过身来朝他背上一肘（自动出，见 attackStep）。
     转身这一下画面上接得上：朝向翻过来的同时姿势先转半圈（spin + 180），看着还是背对着他，再一拧身把肘顶出去 */
  slipElbow() {
    const o = this.opp, f = o.x >= this.x ? 1 : -1;
    if (f !== this.facing) { this.facing = f; if (!game.quiet) this.disp.spin = wrapDeg(this.disp.spin + 180); }   // disp 只是画面（回滚重算时不动它）
    this.beginMove('slipElbow', null);
  }
  // 自动面向对手：对手在身后超过 FACE_HYST 才转（两人重叠时不来回抖）
  autoFace() {
    const dx = this.opp.x - this.x;
    if (dx * this.facing < -FACE_HYST) this.facing = dx > 0 ? 1 : -1;
  }
  takePress(acts, peek) {
    const b = this.inp.buf;
    for (let i = 0; i < b.length; i++) {
      const e = b[i];
      if (this.clock - e.t >= BUF_WIN + 1) { b.splice(i, 1); i--; continue; }
      if (acts.includes(e.a)) { if (!peek) b.splice(i, 1); return e.a; }
    }
    return null;
  }
  // 两个键在 PAIR_WIN 帧内先后按下 = 同时按（爆气、泼墨用）
  pairPressed(a, b) {
    const buf = this.inp.buf;
    let ia = -1, ib = -1;
    for (let i = 0; i < buf.length; i++) {
      if (this.clock - buf[i].t >= BUF_WIN + 1) continue;
      if (buf[i].a === a && ia < 0) ia = i;
      else if (buf[i].a === b && ib < 0) ib = i;
    }
    if (ia < 0 || ib < 0 || Math.abs(buf[ia].t - buf[ib].t) >= PAIR_WIN + 1) return false;
    buf.splice(Math.max(ia, ib), 1); buf.splice(Math.min(ia, ib), 1);
    return true;
  }
  // 这一招走到 t（默认现在）对应招式表时间轴上的哪一刻（被势破拖慢了前摇、被挡住拉长了收招都按比例换回去）。连续的，不是一帧一帧的
  baseTime(t) {
    const m = this.move, d = m.def;
    if (t === undefined) t = m.t;
    if (t <= m.S) return m.S ? t * d.S / m.S : 0;
    // 2.1 被挡住多出来的收招（m.pen）：收招动作放慢拉长，不是收完了站着不动
    if (m.pen && t > m.S + d.A) return d.S + d.A + (t - m.S - d.A) * d.R / (d.R + m.pen);
    return t - m.S + d.S;
  }
  inActive() {
    const m = this.move;
    return m && !m.def.script && m.t >= m.S + 1 && m.t < m.S + m.def.A + 1;
  }
  jabRun() { let j = 0; for (let i = this.chain.length - 1; i >= 0 && this.chain[i] === 'jab'; i--) j++; return j; }
  // 踩腿：刚蹲挡住一记下段腿（扫堂腿），对方还在那一招里（出完判定了）
  stompReady() {
    const o = this.opp, om = o.move;
    return this.stompFor >= 0 && o.state === 'attack' && !!om && om.serial === this.stompFor && om.t >= om.S + 1;
  }
  canCancel(kind) {
    const ST = styleOf(this);
    if (ST.canCancel) return ST.canCancel(this, kind);              // 2.10 这一派自己的接招规矩（咏春拳：连环拳看拍子）
    const m = this.move;
    if (!m || m.air || m.def.script || m.def.noCancel || m.tumbled) return false;   // 2.7 把空中的腿顶回去的那一腿：收完才能动（平等）
    if (!(m.hit || m.blocked || m.absorbed)) return false;          // 2.1 被霸体吃了也能接（不然「连打破霸体」打不出来）
    // 判定开始以后的第 1 ~ A+12 帧能接（按下这一步之后招式走到 m.t + DT，以前是走完一帧）
    const after = m.t + DT - 1 - m.S;
    if (after < 1 || after >= m.def.A + 13) return false;
    if (ST.chainMax) { if (this.chain.filter(c => c !== 'pc').length >= ST.chainMax) return false; }   // 一串最多几下
    else if (kind === 'jab' && this.jabRun() >= JAB_CHAIN_MAX) return false;
    return (ST.cancel[m.def.kind] || []).includes(kind);
  }
  startAttack(kind, cancel) {
    const air = this.airborne;
    if (air && (this.airUsed || kind === 'grab')) return false;
    if (!cancel && this.chainIdle >= CHAIN_WIN + 1) { this.chain = []; this.rushStamped = false; }
    const h = this.inp.held, dir = dirOf(h), o = this.opp;
    // 1.9.0 朝向吸附：先估这一招判定时对手在哪边（toward，1.9.4 起按 aimSide 推：自己的前冲、跳的惯性、对手跳到哪都算进去）。
    // 对手在 ASSIST_R 以内、或者没按方向 → 朝对手打（近身乱按方向也不打空）；远了才照按的方向打
    const runMod = !air && this.state === 'run' && this.runT >= RUN_CHARGE;
    const ST = styleOf(this), MV = ST.moves;
    const guess = ST.variant(kind, air ? [] : this.chain, air, h.down ? 'down' : runMod ? 'run' : '', this);   // 2.10 variant 也看这个人（咏春拳：前 + 拳 = 标指……）
    const toward = guess ? this.aimSide(MV[guess]) : this.facing;
    const dist = Math.abs(o.x - this.x);
    // 按住「后」（离开对手的方向）+ 拿，对手就在面前 → 面朝对手，抓住直接过肩摔（1.8.0）
    const backThrow = kind === 'grab' && !air && !h.down && dir !== 0 && dir === -toward && dist <= MV.grab.reach + 16;
    const face = backThrow || dist <= ASSIST_R || !dir ? toward : dir;
    if (face !== this.facing) {
      // 跑着转身出招：原来往哪跑的惯性留着（往后滑着出手），也不算「跑起来」（不会变沉肩靠）
      if (this.state === 'run') { this.kvx += this.facing * this.runSpeed() * 0.5; this.state = 'idle'; this.runT = 0; }
      // 2.0 冲刺里回身出招：人还被冲刺带着往原来的方向滑（不带冲势），冲过了头再回身打就够不太着
      else if (this.dashTurning()) this.kvx += this.facing * DASH_TURN_KV;
      this.facing = face;
    }
    const mod = h.down ? 'down' : (!air && this.state === 'run' && this.runT >= RUN_CHARGE) ? 'run' : '';
    let name = ST.variant(kind, air ? [] : this.chain, air, mod, this);
    if (!air && kind === 'kick' && h.down && this.stompReady()) name = 'stomp';   // 蹲挡住扫堂腿，紧接着蹲+踢 = 踩腿
    if (!name) return false;
    if (!this.beginMove(name, kind)) return false;
    if (backThrow) this.move.pick = 'throw';
    return true;
  }
  // kind = 按的是哪个键（记进连段）；特殊动作传 null
  // opt.S：这一招的前摇另外定（2.10 咏春拳的连环冲拳按拍子出：按晚一点的出手快一点补上）
  beginMove(name, kind, opt) {
    const d = this.moves[name], air = this.airborne;
    let S = d.S, slowed = false;
    if (kind === 'jab' && this.slowJab > 0) { S += SLOW_JAB_ADD; this.slowJab = 0; slowed = true; }
    // 2.9「顺」：连得越多出手越快（每顺一级前摇少 FLOW_S，最少 FLOW_S_MIN；见 combat.js flow）。按拍子出的招（beat）快慢看拍子，不在这里减
    if (d.flow && !d.beat && this.flow > 0) S = Math.max(Math.min(S, FLOW_S_MIN), grid(S - FLOW_S * this.flow));
    if (opt && opt.S !== undefined) S = Math.max(1, grid(opt.S));
    if (this.state === 'run') this.kvx += this.facing * this.runSpeed() * 0.5;   // 跑动中出招带惯性
    // 冲势：冲刺途中（无敌帧快结束时）或冲刺刚结束出的第一招
    const fromDash = this.state === 'attack' && this.move && this.move.name === 'dash';
    // 2.0：冲势只给往冲刺方向打的那一招（冲过人再回身打不带冲势，见 startAttack 的 DASH_TURN_KV）
    const dashIn = !air && !d.script && d.kind !== 'push' && this.facing === this.dashFace && (fromDash || this.clock - this.dashEnd < DASH_IN_WIN + 1);
    if (dashIn) { this.kvx += this.facing * 5; this.dashEnd = -999; dashInFx(this); }
    this.slipGot = false;
    this.move = { def: d, name, t: 0, S, hit: false, blocked: false, done: false, air, slowed, serial: ++this.serial,
      armorLeft: d.armor ? d.armor.n : 0, press: kind, dashIn };
    this.stompFor = -1;
    this.state = 'attack'; this.runT = 0;
    if (d.cost) this.qi -= d.cost;
    if (air) {
      this.airUsed = true; this.chain = [];          // 空中招断开地上的连段（坠山踩中会另外记成腿起手）
      // 坠山：先往上腾一下（上升太快的话压一压），前摇里在高处顿住，出脚后再斜着踩下去（见 update 物理）
      if (d.dive) { this.vz = clamp(this.vz, DIVE_HOP, 7); this.vx *= 0.3; this.vxCap = AIR_DRIFT; }
    } else if (kind && !d.noChain) { this.chain.push(kind); if (this.chain.length > 8) this.chain.shift(); }   // 2.9 拍手、耕手、盘手不算进连段（不是打人的招）
    if (d.ender) this.chain = [];
    this.trail.length = 0;
    Sound.whoosh(d.kind === 'jab' || d.kind === 'push' ? 0.4 : 1);
    if (name === 'super') { superFx(this); Sound.burst(); }
    return true;
  }
  startScript(name) {
    this.move = { def: this.moves[name], name, t: 0, S: 0, hit: true, blocked: false, done: true, air: false, serial: ++this.serial, armorLeft: 0, press: null };
    this.state = 'attack'; this.trail.length = 0; this.runT = 0;
  }
  // 爆气：挨打的时候（受击硬直里，被擒住不行）按「重+踢」。2.1 起格挡硬直里不能爆
  tryBurst() {
    if (this.qi < QI_BURST || this.grabbed || !this.pairPressed('heavy', 'kick')) return false;
    this.qi -= QI_BURST; this.stunT = 0; this.reel = false; this.clashed = false; this.stagger = false; this.comboTaken = 0; this.stuck = false; this.shook = false;
    this.facing = this.opp.x >= this.x ? 1 : -1;
    this.startScript('burst');
    burstFx(this); Sound.burst();
    return true;
  }
  // 挣脱（1.8.0）：被擒住的头 HOLD_ESC 帧里按「拿」（提前几帧按的也算）
  tryEscape() {
    const o = this.opp, m = o.move;
    if (!this.grabbed || o.state !== 'attack' || !m || m.name !== 'hold' || this.clock - this.heldAt >= HOLD_ESC + 1) return false;
    if (!this.takePress(['grab'])) return false;
    escapeGrab(o, this);
    return true;
  }
  // 借力摔（1.8.0）：卸力成功后按「拿」，抓住失衡的对手顺势过肩摔（挣不脱）
  parryThrow() {
    const o = this.opp;
    o.grabbed = true; o.reel = false; o.move = null; o.stunT = Math.max(o.stunT, this.moves.throwBack.evSlam + 12);
    this.facing = o.x >= this.x ? 1 : -1;
    this.startScript('throwBack'); this.move.parryThrow = true;
    Sound.whoosh(0.8);
  }
  groundCtl(locked) {
    const h = this.inp.held, dir = dirOf(h);
    this.gwalk = 0;
    if (locked) { if (this.state !== 'win') this.state = 'idle'; this.runT = 0; return; }
    if (this.qi >= QI_MAX && this.pairPressed('heavy', 'kick')) { this.facing = this.aimSide(this.moves.super); this.beginMove('super', null); return; }
    if (this.clock - this.dashT < 4) {
      this.dashT = -999;
      // 2.0：按着挡（不蹲）朝对手双击 = 闪身（从他身边钻过去）；不按挡、或者按着挡往后双击，还是普通冲刺
      if (h.block && !h.down && this.dashDir === this.oppSide()) { this.beginSlip(); return; }
      this.facing = this.dashDir; this.dashFace = this.dashDir; this.startScript('dash'); Sound.whoosh(0.5); return;
    }
    if (this.takePress(['up'])) { this.takeoffV = this.state === 'run' ? this.runSpeed() : 0; this.state = 'jumpsquat'; this.t = 0; return; }
    const ST = styleOf(this);
    if (ST.input && ST.input(this, 'neutral', locked)) return;        // 2.10 这一派自己的按键语法先看（不管的照通用的走）
    if (this.state === 'block' && h.block && this.takePress(['jab'])) { this.beginMove('shove', null); return; }
    const k = this.takePress(['jab', 'heavy', 'kick', 'grab']);
    if (k && this.startAttack(k, false)) return;
    // 格挡、蹲：一律面向对手（1.9.0；挡背后、蹲着背对人都没用，乱按的方向不算）
    if (h.block) {
      this.autoFace(); this.state = 'block'; this.lowBlock = !!h.down; this.runT = 0;
      // 2.0 边挡边走：按着挡 + 方向（不蹲）= 举着手慢慢走，往前往后都行（不转身，一直面朝对手，照样挡得住）
      const bw = ST.blockWalk || BLOCK_WALK;                         // 2.10 咏春拳的黐手走得慢一点（WC_WALK）
      if (!h.down && dir) { this.x += dir * bw * DT; this.gwalk = dir * this.facing; this.walkPhase += bw / 44 * DT; }
      return;
    }
    if (h.down) { this.autoFace(); this.state = 'crouch'; this.runT = 0; return; }
    if (dir) {
      if (dir !== this.facing) { this.facing = dir; this.runT = 0; }   // 掉头
      this.runT += DT;
      const v = this.runSpeed();
      this.x += dir * v * DT; this.state = 'run'; this.walkPhase += v * RUN_ST / (RUN_X0 - RUN_X1) * DT;    // 步频跟着速度，脚不打滑
    } else { this.runT = 0; this.state = 'idle'; }
  }
  update(locked) {
    this.clock += DT;
    if (this.slowJab > 0) this.slowJab = Math.max(0, this.slowJab - DT);
    if (this.state !== 'attack') { this.chainIdle += DT; if (this.flow && this.chainIdle >= FLOW_IDLE && this.state !== 'parry') this.flow = 0; }   // 2.9 停手了：顺断了
    if (this.comboT > 0) this.comboT = Math.max(0, this.comboT - DT);
    if (this.state !== 'hit' && this.state !== 'down' && this.state !== 'ko') this.comboTaken = 0;
    if (locked) this.inp.buf.length = 0;
    const h = this.inp.held;
    // 输入边沿：刚按下格挡（卸力判定窗口）、同一方向双击（闪步）
    const bl = !!h.block;
    if (bl && !this.prevBlock) { this.parryOK = this.clock - this.blockPress >= PARRY_LOCK; this.blockPress = this.clock; }
    this.prevBlock = bl;
    // 2.4 冲刺键（键位设置里选了「冲刺键」的人，双击方向就只是走路 —— inp.keyDash）：按一下 = 往按着的方向冲，没按方向就往前（面朝的方向）
    if (!this.inp.keyDash) {
      if (h.left && !this.prevL) { if (this.clock - this.tapL < DTAP_WIN + 1) { this.dashT = this.clock; this.dashDir = -1; this.tapL = -999; } else this.tapL = this.clock; }
      if (h.right && !this.prevR) { if (this.clock - this.tapR < DTAP_WIN + 1) { this.dashT = this.clock; this.dashDir = 1; this.tapR = -999; } else this.tapR = this.clock; }
    }
    if (this.takePress(['dash'])) { this.dashT = this.clock; this.dashDir = dirOf(h) || this.facing; this.tapL = this.tapR = -999; }
    this.prevL = !!h.left; this.prevR = !!h.right;

    switch (this.state) {
      case 'idle': case 'run': case 'crouch': case 'block':
        this.groundCtl(locked); break;
      case 'parry': {
        const o = this.opp, PST = styleOf(this);
        if (PST.input && PST.input(this, 'parry', locked)) break;      // 2.10 咏春拳：拍开以后接自己的一套
        if (!locked && o.reel && o.state === 'hit' && !o.airborne && Math.abs(o.x - this.x) <= 116 && this.takePress(['grab'])) { this.parryThrow(); break; }
        if (!locked) { const k = this.takePress(['jab', 'heavy', 'kick', 'grab']); if (k && this.startAttack(k, false)) break; }
        if ((this.t += DT) >= PARRY_POSE) this.state = 'idle';
        break;
      }
      case 'jumpsquat':
        this.x += this.facing * this.takeoffV * DT;     // 跑着起跳，蹲的这几帧还在往前冲
        if ((this.t += DT) >= 3) {
          const dir = dirOf(h);
          let vx;
          const running = this.takeoffV > 0 && dir !== -this.facing;
          if (running) vx = this.facing * Math.max(this.takeoffV * RUN_CARRY, JUMP_VX);   // 带着跑速飞出去（跳得最远）
          else vx = dir * JUMP_VX;                                                       // 站着按方向跳
          if (dir) this.facing = dir;
          this.vz = JUMP_V; this.alt = 0.01; this.vx = vx; this.vxCap = Math.max(AIR_DRIFT, Math.abs(vx));
          this.state = 'air'; this.airUsed = false; this.airT = 0; this.takeoffV = 0;   // 1.7.0 起不翻跟头，跑着跳用「飞身」姿势
          this.leapJump = running;                       // 只管画面：跑着起跳整段用飞身姿势（1.9.0 以前跑得不够快会用举手的姿势）
          Sound.whoosh(0.3);
        }
        break;
      case 'air':
        this.airT += DT;
        if (!locked) {
          const dir = dirOf(h);
          if (dir) this.facing = dir;
          if (!this.airUsed) { const k = this.takePress(['jab', 'heavy', 'kick']); if (k) this.startAttack(k, false); }
        }
        break;
      case 'tumble':                     // 空中的腿被地上的腿顶回去：往后翻着飞，落地前什么都不能做（也打不中他）
        this.t += DT;
        break;
      case 'land':
        // 普通落地可以马上再跳（落地前按的跳不会被吃掉）；空中出招没打中的落地硬直不行
        if (!locked && this.landT <= 4 && this.takePress(['up'])) { this.takeoffV = 0; this.state = 'jumpsquat'; this.t = 0; break; }
        if ((this.t += DT) >= this.landT) this.state = 'idle';
        break;
      case 'attack': this.attackStep(locked); break;
      case 'hit':
        if (!locked && this.tryEscape()) break;
        if (!locked && this.tryBurst()) break;
        if ((this.stunT -= DT) <= 0) {
          this.freeAt = this.clock;      // 这一步刚恢复，还来不及挡：这一步打中仍算连上
          this.grabbed = false; this.reel = false; this.clashed = false; this.carried = false; this.stagger = false; this.stuck = false; this.shook = false;   // 踉跄完了：又会自动面向对手
          if (this.airborne) { this.state = 'air'; this.airUsed = true; this.vx = 0; } else this.state = 'idle';
        }
        break;
      case 'blockstun':
        this.lowBlock = !!h.down;
        this.autoFace();                 // 挡住的硬直里对手绕到身后：跟着转过去接着挡（1.9.0）
        // 2.0 闪身：挡住的硬直里按着挡、朝对手双击 → 不等硬直完，直接从他身边钻过去
        if (!locked && h.block && !h.down && this.clock - this.dashT < 4 && this.dashDir === this.oppSide()) { this.dashT = -999; this.beginSlip(); break; }
        if (!locked && this.stompReady() && this.takePress(['kick'])) { this.beginMove('stomp', 'kick'); break; }        // 蹲挡住扫堂腿 → 踩腿
        // 挡住后按重 → 截击（传统格斗，花 25 气）；拳派表里 blockHeavy 写 null 的没有这一下（2.10 咏春拳）
        { const bst = styleOf(this), bh = bst.blockHeavy === undefined ? 'jieQuan' : bst.blockHeavy;
          if (bh && !locked && this.qi >= (this.moves[bh].cost || 0) && this.takePress(['heavy'])) { this.beginMove(bh, null); break; } }
        if (!locked && this.takePress(['jab'])) { this.beginMove('shove', null); break; }
        if ((this.stunT -= DT) <= 0) this.state = (h.block && !locked) ? 'block' : 'idle';
        break;
      case 'down':
        if (this.downPhase === 'lie') {
          if ((this.t += DT) >= this.lieT) {
            this.downPhase = 'getup'; this.t = 0;
            this.rollDir = this.state === 'down' && !locked ? dirOf(h) : 0;     // 起身时按住方向 = 往那边滚身起
          }
        } else if (this.downPhase === 'getup') {
          if (this.rollDir) this.x += this.rollDir * this.rollLen(this.rollDir) / GETUP * DT;
          if ((this.t += DT) >= GETUP) {
            // 2.0：起身完了先是「起身硬直」RISE 帧：站起来那几帧，打得中、还动不了（给对面先出手）
            this.state = 'rise'; this.downPhase = null; this.t = 0;
            this.riseT = this.rollDir ? RISE_ROLL : RISE;          // 2.7 滚身起：滚完站起来那几帧长一点（对面要追过去 / 转身才打得到）
            if (this.rollDir) { this.facing = this.opp.x >= this.x ? 1 : -1; this.rollDir = 0; }
          }
        }
        break;
      case 'rise':
        if ((this.t += DT) >= (this.riseT || RISE)) this.state = 'idle';
        break;
      case 'ko': case 'win': break;
    }
    // 物理
    if (this.carried) { this.kvx = 0; this.x = clamp(this.x, WALL_L, WALL_R); return; }   // 被过肩摔扛着：位置由出手方每帧摆（carryStep）
    // 2.6 一步走 DT 帧：击退每帧剩 82% → 每步剩 KB_DAMP.r，位移乘 KB_DAMP.c（整帧时和以前一样远）
    this.x += this.kvx * KB_DAMP.c; this.kvx *= KB_DAMP.r; if (Math.abs(this.kvx) < 0.05) this.kvx = 0;
    if (this.airborne) {
      const m = this.move, atkAir = this.state === 'attack' && m && m.air;
      const dive = atkAir && m.def.dive, diving = dive && !m.hit && !m.blocked && m.t >= m.S + 1;
      // 坠山：前摇里先腾起来、重力减半（在高处顿一下）；出脚后沿斜线匀速往前下方踩（不受重力）。
      // 1.9.4：斜度是出脚那一刻按对手远近定的（m.dvx，见 aimDive），近了踩得陡
      if (diving) { this.vz = -DIVE_VZ; this.vx = this.facing * (m.dvx === undefined ? DIVE_VX : m.dvx); this.alt += this.vz * DT; }
      else {
        const g = dive && m.t < m.S + 1 ? GRAV * 0.5 : GRAV;          // 坠山前摇：在高处悬一下（1.9.0 悬得更久，看得见要踩了）
        this.alt += this.vz * DT + g * GH; this.vz -= g * DT;
      }
      if (this.state === 'tumble') this.x += this.vx * DT;      // 翻滚：横向匀速飞回去（飞得远），方向键管不了
      else if (this.state === 'air' || atkAir) {
        // 空中横向：顺着起跳方向能保持跑速；松开就慢慢变小；空中再按只能小幅调整
        const dir = locked ? 0 : dirOf(h);
        let cx = DT;
        if (dive) { /* 坠山：不受方向键影响 */ }
        else if (dir) {
          const same = dir * this.vx > 0;
          if (!same) this.vxCap = AIR_DRIFT;
          const lim = same ? Math.max(AIR_DRIFT, this.vxCap) : AIR_DRIFT;
          let v = this.vx + dir * AIR_ACC * DT;
          if (dir * v > lim) v = dir * lim;
          this.vx = v;
        } else { this.vx *= AIR_DRAG_DT.r; this.vxCap = AIR_DRIFT; cx = AIR_DRAG_DT.cp; }
        this.x += this.vx * cx;
      }
      if (this.alt <= 0) { this.alt = 0; this.vz = 0; this.onLand(); }
    }
    this.x = clamp(this.x, WALL_L, WALL_R);
  }
  attackStep(locked) {
    const m = this.move, d = m.def;
    // 2.6 这一步先查再把 m.t 加 DT。k = m.t + DT - 1：和以前（一帧一帧、先查再加 1）查的时候 m.t 是同一个意思 ——
    // 以前「m.t === X」是招式开始后第 X+1 帧那一下，现在就是 k === X（招式开始后正好过了 X+1 帧的那一步）
    const k = m.t + DT - 1;
    if (!locked) {
      // 重/踢 刚出手几帧内补按另一个 = 同时按：气满放泼墨
      if (k < PAIR_WIN + 1 && !m.air && (m.press === 'heavy' || m.press === 'kick') && this.qi >= QI_MAX) {
        const other = m.press === 'heavy' ? 'kick' : 'heavy';
        if (this.takePress([other])) { this.beginMove('super', null); return; }
      }
    }
    // 2.10 这一派自己的按键语法（咏春拳：连环拳按拍子、寸拳蓄劲、搭手……）先看；没有的才走通用的接招（CANCEL）
    const ST = styleOf(this);
    if (ST.input) { if (ST.input(this, 'attack', locked)) return; }
    else if (!locked) {
      const kk = this.takePress(['jab', 'heavy', 'kick', 'grab'], true);
      if (kk && this.canCancel(kk)) { this.takePress([kk]); this.startAttack(kk, true); return; }
    }
    if (this.move !== m) return;                                      // 上面换了一招
    const o = this.opp;
    // 连环寸拳（咏春拳的大招）：第一拳打中以后一拳一拳地打（这时候招式自己的时间停着，打完一串再收招）
    if (m.flurry) { flurryStep(this, m); if (m.flurry) return; }
    if (d.lunge && !m.air) {
      // 前冲：贴到对手身上就停，不冲过人（1.9.4，冲刺、闪身除外）。闪身冲多远写在这一招身上（lungePx）
      const [a, b] = d.lunge, px = m.lungePx !== undefined ? m.lungePx : d.lunge[2], tb = this.baseTime(k);
      if (tb >= a && tb < b && (d.script || !lungeStop((o.x - this.x) * this.facing, o))) this.x += this.facing * px / (b - a) * DT;
    }
    if (m.name === 'slip') {
      // 2.0.2 躲过了重拳：钻到他身后（按他面朝的方向过了 SLIP_ELBOW_AT）、或者钻完了，就自动回身一肘
      if (!locked && this.slipGot && ((this.x - o.x) * o.facing <= -SLIP_ELBOW_AT || k >= d.lunge[1])) { this.slipElbow(); return; }
      // 钻空了（没躲着重拳）：第 SLIP_CANCEL 帧起可以直接按招打出去
      if (!locked && !this.slipGot && k >= SLIP_CANCEL) { const kk = this.takePress(['jab', 'heavy', 'kick', 'grab']); if (kk && this.startAttack(kk, false)) return; }
      if (k > 0 && k < d.lunge[1] && k % 2 === 0) slipLines(this);
    }
    if (d.dive && k === m.S && !m.hit && !m.blocked) this.aimDive(m);   // 坠山出脚的那一刻：重新瞄（1.9.4）
    if (m.name === 'dash') {
      // 冲刺第 DASH_CANCEL 帧起可以直接按招打出去（带冲势）
      if (!locked && k >= DASH_CANCEL) { const kk = this.takePress(['jab', 'heavy', 'kick', 'grab']); if (kk && this.startAttack(kk, false)) return; }
      if (k === 0) { dust(this.x - this.facing * 20, FLOOR, 5); burst(this.x - this.facing * 30, FLOOR - 40, -this.facing, 4, 30, 2.5, pal(this).qi); }
      if (k > 0 && k < 10 && k % 2 === 0) dashLines(this);
      if (k === 10) { dust(this.x + this.facing * 24, FLOOR, 6); Sound.land(); }
    }
    if (m.name === 'super') superStep(this, m, k);              // 2.7 泼墨：蓄力时墨往掌心收、出掌那一下掌前面炸开墨花（只是画面）
    const held = o.grabbed && o.state === 'hit';
    // 擒住 / 提膝 / 别腿摔 / 抱腿摔：把对手往怀里带（贴身好接后续）
    if (held && (m.name === 'hold' || m.name === 'knee' || m.name === 'trip' || m.name === 'tackle')) {
      o.x += (this.x + this.facing * HOLD_GAP - o.x) * PULL_K; o.kvx = 0;
    }
    if (m.name === 'hold') {
      // 擒住期间按的键决定后续：拳 = 提膝撞，踢 = 别腿摔，重 = 过肩摔；最后一帧按着后 = 过肩摔；都没按 = 推开
      if (!locked && !m.pick && m.holdKind === 'grab') {
        const kk = this.takePress(['jab', 'kick', 'heavy']);
        if (kk) m.pick = kk === 'jab' ? 'knee' : kk === 'kick' ? 'trip' : 'throw';
      }
      if (k >= d.R - 1) {
        if (!held) { this.move = null; this.state = 'idle'; this.chainIdle = 0; return; }
        const backHeld = !locked && (this.facing > 0 ? this.inp.held.left : this.inp.held.right);
        const pick = m.holdKind === 'tackle' ? 'tackle' : m.pick || (backHeld ? 'throw' : 'push');
        this.startScript(pick === 'throw' ? 'throwBack' : pick === 'push' ? 'grabHit' : pick);
        return;
      }
    }
    if (m.name === 'grabHit' && k === d.evPush && held) grabPush(this, o, d.R - k);
    if (m.name === 'knee' && held && (k === d.evHit || k === d.evHit2)) kneeHit(this, o, k === d.evHit2, d.R - k);
    if ((m.name === 'trip' || m.name === 'tackle') && k === d.evSlam && held) slamDown(this, o, m.name);
    if (m.name === 'throwBack') {
      if (k <= d.evSlam) this.carryStep(Math.max(0, k) / d.evSlam);
      if (k === 2 || k === 7) Sound.whoosh(k === 2 ? 0.5 : 1);
      if (k === d.evSlam) this.throwOver();
    }
    if ((m.name === 'legCatch' || m.name === 'scoop') && k === d.evSlam) { game.shake = Math.max(game.shake, 7); dust(o.x, FLOOR, 8, true); Sound.hit(0.9); }
    if (m.name === 'burst' && k === d.evWave) this.burstWave();
    if (d.dive && (m.hit || m.blocked)) m.bounce = (m.bounce || 0) + DT;   // 坠山踩中后翻跟头的进度（画面用，帧）
    if (m.hold) m.hold = false; else m.t += DT;                       // 2.10 hold：这一步时间不走（咏春拳的寸拳蓄劲时停在那儿）
    if (m.t >= m.S + d.A + d.R + (m.pen || 0)) {
      if (d.flow && !m.hit) this.flow = 0;                             // 2.9 顺：打空了就断了
      if (m.name === 'dash') this.dashEnd = this.clock;
      if (m.name === 'slip') this.slipEnd = this.clock;
      this.move = null; this.chainIdle = 0;
      if (this.airborne) { this.state = 'air'; this.airUsed = true; } else this.state = 'idle';
    }
  }
  // 过肩摔：每帧把对手摆到 THROW_PATH 上 —— 被拽近、扛过头顶、甩到身后（u = 0 ~ 1）
  carryStep(u) {
    const o = this.opp;
    if (o.state !== 'hit' || !o.grabbed) return;
    if (!o.carried) {
      o.carried = true; o.carry0 = (o.x - this.x) * this.facing; o.kvx = 0; o.vz = 0; o.vx = 0;
      o.stunT = Math.max(o.stunT, this.moves.throwBack.evSlam + 8);
    }
    // 背后快到墙了：一边摔一边往前挪，给对手留出落地的地方（以前是摔完瞬移）
    const land = this.x - this.facing * THROW_LAND;
    const need = land < WALL_L ? WALL_L - land : land > WALL_R ? WALL_R - land : 0;
    if (need) this.x = clamp(this.x + clamp(need, -6 * DT, 6 * DT), WALL_L, WALL_R);
    const [x, alt, rot] = throwPath(u, o.carry0);
    o.x = clamp(this.x + this.facing * x, WALL_L, WALL_R); o.alt = alt; o.carryRot = rot;
  }
  // 过肩摔：把对手从头顶甩到身后（换边），砸在地上
  throwOver() {
    const o = this.opp;
    if (o.state !== 'hit' || !o.grabbed) return;
    const pt = !!this.move.parryThrow, dmg = pt ? PARRY_THROW_DMG : THROW_DMG;   // 借力摔更重
    o.hp -= dmg; o.grabbed = false; o.carried = false;
    let nx = this.x - this.facing * THROW_LAND;
    if (nx < WALL_L || nx > WALL_R) { nx = clamp(nx, WALL_L, WALL_R); this.x = clamp(nx + this.facing * THROW_LAND, WALL_L, WALL_R); }
    o.x = nx; o.alt = Math.max(o.alt, 0.01);
    o.knockDown(-3, -this.facing * 2, TFH(28), o.hp <= 0); o.slam = true; if (o.hp <= 0) o.hp = 0;   // 2.7 躺 ×0.9（TFH(31) → TFH(28)）
    this.stats.hits++; this.stats.specials++; this.gainQi(dmg * 0.4 * QI_PER_HP); o.gainQi(dmg * 0.9 * QI_PER_HP);
    const tl = pt ? '借力摔' : this.move.def.label;
    bumpCombo(this, o); noteGrab(this, dmg, tl);
    game.freeze = 7; game.shake = Math.max(game.shake, 8);
    dust(o.x, FLOOR, 10, true);
    stamp(this.J.head[0] + this.facing * 40, this.J.head[1] - 46, tl, 30, this);
    tag(o.x, FLOOR - 120, '-' + dmg, this, 18);
    Sound.hit(1);
  }
  // 爆气的冲击波（2.1）：炸到范围内的对手 —— 打掉 BURST_DMG、把人炸倒（打断他的招、断了他的连招）
  burstWave() {
    const o = this.opp, dir = o.x >= this.x ? 1 : -1;
    game.freeze = Math.max(game.freeze, 6); game.shake = Math.max(game.shake, 9);
    if (Math.abs(o.x - this.x) > BURST_RANGE || o.invuln()) { cev('burst', this, o, { miss: true, far: Math.abs(o.x - this.x) > BURST_RANGE }); return; }
    // 面朝着格挡：挡住爆气，只吃三成、被推开一点，几乎不硬直 —— 爆气方的后摇就能被打
    if (o.isBlocking() && o.facingTo(this)) {
      const chip = Math.max(1, Math.round(BURST_DMG * BLOCK_KEEP));
      o.hp = Math.max(1, o.hp - chip); o.stats.blocks++;
      o.state = 'blockstun'; o.stunT = BURST_BLOCK_STUN; o.kvx = dir * BURST_BLOCK_KB;
      this.info = { label: '爆气', dmg: chip, how: '被挡', why: '面朝着格挡挡得住爆气', adv: null, t: this.clock };
      tag(o.x, FLOOR - 150, [['挡住爆气 ', o], ['-' + chip, this]], o, 22); cev('burst', this, o, { blocked: true }); return;
    }
    o.hp -= BURST_DMG; this.stats.hits++; this.stats.specials++;
    this.gainQi(BURST_DMG * 0.4 * QI_PER_HP); o.gainQi(BURST_DMG * 0.9 * QI_PER_HP);
    o.reel = false; o.clashed = false; o.stagger = false; o.grabbed = false; o.comboLive = false; o.runT = 0;
    o.knockDown(4.5, dir * BURST_KB, BURST_LIE, o.hp <= 0); if (o.hp <= 0) o.hp = 0;
    cev('burst', this, o, { hit: true });
    bumpCombo(this, o);
    this.info = { label: '爆气', dmg: BURST_DMG, how: '炸倒', why: '挨打时爆气：对方倒地', adv: null, down: true, t: this.clock };
    burstHitFx(this, o);
    tag(o.x, o.J ? o.J.head[1] - 40 : FLOOR - 150, '-' + BURST_DMG, this, 22);
    Sound.hit(1.1);
  }
  onLand() {
    this.kvx += this.vx * 0.5; this.vx = 0;                // 落地顺势滑一下，动作更连贯
    if (this.state === 'air') { this.state = 'land'; this.t = 0; this.landT = 3; dust(this.x, FLOOR, 4); Sound.land(); }
    else if (this.state === 'tumble') { this.state = 'land'; this.t = 0; this.landT = TUMBLE_LAND; this.vx = 0; this.kvx *= 0.3; dust(this.x, FLOOR, 7, true); Sound.land(); }
    else if (this.state === 'attack' && this.move && this.move.air) {
      const m = this.move, dv = m.def.dive;
      // 还没来得及判定就落地（前摇没出完，或者落地这一帧才刚出手）：当作这一招没出，
      // 落地后马上在地上出（按键重新放回缓冲）—— 按了一定有反应
      const early = !dv && !m.hit && !m.blocked && m.t < m.S + 2;
      if (early && m.press) this.inp.press(m.press, this.clock);
      // 坠山：踩中落地快（好接腿的连招）；被挡、踩空落地硬直长（1.9.0）
      // 2.6 空中招的落地硬直就是它的后摇：跟着 ×ATK_TEMPO（2 / 3 / 7 / 11 → 2.25 / 3.25 / 7.5 / 11.75）
      this.landT = TA(dv ? (m.hit ? 2 : m.blocked ? 7 : 11) : m.hit || early ? 3 : 7); this.move = null; this.state = 'land'; this.t = 0; this.chainIdle = 0;
      dust(this.x, FLOOR, dv ? 10 : 5, dv); if (dv) game.shake = Math.max(game.shake, 4); Sound.land();
    } else if (this.state === 'down' || this.state === 'ko') {
      if (this.downPhase === 'fall') { this.downPhase = 'lie'; this.t = 0; dust(this.x, FLOOR, 9, true); game.shake = Math.max(game.shake, 4); Sound.land(); }
    }
  }
  knockDown(vz, kvx, lie, ko) {
    this.state = ko ? 'ko' : 'down'; this.downPhase = 'fall'; this.t = 0;
    this.vz = vz; if (this.alt <= 0) this.alt = 0.01; this.kvx = kvx; this.vx = 0;
    this.lieT = lie; this.move = null; this.chain = []; this.chainIdle = 99; this.grabbed = false; this.carried = false; this.slam = false; this.stuck = false; this.shook = false; this.prone = false;
    this.rollDir = 0; this.stompFor = -1; this.gwalk = 0;
    this.lieKind = this.lieKind ? 0 : 1;                  // 躺姿换着来：一条腿稍弯 / 两腿伸直（只是画面）
    this.reel = false; this.clashed = false; this.stagger = false; this.runT = 0;
  }
  // AI 看到的对手快照
  record() {
    const m = this.move, d = m && m.def;
    const s = {
      atk: !!(m && !d.script && m.t <= m.S + d.A), kind: d ? d.kind : null, name: m ? m.name : null, serial: m ? m.serial : -1,
      limb: d && d.limb || null, pierce: !!(d && d.pierce), flow: this.flow || 0, beat: !!(d && d.beat),   // 用哪只手脚打、顺了几级、是不是按拍子的连环拳
      // 2.10 搭手：被黏住、我在搭手（手型、在不在翻手、扣没扣手腕、还剩几帧要按）
      stuck: !!this.stuck, touch: !!(m && d.tch), shape: m && d.tch ? m.shape : '', rolling: !!(m && d.tch && m.rollT > 0), lap: !!(m && d.tch && (m.lap || m.lapT > 0)),
      twin: m && d.tch ? m.win : 0, tlimb: m && d.tch ? m.limb : null, lat: !!(m && m.name === 'tLat' && m.latT > 0),
      tshape: this.stuck && styleOf(this).touchShape ? styleOf(this).touchShape(this) : '',      // 咏春拳被黏住时摆的手型
      tier: d ? d.tier : null, lead: d ? d.lead : null, height: d ? d.height : null, facing: this.facing, x: this.x,
      reach: d ? d.reach + (d.lunge ? Math.max(0, d.lunge[2]) : 0) : 0, remain: m ? Math.max(0, m.S + (d.A || 0) - m.t) : 0,
      phase: !m ? null : m.t <= m.S ? 's' : m.t <= m.S + d.A ? 'a' : 'r', confirmed: !!(m && (m.hit || m.blocked)),
      sLeft: m ? m.S - m.t : 0, armored: this.armored(null),
      blocking: this.state === 'block' || this.state === 'blockstun', down: this.state === 'down' || this.state === 'ko',
      rise: this.state === 'rise', getup: this.state === 'down' && this.downPhase === 'getup', roll: this.state === 'down' && this.downPhase === 'getup' ? this.rollDir : 0, slip: !!(m && m.name === 'slip'), gwalk: this.state === 'block' ? this.gwalk : 0,
      stagger: this.state === 'hit' && this.stagger, stunT: this.stunT, open: !!(d && d.open), dive: !!(d && d.dive), clock: this.clock,
      rLeft: m ? Math.max(0, m.S + (d.A || 0) + (d.R || 0) + (m.pen || 0) - m.t) : 0, landT: this.state === 'land' ? this.landT - this.t : 0,
      air: this.airborne, alt: this.alt, vz: this.vz, vx: this.airborne ? this.vx : 0, squat: this.state === 'jumpsquat', stun: this.state === 'hit' || this.state === 'blockstun',
      dash: !!(m && m.name === 'dash'), run: this.state === 'run' && this.runT >= RUN_CHARGE,
      held: this.grabbed, low: lowProfile(this), lowBlock: this.lowBlock,
    };
    this.history.push(s); if (this.history.length > 40) this.history.shift();
  }

  /* ---------- 动画 ---------- */
  // 跑步：火影手游那种前倾跑，手臂大幅前后摆；跑得越快前倾越多、摆得越大
  // 1.9.0：两脚都离地时整个人往上窜（腾空约 8 像素），落地那一下压低缓冲
  runPose(t) {
    copyPose(t, POSE.run);
    const u = this.walkPhase, k = Math.min(1, this.runT / 8);
    const f = runLeg(u), b = runLeg(u + 0.5);
    t.ff[0] = f[0]; t.ff[1] = f[1]; t.bf[0] = b[0]; t.bf[1] = b[1];
    const bob = Math.cos(TAU * 2 * (u - 0.38));             // 一步一起伏：腾空正中最高，踩地正中最低
    t.tor = 18 + 14 * k - 2 * bob; t.head = -12 - 8 * k;
    t.hy = 62 + 1.5 * bob; t.air = Math.min(f[1], b[1]) + 2 + 4 * bob;
    const amp = 0.75 + 0.25 * k;
    const fa = runArm(u, t.tor, amp), ba = runArm(u + 0.5, t.tor, amp);   // 手的相位 = 同侧腿的相位，runArm 里自己反着摆
    t.fh[0] = fa[0]; t.fh[1] = fa[1]; t.bh[0] = ba[0]; t.bh[1] = ba[1];
    return t;
  }
  target() {
    const t = this.tgt, ck = this.clock, PS = this.poses;   // 2.9 PS：自己这一派的架势（咏春拳：问手 + 护手、竖掌）
    const TST = styleOf(this);
    if (TST.target && TST.target(this, t)) return t;        // 2.10 这一派自己现画的（咏春拳：黐手的手型、搭手）
    switch (this.state) {
      case 'idle': {
        // 待机「呼吸」（1.9.3 放慢到约 1.3 秒一次）：上身轻轻起伏，两只拳头慢半拍跟着画小圈。
        // 1.9.4（Jack：下半身别晃那么多）：髋只上下动 0.4（以前 3，后腿膝盖跟着一弯一直），腿基本不动
        copyPose(t, PS.stance);
        const ph = ck * TAU / 80, c = Math.cos(ph);
        t.hy -= 0.4 * c; t.tor += 1.6 * c; t.head -= 1.3 * Math.cos(ph - 0.5);
        t.fh[1] += 3 * Math.cos(ph - 0.9); t.fh[0] += 1.5 * Math.sin(ph - 0.9);
        t.bh[1] += 2 * Math.cos(ph - 1.3); t.bh[0] -= 1.2 * Math.sin(ph - 1.3);   // 2.1 前手小臂往前举、后手在腰带上面一点（POSE.stance），跟着呼吸轻轻动
        return t;
      }
      case 'run': return this.runPose(t);
      case 'crouch': return copyPose(t, PS.crouch);
      case 'block': {
        copyPose(t, this.lowBlock ? PS.cblock : PS.block);
        if (this.gwalk && !this.lowBlock) {
          // 2.0 边挡边走：手举着不动，脚下小碎步一前一后交替挪；往后退时身子往后坐一点，往前压时往前探一点
          const ph = this.walkPhase * TAU, s = Math.sin(ph), c = Math.cos(ph);
          t.ff[0] += 9 * s; t.ff[1] = Math.max(0, 6 * c); t.bf[0] -= 9 * s; t.bf[1] = Math.max(0, -6 * c);
          t.hy += 1.2 * Math.abs(c) - 1;
          if (this.gwalk > 0) { t.tor += 4; t.dx += 3; } else { t.tor -= 4; t.dx -= 3; t.head += 3; }
        }
        return t;
      }
      case 'rise': {
        // 2.0 起身硬直：从蹲着站起来，两手还垂着没护住（POSE.rise），最后几帧顺到站姿
        const u = clamp(this.t / (this.riseT || RISE), 0, 1);
        return lerpPose(POSE.rise, PS.stance, EASE.io(u), t, false);
      }
      case 'blockstun': copyPose(t, this.lowBlock ? PS.cblock : PS.block); t.dx -= 8; t.tor -= 8; t.head += 6; return t;
      case 'parry': return copyPose(t, PS.parry);
      case 'jumpsquat': return copyPose(t, POSE.squat);
      case 'land': return copyPose(t, POSE.land);
      case 'tumble': {
        // 被顶回去：团身往后翻一个跟头（面朝对手往后飞）。2.7 飞得高、飞得久：跟头跟着飞的时间翻（快落地时翻完、伸腿找地）
        const u = clamp(this.t / Math.max(17, (this.tumFly || 17) * 0.8), 0, 1);
        copyPose(t, u < 0.85 ? POSE.tuck : POSE.jdn); t.rot = -360 * EASE.io(u); return t;
      }
      case 'air': {
        // 跑着跳：上升和顶点用「飞身」（两臂展开），往下落两腿找地；站着跳：上升 → 团身 → 伸腿
        if (this.leapJump || Math.abs(this.vx) >= LEAP_VX) return copyPose(t, this.vz > -4 ? POSE.leap : POSE.leapDn);
        return copyPose(t, this.vz > 5 ? POSE.jup : this.vz > -5 ? POSE.jtop : POSE.jdn);
      }
      case 'attack': {
        const m = this.move;
        // 连环寸拳打中以后那一串：左右手交替（一拳一个姿势，写在招式的 flurry 里），最后一记寸拳
        if (m.flurry) { const FL = m.def.flurry; return copyPose(t, m.fi >= FL.n - 1 ? FL.endPose : FL.poses[m.fi % 2]); }
        copyPose(t, evalKeys(m.def.keys, this.baseTime()));
        // 1.9.4 坠山近身踩得陡（见 aimDive）：身子跟着立直一点，脚冲着底下的人，不是斜着往前伸
        if (m.def.dive && !m.bounce && m.dvx !== undefined) t.rot *= 0.3 + 0.7 * m.dvx / DIVE_VX;
        // 坠山踩中：顺着这一脚蹲着落下来；被挡：往后翻一个跟头弹开
        if (m.def.dive && m.bounce) {
          if (m.hit) { copyPose(t, POSE.land); t.rot = -10; t.ff[0] = 40; t.ff[1] = 8; }
          else {   // 2.8 翻得远、飞得久：跟头跟着飞的时间翻（和翻滚回去一样，快落地时翻完、伸腿找地）
            const u = clamp(m.bounce / Math.max(16, (m.bFly || 16) * 0.8), 0, 1);
            copyPose(t, u < 0.85 ? POSE.tuck : POSE.jdn); t.rot = -42 - 318 * EASE.io(u);
          }
        }
        if (m.slowed && m.t < m.S) { t.dx -= 3; t.fh[0] -= 4 + Math.sin(ck * 1.7) * 2; }
        if (this.armored(null)) t.dx += Math.sin(ck * 2.3) * 1.4;   // 霸体中微微发抖
        return t;
      }
      case 'hit':
        if (this.carried) { copyPose(t, POSE[this.carryPose] || POSE.thrown); t.rot = this.carryRot; return t; }   // 被过肩摔扛着翻过去；2.10 被拉手跪马拽倒
        if (this.stuck) {                                   // 2.10 被咏春拳黏住：打过来的那只手 / 那条腿还伸着
          const om = this.opp.move, lc = om && om.limb;
          return copyPose(t, lc === 'leg' ? POSE.stuckK : lc === 'rear' ? POSE.stuckR : POSE.stuckL);
        }
        if (this.shook) return copyPose(t, POSE.shake);
        if (this.stagger) return copyPose(t, evalKeys(STAGGER_KEYS, clamp(1 - this.stunT / STAGGER, 0, 1)));   // 2.0.2 背上挨了回身肘：往前踉跄
        if (this.reel) return copyPose(t, POSE.reel);
        if (this.clashed) return copyPose(t, POSE.recoil);
        if (this.airborne) return copyPose(t, POSE.hurtAir);
        if (this.grabbed && this.stunT > 12) return copyPose(t, POSE.pulled);
        return copyPose(t, this.hurtHeavy ? POSE.hurtH : POSE.hurtL);
      case 'down': case 'ko': {
        const lie = this.prone ? POSE.lieProne : this.lieKind ? POSE.lieFlat : POSE.lie;   // 2.10 被拉手跪马拽倒的：脸朝下趴着
        if (this.downPhase === 'fall') return copyPose(t, this.slam ? lie : POSE.fall);   // 被摔：背着地直接砸下去
        if (this.downPhase === 'getup' && this.rollDir) {
          // 滚身起：团身沿地滚过去（往面朝的方向 = 前滚，反过来 = 后滚），最后几帧站起来
          const u = this.t / GETUP;
          if (u < 0.75) { copyPose(t, POSE.tuck); t.rot = (this.rollDir === this.facing ? 1 : -1) * 360 * EASE.io(u / 0.75); t.hy = 40; return t; }
          return copyPose(t, POSE.crouch);
        }
        if (this.downPhase === 'getup') return copyPose(t, evalKeys(this.prone ? PRONE_GETUP_KEYS : GETUP_KEYS, this.t));
        return copyPose(t, lie);
      }
      case 'win': {
        copyPose(t, PS.win); const s = Math.sin(ck * 0.08); t.fh[1] += s * 2; t.hy += s; return t;
      }
    }
    return copyPose(t, PS.stance);
  }
  animate(frozen) {
    const hold = this.holdPose; this.holdPose = false;      // 2.4 刚挨了一下（combat.js applyHit）：这一帧姿势先不变，顿帧过了再往后仰
    if (!frozen) {
      const tg = this.target();
      const st = this.state;
      // 跑步是循环动作，跟得紧一点（不然摆幅被抹平、脚会打滑）；刚起跑那几帧松一点，从站姿顺过去
      const k = st === 'attack' || st === 'tumble' ? 0.78 : this.carried ? 0.85 : (st === 'hit' || st === 'blockstun' || st === 'parry') ? 0.6
        : (st === 'down' || st === 'ko') ? (this.slam && this.downPhase === 'fall' ? 0.6 : 0.3) : st === 'run' ? (this.runT < 5 ? 0.5 : 0.88) : st === 'air' ? 0.32 : 0.4;
      if (!hold) lerpPose(this.disp, tg, lk(k), this.disp, true);       // 每帧往目标挪 k → 每步挪 lk(k)（2.6）
      const hy0 = this.hipY, ik0 = this.ikS ? this.ikS.slice() : null;
      this.fk();
      this.fitContact(hy0, ik0);
      emitQi(this);
      // 拳脚轨迹 + 残影（只在出招时有；跑步不留残影）
      const m = this.move;
      if (m && !m.def.script && m.def.limb && m.t >= m.S - 3 && m.t <= m.S + m.def.A + 2) {
        const e = this.J[m.def.limb];
        this.trail.push({ x: e[0], y: e[1], life: 8, max: 8, f: game.frame });
        if (m.def.ghost && m.t % 2 === 0) this.ghosts.push({ J: cloneJ(this.J), life: 10 });
      }
      if (m && (m.name === 'dash' || (m.name === 'slip' && m.t < 14) || (m.dashIn && m.t <= m.S + m.def.A)) && m.t % 2 === 0) this.ghosts.push({ J: cloneJ(this.J), life: 6, dash: true });
      // 跑起来以后，每一脚落地扬一点尘
      if (st === 'run' && this.runT > RUN_CHARGE) {
        const step = Math.floor(this.walkPhase * 2);
        if (step !== this.lastStep) { this.lastStep = step; const foot = step % 2 ? this.J.bf : this.J.ff; dust(foot[0], FLOOR, 2); }
      }
      for (let i = this.trail.length - 1; i >= 0; i--) if ((this.trail[i].life -= DT) <= 0) this.trail.splice(i, 1);
      for (let i = this.ghosts.length - 1; i >= 0; i--) if ((this.ghosts[i].life -= DT) <= 0) this.ghosts.splice(i, 1);
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - DT);          // 挨打白闪 / 抖动（只是画面），打中停顿里也照常倒数
    if (this.hitShake > 0) this.hitShake = Math.max(0, this.hitShake - DT);
    this.updateRibbons();
  }
  // 2.0.1 画面插值：记下上一帧画出来的样子（骨骼、发带、位置），render.js 在两帧之间按时间插着画 ——
  // 显示器比 60Hz 快（120 / 144Hz）时人跑起来不再一顿一顿、看着有重影。只是画面（vp 在 SNAP_SKIP 里）
  keepPrev() {
    if (!this.J) { this.vp = null; return; }
    const v = this.vp || (this.vp = { J: {}, rb: [] });
    for (const k in this.J) { const a = this.J[k]; if (Array.isArray(a)) { const t = v.J[k] || (v.J[k] = [0, 0]); t[0] = a[0]; t[1] = a[1]; } else v.J[k] = a; }
    v.rb.length = this.ribbons.length;
    this.ribbons.forEach((pts, i) => {
      const r = v.rb[i] || (v.rb[i] = []);
      r.length = pts.length;
      pts.forEach((q, j) => { const o = r[j] || (r[j] = { x: 0, y: 0 }); o.x = q.x; o.y = q.y; });
    });
  }
  /* 2.4 拳脚停在对方身上（只是画面）：出招时离得比射程近，照着姿势探身、伸直的拳脚会整个扎进对方身子里 ——
     ① 先看身子：探身、前冲（姿势的 dx）把头、躯干送进了对方身子里，就整个人往回让到刚贴上（踩在地上的脚不动）；
        往前上步的脚别踩进对方两脚中间；
     ② 再看拳脚：过了对方迎面那一层（body.js bodyPen）超过 CONTACT_SINK，就从这一帧真正伸到的地方把那只手 / 脚往回收
        （胳膊、腿自己弯回来）；肘、肩撞人收不了手，整个人往回让。
     姿势本身不改（下一帧照样从原来的姿势算），只是这一帧的骨骼 J */
  fitContact(hy0, ik0) {
    const m = this.move, o = this.opp, limb = m && this.state === 'attack' && !m.def.script ? m.def.limb : null;
    if (!limb || !o || !o.J || !this.J || !this.fkL || (o.x - this.x) * this.facing < 24) return;
    // 对手躺在地上、飞在空中（看画面：髋贴着地、两只脚都离地老高）不管 —— 往下踩、往上托的不是横着打
    if (FLOOR - o.J.hip[1] < 30 || FLOOR - Math.max(o.J.ff[1], o.J.bf[1]) > 24) return;
    // 先粗看一眼：自己最往前的关节都还够不着对方最靠前的关节（各留 22 的胖瘦、拳头、脚尖），就不用细量了
    const fw = this.facing, OJ = o.J, MJ = this.J;
    let oFront = 1e9, mFront = -1e9;
    for (const k of FIT_KEYS) { const a = OJ[k][0] * fw, b = MJ[k][0] * fw; if (a < oFront) oFront = a; if (b > mFront) mFront = b; }
    if (mFront + 22 < oFront - 22) return;
    const p = this.disp, arm = limb === 'fh' || limb === 'bh', leg = limb === 'ff' || limb === 'bf', A = BODY.bone.ankle;
    const ax = Math.cos(p.spin * D2R) * Math.cos(p.rot * D2R);   // 姿势里往前（x）挪 1，画面上往前挪多少（转身、翻滚时变小、反过来）
    const keep = { dx: p.dx, fh: p.fh.slice(), bh: p.bh.slice(), ff: p.ff.slice(), bf: p.bf.slice() };
    const noArms = !o.isBlocking();                             // 挡着的：拳头停在他的胳膊上；没挡：从护着的手上面过去，停在身上
    const oParts = bodyParts(OJ, 0).parts, tgtBody = bodyTargets(OJ, true, oParts), tgtHit = noArms ? tgtBody : bodyTargets(OJ, false, oParts);
    const CORE = FIT_CORE, FEET = FIT_FEET;
    const refit = () => { this.hipY = hy0; if (ik0) for (let i = 0; i < 4; i++) this.ikS[i] = ik0[i]; this.fk(); };
    // 脚踝目标放到 x（姿势的坐标），腿够不着就往髋底下收到刚好够着（不然脚会被拽离地）
    const legLen = BODY.bone.th + BODY.bone.sh - 0.8;
    const footTo = (k, x, y) => {
      const hj = k === 'ff' ? BODY.hipSplit : -BODY.hipSplit, dx2 = x - hj;
      if (Math.hypot(dx2, y) > legLen) x = hj + Math.sign(dx2) * Math.sqrt(Math.max(0, legLen * legLen - y * y));
      p[k][0] = x; p[k][1] = p.hy - A - y;
    };
    // 整个人往回让 d：踩在地上的脚尽量踩着原地（够不着就跟着往回滑一点；转身转得多了就跟着挪，不然腿要拧成麻花）
    // 2.7.1（Jack：沉肩靠腿别交叉）：沉肩靠这种整个人撞过去的（limb 'sh'），离得近就整个人连脚一起往回让 —— 只是这一步上得少；
    // 脚钉在原地的话，身子往回缩 40 像素，两只脚都跑到髋底下、膝盖往前拱，两条腿交叉成 X
    const whole = limb === 'sh';
    const back = d => {
      const L = this.fkL; p.dx -= d;
      if (!whole && Math.abs(ax) >= 0.6) for (const k of ['ff', 'bf']) if (Math.abs(L[k][1] - (p.hy - A)) < 6) footTo(k, L[k][0] + d / ax, L[k][1]);
    };
    // 2.7（Jack：二起脚的腿扭着、不同距离下腿怪）：出腿离得近、脚要往回收的时候，以前把脚踝平着往回拽 —— 往上踢的腿（鞭腿、二起脚）
    // 膝盖跟着往下顶、小腿往上翘，拧成一个往上开的 V；转身蹬这种平着蹬的，膝盖往下塌、人像蹲着。现在一律「收腿」的样子，膝盖在上面：
    //   · 先让膝盖留在原处，小腿绕着膝盖往下折回来（像出腿前提着膝的样子），脚最多折到髋下面 8（踢腿的脚不垂到髋以下）；
    //   · 还不够再平着往回收，膝盖往上提（不往下顶）。贴着地出的腿（脚离地不到 24，扫堂腿这种）不往下折，只平着收
    const foldLeg = (k, L, e, dl) => {
      const kn = L[k === 'ff' ? 'fk' : 'bk'], gy = p.hy - A, hj = k === 'ff' ? BODY.hipSplit : -BODY.hipSplit;
      const kd = dl > 0 ? 1 : -1;                                                                    // 这条腿往哪边踢（姿势坐标：往前 1，转身蹬往后 -1）
      let nx = e[0] - dl, ny = e[1];
      if (e[1] < gy - 24) {
        const r = Math.hypot(e[0] - kn[0], e[1] - kn[1]) || 1e-3, s = kd;
        const a0 = Math.atan2(e[1] - kn[1], s * (e[0] - kn[0]));                                    // 小腿的角度（照往踢的方向算，往下是正，过了 90° 是往回斜）
        const yLow = Math.max(e[1], 8);                                                              // 脚最多折到这么低（本来就更低的不往下折）
        let a = Math.acos(clamp(s * (nx - kn[0]) / r, -1, 1));                                       // 折到脚踝正好往回收 dl
        const aMax = Math.min(Math.PI / 2 + 0.7, kn[1] + r <= yLow ? 9 : Math.asin(clamp((yLow - kn[1]) / r, -1, 1)));
        a = clamp(a, a0, Math.max(a0, aMax));
        const fx = kn[0] + s * r * Math.cos(a), fy = kn[1] + r * Math.sin(a);
        nx = s * (fx - nx) > 0 ? nx : fx; ny = fy;                                                  // 折到头还不够：剩下的平着往回收
        p[k === 'ff' ? 'fkh' : 'bkh'] = [kn[0] - hj, kn[1] - 8];                                     // 膝盖留在原处、偏上（IK 挑那个解，不往下顶）
      }
      // 脚踝收到髋前面就收不动了（再收腿就折到身后去）：剩下的整个人往后让（back，和身子扎进去时一样）
      const lim = hj + kd * 6;
      if (kd * (nx - lim) < 0) { const rest = kd * (lim - nx); nx = lim; if (Math.abs(ax) >= 0.6) back(rest * Math.abs(ax)); }
      p[k][0] = nx; p[k][1] = p.hy - A - ny;
      // 膝盖弯在哪边直接定下来（不走 fk 里「几帧慢慢换边」：那几帧膝盖夹在两边中间，腿像一根缩短的直棍、或者往下塌）
      const h = p[k === 'ff' ? 'fkh' : 'bkh'];
      if (h && ik0) ik0[k === 'ff' ? 2 : 3] = ik(hj, 0, nx, ny, BODY.bone.th, BODY.bone.sh, h[0], h[1])[4];
    };
    let moved = 0;
    for (let it = 0; it < 2; it++) {
      const core = bodyParts(this.J, 0, CORE).parts.map(q => q.pts);
      const pen = bodyPenT(core, tgtBody, fw) - 2;
      if (pen <= 0.4 || moved >= 40) break;
      const d = Math.min(pen + 0.6, 40 - moved); moved += d; back(d); refit();
    }
    // 踩在地上的脚：往前上步别踩进对方两脚中间（脚尖最多到对方前脚尖再过去一点点）
    if (Math.abs(ax) >= 0.6) {
      const f = fw, opFeet = oParts.filter(q => q.foot);
      let front = 1e9; for (const q of opFeet) for (const [x] of q.pts) front = Math.min(front, x * f);
      const my = bodyParts(this.J, 0, FEET).parts, L = this.fkL;
      let fixed = false;
      for (const k of ['ff', 'bf']) {
        if (k === limb || Math.abs(L[k][1] - (p.hy - A)) >= 6) continue;
        const q = my.find(r => r.k === (k === 'ff' ? 'FF' : 'BF')); if (!q) continue;
        let toe = -1e9; for (const [x] of q.pts) toe = Math.max(toe, x * f);
        const over = toe - (front + 4);
        if (over > 0.5) { footTo(k, L[k][0] - over / ax, L[k][1]); fixed = true; }
      }
      if (fixed) refit();
    }
    if (!((arm || leg) && Math.abs(ax) < 0.35)) {
      // 2.9（Jack：踢的时候腿伸直一点，哪怕踢远一点；进步冲拳这些手也尽量伸直；一点点穿模可以，别穿太多）：
      //   以前拳脚一扎进去就把胳膊、腿往回弯（离射程近 15 像素，短拳的肘就弯到 90° 上下）。现在先整个人往回让 ——
      //   把探身、前冲（姿势的 dx）收回来一点，踩在地上的脚不动，胳膊、腿照旧伸直；让到头了（dx + STRAIGHT_BACK）还不够，才弯胳膊、折腿
      let cut = 0, lean = (arm || leg) && Math.abs(ax) >= 0.6 ? Math.max(0, Math.max(keep.dx, 8) + STRAIGHT_BACK - moved) : 0;
      for (let it = 0; it < 6; it++) {
        const sp = strikeParts(this.J, limb), pen = bodyPenT(leg ? sp.slice(0, 1) : sp, tgtHit, fw) - CONTACT_SINK;   // 腿：只看脚（膝盖顶进去像提膝，不管）
        if (pen <= 0.4 || cut >= 120) break;
        if (lean > 0.4) { const b = Math.min(pen + 0.6, lean); lean -= b; cut += b; back(b); refit(); continue; }
        const d = Math.min(pen + 0.6, 120 - cut), dl = d / ax, L = this.fkL, e = L[limb]; cut += d;
        if (arm) { p[limb][0] = e[0] - L.sh[0] - dl; p[limb][1] = e[1] - L.sh[1]; }
        else if (leg) foldLeg(limb, L, e, dl);
        else back(d);
        refit();
      }
    }
    p.dx = keep.dx; for (const k of ['fh', 'bh', 'ff', 'bf']) { p[k][0] = keep[k][0]; p[k][1] = keep[k][1]; }
    delete p.fkh; delete p.bkh;
  }
  /* 骨骼（2.4 新人物模型，比例、肩宽这些在 body.js 的 BODY 表）：
     髋（原点）→ 脊柱（tor 前倾）→ 脖子根 → 脖子 → 头；肩关节在脊柱上，拧腰 tw（度）时前手肩膀往前、后手肩膀往后错开；
     两个大腿根前后错开一点。手的目标点 fh / bh 是相对「两肩中间」sh 的；脚的目标点是脚踝（离鞋底 BODY.bone.ankle）。
     转身 spin：每个点除了前后（x）、上下（y）还有左右（z：后手肩、前腿根在近侧），绕竖轴转过去再投到画面上 ——
     转到一半时肩膀、两腿左右分开（正面看的样子），以前只是把 x 压扁 */
  fk() {
    const p = this.disp, L = BODY.bone;
    const tor = p.tor * D2R, hd = (p.tor + p.head) * D2R;
    const tx = Math.sin(tor), ty = -Math.cos(tor);            // 脊柱往上的方向
    const nx = -ty, ny = tx;                                   // 胸口朝前的方向（垂直于脊柱）
    const neck = [tx * L.torso, ty * L.torso];
    const sh = [tx * L.shoulder, ty * L.shoulder];
    const hx = Math.sin(hd), hy = -Math.cos(hd);              // 脖子、头往上的方向
    const neckTop = [neck[0] + hx * L.neck, neck[1] + hy * L.neck];
    const head = [neckTop[0] + hx * L.head * 0.84 - hy * L.head * 0.1, neckTop[1] + hy * L.head * 0.84 + hx * L.head * 0.1];
    // 拧腰：前手肩膀往前、后手肩膀往后（出前手拳往前送肩，出后手拳反过来）
    const tw = (p.tw || 0) * D2R, ts = Math.sin(tw) * BODY.shoulderW, tc = Math.cos(tw) * BODY.shoulderW;
    const shF = [sh[0] + nx * ts, sh[1] + ny * ts], shB = [sh[0] - nx * ts, sh[1] - ny * ts];
    const hipF = [BODY.hipSplit, 0], hipB = [-BODY.hipSplit, 0];
    // 2.1 肘、膝不「跳」（查动作衔接时发现的）：IK 每帧按提示硬挑弯向，手走到肩膀上方、起跳落地这些地方，
    // 提示一过线整条胳膊就一帧翻到另一边（出短拳时后手肘、起跳、落地、被打倒摔下去都有）。现在记着上一帧弯在哪边（ikS，画面用），
    // 要换边就每帧最多挪 IK_FLIP，几帧挪过去；一直弯在同一边的时候和以前一模一样
    const S = this.ikS || (this.ikS = [0, 0, 0, 0]), fresh = !this.J;
    const limb = (i, px, py, qx, qy, a, b, hx2, hy2) => {
      const want = ik(px, py, qx, qy, a, b, hx2, hy2)[4];
      S[i] = fresh ? want : S[i] + clamp(want - S[i], -IK_FLIP * DT, IK_FLIP * DT);
      return ik(px, py, qx, qy, a, b, hx2, hy2, S[i]);
    };
    const kf = p.fn === undefined ? 1 : p.fn, kb = p.bn === undefined ? 1 : p.bn;   // 膝盖往哪边顶（1 往前；-1 往后：仆步那条蹲着的腿脚尖外摆）
    const fA = limb(0, shF[0], shF[1], sh[0] + p.fh[0], sh[1] + p.fh[1], L.ua, L.fa, -0.3, p.fe);
    const bA = limb(1, shB[0], shB[1], sh[0] + p.bh[0], sh[1] + p.bh[1], L.ua, L.fa, -0.3, p.be);
    // 2.7 fkh / bkh：膝盖往哪边顶的提示直接给一个方向（只有 fitContact 收腿时临时放，让膝盖留在原处；脚尖朝向、亮边还是看 fn / bn）
    const fL = limb(2, hipF[0], hipF[1], p.ff[0], p.hy - L.ankle - p.ff[1], L.th, L.sh, p.fkh ? p.fkh[0] : kf, p.fkh ? p.fkh[1] : -0.15);
    const bL = limb(3, hipB[0], hipB[1], p.bf[0], p.hy - L.ankle - p.bf[1], L.th, L.sh, p.bkh ? p.bkh[0] : kb, p.bkh ? p.bkh[1] : -0.15);
    // 这一帧手、脚真正伸到哪（姿势的坐标，没转身、没翻滚以前）：fitContact 从这里往回收
    this.fkL = { sh, fh: [fA[2], fA[3]], bh: [bA[2], bA[3]], ff: [fL[2], fL[3]], bf: [bL[2], bL[3]], fk: [fL[0], fL[1]], bk: [bL[0], bL[1]] };
    // 2.5 膝盖往侧面摆（姿势的 fo / bo，度；Jack：扫堂腿蹲着的那条腿不是往后，是往侧面 —— z 轴）：
    // 膝盖绕「大腿根 → 脚踝」那条线往这条腿自己那一侧转出去（前腿 z+ 离镜头近、后腿 z- 离镜头远），脚踝不动。
    // 转到 90° 膝盖正冲着侧面：侧面看这条腿是缩短的（大腿、小腿冲着镜头 / 背着镜头），脚尖也跟着朝侧面（body.js 画鞋时变短）
    const kneeOut = (hp, Lg, deg, zs) => {
      if (!deg) return [Lg[0], Lg[1], 0];
      const ax = Lg[2] - hp[0], ay = Lg[3] - hp[1], al = Math.hypot(ax, ay) || 1e-3, ux = ax / al, uy = ay / al;
      const kx = Lg[0] - hp[0], ky = Lg[1] - hp[1], along = kx * ux + ky * uy, px = kx - ux * along, py = ky - uy * along;
      const a = deg * D2R, c = Math.cos(a);
      return [hp[0] + ux * along + px * c, hp[1] + uy * along + py * c, zs * Math.hypot(px, py) * Math.sin(a)];
    };
    const fKo = kneeOut(hipF, fL, p.fo || 0, 1), bKo = kneeOut(hipB, bL, p.bo || 0, -1);
    // 头带结（后脑勺）、腰带结
    const knot = [head[0] + hy * L.head * 0.95 + hx * L.head * 0.22, head[1] - hx * L.head * 0.95 + hy * L.head * 0.22];
    const belt = [-tx * 2 - 4, ty * 4];
    const zF = -tc, zB = tc, zHF = BODY.hipW, zHB = -BODY.hipW;   // 左右：后手肩、前腿根在近侧
    const pts = { hip: [0, 0, 0], hipF: [hipF[0], 0, zHF], hipB: [hipB[0], 0, zHB], neck: [neck[0], neck[1], 0], neckTop: [neckTop[0], neckTop[1], 0],
      head: [head[0], head[1], 0], sh: [sh[0], sh[1], 0], shF: [shF[0], shF[1], zF], shB: [shB[0], shB[1], zB], knot: [knot[0], knot[1], 0], belt: [belt[0], belt[1], 0],
      fe: [fA[0], fA[1], zF], fh: [fA[2], fA[3], zF], be: [bA[0], bA[1], zB], bh: [bA[2], bA[3], zB],
      fk: [fKo[0], fKo[1], zHF + fKo[2]], ff: [fL[2], fL[3], zHF], bk: [bKo[0], bKo[1], zHB + bKo[2]], bf: [bL[2], bL[3], zHB] };
    const sp = p.spin * D2R, sc = Math.cos(sp), ss = Math.sin(sp), r = p.rot * D2R, cr = Math.cos(r), sr = Math.sin(r);
    let maxY = -1e9;
    for (const k in pts) {
      const v = pts[k];
      const x = v[0] * sc - v[2] * ss, y = v[1];
      v[0] = x * cr - y * sr + p.dx; v[1] = x * sr + y * cr; v.length = 2;
      let low = v[1];
      if (k === 'head') low += L.head; else if (k === 'ff' || k === 'bf') low += L.ankle; else if (k === 'knot' || k === 'belt') continue;
      if (low > maxY) maxY = low;
    }
    let hipT;
    if (this.airborne) hipT = Math.min(-(this.alt + p.hy), -maxY);
    else hipT = -maxY - p.air;
    this.hipY = this.airborne ? hipT : this.hipY + (hipT - this.hipY) * lk(this.state === 'run' ? 0.85 : 0.55);
    if (!this.J) this.hipY = hipT;
    // 2.9 查别扭的动作时发现：从蹲着一下子站起来（托天掌、冲天炮、闪身、回身肘、过肩摔），髋跟得慢半拍，脚往地里陷 4 ~ 10 像素 —— 在地上时脚不往地里陷
    else if (!this.airborne && this.hipY > -maxY) this.hipY = -maxY;
    const J = this.J || (this.J = {});
    const f = this.facing, ox = this.x, oy = FLOOR + this.hipY;
    for (const k in pts) J[k] = [ox + f * pts[k][0], oy + pts[k][1]];
    J.turned = sc < 0; J.facing = f; J.rot = r; J.headTilt = hd; J.spin = sp;
    // 肘、膝该往哪边顶（世界方向）：画肌肉时分前侧后侧用（body.js）。是方向不是位置：故意不用数组（画面插值、转身平移只动数组）
    const hv = (x, y) => { const X = x * sc; return { 0: (X * cr - y * sr) * f, 1: X * sr + y * cr }; };
    J.hFe = hv(-0.3, p.fe); J.hBe = hv(-0.3, p.be); J.hFk = hv(kf, -0.15); J.hBk = hv(kb, -0.15); J.fkd = kf; J.bkd = kb;
    J.fft = p.ft || 0; J.bft = p.bt || 0;                      // 脚尖勾多少（度）
    // 2.9 掌：是不是掌（过了一半画成掌）、手指朝哪（世界方向，转身、翻滚、朝向都算进去；和 hFe 一样是方向不是位置，不用数组）
    const fdir = a => { const r = a * D2R, x = Math.cos(r) * sc, y = Math.sin(r), X = x * cr - y * sr, Y = x * sr + y * cr, l = Math.hypot(X, Y) || 1; return { 0: X / l * f, 1: Y / l }; };
    J.fpm = p.fp || 0; J.bpm = p.bp || 0; J.fpd = fdir(p.fpa); J.bpd = fdir(p.bpa);
    J.fpr = p.fpr === undefined ? 1 : p.fpr; J.bpr = p.bpr === undefined ? 1 : p.bpr;   // 2.10 掌心朝里 / 侧着 / 朝外（body.js palmShape）
    J.fwa = p.fw || 0; J.bwa = p.bw || 0;                    // 2.10.2 拳头绕手腕往上翘多少度（body.js 画拳头）
    J.fyaw = p.fo || 0; J.byaw = p.bo || 0;                    // 2.5 脚尖跟着膝盖往侧面摆多少（度）
    J.x = ox; J.alt = this.alt;                      // 这一套骨骼是按哪个位置算的（画面插值用，2.0.1）
  }
  // 发带：一串点（Verlet），每步按上一步的位移接着飘（每帧剩 86%）+ 风 + 重力（每帧² 多少像素 → 乘 DT²）
  updateRibbons() {
    const J = this.J, f = this.facing * (J.turned ? -1 : 1), dd = RIB_DAMP, d2 = DT * DT;
    this.ribbons.forEach((pts, k) => {
      const a = k < 2 ? J.knot : J.belt;
      pts[0].x = a[0]; pts[0].y = a[1] + (k === 1 ? 2 : 0);
      const seg = k < 2 ? RIB_SEG : 5;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * dd, vy = (p.y - p.py) * dd;
        p.px = p.x; p.py = p.y;
        const wind = -f * RIB_WIND + Math.sin(this.clock * 0.036 - i * 0.32 + k * 1.3) * RIB_GUST[0] + Math.sin(this.clock * 0.014 + k * 2.1) * RIB_GUST[1];
        p.x += vx + wind * d2; p.y += vy + 0.24 * d2;
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < pts.length; i++) {
          const a0 = pts[i - 1], p = pts[i];
          const dx = p.x - a0.x, dy = p.y - a0.y, d = Math.hypot(dx, dy) || 1e-3;
          p.x = a0.x + dx / d * seg; p.y = a0.y + dy / d * seg;
          if (p.y > FLOOR) p.y = FLOOR;
        }
      }
    });
  }
}
function cloneJ(J) {
  const o = {};
  for (const k in J) o[k] = Array.isArray(J[k]) ? J[k].slice() : J[k];
  return o;
}
