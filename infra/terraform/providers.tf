# LocalStack stands in for AWS: every API call goes to http://localstack:4566 on the
# `jenkins` Docker network. Credentials are LocalStack's fixed dummies (test/test),
# passed through AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, never real keys.
provider "aws" {
  region                      = var.region
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    ec2 = var.aws_endpoint
    iam = var.aws_endpoint
    s3  = var.aws_endpoint
    sts = var.aws_endpoint
  }

  default_tags {
    tags = {
      Project   = "srisurart-pos"
      ManagedBy = "terraform"
      Lab       = "08"
    }
  }
}
