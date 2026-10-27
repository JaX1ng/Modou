shader_type spatial;
// 带贴图的人物模型在湿地面上的倒影：和 fighter_reflect.gdshader 一样（按地面上下翻过来、只在积水里露出来、被落叶挡住、离地越远越淡），颜色从贴图来。
render_mode world_vertex_coords, cull_disabled, depth_test_disabled, depth_draw_never, unshaded, fog_disabled, shadows_disabled;

#include "res://view/shaders/floor_common.gdshaderinc"

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_disable;
uniform float strength = 0.62;
uniform float wet = 0.7;
uniform vec3 tint : source_color = vec3(0.86, 0.74, 0.62);
uniform float flash = 0.0;

varying vec3 w_pos;

void vertex() {
	VERTEX.y = -VERTEX.y;
	NORMAL.y = -NORMAL.y;
	w_pos = VERTEX;
}

void fragment() {
	vec3 base = texture(albedo_tex, UV).rgb;
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
