FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    MUSE_TALK_HOME=/opt/MuseTalk

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3.10-dev git ffmpeg curl ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/local/bin/python

RUN python -m pip install --upgrade pip setuptools wheel

WORKDIR /opt
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git MuseTalk

WORKDIR /opt/MuseTalk
RUN python -m pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
RUN python -m pip install -r requirements.txt
RUN python -m pip install --no-cache-dir -U openmim runpod "huggingface_hub[hf_xet]"
RUN mim install mmengine && \
    mim install "mmcv==2.0.1" && \
    mim install "mmdet==3.1.0" && \
    mim install "mmpose==1.1.0"

COPY runpod/download_models.sh /tmp/download_models.sh
RUN chmod +x /tmp/download_models.sh && /tmp/download_models.sh

WORKDIR /worker
COPY runpod/handler.py /worker/handler.py

CMD ["python", "/worker/handler.py"]
