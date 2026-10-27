// 地面（floor.gdshader）和人在水里的倒影（fighter_reflect.gdshader）共用：噪声、积水在哪、枫叶在哪 —— 两边算得一样，倒影只出现在积水里、被叶子挡住

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h11(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

// 积水：一片一片（低频噪声）。返回 (积水, 湿)
vec2 wet_at(vec2 p, float w) {
	float puddle = smoothstep(0.42, 0.62, fbm(p * 0.35 + 3.1)) * w;
	return vec2(puddle, w * 0.5 + puddle * 0.5);
}

// 枫叶：一格一片，五角的形状。返回 (盖住多少, 颜色深浅 0~1)
vec2 leaf_at(vec2 p) {
	vec2 lc = p * 1.6;
	vec2 li = floor(lc);
	float lh = h21(li);
	float leaf = 0.0;
	if (lh > 0.78) {
		vec2 c = li + vec2(h21(li + 1.0), h21(li + 2.0)) * 0.7 + 0.15;
		vec2 q = lc - c;
		float a0 = h21(li + 3.0) * 6.2832;
		float aa = atan(q.y, q.x) + a0;
		float rad = 0.16 * (0.65 + 0.35 * abs(cos(aa * 2.5))) * (0.7 + 0.5 * h21(li + 4.0));
		leaf = 1.0 - smoothstep(rad * 0.85, rad, length(q));
	}
	return vec2(leaf, h21(li + 7.0));
}
