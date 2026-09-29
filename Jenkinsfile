// Lab 03 — first declarative pipeline for the srisurart POS server (NestJS, server/).
// Lab 05 — three gates: unit tests + coverage, SonarQube quality gate, Playwright E2E.
pipeline {
    // The whole run holds one linux-build executor. That agent has the docker CLI (and,
    // since Lab 05, the compose/buildx plugins), which the E2E stage needs on the node
    // itself; the Node stages run in a container on the same node and workspace.
    agent { label 'linux-build' }

    environment {
        APP_NAME = 'srisurart-pos-server'
        NODE_ENV = 'test'
        // The containers run as the agent's uid, which has no home directory in the
        // node/playwright images; corepack, pnpm and npm need a writable HOME for caches.
        HOME = '/tmp'
        COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
        PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.63.0-noble'
    }

    options {
        // A hung install, scan or E2E stack must not hold an executor forever. 20 minutes
        // (Lab 03 had 10): SonarQube analysis and building the api image for E2E add ~5.
        // The Quality Gate stage has its own, tighter 5-minute bound.
        timeout(time: 20, unit: 'MINUTES')
    }

    stages {
        stage('Build & Test') {
            // node:22 (not 20) because server/package.json requires node >= 22; bookworm-slim
            // (glibc) instead of alpine (musl) so argon2's prebuilt native binary loads.
            // --network jenkins: the scanner must reach http://sonarqube:9000.
            agent {
                docker {
                    image 'node:22-bookworm-slim'
                    args '--network jenkins'
                    reuseNode true
                }
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
                        // Coverage thresholds are NOT enforced here on purpose: a coverage
                        // drop must fail the Quality Gate stage, not this one.
                        dir('server') {
                            sh 'corepack pnpm exec vitest run --coverage --reporter=default --reporter=junit --outputFile.junit=reports/junit.xml'
                        }
                    }
                    post {
                        always {
                            junit testResults: 'server/reports/junit.xml', allowEmptyResults: true
                            // Coverage plugin (successor of publishCoverage/coberturaAdapter).
                            recordCoverage(
                                tools: [[parser: 'COBERTURA', pattern: 'server/coverage/cobertura-coverage.xml']],
                                sourceDirectories: [[path: 'server']],
                                sourceCodeRetention: 'LAST_BUILD'
                            )
                        }
                    }
                }
                stage('SonarQube Analysis') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        // withSonarQubeEnv hands the host URL and the sonar-token credential
                        // to the scanner through SONARQUBE_SCANNER_PARAMS, so the token is
                        // never on a command line (sh echoes each command into the log).
                        // Project settings: server/sonar-project.properties.
                        dir('server') {
                            withSonarQubeEnv('SonarQube') {
                                sh 'npx --yes @sonar/scan@5.0.1 -Dsonar.projectKey=srisurart-pos-server'
                            }
                        }
                    }
                }
            }
        }
        stage('Quality Gate') {
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                // SonarQube calls back http://jenkins:8080/sonarqube-webhook/ when the
                // analysis is processed; abortPipeline fails the build on a red gate.
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }
        stage('E2E') {
            environment {
                API_IMAGE = "srisurart-e2e-api:${env.GIT_COMMIT.substring(0, 7)}"
            }
            steps {
                script {
                    env.CURRENT_STAGE = env.STAGE_NAME
                    // Unique per build, so two builds never share (or tear down) a stack.
                    env.E2E_PROJECT = "e2e-${env.BUILD_TAG}".toLowerCase().replaceAll('[^a-z0-9_-]', '-')
                    // Throwaway platform-admin password for a stack that lives for this
                    // stage only; it is an env var, never echoed.
                    env.E2E_PLATFORM_PASSWORD = UUID.randomUUID().toString()
                }
                sh 'docker build -q -t "$API_IMAGE" server'
                sh 'docker compose -p "$E2E_PROJECT" --env-file server/.env.example -f e2e/docker-compose.e2e.yml up -d --wait'
                script {
                    // The Playwright container shares the api container's network
                    // namespace: the suite calls http://127.0.0.1:3000, and the platform
                    // plane (used to provision the test shop) only answers on loopback.
                    docker.image(env.PLAYWRIGHT_IMAGE).inside("--network container:${env.E2E_PROJECT}-api-1") {
                        dir('e2e') {
                            sh 'npm ci --no-audit --no-fund'
                            sh 'CI=1 npx playwright test'
                        }
                    }
                }
            }
            post {
                always {
                    junit testResults: 'e2e/results/junit.xml', allowEmptyResults: true
                    publishHTML(target: [
                        reportName: 'Playwright Report',
                        reportDir: 'e2e/playwright-report',
                        reportFiles: 'index.html',
                        keepAll: true,
                        alwaysLinkToLastBuild: true,
                        allowMissing: true
                    ])
                    archiveArtifacts artifacts: 'e2e/playwright-report/**', allowEmptyArchive: true
                    sh 'docker compose -p "$E2E_PROJECT" --env-file server/.env.example -f e2e/docker-compose.e2e.yml logs --tail 40 api || true'
                    // Plain `down`: every datastore is on tmpfs, so nothing is left behind
                    // (and `down -v` is never used on a shared Docker daemon).
                    sh 'docker compose -p "$E2E_PROJECT" --env-file server/.env.example -f e2e/docker-compose.e2e.yml down --remove-orphans || true'
                }
            }
        }
        // Lab 04: every branch and PR runs the same Jenkinsfile; `when { branch }` decides
        // which deploy stage (if any) a given run is allowed to reach.
        stage('Deploy — Staging') {
            when { branch 'develop' }
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                sh 'echo deploying to staging...'
            }
        }
        stage('Deploy — Production') {
            // beforeInput: without it Declarative asks the input question BEFORE evaluating
            // `when`, so develop/feature/PR builds would also stop and wait for approval.
            when {
                beforeInput true
                branch 'main'
            }
            // Note: the pipeline-wide timeout also covers this wait.
            input { message 'Deploy to production?' }
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                sh 'echo deploying to production...'
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
