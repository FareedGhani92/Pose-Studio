# OpenCV Zoo components

`mp_persondet.py` and `mp_pose.py` originate from the OpenCV Zoo:
- https://github.com/opencv/opencv_zoo/tree/main/models/person_detection_mediapipe
- https://github.com/opencv/opencv_zoo/tree/main/models/pose_estimation_mediapipe

Retrieved September 28, 2026. The models in `../models` are the 2023mar ONNX versions of MediaPipe's person detector and pose estimator from those same directories. These components are licensed under Apache 2.0; the full license is in `LICENSE`.

Local change: person-detector NMS now passes bounding boxes as x/y/width/height, as required by OpenCV. Original output coordinates are retained.
