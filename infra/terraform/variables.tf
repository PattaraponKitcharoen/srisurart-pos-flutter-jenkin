variable "region" {
  description = "AWS region (LocalStack accepts any)."
  type        = string
  default     = "ap-southeast-1"
}

variable "aws_endpoint" {
  description = "Where the AWS provider sends its API calls."
  type        = string
  default     = "http://localstack:4566"
}

variable "ami_id" {
  description = "Image for the api host. A mock Ubuntu AMI that LocalStack ships (describe-images)."
  type        = string
  default     = "ami-785db401"
}

variable "instance_type" {
  description = "Instance size for the api host."
  type        = string
  default     = "t3.small"
}

variable "app_port" {
  description = "Port the srisurart api listens on (Lab 07: 3000)."
  type        = number
  default     = 3000
}

variable "admin_cidr" {
  description = "The one host allowed to SSH in (Ansible runs from there)."
  type        = string
  default     = "10.0.0.10/32"
}
