// Lab 03 — first declarative pipeline for the srisurart POS server (NestJS, server/).
pipeline {
    // Build inside a throwaway Node container that runs on the linux-build agent.
    // node:22 (not 20) because server/package.json requires node >= 22; bookworm-slim
    // (glibc) instead of alpine (musl) so argon2's prebuilt native binary loads.
    agent {
        docker {
            image 'node:22-bookworm-slim'
            label 'linux-build'
        }
    }

    environment {
        APP_NAME = 'srisurart-pos-server'
        NODE_ENV = 'test'
        // The container runs as the agent's uid, which has no home directory in the
        // node image; corepack and pnpm need a writable HOME for their caches.
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
