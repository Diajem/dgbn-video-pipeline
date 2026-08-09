#!/usr/bin/env bash
set -euo pipefail
cd /opt/MuseTalk
python -m pip install --no-cache-dir -U "huggingface_hub[hf_xet]"
mkdir -p models/syncnet models/dwpose models/face-parse-bisent models/sd-vae models/whisper "$HOME/.cache/torch/hub/checkpoints"

# Keep the large MuseTalk V1.5 weights out of the Docker image. The handler
# resolves them from RunPod's Hugging Face model cache when configured, and
# falls back to a one-time download at worker initialization.
hf download stabilityai/sd-vae-ft-mse --local-dir models/sd-vae --include "config.json" "diffusion_pytorch_model.bin"
hf download openai/whisper-tiny --local-dir models/whisper --include "config.json" "pytorch_model.bin" "preprocessor_config.json"
hf download yzd-v/DWPose --local-dir models/dwpose --include "dw-ll_ucoco_384.pth"
hf download ByteDance/LatentSync --local-dir models/syncnet --include "latentsync_syncnet.pt"
hf download ManyOtherFunctions/face-parse-bisent --local-dir models/face-parse-bisent --include "79999_iter.pth" "resnet18-5c106cde.pth"

curl -fL --retry 4 --retry-delay 3 \
  https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth \
  -o "$HOME/.cache/torch/hub/checkpoints/s3fd-619a316812.pth"

# Fail the build early if expected auxiliary assets are missing.
test -s models/sd-vae/config.json
test -s models/whisper/config.json
test -s models/dwpose/dw-ll_ucoco_384.pth
test -s models/syncnet/latentsync_syncnet.pt
test -s models/face-parse-bisent/79999_iter.pth
test -s "$HOME/.cache/torch/hub/checkpoints/s3fd-619a316812.pth"
