from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import subprocess, threading

ROOT = Path('/tmp/dgbn')
INPUT = ROOT / 'input'
INPUT.mkdir(parents=True, exist_ok=True)
ALLOWED_UPLOADS = {'/upload/peter.jpg': 'peter.jpg', '/upload/peter.mp3': 'peter.mp3'}
ALLOWED_GET = {'/status.txt': 'status.txt', '/bootstrap.log': 'bootstrap.log', '/result.mp4': 'result.mp4'}
run_lock = threading.Lock()
started = False

class Handler(BaseHTTPRequestHandler):
    def send_bytes(self, code, data, ctype='text/plain'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self.send_bytes(200, b'OK')
        if self.path in ALLOWED_GET:
            p = ROOT / ALLOWED_GET[self.path]
            if not p.exists():
                return self.send_bytes(404, b'pending')
            data = p.read_bytes()
            ctype = 'video/mp4' if p.suffix == '.mp4' else 'text/plain'
            return self.send_bytes(200, data, ctype)
        return self.send_bytes(404, b'not found')

    def do_PUT(self):
        if self.path not in ALLOWED_UPLOADS:
            return self.send_bytes(404, b'not found')
        n = int(self.headers.get('Content-Length', '0'))
        if n <= 0 or n > 5_000_000:
            return self.send_bytes(400, b'invalid length')
        data = self.rfile.read(n)
        (INPUT / ALLOWED_UPLOADS[self.path]).write_bytes(data)
        return self.send_bytes(200, b'uploaded')

    def do_POST(self):
        global started
        if self.path != '/run':
            return self.send_bytes(404, b'not found')
        with run_lock:
            if started:
                return self.send_bytes(409, b'already started')
            if not (INPUT / 'peter.jpg').exists() or not (INPUT / 'peter.mp3').exists():
                return self.send_bytes(400, b'inputs missing')
            started = True
            log = open(ROOT / 'bootstrap.log', 'ab', buffering=0)
            subprocess.Popen(['bash', '/opt/dgbn-pipeline/runpod/peter_benchmark_fast.sh'], stdout=log, stderr=subprocess.STDOUT)
        return self.send_bytes(202, b'started')

    def log_message(self, fmt, *args):
        pass

ThreadingHTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
