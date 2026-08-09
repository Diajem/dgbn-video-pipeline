#!/usr/bin/env bash
set -euo pipefail
cd /opt/MuseTalk
python -m pip install -U "huggingface_hub[hf_xet]"
mkdir -p models/musetalkV15 models/syncnet models/dwpose models/face-parse-bisent models/sd-vae models/whisper
hf download TMElyralab/MuseTalk --local-dir models --include "musetalkV15/musetalk.json" "musetalkV15/unet.pth"
hf download stabilityai/sd-vae-ft-mse --local-dir models/sd-vae --include "config.json" "diffusion_pytorch_model.bin"
hf download openai/whisper-tiny --local-dir models/whisper --include "config.json" "pytorch_model.bin" "preprocessor_config.json"
hf download yzd-v/DWPose --local-dir models/dwpose --include "dw-ll_ucoco_384.pth"
hf download ByteDance/LatentSync --local-dir models/syncnet --include "latentsync_syncnet.pt"
hf download ManyOtherFunctions/face-parse-bisent --local-dir models/face-parse-bisent --include "79999_iter.pth" "resnet18-5c106cde.pth"
