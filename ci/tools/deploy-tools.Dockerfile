# Lab 10 — the deploy pod's tool container: node (deploy/k8s/make-secret.mjs, ci/health-gate.mjs)
# plus kubectl, checksum-verified. Built once and pushed to the kind registry:
#   docker build -t localhost:5001/ci-deploy-tools:1 -f ci/tools/deploy-tools.Dockerfile ci/tools
#   docker push localhost:5001/ci-deploy-tools:1
FROM node:22-bookworm-slim
ARG KUBECTL_VERSION=v1.37.1
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
 && echo "$(curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256")  /usr/local/bin/kubectl" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/kubectl \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
USER node
