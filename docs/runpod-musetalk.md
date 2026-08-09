# RunPod MuseTalk worker

The local DGBN production machine does not require CUDA. It prepares presenter media, submits the avatar job to a RunPod Serverless GPU endpoint, downloads the resulting MP4, and then hands that MP4 to Remotion.

## Deployment

1. In RunPod, open **Serverless** and choose **New Endpoint**.
2. Choose **Import Git Repository / GitHub Repo**.
3. Select `Diajem/dgbn-video-pipeline`.
4. Select the branch containing the RunPod worker (after merge use `main`).
5. Dockerfile path: `runpod/Dockerfile`.
6. Endpoint name: `dgbn-musetalk`.
7. Start with a 16–24 GB NVIDIA GPU tier; RTX 4090-class hardware is preferred when available.
8. Keep the minimum worker count at 0 for scale-to-zero while testing.
9. Create the endpoint and wait for the image build and worker health check to complete.

## Local environment

Set secrets locally; never commit them:

```powershell
$env:RUNPOD_API_KEY="..."
$env:RUNPOD_ENDPOINT_ID="..."
```

Verify only that they are present:

```powershell
if ($env:RUNPOD_API_KEY) { "RunPod API key loaded" }
if ($env:RUNPOD_ENDPOINT_ID) { "RunPod endpoint loaded" }
```

## First Peet benchmark

Prepare the 12-second, 25-fps source locally:

```powershell
npm run avatar:musetalk:source:peet
```

Submit it to RunPod and wait for the MP4:

```powershell
npm run avatar:runpod:peet
```

Expected output:

```text
avatar-service/output/peet-musetalk-runpod.mp4
```

The first test intentionally uses base64-encoded media to avoid setting up object storage. For production-length bulletins, the worker contract should be upgraded to signed object-storage URLs so large video files do not travel inside JSON responses.
