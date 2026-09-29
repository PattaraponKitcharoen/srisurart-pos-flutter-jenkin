// Lab 03 — first declarative pipeline for the srisurart POS server (NestJS, server/).
// Lab 09 — the same stages on an ephemeral Kubernetes pod instead of the static agent.
pipeline {
    // One fresh pod per run in the kind cluster (cloud "kind-srisurart", namespace
    // jenkins-agents), deleted when the run ends: nothing is left between builds and
    // capacity is the cloud's concurrency limit, not a fixed executor count.
    // node:22 (not 20) because server/package.json requires node >= 22; bookworm-slim
    // (glibc) instead of alpine (musl) so argon2's prebuilt native binary loads.
    agent {
        kubernetes {
            cloud 'kind-srisurart'
            defaultContainer 'node'
            yaml '''
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsUser: 1000   # the image's `node` user, same uid as the jnlp container
    runAsGroup: 1000
    fsGroup: 1000
  containers:
  - name: node
    image: node:22-bookworm-slim
    command: ['cat']
    tty: true
    resources:
      requests: {cpu: 500m, memory: 512Mi}
      limits: {memory: 1536Mi}
'''
        }
    }

    parameters {
        // Lab 09 load test: builds queued with identical parameters are merged into one
        // queue item, so each of the 10 concurrent runs gets a distinct LOAD_ID.
        string(name: 'LOAD_ID', defaultValue: '', description: 'Lab 09: tag for load-test runs (leave empty)')
    }

    environment {
        APP_NAME = 'srisurart-pos-server'
        NODE_ENV = 'test'
        // corepack and pnpm need a writable HOME for their caches; /tmp is writable
        // whatever uid the container runs as.
        HOME = '/tmp'
        COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
    }

    options {
        // A hung pnpm install or test run must not hold the agent's only executor
        // forever: every later build would queue behind it. Bounding the run turns a
        // silent hang into a visible, failed build after 10 minutes.
        timeout(time: 10, unit: 'MINUTES')
    }

    stages {
        stage('Install') {
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                echo "Building ${env.APP_NAME} with NODE_ENV=${env.NODE_ENV}"
                dir('server') {
                    sh 'node -v && corepack pnpm -v'
                    sh 'corepack pnpm install --frozen-lockfile'
                }
            }
        }
        stage('Lint') {
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                dir('server') { sh 'corepack pnpm lint' }
            }
        }
        stage('Unit Test') {
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                dir('server') { sh 'corepack pnpm test' }
            }
        }
    }

    post {
        success {
            echo "✅ ${env.APP_NAME} passed on ${env.NODE_ENV}"
        }
        failure {
            // env.STAGE_NAME is not the failed stage inside a pipeline-level post
            // block, so each stage records its own name in CURRENT_STAGE.
            echo "❌ Failed at stage: ${env.CURRENT_STAGE}"
        }
        always {
            archiveArtifacts artifacts: 'server/npm-debug.log*, server/pnpm-debug.log*', allowEmptyArchive: true
        }
    }
}
