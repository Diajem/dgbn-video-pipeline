#!/usr/bin/env bash
set -euo pipefail
cd /opt/MuseTalk

python -m pip install --no-cache-dir "huggingface_hub[hf_xet]==0.30.2" gdown

mkdir -p models/dwpose models/face-parse-bisent models/sd-vae models/whisper models/musetalkV15 "$HOME/.cache/torch/hub/checkpoints"

huggingface-cli download stabilityai/sd-vae-ft-mse --local-dir models/sd-vae --include "config.json" "diffusion_pytorch_model.bin"
huggingface-cli download openai/whisper-tiny --local-dir models/whisper --include "config.json" "pytorch_model.bin" "preprocessor_config.json"
huggingface-cli download yzd-v/DWPose --local-dir models/dwpose --include "dw-ll_ucoco_384.pth"
huggingface-cli download TMElyralab/MuseTalk --local-dir models --include "musetalkV15/musetalk.json" "musetalkV15/unet.pth"

gdown 154JgKpzCPW82qINcVieuPH3fZ2e0P812 -O models/face-parse-bisent/79999_iter.pth
curl -fL --retry 4 --retry-delay 3 https://download.pytorch.org/models/resnet18-5c106cde.pth -o models/face-parse-bisent/resnet18-5c106cde.pth
curl -fL --retry 4 --retry-delay 3 https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth -o "$HOME/.cache/torch/hub/checkpoints/s3fd-619a316812.pth"

for p in \
  models/sd-vae/diffusion_pytorch_model.bin \
  models/whisper/pytorch_model.bin \
  models/dwpose/dw-ll_ucoco_384.pth \
  models/musetalkV15/unet.pth \
  models/face-parse-bisent/79999_iter.pth \
  models/face-parse-bisent/resnet18-5c106cde.pth \
  "$HOME/.cache/torch/hub/checkpoints/s3fd-619a316812.pth"; do
  test -s "$p"
done

echo 'Inference-only MuseTalk model assets ready.'
