"""把 Meshy 这类 AI 生成的人物模型（GLB：Mixamo 骨骼、一张贴图）整理成游戏用的：
  1. 网格 + 蒙皮另存一个 GLB（去掉贴图、动画，小很多）；
  2. 贴图：碎块之间的黑底填上旁边的颜色（远看缩小采样时不渗黑边），存 4K（桌面版）和 2K（网页版）两张 JPG；
  3. 两只手各加三节「握拳骨」（Meshy 的骨骼没有手指）：四根手指按离手腕多远分给三节，游戏里三节一起弯，手指卷成拳头。
     拇指不动；手心朝哪边按拇指在哪边判断。握拳骨的 Z 轴就是弯的轴（绕 +Z 转 = 往手心弯，左右手一样）。
用法：python3 tools/import_char.py Meshy导出的.glb 输出目录 名字
  输出：名字.glb、名字_albedo_4k.jpg、名字_albedo_2k.jpg
要 numpy、scipy、pillow。"""
import json, struct, sys, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

src, out_dir, name = sys.argv[1], sys.argv[2], sys.argv[3]

data = open(src, 'rb').read()
off = 12
chunks = []
while off < len(data):
    clen, ctype = struct.unpack('<II', data[off:off + 8])
    chunks.append(data[off + 8:off + 8 + clen])
    off += 8 + clen
js = json.loads(chunks[0])
binc = chunks[1]

COMP = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(i):
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    n = NCOMP[a['type']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    st = bv.get('byteStride')
    it = np.dtype(COMP[a['componentType']]).itemsize * n
    if st and st != it:
        raw = np.frombuffer(binc, np.uint8, st * a['count'], o).reshape(a['count'], st)[:, :it]
        return np.frombuffer(raw.tobytes(), COMP[a['componentType']]).reshape(a['count'], n).copy()
    return np.frombuffer(binc, COMP[a['componentType']], a['count'] * n, o).reshape(a['count'], n).copy()


prim = js['meshes'][0]['primitives'][0]
skin = js['skins'][0]
V = acc(prim['attributes']['POSITION']).astype(np.float64)
UV = acc(prim['attributes']['TEXCOORD_0']).astype(np.float64)
IDX = acc(prim['indices']).reshape(-1, 3)
JA = js['accessors'][prim['attributes']['JOINTS_0']]
WA = js['accessors'][prim['attributes']['WEIGHTS_0']]
JN = acc(prim['attributes']['JOINTS_0']).astype(np.int64)
WT = acc(prim['attributes']['WEIGHTS_0']).astype(np.float64)
if WA['componentType'] == 5121:
    WT /= 255.0
elif WA['componentType'] == 5123:
    WT /= 65535.0
IBM = acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
joints = list(skin['joints'])
nodes = js['nodes']
jname = [nodes[j]['name'].replace('mixamorig:', '').replace('mixamorig_', '') for j in joints]

# ---------- 贴图 ----------
img = js['images'][0]
bv = js['bufferViews'][img['bufferView']]
o = bv.get('byteOffset', 0)
import io
im = Image.open(io.BytesIO(binc[o:o + bv['byteLength']])).convert('RGB')
TW, TH = im.size
mask = Image.new('L', (TW, TH), 0)
d = ImageDraw.Draw(mask)
P = np.stack([UV[:, 0] * TW, UV[:, 1] * TH], 1)
for t in IDX:
    d.polygon([tuple(P[t[0]]), tuple(P[t[1]]), tuple(P[t[2]])], fill=255, outline=255)
m = ndimage.binary_dilation(np.asarray(mask) > 0, iterations=2)
a = np.asarray(im).copy()
_, (iy, ix) = ndimage.distance_transform_edt(~m, return_indices=True)
a = a[iy, ix]
tex = Image.fromarray(a)
tex.save(os.path.join(out_dir, name + '_albedo_4k.jpg'), quality=95, subsampling=0)
tex.resize((TW // 2, TH // 2), Image.LANCZOS).save(os.path.join(out_dir, name + '_albedo_2k.jpg'), quality=95, subsampling=0)
print('贴图', TW, 'x', TH, '用到', round(m.mean() * 100, 1), '%')

# ---------- 握拳骨 ----------
CURL_AT = [0.0, 0.45, 0.72]     # 三节从哪儿开始弯（指根 → 指尖的比例）
new_joints = []                  # (名字, 爸爸的 node 下标, 局部平移（厘米）, 局部旋转四元数, bind 矩阵)


def ramp(x, a, w):
    return np.clip((x - (a - w)) / (2 * w), 0.0, 1.0)


for side in ['Left', 'Right']:
    hi = jname.index(side + 'Hand')
    B = np.linalg.inv(IBM[hi])                       # 手骨头 → 网格（米）
    sc = np.linalg.norm(B[:3, 0])                    # 骨头自己的单位（GLB 里是厘米：0.01）
    R = B[:3, :3] / sc
    org = B[:3, 3]
    wh = np.zeros(len(V))
    for c in range(4):
        wh += np.where(JN[:, c] == hi, WT[:, c], 0.0)
    hv = wh > 0.0
    L = (V - org) @ R                                # 手的局部坐标（米）：Y 顺着手、X 手背 ↔ 手心、Z 横着四根手指
    Lh = L[hv]
    top = Lh[:, 1].max()                             # 指尖
    # 手指那一段的中间（X）：指尖往回 4 厘米那些点
    fx = np.median(Lh[Lh[:, 1] > top - 0.04, 0])
    # 拇指：离手指的中线 X 远出 2.5 厘米、比指尖低的那些点；在哪边 = 手心在哪边
    far = (np.abs(L[:, 0] - fx) > 0.025) & (L[:, 1] < top - 0.04) & (L[:, 1] > 0.0) & hv
    side_sign = np.sign(np.median(L[far, 0] - fx)) if far.sum() > 20 else -1.0
    # 指根（拇指尖那么高往下一点）：拇指的点最高到哪
    thumb_top = L[far, 1].max() if far.sum() > 20 else top * 0.68
    knuckle = min(thumb_top - 0.03, top * 0.58)
    knuckle = max(knuckle, top * 0.45)
    fl = top - knuckle
    piv_y = [knuckle + fl * k for k in CURL_AT]
    thumb = far & (L[:, 1] < thumb_top + 0.005)
    print(side, '手长', round(top, 3), '指根', round(knuckle, 3), '手心朝', '−X' if side_sign < 0 else '+X', '拇指点', int(thumb.sum()))
    # 握拳骨的朝向：和手一样，手心在 +X 那边就绕 Y 转半圈（这样「绕 +Z 转」总是往手心弯）
    flip = side_sign > 0
    Rl = np.diag([-1.0, 1.0, -1.0]) if flip else np.eye(3)
    q = [0.0, 1.0, 0.0, 0.0] if flip else [0.0, 0.0, 0.0, 1.0]
    parent_node = joints[hi]
    prev_y = 0.0
    fists = []
    for k, py in enumerate(piv_y):
        loc = np.array([fx, py, 0.0])                # 在手骨头里（米）
        Bk = np.eye(4)
        Bk[:3, :3] = R @ Rl * sc
        Bk[:3, 3] = org + R @ loc
        # 在爸爸那根骨头里的位置（爸爸的单位）：第一节挂在手上（指根那儿），后两节挂在上一节上（往指尖挪）
        t_local = (np.array([fx, py, 0.0]) if k == 0 else Rl.T @ np.array([0.0, py - prev_y, 0.0])) / sc
        fists.append((side + 'Fist%d' % (k + 1), parent_node, t_local, q if k == 0 else [0.0, 0.0, 0.0, 1.0], Bk))
        prev_y = py
        parent_node = None                           # 下一节挂在这一节下面（写的时候再填）
    # 重新分权重：手骨头上的那一份按离手腕多远分给 手 / 第一节 / 第二节 / 第三节
    y = L[:, 1]
    f1 = ramp(y, piv_y[0], 0.008)
    f2 = ramp(y, piv_y[1], 0.006)
    f3 = ramp(y, piv_y[2], 0.005)
    f1[thumb] = 0.0
    f2[thumb] = 0.0
    f3[thumb] = 0.0
    base = len(joints) + len(new_joints)
    parts = [1.0 - f1, f1 - f2, f2 - f3, f3]
    for v in np.nonzero(hv & (f1 > 0))[0]:
        w = {}
        for c in range(4):
            if WT[v, c] > 0:
                w[int(JN[v, c])] = w.get(int(JN[v, c]), 0.0) + WT[v, c]
        h = w.pop(hi, 0.0)
        for k, pk in enumerate(parts):
            if pk[v] > 1e-4:
                jj = hi if k == 0 else base + k - 1
                w[jj] = w.get(jj, 0.0) + h * pk[v]
        items = sorted(w.items(), key=lambda e: -e[1])[:4]
        s = sum(e[1] for e in items)
        for c in range(4):
            if c < len(items):
                JN[v, c] = items[c][0]
                WT[v, c] = items[c][1] / s
            else:
                JN[v, c] = 0
                WT[v, c] = 0.0
    new_joints.extend(fists)

# ---------- 写 GLB（只有网格 + 蒙皮） ----------
out_bin = bytearray()
out_bv = []
out_acc = []


def add(arr, comp, typ, target=None, minmax=False):
    global out_bin
    while len(out_bin) % 4:
        out_bin.append(0)
    b = np.ascontiguousarray(arr.astype(COMP[comp])).tobytes()
    bvd = {'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': len(b)}
    if target:
        bvd['target'] = target
    out_bin += b
    out_bv.append(bvd)
    a = {'bufferView': len(out_bv) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
    if minmax:
        a['min'] = arr.min(0).tolist()
        a['max'] = arr.max(0).tolist()
    out_acc.append(a)
    return len(out_acc) - 1


attrs = {}
attrs['POSITION'] = add(V.astype(np.float32), 5126, 'VEC3', 34962, True)
attrs['NORMAL'] = add(acc(prim['attributes']['NORMAL']).astype(np.float32), 5126, 'VEC3', 34962)
attrs['TEXCOORD_0'] = add(UV.astype(np.float32), 5126, 'VEC2', 34962)
attrs['JOINTS_0'] = add(JN.astype(np.uint16), 5123, 'VEC4', 34962)
attrs['WEIGHTS_0'] = add(WT.astype(np.float32), 5126, 'VEC4', 34962)
ind = add(IDX.reshape(-1).astype(np.uint32), 5125, 'SCALAR', 34963)
# 节点：原来的照抄，握拳骨接在手下面
nodes = [dict(n) for n in nodes]
for n in nodes:
    n.pop('extras', None)
new_idx = []
last = None
for nm, parent, t, q, Bk in new_joints:
    nd = {'name': nm, 'translation': [float(x) for x in t], 'rotation': [float(x) for x in q]}
    nodes.append(nd)
    ni = len(nodes) - 1
    p = parent if parent is not None else last
    nodes[p].setdefault('children', []).append(ni)
    new_idx.append(ni)
    last = ni
ibms = list(IBM)
for nm, parent, t, q, Bk in new_joints:
    ibms.append(np.linalg.inv(Bk))
ibm_arr = np.array([m.T.reshape(-1) for m in ibms], dtype=np.float32)
skin_out = {'joints': joints + new_idx, 'inverseBindMatrices': add(ibm_arr, 5126, 'MAT4')}
if 'skeleton' in skin:
    skin_out['skeleton'] = skin['skeleton']
if 'name' in skin:
    skin_out['name'] = skin['name']
mesh_out = {'name': js['meshes'][0].get('name', name), 'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0, 'mode': 4}]}
out = {
    'asset': {'version': '2.0', 'generator': 'modou tools/import_char.py'},
    'scene': js.get('scene', 0), 'scenes': js['scenes'], 'nodes': nodes,
    'meshes': [mesh_out], 'skins': [skin_out],
    'materials': [{'name': 'Body', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 1}}],
    'accessors': out_acc, 'bufferViews': out_bv, 'buffers': [{'byteLength': len(out_bin)}],
}
j = json.dumps(out, separators=(',', ':')).encode()
while len(j) % 4:
    j += b' '
while len(out_bin) % 4:
    out_bin.append(0)
with open(os.path.join(out_dir, name + '.glb'), 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(out_bin)))
    f.write(struct.pack('<II', len(j), 0x4E4F534A))
    f.write(j)
    f.write(struct.pack('<II', len(out_bin), 0x004E4942))
    f.write(out_bin)
print('写好', name + '.glb', '骨头', len(joints) + len(new_idx), '顶点', len(V))
