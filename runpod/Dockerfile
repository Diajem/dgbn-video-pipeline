FROM runpod/pytorch:2.0.1-py3.10-cuda11.8.0-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    MUSE_TALK_HOME=/opt/MuseTalk \
    RUNPOD_INIT_TIMEOUT=1200

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg curl ca-certificates build-essential libsndfile1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# MuseTalk/OpenMMLab includes legacy packages (notably chumpy). Keep a
# conservative pip/setuptools toolchain rather than the latest build backend.
RUN python -m pip install --upgrade "pip<25" "setuptools<70" "wheel<0.44"

WORKDIR /opt
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git MuseTalk

COPY runpod/requirements-worker.txt /tmp/requirements-worker.txt
RUN python -m pip install --no-cache-dir -r /tmp/requirements-worker.txt

# Install the OpenMMLab inference stack without allowing its metadata to replace
# MuseTalk's NumPy/OpenCV pins. MMPose 1.1.0 depends on legacy chumpy; installing
# chumpy outside PEP-517 build isolation keeps pip available to its setup.py.
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

# Re-assert the versions MuseTalk expects after installing OpenMMLab helpers.
RUN python -m pip install --no-cache-dir --force-reinstall --no-deps \
      numpy==1.23.5 opencv-python-headless==4.9.0.80 && \
    python - <<'PY'
import numpy, cv2, torch
assert numpy.__version__ == '1.23.5', numpy.__version__
assert cv2.__version__.startswith('4.9.'), cv2.__version__
assert torch.__version__.startswith('2.0.1'), torch.__version__
print('Pinned runtime:', numpy.__version__, cv2.__version__, torch.__version__)
PY

COPY runpod/download_models.sh /tmp/download_models.sh
RUN chmod +x /tmp/download_models.sh && /tmp/download_models.sh

WORKDIR /worker
COPY runpod/handler.py /worker/handler.py

# runpod/pytorch is a Pod-oriented base image and inherits /start.sh. Serverless
# needs to launch only our worker process, so clear the inherited entrypoint.
ENTRYPOINT []
CMD ["python", "-u", "/worker/handler.py"]
