terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state in an S3 bucket on LocalStack (created once by infra/bootstrap-state.sh).
  # terraform.tfstate never lives in the repo or the workspace — .gitignore blocks it too.
  backend "s3" {
    bucket                      = "srisurart-tfstate"
    key                         = "lab08/terraform.tfstate"
    region                      = "ap-southeast-1"
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    endpoints = {
      s3 = "http://localstack:4566"
    }
  }
}
