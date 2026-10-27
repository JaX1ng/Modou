shader_type spatial;
// 人物的墨线（描边）：同一个模型沿法线往外胀一点、只画背面 —— 人的轮廓外面一圈浓墨（2D 版是墨线小人，这里留一道墨边）。
// 和人一样走透明那一趟、render_priority 1（不然会被画在人身后的特效层盖住）。
render_mode cull_front, unshaded, depth_draw_always, fog_disabled, shadows_disabled;

uniform float width = 0.011;                                  // 多粗（米；1 场地像素 = 0.012 米）
uniform vec3 line_col : source_color = vec3(0.09, 0.07, 0.06);
uniform float alpha = 1.0;

void vertex() {
	VERTEX += NORMAL * width;
}

void fragment() {
	ALBEDO = line_col;
	ALPHA = alpha;
}
