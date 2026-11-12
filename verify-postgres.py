"""Keep the real PostgreSQL process owned by the verification command."""
import os
import subprocess
import time
import sys

log = open('/tmp/canon-postgres-verification.log', 'a', encoding='utf-8')
server = subprocess.Popen(['sudo', '-u', 'postgres', '/usr/lib/postgresql/16/bin/postgres', '-D', '/var/lib/postgresql/16/main', '-c', 'config_file=/etc/postgresql/16/main/postgresql.conf', '-c', 'unix_socket_directories=/tmp'], stdout=log, stderr=log)
try:
    ready = False
    for attempt in range(20):
        if server.poll() is not None:
            log.flush()
            print(open('/tmp/canon-postgres-verification.log', encoding='utf-8').read()[-3000:])
            sys.exit(2)
        if subprocess.run(['pg_isready', '-h', '127.0.0.1'], stdout=subprocess.DEVNULL).returncode == 0:
            ready = True
            break
        time.sleep(.5)
    if not ready or server.poll() is not None:
        print('Owned PostgreSQL process did not become ready; tests were not started.')
        sys.exit(2)
    env = {**os.environ, 'PYTHONPATH': '.'}
    if sys.argv[1:2] == ['--browser']:
        result = subprocess.run(['node', 'node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.config.cjs', *sys.argv[2:]], cwd='frontend', env=env)
    else:
        result = subprocess.run([os.path.expanduser('~/venvs/canon/bin/python'), '-m', 'pytest', '-q', '--tb=short', *sys.argv[1:]], cwd='backend', env=env)
    sys.exit(result.returncode)
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
    log.close()
