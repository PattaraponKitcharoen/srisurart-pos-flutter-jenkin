# Lab 08 — the environment the srisurart api (Lab 07 image) is deployed into:
# one compute instance in the default VPC and the security group in front of it.
# Hardened after the first tfsec/Checkov run (see the Lab 08 report): no ingress or
# egress to the whole internet, IMDSv2 only, encrypted root volume, an instance role.

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "api" {
  name        = "srisurart-api"
  description = "srisurart api host: app port from inside the VPC, SSH from the admin host only"
  vpc_id      = data.aws_vpc.default.id

  # Was 0.0.0.0/0: the api sits behind the load balancer / Nginx inside the VPC,
  # so nothing outside the VPC needs to reach it directly.
  ingress {
    description = "srisurart api from inside the VPC"
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  # Was 0.0.0.0/0: SSH (Ansible) only from the admin/bastion host.
  ingress {
    description = "SSH for Ansible from the admin host"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  # Was all protocols to 0.0.0.0/0: HTTPS only, inside the VPC (registry and package
  # mirror are reached through VPC endpoints).
  egress {
    description = "HTTPS to the registry and package mirror inside the VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }
}

resource "aws_iam_role" "api" {
  name = "srisurart-api-host"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_instance_profile" "api" {
  name = "srisurart-api-host"
  role = aws_iam_role.api.name
}

resource "aws_instance" "api" {
  # checkov:skip=CKV_AWS_126:LocalStack does not implement EC2 MonitorInstances (501), so detailed monitoring cannot be applied in this lab. On a real account set monitoring = true.
  ami                    = var.ami_id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.api.id]
  iam_instance_profile   = aws_iam_instance_profile.api.name
  ebs_optimized          = true

  # IMDSv2 only: a stolen metadata URL (SSRF) cannot read the instance credentials.
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "srisurart-api"
  }
}
