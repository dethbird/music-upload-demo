import os

import boto3
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET_NAME = os.environ["R2_BUCKET_NAME"]
R2_PUBLIC_URL = os.environ["R2_PUBLIC_URL"].rstrip("/")

_r2_client = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)


def upload_to_r2(local_path: str, key: str) -> str:
    """Upload a local file to R2 and return its public URL."""
    with open(local_path, "rb") as f:
        _r2_client.upload_fileobj(f, R2_BUCKET_NAME, key)
    return f"{R2_PUBLIC_URL}/{key}"
