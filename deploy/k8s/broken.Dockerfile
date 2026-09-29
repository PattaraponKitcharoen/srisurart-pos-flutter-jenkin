# Lab 07 — a deliberately broken image, for the automatic-rollback demo only: same app,
# but the process exits at start, so its rollout never becomes ready.
ARG BASE
FROM ${BASE}
CMD ["node", "-e", "console.error('lab07: deliberately broken image'); process.exit(1)"]
