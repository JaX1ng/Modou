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
     格斗术的电脑打咏春拳：多抓、多打下段（黐手黏不住擒拿，站着黏不住下段），连招别太长
   AI 可以用随机数（联机不走 AI） */

// 计划里 'd:xx' = 按住蹲再按 xx（地面：下盘拳 / 扫堂腿 / 托天掌；空中 d:kick = 坠山）
/* 3.1 长连招（Jack：连招不一定只有两三下，可以到六段到八段；连招越连收益越高）：一套里第 n 下 ×(1 + 0.1n)、同一招再用打对折（config.js COMBO_ESC / REPEAT_MUL），
   这几套是穷举量出来的真连（相距 55 ～ 80 都接得上；离得太远，短拳打到头再接就够不着了 —— pickPlan 里长的只在 82 以内用）：
   R6 拳腿拳拳拳腿 = 短拳 鞭腿 落步冲拳 后手直拳 摆拳 转身蹬；R7 拳腿拳重拳拳重 = 短拳 鞭腿 落步冲拳 进步冲拳 顶肘 后手直拳 冲天炮；
   R7b 拳重拳腿拳腿重 = 短拳 进步冲拳 顶肘 鞭腿 落步冲拳 鞭腿 盖步砸拳；R8 腿拳重拳腿拳拳重（腿起手）；R6h 重拳腿拳重腿（重起手）；R5 两套五下的 */
const R6 = ['jab', 'kick', 'jab', 'jab', 'jab', 'kick'], R7 = ['jab', 'kick', 'jab', 'heavy', 'jab', 'jab', 'heavy'], R7b = ['jab', 'heavy', 'jab', 'kick', 'jab', 'kick', 'heavy'];
const R8 = ['kick', 'jab', 'heavy', 'jab', 'kick', 'jab', 'jab', 'heavy'], R6h = ['heavy', 'jab', 'kick', 'jab', 'heavy', 'kick'];
const R5a = ['jab', 'heavy', 'jab', 'kick', 'heavy'], R5b = ['jab', 'kick', 'jab', 'heavy', 'kick'], R4u = ['jab', 'jab', 'jab', 'heavy'], RJ6 = ['jab', 'jab', 'jab', 'jab', 'jab', 'jab'];
// 3.1 太极拳的长连招（combo_enum 量的，离得近 ≤ 82 才接得满）：搬拦捶 → 顺拦肘 → 高探马 → 白鹤亮翅 → 蹬脚 87、搬拦捶 → 转身摆莲 → 蹬脚 → 转身蹬脚 80、
//     揽雀尾 → 分脚 → 上步七星 → 高探马 → 白鹤亮翅 78、揽雀尾 → 高探马 → 白鹤亮翅 → 蹬脚 67、搬拦捶 → 顺拦肘 → 高探马 → 白鹤亮翅 66、搬拦捶 → 转身摆莲 → 蹬脚 57（≤ 95 都接得上）
const T5a = ['heavy', 'jab', 'jab', 'heavy', 'kick'], T5b = ['jab', 'kick', 'jab', 'jab', 'heavy'], T4a = ['heavy', 'kick', 'kick', 'kick'], T4b = ['jab', 'jab', 'heavy', 'kick'];
const T4c = ['heavy', 'jab', 'jab', 'heavy'], T3a = ['heavy', 'kick', 'kick'], T3b = ['jab', 'kick', 'heavy'];
const PLANS = {
  // 2.2 入门：多是一两下（单拳、两拳、拳重、单出重拳 / 腿），很少三下以上
  novice: [[['jab'], 3], [['jab', 'jab'], 3], [['jab', 'heavy'], 2], [['heavy'], 2], [['kick'], 2], [['jab', 'kick'], 1.5], [['heavy', 'kick'], 1],
    [['kick', 'kick'], 0.6], [['grab'], 1], [['d:jab'], 1], [['d:kick'], 0.4], [['jab', 'jab', 'heavy'], 1]],
  easy: [[['jab'], 2], [['jab', 'jab'], 2], [['jab', 'heavy'], 3], [['jab', 'jab', 'heavy'], 3], [['jab', 'kick'], 2], [['jab', 'jab', 'kick'], 2], [R4u, 0.6],
    [['jab', 'jab', 'jab', 'jab'], 1], [['heavy', 'kick'], 2], [['heavy', 'jab'], 1], [['heavy', 'heavy'], 1], [['kick', 'jab'], 1], [['kick', 'kick'], 1],
    [['grab'], 1], [['d:jab', 'd:kick'], 0.6], [['d:kick'], 0.4], [['jab', 'd:kick'], 0.4], [['d:jab'], 1], [['d:jab', 'jab', 'heavy'], 1]],
  normal: [[['jab', 'jab'], 1], [['jab', 'heavy'], 3], [['jab', 'jab', 'heavy'], 4], [['jab', 'kick'], 3], [['jab', 'jab', 'kick'], 3],
    [['heavy', 'kick'], 3], [['heavy', 'jab', 'heavy'], 2], [['heavy', 'heavy'], 2], [['heavy', 'd:kick'], 0.6], [['kick', 'jab', 'jab'], 2],
    [['kick', 'heavy'], 2], [['kick', 'kick'], 2], [['grab'], 2], [['d:jab', 'd:kick'], 0.6], [['jab', 'd:kick'], 0.5], [['d:jab', 'jab', 'heavy'], 2], [['d:jab', 'jab', 'kick'], 1],
    [R4u, 1], [R5a, 0.5], [R5b, 0.5], [R6, 0.25]],   // 3.1 中等偶尔接长的（2.2「五档拉得开」：乱打的要打掉中等四成以上）
  // 难（2.0.2 的地狱）：打中就接击倒的那几套（冲天炮、旋风腿、二起脚、盖步砸拳），倒了接着压起身
  hard: [[['jab', 'jab', 'heavy'], 4], [['jab', 'heavy'], 2], [['jab', 'jab', 'kick'], 2], [['heavy', 'kick'], 4], [['kick', 'kick'], 3], [['kick', 'heavy'], 2],
    [['heavy', 'heavy'], 1], [['kick', 'jab', 'jab'], 1], [['grab'], 2], [['d:jab', 'jab', 'heavy'], 2], [['d:jab', 'd:kick'], 1], [['jab', 'jab', 'jab', 'jab'], 1],
    [R6, 2.5], [R7, 2.5], [R5a, 2], [R5b, 1.5], [R6h, 1.5], [RJ6, 1]],
  // 极难：一样爱接击倒，短拳起手的多（快、被挡也不亏），偶尔擒拿、下段换着来
  hell: [[['jab', 'jab', 'heavy'], 3], [['jab', 'heavy'], 1.5], [['jab', 'jab', 'kick'], 2], [['heavy', 'kick'], 2], [['kick', 'kick'], 1.5], [['kick', 'heavy'], 1.5],
    [['grab'], 2], [['d:jab', 'jab', 'heavy'], 2], [['d:jab', 'd:kick'], 1], [['jab', 'jab', 'jab', 'jab'], 1],
    [R7, 2], [R7b, 1.5], [R8, 0.8], [R6, 1.5], [R6h, 1], [R5a, 1.5], [RJ6, 1]],   // 3.1 长的少一点（2.2：乱打的要打掉终极两成以上）
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
    punish: .08, combo: .35, long: 0, longW: 1, aggr: .42, jump: .45, grabBlock: .18, idle: .55, tech: .05, gc: .03, stomp: .12, scoop: .03, roll: .15,
    slip: .02, gwalk: .1, oki: .1, catchSlip: .06, airBlock: .35, aaPlan: .2, habit: .08, guard: .1, punishBlock: .12,
    beatSd: 2, brk: .06, brkAcc: .4, touch: .1, feel: 7, jie: .05, jieAcc: .45, jieSd: 3.5, jieFlat: .75 },
  // 简单（2.1 叫「易」）= 2.0.2 的「中」：反应 11 帧，挡一半、偶尔读招；修好了防跳、挡空中招、挡住就罚、记一点习惯
  // 2.7（Jack：简单也再简单些，让乱打的打掉 65% 以上；破招少一点）：读招 0.3 → 0.06、卸力 0.12 → 0.05、推挡 0.25 → 0.05、对空 0.4 → 0.12、
  //     接腿、抄腿、截击、踩腿、闪身都少了；挡住就罚 0.55 → 0.3、罚 0.55 → 0.25；反应 11 → 14。挡、连招只降一点（0.36、0.72）、记习惯照旧 0.45
  //     —— 打法朴素一点，不是光挨打；你老出同一招它还是会慢慢防住（不破招，只是挡对）
  easy: { react: 14, block: .36, lowRead: .55, parry: .05, push: .05, burst: .25, read: .06, catch: .18, duck: .45, aa: .12, step: .18, low: .18, sup: .55,
    punish: .25, combo: .72, long: 0.05, longW: 1, aggr: .78, jump: .65, grabBlock: .32, idle: .3, tech: .12, gc: .08, stomp: .3, scoop: .1, roll: .27,
    slip: .05, gwalk: .2, oki: .3, catchSlip: .18, airBlock: .5, aaPlan: .25, habit: .45, guard: .24, punishBlock: .3,
    beatSd: 1.7, brk: .1, brkAcc: .5, touch: .25, feel: 6, jie: .12, jieAcc: .55, jieSd: 2.8, jieFlat: .7 },
  // 中等（2.1 叫「中」）= 2.0.2 的「难」
  // 2.7（Jack：中等也再简单点，让乱打的打掉 40% 以上）：反应 8 → 9、挡 0.66 → 0.58、读招 0.5 → 0.38、卸力 0.25 → 0.16、接腿 0.6 → 0.45、对空 0.7 → 0.55、
  //     罚 0.85 → 0.7、挡住就罚 0.8 → 0.65、连招接下去 0.95 → 0.85、压起身 0.75 → 0.6、发呆 0.1 → 0.15（记习惯不降：老出同一招照样防得住）
  normal: { react: 9, block: .58, lowRead: .8, parry: .16, push: .45, burst: .75, read: .38, catch: .45, duck: .8, aa: .55, step: .4, low: .25, sup: .9,
    punish: .7, combo: .85, long: 0.3, longW: 0.6, aggr: 1, jump: 1, grabBlock: .7, idle: .15, tech: .4, gc: .35, stomp: .9, scoop: .4, roll: .55,
    slip: .2, gwalk: .45, oki: .6, catchSlip: .55, airBlock: .9, aaPlan: .72, habit: .65, guard: .46, punishBlock: .65,
    beatSd: 1.6, brk: .25, brkAcc: .6, touch: .45, feel: 4, jie: .4, jieAcc: .72, jieSd: 1.8, jieFlat: .6 },
  // 困难（2.1 叫「难」）= 2.0.2 的「地狱」：看穿、记习惯、预判、算准时机、主动罚。
  // 2.2（Jack：降 5~10%）：反应 7 → 8 帧、看穿 0.5 → 0.45（习惯招最多还是 0.8）、挡 0.7 → 0.66、挡住就罚 0.92 → 0.86、记习惯 0.85 → 0.8
  // 2.7 没动（倒地、滚身起改了以后量过：木头玩家占比 12 个种子 2.6 是 26.9%、2.7 是 26.6%）
  // 2.12 困难的反应慢 1 帧（8 → 9）：慢招前摇拉长了两三帧（重拳 18、腿踢 19.5）以后，8 帧反应什么慢招都挡得住、慢招打电脑白给，
  //   木头玩家打困难掉到 25.6%，和终极（21.7%）挨到一起；9 帧量出来 29% 上下（2.6 / 2.7 是 28.5 / 26.5%）。挡 0.66 试过 0.63 / 0.6，对木头玩家的占比没影响，没动；
  //   中等、终极的反应也试过各慢一帧：对木头玩家的占比没影响，终极反倒打不过困难、坠山击挡不住了，没动
  // 3.1.1 防跳修好以后（越过头顶的空中招也挡、对空按真的轨迹算、慢招前摇里看他会不会跳）困难整个变狠了：木头玩家（格斗术）打困难 26 → 25%、
  //   打咏春拳的困难 21%，和终极挨得太近 —— 看穿 0.45 → 0.42、连招接下去 0.88 → 0.84、罚 0.9 → 0.86、压起身 0.75 → 0.68、咏春拳的接招 0.55 → 0.48（防跳那一套不动）
  hard: { react: 9, block: .66, lowRead: .85, parry: .25, push: .45, burst: .75, read: .5, catch: .6, duck: .8, aa: .7, step: .4, low: .25, sup: .9,
    punish: .86, combo: .84, long: 0.3, longW: 0.8, aggr: 1, jump: 1, grabBlock: .7, idle: .06, tech: .4, gc: .35, stomp: .9, scoop: .4, roll: .55,
    slip: .2, gwalk: .45, oki: .68, catchSlip: .55, see: .42, smart: true, airBlock: .95, aaPlan: .82, habit: .8, guard: .54, punishBlock: .86,
    beatSd: 1, brk: .4, brkAcc: .7, touch: .6, feel: 3, jie: .48, jieAcc: .87, jieSd: 1.05, jieFlat: .5 },   // 2.12 jie 0.62 → 0.55：接住以后那一套疼了（反打 ×1.3、搭手 ×1.35），少接一点，木头玩家照旧打掉两成半上下
  // 2.6（连招、高级招伤害提了，电脑一套连招打得更疼）：困难的罚 0.95 → 0.9、连招接下去 1 → 0.95；终极的罚、连招 1 → 0.93 —— 难度拉回 2.5 的样子
  //（乱换招的木头玩家打掉的血占比，2.5：入门 67% · 简单 53% · 中等 38% · 困难 28% · 终极 22.5%；2.6：66% · 52% · 34% · 28.5% · 23.5%；
  //  2.7（12 个种子；同样 12 个种子量 2.6 是 66% · 53% · 35% · 27% · 23.5%）：84% · 69% · 43% · 26.5% · 22.5%）
  // 终极（2.1 叫「极难」，id 还是 hell）：平时反应 10 帧（和人差不多），但每一招有 inst 的概率被它 1 帧看穿、按最赚的破法、时机按到帧（非人）；
  // 别的本事全开：挡得多、高低几乎不错、罚满、连招满、记习惯最准、主动进攻最聪明。
  // 2.2（Jack：全是读指令 + 破招，完全玩不了）：瞬间看穿基础 0.6 → 0.3、习惯招最多 0.88 → 0.55
  // 2.3（Jack：再降 5~10%）：瞬间看穿基础 0.3 → 0.2（你老出的招最多还是 0.55：别养习惯）、看穿 see 0.55 → 0.48、平时反应 10 → 11 帧、挡 0.8 → 0.74
  // 3.1.1 防跳修好以后终极也整个变狠了（木头玩家打终极 20 → 17%，Jack 2.7 定的是两成以上）：防跳那一套不动，松的是别的 ——
  //   罚 0.93 → 0.88、连招接下去 0.93 → 0.84、压起身 0.9 → 0.7、瞬间看穿 0.2 → 0.17（你老出的招最多照旧 0.55）
  hell: { react: 11, block: .74, lowRead: .92, parry: .35, push: .5, burst: .9, read: .6, catch: .7, duck: .9, aa: .85, step: .45, low: .3, sup: 1,
    punish: .88, combo: .84, long: 0.1, longW: 0.45, aggr: 1, jump: .7, grabBlock: .8, idle: .05, tech: .65, gc: .5, stomp: 1, scoop: .5, roll: .65,
    slip: .25, gwalk: .4, oki: .7, catchSlip: .7, see: .48, smart: true, airBlock: 1, aaPlan: .95, habit: 1, guard: .55, punishBlock: 1,
    inst: .17, instMax: .55, instReact: 1,
    beatSd: .8, brk: .58, brkAcc: .82, touch: .7, feel: 2, jie: .6, jieAcc: .9, jieSd: .9, jieFlat: .35 },   // 2.12 接招 jie 0.7 → 0.6（试过 0.78 / 0.94 / 0.75：接住那一套疼了以后木头玩家只剩 15%，太狠；0.6 + 一串少连两拳 → 21%，和格斗术的终极一样）
};
// 2.10 咏春拳：beatSd 连环冲拳按得离拍点差多少帧（标准差；拍子前 WC_EARLY、后 WC_LATE 帧以内算在拍子上）；
//   touch 搭手里懂不懂行（翻对手型、反拿、甩手）；feel 搭手里手上的反应（帧）：黏着的时候看他几帧以前的样子（比 react 快：手上的感觉比眼睛快）
// 2.12 按错了按的是哪个键（WINGCHUN.md 十六，一错一平一对）：没按对的那一下，jieFlat 的概率按「平」的键（环上的下一个：当普通挡住），剩下的按「错」的（×1.3）——
//   入门、简单多半按平（手生的人先护着），困难、终极一半一半
function wrongCatchKey(L, need) { return Math.random() < (L.jieFlat === undefined ? 0.5 : L.jieFlat) ? CATCH_NEXT[need] : CATCH_NEXT[CATCH_NEXT[need]]; }
// 2.11 接招（WINGCHUN.md 十五）：jie 看见他出招、按住挡接的机会；jieAcc 键按对的概率（拳接拳、重接重、拿接腿；瞎猜三成）；
//   jieSd 按得离正好差多少帧（标准差）；brk / brkAcc 挨打、被挡住的硬直里接（新的黐手破连）试不试、键对不对
// 2.2 难度的名字（两个字）：菜单、电脑血条底下用（2.3 Jack：菜单上不要介绍，一句话说明删了）
const LEVEL_NAME = { novice: '入门', easy: '简单', normal: '中等', hard: '困难', hell: '终极', max: '满级' };
for (const id in LEVELS) LEVELS[id].id = id;                   // 2.9 每一档知道自己是哪一档（咏春拳的电脑按档打折用）
const LEVEL_IDS = Object.keys(LEVELS);                         // 人机的五档（满级不在里面）
// 2.12 满级（Jack：观战的时候两个电脑的强度必须拉满）：只给观战用，不进人机的五格、不记成就。终极的数是为了真人打得过压过的（瞬间看穿只有 0.2），
//   观战没有真人，不用留情 —— 从 2.1 那个「完全玩不了」的极难起步（瞬间看穿 0.6 / 习惯招 0.88），反应取困难的 8 帧、不发呆、罚满、连招满、记习惯最准，
//   咏春拳的接招、拍子、搭手也都最准。别全拉到 1：两边都百分之百看穿就谁也不敢出手、站着对峙（看 40 回合里打空、挡住、发呆的比例）
LEVELS.max = { react: 7, block: .9, lowRead: .98, parry: .6, push: .6, burst: .95, read: .8, catch: .85, duck: .95, aa: .95, step: .5, low: .3, sup: 1,
  punish: 1, combo: 1, long: 1, longW: 1, aggr: 1, jump: .7, grabBlock: .9, idle: 0, tech: .85, gc: .6, stomp: 1, scoop: .65, roll: .7,
  slip: .3, gwalk: .35, oki: .95, catchSlip: .85, see: .7, smart: true, airBlock: 1, aaPlan: 1, habit: 1, guard: .6, punishBlock: 1,
  inst: .7, instMax: .92, instReact: 1,
  beatSd: .4, brk: .85, brkAcc: .95, touch: .95, feel: 1, jie: .92, jieAcc: .98, jieSd: .5, jieFlat: .25, id: 'max' };
PLANS.max = PLANS.hell;
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
  lowKick: 'sweep', trap: 'trap', tpeng: 'tpeng', tkick: 'tkick', tlow: 'tlow' };   // 咏春拳的截脚算扫堂腿那一类；拉手是新的一类；3.0 太极拳的三类
// 2.1 贴身两边差不多同时出手，谁赚（实测出来的，前摇快慢、霸体、接腿、蹲低躲擒拿都算进去）：VS[我的][他的] = 1 我赚 / -1 他赚 / 0 差不多
//   短拳快，打得断腿、擒拿、托天掌，怕重拳霸体；重拳霸体吃拳，怕腿化解、怕擒拿（擒拿更快）；腿克重拳、被拳打失衡、被接腿；
//   扫堂腿蹲得低站着的擒拿抓不到，怕拳、怕抄腿；擒拿接得住腿、抓得住重拳，怕拳、抓不到蹲低的；下盘拳又快又低
//   trap：咏春拳的拉手（拉得住地上手上的招，接不住腿，下段拉不到）；还有咏春拳自己起手的几行（w:xx，计划里第一键）
const VS = {
  jab:    { jab: 0, lowJab: 0, heavy: -1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: -1, tpeng: -1, tkick: 1, tlow: -1 },
  lowJab: { jab: 0, lowJab: 0, heavy: -1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: 1, tpeng: 1, tkick: 1, tlow: 1 },
  heavy:  { jab: 1, lowJab: 1, heavy: 0, kick: -1, sweep: -1, grab: -1, lowGrab: -1, palm: 0, trap: -1, tpeng: 0, tkick: -1, tlow: 0 },
  kick:   { jab: -1, lowJab: -1, heavy: 1, kick: 0, sweep: 0, grab: -1, lowGrab: -1, palm: 1, trap: 1, tpeng: -1, tkick: 0, tlow: -1 },
  sweep:  { jab: -1, lowJab: -1, heavy: 1, kick: 0, sweep: 0, grab: 1, lowGrab: -1, palm: 1, trap: 1, tpeng: 1, tkick: 0, tlow: 1 },
  grab:   { jab: -1, lowJab: -1, heavy: 1, kick: 1, sweep: -1, grab: 0, lowGrab: 0, palm: 1, trap: 0, tpeng: 1, tkick: 1, tlow: -1 },
  lowGrab: { jab: -1, lowJab: -1, heavy: 0, kick: 1, sweep: 1, grab: 0, lowGrab: 0, palm: 0, trap: -1, tpeng: -1, tkick: -1, tlow: 1 },
  palm:   { jab: -1, lowJab: -1, heavy: 0, kick: -1, sweep: -1, grab: -1, lowGrab: 0, palm: 0, trap: -1, tpeng: -1, tkick: -1, tlow: -1 },
  // 3.0 太极拳自己起手：有掤的慢招（揽雀尾、搬拦捶、玉女穿梭、倒卷肱）—— 他打手上的招、中段上段的腿进来被化；怕擒拿、下段、抄腿以外的蹲低
  't:peng':  { jab: 1, lowJab: -1, heavy: 1, kick: 1, sweep: -1, grab: -1, lowGrab: 1, palm: 1, trap: -1, tpeng: 0, tkick: 1, tlow: -1 },
  't:kick':  { jab: -1, lowJab: -1, heavy: 1, kick: 0, sweep: 0, grab: -1, lowGrab: 1, palm: 1, trap: 1, tpeng: -1, tkick: 0, tlow: 0 },
  't:low':   { jab: 1, lowJab: 0, heavy: 1, kick: 1, sweep: 0, grab: 1, lowGrab: -1, palm: 1, trap: 1, tpeng: 1, tkick: 1, tlow: 0 },
  't:sweep': { jab: -1, lowJab: -1, heavy: 1, kick: 0, sweep: 0, grab: 1, lowGrab: -1, palm: 1, trap: 1, tpeng: 1, tkick: 0, tlow: 0 },
  // 咏春拳起手：冲拳、标指（插在他出手的胳膊上 = 挑开进搭手：手上的招都怕它）、低掌、正撑脚、截脚（截地上的腿）、寸拳（霸体吃一拳）、拉手、截腿
  // 3.0 咏春拳打太极拳的掤：连环冲拳第三拳破掤（+1）、寸拳破得开（pierce），标指、正撑脚打进去被化
  'w:jab':     { jab: 0, lowJab: 0, heavy: -1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: -1, tpeng: 1, tkick: 1, tlow: -1 },
  'w:biu':     { jab: 1, lowJab: 0, heavy: 1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: -1, tpeng: -1, tkick: 1, tlow: -1 },
  'w:lowJab':  { jab: 0, lowJab: 0, heavy: -1, kick: 1, sweep: 1, grab: 1, lowGrab: 1, palm: 1, trap: 1, tpeng: 1, tkick: 1, tlow: 1 },
  'w:kick':    { jab: -1, lowJab: -1, heavy: 1, kick: 0, sweep: 0, grab: -1, lowGrab: -1, palm: 1, trap: 1, tpeng: -1, tkick: 0, tlow: -1 },
  'w:lowKick': { jab: -1, lowJab: -1, heavy: 1, kick: 1, sweep: 1, grab: 0, lowGrab: -1, palm: 1, trap: 1, tpeng: 1, tkick: 1, tlow: 1 },
  'w:heavy':   { jab: 1, lowJab: 1, heavy: 0, kick: -1, sweep: -1, grab: -1, lowGrab: -1, palm: 0, trap: -1, tpeng: 1, tkick: -1, tlow: 0 },
  'w:trap':    { jab: 1, lowJab: -1, heavy: 1, kick: -1, sweep: -1, grab: 0, lowGrab: 0, palm: 1, trap: 0, tpeng: 1, tkick: -1, tlow: -1 },
  'w:lowGrab': { jab: -1, lowJab: -1, heavy: 0, kick: 1, sweep: 1, grab: 0, lowGrab: 0, palm: 0, trap: -1, tpeng: -1, tkick: -1, tlow: 1 },
};
const TJ_INTO_PENG = new Set(['jab', 'heavy', 'kick', 'f:jab', 'f:heavy', 'b:heavy', 'd:heavy']);   // 打太极拳：往它的掤里打的那几手（被化掉）
const TJ_OPEN = { jab: 't:peng', 'H:jab': 't:peng', heavy: 't:peng', 'H:heavy': 't:peng', 'f:jab': 't:peng', 'b:jab': 't:peng',
  kick: 't:kick', 'H:kick': 't:kick', 'f:kick': 't:kick', 'd:jab': 't:low', 'd:kick': 't:sweep', 'd:heavy': 'palm', grab: 'grab', 'd:grab': 'lowGrab' };
const W_OPEN = { jab: 'w:jab', 'f:jab': 'w:biu', 'd:jab': 'w:lowJab', kick: 'w:kick', 'd:kick': 'w:lowKick', heavy: 'w:heavy', 'H:heavy': 'w:heavy',
  'f:heavy': 'w:heavy', 'b:heavy': 'w:heavy', 'd:heavy': 'w:heavy', grab: 'w:trap', 'd:grab': 'w:lowGrab' };
const HAND_LIMB = /^(fh|bh|fe|be|sh)$/;
const OPEN_OF = a => a.startsWith('d:') ? DOWN_OF[a.slice(2)] : a;      // 计划里的第一下是哪一招

/* ============================================================
   拳派：电脑用的是哪一派、对面是哪一派。
   · 电脑自己的招都按自己这一派查（this.MV、按键 → 中立时出的那一招 mvOf）；对面的招按对面那一派查（o.moves）。
   · 每一派的打法（连招计划、反打、压起身、挡住以后罚哪一套、接腿……）写在 KITS 里；
     2.10 咏春拳：连环冲拳按拍子一串打到底、黐手黏住进搭手、拍手拍开手上的招、耕手耕开腿、拉手拉住打过来的手、搭手里翻手型打人、拉手跪马。
   · 格斗术的电脑打咏春拳：被他刚起手的两三下打中，一直按着挡（那一点空里挡下来）；他按着挡（黐手）就抓、打下段
   ============================================================ */
// 按键 → 这一派中立时出的那一招（'d:jab' = 蹲着按；咏春拳的 'f:jab' 这种带方向的直接查表：算的时候方向还没按下去）
const W_KEY = { 'f:jab': 'wBiu', 'f:heavy': 'wPai', 'b:heavy': 'wGwai', 'H:heavy': 'wCun' };
const neutralMove = (F, a) => F.style === 'wc' && W_KEY[a] ? W_KEY[a] : F.style === 'taiji' && TJ_KEY[a] ? TJ_KEY[a] : styleOf(F).variant(kindOf(a), [], false, a.startsWith('d:') ? 'down' : '');
// 咏春拳的连招计划（按键串）：拳一直按 = 连环冲拳（按拍子，第 8 下是寸拳收势）；连环拳里按重 = 寸拳收势、按踢 = 侧撑脚 → 连环撑 → 踩膝、按拿 = 拉手扣住手腕
const J8 = ['jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab', 'jab'];
const Jn = n => J8.slice(0, n);
// 咏春拳的电脑看穿招、化招的机会打个折：咏春拳化开一招就是一整套（拍开、黏住进搭手），同一档难度两派要差不多强（电脑对电脑量出来的）
const W_READ = { novice: 1, easy: 1, normal: 1, hard: 1, hell: 1 };   // 2.11 接招要按对键、卡准时候，不再白给一整套，不用再打折（留着调）
const wcReadMul = L => W_READ[L.id] || 1;
// 咏春拳的电脑举手挡的机会打不打折（2.10 挡住就黏住是一整套，打过折；2.11 点一下挡就是普通挡，不折了，留着调）
const W_GUARD = { novice: 1, easy: 1, normal: 1, hard: 1, hell: 1 };
const wcGuardMul = L => W_GUARD[L.id] || 1;
// 两派电脑对打调平用的几个数（电脑对电脑量出来的；改了重新量，见 NOTES「量难度」）
const AI_TUNE = {
  wcStop: [0.1, 0.3],       // 咏春拳的连环冲拳被挡住：停手的机会（普通、聪明的）
  wcStopGrab: 0.25,         // 被挡住以后改拉手扣他的机会
  escK: 0.6, escB: 0.05,    // 打咏春拳：被连环冲拳刚起手打中，一直按着挡的机会 = 挡的本事 × escK + escB
  ctrW: [0.05, 0.4],        // 被黏住时打算反拿的分量 = a + b × 搭手的本事
  wcLow: 0.1, wcGrabBlk: 0.2,   // 咏春拳对着站挡的人：打下段、拉手的机会（格斗术是 0.05、0.12）
  vsWcGrab: 0.14,           // 格斗术对着听劲的人（咏春拳站着按住挡）：抓的机会（接不住擒拿，比抓普通挡的人多一点）
  vsWcLow: 0.12,            // 2.11 对着听劲的人打下段的机会（站着接不住下段；格斗术对一般挡着的人是 0.05）
  bait: 0.06,               // 2.11 骗接：他听劲的时候在拳够不着的地方空挥一拳（看他会不会接、接了打他收手），× 读招的本事
  // 2.12（NOTES 待做里的「咏春拳的电脑再往一半靠：多听劲、少主动起手」）：越高的档越像咏春拳该有的打法 —— 贴身先按住挡听劲（他出手就接），
  //   中立起手的一串少一点（上面的档打满级格斗术，中立一串多半被挡住、卸力，赚的是接住以后那一套）
  wcListen: { novice: 0, easy: 0, normal: 0.004, hard: 0.008, hell: 0.012, max: 0.022 },   // 3.1 中间三档多听一点（中等 0.003 → 0.004、困难 0.006 → 0.008、终极 0.008 → 0.012：咏春的中间三档对格斗术只有 44～45%）   // 每帧按住挡听劲的机会（听 14～30 帧）；终极留着给真人打（木头玩家还得打掉两成）
  wcOpen: { novice: 1, easy: 1, normal: 1, hard: 0.9, hell: 0.8, max: 0.6 },              // 中立起手一串的机会打折
};
// 搭手、甩手直冲以后接着按拍子连几下（难度越高连得越长）
const W_AFTER = { novice: 3, easy: 3, normal: 3, hard: 5, hell: 5, max: 6 };
// 连环冲拳每一拳接不接下去（一串八拳，接下去的机会 ^7 是打满的机会；入门、简单的拍子按不准，常常自己断）
const W_CHAIN = { novice: 0.92, easy: 0.92, normal: 0.91, hard: 0.955, hell: 0.93, max: 0.97 };   // 3.1.1 终极 0.9 → 0.93：上面终极整个松了，咏春拳的终极松得比困难多（排反了），一串多连一点拉回来   // 2.12 终极 0.93 → 0.9：一串别老打满（满级打满、顺到 8 级，那是观战看的）
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
WPLANS.max = WPLANS.hell;   // 2.12 满级（观战）用终极的连招表
/* ============================================================
   3.0 太极拳的电脑（TAIJI.md）：慢而强 —— 招都慢，不靠抢快：先出一招，他打进我的前摇里（掤：化掉、劲 +1），蓄着等他走进来、
   等他收招再发（借力打力）；他打过来按住挡、打到之前按后 = 捋（引进落空，他背对着失衡）。看见他要抓、打下段就别蓄。
   计划里 'H:jab' / 'H:heavy' / 'H:kick' = 按住蓄（蓄多久见 tjHoldFrames，什么时候松开见 tjKeepCharge）
   ============================================================ */
const TJ_KEY = { 'f:jab': 'tjChuan', 'b:jab': 'tjDao', 'f:kick': 'tjFen' };   // 带方向的起手（前 + 拳 玉女穿梭、后 + 拳 倒卷肱、前 + 踢 分脚）
const TPLANS = {
  novice: [[['jab'], 3], [['heavy'], 2], [['kick'], 2], [['jab', 'jab'], 2], [['jab', 'heavy'], 1], [['grab'], 1], [['d:jab'], 1], [['H:jab'], 1], [['f:jab'], 0.6]],
  easy: [[['jab', 'jab'], 2], [['jab', 'heavy'], 2], [['heavy', 'heavy'], 2], [['kick', 'kick'], 1.5], [['H:jab', 'jab'], 1.5], [['H:heavy'], 1], [['grab'], 1.2],
    [['d:jab', 'jab'], 1], [['f:jab', 'jab'], 1], [['d:kick'], 0.5], [['jab', 'jab', 'jab'], 1]],
  normal: [[['jab', 'jab', 'jab'], 2], [['jab', 'jab', 'heavy'], 2], [['jab', 'heavy'], 1.5], [['heavy', 'heavy'], 2.5], [['heavy', 'kick'], 1.5], [['kick', 'kick'], 1.5],
    [['kick', 'heavy'], 1], [['H:jab', 'jab', 'jab'], 2], [['H:heavy', 'heavy'], 1.5], [['grab'], 1.5], [['d:jab', 'jab', 'heavy'], 1], [['f:jab', 'jab', 'jab'], 1.2],
    [['d:kick'], 0.6], [['b:jab'], 0.5], [T3a, 1.5], [T3b, 1], [T4b, 0.8], [T4c, 0.6]],
  hard: [[['jab', 'jab', 'jab'], 1.5], [['jab', 'jab', 'heavy'], 2], [['heavy', 'heavy'], 2], [['heavy', 'kick'], 1], [['kick', 'kick'], 1], [['kick', 'heavy'], 1],
    [['H:jab', 'jab', 'jab'], 2.5], [['H:heavy', 'heavy'], 2], [['H:kick', 'kick'], 0.8], [['grab'], 2], [['d:jab', 'jab', 'heavy'], 1.2], [['f:jab', 'jab', 'heavy'], 1.2],
    [['d:kick'], 0.6], [['b:jab'], 0.5], [T3a, 2], [T3b, 1.5], [T4a, 1.2], [T4b, 1.5], [T4c, 1.2], [T5a, 1], [T5b, 1]],
  hell: [[['jab', 'jab', 'jab'], 1], [['jab', 'jab', 'heavy'], 1.5], [['heavy', 'heavy'], 1.5], [['heavy', 'kick'], 1], [['kick', 'kick'], 0.8],
    [['H:jab', 'jab', 'jab'], 3], [['H:heavy', 'heavy'], 2.5], [['H:kick', 'kick'], 0.8], [['grab'], 2.2], [['d:jab', 'jab', 'heavy'], 1.2], [['f:jab', 'jab', 'heavy'], 1.5],
    [['d:kick'], 0.6], [['b:jab'], 0.5], [T3a, 2], [T4a, 1.5], [T4b, 2], [T4c, 1.5], [T5a, 2], [T5b, 2]],
};
TPLANS.max = TPLANS.hell;
// 太极拳的电脑调平用的几个数（电脑对电脑量出来的；改了重新量，见 NOTES「查平衡」3.0）
const TJ_AI = {
  hua: 0.6,       // 来得及的话先出一招等他打进来（掤）的机会 = 读招的本事 × hua（格斗术读招出克它的那一系是 × 1）
  pre: 0.15,      // 近身想先护着的时候（他在这儿爱先出手），改成先出一招按住蓄的机会（太极拳的「先护着」；多了常被跳进来、抓、打下段罚 —— 木头玩家量过 0 / 0.15 / 0.45，0.15 最难打）
  vsRead: 0.8,    // 打太极拳：看见他出有掤的招（蓄着也是）改抓、打下段、退开的机会 = 读招的本事 × vsRead
  vsCharge: 0.12, // 他蓄着（每一帧）：够得着就抓 / 打下段、够不着就退开等他发空的机会 × 读招的本事
};
const KITS = {
  trad: { id: 'trad', plans: PLANS, catchKey: 'grab', runHeavy: true, dashIn: ['jab', 'heavy', 'heavy', 'kick'],
    // 3.1 反打、罚、压起身也用长连招（R7、R6h……，见 PLANS 上面）：离得近才接得满
    parry: dist => (dist <= 82 ? pick([R7, R7b, R5a, R6, ['jab', 'jab', 'heavy']]) : dist <= 92 ? pick([R5b, ['jab', 'kick'], ['heavy', 'kick']]) : ['heavy', 'kick']).slice(),
    oki: smart => (smart ? pick([R7, R6, R5a, ['jab', 'jab', 'heavy']]) : pick([['jab', 'jab', 'heavy'], ['jab', 'kick'], ['jab', 'jab', 'jab', 'jab']])).slice(),
    stagger: dist => (dist <= 82 ? pick([R7, R5b, R6, ['jab', 'jab', 'heavy']]) : dist <= 92 ? pick([['jab', 'kick'], ['heavy', 'kick']]) : dist <= 116 ? ['heavy', 'kick'] : ['kick', 'kick']).slice(),
    // 挡住以后罚：[第一下, 整套, 大概多疼]（够得着、来得及的里挑最疼的）
    routes: [['kick', R8, 128], ['jab', R7, 115], ['heavy', R6h, 110], ['jab', R5b, 85], ['heavy', ['heavy', 'kick'], 36], ['jab', ['jab', 'jab', 'heavy'], 38], ['kick', ['kick', 'kick'], 30],
      ['jab', ['jab', 'heavy'], 26], ['d:kick', ['d:kick'], 8]] },
  wc: { id: 'wc', wc: true, plans: WPLANS, catchKey: 'd:grab', runHeavy: false, dashIn: ['jab', 'jab', 'kick'],
    // 反打（拍开、耕开以后）：连环冲拳打到底 / 冲拳接寸拳收势 / 拉手扣住手腕（进搭手，接拉手跪马）/ 连环撑
    parry: () => pick([J8, J8, ['jab', 'jab', 'jab', 'jab', 'heavy'], ['grab'], ['kick', 'kick', 'kick'], ['heavy', 'jab', 'jab', 'jab', 'jab']]).slice(),
    oki: () => pick([J8, ['jab', 'jab', 'jab', 'jab', 'heavy'], ['d:jab', 'jab', 'jab', 'jab', 'jab'], J8]).slice(),
    stagger: dist => (dist <= 84 ? pick([J8, ['jab', 'jab', 'jab', 'jab', 'heavy'], ['f:heavy']]) : pick([['f:jab', 'jab', 'jab', 'jab', 'jab'], ['kick', 'kick', 'kick']])).slice(),
    // 从手型里打出去以后接着按拍子连几下（搭手、甩手直冲以后）
    after: L => Jn(W_AFTER[L.id] || 4),
    routes: [['jab', J8, 44], ['jab', ['jab', 'jab', 'jab', 'jab', 'heavy'], 34], ['grab', ['grab'], 30], ['kick', ['kick', 'kick', 'kick'], 26],
      ['H:heavy', ['H:heavy'], 22], ['f:heavy', ['f:heavy'], 14], ['d:kick', ['d:kick', 'jab', 'jab', 'jab'], 18]] },
  // 3.0 太极拳：捋住了（他被牵过去、背对着失衡）—— 搬拦捶接双峰贯耳、揽雀尾接高探马穿掌、蓄一段的揽雀尾（劲 2 打倒）、蹬脚接转身蹬脚
  taiji: { id: 'taiji', tj: true, plans: TPLANS, catchKey: 'grab', runHeavy: false, dashIn: ['jab', 'grab', 'heavy'],
    // 3.1 捋住了、压起身、他踉跄：离得近就接长的（T5a、T4a……）
    parry: dist => (dist <= 82 ? pick([T5a, T4c, T4a, T5b, ['heavy', 'heavy']]) : dist <= 95 ? pick([T3a, ['heavy', 'heavy'], ['H:jab']]) : pick([['heavy', 'heavy'], ['kick', 'kick']])).slice(),
    oki: smart => (smart ? pick([T4b, T5b, T3b, ['jab', 'jab', 'heavy'], ['grab']]) : pick([['jab', 'jab'], ['heavy'], ['jab', 'heavy']])).slice(),
    stagger: dist => (dist <= 82 ? pick([T5a, T4a, T4c, ['jab', 'jab', 'heavy']]) : dist <= 100 ? pick([T3a, ['heavy', 'heavy'], ['jab', 'jab', 'jab']]) : pick([['f:jab', 'jab'], ['kick', 'kick']])).slice(),
    // 挡住以后罚：太极拳的招慢，多半只来得及采（擒拿 6 帧）；他收招长才打得到搬拦捶那一套
    routes: [['heavy', T5a, 87], ['heavy', T4a, 80], ['jab', T5b, 78], ['jab', T4b, 67], ['heavy', T3a, 57], ['jab', T3b, 51],
      ['heavy', ['heavy', 'heavy'], 38], ['jab', ['jab', 'jab', 'jab'], 32], ['kick', ['kick', 'kick'], 30], ['jab', ['jab', 'heavy'], 28], ['grab', ['grab'], 12]] },
};
// 咏春拳的招在「习惯」里归哪一类（拉手是新的一类：看见他老这么干，就知道该出腿、打下段）
Object.assign(OPENER, { wJab: 'jab', wBiu: 'jab', wLowPalm: 'lowJab', wCun: 'heavy', wPai: 'heavy', wGwai: 'heavy', wJum: 'lowJab', wKick: 'kick', wLowKick: 'lowKick' });
// 3.0 太极拳的招：有掤的慢招（tpeng）、腿（tkick，慢、没有掤）、下势（tlow，低、有掤）、跌岔算扫堂腿、金鸡独立算对空
Object.assign(OPENER, { tjLan: 'tpeng', tjChuan: 'tpeng', tjDao: 'tpeng', tjBan: 'tpeng', tjXia: 'tlow', tjJinJi: 'palm', tjDeng: 'tkick', tjFen: 'tkick', tjDieCha: 'sweep' });
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
      rev: 0, esc: 0,             // 2.10 咏春拳：搭手里翻手被他反拿了几次、连环冲拳刚起手被他按着挡挡住第三拳几次（都慢慢淡忘）
      tjRead: 0,                  // 3.0 太极拳：我的慢招被他卸力、闪身躲过了几次（慢慢淡忘）—— 多了就多蓄（蓄多久他不知道，卡不准）、多采
      jz: 0.002,                  // 3.1.1 他站在地上、跳得过来的时候每一帧起跳的机会（慢慢更新，时间常数三秒多）：起慢招之前看他会不会跳过来（slowOK）
      jr: 0.1 };                  // 3.1.1 我起慢招（前摇 15 帧以上）的时候他跳过来的机会（每起一次更新一次）
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
  // 连招按下去会出哪一招、够多远（格斗术照旧用 reachOf 那张表；咏春拳按现在这一串算：同一个键在连招里出的招不一样）
  rk(a) {
    if (!this.K.wc && !this.K.tj) return reachOf(a);
    const f = this.f, chain = f.chainIdle > CHAIN_WIN ? [] : f.chain, KM = this.K.wc ? W_KEY : TJ_KEY;
    const nm = !chain.length && KM[a] ? KM[a] : styleOf(f).variant(kindOf(a), chain, false, a.startsWith('d:') ? 'down' : ''), d = nm && this.MV[nm];
    return d && d.reach ? effRD(d) : 0;
  }
  vsRow(a) { return VS[this.K.wc ? W_OPEN[a] : this.K.tj ? TJ_OPEN[a] : OPEN_OF(a)]; }
  // 按一下（前缀见 kindOf 上面：d 蹲着、f 朝他按着方向、b 背着他、H 按住重蓄劲）
  pressKey(a) {
    const f = this.f, H = f.inp.held, p = prefixOf(a), tw = f.opp.x >= f.x ? 1 : -1;
    if (p) a = a.slice(2);
    if (p === 'd') H.down = true;
    else if (p === 'f' || p === 'b') { if ((p === 'f' ? tw : -tw) > 0) H.right = true; else H.left = true; }
    else if (p === 'H' && this.K.tj) { H[a] = true; this.chargeT = this.tjHoldFrames(); }      // 3.0 太极拳：按住蓄
    else if (p === 'H') { H.heavy = true; this.chargeT = WC_CHARGE + 6 - (Math.random() < 0.3 ? (Math.random() * 12 | 0) : 0); }
    f.inp.press(a, f.clock);
  }
  /* ---------- 3.0 太极拳 ---------- */
  // 按住蓄几帧（从按下去算）：走到蓄势那一刻（前摇的 TJ_HOLD_AT）再蓄几段。他在硬直里（捋了、闪通臂打中了）：蓄到他硬直完之前打得到为止
  tjHoldFrames() {
    const o = this.f.opp, L = this.L, J = this.mvOf('jab'), pre = Math.ceil(J.S * TJ_HOLD_AT) + 1;
    if (o.state === 'hit' && o.stunT > 0) {
      const room = o.stunT - J.S - 2;
      return room >= TJ_SEG ? pre + Math.min(TJ_CHARGE, Math.floor(room / TJ_SEG) * TJ_SEG) + 1 : 0;
    }
    const seg = weighted([[1, 3], [2, 1 + 2 * L.read], [3, 0.4 + L.read]]);
    return pre + seg * TJ_SEG + 1;
  }
  // 蓄着：接着按住吗（false = 松开发）。看得懂的（读招的本事）：化掉了一下就发（他在收招，借力打力）、他走进来 / 收招 / 挨着硬直就发
  tjKeepCharge(m, s, dist) {
    const L = this.L, R = Math.random;
    if (!m.charging) return true;                                     // 还没走到蓄势那一刻
    const reach = effRD(m.def) - 4;
    if ((m.hua || 0) > (this.tjHua || 0)) { this.tjHua = m.hua; if (dist <= reach + 12 && R() < 0.3 + 0.7 * L.read) return false; }
    if (dist <= reach && (s.phase === 'r' || s.stun || (this.appr || 0) > 0.8) && R() < 0.15 + 0.6 * L.read) return false;
    if (s.atk && (s.kind === 'grab' || s.height === 'low' || s.air) && dist <= reach + 20 && R() < L.read) return false;   // 他要抓 / 打下段 / 跳过来：别等了
    // 3.1.1 看见他起跳（蹲下要跳、已经离地）：蓄着不能挡、不能转身、不能取消，接着蓄就是等着挨他从天上打下来那一下 ——
    //   马上松开：早发早收招（来得及举手、出金鸡独立）；他刚离地、还不高的时候发出去还打得着他（Jack 3.1.0：一直坠山击、飞踢，太极拳的电脑打不过）
    if ((s.squat || s.air) && dist <= 260 && (this.smart || R() < 0.3 + 0.7 * L.read)) return false;
    return true;
  }
  // 看见他打过来（还没看穿的时候）：手上的招、中段上段的腿 —— 来得及就先出一招等他打进来（掤，太极拳的「读招」）。
  // 捋和格斗术的卸力一个本事、一样的机会：挡的时候正好快打到了才捋（tick 格挡那一段），看穿了的在 hellCounter
  tjReact(s, dist, eta, press) {
    const f = this.f, L = this.L, R = Math.random;
    if (s.kind === 'grab' || s.kind === 'push' || s.dive || s.tier === 'super' || s.air || s.height === 'low' || s.pierce || eta < 0) return false;
    if (eta >= TJ_PENG_FROM + 1 && dist <= this.eR('jab') + 24 && R() < L.read * TJ_AI.hua) { this.tjHua = 0; press(R() < 0.6 ? 'H:jab' : 'H:heavy'); return true; }
    return false;
  }
  // 捋：按住挡，他打到之前一两帧按后（手准不准看读招的本事；瞬间看穿的按到帧）
  luAt(eta, exact) {
    const f = this.f, amp = exact ? 0 : 1 + 2 * (1 - this.L.read);
    const w = Math.round(eta - 1.5 + (exact ? 0 : (Math.random() - 0.5) * 2 * amp));
    this.todo = { at: f.clock + Math.max(0, w), act: 'lu' };
    f.noParry = false; this.lowBlock = false; f.inp.held.block = true;
    return true;
  }
  // 打太极拳：看见他出有掤的招（打进去被化掉、白送他劲）—— 够得着就抓、打下段（掤化不了），够不着就挡住 / 退开等他发空
  vsPeng(s, dist, eta, press) {
    const f = this.f, L = this.L, R = Math.random;
    if (R() >= L.read * TJ_AI.vsRead) return false;
    const G = this.mvOf('grab'), LJ = this.mvOf('d:jab'), lowFirst = R() < L.tech * 0.6;   // 会挣脱的人多（自己会，就当他也会）：先打下段，抓了也被挣开
    if (!lowFirst && dist <= G.reach - 2 && (s.tjc || eta >= G.S + 1)) { press('grab'); return true; }
    if (LJ && dist <= effRD(LJ) - 4 && (s.tjc || eta >= LJ.S + 1)) { press('d:jab'); return true; }
    if (dist <= G.reach - 2 && (s.tjc || eta >= G.S + 1)) { press('grab'); return true; }
    if (R() < 0.45 && dist < s.reach + 16) { this.dashAway(); return true; }
    f.noParry = true; this.lowBlock = false; this.blockT = Math.max(10, s.tjc ? 24 : s.remain + 6); f.inp.held.block = true; return true;
  }
  // 他蓄着（每一帧想一次）：够得着就抓 / 打下段；在他射程边上就退开（他发空了打他收招）；远了就等着
  vsCharge(s, dist, press) {
    const f = this.f, L = this.L, R = Math.random;
    if (R() >= L.read * TJ_AI.vsCharge) return false;
    const G = this.mvOf('grab'), LJ = this.mvOf('d:jab');
    if (dist <= G.reach - 2) { press('grab'); return true; }
    if (LJ && dist <= effRD(LJ) - 4) { press('d:jab'); return true; }
    if (dist <= s.reach + 10) { if (R() < 0.6) this.dashAway(); else { f.noParry = true; this.lowBlock = false; this.blockT = 20; f.inp.held.block = true; } return true; }
    return false;
  }
  // 2.11 接招：按住挡，算好时机按键 —— 他这一下打到我的那一帧落在接招能接的那几帧中间（手准不准看 jieSd；极难「瞬间看穿」的那一下 exact 按到帧）；
  //   按哪个键看他出的是什么（拳接拳、重接重、拿接腿），按对的概率 jieAcc。下段的手上招接不住（交给蹲着挡）；下段的腿蹲着接（耕手）
  catchAt(s, eta, exact) {
    const f = this.f, L = this.L, R = Math.random, H = f.inp.held;
    const leg = s.kind === 'kick' || s.limb === 'ff' || s.limb === 'bf', low = s.height === 'low';
    if ((low && !leg) || s.dive || s.kind === 'grab' || s.kind === 'push' || s.tier === 'super') return false;
    // 3.1.1 跳起来的招：越过头顶、从身后打下来的接不住（接招的架势朝着按下去那一刻他在的那边，他飞过去以后是背后挨打，还 ×1.3）—— 交给挡（举着手会跟着转身）；
    //   接得住的按他真的够到我的那一帧算（空中招判定很长，常常出来了还要飞几帧才够得着）
    if (s.air) eta = this.airEta(s, eta, exact);
    const need = leg ? 'grab' : s.kind === 'heavy' ? 'heavy' : 'jab';
    const key = exact || R() < L.jieAcc ? need : wrongCatchKey(L, need);
    const win = key === 'jab' ? WC_CATCH_WIN : WC_CATCH_WIN_H;
    const pd = Math.round(eta + 1 - (win + 1) / 2 + (exact ? 0 : gauss() * L.jieSd));
    if (pd < -1) return false;                                          // 来不及了
    if (s.air && this.crosses(s, Math.max(0, pd), eta, exact)) return false;
    this.todo = { at: f.clock + Math.max(0, pd), act: 'catch', key, low: low && leg };
    f.noParry = true; this.lowBlock = low && leg; H.block = true; H.down = this.lowBlock;
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
  // 2.11 咏春拳的电脑看见他出招（还没看穿的时候）：手上的招 —— 偶尔拉手、标指，多是按住挡接（拍手 / 摊手 / 膀手转马）；
  //   地上的腿 —— 偶尔截腿、拳打单脚站着的，多是按住挡按拿接（按手）；下段的腿蹲着接（耕手）；跳起来的拳脚也接。
  //   接不接看 jie（看穿的本事打折 wcReadMul），没接的交给下面的挡
  wcReact(s, dist, eta, press) {
    const L = this.L, R = Math.random;
    if (s.kind === 'grab' || s.kind === 'push' || s.dive || s.tier === 'super' || eta < -1) return false;
    if (R() >= L.jie * wcReadMul(L)) return false;
    const hand = HAND_LIMB.test(s.limb || ''), leg = s.kind === 'kick' || s.limb === 'ff' || s.limb === 'bf', low = s.height === 'low';
    if (!s.air && hand && !low) {
      const r = R(), T = this.MV.grab, B = this.MV.wBiu;
      if (r < 0.14 && eta >= T.S + 2 && dist <= Math.max(T.reach, s.reach) + 4) return this.trapAt(eta);
      if (r < 0.24 && eta >= B.S + 1 && dist <= effRD(B)) return this.biuAt(eta);
    }
    if (leg && !s.air && !low) {
      const r = R(), LG = this.MV.lowGrab;
      if (r < 0.12 && eta >= LG.S + 1 && dist <= s.reach + 6) { press('d:grab'); return true; }
      if (r < 0.22 && dist <= this.eR('jab') - 4 && eta >= this.mvOf('jab').S) { press('jab'); return true; }
    }
    return this.catchAt(s, eta, false);
  }
  // 对面是咏春拳：手上的招会被拍开、拉住、黏住，腿（和下段）会被耕开、截住、黏住的风险 —— 一开始就知道一点，被化开得越多越小心
  // 3.0 对面是太极拳也一样（手上的招、腿打过去会被捋）
  handRisk() { const o = this.f.opp.style; return o === 'wc' || o === 'taiji' ? Math.min(0.85, 0.15 + 0.35 * this.memo.ctr.hand * this.L.habit) : 0; }
  legRisk() { const o = this.f.opp.style; return o === 'wc' || o === 'taiji' ? Math.min(0.85, 0.15 + 0.35 * this.memo.ctr.leg * this.L.habit) : 0; }
  // 咏春拳的电脑贴身先按着挡听劲（等他打过来接）的机会：他多是打（拳、掌、腿）就多听；他爱抓、爱打下段就少听（接不住擒拿和下段的手上招）
  chiChance(dist) {
    const bad = ['grab', 'lowJab', 'sweep', 'lowGrab', 'lowKick'].reduce((a, k) => a + this.habitShare(k, dist), 0);
    return clamp(0.55 - 1.2 * bad * this.L.habit, 0.1, 0.65);
  }

  /* ---------- 2.10 咏春拳：拍子、搭手、黐手破连 ---------- */
  // 一串按拍子（拳接拳、拳接踢、踢接拳）：算出下一拍的拍点（和 wingchun.js 的 wcRhythm 一个算法），在拍点上按（离拍点差多少看 beatSd）。
  // 每一下想一次接不接（一串很长，每一下接下去的机会高一点）；被挡住了，聪明的停手（挡住了顺就断了）或者收完招拉手扣他
  beatPress(m, dist, press) {
    const f = this.f, L = this.L, R = Math.random, kk = kindOf(this.plan[0]);
    if (m.qn) return;                                                   // 下一下已经排上了
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
    // 3.1.1 打空了、他已经走出下一拳的射程（或者看见他跳起来了）：停手。以前一串八拳照拍子打到底，对着跳开 / 走开的人打一长串空拳，
    //   人在收招里站着（他跳过来就是白挨一整套）
    if (!m.hit && !m.blocked && !m.absorbed) {
      const h = f.opp.history, so = h[Math.max(0, h.length - 1 - L.react)];
      if (dist > this.rk(this.plan[0]) + 8 || (so && (so.air || so.squat))) { this.plan = []; return; }
    }
    if (m.t >= wcBeatAt(f, m, kk) - 1 + this.beatJit) press(this.plan.shift());
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
    // 翻几下：懂行的翻得多（每翻一下顺涨一级，打得更疼、更难跑），他会反拿就少翻（格斗术的人在你翻手那一拍里抽手反抓）
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
      this.fAt = f.clock + (om.grace || WC_TOUCH_GRACE) + 1 + this.feelDelay() + (R() * 8 | 0);   // 2.11 被接住进来的头几帧按不了（om.grace）
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
  // 2.11 挨打、被挡住的硬直里接（新的黐手破连）：按住挡，他下一下打过来之前几帧按键（拳接拳、重接重、拿接腿）——
  //   他每出一招想一次试不试（brk）、键按对没有（brkAcc）；手上一直搭着，看他的招用不着反应（按他现在出的是什么、还有几帧打到）。
  //   顺三级以上的连环冲拳太快、下段的手上招接不住，不试；按错了那一下挨得更疼
  wcBreak(o, go) {
    const f = this.f, L = this.L, R = Math.random, H = f.inp.held, om = o.move;
    if (f.grabbed || f.stuck || f.airborne || f.reel || f.stagger || o.state !== 'attack' || !om || om.def.script) return false;
    if (this.brkFor !== om.serial) {
      this.brkFor = om.serial; this.brkKey = null;
      const d = om.def, leg = d.kind === 'kick' || d.limb === 'ff' || d.limb === 'bf', low = d.height === 'low';
      const need = d.dive || d.flurry || d.tier === 'super' || (d.beat && (o.flow || 0) >= 3) || om.air ? null : leg ? 'grab' : low ? null : d.kind === 'heavy' ? 'heavy' : d.kind === 'jab' ? 'jab' : null;
      if (need && R() < L.brk * wcReadMul(L)) {
        this.brkKey = R() < L.brkAcc ? need : wrongCatchKey(L, need);
        this.brkLow = leg && low;
        this.brkAt = f.clock + Math.max(0, Math.round(om.S + 1 - om.t - 2 + gauss() * L.jieSd * 0.6));
      }
    }
    if (!this.brkKey) return false;
    H.block = true; if (this.brkLow) H.down = true;
    if (f.clock >= this.brkAt) { f.inp.press(this.brkKey, f.clock); this.brkKey = null; }
    return true;
  }
  // 闪身：按着挡、朝对手双击（三帧：按 → 松 → 按）。挡住的硬直里也要按完，所以不和 seq 共用（seq 挨打时会清掉）
  slipIn() { this.slipSeq = [1, 0, 1]; }
  dashAway() { this.seq = [{ back: 1 }, {}, { back: 1 }]; }
  dashIn() { this.seq = [{ fwd: 1 }, {}, { fwd: 1 }]; }
  tick(locked) {
    const f = this.f, o = f.opp, L = this.L, H = f.inp.held;
    if (game.freeze > 0 && !locked) return;     // 打中停顿时不动手（以前停顿里每帧都按，按键攒了一堆）
    H.left = H.right = H.up = H.down = H.block = H.heavy = H.jab = H.kick = false;
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
    // 3.1.1 起身那几帧动不了：他跳过来压起身、想好的接法是挡 / 等 / 退、他近了（来不及看见再挡）—— 先按着挡，站起来那一帧就是挡着的
    //   （以前起身这几帧什么都不按，站起来那一帧才开始想，压起身的空中招回回打在站起来的头一两帧上）
    if (f.state === 'rise') {
      const A = this.aa;
      if (A && (A.plan === 'block' || this.airThreat(sj, lagJ) || (sj.atk && sj.air))) {
        if (A.plan === 'palm') A.plan = 'block';                     // 想好的是托天掌：站起来那一帧再按已经晚了（空中招早到了），改挡
        f.noParry = true; this.lowBlock = false; H.block = true;
      }
      return;
    }
    // 算好时机的那一下（卸力要卡在打到前几帧按下去；闪身要卡在他出手前钻）。挨打了、自己在出招就作废
    if (this.todo) {
      if (f.state === 'hit' || f.state === 'attack' || f.airborne) this.todo = null;
      else if (f.clock >= this.todo.at) {
        const t = this.todo; this.todo = null;
        if (t.act === 'slip') { this.slipIn(); H.block = true; return; }
        if (t.act === 'parry') { f.noParry = false; this.lowBlock = t.low; this.blockT = 14; H.block = true; H.down = t.low; return; }
        if (t.act === 'press') { press(t.key); return; }
        if (t.act === 'catch') { f.noParry = true; H.block = true; H.down = t.low; this.lowBlock = t.low; f.inp.press(t.key, f.clock); this.blockT = 0; return; }   // 2.11 接招：按住挡再按键
        if (t.act === 'lu') { f.noParry = false; this.lowBlock = false; this.blockT = 10; H.block = true; go(-1); return; }   // 3.0 捋：按着挡、按一下后
      } else {
        if (this.todo.act === 'slip' || this.todo.act === 'catch' || this.todo.act === 'lu') { H.block = true; H.down = !!this.todo.low; }   // 等着闪、等着接、等着捋：先按着挡
        return;                                                    // 等着卸力：先别按挡（要刚按下去那几帧才卸得掉）
      }
    }
    // 挨打 / 格挡硬直：爆气挣脱、推挡；1.8.0：蹲挡住扫堂腿踩腿、挡住后截击
    if (f.state === 'hit' || f.state === 'blockstun') {
      this.guardT = 0;
      if (f.state === 'hit' && f.qi >= QI_BURST && !f.grabbed && f.comboTaken >= 2 && R() < L.burst * 0.08) { pair(); return; }   // 2.1 爆气只在挨打时能用
      // 2.11 咏春拳挨打、被挡住：接他下一下（按住挡 + 键，新的黐手破连）
      if (this.K.wc && this.wcBreak(o, go)) return;
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
          // 挡住后截击（格斗术；咏春拳没有这一下）
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
      if (d.tjCharge && this.chargeT > 0) { if (this.tjKeepCharge(m, s, dist)) { this.chargeT--; H[m.press] = true; } else this.chargeT = 0; }   // 3.0 太极拳蓄着
      // 擒住了：挑一种后续（背靠墙多用过肩摔把人换到墙边）
      if (m.name === 'hold' && m.holdKind === 'grab' && !m.pick && this.holdFor !== m.serial) {
        this.holdFor = m.serial;
        const cornered = f.x - toward * 120 < WALL_L || f.x - toward * 120 > WALL_R;
        const k = weighted(cornered ? [['heavy', 6], ['jab', 2], ['kick', 1]] : [['jab', 3], ['kick', 3], ['heavy', 3], ['none', 1]]);
        if (k !== 'none') f.inp.press(k, f.clock);
        return;
      }
      if (!this.plan.length) return;
      // 咏春拳的一串：拳、踢都按拍子接（一串里随时按得下去，按不准就是抢拍、过拍；2.10.1 踢也一样）
      if (this.K.wc && (d.beat || d.link) && (kindOf(this.plan[0]) === 'jab' || kindOf(this.plan[0]) === 'kick')) {
        // 3.1 咏春拳的一串（连环冲拳八下）：打到第四下以后想一想要不要连满（L.longW；不连满就在第 4～6 下收手。满级回回连满）
        if (L.longW < 1 && f.chain.length >= 4) {
          const key = f.serial - f.chain.length;
          if (this.longFor !== key) { this.longFor = key; this.longGo = R() < L.longW; this.longStop = 4 + ((R() * 3) | 0); }
          if (!this.longGo && f.chain.length >= this.longStop) { this.plan = []; return; }
        }
        this.beatPress(m, dist, press); return;
      }
      if (f.canCancel(kindOf(this.plan[0]))) {
        // 3.1 长连招（五下以上）：这一串打到第三、四下的时候想一想要不要接满（L.long；不接满就收手 —— 人也常常这样，满级才回回接满）
        if (!this.K.wc && f.chain.length >= 3 && f.chain.length + this.plan.length >= 5) {
          const key = f.serial - f.chain.length;                    // 这一串第一招的编号（一串里每接一招编号 +1）
          if (this.longFor !== key) { this.longFor = key; this.longGo = R() < L.long; this.longStop = 3 + (R() < 0.5 ? 1 : 0); }
          if (!this.longGo && f.chain.length >= this.longStop) { this.plan = []; return; }
        }
        // 咏春拳一串很长，每一下接下去的机会高一点
        if (R() < (this.K.wc ? 1 - (1 - L.combo) * (L.combo < 0.8 ? 0.15 : 0.3) : L.combo)) press(this.plan.shift()); else this.plan = [];
      }
      return;
    }
    if (this.wasBlocked) { this.wasBlocked = false; this.pressTurn = f.clock; }   // 我的招被挡住、收完了：轮到「挡完以后」那一手
    // 卸力成功：趁对方失衡反打，或者借力摔
    if (f.state === 'parry') {
      if (!this.K.wc && !this.K.tj && dist <= 110 && R() < 0.3) { f.inp.press('grab', f.clock); return; }   // 3.0 太极拳捋了以后打（他背对着、挡不了）
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
      // 3.0 太极拳的拳太慢，迎不上坠山：站着挡（挡得住，他往后翻回去）
      //   （3.1.1 试过看见坠山往后冲刺躲：冲刺要按三帧、冲出去背对着他，回回被踩在背上，比挡还亏）
      if (this.K.tj) { this.antiDive = false; f.noParry = true; this.lowBlock = false; this.blockT = 30; H.block = true; return; }
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
      const om = o.move, aimed = o.facingTo(f) || (om.air && this.comingAt({ facing: o.facing, air: true, x: o.x, vx: o.vx, sLeft: om.S - om.t }, toward));   // 3.1.1 越过头顶打下来的空中招也算
      if (aimed && R() < this.instChance(om, dist) && this.instCounter(o, dist, press)) { this.lastSeen = om.serial; return; }
    }
    // 极难：冲刺也一样 —— 看穿了就按他冲完爱干什么接（挡 / 蹲 / 等他冲完出拳）
    if (L.inst && o.move && o.move.name === 'dash' && o.move.serial !== this.instFor && f.actionable()) {
      this.instFor = o.move.serial;
      if (o.facing === (f.x >= o.x ? 1 : -1) && dist <= 300 && R() < this.instChance(o.move, dist)) {
        const D = this.memo.dash, top = D.grab > D.strike && D.grab > D.none ? 'duck' : D.none > D.strike ? 'jab' : 'block';
        this.rushArmed = false; this.rush = { kind: 'dash', t: 0, plan: top, now: true };
      }
    }
    // 2.11 咏春拳按着挡听劲（等着接）：看见他出招就接 —— 接不接、按对键没有、时机准不准看难度（没接的照样挡着）
    if (this.K.wc && f.state === 'block' && s.atk && s.serial !== this.lastSeen && this.comingAt(s, toward) && dist <= s.reach + 26 + (s.air ? Math.abs(s.vx) * (L.react + 4) : 0)) {
      this.lastSeen = s.serial;
      if (this.wcReact(s, dist, s.sLeft - L.react, press)) return;
      // 3.1.1 没接（不想接、接不住、他要越过头顶）：照样按着挡到这一招打完（挡不挡得住和下面「看见出招 → 挡」一样掷）。以前这一招已经「看过了」，
      //   下面看见出招那一段不再管它，挡着的时间一到就松手 —— 听劲听到了反而白挨
      const hb = this.habitShare(openerOf(o, s.name), dist) * L.habit * 0.5;
      if (s.kind !== 'grab' && s.kind !== 'push' && Math.random() < Math.min(0.98, (s.air ? Math.max(L.block, L.airBlock * 0.9) : L.block) + hb)) {
        if (s.air || s.height === 'high') this.lowBlock = false; else if (s.height === 'low') this.lowBlock = true;
        f.noParry = true; this.blockT = Math.max(this.blockT, s.remain + 6);
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
    // 3.1.1 看见的他离我多远：照看见的他走过来的速度往前推 react 帧（不比真的近）。他起跳、冲刺扑过来的那几帧我还看不见，
    //   地上的拳、腿、擒拿别照真的距离出 —— 以前真的距离进了射程就出、看见的他还站在地上，回回从跳过来的人脚底下打空，落地被打一整套
    const sdist = Math.max(dist, Math.abs(s.x - f.x) - Math.max(0, appr) * L.react);
    // 连招没打中：短时间内继续按完（他跳起来了就算了）
    if (this.plan.length) {
      if (!oppUp && f.chainIdle < 6 && dist <= this.rk(this.plan[0]) && this.slowOK(this.plan[0])) { press(this.plan.shift()); return; }
      if (f.chainIdle >= 6 || oppUp) this.plan = [];
    }
    // 看到对手出招（只管朝着我来的）。2.1：空中招朝我飞过来，按他飞过来的速度多算一截（以前离得稍远就当没看见，等看见已经挨上了）
    const reachIn = s.name === 'dive' ? 230 : s.reach + 26 + (s.air ? Math.abs(s.vx) * (L.react + 4) : 0);
    if (s.atk && s.serial !== this.lastSeen && dist <= reachIn && this.comingAt(s, toward)) {
      this.lastSeen = s.serial;
      const eta = s.sLeft - L.react;          // 大约还有几帧打到
      // 难 / 极难：看穿了就挑最赚的破法（没看穿就往下走普通的反应）
      if (this.smart && R() < this.seeChance(s, dist) && this.hellCounter(s, dist, eta, press)) return;
      // 3.0 打太极拳：他出的是有掤的招（打进去被化掉）—— 改抓、打下段、退开
      if (o.style === 'taiji' && !this.K.tj && s.tjp && this.vsPeng(s, dist, eta, press)) return;
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
      // 空中招：接得住就对空（托天掌 / 金鸡独立：对空无敌，打下来倒地）—— 3.1.1 按「出手那几帧他飞到哪」算（aaCatch），以前那条时机几乎从来不成立；
      // 飞踢：蹲下躲；或者地上出腿迎上去，把它顶得翻滚回去（3.1.1 来得及才起腿：kickMeets）
      if (!this.K.wc && s.tier === 'air' && this.aaCatch(s, L.react, eta) && R() < L.aa) { press('d:heavy'); return; }
      if (s.name === 'airKick' && dist >= 110 && this.kickMeets(eta) && R() < L.aa * 0.35) { press('kick'); return; }
      if (s.name === 'airKick' && R() < L.duck) { this.duckT = Math.max(12, s.remain + 8); H.down = true; return; }
      // 2.0.2 重拳：闪身钻过去（躲过了自动回身肘）
      if (slipable(o.moves[s.name]) && eta >= 1 && eta <= 7 && R() < L.slip) { this.slipIn(); H.block = true; return; }
      // 2.10 咏春拳：拍手、耕手、拉手、标指、黐手接（读招的那一下）
      if (this.K.wc && this.wcReact(s, dist, eta, press)) return;
      // 3.0 太极拳：捋、先出一招等他打进来（掤）
      if (this.K.tj && this.tjReact(s, dist, eta, press)) return;
      // 读招：出克制它主系的那一系。来得及才出（实测：重拳霸体吃拳要还剩 2 帧、腿化解重拳要还剩 8 帧、拳打出腿要还剩 3 帧），来不及白挨
      // （太极拳的招太慢，读招来不及：它的「读招」是上面的掤）
      if (!this.K.wc && !this.K.tj && eta >= 2 && R() < L.read) {
        const ans = s.tier === 'light' ? (s.pierce || R() < this.handRisk() ? null : 'heavy') : s.tier === 'heavy' ? (eta >= 8 && R() >= this.legRisk() ? 'kick' : null) : s.tier === 'kick' && dist <= 96 && eta >= 3 ? 'jab' : null;
        if (ans && dist <= reachOf(ans) + 10) { press(ans); return; }
      }
      // 2.1 空中招：要站着挡（都是上段）—— 以前按「高低判断」一半时间蹲着挡；你在这个距离老出这一招，它挡得更多
      const hb = this.habitShare(openerOf(o, s.name), dist) * L.habit * 0.5;
      if (s.kind !== 'grab' && s.kind !== 'push' && R() < Math.min(0.98, (s.air ? Math.max(L.block, L.airBlock * 0.9) : L.block) + hb) * (this.K.wc && !s.air ? wcGuardMul(L) : 1)) {
        const tryParry = eta >= 0 && eta <= PARRY_WIN - 2 && R() < L.parry;
        // 3.0 太极拳没有卸力，同一个机会是捋（手上的招、中段上段的腿；按住挡，打到之前按后）
        if (this.K.tj && tryParry && !s.air && s.height !== 'low' && s.kind !== 'grab' && s.kind !== 'push' && f.clock + Math.max(0, eta - 2) - f.luPress >= TJ_LU_LOCK) return this.luAt(eta, false);
        f.noParry = !tryParry;
        this.lowBlock = s.air ? R() > L.airBlock : s.height === 'low' ? R() < L.lowRead : s.height === 'high' ? R() > L.lowRead : R() < 0.3;
        this.blockT = Math.max(8, s.remain + 6); H.block = true; H.down = this.lowBlock;
        if (!s.air && R() < L.gwalk * 0.3) this.gwalkT = 10 + (R() * 16 | 0);
        return;
      }
      if (s.kind === 'grab' && R() < L.block * 0.6) { if (R() < L.step) this.dashAway(); return; }
    }
    // 3.0 他（太极拳）蓄着：够得着就抓、打下段，他射程边上就退开等他发空；别往掤里打（下面的主动进攻也先别出）
    if (o.style === 'taiji' && s.tjc && oppFacesMe && f.actionable()) { if (this.vsCharge(s, dist, press)) return; if (dist <= s.reach + 30 && R() < L.read) return; }
    // 2.1 看见他冲刺 / 跑过来：按他冲完、跑到跟前爱干什么，先挡 / 蹲 / 腿迎 / 等他冲完打他收招
    if (this.watchRush(s, dist, toward, oppFacesMe, press, oppUp)) return;
    // 难 / 极难：主动 —— 罚打空的招、落地硬直，按对手挡完以后的习惯出手，对着挡的人上下段擒拿换着来
    if (this.smart && this.hellOffense(s, dist, press)) return;
    // 2.1 记习惯（所有难度）：他在这个距离老出同一招，提前防 / 提前出克它的招
    if (this.habitGuard(s, dist, press)) return;
    // 对手背对我：趁机打背后
    // （他是跑开了才背对我的话，够不着就别打：打空了白给）
    if (!s.down && !s.atk && !oppUp && !oppFacesMe && sdist <= 110 && R() < L.aggr * 0.2) {
      const p = this.pickPlan(dist), d0 = this.mvOf(p[0]);
      if (d0 && sdist + Math.max(0, -appr) * (d0.S + 1) <= effRD(d0) - 6 && this.slowOK(p[0])) { this.plan = p; press(this.plan.shift()); return; }
    }
    // 2.11 咏春拳按住挡接招没接着（按早了、被骗出来的）：他正在收手 —— 这时候打他 ×1.3（WC_WRONG_MUL；看见了、来得及才打）
    if (s.catching && this.catchPun !== s.serial && s.rLeft - L.react > this.mvOf('jab').S + 1 && dist <= this.eR('jab') - 4 && R() < L.punish) {
      this.catchPun = s.serial; this.plan = this.K.wc ? Jn(4) : ['jab', 'heavy']; press(this.plan.shift()); return;
    }
    // 惩罚空招（空中招打空了、人还在天上：等他落地，见上面的落地硬直）
    if (s.phase === 'r' && !s.confirmed && !s.air && dist <= 110 && R() < L.punish * 0.3) {
      const p = this.K.wc ? (dist <= 86 ? Jn(5) : ['kick', 'jab', 'jab', 'jab']) : dist <= 90 ? ['jab', 'heavy'] : ['heavy'];
      // 3.1.1 来得及才罚：看见的时候他还剩几帧收完（减去看见要的那几帧）比这一招的前摇长。以前不看：太极拳 22 帧的搬拦捶去罚一个快收完的招，
      //   打空了反被罚（他收完招一跳就越过去）
      if (s.rLeft - L.react >= this.mvOf(p[0]).S + 1) { this.plan = p; press(this.plan.shift()); return; }
    }
    // 气满：对手收招或硬直时放泼墨
    if (f.qi >= QI_MAX && dist <= (this.K.wc ? 102 : 130) && !s.down && !s.air && (s.phase === 'r' || s.stun) && R() < L.sup * 0.25) { pair(); return; }
    // 对手龟缩：站挡就擒拿或下段，蹲挡就抄腿或打上段（跳）
    if (s.blocking && !s.lowBlock && dist <= 84 && R() < L.grabBlock * (this.K.wc ? AI_TUNE.wcGrabBlk : o.style === 'wc' ? AI_TUNE.vsWcGrab : 0.12)) { press('grab'); return; }   // 咏春拳拉手扣住挡着的人（进搭手）；打咏春拳的人抓黐手
    if (s.blocking && s.lowBlock && dist <= 88 && R() < L.grabBlock * 0.1) { press('d:grab'); return; }
    if (s.blocking && !s.lowBlock && dist <= 120 && R() < L.low * (this.K.wc ? AI_TUNE.wcLow : o.style === 'wc' ? AI_TUNE.vsWcLow : 0.05)) { const k = dist <= 88 ? 'd:jab' : 'd:kick'; if (this.slowOK(k)) { press(k); return; } }
    // 2.11 骗接（打咏春拳）：他按着挡听劲，在拳够不着的地方空挥一拳 —— 他按键接了就是接空，收手的时候打他（上面那一段）
    if (!this.K.wc && o.style === 'wc' && s.blocking && !s.lowBlock && dist > this.eR('jab') + 2 && dist <= this.eR('jab') + 30 && R() < L.read * AI_TUNE.bait) { press('jab'); return; }
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
        // 3.0 太极拳：不光举手 —— 他爱先出手的距离上先出一招按住蓄（先出一招等他：他打进来正好在掤里）；他爱抓、爱打下段就少这么干
        if (this.K.tj && !this.lowBlock && R() < TJ_AI.pre * (1 - Math.min(0.8, (this.habitShare('grab', dist) + this.habitShare('lowJab', dist) + this.habitShare('sweep', dist)) * 1.5 * L.habit))  && this.slowOK('jab')) {
          this.tjHua = 0; this.guardBand = gb; press(R() < 0.65 ? 'H:jab' : 'H:heavy'); return;
        }
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
    // 2.12 咏春拳贴身听劲（按住挡等他出手再接；蹲着的多半是防他打下段）
    if (this.K.wc && !s.down && !s.atk && !oppUp && dist <= 104 && R() < (AI_TUNE.wcListen[L.id] || 0)) { f.noParry = true; this.blockT = 14 + (R() * 16 | 0); this.lowBlock = R() < 0.3 * L.lowRead; H.block = true; H.down = this.lowBlock; return; }
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
        const k = pick(this.K.dashIn);
        if (this.slowOK(k)) { this.seq = [{ fwd: 1 }, {}, { fwd: 1 }, {}, {}, {}, {}, { fwd: 1, press: k }]; return; }
      }
      if (this.K.runHeavy && dist > 150 && dist < 240 && appr > -1 && R() < L.aggr * 0.006 && this.slowOK('heavy')) {   // 跑起来沉肩靠
        this.seq = []; for (let i = 0; i < 10; i++) this.seq.push({ fwd: 1 });
        this.seq.push({ fwd: 1, press: 'heavy' }); return;
      }
      // 中距离点一腿（他正走过来就别点了：腿还没出去他就进了拳的射程）；聪明的：他走进来正好进短拳射程的那一下出拳迎他
      // 咏春拳的腿短：近一点才点（正撑脚够 100 多一点）
      // 3.0 太极拳：他朝我走过来、快进我的射程了 —— 先出一招按住蓄，等他走进来（或者他打进来被化掉）再发
      if (this.K.tj && appr > 0.8 && !s.run && dist <= this.eR('jab') + 50 && dist > this.eR('jab') - 10 && R() < L.read * 0.05 && this.slowOK('jab')) { this.tjHua = 0; this.plan = ['jab']; press(R() < 0.7 ? 'H:jab' : 'H:heavy'); this.plan = []; return; }
      const kr = this.K.wc ? [88, 108, 100] : [98, 134, 118], J = this.mvOf('jab');
      const legOK = 1 / (1 + 0.6 * this.memo.ctr.leg * L.habit);                      // 2.9 腿老被耕开就少点
      // 3.1.1 腿踢、蹬脚是慢招（前摇 19.5 ～ 22 帧）：他爱跳进来，中距离起慢腿正好被他跳过来打 —— 记得他爱跳就少点（slowOK）
      // 3.1.1 太极拳的腿（蹬脚、跌岔）是全游戏最慢的起手（前摇 20 ～ 22 帧、没有掤）：中距离少点一半（它站在射程边上等人进来，不靠点腿）
      if (sdist > kr[0] && sdist <= kr[1] && appr < 1 && appr > -1.5 && R() < L.aggr * 0.045 * legOK * (this.K.tj ? 0.5 : 1)) { const kk = sdist <= kr[2] && R() < L.low ? 'd:kick' : 'kick'; if (this.slowOK(kk)) { press(kk); return; } }
      if (this.smart && appr > 1.5 && !s.run && sdist > J.reach - 4 && sdist <= J.reach + appr * (J.S + 1) && R() < L.read * 0.25 && this.slowOK('jab')) { this.plan = this.K.wc ? Jn(5) : ['jab', 'heavy']; press('jab'); this.plan.shift(); return; }
      if (sdist <= (this.K.wc ? 88 : this.K.tj ? 104 : 92) && R() < L.aggr * 0.09 * (this.K.wc ? (AI_TUNE.wcOpen[L.id] || 1) : 1)) {
        const p = this.pickPlan(dist);
        if (this.slowOK(p[0])) { this.plan = p; press(this.plan.shift()); return; }   // 3.1.1 慢招起手：他爱跳就先别出
      }
      if (sdist <= 82 && R() < 0.008 * L.aggr) { press('grab'); return; }
    }
    if (--this.desireT <= 0) {
      this.desireT = 25 + (R() * 45 | 0);
      // 难 / 极难：贴身，或者站在他腿够不太着的地方等他出腿；咏春拳手短腿短：站得更近
      this.desire = s.down ? 150 : pick(this.K.wc ? (this.smart ? [78, 84, 92, 130] : [78, 84, 96, 112, 140, 170]) : this.K.tj ? (this.smart ? [94, 104, 128, 150] : [92, 100, 120, 150, 180])   // 3.0 太极拳：站在自己射程边上等他进来
        : this.smart ? [86, 92, 138, 146] : [84, 88, 110, 124, 150, 180]);
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
    // 3.1.1 我躺在地上的时候他跳起来（跳过来压起身）：站起来以后再想（以前躺着就想好了，倒地那一段又把它清掉，站起来没有接法、白挨）
    if (this.f.state === 'down') return;
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
    // 咏春拳没有托天掌：按住挡听劲，他空中的拳脚打过来按键接（看见了接，见 tick「听劲」那一段）
    // 3.1.1 他爱坠山：托天掌（金鸡独立）少按 —— 按早了他一坠山就踩断对空（×1.5、踩倒）
    const plan = weighted([[this.K.wc ? 'block' : 'palm', L.aa * (0.5 + 1.6 * pA * hb) * (this.K.wc ? 1 : 1 - 0.8 * pD * hb)], ['block', 0.7 + 0.5 * pA * (1 - hb)], ['wait', 0.35 + 1.8 * (pD + pE * 0.6) * hb],
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
    if (A.plan === 'palm') {
      if (A.done) return false;
      // 按着他的速度推：托天掌出手（前摇 S 帧）那几帧他在哪 —— 进了托天掌的射程、开始往下落了（或者快落地了）就按
      const D = this.mvOf('d:heavy');
      const k = lag + D.S + 1 + A.jitter;
      const px = s.x + s.vx * k, pd = Math.abs(px - f.x);
      const tLand = s.air ? (s.vz + Math.sqrt(Math.max(0, s.vz * s.vz + 2 * GRAV * s.alt))) / GRAV : 99;
      if (pd <= D.reach - 2 && (s.vz < 1 || tLand <= k + 2)) {
        A.done = true;
        press('d:heavy');
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
      // 站着等：坠山看见了就拳迎（上面），空中招交给「看到对手出招」那一段（挡 / 对空 / 蹲躲飞踢）。别往前走、别出地上的招
      // 3.1.1 他近了、他这时候按空中招我已经来不及看见再挡（airThreat）：先举着手。举着手的时候看见了他的空中招：接得住就对空，接不住接着挡到他落地
      //   （以前一直站着等：离得近按的空中招、飞踢回回白挨，还会在他底下走来走去）
      if (!o.airborne) { this.aa = null; return false; }
      if (s.atk) {
        if (!A.guard) return false;
        if (!this.K.wc && s.tier === 'air' && this.aaCatch(s, lag, s.sLeft - lag) && Math.random() < L.aa) { this.aa = null; press('d:heavy'); return true; }
        A.plan = 'block'; return this.airDefense(s, dist, press, go, lag);
      }
      if (this.airThreat(s, lag)) { A.guard = true; f.noParry = true; this.lowBlock = false; H.block = true; H.down = false; return true; }
      return false;
    }
    if (A.plan === 'back') {
      if (!o.airborne) { this.aa = null; return false; }
      const tw = o.x >= f.x ? 1 : -1, behind = f.x - tw * 100;
      if (behind < WALL_L + 20 || behind > WALL_R - 20) { A.plan = 'block'; return this.airDefense(s, dist, press, go, lag); }   // 退不了（到墙了）就站着挡
      // 他往下落、离得不远了：往后冲刺（冲刺前几帧无敌）躲开，他落空、落地有硬直；还远就举着手往后挪（面朝他，照样挡得住）
      // 2.6：冲刺要按三帧（按 → 松 → 按）才冲得出去；空中招前摇长了一点，出手的那一帧往后挪了零点几帧 —— 再晚一帧按，冲刺的无敌还没开始就挨上了，所以早一帧按
      // 3.1.1 已经看见他出空中招了（或者他快落到我身上了）就别冲刺了：冲刺要按三帧才冲得出去，按到一半是在跑、背对着他挨打 —— 站着挡
      if (!A.done && (s.atk || (s.vz < 0 && s.alt < 40))) { A.plan = 'block'; return this.airDefense(s, dist, press, go, lag); }
      if (!A.done && dist <= 150 && s.vz < 2 + GRAV) { A.done = true; this.dashAway(); return true; }
      if (dist <= 240) { f.noParry = true; this.lowBlock = false; H.block = true; go(-1); return true; }
      return false;
    }
    return false;
  }
  // 3.1.1 这一下是不是冲我来的（s 是看见的他）：面朝我的照旧算；空中的招按判定出来那一刻他飞到哪算 ——
  //   跳过头顶、从身后打下来的那一下（起跳以后按的空中招照落点转身，按的时候背对着我），以前当成「不是打我」，站着白挨
  //   （Jack 3.1.0：一直坠山击、飞踢，困难、终极的太极拳电脑打不过 —— 跳得近一点就是越过头顶打，三派的电脑都不挡）
  comingAt(s, toward) {
    if (s.facing === -toward) return true;
    if (!s.air) return false;
    const px = s.x + (s.vx || 0) * Math.max(0, s.sLeft);
    return s.facing * (this.f.x - px) >= -8;
  }
  // 3.1.1 现在按对空招（托天掌 / 金鸡独立）接得住吗：s 是 lag 帧以前的他，他的空中招还要 eta 帧打到我 ——
  //   对空无敌（airInv）开始之前他就打到了：来不及；出手那几帧（S ～ S + A）他在射程里、不比 antiAir 高（落了地也打得着）才按。
  //   以前看「还剩几帧出手 ≥ 前摇 - 6」：反应 9 ～ 11 帧的困难、终极看见空中招的时候几乎从来不成立（太极拳的金鸡独立前摇长两帧，一次都不成立）
  aaCatch(s, lag, eta) {
    const f = this.f, D = this.mvOf('d:heavy');
    if (!D || D.tier !== 'aa' || !s.air) return false;
    if (s.atk && eta < (D.airInv ? D.airInv[0] : D.S) + 0.5) return false;
    const reach = effRD(D) - 4, top = D.antiAir || AIR_SAFE, vz = s.vz || 0, alt = s.alt || 0;
    const tLand = (vz + Math.sqrt(Math.max(0, vz * vz + 2 * GRAV * alt))) / GRAV;
    for (let k = Math.ceil(D.S + 0.5); k <= D.S + D.A; k++) {
      const t = lag + k, x = s.x + (s.vx || 0) * Math.min(t, tLand), z = t >= tLand ? 0 : alt + vz * t - GRAV * t * t / 2;
      if (Math.abs(x - f.x) <= reach && z <= top) return true;
    }
    return false;
  }
  // 3.1.1 地上出腿迎他的飞踢（两条腿撞上 = 把他顶回去）：我的腿要在他踢到的时候已经出来（差 TRADE_LEAD 帧以内）。
  //   2.12 腿踢成了慢招（格斗术 19.5、太极拳的蹬脚 22），看见飞踢再起腿早就来不及了，以前照样起腿、白挨一脚
  kickMeets(eta) { const K = this.mvOf('kick'); return !!K && K.S <= eta + TRADE_LEAD; }
  // 3.1.1 他（s 是看见的他）从 a 帧以后到 b 帧以后（从现在算）这段时间里会不会飞过我头顶、换到我另一边 —— 接招的架势朝着按下去那一刻他在的那边，
  //   之后他飞过去了就是背后挨打
  crosses(s, a, b, exact) {
    const lag = exact ? 0 : this.L.react, x = t => s.x + (s.vx || 0) * (lag + t) - this.f.x;
    return x(a) * x(b) < 0 && Math.abs(x(b)) > FACE_HYST;
  }
  // 3.1.1 他的空中招真的打到我还有几帧（从现在算）：判定出来以后他还在往前飞，我要在他面前、射程以内才挨得上（越过头顶的那一下是飞过去以后才打到）
  airEta(s, eta, exact) {
    const d = this.f.opp.moves[s.name]; if (!d) return eta;
    const lag = exact ? 0 : this.L.react, k0 = Math.max(0, s.sLeft);
    for (let k = k0; k <= k0 + d.A; k++) {
      const ahead = (this.f.x - (s.x + (s.vx || 0) * k)) * s.facing;
      if (ahead >= -(d.reachBack || 6) && ahead <= d.reach) return k - lag;
    }
    return eta;
  }
  // 3.1.1 他（s：lag 帧以前的他）跳着还没出空中招：要是他现在按下空中招，最快那一下比我看得见（react 帧）还早打到我 —— 那就得先举着手。
  //   以前「站着等」（他爱坠山、爱空跳的时候想的接法）什么都不按，等看见空中招再挡：反应 9 ～ 11 帧，挥拳前摇 4 帧、飞踢 9 帧，离得近了按的那一下回回白挨
  airThreat(s, lag) {
    if (!s.air || s.atk || s.airUsed) return false;
    const f = this.f, M = f.opp.moves, vx = s.vx || 0, vz = s.vz || 0, alt = s.alt || 0;
    const tLand = (vz + Math.sqrt(Math.max(0, vz * vz + 2 * GRAV * alt))) / GRAV;   // 从 s 那一刻算还要几帧落地
    const x0 = s.x + vx * lag, face = f.x >= x0 ? 1 : -1, win = this.L.react + 3;   // 他现在在哪；按的那一下朝着我
    for (const k of ['airJab', 'airHeavy', 'airKick']) {
      const d = M[k]; if (!d) continue;
      for (let t = Math.ceil(d.S); t <= Math.min(d.S + d.A, win); t++) {
        if (lag + t >= tLand) break;                                     // 打出来之前就落地了
        const ahead = (f.x - (x0 + vx * t)) * face;
        if (ahead >= -(d.reachBack || 6) && ahead <= d.reach) return true;
      }
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
        // 3.1.1 按看见的他推（照他跑的速度往前推 react 帧，不比真的近）：他跑到跟前起跳的那几帧我还看不见，别照真的距离起腿（起了就是从他脚底下踢空）
        const gap = Math.max(dist, Math.abs(s.x - f.x) - v * L.react);
        if (gap - v * (this.mvOf('kick').S + 1) <= this.eR('kick') - 4) {
          this.rush = null;
          if (this.slowOK('kick')) press('kick');                     // 3.1.1 慢腿：他爱跑过来再跳，就举手等着（跳了接、到跟前了挡）
          else { f.noParry = true; this.lowBlock = false; this.blockT = 16; H.block = true; }
          return true;
        }
        return false;
      }
      if (P.plan === 'jab') {
        const v = Math.abs(s.x - (f.opp.history[Math.max(0, f.opp.history.length - 2 - L.react)] || s).x);
        if (Math.max(dist, Math.abs(s.x - f.x) - v * L.react) <= this.mvOf('jab').reach && (going || P.t <= 2) && !s.air && !s.squat) { this.rush = null; if (this.slowOK('jab')) press('jab'); else { f.noParry = true; this.lowBlock = false; this.blockT = 14; H.block = true; } return true; }
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
  // 3.1.1 我现在起一招 S 帧前摇的慢招，他在这段时间里跳起来的机会（× 记得准不准 habit）—— 两样取大的：
  //   · 他站在地上、跳得过来的时候每一帧起跳的机会（memo.jz）换算成「S 帧里起跳」：一直跳的人（Jack：一直坠山击、飞踢）一半以上，偶尔跳一下的人很小
  //   · 以前我起慢招的时候他跳了几成（memo.jr）：看见慢招就跳过来打的人（慢招前摇里起跳越过去，最赚）
  jumpRisk(S) { return Math.max(1 - Math.pow(1 - this.memo.jz, S + 3), this.memo.jr) * this.L.habit; }
  // 3.1.1 慢招（前摇 12 帧以上：太极拳全派和它的势、格斗术的重拳和腿踢）现在出吗：他站在地上、跳得起来，又是个爱跳进来的人 ——
  //   一跳就越过这一招、从天上打下来，收招里挨一整套（Jack 3.1.0：一直坠山击、飞踢，困难、终极的太极拳电脑打不过）。
  //   他跳得越多越少出（偶尔跳一下的人照常出：跳得少于一成半不管），false = 这一下先别出（举手、等他跳了接）
  slowOK(a) {
    const d = this.mvOf(a), h = this.f.opp.history, s = h[Math.max(0, h.length - 1 - this.L.react)];   // 看见的他（不看他这一帧真的在干什么）
    if (!d || (d.S || 0) < 12) return true;
    // 他在挨打、挡着、躺着、落地、出招、收招：这几帧跳不起来 —— 3.1.1 要等到我这一招打出来之前他都跳不过去才算（起跳先蹲 3 帧、再飞五六帧才高过地上的招）：
    //   以前看见他落地、收招就出慢招，他落地马上又跳（普通落地马上能跳），22 帧的搬拦捶还没出手他就在天上了
    if (s) {
      const lock = s.down || s.held ? 99 : s.stun ? s.stunT : (s.atk && !s.air) || s.phase === 'r' ? s.rLeft : s.landT;
      if (lock - this.L.react >= d.S - 9) return true;
    }
    // 他跳过来那一下 + 一整套连招差不多 100 血，慢招打中了也就二三十：他起跳的机会过了一成就不划算，三成以上几乎不出
    const j = this.jumpRisk(d.S);
    if (j <= 0.1) return true;
    // 不出的话这一会儿（20 帧）都不出：每一帧都想一次的地方（中立起手、点腿……）不会一帧一帧地掷，掷到一次就出
    if (this.f.clock < (this.slowNo || 0)) return false;
    if (Math.random() >= Math.min(0.97, (j - 0.1) * 3.5)) return true;
    this.slowNo = this.f.clock + 20; return false;
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
      // 3.1 长连招（五下以上）离得近才接得满：远了第一下打到头，后面够不着
      if (p.length >= (this.K.tj ? 4 : 5) && dist > 82) k *= 0.15;
      // 3.0 太极拳：慢招老被卸力、闪身躲过 —— 多蓄（他卡不准时机）、多采，少直接出搬拦捶（最好闪）
      if (this.K.tj && this.memo.tjRead > 0.3) {
        const t = this.memo.tjRead * L.habit, k0 = kindOf(p[0]);
        if (p[0].startsWith('H:')) k *= Math.min(3, 1 + 0.5 * t); else if (k0 === 'grab') k *= Math.min(2.5, 1 + 0.3 * t); else if (k0 === 'heavy') k *= Math.max(0.3, 1 - 0.2 * t);
      }
      // 3.0 对面是太极拳：抓、打下段起手多一点（掤化不了）—— 记住他的习惯以后照习惯偏（上面那一段）
      if (this.f.opp.style === 'taiji' && !this.K.tj) { if (kindOf(p[0]) === 'grab') k *= 1.5; else if (p[0].startsWith('d:')) k *= 1.3; }
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
    if (this.K.tj) return this.tjHabit(top, dist, press, guard, low);
    switch (top) {
      // 3.0 对面是太极拳：老出有掤的慢招 → 抓、打下段（掤化不了）；老出腿 → 拳打他单脚站着；老出下势 → 蹲着挡
      case 'tpeng': return dist <= this.mvOf('grab').reach + 2 && R() < 0.5 ? (press('grab'), true) : dist <= this.eR('d:jab') - 4 && R() < 0.5 ? (press('d:jab'), true) : guard(low(), 16);
      case 'tkick': return dist <= 96 && R() < 0.5 ? (press('jab'), true) : guard(low(), 16);
      case 'tlow': return guard(true, 16);
      case 'jab': case 'lowJab': return R() < 0.35 * (1 - this.handRisk()) && dist <= effR('heavy') - 8 && this.slowOK('heavy') ? (press('heavy'), true) : guard(top === 'lowJab' || low(), 14 + (R() * 10 | 0));
      case 'heavy': return dist <= effR('kick') - 6 && R() < 0.55 * (1 - this.legRisk()) && this.slowOK('kick') ? (press('kick'), true) : guard(low(), 18);
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
  // 2.10 咏春拳的电脑记住你的习惯：你老出手上的招 —— 先按着挡听劲等你打过来（接住进搭手）、先伸手拉、先标指插你的胳膊；
  // 老出腿 —— 截脚截你、截腿、拳打你单脚站着、听劲等着按手接；老抓 —— 拳打你（拳最快）；老打下段 —— 蹲着挡
  wcHabit(top, dist, press, guard, low) {
    const f = this.f, R = Math.random, H = f.inp.held;
    switch (top) {
      case 'jab': case 'heavy': case 'palm': {
        if (dist > 116) return false;
        const r = R();
        if (r < 0.45) return guard(false, 16 + (R() * 10 | 0));                               // 听劲（按着挡：他打过来就接，tick「听劲」那一段）
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
        return guard(false, 16);                                                                // 听劲（他踢过来按拿接）
      }
      case 'sweep': case 'lowKick': return R() < 0.3 ? (f.inp.press('up', f.clock), true) : guard(true, 18);
      case 'grab': return dist <= this.eR('jab') - 4 && R() < 0.5 ? (press('jab'), true) : (this.duckT = 14, H.down = true, true);
      case 'lowGrab': return dist <= this.eR('jab') - 4 && R() < 0.4 ? (press('jab'), true) : guard(false, 14);
      case 'trap': return dist <= this.eR('kick') - 6 && R() < 0.5 ? (press('kick'), true) : dist <= this.eR('d:jab') - 4 ? (press('d:jab'), true) : guard(true, 14);
      // 3.0 对面是太极拳：老出有掤的慢招 → 拉手（擒拿化不了）、低掌；老出腿 → 截脚、拳打他单脚站着；老出下势 → 蹲着挡
      case 'tpeng': return dist <= this.mvOf('grab').reach + 2 && R() < 0.55 ? (press('grab'), true) : dist <= this.eR('d:jab') - 4 && R() < 0.5 ? (press('d:jab'), true) : guard(low(), 16);
      case 'tkick': return dist <= this.eR('d:kick') - 4 && R() < 0.4 ? (press('d:kick'), true) : dist <= this.eR('jab') - 4 && R() < 0.5 ? (press('jab'), true) : guard(false, 16);
      case 'tlow': return guard(true, 16);
      case 'air': this.aa = null; this.jumpSeen = false; return false;
      case 'dash': return dist <= 220 ? guard(low(), 16) : false;
      default: return false;
    }
  }
  // 3.0 太极拳的电脑记住你的习惯：你在这儿老打手上的招、腿 —— 先出一招等你打进来（掤），或者按着挡等着捋；老打下段 —— 蹲着挡；
  // 老抓 —— 蹲下（站着的擒拿抓不到）、同时抓（拆）；老抄腿 —— 站着
  tjHabit(top, dist, press, guard, low) {
    const f = this.f, R = Math.random, H = f.inp.held;
    switch (top) {
      case 'jab': case 'heavy': case 'kick': case 'palm': case 'tpeng': case 'tkick':
        if (dist <= this.eR('jab') + 20 && R() < 0.5 && this.slowOK('jab')) { this.tjHua = 0; press(R() < 0.6 ? 'H:jab' : 'H:heavy'); return true; }
        return guard(false, 16 + (R() * 10 | 0));
      case 'lowJab': case 'sweep': case 'lowKick': case 'tlow': return guard(true, 16);
      case 'grab': case 'trap': return R() < 0.4 && dist <= this.mvOf('grab').reach + 4 ? (press('grab'), true) : (this.duckT = 14, H.down = true, true);
      case 'lowGrab': return guard(false, 14);
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
      remain: Math.max(0, m.S + m.def.A - m.t), sLeft: eta, air: m.air, dive: !!m.def.dive, x: o.x, vx: m.air ? o.vx : 0, limb: m.def.limb || null, pierce: !!m.def.pierce,
      atk: true, facing: o.facing, alt: o.alt, vz: o.vz };                // 3.1.1 高度、往上往下多快：算对空接不接得住（aaCatch）
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
    const lag = exact ? 0 : this.L.react;                          // 3.1.1 s 是几帧以前的他（瞬间看穿的是现在的他）
    if (this.K.tj) opts = this.tjCounterOpts(s, d, dist, eta, lag);
    else if (this.K.wc) opts = this.wcCounterOpts(s, d, dist, eta, freshBlock);
    else if (s.name === 'dive') { opts.push([18, 'antiDive']); opts.push([5, 'block']); }
    else if (d.air) {
      // 托天掌出手那几帧他飞到哪：够得着才用（远处的飞踢托不着，蹲下躲 / 腿迎）。3.1.1 照真的轨迹算（aaCatch），腿来得及才迎（kickMeets）
      if (s.name === 'airKick') { opts.push([12, 'duck']); if (dist >= 105 && dist <= 175 && this.kickMeets(eta)) opts.push([9, 'kick']); }
      if (this.aaCatch(s, lag, eta)) opts.push([16, 'd:heavy']);
      if (freshBlock) opts.push([10, 'parry']);
      opts.push([4, 'block']);
    } else if (d.kind === 'grab') {
      if (d.low) opts.push([12, 'wait']);                           // 抄腿抓不到站着的：站着等它抓空，打收招
      else { opts.push([14, 'duck']); if (eta >= this.mvOf('jab').S + 2 && dist <= this.eR('jab') - 4) opts.push([9, 'jab']); }
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
    // 3.0 对面是太极拳、这一招有掤：往掤里打的那几手（拳、重、腿、标指、对空……打进去被化掉、白送他劲）去掉，加上擒拿、下段、退开
    if (!this.K.tj && f.opp.style === 'taiji' && ((d.tjCharge && !d.noPeng) || d.tjHua) && !s.air) opts = opts.filter(o => !TJ_INTO_PENG.has(o[1])).concat(this.vsPengOpts(s, d, dist, eta));
    if (!opts.length) return false;
    // 对面是咏春拳：重拳、腿去破他的招，也可能被他拍开、耕开、黏住（风险按被化开过多少算）
    if (!this.K.wc && !this.K.tj) { const hr = this.handRisk(), lr = this.legRisk(); for (const o of opts) { if (o[1] === 'heavy') o[0] *= 1 - hr; else if (o[1] === 'kick') o[0] *= 1 - lr; } }
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
      case 'catch': return this.catchAt(s, eta, exact);              // 2.11 接招：按住挡、算好时机按对的键
      case 'lu': return this.luAt(eta, exact);                       // 3.0 太极拳：捋（打到之前一两帧按后）
      case 'hua': this.tjHua = 0; press(R() < 0.6 ? 'H:jab' : 'H:heavy'); return true;   // 3.0 太极拳：先出一招等他打进来（掤）
      case 'away': this.dashAway(); return true;
      case 'duck': this.duckT = Math.max(12, s.remain + 8); H.down = true; return true;
      case 'wait': f.noParry = true; this.lowBlock = false; this.blockT = Math.max(6, s.remain + 2); H.block = true; return true;
      case 'block': case 'cblock': f.noParry = true; this.lowBlock = c[1] === 'cblock' || low; this.blockT = Math.max(8, s.remain + 6); H.block = true; H.down = this.lowBlock; return true;
      default: press(c[1]); return true;
    }
  }
  // 3.0 太极拳的电脑看穿了一招：手上的招、中段上段的腿 —— 捋（时机按到帧）、来得及就先出一招等他打进来（掤），腿还能采（接腿 = 搂膝拗步）；
  //   擒拿 —— 蹲下 / 退开；下段 —— 蹲着挡；空中的 —— 金鸡独立 / 站着挡；坠山 —— 站着拳迎；大招 —— 挡
  tjCounterOpts(s, d, dist, eta, lag) {
    const f = this.f, opts = [], G = this.mvOf('grab'), luFresh = f.clock + Math.max(0, eta - 2) - f.luPress >= TJ_LU_LOCK;
    if (s.name === 'dive') opts.push([14, 'block']);                // 拳太慢迎不上坠山：站着挡
    else if (d.air) {
      // 3.1.1 金鸡独立接得住才出（照他真的轨迹算；以前「还剩几帧 ≥ 前摇 - 7」看穿了也几乎从来不成立，只剩挡和蹲）
      if (this.aaCatch(s, lag, eta)) opts.push([16, 'd:heavy']);
      if (s.name === 'airKick') opts.push([10, 'duck']);
      opts.push([8, 'block']);
    } else if (d.kind === 'grab') {
      if (d.low) opts.push([12, 'wait']);
      else { opts.push([14, 'duck']); opts.push([6, 'away']); }
    } else if (d.tier === 'super') { opts.push([10, 'block']); opts.push([6, 'away']); }
    else if (d.kind === 'push') opts.push([6, 'block']);
    else if (d.height === 'low') { opts.push([14, 'cblock']); if (s.name === 'sweep' || s.name === 'wLowKick') opts.push([8, 'd:grab']); }
    else if (d.pierce) { if (luFresh) opts.push([13, 'lu']); opts.push([8, 'block']); }
    else {
      // 捋的分量照格斗术看穿以后卸力的分量（拳 13、腿 16、重 22），掤照它出克制那一系的分量
      const kick = d.kind === 'kick', heavy = d.tier === 'heavy';
      if (luFresh) opts.push([heavy ? 22 : kick ? 16 : 13, 'lu']);
      if (eta >= TJ_PENG_FROM + 1 && dist <= this.eR('jab') + 24) opts.push([heavy ? 13 : 15, 'hua']);
      if (kick && eta >= G.S + 1 && dist <= d.reach + 6) opts.push([18, 'grab']);   // 接住腿：搂膝拗步
      opts.push([heavy ? 6 : 4, 'block']);
    }
    return opts;
  }
  // 3.0 打太极拳：看穿了他这一招有掤（打进去被化掉、白送他劲）—— 抓、打下段，够不着就挡住等他发（发出来挡住了打他收招）/ 退开
  vsPengOpts(s, d, dist, eta) {
    const opts = [], G = this.mvOf('grab'), LJ = this.mvOf('d:jab');
    if (dist <= G.reach - 2) opts.push([18 * (1 - 0.6 * this.L.tech), 'grab']);   // 会挣脱的人多（自己会，就当他也会）：抓不如打下段
    if (LJ && dist <= effRD(LJ) - 4) opts.push([15, 'd:jab']);
    opts.push([8, 'block']);
    if (dist <= d.reach + 30) opts.push([6, 'away']);
    return opts;
  }
  // 罚：对手还要 left 帧才能动，离 dist 远 —— 挑够得着、来得及、最疼的一套（击倒的优先）
  bestPunish(dist, left) {
    let best = null;
    for (const [first, route, dmg] of this.K.routes) {
      const d = this.mvOf(first);
      if (!d || dist > effRD(d) - 6 || left < d.S + 1 + (first === 'H:heavy' ? WC_CHARGE + 6 : 0)) continue;   // 寸拳蓄满还要多等蓄劲那几帧
      if (route.length >= (this.K.tj ? 4 : 5) && dist > 82) continue;                                         // 3.1 长连招离得近才接得满
      if (!best || dmg > best[1]) best = [route, dmg];
    }
    return best && best[0];
  }
  // 2.10 咏春拳的电脑看穿了一招：从自己这一派的破法里挑。2.11 接招（按住挡、键按对、时机按到帧）是最主要的一手：
  //   手上的招：接招（进搭手）、拉手、标指、寸拳霸体吃一拳、转马躲重拳；地上的腿：接招（按手）、截腿、截脚、拳打单脚站着的；
  //   下段的腿：蹲着接（耕手）、截腿；下段的手上招接不住：蹲着挡；空中的拳脚：接招
  wcCounterOpts(s, d, dist, eta, freshBlock) {
    const opts = [], T = this.MV.grab, LG = this.MV.lowGrab, LK = this.MV.wLowKick, B = this.MV.wBiu, J = this.mvOf('jab');
    const hand = HAND_LIMB.test(d.limb || ''), leg = d.kind === 'kick' || d.limb === 'ff' || d.limb === 'bf', low = d.height === 'low';
    if (d.dive) { opts.push([18, 'antiDive']); opts.push([5, 'block']); }
    else if (d.air) {
      if (hand || leg) opts.push([20, 'catch']);
      if (d.evadeCrouch) opts.push([12, 'duck']);
      opts.push([5, 'block']);
    } else if (d.kind === 'grab') {
      if (d.low) opts.push([12, 'wait']);
      else { opts.push([14, 'duck']); if (eta >= J.S + 2 && dist <= this.eR('jab') - 4) opts.push([10, 'jab']); }
    } else if (d.tier === 'super' || d.kind === 'push') opts.push([6, 'block']);
    else if (leg && !low) {
      opts.push([20, 'catch']);                                                             // 按手接住（他失衡）
      if (eta >= LG.S + 1 && dist <= d.reach + 6) opts.push([16, 'd:grab']);               // 截腿截住
      if (dist <= this.eR('jab') - 4 && eta >= J.S) opts.push([14, 'jab']);                  // 拳打出腿的人：失衡倒地
      if (eta >= LK.S - 1 && dist <= effRD(LK) - 4) opts.push([13, 'd:kick']);               // 截脚截住
    } else if (low) {
      if (leg) { opts.push([18, 'catch']); if (eta >= LG.S + 1 && dist <= d.reach + 6) opts.push([16, 'd:grab']); }   // 耕手接住
      opts.push([10, 'cblock']);
    } else {                                                                                // 拳、掌、肘、肩……
      opts.push([20, 'catch']);                                                             // 拍手、摊手、膀手转马接住（进搭手）
      if (hand && eta >= T.S + 1 && dist <= Math.max(T.reach, d.reach) + 4) opts.push([16, 'trap']);   // 拉手拉住（要卡在他快打出来的那几帧）
      if (hand && eta >= B.S + 1 && dist <= effRD(B)) opts.push([15, 'biu']);                          // 标指挑开
      if (slipable(d)) { const t = Math.min(3, this.slipWindow(dist) - 1); if (t >= 0 && eta >= 3 + t) opts.push([14, 'slip', t]); }
      if (d.tier === 'light' && !d.pierce && eta >= 2 && dist <= this.eR('heavy') - 6) opts.push([10, 'heavy']);   // 寸拳霸体吃他一拳
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
        if (r < ph * 0.85 + pd * 0.9) { const k = dist <= this.mvOf('grab').reach - 4 ? 'grab' : R() < 0.5 ? 'd:jab' : 'd:kick'; if (this.slowOK(k)) { press(k); return true; } }
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
        // 对面是咏春拳多的几类：拉手 → 腿；截脚 → 拳。咏春拳自己的预判：手上的招 → 按着挡听劲等着接 / 标指，腿 → 截脚 / 截腿，下段 → 蹲着挡，抓 → 拳
        const pre = this.K.wc ? { kick: dist <= 110 ? (R() < 0.5 ? 'd:grab' : 'd:kick') : null, heavy: dist <= 110 ? (R() < 0.5 ? 'f:jab' : 'ting') : null, jab: dist <= 104 ? 'ting' : null,
          palm: dist <= 104 ? 'ting' : null, grab: 'jab', lowGrab: 'jab', sweep: 'tingLow', lowKick: 'tingLow', lowJab: dist <= 100 ? 'tingLow' : null, dive: 'jab',
          trap: dist <= this.eR('kick') ? 'kick' : null }[top]
          : { kick: dist <= this.mvOf('kick').reach ? 'grab' : null, heavy: dist <= 120 ? 'slip' : null, jab: dist <= 100 ? 'heavy' : null, grab: 'd:jab',
          sweep: 'up', lowJab: dist <= 100 ? 'heavy' : null, air: dist <= 140 ? 'd:heavy' : null, jump: dist <= 150 ? 'd:heavy' : null, dive: 'jab',
          trap: dist <= this.eR('kick') - 4 ? 'kick' : null, lowKick: dist <= 96 ? 'jab' : null }[top];
        if (pre === 'slip') { this.slipIn(); f.inp.held.block = true; return true; }
        if (pre === 'ting' || pre === 'tingLow') { f.noParry = true; this.lowBlock = pre === 'tingLow'; this.blockT = 16; f.inp.held.block = true; f.inp.held.down = this.lowBlock; return true; }   // 按着挡听劲：他打过来就接（tick「听劲」那一段）
        if (pre === 'up') { f.inp.press('up', f.clock); return true; }
        if (pre && this.slowOK(pre)) { press(pre); return true; }
      }
    }
    // 4) 他在挡：上下段、擒拿换着来（站挡 → 擒拿 / 下段；蹲挡 → 抄腿 / 劈山（上段））
    if (s.blocking && dist <= 120) {
      const p = R();
      if (!s.lowBlock) {
        if (dist <= this.mvOf('grab').reach - 2 && p < (f.opp.style === 'wc' || this.K.wc ? 0.12 : 0.05)) { press('grab'); return true; }
        if (p < 0.09) { const k = dist <= 90 ? 'd:jab' : 'd:kick'; if (this.slowOK(k)) { press(k); return true; } }
      } else {
        if (dist <= this.mvOf('d:grab').reach - 2 && p < (this.K.wc ? 0.08 : 0.05)) { press('d:grab'); return true; }
        if (!this.K.wc && dist <= 100 && p < 0.09 && this.slowOK('heavy')) { this.plan = ['heavy', 'heavy']; press('heavy'); return true; }
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
    const rk = f.state === 'hit' && f.reel ? f.reelKind : null, ck = rk === 'pat' || rk === 'tan' || rk === 'bong' ? 'hand' : rk === 'gum' || rk === 'gaun' ? 'leg'
      : rk === 'lu' ? (/^(ff|bf)$/.test(this.lastLimb || '') ? 'leg' : 'hand') : null;   // 2.11 被接住（空中的拳脚、腿）；3.0 被太极拳捋了（哪只手脚打过去被捋的）
    if (ck && !this.ctrOn) { this.ctrOn = true; M.ctr[ck] += 1; } else if (!ck) this.ctrOn = false;
    if (f.state === 'attack' && f.move && !f.move.def.script) this.lastLimb = f.move.def.height === 'low' ? 'ff' : f.move.def.limb;   // 我正在出的招打的是哪只手脚
    M.rev *= 0.9997; M.esc *= 0.9997;
    if (this.K.tj) {
      M.tjRead *= 0.9997;
      const read = f.state === 'hit' && ((f.reel && !f.reelKind) || (f.stagger && o.move && o.move.name === 'slipElbow'));   // 被卸力（reelKind 空）、被闪身回身打
      if (read && !this.tjReadOn) { this.tjReadOn = true; M.tjRead += 1; } else if (!read) this.tjReadOn = false;
    }
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
    const jd = Math.abs(o.x - f.x);
    if (o.state === 'jumpsquat') { if (!this.jsSeen) { this.jsSeen = true; band.jump = (band.jump || 0) + w; if (jd <= 280) M.jz = M.jz * 0.995 + 0.005; } }
    else { this.jsSeen = false; if (o.actionable() && !o.airborne && jd >= 40 && jd <= 280) M.jz *= 0.995; }   // 3.1.1 他能跳、跳得过来、这一帧没跳
    // 3.1.1 我起了慢招（他那时在地上、能动、跳得过来）：看他在我出手之前跳没跳
    const fm = f.state === 'attack' ? f.move : null;
    if (fm && fm.serial !== this.swSer && !fm.def.script && !fm.air && (fm.S || 0) >= 15 && fm.t < 2 && o.actionable() && !o.airborne && jd >= 40 && jd <= 280) { this.swSer = fm.serial; this.sw = fm.serial; }
    if (this.sw !== undefined && this.sw >= 0) {
      const up = o.state === 'jumpsquat' || o.airborne, done = !fm || fm.serial !== this.sw || fm.t >= fm.S;
      if (up || done) { M.jr = M.jr * 0.8 + (up ? 0.2 : 0); this.sw = -1; }
    }
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
    H.left = H.right = H.up = H.down = H.block = H.heavy = H.jab = H.kick = false;
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
