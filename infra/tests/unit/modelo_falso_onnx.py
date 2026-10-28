"""Mini "U-Net" ONNX de juguete para probar el camino completo sin los pesos
reales (98 MB): logits = 6 * canal_R_normalizado - 0.5. Un píxel con R alto
(rojo) da probabilidad > 0.5; el fondo gris y el relleno del lienzo no."""
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper


def construir(ruta, size=1024):
    x = helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 3, size, size])
    y = helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 1, size, size])
    nodos = [
        helper.make_node("Slice", ["x", "ini", "fin", "ejes"], ["r"]),
        helper.make_node("Mul", ["r", "k"], ["rk"]),
        helper.make_node("Add", ["rk", "b"], ["y"]),
    ]
    inits = [
        helper.make_tensor("ini", TensorProto.INT64, [1], [0]),
        helper.make_tensor("fin", TensorProto.INT64, [1], [1]),
        helper.make_tensor("ejes", TensorProto.INT64, [1], [1]),
        helper.make_tensor("k", TensorProto.FLOAT, [1], [6.0]),
        helper.make_tensor("b", TensorProto.FLOAT, [1], [-0.5]),
    ]
    g = helper.make_graph(nodos, "fake_unet", [x], [y], inits)
    m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)])
    m.ir_version = 8
    onnx.checker.check_model(m)
    onnx.save(m, str(ruta))
    return ruta


def construir_yolo(ruta, caja_xyxy=(200, 300, 600, 500), conf=0.9, size=1024, nc_coefs=32, extra=()):
    """YOLOv8n-seg de juguete: salidas CONSTANTES con el formato del real
    (output0 [1,37,N] = xywh en píxeles del lienzo + conf + 32 coeficientes;
    output1 [1,32,size/4,size/4] = prototipos). Una detección en `caja_xyxy`
    (píxeles del lienzo) cuya máscara es el canal 0 de los prototipos (+10
    en todo el prototipo; la máscara final queda recortada a la caja).
    `extra`: más detecciones (x1, y1, x2, y2, conf) con la misma máscara."""
    n = (size // 32) ** 2 + (size // 16) ** 2 + (size // 8) ** 2  # 21504 a 1024
    out0 = np.zeros((1, 4 + 1 + nc_coefs, n), np.float32)
    for k, (x1, y1, x2, y2, c) in enumerate([(*caja_xyxy, conf), *extra]):
        out0[0, :5, k] = [(x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1, c]
        out0[0, 5, k] = 1.0  # coeficiente del canal 0
    protos = np.zeros((1, nc_coefs, size // 4, size // 4), np.float32)
    protos[0, 0] = 10.0

    x = helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, size, size])
    o0 = helper.make_tensor_value_info("output0", TensorProto.FLOAT, list(out0.shape))
    o1 = helper.make_tensor_value_info("output1", TensorProto.FLOAT, list(protos.shape))
    nodos = [
        helper.make_node("Identity", ["c0"], ["output0"]),
        helper.make_node("Identity", ["c1"], ["output1"]),
    ]
    inits = [numpy_helper.from_array(out0, "c0"), numpy_helper.from_array(protos, "c1")]
    g = helper.make_graph(nodos, "fake_yolo", [x], [o0, o1], inits)
    m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)])
    m.ir_version = 8
    onnx.checker.check_model(m)
    onnx.save(m, str(ruta))
    return ruta
