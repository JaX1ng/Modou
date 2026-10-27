class_name StageView
extends Node3D
## 场景：黄昏的寺院庭院（照参考图）—— 远景板（天、远山、宝塔、瀑布、牌楼、台阶，见 tools/make_stage_plate.py）
## + 3D 的湿石板地（倒映远景、中间铜纹章、枫叶）+ 夕阳的光 + 薄雾 + 飘落的枫叶。
## 场地坐标 1 像素 = Rig.S 米：场地 0 ~ STAGE_W 像素 → x 0 ~ 19.2 米；人站在 z = 0 那个平面上。

const S := Rig.S
const PLATE := preload("res://assets/tex/stage_plate.png")
const FLOOR_SHADER := preload("res://view/shaders/floor.gdshader")
const PLATE_Z := -60.0          # 远景板在多远
const PLATE_H0 := 15.5          # 远景板原图那一截（台阶底到原图上沿，668 行）多高（米）；上面接的那截天按同样比例
const PLATE_ROWS0 := 668.0

var env: Environment
var sun: DirectionalLight3D
var key: DirectionalLight3D
var floor_mat: ShaderMaterial
var leaves: CPUParticles3D

func _ready() -> void:
	var cx := C.STAGE_W * 0.5 * S
	# ---- 天光、雾、色调 ----
	var we := WorldEnvironment.new()
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#eed6ba")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#a58fa3")
	env.ambient_light_energy = 0.62
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.fog_enabled = true
	env.fog_light_color = Color("#e9cfae")
	env.fog_density = 0.006
	env.fog_sky_affect = 0.0
	env.glow_enabled = true
	env.glow_intensity = 0.6
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.1
	we.environment = env
	add_child(we)
	# ---- 光：主光从镜头这边偏左上打过去（暖），夕阳从后面右边逆光（橙，给人一道金边） ----
	key = DirectionalLight3D.new()
	key.light_color = Color("#ffe2bd")
	key.light_energy = 1.05
	key.rotation_degrees = Vector3(-38, -32, 0)
	key.shadow_enabled = true
	key.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	key.directional_shadow_max_distance = 24.0
	key.shadow_opacity = 0.55
	key.shadow_blur = 1.5
	add_child(key)
	sun = DirectionalLight3D.new()
	sun.light_color = Color("#ffa65c")
	sun.light_energy = 0.9
	sun.rotation_degrees = Vector3(-14, 150, 0)
	add_child(sun)
	_tune_for_renderer()
	# ---- 远景板 ----
	var PLATE_H := PLATE_H0 * PLATE.get_height() / PLATE_ROWS0
	var asp := float(PLATE.get_width()) / PLATE.get_height()
	var pw := PLATE_H * asp
	var plate := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(pw, PLATE_H)
	plate.mesh = qm
	var pm := StandardMaterial3D.new()
	pm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	pm.albedo_texture = PLATE
	pm.disable_fog = true
	pm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	plate.material_override = pm
	plate.position = Vector3(cx, PLATE_H * 0.5 - 0.05, PLATE_Z)
	plate.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(plate)
	# ---- 地面 ----
	var fl := MeshInstance3D.new()
	var plm := PlaneMesh.new()
	plm.size = Vector2(150, 72)
	plm.subdivide_width = 2
	plm.subdivide_depth = 2
	fl.mesh = plm
	fl.position = Vector3(cx, 0, PLATE_Z * 0.5 + 6.0)
	floor_mat = ShaderMaterial.new()
	floor_mat.shader = FLOOR_SHADER
	floor_mat.set_shader_parameter("plate", PLATE)
	floor_mat.set_shader_parameter("plate_origin", Vector3(cx - pw * 0.5, -0.05, PLATE_Z))
	floor_mat.set_shader_parameter("plate_size", Vector2(pw, PLATE_H))
	floor_mat.set_shader_parameter("plate_z", PLATE_Z)
	floor_mat.set_shader_parameter("medallion", Vector3(cx, 0.0, -3.2))
	fl.material_override = floor_mat
	add_child(fl)
	# ---- 飘落的枫叶（只是画面） ----
	leaves = CPUParticles3D.new()
	leaves.amount = 60
	leaves.lifetime = 9.0
	leaves.preprocess = 9.0
	leaves.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	leaves.emission_box_extents = Vector3(16, 0.5, 6)
	leaves.position = Vector3(cx, 7.5, -2.5)
	leaves.direction = Vector3(-0.4, -1, 0.1)
	leaves.spread = 25
	leaves.gravity = Vector3(-0.25, -0.35, 0)
	leaves.initial_velocity_min = 0.3
	leaves.initial_velocity_max = 0.8
	leaves.angular_velocity_min = -160
	leaves.angular_velocity_max = 160
	leaves.angle_min = 0
	leaves.angle_max = 360
	leaves.scale_amount_min = 0.7
	leaves.scale_amount_max = 1.3
	var lm := QuadMesh.new()
	lm.size = Vector2(0.11, 0.11)
	var lmat := StandardMaterial3D.new()
	lmat.albedo_texture = _leaf_tex()
	lmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	lmat.alpha_scissor_threshold = 0.4
	lmat.cull_mode = BaseMaterial3D.CULL_DISABLED
	lmat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	lmat.vertex_color_use_as_albedo = true
	lm.material = lmat
	leaves.mesh = lm
	var grad := Gradient.new()
	grad.set_color(0, Color("#c42a14"))
	grad.set_color(1, Color("#e0661c"))
	leaves.color_initial_ramp = grad
	add_child(leaves)

## 桌面版（Forward+）和网页版（Compatibility）算光、色调的方式不一样，同样的灯在 Forward+ 里人显得暗、偏橙：按渲染器各调一套
## （人的亮度另外在 FighterView 里乘一点 gain）。数是对着两边的截图调到看上去一样的
func _tune_for_renderer() -> void:
	if RenderingServer.get_current_rendering_method() == "gl_compatibility":
		return
	key.light_energy = 1.7
	key.light_color = Color("#fff1de")
	sun.light_energy = 0.8
	env.ambient_light_energy = 1.05
	env.ambient_light_color = Color("#bcaab0")

## 一片枫叶的小图（五个尖，红）
static func _leaf_tex() -> ImageTexture:
	var n := 32
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var px := (x + 0.5) / n * 2.0 - 1.0
			var py := (y + 0.5) / n * 2.0 - 1.0
			var a := atan2(py, px) + PI / 2.0
			var r := sqrt(px * px + py * py)
			var lobe := 0.55 + 0.4 * pow(absf(cos(a * 2.5)), 0.6)
			var inside := r < lobe * 0.95 and py < 0.75
			var stem := absf(px) < 0.05 and py > 0.2 and py < 0.95
			img.set_pixel(x, y, Color(1, 1, 1, 1) if (inside or stem) else Color(1, 1, 1, 0))
	return ImageTexture.create_from_image(img)
