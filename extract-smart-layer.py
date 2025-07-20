import sys
import re
import math
import json

from psd_tools import PSDImage
from psd_tools.api.smart_object import SmartObject


def calculate_transformed_size(w_original, h_original, s_x, s_y, theta_deg):
    """
    计算变换后尺寸
    w_original: 原始宽度
    h_original: 原始高度
    s_x: 缩放比例X
    s_y: 缩放比例Y
    theta_deg: 旋转角度
    """
    # 将角度从度转换为弧度
    theta_rad = math.radians(theta_deg)

    # 计算缩放后尺寸
    w_s = w_original * s_x
    h_s = h_original * s_y

    # 计算三角函数
    cos_theta = math.cos(theta_rad)
    sin_theta = math.sin(theta_rad)

    # 应用公式（先缩放后旋转）
    w_new = abs(w_s * cos_theta) + abs(h_s * sin_theta)
    h_new = abs(w_s * sin_theta) + abs(h_s * cos_theta)

    return w_new, h_new


def parse_perspective_warp(smart_object: SmartObject):
    try:
        filterFXList = smart_object._config.data[b"filterFX"][b"filterFXList"]
        print(filterFXList)
        for filterFX in filterFXList:
            if "透视变形" in str(filterFX[b"Nm  "]):
                return {
                    "srcPoints": [
                        float(filterFX[b"Fltr"][b"vertices"][0][b"Hrzn"]),
                        float(filterFX[b"Fltr"][b"vertices"][0][b"Vrtc"]),
                        float(filterFX[b"Fltr"][b"vertices"][1][b"Hrzn"]),
                        float(filterFX[b"Fltr"][b"vertices"][1][b"Vrtc"]),
                        float(filterFX[b"Fltr"][b"vertices"][2][b"Hrzn"]),
                        float(filterFX[b"Fltr"][b"vertices"][2][b"Vrtc"]),
                        float(filterFX[b"Fltr"][b"vertices"][3][b"Hrzn"]),
                        float(filterFX[b"Fltr"][b"vertices"][3][b"Vrtc"]),
                    ],
                    "dstPoints": [
                        float(filterFX[b"Fltr"][b"warpedVertices"][0][b"Hrzn"]),
                        float(filterFX[b"Fltr"][b"warpedVertices"][0][b"Vrtc"]),
                        float(filterFX[b"Fltr"][b"warpedVertices"][1][b"Hrzn"]),
                        float(filterFX[b"Fltr"][b"warpedVertices"][1][b"Vrtc"]),
                        float(filterFX[b"Fltr"][b"warpedVertices"][2][b"Hrzn"]),
                        float(filterFX[b"Fltr"][b"warpedVertices"][2][b"Vrtc"]),
                        float(filterFX[b"Fltr"][b"warpedVertices"][3][b"Hrzn"]),
                        float(filterFX[b"Fltr"][b"warpedVertices"][3][b"Vrtc"]),
                    ],
                }
        else:
            return None
    except Exception as e:
        print("parse_perspective_warp error", e)
        return None


def parse_layer_name(layer_name: str):
    name = layer_name.split("@")[0]
    name = name.split("&")[0]

    rotate = 0
    rotate_str = re.search(r"@[-]?\d*[.]\d*", layer_name)
    if rotate_str:
        rotate_str = rotate_str.group()[1:]
        if rotate_str[0] == "-":
            rotate = -float(rotate_str[1:])
        else:
            rotate = float(rotate_str)

    scaleX = 100
    scaleY = 100
    scale_str = re.search(r"&-?\d*\.\d*(\*-?\d*\.\d*)?", layer_name)
    if scale_str:
        scale_str = scale_str.group()[1:]
        if "*" in scale_str:
            scale_str = scale_str.split("*")
            scaleX = float(scale_str[0])
            scaleY = float(scale_str[1])
        else:
            scaleX = float(scale_str)
            scaleY = float(scale_str)
    # print(layer_name,"scale_str", scale_str)
    return name, rotate, scaleX / 100, scaleY / 100


def extract_smart_layers(psd: PSDImage):
    smart_layer_data = []
    for layer in psd:
        if layer.kind == "smartobject" and layer.is_visible():
            layer_data = {}
            layer_data["src"] = layer.name
            name, rotate, scaleX, scaleY = parse_layer_name(layer.name)
            layer_data["name"] = name
            layer_data["rotate"] = rotate
            layer_data["scaleX"] = scaleX
            layer_data["scaleY"] = scaleY

            layer_data["position"] = {}
            layer_data["position"]["x"] = layer.bbox[0]
            layer_data["position"]["y"] = layer.bbox[1]
            # layer_data['position']['w'] = layer.bbox[2] - layer.bbox[0]
            # layer_data['position']['h'] = layer.bbox[3] - layer.bbox[1]

            smart_layer = SmartObject(layer)
            if smart_layer.warp[b"warpStyle"].enum == b"warpCustom":
                h = list(
                    smart_layer.warp[b"customEnvelopeWarp"][b"meshPoints"][
                        b"Hrzn"
                    ].values
                )
                v = list(
                    smart_layer.warp[b"customEnvelopeWarp"][b"meshPoints"][
                        b"Vrtc"
                    ].values
                )
                layer_data["type"] = "custom"
                layer_data["warp"] = []
                for i in range(len(h)):
                    layer_data["warp"].append([h[i], v[i]])

                # 判断是否变形
                top = smart_layer.warp[b"bounds"][b"Top "].value
                left = smart_layer.warp[b"bounds"][b"Left"].value
                bottom = smart_layer.warp[b"bounds"][b"Btom"].value
                right = smart_layer.warp[b"bounds"][b"Rght"].value

                width = right - left
                height = bottom - top

                origin_warp_points = [
                    [0, 0],
                    [width / 3, 0],
                    [width / 3 * 2, 0],
                    [width, 0],
                    [0, height / 3],
                    [width / 3, height / 3],
                    [width / 3 * 2, height / 3],
                    [width, height / 3],
                    [0, height / 3 * 2],
                    [width / 3, height / 3 * 2],
                    [width / 3 * 2, height / 3 * 2],
                    [width, height / 3 * 2],
                    [0, height],
                    [width / 3, height],
                    [width / 3 * 2, height],
                    [width, height],
                ]
                flag = 0
                for i in range(len(origin_warp_points)):
                    warp_point = layer_data["warp"][i]
                    origin_point = origin_warp_points[i]
                    if (
                        warp_point[0] == origin_point[0]
                        and warp_point[1] == origin_point[1]
                    ):
                        flag += 1
                if flag == 16:
                    del layer_data["warp"]  # 无需变形

            # 透视变形
            # transform_data = parse_perspective_warp(smart_layer)
            # print(transform_data)
            # if transform_data:
            #     layer_data["perspective"] = transform_data
            layer_data["transform"] = {
                "srcPoints": None,
                "dstPoints": smart_layer.transform_box,
            }
            smart_layer_data.append(layer_data)
        elif layer.is_visible() and layer.kind == "group":
            smart_layer_data.extend(extract_smart_layers(layer))
        elif layer.is_visible() and layer.name.lower() in [
            "背景",
            "背景图",
            "bg",
            "background",
        ]:
            smart_layer_data.append(
                {
                    "src": layer.name,
                    "name": layer.name,
                    "type": "background",
                    "index": 0,
                }
            )
        elif layer.is_visible() and layer.name.lower() in [
            "纹理",
            "前景",
            "前景图",
            "fg",
            "foreground",
        ]:
            smart_layer_data.append(
                {
                    "src": layer.name,
                    "name": layer.name,
                    "type": "foreground",
                    "index": 0,
                    "opacity": 1,
                }
            )
    return smart_layer_data


def main():
    psd_path = sys.argv[1]
    psd = PSDImage.open(psd_path)
    smart_layer_data = extract_smart_layers(psd)
    # print(json.dumps(smart_layer_data, indent=4))
    with open("smart_layer_data.json", "w", encoding="utf-8") as f:
        json.dump(smart_layer_data, f, indent=4, ensure_ascii=False)


if __name__ == "__main__":
    main()


# if __name__ == '__main__':
# psd = PSDImage.open("input.psd")
# layer = psd.find('input')
# if layer is None:
#     exit()
# print(dir(layer.vector_mask.paths[0][0]))
# # m = Mask(layer)
# # print( float(layer.vector_mask.paths[0][0]) )
# # print(m.size)
# # print(m.background_color)
# # print(m.flags)
# # print(m.parameters)
# # print(m.flags)
# # print(m.real_flags)
# print(len(layer.vector_mask.paths))
# anchors = []
# for subpath in layer.vector_mask.paths:
#     anchors.append([(
#         int(knot.anchor[1] * psd.width),
#         int(knot.anchor[0] * psd.height),
#     ) for knot in subpath])
# print(anchors)
# input("Press Enter to continue...")


# print("=============================")

# print(layer.warp[b"customEnvelopeWarp"][b"meshPoints"][b"Hrzn"].values)
# print(layer.warp[b"customEnvelopeWarp"][b"meshPoints"][b"Vrtc"].values)

# print("--------------------------------")
# print(layer.warp[b"warpStyle"].enum)
# print(layer.warp[b"warpValue"].value)
# print(layer.warp[b"warpPerspective"].value)
# print(layer.warp[b"warpPerspectiveOther"].value)
# print(layer.warp[b"warpRotate"].enum)
# print(layer.warp[b"bounds"][b"Top "].value)
# print(layer.warp[b"bounds"][b"Left"].value)
# print(layer.warp[b"bounds"][b"Btom"].value)
# print(layer.warp[b"bounds"][b"Rght"].value)
# print(layer.warp[b"uOrder"].value)
# print(layer.warp[b"vOrder"].value)
