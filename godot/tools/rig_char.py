"""给没绑骨的 AI 人物模型（Meshy 只出网格 + 贴图那种 GLB）绑上 Mixamo 骨架、算好权重，出一个和 Meshy 绑骨后一样结构的 GLB，
再交给 tools/import_char.py。顶点、UV、贴图一点不动。

  python3 tools/rig_char.py rig 原.glb tools/rigs/名字.json 输出.glb       绑骨（要 Blender 的 Python 模块 bpy，见下）
  python3 tools/rig_char.py overlay 正交图.png 输出.png tools/rigs/名字.json 方向 中心横 中心y 高度 [网格间隔]
                                                                            在 tools/ortho_view.gd 拍的正交图上画网格和关节，对着看关节放得准不准
  python3 tools/rig_char.py wviz 绑好的.glb 模式 输出.glb                     看权重：dom = 每个点按主骨头上色；骨头名（如 LeftHand）= 那根骨头的权重（蓝 0 → 红 1）
                                                                            出来的 GLB 用 tools/ortho_view.gd 加 vcol 拍

绑骨的做法：
  1. 焊接：GLB 在 UV 接缝处把一个点拆成好几个，先按位置焊回一个（Meshy 重拓扑出来的网格焊完是一整块）；
  2. 骨头放在 rigs/名字.json 写的关节上（左边写，右边镜像；骨头名、父子关系照 Mixamo）；
  3. Blender 的自动权重（骨骼热量法）在焊好的网格上算权重；
  4. 胳膊的骨头（大臂、小臂、手）只准管离那根骨头够近的点：手垂在长袍旁边，热量法会把袍子分一两成给手，一出拳袍子就被扯过去；
     小臂、手上的点也只跟着这条胳膊；
  5. 每个点最多 4 根骨头、太小的扔掉，写回原来的（没焊的）顶点，出 GLB。骨头的局部 Y 顺着骨头（游戏里顺着骨头伸缩），
     手的 X 是手心 ↔ 手背、Z 横着四根手指（import_char.py 加握拳骨要用）。

关节怎么定：tools/ortho_view.gd 拍正面、侧面的正交图（模型原样，unshaded），overlay 画上 10 厘米网格读出大概位置，
再对着袖口、靴口、裤子褶子这些地方调；改完 rig、wviz 看权重，最后进游戏 tests/render_model.gd 拍全部招式看。

bpy：pip 装 Blender 的 Python 模块，最好单独一个环境（很大），例如
  uv venv bpyenv --python 3.13 && VIRTUAL_ENV=bpyenv uv pip install bpy==5.2.3 numpy scipy pillow
  bpyenv/bin/python tools/rig_char.py rig …
要 numpy、scipy、pillow。"""
import json, struct, sys
import numpy as np

COMP = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

# Mixamo 的骨骼树：名字 → 爸爸；骨头的尾巴指向哪个关节（_End 结尾的只给方向用，不是骨头）
PARENT = {'Hips': None, 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
TAIL = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End'}
for _s in ('Left', 'Right'):
    PARENT.update({_s + 'Shoulder': 'Spine2', _s + 'Arm': _s + 'Shoulder', _s + 'ForeArm': _s + 'Arm', _s + 'Hand': _s + 'ForeArm',
                   _s + 'UpLeg': 'Hips', _s + 'Leg': _s + 'UpLeg', _s + 'Foot': _s + 'Leg', _s + 'ToeBase': _s + 'Foot'})
    TAIL.update({_s + 'Shoulder': _s + 'Arm', _s + 'Arm': _s + 'ForeArm', _s + 'ForeArm': _s + 'Hand', _s + 'Hand': _s + 'Hand_End',
                 _s + 'UpLeg': _s + 'Leg', _s + 'Leg': _s + 'Foot', _s + 'Foot': _s + 'ToeBase', _s + 'ToeBase': _s + 'Toe_End'})
BONES = list(TAIL)
# 胳膊的骨头管多远（米，点到骨头那一段的距离）
FENCE = {'hand': 0.065, 'hand_from_fore': 0.055, 'fore': 0.085, 'fore_from_hand': 0.075, 'fore_from_upper': 0.07,
         'upper': 0.10, 'upper_from_fore': 0.085, 'lower_fore': 0.075, 'lower_hand': 0.07}


def load_glb(path):
    data = open(path, 'rb').read()
    off = 12
    ch = []
    while off < len(data):
        clen, _ = struct.unpack('<II', data[off:off + 8])
        ch.append(data[off + 8:off + 8 + clen])
        off += 8 + clen
    js = json.loads(ch[0])
    binc = ch[1]

    def acc(i):
        a = js['accessors'][i]
        bv = js['bufferViews'][a['bufferView']]
        n = NC[a['type']]
        o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        st = bv.get('byteStride')
        it = np.dtype(COMP[a['componentType']]).itemsize * n
        if st and st != it:
            raw = np.frombuffer(binc, np.uint8, st * a['count'], o).reshape(a['count'], st)[:, :it]
            return np.frombuffer(raw.tobytes(), COMP[a['componentType']]).reshape(a['count'], n).copy()
        return np.frombuffer(binc, COMP[a['componentType']], a['count'] * n, o).reshape(a['count'], n).copy()
    return js, binc, acc


class GlbWriter:
    def __init__(self):
        self.bin = bytearray()
        self.bvs = []
        self.accs = []

    def _pad(self):
        while len(self.bin) % 4:
            self.bin.append(0)

    def add(self, arr, comp, typ, target=None, minmax=False):
        self._pad()
        b = np.ascontiguousarray(arr).tobytes()
        d = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(b)}
        if target:
            d['target'] = target
        self.bin.extend(b)
        self.bvs.append(d)
        a = {'bufferView': len(self.bvs) - 1, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            a['min'] = arr.min(0).tolist()
            a['max'] = arr.max(0).tolist()
        self.accs.append(a)
        return len(self.accs) - 1

    def add_raw(self, b):
        self._pad()
        self.bvs.append({'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(b)})
        self.bin.extend(b)
        return len(self.bvs) - 1

    def write(self, path, js):
        js['accessors'] = self.accs
        js['bufferViews'] = self.bvs
        js['buffers'] = [{'byteLength': len(self.bin)}]
        j = json.dumps(js, separators=(',', ':')).encode()
        while len(j) % 4:
            j += b' '
        self._pad()
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(self.bin)))
            f.write(struct.pack('<II', len(j), 0x4E4F534A))
            f.write(j)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942))
            f.write(self.bin)


def load_rig(path):
    cfg = json.load(open(path))
    J = {k: tuple(v) for k, v in cfg['joints'].items()}
    for k in list(J):
        if k.startswith('Left'):
            x, y, z = J[k]
            J['Right' + k[4:]] = (-x, y, z)
    for b in BONES:
        assert b in J and TAIL[b] in J, 'rig 文件少了关节：' + b
    return cfg, J


def weld(V, F):
    """位置一样（1e-6 米内）的点焊成一个：返回 每个原顶点 → 焊后的编号、焊后的顶点、焊后的三角形（去掉退化的、重复的）"""
    from scipy.spatial import cKDTree
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    pairs = cKDTree(V).query_pairs(1e-6, output_type='ndarray')
    n = len(V)
    k, wid = connected_components(coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n)), directed=False)
    Vw = np.zeros((k, 3))
    Vw[wid] = V
    FW = wid[F]
    FW = FW[(FW[:, 0] != FW[:, 1]) & (FW[:, 1] != FW[:, 2]) & (FW[:, 0] != FW[:, 2])]
    _, ui = np.unique(np.sort(FW, axis=1), axis=0, return_index=True)
    FW = FW[np.sort(ui)]
    r = np.concatenate([FW[:, 0], FW[:, 1], FW[:, 2]])
    c = np.concatenate([FW[:, 1], FW[:, 2], FW[:, 0]])
    npc, _ = connected_components(coo_matrix((np.ones(len(r)), (r, c)), shape=(k, k)), directed=False)
    print('焊接：%d 个点 → %d 个，%d 个三角形，连成 %d 块' % (n, k, len(FW), npc))
    return wid, Vw, FW


def heat_weights(Vw, FW, J):
    """Blender 的自动权重（骨骼热量法）。坐标：glTF (x, y, z) → Blender (x, -z, y)"""
    import bpy
    bl = lambda p: (p[0], -p[2], p[1])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new('body')
    me.from_pydata(np.stack([Vw[:, 0], -Vw[:, 2], Vw[:, 1]], 1).tolist(), [], FW.tolist())
    me.update()
    ob = bpy.data.objects.new('body', me)
    bpy.context.scene.collection.objects.link(ob)
    ad = bpy.data.armatures.new('arm')
    arm = bpy.data.objects.new('arm', ad)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for b in BONES:
        e = ad.edit_bones.new(b)
        e.head = bl(J[b])
        e.tail = bl(J[TAIL[b]])
        eb[b] = e
    for b in BONES:
        if PARENT[b]:
            eb[b].parent = eb[PARENT[b]]
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    W = np.zeros((len(Vw), len(BONES)))
    gi = {g.index: BONES.index(g.name) for g in ob.vertex_groups if g.name in BONES}
    for v in me.vertices:
        for g in v.groups:
            if g.group in gi:
                W[v.index, gi[g.group]] = g.weight
    print('热量法：没分到权重的点 %d 个' % (W.sum(1) < 1e-6).sum())
    return W


def seg_dist(P, a, b):
    a = np.array(a, float)
    b = np.array(b, float)
    ab = b - a
    t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def fence_arms(W, Vw, J, cfg):
    """胳膊的骨头只管胳膊上的点；小臂、手上的点只跟着这条胳膊"""
    ix = {n: i for i, n in enumerate(BONES)}
    f = dict(FENCE, **cfg.get('fence', {}))
    for s, sg in (('Left', 1), ('Right', -1)):
        tip = cfg['fingertip']
        tip = (tip[0] * sg, tip[1], tip[2])
        du = seg_dist(Vw, J[s + 'Arm'], J[s + 'ForeArm'])
        df = seg_dist(Vw, J[s + 'ForeArm'], J[s + 'Hand'])
        dh = seg_dist(Vw, J[s + 'Hand'], tip)
        ok = {s + 'Hand': (dh < f['hand']) | (df < f['hand_from_fore']),
              s + 'ForeArm': (df < f['fore']) | (dh < f['fore_from_hand']) | (du < f['fore_from_upper']),
              s + 'Arm': (du < f['upper']) | (df < f['upper_from_fore'])}
        for b, m in ok.items():
            n0 = (W[:, ix[b]] > 0.02).sum()
            W[~m, ix[b]] = 0.0
            print('  %-13s 留下 %6d 个点（原来 %d）' % (b, (W[:, ix[b]] > 0.02).sum(), n0))
        lower = (df < f['lower_fore']) | (dh < f['lower_hand'])
        mask = np.zeros(len(BONES), bool)
        mask[[ix[s + 'Arm'], ix[s + 'ForeArm'], ix[s + 'Hand']]] = True
        W[np.ix_(lower, ~mask)] = 0.0
    empty = W.sum(1) < 1e-6
    if empty.any():
        from scipy.spatial import cKDTree
        _, nn = cKDTree(Vw[~empty]).query(Vw[empty])
        W[empty] = W[~empty][nn]
    return W / W.sum(1, keepdims=True)


def bone_frame(b, J):
    """骨头在模型里的样子：原点在关节、Y 顺着骨头；手的 Z 横着四根手指（前后），脚的 Z 朝上，别的 Z 朝前"""
    o = np.array(J[b], float)
    y = np.array(J[TAIL[b]], float) - o
    y /= np.linalg.norm(y)
    if b.endswith('Hand'):
        zr = np.array([0.0, 0.0, -1.0])
    elif b.endswith('Foot') or b.endswith('ToeBase'):
        zr = np.array([0.0, 1.0, 0.0])
    else:
        zr = np.array([0.0, 0.0, 1.0])
    z = zr - zr.dot(y) * y
    z /= np.linalg.norm(z)
    M = np.eye(4)
    M[:3, 0] = np.cross(y, z)
    M[:3, 1] = y
    M[:3, 2] = z
    M[:3, 3] = o
    return M


def cmd_rig(src, rig_path, out):
    from scipy.spatial.transform import Rotation
    cfg, J = load_rig(rig_path)
    js, binc, acc = load_glb(src)
    pr = js['meshes'][0]['primitives'][0]
    V = acc(pr['attributes']['POSITION']).astype(np.float64)
    F = acc(pr['indices']).reshape(-1, 3).astype(np.int64)
    print('原模型：%d 个点、%d 个三角形，高 %.3f 米' % (len(V), len(F), V[:, 1].max() - V[:, 1].min()))
    wid, Vw, FW = weld(V, F)
    W = fence_arms(heat_weights(Vw, FW, J), Vw, J, cfg)[wid]
    order = np.argsort(-W, axis=1)[:, :4]
    w4 = np.take_along_axis(W, order, 1)
    w4[w4 < 0.02] = 0.0
    w4 = (w4 / w4.sum(1, keepdims=True)).astype(np.float32)
    j4 = order.astype(np.uint16)
    j4[w4 == 0] = 0
    G = {b: bone_frame(b, J) for b in BONES}
    gw = GlbWriter()
    attrs = {'POSITION': gw.add(V.astype(np.float32), 5126, 'VEC3', 34962, True),
             'NORMAL': gw.add(acc(pr['attributes']['NORMAL']).astype(np.float32), 5126, 'VEC3', 34962),
             'TEXCOORD_0': gw.add(acc(pr['attributes']['TEXCOORD_0']).astype(np.float32), 5126, 'VEC2', 34962),
             'JOINTS_0': gw.add(j4, 5123, 'VEC4', 34962), 'WEIGHTS_0': gw.add(w4, 5126, 'VEC4', 34962)}
    ind = gw.add(F.reshape(-1).astype(np.uint32), 5125, 'SCALAR', 34963)
    images = []
    for im in js.get('images', []):
        bv = js['bufferViews'][im['bufferView']]
        o = bv.get('byteOffset', 0)
        images.append({'name': im.get('name', ''), 'mimeType': im['mimeType'], 'bufferView': gw.add_raw(binc[o:o + bv['byteLength']])})
    nodes = [{'name': 'Armature', 'children': []}]
    ni = {}
    for b in BONES:
        ni[b] = len(nodes)
        nodes.append({'name': 'mixamorig:' + b})
    for b in BONES:
        p = PARENT[b]
        L = G[b] if p is None else np.linalg.inv(G[p]) @ G[b]
        nodes[ni[b]]['translation'] = [float(v) for v in L[:3, 3]]
        nodes[ni[b]]['rotation'] = [float(v) for v in Rotation.from_matrix(L[:3, :3]).as_quat()]
        (nodes[0]['children'] if p is None else nodes[ni[p]].setdefault('children', [])).append(ni[b])
    nodes.append({'name': 'body', 'mesh': 0, 'skin': 0})
    nodes[0]['children'].append(len(nodes) - 1)
    ibm = np.array([np.linalg.inv(G[b]).T.reshape(-1) for b in BONES], np.float32)
    out_js = {'asset': {'version': '2.0', 'generator': 'modou tools/rig_char.py'}, 'scene': 0, 'scenes': [{'name': 'Scene', 'nodes': [0]}],
              'nodes': nodes, 'meshes': [{'name': 'body', 'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0, 'mode': 4}]}],
              'skins': [{'name': 'Armature', 'joints': [ni[b] for b in BONES], 'inverseBindMatrices': gw.add(ibm, 5126, 'MAT4'), 'skeleton': ni['Hips']}],
              'materials': js['materials'], 'textures': js.get('textures', []), 'samplers': js.get('samplers', [{}]), 'images': images}
    gw.write(out, out_js)
    print('写好', out, '骨头', len(BONES), '；下一步：python3 tools/import_char.py', out, '输出目录 名字', cfg.get('import', ''))


def cmd_overlay(src, out, rig_path, view, ch, cy, H, step=0.1):
    """front：相机在 +Z 看过去，图右 = +X；left：相机在 +X 看过去，图右 = -Z"""
    import math
    from PIL import Image, ImageDraw
    _, J = load_rig(rig_path)
    ch, cy, H, step = float(ch), float(cy), float(H), float(step)
    im = Image.open(src).convert('RGB')
    W, Hp = im.size
    ppm = Hp / H
    sgn = 1.0 if view == 'front' else -1.0
    d = ImageDraw.Draw(im)
    sx = lambda h: W / 2 + (h - ch) * ppm * sgn
    sy = lambda y: Hp / 2 - (y - cy) * ppm
    for k in range(math.floor((cy - H / 2) / step), math.ceil((cy + H / 2) / step) + 1):
        d.line([(0, sy(k * step)), (W, sy(k * step))], fill=(200, 40, 40) if k % 5 == 0 else (120, 120, 160))
        d.text((2, sy(k * step) - 10), '%.2f' % (k * step), fill=(150, 0, 0))
    hw = W / ppm / 2
    for k in range(math.floor((ch - hw) / step), math.ceil((ch + hw) / step) + 1):
        d.line([(sx(k * step), 0), (sx(k * step), Hp)], fill=(200, 40, 40) if k % 5 == 0 else (120, 120, 160))
        d.text((sx(k * step) + 2, 2), '%.2f' % (k * step), fill=(0, 0, 150))
    P = lambda p: (sx(p[0] if view == 'front' else p[2]), sy(p[1]))
    for b in BONES:
        d.line([P(J[b]), P(J[TAIL[b]])], fill=(0, 200, 0), width=2)
    for k, p in J.items():
        x, y = P(p)
        d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 0, 0) if 'Left' in k or view == 'front' else (0, 120, 255), width=2)
    im.save(out)


def cmd_wviz(src, mode, out):
    js, binc, acc = load_glb(src)
    pr = js['meshes'][0]['primitives'][0]
    V = acc(pr['attributes']['POSITION']).astype(np.float32)
    JN = acc(pr['attributes']['JOINTS_0']).astype(int)
    WT = acc(pr['attributes']['WEIGHTS_0']).astype(float)
    names = [js['nodes'][j]['name'].replace('mixamorig:', '') for j in js['skins'][0]['joints']]
    W = np.zeros((len(V), len(names)))
    for c in range(4):
        np.add.at(W, (np.arange(len(V)), JN[:, c]), WT[:, c])
    pal = {'Hips': (1, 1, 1), 'Spine': (.6, .6, .6), 'Spine1': (.85, .75, .3), 'Spine2': (.3, .75, .85), 'Neck': (.9, .5, .9), 'Head': (.95, .85, .7),
           'Shoulder': (.9, .3, .3), 'Arm': (.2, .8, .2), 'ForeArm': (.2, .3, .95), 'Hand': (1, .85, .1),
           'UpLeg': (.95, .5, .1), 'Leg': (.5, .1, .8), 'Foot': (.1, .9, .9), 'ToeBase': (.9, .1, .6)}
    if mode == 'dom':
        C = np.zeros((len(V), 3))
        for i, nm in enumerate(names):
            c = np.array(pal.get(nm.replace('Left', '').replace('Right', ''), (.5, .5, .5))) * (0.6 if nm.startswith('Right') else 1.0)
            C += W[:, i:i + 1] * c[None, :]
    else:
        w = W[:, names.index(mode)]
        C = np.stack([np.clip(w * 2, 0, 1), np.clip(1 - np.abs(w - 0.5) * 2, 0, 1) * 0.9, np.clip(1 - w * 2, 0, 1)], 1) * 0.9 + 0.05
    gw = GlbWriter()
    attrs = {'POSITION': gw.add(V, 5126, 'VEC3', 34962, True),
             'NORMAL': gw.add(acc(pr['attributes']['NORMAL']).astype(np.float32), 5126, 'VEC3', 34962),
             'COLOR_0': gw.add(np.concatenate([C, np.ones((len(V), 1))], 1).astype(np.float32), 5126, 'VEC4', 34962)}
    ind = gw.add(acc(pr['indices']).reshape(-1).astype(np.uint32), 5125, 'SCALAR', 34963)
    gw.write(out, {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
                   'meshes': [{'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0}]}],
                   'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1]}, 'doubleSided': True}]})


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'rig':
        cmd_rig(*sys.argv[2:5])
    elif cmd == 'overlay':
        cmd_overlay(*sys.argv[2:])
    elif cmd == 'wviz':
        cmd_wviz(*sys.argv[2:5])
    else:
        print(__doc__)
