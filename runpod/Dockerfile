FROM nvidia/cuda:11.8.0-cudnn8-devel-ubuntu22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    MUSE_TALK_HOME=/opt/MuseTalk \
    PATH=/opt/venv/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git curl ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv && \
    python -m pip install --upgrade "pip<25" "setuptools<70" "wheel<0.44" && \
    python -m pip install --no-cache-dir \
      torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 \
      --index-url https://download.pytorch.org/whl/cu118

WORKDIR /opt
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git MuseTalk

COPY runpod/requirements-worker.txt /tmp/requirements-worker.txt
RUN python -m pip install --no-cache-dir -r /tmp/requirements-worker.txt

# Install the OpenMMLab inference stack without allowing its metadata to replace
# MuseTalk's conservative NumPy/OpenCV pins.
RUN python -m pip install --no-cache-dir --no-deps mmengine==0.10.7 && \
    python -m pip install --no-cache-dir \
      addict termcolor "yapf<0.41" "matplotlib<3.8" && \
    python -m pip install --no-cache-dir --no-deps mmcv==2.0.1 \
      -f https://download.openmmlab.com/mmcv/dist/cu118/torch2.0/index.html && \
    python -m pip install --no-cache-dir --no-build-isolation chumpy==0.70 && \
    python -m pip install --no-cache-dir \
      json-tricks munkres xtcocotools pycocotools shapely terminaltables && \
    python -m pip install --no-cache-dir --no-deps mmdet==3.1.0 mmpose==1.1.0 && \
    python -m pip uninstall -y opencv-python || true

RUN python -m pip install --no-cache-dir --force-reinstall --no-deps \
      numpy==1.23.5 opencv-python-headless==4.9.0.80 && \
    python - <<'PY'
import numpy, cv2, torch
assert numpy.__version__ == '1.23.5', numpy.__version__
assert cv2.__version__.startswith('4.9.'), cv2.__version__
assert torch.__version__.startswith('2.0.1'), torch.__version__
assert torch.version.cuda == '11.8', torch.version.cuda
print('Pinned build runtime:', numpy.__version__, cv2.__version__, torch.__version__, torch.version.cuda)
PY

# Keep the 3.4 GB MuseTalk V1.5 UNet out of the image; RunPod model caching
# supplies it at runtime. Only the smaller auxiliary assets are baked here.
COPY runpod/download_models.sh /tmp/download_models.sh
RUN chmod +x /tmp/download_models.sh && /tmp/download_models.sh && \
    rm -rf /root/.cache/pip /tmp/*


FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    MUSE_TALK_HOME=/opt/MuseTalk \
    PATH=/opt/venv/bin:$PATH \
    RUNPOD_INIT_TIMEOUT=420 \
    HF_HUB_DISABLE_TELEMETRY=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 ffmpeg ca-certificates libsndfile1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /opt/MuseTalk /opt/MuseTalk

WORKDIR /worker
COPY runpod/handler.py /worker/handler.py

# Serverless launches only the worker process. No Pod/Jupyter/SSH startup stack.
ENTRYPOINT []
CMD ["python", "-u", "/worker/handler.py"]
