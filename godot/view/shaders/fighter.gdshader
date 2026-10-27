shader_type spatial;
// 人物：每个顶点记着自己是哪一块（COLOR.r × 16 = 区域编号），按编号从颜色表取颜色；COLOR.g 明暗（缝里、底下暗一点）。
// 打光（黄昏的庭院，照参考图）：主光是背后偏一侧的夕阳 —— 迎光面暖、背光面偏紫灰，过渡柔和（两档的卡通光 + 一点渐变）；
// 轮廓上一道金色的逆光（夕阳从背后打过来，人的边亮一圈）。挨打时整个人白一下（flash）。
// 走透明那一趟（写 ALPHA）但照样写深度：这样画在人身后的特效层（render_priority 0、不比深度）先画，人（render_priority 1）盖在上面
render_mode cull_back, depth_draw_always;

uniform vec4 regions[16];
uniform float flash = 0.0;
uniform vec3 flash_col : source_color = vec3(1.0, 0.98, 0.94);
uniform vec3 rim_col : source_color = vec3(1.0, 0.74, 0.42);
uniform float rim_amt = 0.55;
uniform vec3 shade_col : source_color = vec3(0.56, 0.5, 0.62);
uniform float alpha = 1.0;

varying flat float v_reg;   // 区域编号不能在三角形里插值（插出来是别的编号，一道一道的）
varying float v_shade;

void vertex() {
	v_reg = COLOR.r * 16.0;
	v_shade = COLOR.g;
}

void fragment() {
	int r = clamp(int(floor(v_reg)), 0, 15);
	vec3 base = regions[r].rgb;
	ALBEDO = base * mix(0.7, 1.0, v_shade);
	ROUGHNESS = 0.92;
	SPECULAR = 0.1;
	EMISSION = flash_col * flash;
	ALPHA = alpha;
}

void light() {
	float ndl = dot(NORMAL, LIGHT);
	// 卡通两档，中间软一点过渡；背光面不是黑的，是偏紫灰（天光）
	float lit = smoothstep(-0.08, 0.28, ndl);
	vec3 band = mix(shade_col, vec3(1.0), lit);
	DIFFUSE_LIGHT += band * LIGHT_COLOR * ATTENUATION / PI;
	// 逆光的金边：只在边缘（法线和视线快垂直了）、光从人背后打过来、这一面朝着光的时候有 —— 一道细的亮边，不是一层光
	float edge = smoothstep(0.62, 0.92, 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0));
	float back = smoothstep(-0.1, 0.7, dot(-VIEW, LIGHT));
	float side = smoothstep(0.0, 0.35, ndl);
	SPECULAR_LIGHT += rim_col * LIGHT_COLOR * ATTENUATION / PI * edge * back * side * rim_amt;
}
