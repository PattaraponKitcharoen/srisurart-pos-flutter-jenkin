#!/bin/sh
# Lab 08 — one-time: the S3 bucket that holds Terraform's remote state, on LocalStack.
# Versioned, so an overwritten state can be recovered. Safe to re-run.
set -eu
aws() {
  docker run --rm --network jenkins -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test \
    -e AWS_DEFAULT_REGION=ap-southeast-1 amazon/aws-cli:latest --endpoint-url http://localstack:4566 "$@"
}
aws s3api head-bucket --bucket srisurart-tfstate 2>/dev/null ||
  aws s3api create-bucket --bucket srisurart-tfstate \
    --create-bucket-configuration LocationConstraint=ap-southeast-1
aws s3api put-bucket-versioning --bucket srisurart-tfstate --versioning-configuration Status=Enabled
aws s3api get-bucket-versioning --bucket srisurart-tfstate
