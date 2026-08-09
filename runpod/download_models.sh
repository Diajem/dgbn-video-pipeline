#!/usr/bin/env bash
set -euo pipefail
cd /opt/MuseTalk

# Keep the Hugging Face client compatible with the pinned Transformers/tokenizers
# stack used by MuseTalk. hf-xet speeds up Hub downloads without forcing Hub 1.x.
python -m pip install --no-cache-dir "huggingface_hub[hf_xet]==0.30.2" gdown

mkdir -p models/syncnet models/dwpose models/face-parse-bisent models/sd-vae models/whisper "$HOME/.cache/torch/hub/checkpoints"

# Keep the large MuseTalk V1.5 weights out of the Docker image. The handler
# resolves them from RunPod's Hugging Face model cache when configured, and
# falls back to a one-time download at worker initialization.
huggingface-cli download stabilityai/sd-vae-ft-mse --local-dir models/sd-vae --include "config.json" "diffusion_pytorch_model.bin"
huggingface-cli download openai/whisper-tiny --local-dir models/whisper --include "config.json" "pytorch_model.bin" "preprocessor_config.json"
huggingface-cli download yzd-v/DWPose --local-dir models/dwpose --include "dw-ll_ucoco_384.pth"
huggingface-cli download ByteDance/LatentSync --local-dir models/syncnet --include "latentsync_syncnet.pt"

# MuseTalk upstream distributes the BiSeNet checkpoint via Google Drive and
# ResNet-18 from PyTorch's model host; do not substitute an incomplete HF mirror.
gdown 154JgKpzCPW82qINcVieuPH3fZ2e0P812 \
  -O models/face-parse-bisent/79999_iter.pth
curl -fL --retry 4 --retry-delay 3 \
  https://download.pytorch.org/models/resnet18-5c106cde.pth \
  -o models/face-parse-bisent/resnet18-5c106cde.pth

# S3FD face detector used by face-alignment.
curl -fL --retry 4 --retry-delay 3 \
  https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth \
  -o "$HOME/.cache/torch/hub/checkpoints/s3fd-619a316812.pth"

# Fail the build early if expected auxiliary assets are missing.
test -s models/sd-vae/config.json
test -s models/sd-vae/diffusion_pytorch_model.bin
test -s models/whisper/config.json
test -s models/whisper/pytorch_model.bin
test -s models/dwpose/dw-ll_ucoco_384.pth
test -s models/syncnet/latentsync_syncnet.pt
test -s models/face-parse-bisent/79999_iter.pth
test -s models/face-parse-bisent/resnet18-5c106cde.pth
test -s "$HOME/.cache/torch/hub/checkpoints/s3fd-619a316812.pth"

python - <<'PY'
from pathlib import Path
for path in [
    "models/sd-vae/diffusion_pytorch_model.bin",
    "models/whisper/pytorch_model.bin",
    "models/dwpose/dw-ll_ucoco_384.pth",
    "models/syncnet/latentsync_syncnet.pt",
    "models/face-parse-bisent/79999_iter.pth",
    "models/face-parse-bisent/resnet18-5c106cde.pth",
]:
    p = Path(path)
    print(f"Validated model asset: {path} ({p.stat().st_size / 1024 / 1024:.1f} MiB)")
PY
