'use strict';
/* 电脑 AI：只看 react 帧之前的对手状态。按难度决定：格挡（看高低、先转身）、卸力、推挡、爆气、
   读招克制（拳→重、重→腿、腿→拳）、接腿、对空、闪步、下段、跑动沉肩靠、空中招、连招。
   1.8.0：截击、踩腿、抄腿（接扫堂腿 / 抓蹲挡）、擒住后续（提膝 / 别腿摔 / 过肩摔）、挣脱、借力摔、滚身起；少用扫堂腿
   2.0.2：闪身只躲得过重拳 —— 看见重拳才闪（躲过了自动回身肘）；对手挨了回身肘、背对着踉跄，接着打；看见对手闪身出短拳 / 腿截他。
   2.1（Jack：坠山击电脑不会应对、反应也慢；有的招电脑永远在吃 —— 所有难度都改；难度整体往上挪一档，再做一个断档式的「极难」）：
     难度：易 = 2.0.2 的「中」、中 = 2.0.2 的「难」、难 = 2.0.2 的「地狱」（都修过下面这些毛病），极难 = 新做的。
     · 防跳（aaPlan，所有难度）：看见你起跳（还是要反应 react 帧）就先想好怎么接 —— 算着你的落点出托天掌、站着挡（空中招都是上段，
       以前一半时间蹲着挡，挡不住）、往后让开再打你落地；看见坠山换成站着等它下来用拳迎。以前要等看见空中招本身才动，
       快的空中招根本来不及，坠山击打过来常常是蹲着挨
     · 挡住就罚（punishBlock，所有难度）：挡住你一下、你还在收招 / 落地，挑够得着、来得及、最疼的一套打回去（以前只有地狱会，别的难度只罚打空的）
     · 记习惯（habit，所有难度，难度越高记得越清）：你在多远爱先出什么，老出同一招它就提前防（先挡、先出克它的招、跳就等着托天掌），
       「永远吃同一招」就没有了；你一直换着来，它就只能靠反应
     · 近身先护着（guard）：贴得近的时候时不时先举手（短拳 5 帧前摇，谁都反应不过来，只能预判）
     · 极难（inst）：反应本身和人差不多（10 帧），但每一招都有一定概率被它「瞬间看穿」—— 1 帧就看清，挑最赚的破法、时机按到帧
       （卡准帧卸力、重拳霸体硬吃短拳、腿踢化解重拳、接腿、托天掌打跳、拳迎坠山……）。看穿的概率基础 0.6，你在这个距离老出的招最多 0.88；
       主动进攻也更聪明（罚打空、挡完的习惯、上下段擒拿换着来、隔远了也冲过去罚）。高手要赢它：别养习惯、别出不安全的招、挡住它的进攻再罚
   2.1 起出招、格挡、站着都不按方向（不按方向游戏自己让人面朝对手，出招也自己朝对手打）；按方向只用来走、跑、冲刺、边挡边走。
   2.2（Jack：单机改成 入门 / 简单 / 中等 / 困难 / 终极，每个两个字；加一个比简单还简单一点的入门；困难降 5~10%；
     终极（2.1 的极难）全是读指令 + 破招，完全玩不了，降一点；做完每一档要拉得开）：
     · 入门（novice，新）：反应 12 帧、挡得少、连招短（NOVICE_PLANS 多是一两下）、常发呆、很少罚
     · 简单 = 2.1 的易、中等 = 2.1 的中，没动
     · 困难 = 2.1 的难松一点：反应 7 → 8 帧、看穿 0.5 → 0.45、挡 0.7 → 0.66、挡住就罚 0.92 → 0.86、记习惯 0.85 → 0.8
       （实测：一个乱换招的「木头玩家」每次交手平均亏 7.1 → 6.1，打掉的血占比 25% → 28%；对 2.1 的中每次交手的赚头少 5% 上下）
     · 终极 = 2.1 的极难把「瞬间看穿」降下来：基础 0.6 → 0.3，你的习惯招最多 0.88 → 0.55（跳起来也跟着降）；别的本事不变
       （实测：木头玩家打掉的血占比 11% → 20%，输掉的交手 64% → 52%；还是一档里最强，电脑对电脑赢困难九成以上）
   2.10 咏春拳重做（WINGCHUN.md）：咏春拳的电脑按拍子打连环冲拳（手准不准看难度 beatSd）、挡 = 黐手（按着挡黏住进搭手）、
     刚按下挡 = 拍手 / 耕手、挨打时黐手破连（brk 试不试、brkAcc 方向对不对）、搭手里翻手型 / 从手型里打出去 / 拉手扣住手腕往下拽；
     谁被黏住都会甩手、在他翻手那一拍里反拿（搭手里看手上的感觉：feel 帧，比眼睛的 react 快 —— 黐手练的就是这个）。
     传统格斗的电脑打咏春拳：多抓、多打下段（黐手黏不住擒拿，站着黏不住下段），连招别太长
   AI 可以用随机数（联机不走 AI） */

// 计划里 'd:xx' = 按住蹲再按 xx（地面：下盘拳 / 扫堂腿 / 托天掌；空中 d:kick = 坠山）
const PLANS = {
  // 2.2 入门：多是一两下（单拳、两拳、拳重、单出重拳 / 腿），很少三下以上
  novice: [[['jab'], 3], [['jab', 'jab'], 3], [['jab', 'heavy'], 2], [['heavy'], 2], [['kick'], 2], [['jab', 'kick'], 1.5], [['heavy', 'kick'], 1],
    [['kick', 'kick'], 0.6], [['grab'], 1], [['d:jab'], 1], [['d:kick'], 0.4], [['jab', 'jab', 'heavy'], 1]],
  easy: [[['jab'], 2], [['jab', 'jab'], 2], [['jab', 'heavy'], 3], [['jab', 'jab', 'heavy'], 3], [['jab', 'kick'], 2], [['jab', 'jab', 'kick'], 2],
    [['jab', 'jab', 'jab', 'jab'], 1], [['heavy', 'kick'], 2], [['heavy', 'jab'], 1], [['heavy', 'heavy'], 1], [['kick', 'jab'], 1], [['kick', 'kick'], 1],
    [['grab'], 1], [['d:jab', 'd:kick'], 0.6], [['d:kick'], 0.4], [['jab', 'd:kick'], 0.4], [['d:jab'], 1], [['d:jab', 'jab', 'heavy'], 1]],
  normal: [[['jab', 'jab'], 1], [['jab', 'heavy'], 3], [['jab', 'jab', 'heavy'], 4], [['jab', 'kick'], 3], [['jab', 'jab', 'kick'], 3],
    [['heavy', 'kick'], 3], [['heavy', 'jab', 'heavy'], 2], [['heavy', 'heavy'], 2], [['heavy', 'd:kick'], 0.6], [['kick', 'jab', 'jab'], 2],
    [['kick', 'heavy'], 2], [['kick', 'kick'], 2], [['grab'], 2], [['d:jab', 'd:kick'], 0.6], [['jab', 'd:kick'], 0.5], [['d:jab', 'jab', 'heavy'], 2], [['d:jab', 'jab', 'kick'], 1]],
  // 难（2.0.2 的地狱）：打中就接击倒的那几套（冲天炮、旋风腿、二起脚、盖步砸拳），倒了接着压起身
  hard: [[['jab', 'jab', 'heavy'], 4], [['jab', 'heavy'], 2], [['jab', 'jab', 'kick'], 2], [['heavy', 'kick'], 4], [['kick', 'kick'], 3], [['kick', 'heavy'], 2],
    [['heavy', 'heavy'], 1], [['kick', 'jab', 'jab'], 1], [['grab'], 2], [['d:jab', 'jab', 'heavy'], 2], [['d:jab', 'd:kick'], 1], [['jab', 'jab', 'jab', 'jab'], 1]],
  // 极难：一样爱接击倒，短拳起手的多（快、被挡也不亏），偶尔擒拿、下段换着来
  hell: [[['jab', 'jab', 'heavy'], 5], [['jab', 'heavy'], 2], [['jab', 'jab', 'kick'], 3], [['heavy', 'kick'], 3], [['kick', 'kick'], 2], [['kick', 'heavy'], 2],
    [['grab'], 2], [['d:jab', 'jab', 'heavy'], 2], [['d:jab', 'd:kick'], 1], [['jab', 'jab', 'jab', 'jab'], 1]],
};
// react 反应帧；block 格挡率；lowRead 高低判断对的概率；parry 卸力；push 推挡；burst 爆气；read 读招克制；
// catch 接腿；duck 蹲躲飞踢；aa 对空；step 闪步；low 用下段；sup 放泼墨；
// 1.8.0：tech 被擒住时挣脱；gc 挡住后截击；stomp 蹲挡住扫堂腿后踩腿；scoop 看到扫堂腿出抄腿；roll 倒地滚身起；其余同旧版
// 2.0：slip 闪身（2.0.2：看见重拳闪身钻过去）；gwalk 边挡边往后退；oki 压起身（对手站起来那几帧出快招）；catchSlip 看到闪身出短拳 / 腿截住
// 2.0.2：see 看穿招的概率（习惯招更高，最多 0.8）；smart 打开看穿、预判、算准时机、主动罚这些本事（以前叫 hell）
// 2.1：airBlock 看见空中招站着挡（挡对高低）的概率；aaPlan 看见起跳就想好怎么接的概率；habit 记习惯有多准；guard 近身先举手；
//      punishBlock 挡住以后罚；inst / instMax 极难「瞬间看穿」的概率（基础 / 你的习惯招）
const LEVELS = {
  // 2.2 入门（新）：比简单再简单一点 —— 反应慢、挡得少、很少读招和卸力、连招短、常发呆；防跳、挡住就罚、记习惯都只有一点。
  // 2.3（Jack：再降 5~10%）：反应 12 → 13、挡 0.4 → 0.34、读招 0.22 → 0.16、罚 0.42 → 0.35、挡住就罚 0.45 → 0.38、连招接下去 0.7 → 0.62、主动 0.75 → 0.7
  // 2.7（Jack：入门再简单很多，让乱打的打掉 80% 以上的血；入门、简单别搞那么多破招）：反应 13 → 22、挡 0.34 → 0.12、读招 0.16 → 0.03，
  //     卸力、推挡、接腿、对空、截击、踩腿、抄腿、闪身、挡住就罚、记习惯都只剩一点点；主动 0.7 → 0.42、常发呆（0.55）、连招短、很少罚
  novice: { react: 22, block: .12, lowRead: .4, parry: .02, push: .04, burst: .1, read: .03, catch: .06, duck: .3, aa: .1, step: .1, low: .15, sup: .35,
    punish: .08, combo: .35, aggr: .42, jump: .45, grabBlock: .18, idle: .55, tech: .05, gc: .03, stomp: .12, scoop: .03, roll: .15,
    slip: .02, gwalk: .1, oki: .1, catchSlip: .06, airBlock: .35, aaPlan: .2, habit: .08, guard: .1, punishBlock: .12,
    beatSd: 2, brk: .06, brkAcc: .4, touch: .1, feel: 7 },
  // 简单（2.1 叫「易」）= 2.0.2 的「中」：反应 11 帧，挡一半、偶尔读招；修好了防跳、挡空中招、挡住就罚、记一点习惯
  // 2.7（Jack：简单也再简单些，让乱打的打掉 65% 以上；破招少一点）：读招 0.3 → 0.06、卸力 0.12 → 0.05、推挡 0.25 → 0.05、对空 0.4 → 0.12、
  //     接腿、抄腿、截击、踩腿、闪身都少了；挡住就罚 0.55 → 0.3、罚 0.55 → 0.25；反应 11 → 14。挡、连招只降一点（0.36、0.72）、记习惯照旧 0.45
  //     —— 打法朴素一点，不是光挨打；你老出同一招它还是会慢慢防住（不破招，只是挡对）
  easy: { react: 14, block: .36, lowRead: .55, parry: .05, push: .05, burst: .25, read: .06, catch: .18, duck: .45, aa: .12, step: .18, low: .18, sup: .55,
    punish: .25, combo: .72, aggr: .78, jump: .65, grabBlock: .32, idle: .3, tech: .12, gc: .08, stomp: .3, scoop: .1, roll: .27,
    slip: .05, gwalk: .2, oki: .3, catchSlip: .18, airBlock: .5, aaPlan: .25, habit: .45, guard: .24, punishBlock: .3,
    beatSd: 1.7, brk: .1, brkAcc: .5, touch: .25, feel: 6 },
  // 中等（2.1 叫「中」）= 2.0.2 的「难」
  // 2.7（Jack：中等也再简单点，让乱打的打掉 40% 以上）：反应 8 → 9、挡 0.66 → 0.58、读招 0.5 → 0.38、卸力 0.25 → 0.16、接腿 0.6 → 0.45、对空 0.7 → 0.55、
  //     罚 0.85 → 0.7、挡住就罚 0.8 → 0.65、连招接下去 0.95 → 0.85、压起身 0.75 → 0.6、发呆 0.1 → 0.15（记习惯不降：老出同一招照样防得住）
  normal: { react: 9, block: .58, lowRead: .8, parry: .16, push: .45, burst: .75, read: .38, catch: .45, duck: .8, aa: .55, step: .4, low: .25, sup: .9,
    punish: .7, combo: .85, aggr: 1, jump: 1, grabBlock: .7, idle: .15, tech: .4, gc: .35, stomp: .9, scoop: .4, roll: .55,
    slip: .2, gwalk: .45, oki: .6, catchSlip: .55, airBlock: .9, aaPlan: .72, habit: .65, guard: .46, punishBlock: .65,
    beatSd: 1.6, brk: .25, brkAcc: .6, touch: .45, feel: 4 },
  // 困难（2.1 叫「难」）= 2.0.2 的「地狱」：看穿、记习惯、预判、算准时机、主动罚。
  // 2.2（Jack：降 5~10%）：反应 7 → 8 帧、看穿 0.5 → 0.45（习惯招最多还是 0.8）、挡 0.7 → 0.66、挡住就罚 0.92 → 0.86、记习惯 0.85 → 0.8
  // 2.7 没动（倒地、滚身起改了以后量过：木头玩家占比 12 个种子 2.6 是 26.9%、2.7 是 26.6%）
  hard: { react: 8, block: .66, lowRead: .85, parry: .25, push: .45, burst: .75, read: .5, catch: .6, duck: .8, aa: .7, step: .4, low: .25, sup: .9,
    punish: .9, combo: .95, aggr: 1, jump: 1, grabBlock: .7, idle: .06, tech: .4, gc: .35, stomp: .9, scoop: .4, roll: .55,
    slip: .2, gwalk: .45, oki: .75, catchSlip: .55, see: .45, smart: true, airBlock: .95, aaPlan: .82, habit: .8, guard: .54, punishBlock: .86,
    beatSd: 1, brk: .4, brkAcc: .7, touch: .6, feel: 3 },
  // 2.6（连招、高级招伤害提了，电脑一套连招打得更疼）：困难的罚 0.95 → 0.9、连招接下去 1 → 0.95；终极的罚、连招 1 → 0.93 —— 难度拉回 2.5 的样子
  //（乱换招的木头玩家打掉的血占比，2.5：入门 67% · 简单 53% · 中等 38% · 困难 28% · 终极 22.5%；2.6：66% · 52% · 34% · 28.5% · 23.5%；
  //  2.7（12 个种子；同样 12 个种子量 2.6 是 66% · 53% · 35% · 27% · 23.5%）：84% · 69% · 43% · 26.5% · 22.5%）
  // 终极（2.1 叫「极难」，id 还是 hell）：平时反应 10 帧（和人差不多），但每一招有 inst 的概率被它 1 帧看穿、按最赚的破法、时机按到帧（非人）；
  // 别的本事全开：挡得多、高低几乎不错、罚满、连招满、记习惯最准、主动进攻最聪明。
  // 2.2（Jack：全是读指令 + 破招，完全玩不了）：瞬间看穿基础 0.6 → 0.3、习惯招最多 0.88 → 0.55
  // 2.3（Jack：再降 5~10%）：瞬间看穿基础 0.3 → 0.2（你老出的招最多还是 0.55：别养习惯）、看穿 see 0.55 → 0.48、平时反应 10 → 11 帧、挡 0.8 → 0.74
  hell: { react: 11, block: .74, lowRead: .92, parry: .35, push: .5, burst: .9, read: .6, catch: .7, duck: .9, aa: .85, step: .45, low: .3, sup: 1,
    punish: .93, combo: .93, aggr: 1, jump: .7, grabBlock: .8, idle: .05, tech: .65, gc: .5, stomp: 1, scoop: .5, roll: .65,
    slip: .25, gwalk: .4, oki: .9, catchSlip: .7, see: .48, smart: true, airBlock: 1, aaPlan: .95, habit: 1, guard: .55, punishBlock: 1,
    inst: .2, instMax: .55, instReact: 1,
    beatSd: .8, brk: .5, brkAcc: .75, touch: .7, feel: 2 },
};
// 2.10 咏春拳：beatSd 连环冲拳按得离拍点差多少帧（标准差；拍子前 WC_EARLY、后 WC_LATE 帧以内算在拍子上）；
//   brk 挨打时试不试黐手破连、brkAcc 方向按对的概率（三个方向，瞎猜是三成）；touch 搭手里懂不懂行（翻对手型、反拿、甩手）；
//   feel 搭手里手上的反应（帧）：黏着的时候看他几帧以前的样子（比 react 快：手上的感觉比眼睛快）
// 2.2 难度的名字（两个字）：菜单、电脑血条底下用（2.3 Jack：菜单上不要介绍，一句话说明删了）
const LEVEL_NAME = { novice: '入门', easy: '简单', normal: '中等', hard: '困难', hell: '终极' };
for (const id in LEVELS) LEVELS[id].id = id;                   // 2.9 每一档知道自己是哪一档（咏春拳的电脑按档打折用）
const LEVEL_IDS = Object.keys(LEVELS);
function weighted(list) {
  let sum = 0; for (const [, w] of list) sum += w;
  let r = Math.random() * sum;
  for (const [v, w] of list) { r -= w; if (r <= 0) return v; }
  return list[0][0];
}
// 计划里的前缀：'d:xx' 蹲着按；2.10 'f:xx' 朝对手按着方向按、'b:xx' 背着对手按（咏春拳：前 + 拳 = 标指、前 + 重 = 批肘、后 + 重 = 拐肘）；
// 'H:heavy' 按住重蓄劲（咏春拳的寸拳，蓄满 = 寸劲破体）
const prefixOf = a => a.length > 2 && a[1] === ':' ? a[0] : '';
const kindOf = a => prefixOf(a) ? a.slice(2) : a;
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.732;   // 大约是标准正态（均值 0、标准差 1）
// 2.0.2 这一招闪身躲得过吗：重系的手上招（重拳、进步冲拳、劈山掌、盖步砸拳、沉肩靠、截击）
const slipable = d => !!d && !d.air && d.tier === 'heavy' && d.kind === 'heavy' && d.height !== 'low';
const effRD = d => d.reach + (d.lunge && !d.script ? Math.max(0, d.lunge[2]) : 0);   // 一招的最远射程（射程 + 前冲）
const effR = n => effRD(MOVES[n]);
const bandOf = dist => dist <= 100 ? 0 : dist <= 170 ? 1 : 2;            // 近 / 中 / 远
// 记对手「中立时先出什么」用的归类（一串里接的招不记，只记第一下）
const OPENER = { jab: 'jab', lowJab: 'lowJab', heavy: 'heavy', shoulder: 'heavy', palm: 'palm', kick: 'kick', sweep: 'sweep', grab: 'grab', lowGrab: 'lowGrab',
  airJab: 'air', airHeavy: 'air', airKick: 'air', dive: 'dive', dash: 'dash', slip: 'slip' };
// 2.1 挑起手招时拿来比克制关系的「代表招」（习惯归类 → 招）
const HABIT_MOVE = { jab: 'jab', lowJab: 'lowJab', heavy: 'heavy', palm: 'palm', kick: 'kick', sweep: 'sweep', grab: 'grab', lowGrab: 'lowGrab',
  lowKick: 'sweep', trap: 'trap' };                                       // 咏春拳的截脚算扫堂腿那一类；拉手是新的一类
// 2.1 贴身两边差不多同时出手，谁赚（实测出来的，前摇快慢、霸体、接腿、蹲低躲擒拿都算进去）：VS[我的][他的] = 1 我赚 / -1 他赚 / 0 差不多
//   短拳快，打得断腿、擒拿、托天掌，怕重拳霸体；重拳霸体吃拳，怕腿化解、怕擒拿（擒拿更快）；腿克重拳、被拳打失衡、被接腿；
//   扫堂腿蹲得低站着的擒拿抓不到，怕拳、怕抄腿；擒拿接得住腿、抓得住重拳，怕拳、抓不到蹲低的；下盘拳又快又低
//   trap：咏春拳的拉手（拉得住地上手上的招，接不住腿，下段拉不到）；还有咏春拳自己起手的几行（w:xx，计划里第一键）
const VS = {
  jab:    { jab: 0, lowJab: 0, heavy: -1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: -1 },
  lowJab: { jab: 0, lowJab: 0, heavy: -1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: 1 },
  heavy:  { jab: 1, lowJab: 1, heavy: 0, kick: -1, sweep: -1, grab: -1, lowGrab: -1, palm: 0, trap: -1 },
  kick:   { jab: -1, lowJab: -1, heavy: 1, kick: 0, sweep: 0, grab: -1, lowGrab: -1, palm: 1, trap: 1 },
  sweep:  { jab: -1, lowJab: -1, heavy: 1, kick: 0, sweep: 0, grab: 1, lowGrab: -1, palm: 1, trap: 1 },
  grab:   { jab: -1, lowJab: -1, heavy: 1, kick: 1, sweep: -1, grab: 0, lowGrab: 0, palm: 1, trap: 0 },
  lowGrab: { jab: -1, lowJab: -1, heavy: 0, kick: 1, sweep: 1, grab: 0, lowGrab: 0, palm: 0, trap: -1 },
  palm:   { jab: -1, lowJab: -1, heavy: 0, kick: -1, sweep: -1, grab: -1, lowGrab: 0, palm: 0, trap: -1 },
  // 咏春拳起手：冲拳、标指（插在他出手的胳膊上 = 挑开进搭手：手上的招都怕它）、低掌、正撑脚、截脚（截地上的腿）、寸拳（霸体吃一拳）、拉手、截腿
  'w:jab':     { jab: 0, lowJab: 0, heavy: -1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: -1 },
  'w:biu':     { jab: 1, lowJab: 0, heavy: 1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: -1 },
  'w:lowJab':  { jab: 0, lowJab: 0, heavy: -1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: 1 },
  'w:kick':    { jab: -1, lowJab: -1, heavy: 1, kick: 0, sweep: 0, grab: -1, lowGrab: -1, palm: 1, trap: 1 },
  'w:lowKick': { jab: -1, lowJab: -1, heavy: 1, kick: 1, sweep: 1, grab: 0, lowGrab: -1, palm: 1, trap: 1 },
  'w:heavy':   { jab: 1, lowJab: 1, heavy: 0, kick: -1, sweep: -1, grab: -1, lowGrab: -1, palm: 0, trap: -1 },
  'w:trap':    { jab: 1, lowJab: -1, heavy: 1, kick: -1, sweep: -1, grab: 0, lowGrab: 0, palm: 1, trap: 0 },
  'w:lowGrab': { jab: -1, lowJab: -1, heavy: 0, kick: 1, sweep: 1, grab: 0, lowGrab: 0, palm: 0, trap: -1 },
};
const W_OPEN = { jab: 'w:jab', 'f:jab': 'w:biu', 'd:jab': 'w:lowJab', kick: 'w:kick', 'd:kick': 'w:lowKick', heavy: 'w:heavy', 'H:heavy': 'w:heavy',
  'f:heavy': 'w:heavy', 'b:heavy': 'w:heavy', 'd:heavy': 'w:heavy', grab: 'w:trap', 'd:grab': 'w:lowGrab' };
const HAND_LIMB = /^(fh|bh|fe|be|sh)$/;
const OPEN_OF = a => a.startsWith('d:') ? DOWN_OF[a.slice(2)] : a;      // 计划里的第一下是哪一招

/* ============================================================
   拳派：电脑用的是哪一派、对面是哪一派。
   · 电脑自己的招都按自己这一派查（this.MV、按键 → 中立时出的那一招 mvOf）；对面的招按对面那一派查（o.moves）。
   · 每一派的打法（连招计划、反打、压起身、挡住以后罚哪一套、接腿……）写在 KITS 里；
     2.10 咏春拳：连环冲拳按拍子一串打到底、黐手黏住进搭手、拍手拍开手上的招、耕手耕开腿、拉手拉住打过来的手、搭手里翻手型打人、拉手跪马。
   · 传统格斗的电脑打咏春拳：被他刚起手的两三下打中，一直按着挡（那一点空里挡下来）；他按着挡（黐手）就抓、打下段
   ============================================================ */
// 按键 → 这一派中立时出的那一招（'d:jab' = 蹲着按；咏春拳的 'f:jab' 这种带方向的直接查表：算的时候方向还没按下去）
const W_KEY = { 'f:jab': 'wBiu', 'f:heavy': 'wPai', 'b:heavy': 'wGwai', 'H:heavy': 'wCun' };
const neutralMove = (F, a) => F.style === 'wc' && W_KEY[a] ? W_KEY[a] : styleOf(F).variant(kindOf(a), [], false, a.startsWith('d:') ? 'down' : '');
// 咏春拳的连招计划（按键串）：拳一直按 = 连环冲拳（按拍子，第 8 下是寸拳收势）；连环拳里按重 = 寸拳收势、按踢 = 侧撑脚 → 连环撑 → 踩膝、按拿 = 拉手扣住手腕
const J8 = ['jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab'];
const Jn = n => J8.slice(0, n);
// 咏春拳的电脑看穿招、化招的机会打个折：咏春拳化开一招就是一整套（拍开、黏住进搭手），同一档难度两派要差不多强（电脑对电脑量出来的）
const W_READ = { novice: 1, easy: 1, normal: 0.5, hard: 0.5, hell: 0.8 };
const wcReadMul = L => W_READ[L.id] || 1;
// 咏春拳的电脑举手挡的机会也打个折：咏春拳挡住（黐手黏住）就是一整套，比传统格斗挡住再罚赚得多（量出来的：对乱打的木头玩家一档一档拉得开）
const W_GUARD = { novice: 1, easy: 1, normal: 0.45, hard: 0.5, hell: 0.55 };
const wcGuardMul = L => W_GUARD[L.id] || 1;
// 两派电脑对打调平用的几个数（电脑对电脑量出来的；改了重新量，见 NOTES「量难度」）
const AI_TUNE = {
  wcStop: [0.1, 0.3],       // 咏春拳的连环冲拳被挡住：停手的机会（普通、聪明的）
  wcStopGrab: 0.25,         // 被挡住以后改拉手扣他的机会
  escK: 0.6, escB: 0.05,    // 打咏春拳：被连环冲拳刚起手打中，一直按着挡的机会 = 挡的本事 × escK + escB
  ctrW: [0.05, 0.4],        // 被黏住时打算反拿的分量 = a + b × 搭手的本事
  wcLow: 0.1, wcGrabBlk: 0.22,   // 咏春拳对着站挡的人：打下段、拉手的机会（传统格斗是 0.05、0.12）
};
// 搭手、甩手直冲以后接着按拍子连几下（难度越高连得越长）
const W_AFTER = { novice: 3, easy: 3, normal: 3, hard: 5, hell: 5 };
// 连环冲拳每一拳接不接下去（一串八拳，接下去的机会 ^7 是打满的机会；入门、简单的拍子按不准，常常自己断）
const W_CHAIN = { novice: 0.92, easy: 0.92, normal: 0.91, hard: 0.955, hell: 0.93 };
const WPLANS = {
  // 咏春拳一下一下都轻，靠连：入门、简单也连，只是按不准拍子、常常连着连着就断了
  novice: [[Jn(3), 3], [Jn(4), 2], [Jn(2), 2], [['kick', 'kick'], 1.5], [['jab', 'kick', 'kick'], 1], [['jab', 'jab', 'heavy'], 1],
    [['d:kick', 'jab', 'jab'], 1], [['grab'], 1], [['d:jab', 'jab', 'jab'], 1], [['heavy'], 0.8], [['f:jab', 'jab'], 0.6]],
  easy: [[Jn(5), 3], [J8, 1.5], [['jab', 'jab', 'kick', 'kick', 'kick'], 2], [['jab', 'jab', 'jab', 'heavy'], 2], [['kick', 'kick', 'kick'], 1.5],
    [['kick', 'jab', 'jab', 'jab'], 1], [['d:kick', 'jab', 'jab', 'jab'], 1], [['grab'], 1], [['d:jab', 'jab', 'jab', 'jab'], 1], [['heavy', 'jab', 'jab'], 0.8],
    [['f:jab', 'jab', 'jab', 'jab'], 1], [['f:heavy'], 0.5]],
  normal: [[Jn(5), 2], [J8, 3], [['jab', 'jab', 'kick', 'kick', 'kick'], 2], [['jab', 'jab', 'jab', 'heavy'], 3], [['jab', 'jab', 'jab', 'jab', 'jab', 'heavy'], 2],
    [['kick', 'jab', 'jab', 'jab', 'jab'], 2], [['d:kick', 'jab', 'jab', 'jab', 'jab'], 1.5], [['grab'], 1.5], [['d:jab', 'jab', 'jab', 'jab'], 1],
    [['f:jab', 'jab', 'jab', 'jab', 'jab'], 1.5], [['heavy', 'jab', 'jab', 'jab'], 1], [['jab', 'jab', 'grab'], 1], [['f:heavy'], 0.6], [['b:heavy'], 0.4], [['d:heavy'], 0.4]],
  hard: [[J8, 4], [['jab', 'jab', 'jab', 'jab', 'heavy'], 3], [['jab', 'jab', 'jab', 'jab', 'kick', 'kick', 'kick'], 2], [['jab', 'jab', 'grab'], 1.5],
    [['d:kick', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab'], 2], [['kick', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab'], 1.5], [['grab'], 2], [['d:jab', 'jab', 'jab', 'jab', 'jab'], 1],
    [['f:jab', 'jab', 'jab', 'jab', 'jab', 'jab'], 1.5], [['heavy', 'jab', 'jab', 'jab', 'jab'], 1], [['f:heavy'], 0.6], [['d:heavy'], 0.5]],
  hell: [[J8, 5], [['jab', 'jab', 'jab', 'jab', 'heavy'], 3], [['jab', 'jab', 'jab', 'jab', 'kick', 'kick', 'kick'], 2], [['jab', 'jab', 'grab'], 2],
    [['d:kick', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab'], 2], [['grab'], 2], [['d:jab', 'jab', 'jab', 'jab', 'jab'], 1], [['f:jab', 'jab', 'jab', 'jab', 'jab', 'jab'], 2],
    [['heavy', 'jab', 'jab', 'jab', 'jab'], 1], [['f:heavy'], 0.5]],
};
const KITS = {
  trad: { id: 'trad', plans: PLANS, catchKey: 'grab', runHeavy: true, dashIn: ['jab', 'heavy', 'heavy', 'kick'],
    parry: dist => (dist <= 92 ? pick([['jab', 'jab', 'heavy'], ['jab', 'kick'], ['heavy', 'kick'], ['heavy', 'heavy']]) : ['heavy', 'kick']).slice(),
    oki: smart => (smart ? pick([['jab', 'jab', 'heavy'], ['jab', 'jab', 'kick'], ['jab', 'heavy']]) : pick([['jab', 'jab', 'heavy'], ['jab', 'kick'], ['jab', 'jab', 'jab', 'jab']])).slice(),
    stagger: dist => (dist <= 92 ? pick([['jab', 'jab', 'heavy'], ['jab', 'kick'], ['heavy', 'kick']]) : dist <= 116 ? ['heavy', 'kick'] : ['kick', 'kick']).slice(),
    // 挡住以后罚：[第一下, 整套, 大概多疼]（够得着、来得及的里挑最疼的）
    routes: [['heavy', ['heavy', 'kick'], 27], ['jab', ['jab', 'jab', 'heavy'], 26], ['kick', ['kick', 'kick'], 21], ['jab', ['jab', 'heavy'], 20], ['d:kick', ['d:kick'], 8]] },
  wc: { id: 'wc', wc: true, plans: WPLANS, catchKey: 'd:grab', runHeavy: false, dashIn: ['jab', 'jab', 'kick'],
    // 反打（拍开、耕开以后）：连环冲拳打到底 / 冲拳接寸拳收势 / 拉手扣住手腕（进搭手，接拉手跪马）/ 连环撑
    parry: () => pick([J8, J8, ['jab', 'jab', 'jab', 'jab', 'heavy'], ['grab'], ['kick', 'kick', 'kick'], ['heavy', 'jab', 'jab', 'jab', 'jab']]).slice(),
    oki: () => pick([J8, ['jab', 'jab', 'jab', 'jab', 'heavy'], ['d:jab', 'jab', 'jab', 'jab', 'jab'], J8]).slice(),
    stagger: dist => (dist <= 84 ? pick([J8, ['jab', 'jab', 'jab', 'jab', 'heavy'], ['f:heavy']]) : pick([['f:jab', 'jab', 'jab', 'jab', 'jab'], ['kick', 'kick', 'kick']])).slice(),
    // 从手型里打出去以后接着按拍子连几下（搭手、甩手直冲以后）
    after: L => Jn(W_AFTER[L.id] || 4),
    routes: [['jab', J8, 44], ['jab', ['jab', 'jab', 'jab', 'jab', 'heavy'], 34], ['grab', ['grab'], 30], ['kick', ['kick', 'kick', 'kick'], 26],
      ['H:heavy', ['H:heavy'], 22], ['f:heavy', ['f:heavy'], 14], ['d:kick', ['d:kick', 'jab', 'jab', 'jab'], 18]] },
};
// 咏春拳的招在「习惯」里归哪一类（拉手是新的一类：看见他老这么干，就知道该出腿、打下段）
Object.assign(OPENER, { wJab: 'jab', wBiu: 'jab', wLowPalm: 'lowJab', wCun: 'heavy', wPai: 'heavy', wGwai: 'heavy', wJum: 'lowJab', wKick: 'kick', wLowKick: 'lowKick' });
const openerOf = (F, name) => F.style === 'wc' && name === 'grab' ? 'trap' : OPENER[name];   // 咏春拳的「拿」是拉手
class Brain {
  constructor(f, level) {
    this.f = f; this.level = level; this.L = LEVELS[level]; this.plans = PLANS[level];
    this.plan = []; this.blockT = 0; this.duckT = 0; this.idleT = 0; this.desire = 120; this.desireT = 0;
    this.lastSeen = -1; this.airPlan = null; this.jumpDir = 0; this.lowBlock = false; this.seq = [];
    this.techFor = -1; this.guardFor = -1; this.holdFor = -1; this.rollPick = null;   // 1.8.0：每次被抓 / 挡住 / 抓住人只掷一次骰子
    this.antiDive = false;                                                             // 1.9.0：等着用拳迎坠山
    this.slipSeq = []; this.slipFor = -1; this.okiFor = -1; this.gwalkT = 0; this.okiSpot = 0;            // 2.0：闪身的双击、压起身、边挡边退
    this.staggerFor = -1;                                                              // 2.0.2：对手挨了回身肘踉跄，只追打一次
    this.smart = !!this.L.smart;
    this.todo = null;              // 算好时机、过几帧再按的那一下（卸力、闪身）：{ at: 第几帧, act, low }
    this.memo = { wake: { stand: 1, to: 1, away: 1 }, open: [{}, {}, {}], after: { hit: 1, hold: 1, slip: 0.5, move: 0.5 },
      // 2.1 跳过来干什么、冲刺完干什么、跑到跟前干什么（起始是「一般人」的样子）
      jump: { air: 1.2, dive: 0.5, empty: 0.5 }, dash: { strike: 1, grab: 0.4, none: 0.5 }, run: { shoulder: 0.8, grab: 0.5, strike: 0.6, stop: 0.6 },
      hz: [0.04, 0.02, 0.01],     // 他在近 / 中 / 远能出手的时候，每帧先出手的概率（慢慢更新）
      ctr: { hand: 0, leg: 0 },   // 2.9 我的手上的招 / 腿（和下段）被咏春拳拍开、拉住、黏住 / 耕开了几次（慢慢淡忘）
      meaty: 0,                   // 2.6 自己起身那几帧挨打（被压起身）的次数（慢慢淡忘）
      rev: 0, esc: 0 };           // 2.10 咏春拳：搭手里翻手被他反拿了几次、连环冲拳刚起手被他按着挡挡住第三拳几次（都慢慢淡忘）
    this.wakeLogged = false; this.openSeen = -1; this.afterWatch = null; this.wasBlocked = false; this.pressTurn = -1; this.punishFor = null;
    // 2.1
    this.aa = null; this.jumpSeen = false;           // 防跳：这一跳想好的接法 { plan, at }；看没看见这一跳
    this.blockedSer = -1; this.blockedLand = false;   // 刚挡住的是对手哪一招（挡完了罚它）
    this.instFor = -1;                                // 极难：这一招掷过「瞬间看穿」的骰子了
    this.guardT = 0;                                  // 近身先举手还剩几帧
    this.rush = null; this.rushArmed = true;          // 冲刺 / 跑过来：想好的接法；这一次想过没有
    this.jw = null; this.dw = -1; this.dwLeft = 0; this.rw = 0;   // 记习惯用：这一跳 / 这次冲刺 / 这段跑后来干了什么
    this.hzSer = -1; this.hzBand = -1; this.guardBand = 9; this.guardNext = 0;     // 近身护手：上一帧在哪一段距离、下一次什么时候再想
    this.upRolled = false; this.upNow = false;        // 极难：这一跳掷过「瞬间看穿」没有、看穿了没有
    this.escBlock = 0;                                // 2.9：被咏春拳刚起手打中了，从那一点空里挡下来以后接着挡几帧
    // 2.10 咏春拳：寸拳还按住重几帧；连环冲拳这一拳想过没有（离拍点差多少、接不接）；搭手里想好的那一套、下一步什么时候按；
    //   被黏住时想好的那一手；挨打时黐手破连按哪个方向；甩手直冲什么时候按；我出的招打的是哪只手脚（被黏住了记下来）
    this.chargeT = 0; this.beatFor = -1; this.beatJit = 0; this.beatGo = true; this.blockAdj = -1;
    this.touchFor = -1; this.tPlan = null; this.tNext = 0; this.tShape = ''; this.tLap = false;
    this.followFor = -1; this.fPlan = null; this.fAt = 0; this.fShape = false;
    this.brkFor = -1; this.brkDir = 0; this.latFor = -1; this.latAt = 0; this.latGo = false; this.lastLimb = null; this.stuckOn = false;
  }
  // 2.9 自己这一派的招式表、打法；按键 → 中立时出的那一招、它的最远射程
  get MV() { return this.f.moves; }
  get K() { return KITS[this.f.style] || KITS.trad; }
  get plans() { return this.K.plans[this.level] || this.K.plans.normal; }
  set plans(v) {}
  mvOf(a) { return this.MV[neutralMove(this.f, a)]; }
  eR(a) { const d = this.mvOf(a); return d ? effRD(d) : 90; }
  // 连招按下去会出哪一招、够多远（传统格斗照旧用 reachOf 那张表；咏春拳按现在这一串算：同一个键在连招里出的招不一样）
  rk(a) {
    if (!this.K.wc) return reachOf(a);
    const f = this.f, chain = f.chainIdle > CHAIN_WIN ? [] : f.chain;
    const nm = !chain.length && W_KEY[a] ? W_KEY[a] : styleOf(f).variant(kindOf(a), chain, false, a.startsWith('d:') ? 'down' : ''), d = nm && this.MV[nm];
    return d && d.reach ? effRD(d) : 0;
  }
  vsRow(a) { return VS[this.K.wc ? W_OPEN[a] : OPEN_OF(a)]; }
  // 按一下（前缀见 kindOf 上面：d 蹲着、f 朝他按着方向、b 背着他、H 按住重蓄劲）
  pressKey(a) {
    const f = this.f, H = f.inp.held, p = prefixOf(a), tw = f.opp.x >= f.x ? 1 : -1;
    if (p) a = a.slice(2);
    if (p === 'd') H.down = true;
    else if (p === 'f' || p === 'b') { if ((p === 'f' ? tw : -tw) > 0) H.right = true; else H.left = true; }
    else if (p === 'H') { H.heavy = true; this.chargeT = WC_CHARGE + 6 - (Math.random() < 0.3 ? (Math.random() * 12 | 0) : 0); }
    f.inp.press(a, f.clock);
  }
  // 2.10 咏春拳的拍手 / 耕手：刚按下挡那几帧（PARRY_WIN）被打到才算 —— 算好时机按下去；按早了、按晚了就只是黐手（黏住进搭手）/ 挡住。
  //   手准不准看难度（读招 read 越高越准；极难「瞬间看穿」的那一下 exact 按到帧）
  patAt(eta, low, exact) {
    const f = this.f, amp = exact ? 0 : 1 + 3 * (1 - this.L.read);
    const pd = Math.max(0, Math.round(eta - 3 + (Math.random() - 0.5) * 2 * amp));
    if (pd > 0) { this.todo = { at: f.clock + pd, act: 'parry', low }; return true; }
    f.noParry = false; this.lowBlock = low; this.blockT = 14; f.inp.held.block = true; f.inp.held.down = low;
    return true;
  }
  // 拉手：伸手扣的那几帧正好落在他那一拳快打出来的时候（他打出来之前就拉住）
  trapAt(eta, exact) {
    const T = this.MV.grab, amp = exact ? 0 : 1 + 3 * (1 - this.L.read);
    const w = Math.round(eta - (T.S + 1) - 1.5 + (Math.random() - 0.5) * 2 * amp);
    if (w >= 1) this.todo = { at: this.f.clock + w, act: 'press', key: 'grab' }; else this.pressKey('grab');
    return true;
  }
  // 标指：指尖插到他胳膊上的那一刻，他那一拳还没打出来（打出来了就是我挨打）
  biuAt(eta, exact) {
    const B = this.MV.wBiu, amp = exact ? 0 : 1 + 2 * (1 - this.L.read);
    const w = Math.round(eta - B.S - 1 + (Math.random() - 0.5) * 2 * amp);
    if (w >= 1) this.todo = { at: this.f.clock + w, act: 'press', key: 'f:jab' }; else this.pressKey('f:jab');
    return true;
  }
  // 黐手：按着挡（黏得住的招打过来就黏住，进搭手）
  stick(low, n) {
    const f = this.f, H = f.inp.held;
    f.noParry = true; this.lowBlock = low; this.blockT = Math.max(8, n); H.block = true; H.down = low;
    return true;
  }
  // 2.10 咏春拳的电脑看见他出招（还没看穿的时候）：手上的招 —— 拍手 / 拉手 / 标指 / 黐手黏住；地上的腿 —— 耕手 / 截腿 / 拳打单脚站着的 / 黐手黏住；
  //   下段 —— 耕手、蹲着黐手；空中的拳脚 —— 拍手（读招的本事 read、拍手的本事 parry 越高越常这么接；没接的交给下面的挡）
  wcReact(s, dist, eta, press) {
    const L = this.L, R = Math.random;
    if (s.kind === 'grab' || s.kind === 'push' || s.dive || s.tier === 'super' || eta < 1) return false;
    if (R() >= Math.min(0.85, L.read * 0.9 + L.parry * 0.6) * wcReadMul(L)) return false;
    const hand = HAND_LIMB.test(s.limb || ''), leg = s.limb === 'ff' || s.limb === 'bf', low = s.height === 'low';
    if (s.air) return !low && (hand || leg) ? this.patAt(eta, false) : false;
    if (hand && !low) {
      const r = R(), T = this.MV.grab, B = this.MV.wBiu;
      if (r < 0.38) return this.patAt(eta, false);
      if (r < 0.56 && eta >= T.S + 2 && dist <= Math.max(T.reach, s.reach) + 4) return this.trapAt(eta);
      if (r < 0.68 && eta >= B.S + 1 && dist <= effRD(B)) return this.biuAt(eta);
      return this.stick(false, s.remain + 6);
    }
    if (leg) {
      const r = R(), LG = this.MV.lowGrab;
      if (r < 0.3) return this.patAt(eta, true);                                                        // 耕手
      if (r < 0.46 && eta >= LG.S + 1 && dist <= s.reach + 6) { press('d:grab'); return true; }         // 截腿截住
      if (!low && r < 0.6 && dist <= this.eR('jab') - 4 && eta >= this.mvOf('jab').S) { press('jab'); return true; }   // 拳打单脚站着的
      return this.stick(low, s.remain + 6);                                                             // 黐手黏住腿
    }
    if (low) return R() < 0.45 ? this.patAt(eta, true) : this.stick(true, s.remain + 6);
    return false;
  }
  // 对面是咏春拳：手上的招会被拍开、拉住、黏住，腿（和下段）会被耕开、截住、黏住的风险 —— 一开始就知道一点，被化开得越多越小心
  handRisk() { return this.f.opp.style === 'wc' ? Math.min(0.85, 0.15 + 0.35 * this.memo.ctr.hand * this.L.habit) : 0; }
  legRisk() { return this.f.opp.style === 'wc' ? Math.min(0.85, 0.15 + 0.35 * this.memo.ctr.leg * this.L.habit) : 0; }
  // 咏春拳的电脑贴身先按着挡（黐手）的机会：他多是打（拳、掌、腿）就多黐；他爱抓、爱打下段就少黐（黐手黏不住擒拿，站着黏不住下段）
  chiChance(dist) {
    const bad = ['grab', 'lowJab', 'sweep', 'lowGrab', 'lowKick'].reduce((a, k) => a + this.habitShare(k, dist), 0);
    return clamp(0.55 - 1.2 * bad * this.L.habit, 0.1, 0.65);
  }

  /* ---------- 2.10 咏春拳：拍子、搭手、黐手破连 ---------- */
  // 连环冲拳按拍子：算出下一拍的拍点（和 wingchun.js 的 wcRhythm 一个算法），在拍点上按（离拍点差多少看 beatSd）。
  // 每一拳想一次接不接（一串很长，每一下接下去的机会高一点）；被挡住了，聪明的停手（挡住了顺就断了）或者收完招拉手扣他
  beatPress(m, dist, press) {
    const f = this.f, L = this.L, R = Math.random;
    if (m.qn) return;                                                   // 下一拳已经排上了
    if (this.beatFor !== m.serial) {
      this.beatFor = m.serial;
      this.beatJit = gauss() * L.beatSd;
      this.beatGo = R() < (W_CHAIN[L.id] || 0.9);
    }
    // 他老在第二拳以后按着挡（头两拳有空）：第二拳打中了，有时候不接第三拳，改拉手扣他（挡着的人抓得住）
    if ((m.ci || 0) === 1 && m.hit && this.escFor2 !== m.serial) {
      this.escFor2 = m.serial;
      if (R() < Math.min(0.6, 0.3 * this.memo.esc * L.habit)) { this.plan = ['grab']; return; }
    }
    if (m.blocked && (m.ci || 0) === 2 && this.escSeen !== m.serial) { this.escSeen = m.serial; this.memo.esc += 1; }
    // 被挡住了：挡住了顺就断了，再打下去他挡着等着截击、推挡 —— 停手（聪明的更常停），或者收完招拉手扣他
    if (m.blocked && this.blockAdj !== m.serial) {
      this.blockAdj = m.serial; const r = R(), stop = AI_TUNE.wcStop[this.smart ? 1 : 0];
      if (r < stop) { this.plan = []; return; }
      if (r < stop + AI_TUNE.wcStopGrab && dist <= this.mvOf('grab').reach + 4) { this.plan = ['grab']; return; }
    }
    if (!this.beatGo) { this.plan = []; return; }
    if (m.t >= wcBeatAt(f, m) - 1 + this.beatJit) press(this.plan.shift());
  }
  // 搭手里手上的反应：feel 帧（再晚一两帧）
  feelDelay() { return this.L.feel + (Math.random() * 3 | 0); }
  // 黏着的时候看他 feel 帧以前的样子（手上的感觉比眼睛快）
  feltOf(o) { const h = o.history; return h.length ? h[Math.max(0, h.length - 1 - this.L.feel)] : null; }
  // 我在搭手（先手）：每一次搭手想一次怎么做 —— 翻几下、翻成什么、最后怎么打；按之前等一下手上的反应（feel）。
  // 翻手那一拍会被会的人反拿，翻得越多越险；咏春拳打咏春拳，他摆的手型克我的手型就别从这个手型打出去（会被化开）
  touchLead(o, press, go) {
    const f = this.f, m = f.move, L = this.L, H = f.inp.held;
    if (this.touchFor !== m.serial) {
      this.touchFor = m.serial; this.tPlan = this.touchPlan(m, o);
      this.tShape = m.shape; this.tLap = m.lap; this.tNext = f.clock + this.feelDelay();
    }
    if (m.rollT > 0 || m.lapT > 0) return;                              // 翻着手 / 正在扣手腕：等翻完
    if (m.shape !== this.tShape || m.lap !== this.tLap) { this.tShape = m.shape; this.tLap = m.lap; this.tNext = f.clock + this.feelDelay(); }
    if (f.clock < this.tNext) return;
    this.tNext = f.clock + 3;                                           // 按了：等它起作用（翻手、换招）再想下一步
    const P = this.tPlan;
    if (m.lap) {                                                        // 扣着手腕：拉打 / 拉手批肘 / 拉手撑脚 / 拉手跪马（都不按 = 蝴蝶掌）
      const k = { da: 'jab', pai: 'heavy', kick: 'kick', drag: 'grab' }[P.lap || (P.lap = this.lapPick(o))];
      if (k) press(k); else this.tNext = f.clock + 99;
      return;
    }
    const s = this.feltOf(o), fs = s && s.tshape;
    if (P.rolls.length) {
      const to = P.rolls.shift(), dc = W_SHAPES.indexOf(to);
      if (to === m.shape || dc < 1) return;
      if (dc === 3) H.down = true; else go(dc === 1 ? 1 : -1);
      return;
    }
    // 打出去之前：他（咏春拳）摆的手型克我现在的手型 —— 换一手（批肘 / 撑脚 / 拉手），不从手型里打
    let end = P.end;
    if (end === 'jab' && fs && m.shape && SHAPE_BEATS[fs] === m.shape) end = Math.random() < 0.5 ? 'lap' : 'kick';
    if (end === 'jab') { press('jab'); this.plan = this.K.after(L); }
    else if (end === 'heavy') press('heavy');
    else if (end === 'kick') press('kick');
    else press('grab');
  }
  touchPlan(m, o) {
    const L = this.L, R = Math.random, P = { rolls: [], end: 'jab', lap: null };
    if (m.lap) return P;
    // 翻几下：懂行的翻得多（每翻一下顺涨一级，打得更疼、更难跑），他会反拿就少翻（传统格斗的人在你翻手那一拍里抽手反抓）
    // 他会反拿就少翻（被反拿过越多越少翻；记得准不准看 habit）
    const grabby = (o.style === 'wc' ? 1 : 0.7) / (1 + 0.8 * this.memo.rev * L.habit);
    const n = weighted([[0, 1.3 - L.touch], [1, (0.4 + L.touch) * grabby], [2, L.touch * 0.8 * grabby], [3, L.touch * 0.35 * grabby]]);
    let cur = m.shape;
    for (let i = 0; i < n; i++) {
      // 第一下翻成克他那只手脚的手型 = 破（顺多涨一级）：懂行的才知道（他打的是前手 → 摊、后手 → 膀、腿和下段 → 伏）
      let to = i === 0 && R() < L.touch + 0.15 ? COUNTER_SHAPE[m.limb] : pick(['tan', 'bong', 'fook'].filter(x => x !== cur));
      if (to === cur) to = pick(['tan', 'bong', 'fook'].filter(x => x !== cur));
      P.rolls.push(to); cur = to;
    }
    // 怎么打：从手型里打出去（接连环冲拳）/ 拉手扣住手腕（接拉打、拉手批肘、拉手跪马……）/ 批肘 / 撑脚
    P.end = weighted([['jab', 3], ['lap', 1 + 2 * L.touch], ['heavy', 0.6], ['kick', 0.6]]);
    return P;
  }
  // 扣住手腕以后打哪一手：拉手跪马（拽倒）多；他背后就是墙，拉手批肘（打倒在墙边）、拉打多；偶尔什么都不按（蝴蝶掌推开）
  lapPick(o) {
    const f = this.f, L = this.L, tw = o.x >= f.x ? 1 : -1, wall = o.x + tw * 110 > WALL_R - 10 || o.x + tw * 110 < WALL_L + 10;
    return weighted([['drag', 2 + 2 * L.touch], ['da', 2], ['pai', 1.4 + (wall ? 1.2 : 0)], ['kick', wall ? 0.6 : 1.2], ['none', 0.3]]);
  }
  // 被黏住（对面在搭手）：甩手（按着挡往后一甩）、在他翻手那一拍里反拿（拿）、咏春拳摆手型化他打出来的那一下；扣着手腕的只能刚扣住时挣
  touchFollow(o, go) {
    const f = this.f, L = this.L, R = Math.random, H = f.inp.held, om = o.move;
    if (o.state !== 'attack' || !om) return;
    if (om.def.tch && om.lap) {
      if (om.lapEsc && this.techFor !== om.serial) { this.techFor = om.serial; if (R() < L.tech) f.inp.press('grab', f.clock); }
      return;
    }
    if (!om.def.tch) return;                                           // 拉打、拉手跪马……打着呢：什么都做不了
    if (this.followFor !== om.serial) {
      this.followFor = om.serial;
      this.fPlan = weighted([['shake', 0.3 + 0.4 * (1 - L.touch)], ['counter', AI_TUNE.ctrW[0] + AI_TUNE.ctrW[1] * L.touch], ['wait', 0.6]]);
      this.fAt = f.clock + WC_TOUCH_GRACE + 1 + this.feelDelay() + (R() * 8 | 0);
      this.fShape = !!styleOf(f).touchShape && R() < L.touch + 0.2;
    }
    const s = this.feltOf(o);
    if (this.fShape && s && s.touch && s.shape) {                      // 咏春拳被黏住：摆一个克他手型的手型（他从那个手型打出来就被化开、先手换给我）
      const dc = W_SHAPES.indexOf(BEATEN_BY[s.shape]);
      if (dc === 3) H.down = true; else if (dc > 0) go(dc === 1 ? 1 : -1);
    }
    if (this.fPlan === 'shake' && f.clock >= this.fAt) { H.down = false; H.left = H.right = false; H.block = true; go(-1); this.fPlan = 'done'; return; }
    if (this.fPlan === 'counter' && s && s.rolling && !om.dead) { f.inp.press('grab', f.clock); this.fPlan = 'done'; }
  }
  // 他甩手了：手上一空就顺着冲进去（甩手直冲，必中）—— 反应过来没有、来不来得及看 feel
  latReact(m, press) {
    const f = this.f, L = this.L;
    if (this.latFor !== m.serial) { this.latFor = m.serial; this.latAt = f.clock + this.feelDelay(); this.latGo = Math.random() < 0.4 + 0.6 * L.touch; }
    if (this.latGo && f.clock >= this.latAt && m.latT > 0) { press('jab'); this.latGo = false; this.plan = this.K.after(L); }
  }
  // 挨打的硬直里：黐手破连（按住挡 + 方向：他前手的招按前、后手的招按后、腿和下段按蹲）—— 他每出一招想一次试不试、按哪个方向。
  // 他打过来那一下太快，反应不过来，只能猜（brkAcc 猜得准不准）；顺到三级的连环冲拳黏不住，不试；按错了那一下挨得更疼
  wcBreak(o, go) {
    const f = this.f, L = this.L, R = Math.random, H = f.inp.held, om = o.move;
    if (f.grabbed || f.stuck || f.airborne || o.state !== 'attack' || !om || om.def.script || om.air) return false;
    if (this.brkFor !== om.serial) {
      this.brkFor = om.serial;
      const d = om.def, lc = d.height === 'low' || d.limb === 'ff' || d.limb === 'bf' ? 3 : d.limb === 'fh' || d.limb === 'fe' ? 1 : 2;
      const fast = d.beat && (o.flow || 0) >= 3;
      this.brkDir = !fast && R() < L.brk * wcReadMul(L) ? (R() < L.brkAcc ? lc : pick([1, 2, 3].filter(x => x !== lc))) : 0;
    }
    if (!this.brkDir) return false;
    H.block = true;
    if (this.brkDir === 3) H.down = true; else go(this.brkDir === 1 ? 1 : -1);
    return true;
  }
  // 闪身：按着挡、朝对手双击（三帧：按 → 松 → 按）。挡住的硬直里也要按完，所以不和 seq 共用（seq 挨打时会清掉）
  slipIn() { this.slipSeq = [1, 0, 1]; }
  dashAway() { this.seq = [{ back: 1 }, {}, { back: 1 }]; }
  dashIn() { this.seq = [{ fwd: 1 }, {}, { fwd: 1 }]; }
  tick(locked) {
    const f = this.f, o = f.opp, L = this.L, H = f.inp.held;
    if (game.freeze > 0 && !locked) return;     // 打中停顿时不动手（以前停顿里每帧都按，按键攒了一堆）
    H.left = H.right = H.up = H.down = H.block = H.heavy = false;
    if (locked || f.state === 'win' || f.state === 'ko') { this.plan = []; this.blockT = 0; this.seq = []; this.todo = null; this.aa = null; this.escBlock = 0; this.chargeT = 0; return; }
    const hist = o.history; if (!hist.length) return;
    const s = hist[Math.max(0, hist.length - 1 - L.react)];
    const dist = Math.abs(o.x - f.x), toward = o.x >= f.x ? 1 : -1;
    const R = Math.random;
    // go(1) 朝对手方向按，go(-1) 背对对手方向按（会转身）
    const go = d => { if (!d) return; if (d * toward > 0) H.right = true; else H.left = true; };
    // 2.1 出招、格挡、站着都不按方向：不按方向时游戏自己让人面朝对手（1.9.0 起），出招也自己朝对手打。
    // 以前出招前先按向对手，刚跑过来松了一下再按 = 双击 = 冲刺（想出托天掌结果冲了出去）；对手从头上跳过时还会跟着跑来跑去
    const press = a => this.pressKey(a);
    const pair = () => { f.inp.press('heavy', f.clock); f.inp.press('kick', f.clock); };
    this.learn(o);                                             // 2.1 所有难度都记习惯（记得准不准看 L.habit）
    // 2.6 起身那几帧（起身硬直，或者这一帧刚从地上起来）掉了血 = 被人压起身打中了
    if (f.hp < this.lastHp && (this.lastSt === 'rise' || (this.lastSt === 'down' && this.lastPh === 'getup'))) this.memo.meaty++;
    // 又被打倒了（上一次看还在起身、站起来，这一次又躺下了 —— 起身那一下挨打，两次看之间就倒了，一直是「倒地」）：滚不滚重新掷
    this.newDown = f.state === 'down' && (this.lastSt !== 'down' || (this.lastPh === 'getup' && f.downPhase !== 'getup'));
    this.lastHp = f.hp; this.lastSt = f.state; this.lastPh = f.downPhase;
    // 2.1 极难：起跳也可能被它 1 帧看穿（每一跳掷一次骰子）—— 看穿了就按他现在的样子想接法，也不会往跳起来的人身上出地上的招
    const upNow = o.state === 'jumpsquat' || o.airborne;
    if (!upNow) { this.upRolled = false; this.upNow = false; }
    else if (!this.upRolled) { this.upRolled = true; this.upNow = !!L.inst && R() < Math.min(0.95, L.inst + 0.2); }
    const sj = this.upNow ? hist[hist.length - 1] : s, lagJ = this.upNow ? 0 : L.react;
    this.watchJump(sj, dist);

    // 闪身双击（按着挡）：挨打、倒地就作废
    if (this.slipSeq.length) {
      if (f.state === 'hit' || f.state === 'down' || f.state === 'rise') this.slipSeq = [];
      else { H.block = true; if (this.slipSeq.shift()) go(1); return; }
    }
    // 多帧操作（闪步双击、跑动）；被打断就作废
    if (f.state === 'hit' || f.state === 'down' || f.state === 'blockstun' || f.state === 'rise') this.seq = [];
    // 2.6 挨上了 / 被打倒了：刚才想好的「挡几帧、蹲几帧」作废（以前一直留着，起身以后接着按刚才那个高度挡，又挨一下扫堂腿）
    if (f.state === 'hit' || f.state === 'down') { this.blockT = 0; this.duckT = 0; }
    if (this.seq.length) {
      const st = this.seq.shift();
      if (st.back) go(-1); if (st.fwd) go(1);
      if (st.press) f.inp.press(st.press, f.clock);
      return;
    }
    // 2.10 被黏住（对面在搭手）：甩手、反拿、咏春拳摆手型；扣着手腕的刚扣住时挣
    if (f.state === 'hit' && f.stuck) { this.touchFollow(o, go); return; }
    // 被擒住：挣脱（每次被抓掷一次骰子）
    if (f.state === 'hit' && f.grabbed) {
      if (o.move && o.move.name === 'hold' && this.techFor !== o.move.serial) { this.techFor = o.move.serial; if (R() < L.tech) f.inp.press('grab', f.clock); }
      return;
    }
    // 倒地：起身时滚开（往墙的反方向）；起身硬直里什么也做不了
    if (f.state === 'down') {
      this.aa = null;
      // 2.6 起身老被人卡着时机打（压起身）：记下来，越挨越爱滚，而且往远处滚（往他那边滚正好滚到他脚底下）；记得准不准看 L.habit
      if (this.rollPick === null || this.newDown) {
        const mt = this.memo.meaty, pr = Math.min(0.92, L.roll + 0.32 * mt * (L.habit || 0.5));
        this.rollPick = R() < pr ? (mt > 0.5 || R() < 0.5 ? -1 : 1) : 0;     // -1 往远处滚、1 往他那边滚
        this.memo.meaty *= 0.9;
      }
      if (this.rollPick) { let d = this.rollPick * toward; if (f.x + d * f.rollLen(d) < WALL_L + 20 || f.x + d * f.rollLen(d) > WALL_R - 20) d = -d; if (d > 0) H.right = true; else H.left = true; }
      return;
    }
    this.rollPick = null;
    if (f.state === 'rise') return;
    // 算好时机的那一下（卸力要卡在打到前几帧按下去；闪身要卡在他出手前钻）。挨打了、自己在出招就作废
    if (this.todo) {
      if (f.state === 'hit' || f.state === 'attack' || f.airborne) this.todo = null;
      else if (f.clock >= this.todo.at) {
        const t = this.todo; this.todo = null;
        if (t.act === 'slip') { this.slipIn(); H.block = true; return; }
        if (t.act === 'parry') { f.noParry = false; this.lowBlock = t.low; this.blockT = 14; H.block = true; H.down = t.low; return; }
        if (t.act === 'press') { press(t.key); return; }
      } else {
        if (this.todo.act === 'slip') H.block = true;             // 等着闪：先按着挡
        return;                                                    // 等着卸力：先别按挡（要刚按下去那几帧才卸得掉）
      }
    }
    // 挨打 / 格挡硬直：爆气挣脱、推挡；1.8.0：蹲挡住扫堂腿踩腿、挡住后截击
    if (f.state === 'hit' || f.state === 'blockstun') {
      this.guardT = 0;
      if (f.state === 'hit' && f.qi >= QI_BURST && !f.grabbed && f.comboTaken >= 2 && R() < L.burst * 0.08) { pair(); return; }   // 2.1 爆气只在挨打时能用
      // 2.10 咏春拳挨打：黐手破连（按住挡 + 方向，把他下一下黏住、进搭手）
      if (f.state === 'hit' && this.K.wc && this.wcBreak(o, go)) return;
      // 被咏春拳刚起手的两三下打中（还没顺）：第 2、3 下比拍子短一点 —— 一直按着挡，从那一点空里挡下来（每一下掷一次骰子）
      if (f.state === 'hit' && !f.grabbed && o.style === 'wc' && o.state === 'attack' && o.move && o.move.def.beat && (o.flow || 0) < FLOW_COUNTER) {
        if (this.escFor !== o.move.serial) { this.escFor = o.move.serial; this.escRoll = R() < Math.min(0.85, L.block * AI_TUNE.escK + AI_TUNE.escB); }
        if (this.escRoll) { f.noParry = true; this.lowBlock = false; this.escBlock = 10; H.block = true; }
      }
      if (f.state === 'blockstun') {
        const om = o.move;
        if (om && !om.def.script) { this.blockedSer = om.serial; this.blockedLand = !!om.air; }   // 2.1 记下挡住的是哪一招：挡完了罚它
        if (om && this.guardFor !== om.serial) {
          this.guardFor = om.serial;
          if (f.stompReady() && R() < L.stomp) { H.down = true; f.inp.press('kick', f.clock); H.block = true; return; }
          // 挡住后截击（传统格斗；咏春拳没有这一下）
          if (!this.K.wc && f.qi >= GC_COST && R() < L.gc) { f.inp.press('heavy', f.clock); return; }
        }
        if (dist < 110 && R() < L.push * 0.1) f.inp.press('jab', f.clock);
        // 2.1 挡着的时候他接了下一招（连招里的劈山掌是上段、扫堂腿是下段）：看见了就换着挡（看得对不对看 lowRead）
        if (s.atk && s.serial !== this.hiloFor && s.height) {
          this.hiloFor = s.serial;
          if (s.height === 'high' && this.lowBlock && R() < L.lowRead) this.lowBlock = false;
          else if (s.height === 'low' && !this.lowBlock && R() < L.lowRead) this.lowBlock = true;
        }
        H.block = true; H.down = this.lowBlock;
      }
      return;
    }
    // 刚从咏春拳的连环冲拳里逃出来：接着按着挡
    if (this.escBlock > 0 && (f.actionable() || f.state === 'block')) { this.escBlock--; f.noParry = true; H.block = true; H.down = this.lowBlock; return; }
    if (f.state === 'attack') {
      const m = f.move, d = m.def;
      if (m.blocked) this.wasBlocked = true;
      // 2.10 咏春拳：我在搭手（先手）、他甩手了（甩手直冲）、扣着手腕打（等打完）、乱手 / 脱手（等收完）、寸拳按住蓄劲
      if (d.tch) { this.touchLead(o, press, go); return; }
      if (m.name === 'tLat') { this.latReact(m, press); return; }
      if (d.lap || m.name === 'tMess' || m.name === 'tSep') return;
      if (d.charge && this.chargeT > 0) { this.chargeT--; H.heavy = true; }
      // 擒住了：挑一种后续（背靠墙多用过肩摔把人换到墙边）
      if (m.name === 'hold' && m.holdKind === 'grab' && !m.pick && this.holdFor !== m.serial) {
        this.holdFor = m.serial;
        const cornered = f.x - toward * 120 < WALL_L || f.x - toward * 120 > WALL_R;
        const k = weighted(cornered ? [['heavy', 6], ['jab', 2], ['kick', 1]] : [['jab', 3], ['kick', 3], ['heavy', 3], ['none', 1]]);
        if (k !== 'none') f.inp.press(k, f.clock);
        return;
      }
      if (!this.plan.length) return;
      // 咏春拳的连环冲拳：按拍子接（拳在连环拳里随时按得下去，按不准就是抢拍、过拍）
      if (this.K.wc && d.beat && kindOf(this.plan[0]) === 'jab') { this.beatPress(m, dist, press); return; }
      if (f.canCancel(kindOf(this.plan[0]))) {
        // 咏春拳一串很长，每一下接下去的机会高一点
        if (R() < (this.K.wc ? 1 - (1 - L.combo) * (L.combo < 0.8 ? 0.15 : 0.3) : L.combo)) press(this.plan.shift()); else this.plan = [];
      }
      return;
    }
    if (this.wasBlocked) { this.wasBlocked = false; this.pressTurn = f.clock; }   // 我的招被挡住、收完了：轮到「挡完以后」那一手
    // 卸力成功：趁对方失衡反打，或者借力摔
    if (f.state === 'parry') {
      if (!this.K.wc && dist <= 110 && R() < 0.3) { f.inp.press('grab', f.clock); return; }
      this.plan = this.K.parry(dist);                       // 咏春拳：拍开、耕开以后一整套（顺），或者拉手扣住手腕进搭手
      press(this.plan.shift()); return;
    }
    if (f.state === 'air' || f.state === 'jumpsquat') {
      go(this.jumpDir);
      if (this.airPlan && f.state === 'air' && !f.airUsed) {
        // 1.9.0：对手蹲着 / 蹲挡 / 在出托天掌 → 改用坠山（专破蹲着的）；对手站着 → 别用坠山（怕站着的拳），换飞踢
        if (this.airPlan === 'd:kick' && !s.low && !s.lowBlock && s.tier !== 'aa' && R() < 0.5) this.airPlan = 'kick';
        else if (this.airPlan !== 'd:kick' && (s.low || s.lowBlock || s.tier === 'aa') && R() < L.read) this.airPlan = 'd:kick';
        // 坠山先腾一下再斜着往前下踩、会往前冲 70 左右：离对手 50~150 就放；其他空中招到射程里、过了最高点就出
        const ok = this.airPlan === 'd:kick' ? dist >= 50 && dist <= 150 && f.vz < 6 : dist <= this.MV[AIR_OF[this.airPlan]].reach + 8 && f.vz < 4;
        if (ok) { press(this.airPlan); this.airPlan = null; }
      }
      return;
    }
    if (f.state === 'land') return;
    // 1.9.0 对付坠山：看见对手出坠山，站着等它踩下来，进了拳的射程就出短拳迎上去（倒栽葱）。
    // 2.0.2：等的时候站着不动（以前一直按着朝他的方向，等于在他脚底下跑来跑去、跟着转身）—— 朝向交给自动面向对手
    // 2.1：按拳的前摇往前推它在哪（以前等它进了射程才按，常常晚一两帧被踩）；刚出完别的招、这一拳会变成连招里的招（落步冲拳……），按那一招算
    if (this.antiDive && f.actionable()) {
      const om = o.move;
      if (!(o.state === 'attack' && om && om.def.dive && !om.hit && !om.blocked)) this.antiDive = false;
      else {
        if (this.diveHit(o, om)) { this.antiDive = false; press('jab'); }
        // 斜着从远处踩过来的（够不着它的时候它就已经踩到了）：拳迎不上，改站着挡
        else if (om.t > om.S && o.alt < 104) { this.antiDive = false; f.noParry = true; this.lowBlock = false; this.blockT = 24; H.block = true; }
        return;
      }
    }
    // 2.1 挡住以后罚：我刚挡住他一下、我能动了、他还在收招（或者空中招被挡、在落地硬直里）→ 挑够得着、来得及、最疼的一套
    if (this.blockedSer >= 0 && f.actionable()) {
      const ser = this.blockedSer; this.blockedSer = -1;
      const om = o.move;
      const left = o.state === 'attack' && om && om.serial === ser ? om.S + om.def.A + om.def.R + (om.pen || 0) - om.t : o.state === 'land' ? o.landT - o.t : 0;
      if (left > this.mvOf('jab').S + 1 && R() < L.punishBlock) {
        const r = this.bestPunish(dist, left - 1);
        if (r) { this.blockT = 0; this.aa = null; this.plan = r.slice(); press(this.plan.shift()); return; }
      }
    }
    // 2.1 极难：这一招有没有被它「瞬间看穿」（每一招只掷一次骰子）—— 看穿了，1 帧就按最赚的破法
    if (L.inst && o.state === 'attack' && o.move && !o.move.def.script && o.move.serial !== this.instFor && f.actionable()) {
      this.instFor = o.move.serial;
      if (o.facingTo(f) && R() < this.instChance(o.move, dist) && this.instCounter(o, dist, press)) { this.lastSeen = o.move.serial; return; }
    }
    // 极难：冲刺也一样 —— 看穿了就按他冲完爱干什么接（挡 / 蹲 / 等他冲完出拳）
    if (L.inst && o.move && o.move.name === 'dash' && o.move.serial !== this.instFor && f.actionable()) {
      this.instFor = o.move.serial;
      if (o.facing === (f.x >= o.x ? 1 : -1) && dist <= 300 && R() < this.instChance(o.move, dist)) {
        const D = this.memo.dash, top = D.grab > D.strike && D.grab > D.none ? 'duck' : D.none > D.strike ? 'jab' : 'block';
        this.rushArmed = false; this.rush = { kind: 'dash', t: 0, plan: top, now: true };
      }
    }
    // 2.1 防跳：看见他起跳时想好的接法，到时候照着做
    if (this.aa && this.airDefense(sj, dist, press, go, lagJ)) return;
    // 格挡中：不按方向（按着挡会转身面朝对手；2.0 起按着方向是边挡边走）。偶尔边挡边往后退（离墙远的时候）
    if (this.blockT > 0 && (f.actionable() || f.state === 'blockstun')) {
      this.blockT--; H.block = true; H.down = this.lowBlock;
      if (this.gwalkT > 0 && !this.lowBlock && f.state === 'block') { this.gwalkT--; const bx = f.x - toward * 60; if (bx > WALL_L + 20 && bx < WALL_R - 20) go(-1); }
      return;
    }
    if (!f.actionable()) return;
    this.jumpDir = 0;
    if (this.duckT > 0) { this.duckT--; H.down = true; return; }

    // 2.0 压起身：对手倒地 → 走到他跟前；他起身时算好时机出快招（短拳 / 擒拿），正好打在起身硬直里，接连招。
    // 他滚不滚、往哪滚，要反应 L.react 帧才看得清（s 是 L.react 帧以前的他）：没看清之前按他躺的地方算，看清了再追。
    // 每次倒地掷一次骰子，不压的话照旧。聪明的（难、极难）：看清他往远处滚了就冲刺追（走过去来不及）
    if (o.state === 'down' || o.state === 'rise') {
      if (this.okiRoll == null) this.okiRoll = R() < L.oki;
      if (o.state === 'down' && o.downPhase !== 'getup') this.okiSpot = o.x;
      if (this.okiRoll) {
        const seen = !!s.roll || !s.down;                                     // 看见他在滚 / 已经看见他站起来
        const land = !seen ? this.okiSpot : o.downPhase === 'getup' && o.rollDir ? o.x + o.rollDir * o.rollLen(o.rollDir) * (1 - o.t / GETUP) : o.x;
        const J = this.mvOf('jab'), gap = Math.abs(land - f.x), tw = land >= f.x ? 1 : -1, S = J.S;
        const left = o.state === 'rise' ? 0 : o.downPhase === 'getup' ? GETUP - o.t : 99;
        if (gap <= J.reach - 4 && left <= S + 1 && (o.state !== 'rise' || o.t + S + 1 < (o.riseT || RISE))) {
          this.okiRoll = false;
          this.plan = R() < 0.25 && gap <= this.mvOf('grab').reach - 6 ? ['grab'] : this.K.oki(this.smart);
          if (tw > 0) H.right = true; else H.left = true;
          const a = this.plan.shift(); if (a.startsWith('d:')) { H.down = true; } f.inp.press(kindOf(a), f.clock);
          return;
        }
        if (o.state === 'rise') this.okiRoll = false;                         // 来不及了：算了
        else if (gap > 74) {
          if (this.smart && seen && gap > 110) { this.seq = tw * toward > 0 ? [{ fwd: 1 }, {}, { fwd: 1 }] : [{ back: 1 }, {}, { back: 1 }]; return; }
          if (tw > 0) H.right = true; else H.left = true; return;
        }
        else return;                                                          // 站在跟前等他起来
      }
    } else this.okiRoll = null;
    // 2.0.2 对手挨了回身肘、背对着踉跄：接着打（够得着就打一套）
    if (s.stagger && this.staggerFor !== o.serial && dist <= 140 && R() < L.punish) {
      this.staggerFor = o.serial;
      this.plan = this.K.stagger(dist);
      press(this.plan.shift()); return;
    }
    // 2.0 看见对手在闪身（钻过来）：出短拳 / 腿截他（2.0.2 起他只躲得过重拳）
    if (s.slip && dist <= 130 && R() < L.catchSlip * 0.4) { press(dist <= 96 ? 'jab' : 'kick'); return; }

    const oppFacesMe = s.facing === -toward, oppUp = sj.air || sj.squat;   // 2.1 他在跳（看见的）：地上的招打不着他，别往上送
    // 2.1 他朝我走过来有多快（看见的）：走过来的人几帧就进了短拳的射程，这时候起腿、扫堂腿（前摇长）会被拳打失衡
    const prev = hist[Math.max(0, hist.length - 3 - L.react)], appr = s.down || s.air ? 0 : (s.x - prev.x) * -toward / 2;
    this.appr = appr;
    // 连招没打中：短时间内继续按完（他跳起来了就算了）
    if (this.plan.length) {
      if (!oppUp && f.chainIdle < 6 && dist <= this.rk(this.plan[0])) { press(this.plan.shift()); return; }
      if (f.chainIdle >= 6 || oppUp) this.plan = [];
    }
    // 看到对手出招（只管朝着我来的）。2.1：空中招朝我飞过来，按他飞过来的速度多算一截（以前离得稍远就当没看见，等看见已经挨上了）
    const reachIn = s.name === 'dive' ? 230 : s.reach + 26 + (s.air ? Math.abs(s.vx) * (L.react + 4) : 0);
    if (s.atk && s.serial !== this.lastSeen && dist <= reachIn && oppFacesMe) {
      this.lastSeen = s.serial;
      const eta = s.sLeft - L.react;          // 大约还有几帧打到
      // 难 / 极难：看穿了就挑最赚的破法（没看穿就往下走普通的反应）
      if (this.smart && R() < this.seeChance(s, dist) && this.hellCounter(s, dist, eta, press)) return;
      // 接腿：擒拿要在他的腿踢到之前就伸出手（2.1 实测：腿踢出手前至少还有擒拿前摇那么多帧才接得住；以前晚 5 帧也去接，常常接空、挨踢）
      // （eta 是按看见的那一帧算的，比真的多 1 帧：实测腿踢还剩擒拿前摇 +1 帧以上才接得住）
      // 咏春拳的拉手接不住腿：蹲下截腿截住（地上的腿都截得住，他失衡）
      const CK = this.K.catchKey, CD = this.mvOf(CK);
      const canCatch = s.kind === 'kick' && (this.K.wc ? !s.air : s.height !== 'low') && s.name !== 'dive' && eta >= CD.S + 1 && dist <= s.reach + 6;
      if (canCatch && R() < L.catch) { press(CK); return; }
      // 看到扫堂腿（咏春拳的截脚也是）：抄腿接住它
      if ((s.name === 'sweep' || s.name === 'wLowKick') && eta >= this.mvOf('d:grab').S + 1 && dist <= s.reach + 6 && R() < L.scoop) { press('d:grab'); return; }
      // 坠山：别蹲、别出托天掌（正中它下怀）—— 站着等它下来用拳迎，或者站挡
      if (s.name === 'dive') {
        this.aa = null;
        if (R() < L.aa) { this.antiDive = true; return; }
        f.noParry = true; this.lowBlock = false; this.blockT = Math.max(10, s.remain + 10); H.block = true; return;
      }
      // 飞踢：蹲下躲；或者地上出腿迎上去，把它顶得翻滚回去
      if (s.name === 'airKick' && dist >= 110 && R() < L.aa * 0.35) { press('kick'); return; }
      if (s.name === 'airKick' && R() < L.duck) { this.duckT = Math.max(12, s.remain + 8); H.down = true; return; }
      if (!this.K.wc && s.tier === 'air' && eta >= this.MV.palm.S - 6 && dist <= 130 && R() < L.aa) { press('d:heavy'); return; }
      // 2.0.2 重拳：闪身钻过去（躲过了自动回身肘）
      if (slipable(o.moves[s.name]) && eta >= 1 && eta <= 7 && R() < L.slip) { this.slipIn(); H.block = true; return; }
      // 2.10 咏春拳：拍手、耕手、拉手、标指、黐手接（读招的那一下）
      if (this.K.wc && this.wcReact(s, dist, eta, press)) return;
      // 读招：出克制它主系的那一系。来得及才出（实测：重拳霸体吃拳要还剩 2 帧、腿化解重拳要还剩 8 帧、拳打出腿要还剩 3 帧），来不及白挨
      if (!this.K.wc && eta >= 2 && R() < L.read) {
        const ans = s.tier === 'light' ? (s.pierce || R() < this.handRisk() ? null : 'heavy') : s.tier === 'heavy' ? (eta >= 8 && R() >= this.legRisk() ? 'kick' : null) : s.tier === 'kick' && dist <= 96 && eta >= 3 ? 'jab' : null;
        if (ans && dist <= reachOf(ans) + 10) { press(ans); return; }
      }
      // 2.1 空中招：要站着挡（都是上段）—— 以前按「高低判断」一半时间蹲着挡；你在这个距离老出这一招，它挡得更多
      const hb = this.habitShare(openerOf(o, s.name), dist) * L.habit * 0.5;
      if (s.kind !== 'grab' && s.kind !== 'push' && R() < Math.min(0.98, (s.air ? Math.max(L.block, L.airBlock * 0.9) : L.block) + hb) * (this.K.wc && !s.air ? wcGuardMul(L) : 1)) {
        const tryParry = eta >= 0 && eta <= PARRY_WIN - 2 && R() < L.parry;
        f.noParry = !tryParry;
        this.lowBlock = s.air ? R() > L.airBlock : s.height === 'low' ? R() < L.lowRead : s.height === 'high' ? R() > L.lowRead : R() < 0.3;
        this.blockT = Math.max(8, s.remain + 6); H.block = true; H.down = this.lowBlock;
        if (!s.air && R() < L.gwalk * 0.3) this.gwalkT = 10 + (R() * 16 | 0);
        return;
      }
      if (s.kind === 'grab' && R() < L.block * 0.6) { if (R() < L.step) this.dashAway(); return; }
    }
    // 2.1 看见他冲刺 / 跑过来：按他冲完、跑到跟前爱干什么，先挡 / 蹲 / 腿迎 / 等他冲完打他收招
    if (this.watchRush(s, dist, toward, oppFacesMe, press, oppUp)) return;
    // 难 / 极难：主动 —— 罚打空的招、落地硬直，按对手挡完以后的习惯出手，对着挡的人上下段擒拿换着来
    if (this.smart && this.hellOffense(s, dist, press)) return;
    // 2.1 记习惯（所有难度）：他在这个距离老出同一招，提前防 / 提前出克它的招
    if (this.habitGuard(s, dist, press)) return;
    // 对手背对我：趁机打背后
    // （他是跑开了才背对我的话，够不着就别打：打空了白给）
    if (!s.down && !s.atk && !oppUp && !oppFacesMe && dist <= 110 && R() < L.aggr * 0.2) {
      const p = this.pickPlan(dist), d0 = this.mvOf(p[0]);
      if (d0 && dist + Math.max(0, -appr) * (d0.S + 1) <= effRD(d0) - 6) { this.plan = p; press(this.plan.shift()); return; }
    }
    // 惩罚空招（空中招打空了、人还在天上：等他落地，见上面的落地硬直）
    if (s.phase === 'r' && !s.confirmed && !s.air && dist <= 110 && R() < L.punish * 0.3) {
      this.plan = this.K.wc ? (dist <= 86 ? Jn(5) : ['kick', 'jab', 'jab', 'jab']) : dist <= 90 ? ['jab', 'heavy'] : ['heavy'];
      press(this.plan.shift()); return;
    }
    // 气满：对手收招或硬直时放泼墨
    if (f.qi >= QI_MAX && dist <= (this.K.wc ? 102 : 130) && !s.down && !s.air && (s.phase === 'r' || s.stun) && R() < L.sup * 0.25) { pair(); return; }
    // 对手龟缩：站挡就擒拿或下段，蹲挡就抄腿或打上段（跳）
    if (s.blocking && !s.lowBlock && dist <= 84 && R() < L.grabBlock * (this.K.wc || o.style === 'wc' ? AI_TUNE.wcGrabBlk : 0.12)) { press('grab'); return; }   // 咏春拳拉手扣住挡着的人（进搭手）；打咏春拳的人抓黐手
    if (s.blocking && s.lowBlock && dist <= 88 && R() < L.grabBlock * 0.1) { press('d:grab'); return; }
    if (s.blocking && !s.lowBlock && dist <= 120 && R() < L.low * (this.K.wc ? AI_TUNE.wcLow : 0.05)) { press(dist <= 88 ? 'd:jab' : 'd:kick'); return; }
    // 被贴身压着：闪步拉开，或者偶尔闪到对手身后
    if (dist < 86 && s.atk && R() < L.step * 0.05) { if (R() < 0.3) this.dashIn(); else this.dashAway(); return; }
    // 2.1 近身先护着：贴得近、他能出手的时候，时不时先举手（短拳 5 帧，谁都看不清，只能预判；他老用短拳就护得更多）
    if (this.guardT > 0) {
      this.guardT--; f.noParry = !this.guardParry; H.block = true; H.down = this.lowBlock;
      if (this.K.wc && this.chiFwd && !this.lowBlock && dist > 74) go(1);     // 咏春拳黐着手往前挪（黐手走得慢）
      return;
    }
    // 一走进他常出手的距离就想一次（之后每 10 帧左右再想一次）：他在这个距离越爱先出手（hz），越常先护着；
    // 护上还是护下看他在这儿爱出什么（下盘拳、扫堂腿多就蹲着挡；爱擒拿就蹲着 —— 站着的擒拿抓不到蹲着的）
    const gb = bandOf(dist);
    if (!s.down && !s.atk && !s.stun && !oppUp && gb <= 1 && (gb < this.guardBand || f.clock >= this.guardNext)) {
      this.guardNext = f.clock + 8 + (R() * 6 | 0);
      const hz = this.memo.hz[gb], pAtk = 1 - Math.pow(1 - hz, 10), habitK = 0.35 + 0.65 * L.habit;
      if (R() < Math.min(0.9, L.guard * 1.5 * pAtk * habitK * (gb ? 0.6 : 1)) * (this.K.wc ? wcGuardMul(L) : 1)) {
        // 蹲着挡：中段、下段都挡得住，站着的擒拿也抓不到 —— 只怕抄腿和上段（劈山掌、空中招）。懂行的（lowRead 高）多蹲着挡，他爱抄腿就站着
        const hi = this.habitShare('lowGrab', dist) * 1.6 + this.habitShare('air', dist) * 0.6;
        this.lowBlock = R() < clamp(0.25 + 0.55 * L.lowRead - hi * L.habit, 0.08, 0.92);
        // 2.10 咏春拳：贴身先按着挡（黐手：打过来的拳脚黏住、进搭手），偶尔黐着往前挪 —— 他爱抓、爱打下段就少黐
        if (this.K.wc && gb === 0 && R() < this.chiChance(dist)) {
          this.guardParry = false; this.lowBlock = R() < 0.25 * L.lowRead; this.guardT = 14 + (R() * 20 | 0); this.chiFwd = R() < 0.35;
          f.noParry = true; H.block = true; H.down = this.lowBlock; this.guardBand = gb; return;
        }
        this.guardParry = R() < L.parry; this.guardT = 10 + (R() * 10 | 0); f.noParry = !this.guardParry; H.block = true; H.down = this.lowBlock;
        this.guardBand = gb; return;
      }
    }
    this.guardBand = gb;
    if (!s.down && !s.atk && dist <= 100 && R() < L.block * 0.012) { f.noParry = true; this.blockT = 14 + (R() * 14 | 0); this.lowBlock = R() < 0.4; if (!this.lowBlock && R() < L.gwalk) this.gwalkT = this.blockT; H.block = true; H.down = this.lowBlock; return; }
    // 2.1 他在跳（没想好接法的时候）：别往他底下走、别出地上的招；离得近、他往下落了就看反应站着挡
    if (oppUp && !s.down) {
      if (sj.air && dist <= 170 && sj.vz < 2 && R() < L.airBlock * 0.08) { f.noParry = true; this.lowBlock = false; this.blockT = 12; H.block = true; return; }
      return;                                                  // 站着别动（不按方向就会自己转向他）
    }
    if (!s.down) {
      if (dist > 130 && dist < 280 && appr > -1 && R() < L.jump * 0.01) {      // 跑几步再跳（带惯性飞过去）
        this.seq = []; const run = 3 + (R() * 6 | 0);
        for (let i = 0; i < run; i++) this.seq.push({ fwd: 1 });
        this.seq.push({ fwd: 1, press: 'up' });
        this.jumpDir = 1; this.airPlan = pick(['kick', 'kick', 'heavy', 'jab', 'd:kick']); return;
      }
      if (dist > 140 && dist < 230 && appr > -1 && R() < L.aggr * 0.004) {   // 冲刺进去，冲刺途中出招（冲势）
        this.seq = [{ fwd: 1 }, {}, { fwd: 1 }, {}, {}, {}, {}, { fwd: 1, press: pick(this.K.dashIn) }]; return;
      }
      if (this.K.runHeavy && dist > 150 && dist < 240 && appr > -1 && R() < L.aggr * 0.006) {   // 跑起来沉肩靠
        this.seq = []; for (let i = 0; i < 10; i++) this.seq.push({ fwd: 1 });
        this.seq.push({ fwd: 1, press: 'heavy' }); return;
      }
      // 中距离点一腿（他正走过来就别点了：腿还没出去他就进了拳的射程）；聪明的：他走进来正好进短拳射程的那一下出拳迎他
      // 咏春拳的腿短：近一点才点（正撑脚够 100 多一点）
      const kr = this.K.wc ? [88, 108, 100] : [98, 134, 118], J = this.mvOf('jab');
      const legOK = 1 / (1 + 0.6 * this.memo.ctr.leg * L.habit);                      // 2.9 腿老被耕开就少点
      if (dist > kr[0] && dist <= kr[1] && appr < 1 && appr > -1.5 && R() < L.aggr * 0.045 * legOK) { press(dist <= kr[2] && R() < L.low ? 'd:kick' : 'kick'); return; }
      if (this.smart && appr > 1.5 && !s.run && dist > J.reach - 4 && dist <= J.reach + appr * (J.S + 1) && R() < L.read * 0.25) { this.plan = this.K.wc ? Jn(5) : ['jab', 'heavy']; press('jab'); this.plan.shift(); return; }
      if (dist <= (this.K.wc ? 88 : 92) && R() < L.aggr * 0.09) { this.plan = this.pickPlan(dist); press(this.plan.shift()); return; }
      if (dist <= 82 && R() < 0.008 * L.aggr) { press('grab'); return; }
    }
    if (--this.desireT <= 0) {
      this.desireT = 25 + (R() * 45 | 0);
      // 难 / 极难：贴身，或者站在他腿够不太着的地方等他出腿；咏春拳手短腿短：站得更近
      this.desire = s.down ? 150 : pick(this.K.wc ? (this.smart ? [78, 84, 92, 130] : [78, 84, 96, 112, 140, 170]) : this.smart ? [86, 92, 138, 146] : [84, 88, 110, 124, 150, 180]);
      this.idleT = R() < L.idle ? 8 + (R() * 20 | 0) : 0;
    }
    if (this.idleT > 0) { this.idleT--; return; }
    const behind = f.x - toward * 90;
    const nearWall = behind < WALL_L + 10 || behind > WALL_R - 10;
    // 没有后退：太近了就闪步拉开（不转身背对对手），太远就跑过去
    if (dist > this.desire + 6) go(1);
    else if (dist < this.desire - 40 && !nearWall && R() < L.step * 0.01) this.dashAway();
  }

  /* ---------- 2.1 防跳 ---------- */
  // 看见对手离地（s 是 react 帧以前的他：起跳也要反应）：这一跳想好怎么接（每一跳只想一次）。
  // 跳过来的人能出：空中招（托天掌克它）、坠山（踩断托天掌，怕站着的拳）、什么都不出落地再抓 / 打下段（挡着的人怕这个）——
  // 接法：托天掌 / 站着挡 / 站着等（坠山下来拳迎，空招看反应挡）/ 往后撤（让他打空、落地硬直里罚）。按他跳过来爱干什么配比例
  watchJump(s, dist) {
    const up = s.air || s.squat;
    if (!up) { this.jumpSeen = false; this.aa = null; return; }
    if (this.jumpSeen || !s.air) return;                             // 起跳下蹲那两三帧还看不出往哪跳：等他离地
    this.jumpSeen = true;
    const f = this.f, L = this.L, R = Math.random;
    if (s.atk && s.dive) return;                                     // 已经在出坠山：交给下面看见招的那一段
    // 这一跳是不是朝我来的：按他现在的横速，落地时离我多远
    const tAir = Math.max(2, (s.vz + Math.sqrt(Math.max(0, s.vz * s.vz + 2 * GRAV * s.alt))) / GRAV);
    const landX = s.x + s.vx * tAir, dLand = Math.abs(landX - f.x);
    if (dist > 340 || (dLand > 190 && dist > 170)) return;
    const J = this.memo.jump, tot = J.air + J.dive + J.empty, pA = J.air / tot, pD = J.dive / tot, pE = J.empty / tot;
    const pa = Math.min(0.98, L.aaPlan + (Math.max(pA, pD) - 0.4) * L.habit * 0.4);
    if (R() >= pa) return;                                           // 这一跳没反应过来（照普通的来）
    const wall = f.x - (s.x >= f.x ? 1 : -1) * 110, cornered = wall < WALL_L + 20 || wall > WALL_R - 20;
    const hb = L.habit;                                              // 记得越准，越照他的习惯接
    // 咏春拳没有托天掌：拍手拍开他空中的拳脚（算着他落下来、进了射程的那几帧刚按下挡）
    const plan = weighted([[this.K.wc ? 'pat' : 'palm', L.aa * (0.5 + 1.6 * pA * hb)], ['block', 0.7 + 0.5 * pA * (1 - hb)], ['wait', 0.35 + 1.8 * (pD + pE * 0.6) * hb],
      ['back', cornered ? 0 : L.step * 0.6]]);
    // 托天掌的时机：反应慢的按得早一点 / 晚一点（随机偏几帧）
    this.aa = { plan, jitter: Math.round((R() - 0.5) * L.react * 0.5), done: false };
  }
  // 照想好的接法做。返回 true = 这一帧按了东西（或者就是要站着不动）
  airDefense(s, dist, press, go, lag) {
    const f = this.f, o = f.opp, L = this.L, H = f.inp.held, A = this.aa;
    if (!f.actionable()) return false;
    if (s.atk && s.dive) {                                          // 看见了坠山：别出托天掌（踩断对空），站着等它下来拳迎 / 站挡
      this.aa = null;
      if (Math.random() < L.aa) this.antiDive = true; else { f.noParry = true; this.lowBlock = false; this.blockT = 30; H.block = true; }
      return true;
    }
    if (A.plan === 'palm' || A.plan === 'pat') {
      if (A.done) return false;
      // 按着他的速度推：托天掌出手（前摇 S 帧）那几帧他在哪 —— 进了托天掌的射程、开始往下落了（或者快落地了）就按
      // 咏春拳的拍手一样算：他落到跟前（空中的拳脚够得着的地方）那几帧刚按下挡，这时候出的空中招都拍得开（没出就只是按着挡）
      const pat = A.plan === 'pat', D = pat ? null : this.MV.palm;
      if (pat && !o.airborne) { this.aa = null; return false; }
      const k = lag + (pat ? 3 : D.S + 1) + A.jitter;
      const px = s.x + s.vx * k, pd = Math.abs(px - f.x);
      const tLand = s.air ? (s.vz + Math.sqrt(Math.max(0, s.vz * s.vz + 2 * GRAV * s.alt))) / GRAV : 99;
      if (pd <= (pat ? 104 : D.reach - 2) && (s.vz < 1 || tLand <= k + 2)) {
        A.done = true;
        if (pat) { f.noParry = false; this.lowBlock = false; this.blockT = 14; H.block = true; } else press('d:heavy');
        return true;
      }
      return false;
    }
    if (A.plan === 'block') {
      // 站着挡（空中招都是上段）；他落地了还没出招就算了
      if (!o.airborne && o.state !== 'attack') { this.aa = null; return false; }
      if (dist <= 200) { f.noParry = true; this.lowBlock = false; H.block = true; H.down = false; return true; }
      return false;
    }
    if (A.plan === 'wait') {
      // 站着等：坠山看见了就拳迎（上面），空中招交给「看到对手出招」那一段（挡 / 蹲躲飞踢）。别往前走、别出地上的招
      if (!o.airborne) { this.aa = null; return false; }
      return false;
    }
    if (A.plan === 'back') {
      if (!o.airborne) { this.aa = null; return false; }
      const tw = o.x >= f.x ? 1 : -1, behind = f.x - tw * 100;
      if (behind < WALL_L + 20 || behind > WALL_R - 20) { A.plan = 'block'; return this.airDefense(s, dist, press, go, lag); }   // 退不了（到墙了）就站着挡
      // 他往下落、离得不远了：往后冲刺（冲刺前几帧无敌）躲开，他落空、落地有硬直；还远就举着手往后挪（面朝他，照样挡得住）
      // 2.6：冲刺要按三帧（按 → 松 → 按）才冲得出去；空中招前摇长了一点，出手的那一帧往后挪了零点几帧 —— 再晚一帧按，冲刺的无敌还没开始就挨上了，所以早一帧按
      if (!A.done && dist <= 150 && s.vz < 2 + GRAV) { A.done = true; this.dashAway(); return true; }
      if (dist <= 240) { f.noParry = true; this.lowBlock = false; H.block = true; go(-1); return true; }
      return false;
    }
    return false;
  }
  // 坠山踩下来：现在出拳的话，拳出手那几帧它在哪 —— 低到拳打得着（DIVE_AA_ALT）、还没踩到我、在拳的射程里，就是现在
  diveHit(o, om) {
    const f = this.f, nm = styleOf(f).variant('jab', f.chainIdle > CHAIN_WIN ? [] : f.chain, false, ''), J = this.MV[nm];
    const k = J.S + 1, hover = Math.max(0, om.S - om.t);              // 还要悬几帧才往下踩
    if (hover >= k) return false;
    const dive = k - hover, vx = om.t > om.S ? o.vx : o.facing * DIVE_VX;
    const alt = o.alt - DIVE_VZ * dive, x = o.x + vx * dive, d = Math.abs(x - f.x);
    return alt <= DIVE_AA_ALT + 4 && alt >= 58 && d <= J.reach + 4;
  }
  // 2.1 看见他冲刺过来 / 跑满了冲过来（s 是 react 帧以前的他）：按他冲完 / 跑到跟前爱干什么接（每一次只想一次）
  //   冲刺：先挡（冲完出招，冲势那一下）/ 蹲（冲完擒拿）/ 等他冲完出拳迎（冲完什么都不干，收招挨打）
  //   跑：腿迎上去（腿克沉肩靠，打击克擒拿，还有迎击）/ 挡（沉肩靠）/ 蹲（跑着抓）/ 不理（跑到跟前停下、起跳）
  watchRush(s, dist, toward, oppFacesMe, press, oppUp) {
    const f = this.f, L = this.L, R = Math.random, H = f.inp.held, M = this.memo;
    if (this.rush) {
      const P = this.rush;
      const om = f.opp.move, going = P.kind === 'dash' ? (P.now ? !!(om && om.name === 'dash') : s.dash) : s.run;
      if ((!going && ++P.t > 4) || oppUp) { this.rush = null; return false; }   // 他停了 / 跳起来了：作废
      if (P.plan === 'kick') {
        if (!going) return false;                                     // 他停下了（看见的）：别踢空
        // 腿踢出手那几帧他跑到哪：进了腿的射程就踢（他跑得快，提前按）
        const v = Math.abs(s.x - (f.opp.history[Math.max(0, f.opp.history.length - 2 - L.react)] || s).x) || RUN_MAX;
        if (dist - v * (this.mvOf('kick').S + 1) <= this.eR('kick') - 4) { this.rush = null; press('kick'); return true; }
        return false;
      }
      if (P.plan === 'jab') {
        if (dist <= this.mvOf('jab').reach && (going || P.t <= 2) && !s.air && !s.squat) { this.rush = null; press('jab'); return true; }
        return false;
      }
      if (P.plan === 'duck') { if (dist <= 150) { this.rush = null; this.duckT = 16; H.down = true; return true; } return false; }
      if (P.plan === 'block') { if (dist <= 210) { this.rush = null; f.noParry = !(R() < L.parry * 1.5); this.lowBlock = false; this.blockT = 20; H.block = true; return true; } return false; }
      return false;                                                    // wait：照常
    }
    if (!s.dash && !s.run) this.rushArmed = true;
    const rushing = (s.dash || s.run) && oppFacesMe && this.rushArmed;
    if (!rushing || dist > 300) return false;
    this.rushArmed = false;                                          // 一次冲刺 / 一段跑只想一次
    if (R() >= Math.min(0.95, L.read + 0.25)) return false;           // 没反应过来
    const hb = L.habit;
    if (s.dash) {
      const D = M.dash, t = D.strike + D.grab + D.none, pS = D.strike / t, pG = D.grab / t, pN = D.none / t;
      this.rush = { kind: 'dash', t: 0, plan: weighted([['block', 0.8 + 1.4 * pS * hb], ['duck', 1.6 * pG * hb], ['jab', 0.2 + 1.4 * pN * hb]]) };
    } else {
      const U = M.run, t = U.shoulder + U.grab + U.strike + U.stop, pSh = U.shoulder / t, pG = U.grab / t, pSt = U.stop / t;
      this.rush = { kind: 'run', t: 0, plan: weighted([['kick', 0.7 + 1.2 * (pSh + pG + U.strike / t) * hb], ['block', 0.4 + 0.8 * pSh * hb], ['duck', 1.4 * pG * hb], ['wait', 0.3 + 1.4 * pSt * hb]]) };
    }
    return this.watchRush(s, dist, toward, oppFacesMe, press, oppUp);
  }

  /* ---------- 2.1 记习惯（所有难度） ---------- */
  // 他在这个距离（近 / 中 / 远）先出 k 这一招的比例（出得不够多不算）
  habitShare(k, dist) {
    if (!k) return 0;
    const m = this.memo.open[bandOf(dist)];
    let tot = 0; for (const v of Object.values(m)) tot += v;
    return tot >= 4 ? (m[k] || 0) / tot : 0;
  }
  // 2.1 出招的智能性：挑连招的时候看他在这个距离爱出什么 —— 起手克他习惯招的多用（他爱贴身短拳，就多用重拳霸体起手），
  // 被他克的少用（贴着他还起腿，会被拳打失衡）。记得越准（habit）偏得越多
  pickPlan(dist) {
    const L = this.L, band = this.memo.open[bandOf(dist)];
    let tot = 0; for (const v of Object.values(band)) tot += v;
    const list = this.plans.map(([p, w]) => {
      let k = 1;
      if (tot >= 4) {
        const row = this.vsRow(p[0]);
        if (row) for (const [h, v] of Object.entries(band)) {
          const r = row[HABIT_MOVE[h]]; if (r === undefined || v <= 0) continue;
          k *= 1 + L.habit * (v / tot) * (r > 0 ? 1.5 : r < 0 ? -0.75 : 0);
        }
      }
      // 他正走过来：腿、扫堂腿起手（前摇长）少用
      if ((this.appr || 0) > 1 && (kindOf(p[0]) === 'kick')) k *= 0.35;
      // 2.9 老被咏春拳拍开、耕开、黏住：被化开的那一类起手少用（重拳最慢最好拍；腿、下段好耕），多抓（黐手、拍手、耕手都抓得住）
      const C = this.memo.ctr;
      if (C.hand + C.leg > 0.3) {
        const k0 = kindOf(p[0]), dn = p[0].startsWith('d:'), hb = L.habit;
        if (k0 === 'heavy' && !dn) k *= Math.max(0.2, 1 - 0.3 * C.hand * hb);
        else if (k0 === 'jab' && !dn) k *= Math.max(0.5, 1 - 0.12 * C.hand * hb) * (1 + 0.1 * C.leg * hb);   // 耕手耕不到中段的拳
        else if (dn && k0 === 'jab') k *= Math.max(0.2, 1 - 0.3 * C.leg * hb) * (1 + 0.2 * C.hand * hb);     // 拍手拍不到下段
        else if (k0 === 'kick') k *= Math.max(0.2, 1 - 0.3 * C.leg * hb);
        else if (k0 === 'grab') k *= 1 + 0.25 * (C.hand + C.leg) * hb;
      }
      return [p, w * Math.max(0.08, k)];
    });
    return weighted(list).slice();
  }
  // 他在这个距离老出同一招：有时候不等看见就先防 / 先出克它的招（难度越高越常、越准）。他换了招，这一下就白防了 —— 这也是赢它的办法
  habitGuard(s, dist, press) {
    const f = this.f, L = this.L, R = Math.random;
    if (s.down || s.stun || s.atk || s.air || s.blocking) return false;
    const m = this.memo.open[bandOf(dist)]; let tot = 0, top = null;
    for (const [k, v] of Object.entries(m)) { tot += v; if (!top || v > m[top]) top = k; }
    const p = tot >= 5 && top ? m[top] / tot : 0;
    if (p < 0.38 || R() >= (p - 0.3) * 0.06 * L.habit * (this.K.wc ? wcReadMul(L) : 1)) return false;
    const H = f.inp.held;
    const guard = (low, n) => { f.noParry = true; this.guardParry = false; this.lowBlock = low; this.guardT = n; H.block = true; H.down = low; return true; };
    // 护手多半蹲着护（中段、下段都挡得住，站着的擒拿抓不到）；看不准的（lowRead 低）有时站着
    const low = () => R() < 0.3 + 0.65 * L.lowRead;
    if (this.K.wc) return this.wcHabit(top, dist, press, guard, low);
    switch (top) {
      case 'jab': case 'lowJab': return R() < 0.35 * (1 - this.handRisk()) && dist <= effR('heavy') - 8 ? (press('heavy'), true) : guard(top === 'lowJab' || low(), 14 + (R() * 10 | 0));
      case 'heavy': return dist <= effR('kick') - 6 && R() < 0.55 * (1 - this.legRisk()) ? (press('kick'), true) : guard(low(), 18);
      case 'kick': return dist <= 96 && R() < 0.5 ? (press('jab'), true) : guard(low(), 16);
      case 'sweep': return R() < 0.4 ? (f.inp.press('up', f.clock), true) : guard(true, 18);
      case 'grab': return dist <= effR('jab') - 4 && R() < 0.4 ? (press('jab'), true) : (this.duckT = 14, H.down = true, true);
      case 'lowGrab': return dist <= effR('jab') - 4 && R() < 0.4 ? (press('jab'), true) : guard(false, 14);
      case 'air': this.aa = null; this.jumpSeen = false; return false;      // 跳：交给防跳（下一跳更容易想好接法）
      case 'dash': return dist <= 220 ? guard(low(), 16) : false;
      // 对面是咏春拳：老拉手 → 出腿、打下段（拉不住腿，下段拉不到）；老截脚 → 拳打他（单脚站着）
      case 'trap': return dist <= this.eR('kick') - 6 && R() < 0.5 ? (press('kick'), true) : dist <= this.eR('d:jab') - 4 ? (press('d:jab'), true) : guard(true, 14);
      case 'lowKick': return dist <= 96 && R() < 0.45 ? (press('jab'), true) : guard(true, 16);
      default: return false;
    }
  }
  // 2.10 咏春拳的电脑记住你的习惯：你老出手上的招 —— 先黐着手等你打过来（黏住进搭手）、先伸手拉、先标指插你的胳膊；
  // 老出腿 —— 截脚截你、截腿、拳打你单脚站着、黐手黏腿；老抓 —— 拳打你（拳最快）；老打下段 —— 蹲着黐手
  wcHabit(top, dist, press, guard, low) {
    const f = this.f, R = Math.random, H = f.inp.held;
    switch (top) {
      case 'jab': case 'heavy': case 'palm': {
        if (dist > 116) return false;
        const r = R();
        if (r < 0.45) return guard(false, 16 + (R() * 10 | 0));                               // 黐手（按着挡：打过来就黏住）
        if (r < 0.65 && dist <= this.mvOf('grab').reach + 4) { press('grab'); return true; }    // 拉手（他正好出拳 = 拉住；站着 = 扣住手腕）
        if (r < 0.82 && dist <= this.eR('f:jab') - 4) { press('f:jab'); return true; }          // 标指（插在他出手的胳膊上）
        return guard(low(), 14 + (R() * 10 | 0));
      }
      case 'lowJab': return guard(true, 16);
      case 'kick': {
        const r = R();
        if (r < 0.3 && dist <= this.eR('d:kick') - 4) { press('d:kick'); return true; }         // 截脚
        if (r < 0.5 && dist <= this.mvOf('d:grab').reach + 4) { press('d:grab'); return true; } // 截腿
        if (r < 0.7 && dist <= this.eR('jab') - 4) { press('jab'); return true; }               // 拳打单脚站着的
        return guard(false, 16);                                                                // 黐手黏腿
      }
      case 'sweep': case 'lowKick': return R() < 0.3 ? (f.inp.press('up', f.clock), true) : guard(true, 18);
      case 'grab': return dist <= this.eR('jab') - 4 && R() < 0.5 ? (press('jab'), true) : (this.duckT = 14, H.down = true, true);
      case 'lowGrab': return dist <= this.eR('jab') - 4 && R() < 0.4 ? (press('jab'), true) : guard(false, 14);
      case 'trap': return dist <= this.eR('kick') - 6 && R() < 0.5 ? (press('kick'), true) : dist <= this.eR('d:jab') - 4 ? (press('d:jab'), true) : guard(true, 14);
      case 'air': this.aa = null; this.jumpSeen = false; return false;
      case 'dash': return dist <= 220 ? guard(low(), 16) : false;
      default: return false;
    }
  }

  /* ---------- 2.1 极难：瞬间看穿 ---------- */
  // 这一招被它 1 帧看穿的概率：基础 inst，他在这个距离老出这一招就更高（最多 instMax）
  instChance(m, dist) {
    const L = this.L, p = this.habitShare(openerOf(this.f.opp, m.name), dist);
    return Math.min(L.instMax, L.inst + 0.6 * Math.max(0, p - 0.2)) * (this.K.wc ? wcReadMul(L) : 1);
  }
  // 看穿了：按他这一招现在走到哪（真的现在，不是 react 帧以前）挑最赚的破法，时机按到帧
  instCounter(o, dist, press) {
    const m = o.move, eta = m.S - m.t;                              // 还有几帧出手
    const snap = { name: m.name, kind: m.def.kind, tier: m.def.tier, height: m.def.height, reach: m.def.reach + (m.def.lunge ? Math.max(0, m.def.lunge[2]) : 0),
      remain: Math.max(0, m.S + m.def.A - m.t), sLeft: eta, air: m.air, dive: !!m.def.dive, x: o.x, vx: m.air ? o.vx : 0, limb: m.def.limb || null, pierce: !!m.def.pierce };
    return this.hellCounter(snap, dist, eta, press, true);
  }

  /* ---------- 难 / 极难 ---------- */
  // 这一招看不看得穿：基础 L.see（0.5）；对手在这个距离上出这一招出得越多（习惯），越容易看穿，最多 0.8
  seeChance(s, dist) {
    const m = this.memo.open[bandOf(dist)], k = openerOf(this.f.opp, s.name);
    let tot = 0; for (const v of Object.values(m)) tot += v;
    const p = k && tot >= 6 ? (m[k] || 0) / tot : 0;
    return Math.min(0.8, this.L.see + 0.45 * Math.max(0, p - 0.25)) * (this.K.wc ? wcReadMul(this.L) : 1);
  }
  // 闪身钻过去最晚什么时候还躲得着（再晚就已经钻到他身后、不算躲过）：大约几帧钻过他的身子
  slipWindow(dist) {
    const px = clamp(dist + SLIP_PAST, SLIP_MIN, SLIP_MAX), v = px / this.MV.slip.lunge[1];
    return Math.max(0, Math.floor((dist - 12) / v));
  }
  // 看穿了：从破解表里挑最赚的破法（差不多赚的随机挑一个，免得太好猜），时机算准。exact = 极难（时机按到帧）
  hellCounter(s, dist, eta, press, exact) {
    const f = this.f, d = f.opp.moves[s.name], R = Math.random;
    let opts = [];
    if (!d || eta < 0) return false;
    // 卸力要「刚按下去」：按下去那一帧离上一次按挡隔够 PARRY_LOCK；现在按着挡的话，得先松开一帧再按
    const pd = Math.max(0, eta - 3), freshBlock = f.clock + pd + 1 - f.blockPress >= PARRY_LOCK && (pd >= 1 || !f.prevBlock);
    if (this.K.wc) opts = this.wcCounterOpts(s, d, dist, eta, freshBlock);
    else if (s.name === 'dive') { opts.push([18, 'antiDive']); opts.push([5, 'block']); }
    else if (d.air) {
      // 托天掌出手那几帧他飞到哪（按他朝我飞的速度推）：够得着才用（远处的飞踢托不着，蹲下躲 / 腿迎）
      const PM = this.MV.palm, closing = (s.vx || 0) * (f.x >= s.x ? 1 : -1), pdist = dist - Math.max(0, closing) * (PM.S + 1);
      if (s.name === 'airKick') { opts.push([12, 'duck']); if (dist >= 105 && dist <= 175) opts.push([9, 'kick']); }
      if (eta >= (exact ? 1 : PM.S - 7) && pdist <= PM.reach + 2) opts.push([16, 'd:heavy']);
      if (freshBlock) opts.push([10, 'parry']);
      opts.push([4, 'block']);
    } else if (d.kind === 'grab') {
      if (d.low) opts.push([12, 'wait']);                           // 抄腿抓不到站着的：站着等它抓空，打收招
      else { opts.push([14, 'duck']); if (eta >= this.MV.jab.S + 2 && dist <= this.eR('jab') - 4) opts.push([9, 'jab']); }
    } else if (d.tier === 'super') {
      if (eta >= this.MV.grab.S + 1 && dist <= this.MV.grab.reach) opts.push([14, 'grab']);
      if (freshBlock) opts.push([20, 'parry']);
      opts.push([6, 'block']);
    } else if (slipable(d)) {                                        // 重拳：闪身回身肘 / 卸力 / 腿克重
      // 闪身：按下去三帧后才开始钻（按 → 松 → 按），要让重拳打到的那一帧正好钻到第 t 帧（还在他面前，躲得着）
      const t = Math.min(3, this.slipWindow(dist) - 1);
      if (t >= 0 && eta >= 3 + t) opts.push([26, 'slip', t]);
      if (eta >= 8 && dist <= this.eR('kick') - 6) opts.push([13, 'kick']);
      if (freshBlock) opts.push([22, 'parry']);
      opts.push([6, 'block']);
    } else if (d.kind === 'kick') {
      if (d.height === 'low') {                                       // 扫堂腿、踩腿：抄腿 / 蹲挡（挡住还能踩腿）
        if ((s.name === 'sweep' || s.name === 'wLowKick') && eta >= this.MV.lowGrab.S + 1) opts.push([20, 'd:grab']);
        opts.push([20, 'cblock']); if (freshBlock) opts.push([18, 'parry']);
      } else {
        if (eta >= this.MV.grab.S + 1 && dist <= d.reach + 6) opts.push([18, 'grab']);  // 接腿摔（腿踢到之前手要伸出来）
        if (dist <= this.eR('jab') - 4 && eta >= 3) opts.push([16, 'jab']);   // 拳打出腿的人：失衡倒地
        if (freshBlock) opts.push([16, 'parry']);
        opts.push([5, 'block']);
      }
    } else {                                                          // 拳、对空、推挡……
      if (d.height === 'low') { opts.push([8, 'cblock']); if (freshBlock) opts.push([10, 'parry']); }
      else {
        if (d.tier === 'light' && !d.pierce && eta >= 2 && dist <= this.eR('heavy') - 6) opts.push([15, 'heavy']);   // 重拳霸体硬吃它（咏春拳的寸拳、标指挑开这些吃不住：pierce / 走 strike）
        if (freshBlock) opts.push([13, 'parry']);
        opts.push([3, 'block']);
      }
    }
    if (!opts.length) return false;
    // 对面是咏春拳：重拳、腿去破他的招，也可能被他拍开、耕开、黏住（风险按被化开过多少算）
    if (!this.K.wc) { const hr = this.handRisk(), lr = this.legRisk(); for (const o of opts) { if (o[1] === 'heavy') o[0] *= 1 - hr; else if (o[1] === 'kick') o[0] *= 1 - lr; } }
    let best = 0; for (const o of opts) best = Math.max(best, o[0]);
    const near = opts.filter(o => o[0] >= best * 0.85), c = near[(R() * near.length) | 0];
    const H = f.inp.held, low = d.height === 'low';
    this.aa = null;
    switch (c[1]) {
      // 要等的话记下第几帧再按（tick 开头看 todo）；不用等就现在按
      case 'slip': { const w = eta - 3 - c[2]; if (w > 0) this.todo = { at: f.clock + w, act: 'slip' }; else this.slipIn(); H.block = true; return true; }
      case 'parry':
        if (pd > 0) { this.todo = { at: f.clock + pd, act: 'parry', low }; return true; }
        f.noParry = false; this.lowBlock = low; this.blockT = 14; H.block = true; H.down = low; return true;
      case 'antiDive': this.antiDive = true; return true;
      case 'trap': return this.trapAt(eta, exact);                   // 拉手：伸手扣的那几帧正好落在他那一拳快打出来的时候
      case 'biu': return this.biuAt(eta, exact);                     // 标指：插在他出手的胳膊上（挑开进搭手）
      case 'pat': return this.patAt(eta, false, exact);              // 拍手 / 耕手：刚按下挡那几帧被打到
      case 'gaun': return this.patAt(eta, true, exact);
      case 'stick': case 'stickLow': return this.stick(c[1] === 'stickLow', s.remain + 6);   // 黐手：按着挡，黏住进搭手
      case 'duck': this.duckT = Math.max(12, s.remain + 8); H.down = true; return true;
      case 'wait': f.noParry = true; this.lowBlock = false; this.blockT = Math.max(6, s.remain + 2); H.block = true; return true;
      case 'block': case 'cblock': f.noParry = true; this.lowBlock = c[1] === 'cblock' || low; this.blockT = Math.max(8, s.remain + 6); H.block = true; H.down = this.lowBlock; return true;
      default: press(c[1]); return true;
    }
  }
  // 罚：对手还要 left 帧才能动，离 dist 远 —— 挑够得着、来得及、最疼的一套（击倒的优先）
  bestPunish(dist, left) {
    let best = null;
    for (const [first, route, dmg] of this.K.routes) {
      const d = this.mvOf(first);
      if (!d || dist > effRD(d) - 6 || left < d.S + 1 + (first === 'H:heavy' ? WC_CHARGE + 6 : 0)) continue;   // 寸拳蓄满还要多等蓄劲那几帧
      if (!best || dmg > best[1]) best = [route, dmg];
    }
    return best && best[0];
  }
  // 2.10 咏春拳的电脑看穿了一招：从自己这一派的破法里挑 —— 手上的招：拍手、拉手、标指、黐手黏住（进搭手）、寸拳霸体吃一拳、转马躲重拳；
  //   地上的腿：耕手、截腿、截脚、拳打单脚站着的、黐手黏腿；下段：耕手、截腿、蹲着黐手；空中的拳脚：拍手
  wcCounterOpts(s, d, dist, eta, freshBlock) {
    const opts = [], T = this.MV.grab, LG = this.MV.lowGrab, LK = this.MV.wLowKick, B = this.MV.wBiu, J = this.mvOf('jab');
    const hand = HAND_LIMB.test(d.limb || ''), leg = d.limb === 'ff' || d.limb === 'bf', low = d.height === 'low';
    if (d.dive) { opts.push([18, 'antiDive']); opts.push([5, 'block']); }
    else if (d.air) {
      if (freshBlock && !low && (hand || leg)) opts.push([20, 'pat']);
      if (d.evadeCrouch) opts.push([12, 'duck']);
      opts.push([5, 'block']);
    } else if (d.kind === 'grab') {
      if (d.low) opts.push([12, 'wait']);
      else { opts.push([14, 'duck']); if (eta >= J.S + 2 && dist <= this.eR('jab') - 4) opts.push([10, 'jab']); }
    } else if (d.tier === 'super') {
      if (freshBlock && hand && !low) opts.push([20, 'pat']);
      opts.push([6, 'block']);
    } else if (d.kind === 'push') opts.push([6, 'block']);
    else if (leg && !low) {
      if (freshBlock) opts.push([18, 'gaun']);
      if (eta >= LG.S + 1 && dist <= d.reach + 6) opts.push([18, 'd:grab']);               // 截腿截住（他失衡）
      if (dist <= this.eR('jab') - 4 && eta >= J.S) opts.push([15, 'jab']);                  // 拳打出腿的人：失衡倒地
      if (eta >= LK.S - 1 && dist <= effRD(LK) - 4) opts.push([14, 'd:kick']);               // 截脚截住
      opts.push([16, 'stick']);                                                             // 黐手黏腿（进搭手）
    } else if (low) {
      if (freshBlock) opts.push([18, 'gaun']);
      if (leg && eta >= LG.S + 1 && dist <= d.reach + 6) opts.push([16, 'd:grab']);
      opts.push([15, 'stickLow']);
    } else {                                                                                // 拳、掌、肘、肩……
      if (freshBlock && hand) opts.push([20, 'pat']);
      if (hand && eta >= T.S + 1 && dist <= Math.max(T.reach, d.reach) + 4) opts.push([18, 'trap']);   // 拉手拉住（要卡在他快打出来的那几帧）
      if (hand && eta >= B.S + 1 && dist <= effRD(B)) opts.push([16, 'biu']);                          // 标指挑开
      if (slipable(d)) { const t = Math.min(3, this.slipWindow(dist) - 1); if (t >= 0 && eta >= 3 + t) opts.push([14, 'slip', t]); }
      if (d.tier === 'light' && !d.pierce && eta >= 2 && dist <= this.eR('heavy') - 6) opts.push([10, 'heavy']);   // 寸拳霸体吃他一拳
      opts.push([17, 'stick']);
    }
    return opts;
  }
  hellOffense(s, dist, press) {
    const f = this.f, R = Math.random, M = this.memo, L = this.L;
    if (s.down) return false;
    // 1) 打空的收招、落地硬直（看到的时候还剩几帧 - 反应）
    const left = s.phase === 'r' && !s.confirmed && !s.air ? s.rLeft - L.react : s.landT > 3 ? s.landT - L.react : -1;
    if (left > 0 && this.punishFor !== s.serial + ':' + s.landT) {
      const r = this.bestPunish(dist, left);
      if (r) { this.punishFor = s.serial + ':' + s.landT; this.plan = r.slice(); press(this.plan.shift()); return true; }
      // 极难：隔得远也冲过去罚（冲刺 + 冲势短拳）
      if (L.inst && dist <= 230 && left >= DASH_CANCEL + this.mvOf('jab').S + 6) { this.punishFor = s.serial + ':' + s.landT; this.seq = [{ fwd: 1 }, {}, { fwd: 1 }, {}, {}, {}, {}, { fwd: 1, press: 'jab' }]; this.plan = ['jab', 'heavy']; return true; }
    }
    if (s.atk) return false;
    // 2) 我刚被他挡住一下、我能动了：看他挡完以后爱干什么 —— 爱反手（出招 / 推挡 / 截击）我就先挡；爱一直挡我就抓、打下段；爱闪身我就出短拳
    if (this.pressTurn >= 0) {
      const fresh = f.clock - this.pressTurn <= 2; this.pressTurn = -1;
      if (fresh && dist <= 110) {
        const a = M.after, tot = a.hit + a.hold + a.slip + a.move, ph = a.hit / tot, pd = a.hold / tot, ps = a.slip / tot, r = R();
        if (r < ph * 0.85) { f.noParry = true; this.lowBlock = false; this.blockT = 12; f.inp.held.block = true; return true; }
        if (r < ph * 0.85 + pd * 0.9) { press(dist <= this.mvOf('grab').reach - 4 ? 'grab' : R() < 0.5 ? 'd:jab' : 'd:kick'); return true; }
        if (r < ph * 0.85 + pd * 0.9 + ps) { press('jab'); return true; }
      }
    }
    // 3) 预判：他在这个距离上老出同一招（出得多了），有时候不等看见就先出破法 —— 他照旧出就被破；
    //    他换了招（或者干脆不出）这一下就打空 / 被罚。这就是「思维」能赢它的地方：故意养成一个习惯，再反着来
    if (!s.blocking && !s.stun && !s.air) {
      const m = M.open[bandOf(dist)]; let tot = 0, top = null;
      for (const [k, v] of Object.entries(m)) { tot += v; if (!top || v > m[top]) top = k; }
      const pTop = tot >= 8 && top ? m[top] / tot : 0;
      if (pTop >= 0.4 && R() < (pTop - 0.3) * 0.03) {
        // 对面是咏春拳多的几类：拉手 → 腿；截脚 → 拳。咏春拳自己的预判：手上的招 → 黐手等着黏 / 标指，腿 → 截脚 / 截腿，下段 → 蹲着黐手，抓 → 拳
        const pre = this.K.wc ? { kick: dist <= 110 ? (R() < 0.5 ? 'd:grab' : 'd:kick') : null, heavy: dist <= 110 ? (R() < 0.5 ? 'f:jab' : 'stick') : null, jab: dist <= 104 ? 'stick' : null,
          palm: dist <= 104 ? 'stick' : null, grab: 'jab', lowGrab: 'jab', sweep: 'stickLow', lowKick: 'stickLow', lowJab: dist <= 100 ? 'stickLow' : null, dive: 'jab',
          trap: dist <= this.eR('kick') ? 'kick' : null }[top]
          : { kick: dist <= this.MV.kick.reach ? 'grab' : null, heavy: dist <= 120 ? 'slip' : null, jab: dist <= 100 ? 'heavy' : null, grab: 'd:jab',
          sweep: 'up', lowJab: dist <= 100 ? 'heavy' : null, air: dist <= 140 ? 'd:heavy' : null, jump: dist <= 150 ? 'd:heavy' : null, dive: 'jab',
          trap: dist <= this.eR('kick') - 4 ? 'kick' : null, lowKick: dist <= 96 ? 'jab' : null }[top];
        if (pre === 'slip') { this.slipIn(); f.inp.held.block = true; return true; }
        if (pre === 'stick' || pre === 'stickLow') return this.stick(pre === 'stickLow', 16);
        if (pre === 'up') { f.inp.press('up', f.clock); return true; }
        if (pre) { press(pre); return true; }
      }
    }
    // 4) 他在挡：上下段、擒拿换着来（站挡 → 擒拿 / 下段；蹲挡 → 抄腿 / 劈山（上段））
    if (s.blocking && dist <= 120) {
      const p = R();
      if (!s.lowBlock) {
        if (dist <= this.mvOf('grab').reach - 2 && p < (f.opp.style === 'wc' || this.K.wc ? 0.12 : 0.05)) { press('grab'); return true; }
        if (p < 0.09) { press(dist <= 90 ? 'd:jab' : 'd:kick'); return true; }
      } else {
        if (dist <= this.mvOf('d:grab').reach - 2 && p < (this.K.wc ? 0.08 : 0.05)) { press('d:grab'); return true; }
        if (!this.K.wc && dist <= 100 && p < 0.09) { this.plan = ['heavy', 'heavy']; press('heavy'); return true; }
      }
    }
    return false;
  }
  // 记住对手的习惯（只记，不改战斗逻辑；AI 联机不用）。2.1：所有难度都记；记得准不准（L.habit）：记的数乘这个，
  // 旧的慢慢淡掉（每记一次别的都 ×0.97），他改了习惯它也跟着改
  learn(o) {
    const M = this.memo, f = this.f, w = this.L.habit || 0.5;
    // 2.9 我的招被咏春拳化开了（拍开、耕开、拉住、黏住、标指挑开）：记下来是手上的招还是腿 —— 以后少拿这一类起手、多抓、多打快的
    M.ctr.hand *= 0.9997; M.ctr.leg *= 0.9997;
    const rk = f.state === 'hit' && f.reel ? f.reelKind : null, ck = rk === 'pat' ? 'hand' : rk === 'gaun' ? 'leg' : null;
    if (ck && !this.ctrOn) { this.ctrOn = true; M.ctr[ck] += 1; } else if (!ck) this.ctrOn = false;
    if (f.state === 'attack' && f.move && !f.move.def.script) this.lastLimb = f.move.def.height === 'low' ? 'ff' : f.move.def.limb;   // 我正在出的招打的是哪只手脚
    M.rev *= 0.9997; M.esc *= 0.9997;
    if (f.move && f.move.def.tch && f.move.rollT > 0) this.rollAt = f.clock;
    if (f.grabbed && !this.grabOn) { this.grabOn = true; if (f.clock - (this.rollAt || -99) < 12) M.rev += 1; } else if (!f.grabbed) this.grabOn = false;
    if (f.stuck && !this.stuckOn) { this.stuckOn = true; if (this.lastLimb) M.ctr[/^(ff|bf)$/.test(this.lastLimb) ? 'leg' : 'hand'] += 0.6; }   // 刚被黏住 / 拉住
    else if (!f.stuck) this.stuckOn = false;
    // 起身：开始起身那一帧看他滚不滚、往哪滚
    if (o.state === 'down' && o.downPhase === 'getup') {
      if (!this.wakeLogged) { this.wakeLogged = true; const k = !o.rollDir ? 'stand' : o.rollDir * (f.x - o.x) > 0 ? 'to' : 'away'; M.wake[k]++; }
    } else if (o.state !== 'down') this.wakeLogged = false;
    // 中立时先出手：他出了新招、这一招是一串的第一下（不是连招里接的）、我这时候没在挨打 —— 记「在多远出了什么」
    const om = o.state === 'attack' ? o.move : null, band = M.open[bandOf(Math.abs(o.x - f.x))];
    if (om && om.serial !== this.openSeen) {
      this.openSeen = om.serial;
      const k = openerOf(o, om.name);
      if (k && (o.chain.length <= 1 || om.air) && f.state !== 'hit' && f.state !== 'down' && f.state !== 'rise') {
        for (const key of Object.keys(band)) band[key] *= 0.97;
        band[k] = (band[k] || 0) + w;
      }
    }
    // 他起跳（每一跳记一次；2.6 电脑一帧看一次，起跳那一步不一定正好看到，所以记着这一跳看过没有）
    if (o.state === 'jumpsquat') { if (!this.jsSeen) { this.jsSeen = true; band.jump = (band.jump || 0) + w; } } else this.jsSeen = false;
    // 2.1 他在这个距离能出手的时候多常出手（一贴近就出手的人，近身就要多护着）
    const started = !!om && om.serial !== this.hzSer && !om.def.script;
    if (om) this.hzSer = om.serial;
    if (this.hzBand >= 0) M.hz[this.hzBand] = M.hz[this.hzBand] * 0.97 + (started ? 0.03 : 0);
    this.hzBand = o.actionable() && !o.airborne && f.state !== 'hit' && f.state !== 'down' ? bandOf(Math.abs(o.x - f.x)) : -1;
    // 2.1 跳过来干什么（空中招 / 坠山 / 什么都不出）、冲刺完干什么、跑满了跑到跟前干什么
    const bump = (T, k) => { for (const key of Object.keys(T)) T[key] *= 0.95; T[k] += w; };
    if (o.state === 'jumpsquat' && !this.jw) this.jw = { did: null };
    if (this.jw) {
      if (o.state === 'attack' && o.move && o.move.air) this.jw.did = o.move.def.dive ? 'dive' : 'air';
      if (!o.airborne && o.state !== 'jumpsquat' && o.state !== 'attack') { bump(M.jump, this.jw.did || 'empty'); this.jw = null; }
    }
    if (om && om.name === 'dash' && this.dw !== om.serial) { this.dw = om.serial; this.dwLeft = -1; }
    else if (this.dw >= 0) {
      if (om && om.name !== 'dash') { bump(M.dash, om.def.kind === 'grab' ? 'grab' : 'strike'); this.dw = -1; }
      else if (!om || om.name !== 'dash') {
        if (this.dwLeft < 0) this.dwLeft = DASH_IN_WIN + 2;                // 冲刺刚收完还能带冲势出招：等几帧
        if (--this.dwLeft <= 0 || o.state === 'hit' || o.airborne) { bump(M.dash, 'none'); this.dw = -1; }
      }
    }
    if (o.state === 'run' && o.runT >= RUN_CHARGE) this.rw = 8;
    else if (this.rw > 0) {
      if (om) { bump(M.run, om.name === 'shoulder' ? 'shoulder' : om.def.kind === 'grab' ? 'grab' : 'strike'); this.rw = 0; }
      else if (o.airborne || o.state === 'jumpsquat' || o.state === 'hit' || --this.rw <= 0) { if (Math.abs(o.x - f.x) <= 170) bump(M.run, 'stop'); this.rw = 0; }   // 远处停下的不算
    }
    // 我的招被他挡住：看他硬直一过先干什么（14 帧以内）
    if (f.state === 'attack' && f.move && f.move.blocked && !this.afterWatch && o.state === 'blockstun') this.afterWatch = { phase: 0, t: 0 };
    const aw = this.afterWatch;
    if (aw) {
      if (om) { M.after[om.name === 'slip' ? 'slip' : 'hit']++; this.afterWatch = null; }
      else if (aw.phase === 0) { if (o.state !== 'blockstun') aw.phase = 1; }
      else if (++aw.t > 14 || o.state === 'hit' || o.state === 'down') { M.after[o.state === 'block' ? 'hold' : 'move']++; this.afterWatch = null; }
    }
  }
}
// 按难度造电脑（ui / game 用）：不认识的难度当「中」
function makeBrain(F, level) { return new Brain(F, LEVELS[level] ? level : 'normal'); }

/* ============================================================
   打桩用的木桩：不出招，只按设定站 / 蹲 / 挡 / 随机挡 / 跳；永远面朝玩家；不会卸力
   mode：stand 站着 · crouch 蹲着 · block 站挡 · lowblock 蹲挡 · random 每招随机挡上或挡下 · jump 一直跳
   ============================================================ */
class Dummy {
  constructor(f, mode) { this.f = f; this.mode = mode || 'stand'; this.seen = -1; this.low = false; }
  tick(locked) {
    const f = this.f, o = f.opp, H = f.inp.held;
    H.left = H.right = H.up = H.down = H.block = H.heavy = false;
    f.noParry = true;
    if (locked) return;
    if (f.actionable() || f.state === 'land') f.facing = o.x >= f.x ? 1 : -1;
    switch (this.mode) {
      case 'crouch': H.down = true; break;
      case 'block': H.block = true; break;
      case 'lowblock': H.block = true; H.down = true; break;
      case 'random': {
        H.block = true;
        if (o.move && o.state === 'attack' && o.move.serial !== this.seen) { this.seen = o.move.serial; this.low = Math.random() < 0.5; }
        H.down = this.low; break;
      }
      case 'jump': if ((this.jt = (this.jt || 0) + 1) >= 45 && f.actionable()) { this.jt = 0; f.inp.press('up', f.clock); } break;   // 大约 45 帧跳一次
    }
  }
}
