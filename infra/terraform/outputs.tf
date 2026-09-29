output "instance_id" {
  description = "ID of the api host."
  value       = aws_instance.api.id
}

output "instance_address" {
  description = "Private address of the api host (Ansible's inventory uses it)."
  value       = aws_instance.api.private_ip
}

output "app_port" {
  description = "Port the security group opens for the api."
  value       = var.app_port
}
