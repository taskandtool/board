#!/usr/bin/env python3
"""Migrate, build and deploy the board to production on Cloudflare.

    python3 scripts/deploy.py            migrate, build, then deploy
    python3 scripts/deploy.py --no-build migrate, deploy what is already built
    python3 scripts/deploy.py --dry-run  build and say what would be deployed

On a Task & Tool machine this calls deploy_site from the platform bridge
(tools/taskandtool.py): the machine uploads the built assets and the Worker
bundle; the platform deploys them to Cloudflare on this app's behalf, with
the project's DATABASE_URL bound to the Worker. No Cloudflare credential
ever exists here. The first deploy opens production to the team (public is
the owner's switch on the dashboard). Migrations run from here first: the
Worker never migrates.

Off the platform, deploy build/worker.mjs and dist/ with your own tooling
and account; this script only knows Task & Tool.
"""

import json
import os
import subprocess
import sys
import time

DIST = "dist"
WORKER = os.path.join("build", "worker.mjs")
# pg reaches Postgres over Cloudflare's TCP sockets through Node's compat layer.
FLAGS = ["nodejs_compat"]


def fail(msg, code=1):
    print(f"deploy: {msg}", file=sys.stderr)
    sys.exit(code)


def ensure_platform_env():
    """A chat turn's shell may not carry the platform env; the machine's
    /home/sprite/.env does. Re-run under it once when the bridge needs it."""
    env_file = os.path.expanduser("~/.env")
    if os.environ.get("PHOENIX_URL") or not os.path.isfile(env_file) or os.environ.get("_TT_ENV_LOADED"):
        return
    os.environ["_TT_ENV_LOADED"] = "1"
    cmd = "set -a; . ~/.env; set +a; exec python3 \"$0\" \"$@\""
    os.execvp("bash", ["bash", "-c", cmd, os.path.abspath(sys.argv[0]), *sys.argv[1:]])


def migrate():
    print("== migrations")
    r = subprocess.run(["node", "scripts/migrate.mjs"])
    if r.returncode:
        fail("migrations failed; production was not touched", r.returncode)


def build():
    print("== build")
    r = subprocess.run(["npm", "run", "--silent", "build"])
    if r.returncode:
        fail("build failed", r.returncode)


def on_platform():
    bridge = os.path.expanduser("~/tools/taskandtool.py")
    return bool(os.environ.get("PHOENIX_URL")) and os.path.isfile(bridge)


def deploy_platform(dry_run):
    sys.path.insert(0, os.path.expanduser("~"))
    from tools import taskandtool as tt  # noqa: E402

    status = tt.serving_status()
    if status is None:
        fail("could not reach Task & Tool from this machine; try again in a moment")
    if not status.get("can_deploy"):
        print(json.dumps(status, indent=2))
        fail("this platform cannot deploy to Cloudflare; the board stays in dev", 2)
    files = sum(len(fs) for _, _, fs in os.walk(DIST))
    print(f"== deploy: {files} asset(s) from {DIST}/ + Worker {WORKER}")
    if dry_run:
        print("dry run: nothing sent")
        return
    result = tt.deploy_site(DIST, worker_js=WORKER, compatibility_flags=FLAGS)
    # A 5xx from the platform is almost always Cloudflare in front of it
    # hiccuping, not the deploy: wait what it asks and try once more (the
    # assets are already uploaded; only changed ones go again).
    if isinstance(result, dict) and int(result.get("http_status") or 0) >= 500:
        wait = min(int(str(result.get("retry_after") or 30) or 30), 90)
        print(f"platform answered {result.get('http_status')}; retrying once in {wait}s")
        time.sleep(wait)
        result = tt.deploy_site(DIST, worker_js=WORKER, compatibility_flags=FLAGS)
    if isinstance(result, str):
        print(f"production: {result}")
        print(
            "Production now shows this build. Edits in dev reach it only when this script "
            "runs again. Who can open production is the owner's setting in the dashboard."
        )
        return
    if result is None:
        fail("the deploy did not complete (platform unreachable or the upload failed)")
    print(json.dumps(result, indent=2))
    fail(f"deploy refused: {result.get('error')}")


def main(argv):
    # Always run from the app root, wherever the script was invoked from.
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ensure_platform_env()
    dry_run = "--dry-run" in argv
    if not on_platform():
        fail("not on a Task & Tool machine: deploy dist/ and build/worker.mjs with your own tooling")
    if not dry_run:
        migrate()
    if "--no-build" not in argv:
        build()
    if not os.path.isdir(DIST) or not os.path.isfile(WORKER):
        fail(f"nothing to deploy: {DIST}/ or {WORKER} is missing (run npm run build)")
    deploy_platform(dry_run)


if __name__ == "__main__":
    main(sys.argv[1:])
