# Lab 08 — Ansible controller for the pipeline: ansible-core, ansible-lint, the
# community.docker collection (docker connection plugin) and the docker CLI it drives.
FROM python:3.12-slim
RUN pip install --no-cache-dir "ansible-core==2.19.*" "ansible-lint==25.*" \
 && ansible-galaxy collection install community.docker community.general -p /usr/share/ansible/collections
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
ENV ANSIBLE_COLLECTIONS_PATH=/usr/share/ansible/collections \
    ANSIBLE_HOST_KEY_CHECKING=False \
    ANSIBLE_LOCAL_TEMP=/tmp/.ansible-local \
    ANSIBLE_REMOTE_TEMP=/tmp/.ansible-remote
