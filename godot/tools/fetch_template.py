"""导出模板：Godot 官方的导出模板是一个 1.2G 的 .tpz（zip），这里只按 HTTP Range 从远端取需要的那几个文件（不用整个下载）。
用法：python3 tools/fetch_template.py 网址 输出目录 templates/windows_release_x86_64.exe …
网址：https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz"""
import io, sys, zipfile, urllib.request

URL = sys.argv[1]
OUT = sys.argv[2]
WANT = sys.argv[3:]

def resolve(u):
    req = urllib.request.Request(u, method='HEAD')
    with urllib.request.urlopen(req) as r:
        return r.geturl(), int(r.headers['Content-Length'])

class HttpFile(io.RawIOBase):
    BLK = 4 << 20
    def __init__(self, url):
        self.url, self.size = resolve(url)
        self.pos = 0
        self.cache = {}
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos
    def _blk(self, i):
        if i not in self.cache:
            a = i * self.BLK
            b = min(self.size, a + self.BLK) - 1
            req = urllib.request.Request(self.url, headers={'Range': f'bytes={a}-{b}'})
            with urllib.request.urlopen(req) as r:
                self.cache[i] = r.read()
            if len(self.cache) > 8:
                self.cache.pop(next(iter(self.cache)))
        return self.cache[i]
    def readinto(self, buf):
        n = min(len(buf), self.size - self.pos)
        if n <= 0:
            return 0
        got = 0
        while got < n:
            i = (self.pos + got) // self.BLK
            blk = self._blk(i)
            o = (self.pos + got) - i * self.BLK
            k = min(n - got, len(blk) - o)
            buf[got:got + k] = blk[o:o + k]
            got += k
        self.pos += n
        return n

f = io.BufferedReader(HttpFile(URL), buffer_size=1 << 20)
zf = zipfile.ZipFile(f)
names = zf.namelist()
print('\n'.join(n for n in names if 'windows' in n))
for w in WANT:
    data = zf.read(w)
    p = OUT + '/' + w.split('/')[-1]
    open(p, 'wb').write(data)
    print('取到', p, len(data))
