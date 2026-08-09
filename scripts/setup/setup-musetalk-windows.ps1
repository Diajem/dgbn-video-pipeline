param([string]$InstallDir="C:\AI\MuseTalk",[string]$CondaEnv="MuseTalk")
$ErrorActionPreference="Stop"
if(-not(Get-Command git -ErrorAction SilentlyContinue)){throw "Git is required."}
if(-not(Get-Command conda -ErrorAction SilentlyContinue)){throw "Miniconda/Conda is required."}
if(-not(Get-Command ffmpeg -ErrorAction SilentlyContinue)){throw "FFmpeg must be installed and on PATH."}
if(-not(Get-Command nvidia-smi -ErrorAction SilentlyContinue)){throw "An NVIDIA GPU/driver is required for the production benchmark."}
if(-not(Test-Path $InstallDir)){New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir)|Out-Null;git clone https://github.com/TMElyralab/MuseTalk.git $InstallDir}
if((conda env list)-notmatch "\b$CondaEnv\b"){conda create -n $CondaEnv python=3.10 -y}
Push-Location $InstallDir
try{
 conda run -n $CondaEnv python -m pip install --upgrade pip
 conda run -n $CondaEnv python -m pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
 conda run -n $CondaEnv python -m pip install -r requirements.txt
 conda run -n $CondaEnv python -m pip install --no-cache-dir -U openmim
 conda run -n $CondaEnv mim install mmengine
 conda run -n $CondaEnv mim install "mmcv==2.0.1"
 conda run -n $CondaEnv mim install "mmdet==3.1.0"
 conda run -n $CondaEnv mim install "mmpose==1.1.0"
 if(Test-Path ".\download_weights.bat"){cmd /c download_weights.bat}else{Write-Warning "download_weights.bat not found; use the official MuseTalk weight-download instructions."}
 conda run -n $CondaEnv python -c "import torch;print(torch.__version__);print(torch.cuda.is_available());print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO CUDA')"
}finally{Pop-Location}
Write-Host "Set MUSE_TALK_HOME=$InstallDir and MUSE_TALK_PYTHON to the MuseTalk conda python.exe, then run npm run avatar:musetalk:preflight"
