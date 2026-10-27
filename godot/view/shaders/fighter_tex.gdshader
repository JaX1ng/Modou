shader_type spatial;
// 人物（AI 生成的正式模型，带一张贴图）：打光和 fighter.gdshader 一样（黄昏的庭院：迎光面暖、背光面偏紫灰、轮廓上一道金色逆光），颜色从贴图来。
// 挨打时整个人白一下（flash）。和简易模型一样走透明那一趟、照样写深度（画在人身后的特效层先画，人盖在上面）。
// 不吃场景的雾：镜头离人 20 米上下，雾给人蒙一层米色，贴图里的深色（藏青、墨色镶边）会被抬成灰的（简易模型的颜色是开着雾调的）
render_mode cull_back, depth_draw_always, fog_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform float flash = 0.0;
uniform vec3 flash_col : source_color = vec3(1.0, 0.98, 0.94);
uniform vec3 rim_col : source_color = vec3(1.0, 0.74, 0.42);
uniform float rim_amt = 0.55;
uniform vec3 shade_col : source_color = vec3(0.56, 0.5, 0.62);
uniform float alpha = 1.0;
uniform float gain = 1.0;          // 整个人亮多少（桌面版 Forward+ 和网页版算光不一样，按渲染器调成看上去一样）

void fragment() {
	ALBEDO = texture(albedo_tex, UV).rgb * gain;
	ROUGHNESS = 0.9;
	SPECULAR = 0.12;
	EMISSION = flash_col * flash;
	ALPHA = alpha;
}

void light() {
	float ndl = dot(NORMAL, LIGHT);
	float lit = smoothstep(-0.08, 0.28, ndl);
	vec3 band = mix(shade_col, vec3(1.0), lit);
	DIFFUSE_LIGHT += band * LIGHT_COLOR * ATTENUATION / PI;
	float edge = smoothstep(0.62, 0.92, 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0));
	float back = smoothstep(-0.1, 0.7, dot(-VIEW, LIGHT));
	float side = smoothstep(0.0, 0.35, ndl);
	SPECULAR_LIGHT += rim_col * LIGHT_COLOR * ATTENUATION / PI * edge * back * side * rim_amt;
}
