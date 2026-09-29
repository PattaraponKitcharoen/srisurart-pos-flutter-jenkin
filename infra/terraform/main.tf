# Lab 08 — the environment the srisurart api (Lab 07 image) is deployed into:
# one compute instance in the default VPC and the security group in front of it.

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "api" {
  name   = "srisurart-api"
  vpc_id = data.aws_vpc.default.id

  ingress {
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "api" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.api.id]

  tags = {
    Name = "srisurart-api"
  }
}
