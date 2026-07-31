#!/usr/bin/env python3

import argparse
import json
import subprocess


IWSDK_PREFIX = "immersive-web-sdk/"
CI_CONFIG_PATHS = {".jfconfig"}


def changed_files(parent_rev: str, rev: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "-z", parent_rev, rev],
        check=True,
        capture_output=True,
        text=True,
    )
    return [path for path in result.stdout.split("\0") if path]


def should_run(paths: list[str]) -> bool:
    return any(
        path.startswith(IWSDK_PREFIX) or path in CI_CONFIG_PATHS for path in paths
    )


def quality_job(rev: str) -> dict[str, object]:
    runner = "bash immersive-web-sdk/ci/sandcastle/run-check.sh"
    return {
        "command": "SandcastleUniversalCommand",
        "alias": "iwsdk-quality",
        "oncall": "oculus_browser_devex",
        "scheduleType": "diff",
        "hash": rev,
        "tags": ["iwsdk", "quality"],
        "capabilities": {
            "type": "lego",
            "vcs": "oculus-webxr-git",
            "tenant": "oculus-browser",
        },
        "args": {
            "name": "IWSDK quality",
            "oncall": "oculus_browser_devex",
            "timeout": 14400,
            "skip_if_error_exists_on_base_revision": True,
            "steps": [
                {
                    "name": "Check Node and pnpm",
                    "shell": f"{runner} preflight",
                    "required": True,
                },
                {
                    "name": "Install dependencies",
                    "shell": f"{runner} install",
                    "required": True,
                    "timeout": 3600,
                },
                {
                    "name": "Lint",
                    "shell": f"{runner} lint",
                    "required": True,
                    "continue_after_user_failure": True,
                },
                {
                    "name": "Check formatting",
                    "shell": f"{runner} format",
                    "required": True,
                    "continue_after_user_failure": True,
                },
                {
                    "name": "Build packages",
                    "shell": f"{runner} build",
                    "required": True,
                    "timeout": 3600,
                    "continue_after_user_failure": True,
                },
                {
                    "name": "Typecheck and audit toolchain",
                    "shell": f"{runner} typecheck",
                    "required": True,
                    "timeout": 3600,
                    "continue_after_user_failure": True,
                },
                {
                    "name": "Run unit tests",
                    "shell": f"{runner} unit",
                    "required": True,
                    "timeout": 7200,
                    "continue_after_user_failure": True,
                },
            ],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rev", required=True)
    parser.add_argument("--parent-rev", required=True)
    args = parser.parse_args()

    paths = changed_files(args.parent_rev, args.rev)
    jobs = [quality_job(args.rev)] if should_run(paths) else []
    print(json.dumps(jobs, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
