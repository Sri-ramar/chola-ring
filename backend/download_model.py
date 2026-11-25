from __future__ import annotations

from pathlib import Path

from huggingface_hub import snapshot_download


MODEL_ID = "LiquidAI/LFM2.5-Audio-1.5B"
MODEL_DIR = Path("models") / "LFM2.5-Audio-1.5B"


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {MODEL_ID} into {MODEL_DIR.resolve()}")
    snapshot_download(
        repo_id=MODEL_ID,
        local_dir=MODEL_DIR,
        local_dir_use_symlinks=False,
        resume_download=True,
    )
    print("Done.")


if __name__ == "__main__":
    main()
