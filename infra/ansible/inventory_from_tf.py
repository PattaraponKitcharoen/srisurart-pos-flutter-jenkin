"""Lab 08 — dynamic inventory from `terraform output -json`.

usage: python3 infra/ansible/inventory_from_tf.py <tf-output.json>  > inventory.json

LocalStack records the EC2 instance but boots no VM, so the host Ansible configures is a
container standing in for that instance, named after the instance id Terraform returned.
"""
import json
import sys

out = json.load(open(sys.argv[1], encoding="utf-8"))
instance_id = out["instance_id"]["value"]
print(json.dumps({
    "api": {
        "hosts": {
            instance_id: {
                "ansible_connection": "community.docker.docker",
                "ansible_host": f"srisurart-host-{instance_id}",
                "instance_address": out["instance_address"]["value"],
            }
        }
    }
}, indent=2))
