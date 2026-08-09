FROM runpod/pytorch:2.0.1-py3.10-cuda11.8.0-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    MUSE_TALK_HOME=/opt/MuseTalk \
    RUNPOD_INIT_TIMEOUT=1200

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg curl ca-certificates build-essential libsndfile1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip setuptools wheel

WORKDIR /opt
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git MuseTalk

COPY runpod/requirements-worker.txt /tmp/requirements-worker.txt
RUN python -m pip install --no-cache-dir -r /tmp/requirements-worker.txt

RUN python -m pip install --no-cache-dir mmengine==0.10.7 && \
    python -m pip install --no-cache-dir mmcv==2.0.1 \
      -f https://download.openmmlab.com/mmcv/dist/cu118/torch2.0/index.html && \
    python -m pip install --no-cache-dir mmdet==3.1.0 mmpose==1.1.0

COPY runpod/download_models.sh /tmp/download_models.sh
RUN chmod +x /tmp/download_models.sh && /tmp/download_models.sh

WORKDIR /worker
COPY runpod/handler.py /worker/handler.py

CMD ["python", "-u", "/worker/handler.py"]
