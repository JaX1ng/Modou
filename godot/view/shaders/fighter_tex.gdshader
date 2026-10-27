shader_type spatial;
// 人物（AI 生成的正式模型，带一张贴图）：颜色基本照贴图（Meshy 的贴图里本来就画了明暗），灯只轻轻打一点（3.0.0-alpha.4 起，Jack：光照不要那么明显）：
//   亮度 = 底子 fill（不跟灯走，暖白）+ 场景的灯（主光、夕阳）× light_k；背光的那面只暗一点（shade_col），明暗交界拉得很开；轮廓上一道很淡的金色逆光。
//   场景的天光（ambient）不吃：场景的灯加天光在桌面版有两倍多亮，白衣服、脸会冲成一片白；天光又偏紫，会把贴图染灰。底子用 fill 代替。
// 挨打时整个人白一下（flash）。和简易模型一样走透明那一趟、照样写深度（画在人身后的特效层先画，人盖在上面）。
// 不吃场景的雾：镜头离人 20 米上下，雾给人蒙一层米色，贴图里的深色（藏青、墨色镶边）会被抬成灰的（简易模型的颜色是开着雾调的）
render_mode cull_back, depth_draw_always, fog_disabled, ambient_light_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform float flash = 0.0;
uniform vec3 flash_col : source_color = vec3(1.0, 0.98, 0.94);
uniform vec3 fill_col : source_color = vec3(1.0, 0.97, 0.93);
uniform float fill = 0.62;         // 底子多亮（不管朝哪都有这么亮）
uniform float light_k = 0.26;      // 场景的灯算几成（越小明暗越不明显；网页版灯暗，FighterView 里另乘一点）
uniform vec3 shade_col : source_color = vec3(0.45, 0.42, 0.48);
uniform float lit_lo = -0.45;      // 背光面 → 迎光面从哪儿开始过渡（N·L）
uniform float lit_hi = 0.65;       // 到哪儿过渡完（两个数拉得越开，明暗交界越柔）
uniform vec3 rim_col : source_color = vec3(1.0, 0.74, 0.42);
uniform float rim_amt = 0.15;
uniform float alpha = 1.0;
uniform float gain = 1.0;          // 整个人再乘多少（按渲染器调）

void fragment() {
	vec3 a = texture(albedo_tex, UV).rgb * gain;
	ALBEDO = a;
	ROUGHNESS = 0.9;
	SPECULAR = 0.0;
	EMISSION = a * fill_col * fill + flash_col * flash;
	ALPHA = alpha;
}

void light() {
	float ndl = dot(NORMAL, LIGHT);
	float lit = smoothstep(lit_lo, lit_hi, ndl);
	vec3 band = mix(shade_col, vec3(1.0), lit);
	DIFFUSE_LIGHT += band * LIGHT_COLOR * ATTENUATION / PI * light_k;
	float edge = smoothstep(0.62, 0.92, 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0));
	float back = smoothstep(-0.1, 0.7, dot(-VIEW, LIGHT));
	float side = smoothstep(0.0, 0.35, ndl);
	SPECULAR_LIGHT += rim_col * LIGHT_COLOR * ATTENUATION / PI * edge * back * side * rim_amt;
}
