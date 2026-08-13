#!/usr/bin/env bash
set -euxo pipefail
fail() { rc=$?; echo "FAIL:$rc" > /tmp/dgbn/status.txt; exit $rc; }
trap fail ERR
export DEBIAN_FRONTEND=noninteractive
export PYTHONUNBUFFERED=1

echo '=== PETER FAST 12S MUSETALK BENCHMARK START ==='
date -u
nvidia-smi

python - <<'PY'
import torch
print('BASE TORCH', torch.__version__, 'CUDA', torch.version.cuda, 'AVAILABLE', torch.cuda.is_available())
assert torch.__version__.startswith('2.0.1'), torch.__version__
assert torch.version.cuda == '11.8', torch.version.cuda
assert torch.cuda.is_available()
PY

python -m pip install --upgrade 'pip<25' 'setuptools<70' 'wheel<0.44'
grep -v '^runpod$' /opt/dgbn-pipeline/runpod/requirements-worker.txt > /tmp/musetalk-inference-requirements.txt
python -m pip install --no-cache-dir -r /tmp/musetalk-inference-requirements.txt
python -m pip install --no-cache-dir --no-deps mmengine==0.10.7
python -m pip install --no-cache-dir addict termcolor rich 'yapf<0.41' 'matplotlib<3.8'
python -m pip install --no-cache-dir --no-deps mmcv==2.0.1 -f https://download.openmmlab.com/mmcv/dist/cu118/torch2.0/index.html
python -m pip install --no-cache-dir --no-build-isolation chumpy==0.70
python -m pip install --no-cache-dir json-tricks munkres xtcocotools pycocotools shapely terminaltables
python -m pip install --no-cache-dir --no-deps mmdet==3.1.0 mmpose==1.1.0
python -m pip uninstall -y opencv-python || true
python -m pip install --no-cache-dir --force-reinstall --no-deps numpy==1.23.5 opencv-python-headless==4.9.0.80

rm -rf /opt/MuseTalk
git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk
cd /opt/MuseTalk
bash /opt/dgbn-pipeline/runpod/download_models_inference_fast.sh

ffmpeg -y -loop 1 -framerate 25 -i /tmp/dgbn/input/peter.jpg -t 12 -vf 'scale=640:-2,format=yuv420p' -r 25 -c:v libx264 -preset ultrafast -crf 18 -an /tmp/dgbn/input/source.mp4
ffmpeg -y -i /tmp/dgbn/input/peter.mp3 -t 12 -ac 1 -ar 16000 /tmp/dgbn/input/audio.wav

cat > /tmp/dgbn/inference.yaml <<'YAML'
task_0:
  video_path: "/tmp/dgbn/input/source.mp4"
  audio_path: "/tmp/dgbn/input/audio.wav"
  bbox_shift: 0
YAML

python - <<'PY'
import torch, cv2, numpy
print('RUNTIME', torch.__version__, torch.version.cuda, torch.cuda.is_available(), torch.cuda.get_device_name(0))
print('VERSIONS', cv2.__version__, numpy.__version__)
PY

python -m scripts.inference \
  --inference_config /tmp/dgbn/inference.yaml \
  --result_dir /tmp/dgbn/results \
  --unet_model_path models/musetalkV15/unet.pth \
  --unet_config models/musetalkV15/musetalk.json \
  --version v15

result=$(find /tmp/dgbn/results -type f -name '*.mp4' | head -1)
test -n "$result"
cp "$result" /tmp/dgbn/result.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 /tmp/dgbn/result.mp4
echo PASS > /tmp/dgbn/status.txt
echo '=== PETER FAST 12S MUSETALK BENCHMARK PASS ==='
trap - ERR
