#!/bin/sh
# Lab 07 — idempotent cluster setup + migrations for one image. KUBECONFIG must be set.
# usage: deploy/k8s/bootstrap.sh <image>
set -eu
IMAGE=$1
DIR=$(dirname "$0")
kubectl get namespace srisurart >/dev/null 2>&1 || kubectl create namespace srisurart
# The Secret is generated once per cluster; re-running must not rotate live passwords.
kubectl -n srisurart get secret srisurart-app >/dev/null 2>&1 || node "$DIR/make-secret.mjs" | kubectl apply -f -
kubectl apply -f "$DIR/datastores.yaml"
kubectl -n srisurart rollout status deployment/postgres deployment/redis-cache deployment/redis-queue --timeout=180s
# First deploy only: create both colours on this image. Later deploys use `set image`.
kubectl -n srisurart get deployment srisurart-blue >/dev/null 2>&1 || sed "s|IMAGE|$IMAGE|" "$DIR/app.yaml" | kubectl apply -f -
kubectl -n srisurart delete job migrate --ignore-not-found
sed "s|IMAGE|$IMAGE|" "$DIR/migrate-job.yaml" | kubectl apply -f -
kubectl -n srisurart wait --for=condition=complete job/migrate --timeout=180s
