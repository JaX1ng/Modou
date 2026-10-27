shader_type spatial;
// 人在湿地面上的倒影（照参考图：雨后的石板地，积水里倒映着人）：同一个模型按地面（y = 0）上下翻过来，只在积水的地方露出来、被落叶挡住，
// 离地越远越淡。画在地面之后、人身后的特效之前（render_priority -1、不比深度）；人自己画在最上面把脚盖住。
render_mode world_vertex_coords, cull_disabled, depth_test_disabled, depth_draw_never, unshaded, fog_disabled, shadows_disabled;

#include "res://view/shaders/floor_common.gdshaderinc"

uniform vec4 regions[16];
uniform float strength = 0.62;
uniform float wet = 0.7;
uniform vec3 tint : source_color = vec3(0.86, 0.74, 0.62);
uniform float flash = 0.0;

varying flat float v_reg;
varying float v_shade;
varying vec3 w_pos;

void vertex() {
	VERTEX.y = -VERTEX.y;
	NORMAL.y = -NORMAL.y;
	w_pos = VERTEX;
	v_reg = COLOR.r * 16.0;
	v_shade = COLOR.g;
}

void fragment() {
	int r = clamp(int(floor(v_reg)), 0, 15);
	vec3 base = regions[r].rgb * mix(0.7, 1.0, v_shade);
	// 这一点倒映在地上的哪儿：镜头到「翻过来的那一点」的连线和地面的交点
	vec3 cam = (INV_VIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	vec3 d = w_pos - cam;
	float t = cam.y / max(cam.y - w_pos.y, 1e-4);
	vec2 fp = (cam + d * t).xz;
	vec2 wd = wet_at(fp, wet);
	float leaf = leaf_at(fp).x;
	vec3 v = normalize(d);
	float fres = 0.25 + 0.75 * pow(1.0 - clamp(-v.y, 0.0, 1.0), 4.0);
	float k = (wd.x * 0.85 + wd.y * 0.2) * fres * (1.0 - leaf);
	float fade = exp(-max(0.0, -w_pos.y) * 0.55);
	ALBEDO = mix(base * tint, vec3(1.0, 0.97, 0.92), flash * 0.6);
	ALPHA = clamp(k * fade * strength, 0.0, 1.0);
}
