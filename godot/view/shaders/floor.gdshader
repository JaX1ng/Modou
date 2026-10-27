shader_type spatial;
// 庭院地面（照参考图）：一块一块的大石板（灰褐、有磨损），雨后湿的 —— 积水的地方像镜子，倒映远景（远景板是一块竖着的平面，
// 照反射光线算到它上面取颜色，所以倒影的位置是对的）；中间一个铜的圆形纹章；地上散着红枫叶。
render_mode cull_back;

uniform sampler2D plate : source_color, filter_linear_mipmap, repeat_disable;
uniform vec3 plate_origin;      // 远景板左下角（世界坐标）
uniform vec2 plate_size;        // 远景板宽高（米）
uniform float plate_z;          // 远景板在哪个 z
uniform vec3 medallion = vec3(9.6, 0.0, -2.6);   // 纹章中心（世界坐标）、半径在 z
uniform float medallion_r = 3.4;
uniform vec3 stone_a : source_color = vec3(0.42, 0.37, 0.34);
uniform vec3 stone_b : source_color = vec3(0.30, 0.27, 0.26);
uniform vec3 grout : source_color = vec3(0.10, 0.08, 0.08);
uniform vec3 bronze : source_color = vec3(0.62, 0.45, 0.22);
uniform vec3 leaf_a : source_color = vec3(0.72, 0.10, 0.06);
uniform vec3 leaf_b : source_color = vec3(0.86, 0.32, 0.08);
uniform float wet = 0.7;

varying vec3 wpos;

#include "res://view/shaders/floor_common.gdshaderinc"

// 石板：一行一行（行深 1.5 米），每一行里按哈希切成长短不一的板（1.4 ~ 2.6 米），行和行错开
vec3 slab(vec2 p) {
	float row = floor(p.y / 1.5);
	float off = h11(row) * 3.0;
	float x = p.x + off;
	// 这一行的板：每 2 米一格，格里再按哈希挪接缝
	float cell = floor(x / 2.0);
	float seam = cell * 2.0 + (h11(cell + row * 17.0) - 0.5) * 0.9;
	float seam2 = (cell + 1.0) * 2.0 + (h11(cell + 1.0 + row * 17.0) - 0.5) * 0.9;
	float id = x < seam ? cell - 1.0 : (x > seam2 ? cell + 1.0 : cell);
	float dx = min(abs(x - seam), abs(x - seam2));
	float dy = min(fract(p.y / 1.5), 1.0 - fract(p.y / 1.5)) * 1.5;
	return vec3(min(dx, dy), id + row * 31.0, row);
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = wpos.xz;
	vec3 s = slab(p);
	float d = s.x;
	float r = h11(s.y);
	// 石头本色：每块深浅不一，表面一点磨损的斑
	vec3 col = mix(stone_b, stone_a, r * 0.7 + 0.3 * fbm(p * 1.3));
	col *= 0.85 + 0.25 * fbm(p * 6.0 + s.y);
	float g = 1.0 - smoothstep(0.012, 0.035, d);          // 石缝
	col = mix(col, grout, g * 0.85);
	// 纹章：同心几圈铜，圈里一圈一圈的回纹（参考图地上那个）
	vec2 m = p - medallion.xz;
	m.y *= 1.0;
	float rr = length(m) / medallion_r;
	float ang = atan(m.y, m.x);
	float ring = 0.0;
	ring += 1.0 - smoothstep(0.006, 0.02, abs(rr - 1.0));
	ring += 1.0 - smoothstep(0.006, 0.02, abs(rr - 0.93));
	ring += 1.0 - smoothstep(0.004, 0.016, abs(rr - 0.72));
	ring += 1.0 - smoothstep(0.004, 0.016, abs(rr - 0.66));
	ring += 1.0 - smoothstep(0.004, 0.014, abs(rr - 0.38));
	float band1 = step(0.72, rr) * step(rr, 0.93);
	float teeth = step(0.5, fract(ang / 6.2832 * 48.0)) * band1 * (1.0 - smoothstep(0.0, 0.03, abs(rr - 0.825) - 0.05));
	float band2 = step(0.38, rr) * step(rr, 0.66);
	float swirl = band2 * smoothstep(0.55, 0.8, sin(ang * 12.0 + rr * 30.0) * 0.5 + 0.5) * 0.6;
	float core = 1.0 - smoothstep(0.0, 0.04, abs(rr - 0.18)) + (1.0 - smoothstep(0.1, 0.16, rr)) * 0.35;
	float med = clamp(ring + teeth * 0.7 + swirl + core, 0.0, 1.0) * step(rr, 1.05);
	col = mix(col, bronze * (0.8 + 0.4 * fbm(p * 8.0)), med * 0.85);
	// 积水：一片一片（低频噪声），积水的地方更暗、更光滑、倒映远景
	vec2 wd = wet_at(p, wet);
	float puddle = wd.x;
	float damp = wd.y;
	// 枫叶：一格一片，五角的形状
	vec2 lf = leaf_at(p);
	float leaf = lf.x;
	vec3 lcol = mix(leaf_a, leaf_b, lf.y);
	col = mix(col, lcol, leaf * 0.92);
	col *= 1.0 - damp * 0.35;
	ALBEDO = col;
	ROUGHNESS = mix(0.85, 0.12, max(puddle, damp * 0.4) * (1.0 - leaf));
	SPECULAR = 0.5;
	// 倒影：视线在地面反射以后打到远景板上的那一点
	vec3 cam = (INV_VIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	vec3 v = normalize(wpos - cam);
	vec3 rd = reflect(v, vec3(0.0, 1.0, 0.0));
	float t = (plate_z - wpos.z) / min(rd.z, -1e-4);
	vec3 hit = wpos + rd * t;
	vec2 uv = vec2((hit.x - plate_origin.x) / plate_size.x, 1.0 - (hit.y - plate_origin.y) / plate_size.y);
	vec3 refl = texture(plate, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
	// 水面稍微晃一点
	float fres = 0.25 + 0.75 * pow(1.0 - clamp(-v.y, 0.0, 1.0), 4.0);
	float k = (puddle * 0.85 + damp * 0.2) * fres * (1.0 - leaf) * step(0.0, uv.y);
	EMISSION = refl * k * 0.9;
	ALBEDO *= 1.0 - k * 0.7;
}
