"""场景远景（2.5 版「黄昏庭院」）：从参考图做一张干净的远景板。
参考图两边站着两个人 —— 人身后那一截（左右两边、栏杆那么高）用中间干净的那部分镜像过去补上，接缝羽化；
天、远山、宝塔、瀑布、牌楼、台阶都是原图。只要地面线（台阶底）以上：地面是 3D 做的。
用法：python3 tools/make_stage_plate.py 参考图.png assets/tex/stage_plate.png"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H0, W0 = im.shape[:2]
BOT = 668                      # 远景板下沿（台阶底、栏杆脚，往下是地面）
plate = im[:BOT].copy()

def fill(x0, x1, y0, y1, mirror_at, feather=36):
    """把 [x0,x1) × [y0,y1) 换成以 mirror_at 为轴镜像过来的那一块，四周羽化"""
    ys = np.arange(0, BOT)
    xs = np.arange(0, W0)
    X = 2 * mirror_at - xs
    X = np.clip(X, 0, W0 - 1)
    mir = im[:BOT][:, X]
    # 遮罩：区域里 1，边上 feather 渐变
    m = np.zeros((BOT, W0), np.float32)
    m[y0:y1, x0:x1] = 1.0
    mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather / 2.5))
    m = np.asarray(mi).astype(np.float32) / 255.0
    m[y0 + feather:y1, max(0, x0):x1 - (feather if x1 < W0 else 0)] = 1.0
    return m[..., None], mir

for (x0, x1, y0, y1, ax) in [(0, 452, 352, BOT, 452), (1292, W0, 384, BOT, 1292)]:
    m, mir = fill(x0, x1, y0, y1, ax)
    plate = plate * (1 - m) + mir * m

# 往两边再接宽（镜头左右跑、宽屏都要盖住）：两边各接半张，照边上那半张镜像过去，接缝羽化
EXT = W0 // 2
left = plate[:, :EXT][:, ::-1]
right = plate[:, -EXT:][:, ::-1]
wide = np.concatenate([left, plate, right], axis=1)
# 接缝：镜像的接缝本来就连续（同一列），再把远处的天、山压暗一点点，中间的牌楼最亮（视线集中在中间）
Wn = wide.shape[1]
xs = np.linspace(-1, 1, Wn)[None, :, None]
wide = wide * (1.0 - 0.18 * np.clip(np.abs(xs) - 0.35, 0, 1))

# 往上接一截天（镜头拉远、画面比 16:9 高、跳得高镜头往上挪时，原图上沿以上也要有东西）：
# 原图最上面那几十行上下镜像过去接着（柱子、枝叶往上接得自然），越往上越化进暮色的雾里（雾的颜色 = 上沿那一行横着糊开、提亮）
TOP = 260
Hh, Wn = wide.shape[:2]
mir = wide[:TOP][::-1]                                   # 第 0 行接着原图第 0 行
band = wide[:24].mean(axis=0)                           # 上沿一行的颜色（每列）
bi = Image.fromarray(np.clip(band[None].repeat(8, 0), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(110))
band = np.asarray(bi).astype(np.float32)[4]
sky = np.array([238, 214, 186], np.float32)              # 暮色的天
haze = band * 0.45 + sky * 0.55
y = (TOP - np.arange(TOP))[:, None, None] / TOP          # 0 = 接缝，1 = 最上面
h = np.clip(y / 0.3, 0, 1) ** 0.9
ext = mir * (1 - h) + haze[None] * h
ext = ext * (1 - 0.35 * h) + sky[None, None] * 0.35 * h
# 原图上沿往下 70 行也往雾里化一点（被切掉的山尖不那么硬）
k = np.clip(1 - np.arange(70) / 70.0, 0, 1)[:, None, None] ** 2 * 0.45
wide[:70] = wide[:70] * (1 - k) + haze[None] * k
full = np.concatenate([ext, wide], axis=0)
Image.fromarray(np.clip(full, 0, 255).astype(np.uint8)).save(out)
print('ok', full.shape, 'BOT', BOT, 'TOP', TOP)
