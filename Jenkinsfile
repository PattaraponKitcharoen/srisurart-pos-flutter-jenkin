// Lab 03 — first declarative pipeline for the srisurart POS server (NestJS, server/).
// Lab 05 — three gates: unit tests + coverage, SonarQube quality gate, Playwright E2E.
// Lab 06 — shift-left security: secrets, SAST, SCA, signed SBOM, OPA policy gate.
// Lab 07 — immutable image → Trivy gate → local registry → blue/green on kind, auto-rollback.
// Lab 10 — capstone: every stage runs on an ephemeral Kubernetes pod (no static agent, no
//          Docker socket), independent checks run in parallel, a Pipeline Health Gate guards
//          production, and every result is e-mailed with the branch and build URL.
//
// Secrets: none in this file. The Sonar token (withSonarQubeEnv), cosign key + password and
// kubeconfig (withCredentials) come from Jenkins credentials; the E2E stack uses the public
// dev-only values of server/.env.example plus a per-build random platform-admin password.
// The kind registry is a local, unauthenticated lab registry, so it needs no credential.

pipeline {
    agent none

    environment {
        APP_NAME = 'srisurart-pos-server'
        NODE_ENV = 'test'
        SBOM = 'reports/sbom/srisurart-pos-server.cdx.json'
        // Kaniko and crane push to the registry by its name on the kind network; the cluster
        // pulls the same image as localhost:5001/... through its containerd mirror (Lab 07).
        PUSH_REGISTRY = 'kind-registry:5000'
        REGISTRY = 'localhost:5001'
        K8S_NS = 'srisurart'
        // Lab 09 monitoring stack, reachable from the pods on the kind network.
        PROMETHEUS_URL = 'http://prometheus:9090'
        HEALTH_BUILDS = '20'
        HEALTH_MIN_SUCCESS = '0.90'
        NOTIFY_TO = 'srisurart-team@lab.local'
    }

    options {
        // Covers waiting for pods as well as running them (agent none at the top).
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    parameters {
        // Lab 07 demo switch: deploy a deliberately broken image to prove the rollback fires.
        booleanParam(name: 'INJECT_BROKEN_IMAGE', defaultValue: false,
                     description: 'Lab 07: deploy deploy/k8s/broken.Dockerfile (exits at start) instead of the real image')
    }

    stages {
        stage('Build & Verify') {
            // One pod per run, one container per tool (ci/k8s/build-pod.yaml), deleted afterwards.
            agent {
                kubernetes {
                    cloud 'kind-srisurart'
                    yamlFile 'ci/k8s/build-pod.yaml'
                    defaultContainer 'node'
                }
            }
            stages {
                stage('Install') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        sh 'rm -rf reports && mkdir -p reports/security reports/sbom reports/image'
                        dir('server') {
                            sh 'node -v && corepack pnpm -v'
                            sh 'corepack pnpm install --frozen-lockfile'
                        }
                    }
                }
                stage('Checks') {
                    // Independent, so they run side by side; the first real failure stops the rest.
                    failFast true
                    parallel {
                        stage('Secrets') {
                            steps {
                                script { env.CURRENT_STAGE = env.STAGE_NAME }
                                // Full history of the commit being built: a secret committed and later
                                // deleted is still caught. --log-opts=HEAD, because this checkout also
                                // fetches every other branch and gitleaks' default is `git log --all`.
                                // Reviewed false positives are allowlisted, with reasons, in .gitleaks.toml.
                                container('gitleaks') {
                                    sh 'gitleaks git --log-opts=HEAD --config .gitleaks.toml --redact --no-banner --report-format json --report-path reports/security/gitleaks-report.json .'
                                }
                            }
                        }
                        stage('Lint') {
                            steps {
                                script { env.CURRENT_STAGE = env.STAGE_NAME }
                                dir('server') { sh 'corepack pnpm lint && corepack pnpm typecheck' }
                            }
                        }
                        stage('Unit Test') {
                            steps {
                                script { env.CURRENT_STAGE = env.STAGE_NAME }
                                // Coverage is judged by the Quality Gate, not here.
                                dir('server') {
                                    sh 'corepack pnpm exec vitest run --coverage --reporter=default --reporter=junit --outputFile.junit=reports/junit.xml'
                                }
                            }
                            post {
                                always {
                                    junit testResults: 'server/reports/junit.xml', allowEmptyResults: true
                                    recordCoverage(
                                        tools: [[parser: 'COBERTURA', pattern: 'server/coverage/cobertura-coverage.xml']],
                                        sourceDirectories: [[path: 'server']],
                                        sourceCodeRetention: 'LAST_BUILD'
                                    )
                                }
                            }
                        }
                        stage('SAST — ESLint security') {
                            steps {
                                script { env.CURRENT_STAGE = env.STAGE_NAME }
                                // eslint-plugin-security lives in security/eslint/ so the app keeps
                                // oxlint and its own dependency tree. Warnings are reported, not blocking.
                                sh 'cd security/eslint && npm ci --no-audit --no-fund'
                                dir('server') {
                                    sh '../security/eslint/node_modules/.bin/eslint -c ../security/eslint/eslint.config.js -f ../security/eslint/node_modules/@microsoft/eslint-formatter-sarif/sarif.js -o ../reports/security/eslint-security.sarif src'
                                }
                            }
                        }
                        stage('SAST — Semgrep') {
                            steps {
                                script { env.CURRENT_STAGE = env.STAGE_NAME }
                                container('semgrep') {
                                    sh 'semgrep scan --config p/owasp-top-ten --config p/nodejs --metrics=off --sarif --output reports/security/semgrep.sarif server/src'
                                }
                            }
                        }
                        stage('SCA — pnpm audit') {
                            steps {
                                script {
                                    env.CURRENT_STAGE = env.STAGE_NAME
                                    // pnpm audit exits non-zero on ANY finding, so the verdict comes
                                    // from the JSON: fail on critical, warn below that.
                                    sh 'cd server && corepack pnpm audit --json > ../reports/security/audit.json || true'
                                    def counts = sh(
                                        script: "node -p \"const v=require('./reports/security/audit.json').metadata.vulnerabilities; [v.critical, v.high, v.moderate, v.low].join(' ')\"",
                                        returnStdout: true
                                    ).trim().tokenize(' ')
                                    def critical = counts[0].toInteger()
                                    def high = counts[1].toInteger()
                                    if (critical > 0) {
                                        // Red stage, but the chain goes on: the Policy Gate is what
                                        // stops the pipeline (and failFast is not triggered).
                                        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                                            error("Blocking: ${critical} critical vulnerabilities found")
                                        }
                                    } else if (high > 0) {
                                        unstable("SCA warning: ${high} high vulnerabilities (not blocking)")
                                    } else {
                                        echo "SCA passed with 0 critical vulnerabilities (warnings allowed: ${counts[2]} moderate, ${counts[3]} low)"
                                    }
                                }
                            }
                        }
                    }
                    post {
                        always { archiveArtifacts artifacts: 'reports/security/*', allowEmptyArchive: true }
                    }
                }
                stage('SBOM') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        // CycloneDX SBOM of the server from its lockfile (node_modules excluded).
                        container('syft') {
                            sh "/syft scan dir:server --exclude './node_modules/**' --source-name srisurart-pos-server -q -o cyclonedx-json=${env.SBOM}"
                        }
                        // Signed with the lab key pair from Jenkins credentials (single-quoted sh,
                        // so neither is interpolated into the log) and verified with the committed
                        // public key straight away.
                        container('cosign') {
                            withCredentials([file(credentialsId: 'cosign-key', variable: 'COSIGN_KEY'),
                                             string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')]) {
                                sh 'cosign sign-blob --yes --key "$COSIGN_KEY" --tlog-upload=false --output-signature "$SBOM.sig" "$SBOM"'
                            }
                            sh 'cosign verify-blob --key security/cosign.pub --insecure-ignore-tlog=true --signature "$SBOM.sig" "$SBOM"'
                        }
                        // Second, independent dependency scan (Trivy's DB, cached on the kind node).
                        container('trivy') {
                            sh 'trivy sbom -q --cache-dir /cache/trivy --format json --output reports/security/trivy-sbom.json "$SBOM"'
                        }
                    }
                    post {
                        always { archiveArtifacts artifacts: 'reports/sbom/*, reports/security/trivy-sbom.json', allowEmptyArchive: true }
                    }
                }
                stage('Policy Gate') {
                    steps {
                        script {
                            env.CURRENT_STAGE = env.STAGE_NAME
                            container('opa') { sh '/opa test policy/ -v' }
                            sh 'node policy/build-input.mjs reports/security/audit.json reports/security/trivy-sbom.json reports/security/policy-input.json'
                            // --fail-defined: exit 1 as soon as any deny[] message exists.
                            def denied = 0
                            container('opa') {
                                denied = sh(
                                    script: "/opa eval --fail-defined --format pretty -d policy/security.rego -i reports/security/policy-input.json 'data.srisurart.security.deny[_]'",
                                    returnStatus: true
                                )
                            }
                            if (denied != 0) {
                                error('Policy Gate: build denied by policy/security.rego (CRITICAL CVE above)')
                            }
                            echo 'Policy Gate passed: policy/security.rego denies nothing'
                        }
                    }
                }
                stage('SonarQube Analysis') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        // withSonarQubeEnv hands the host URL and the sonar-token credential to the
                        // scanner through SONARQUBE_SCANNER_PARAMS: the token is never on a command line.
                        dir('server') {
                            withSonarQubeEnv('SonarQube') {
                                sh 'npx --yes @sonar/scan@5.0.1 -Dsonar.projectKey=srisurart-pos-server'
                            }
                        }
                    }
                }
                stage('Quality Gate') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        timeout(time: 5, unit: 'MINUTES') {
                            waitForQualityGate abortPipeline: true
                        }
                    }
                }
                stage('Build Image') {
                    steps {
                        script {
                            env.CURRENT_STAGE = env.STAGE_NAME
                            // Immutable tag = the commit, never `latest`.
                            env.TAG = env.GIT_COMMIT.substring(0, 7)
                            env.IMAGE = "${env.REGISTRY}/srisurart-server:${env.TAG}"
                        }
                        // Kaniko builds without a Docker daemon, into a tarball: nothing is
                        // pushed until the scan below has passed.
                        container(name: 'kaniko', shell: '/busybox/sh') {
                            sh '''/kaniko/executor --context "dir://$WORKSPACE/server" --dockerfile "$WORKSPACE/server/Dockerfile" \
                                  --destination "$PUSH_REGISTRY/srisurart-server:$TAG" --no-push --tar-path "$WORKSPACE/image.tar"'''
                        }
                    }
                }
                stage('Container Scan') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        container('trivy') {
                            sh 'trivy image -q --cache-dir /cache/trivy --input image.tar --severity HIGH,CRITICAL --format sarif --output reports/image/trivy-image.sarif'
                            sh 'trivy image -q --cache-dir /cache/trivy --input image.tar --severity HIGH,CRITICAL --exit-code 1'
                        }
                    }
                    post {
                        always { archiveArtifacts artifacts: 'reports/image/trivy-image.sarif', allowEmptyArchive: true }
                    }
                }
                stage('Push Image') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        container('crane') {
                            sh 'crane push --insecure image.tar "$PUSH_REGISTRY/srisurart-server:$TAG"'
                        }
                        script {
                            if (params.INJECT_BROKEN_IMAGE) {
                                env.IMAGE = "${env.REGISTRY}/srisurart-server:${env.TAG}-broken"
                                container(name: 'kaniko', shell: '/busybox/sh') {
                                    sh '''/kaniko/executor --context "dir://$WORKSPACE/deploy/k8s" --dockerfile "$WORKSPACE/deploy/k8s/broken.Dockerfile" \
                                          --build-arg "BASE=$PUSH_REGISTRY/srisurart-server:$TAG" --insecure-pull --insecure \
                                          --destination "$PUSH_REGISTRY/srisurart-server:$TAG-broken"'''
                                }
                            }
                            echo "Pushed ${env.IMAGE}"
                        }
                    }
                }
            }
        }
        stage('E2E') {
            // A second pod built around the image just pushed: Postgres, both Redis and the api
            // share the pod's network namespace, so the suite (node container) calls
            // http://127.0.0.1:3000 and the platform plane answers on loopback, as in Lab 05.
            agent {
                kubernetes {
                    cloud 'kind-srisurart'
                    defaultContainer 'node'
                    yaml """
apiVersion: v1
kind: Pod
spec:
  securityContext:
    fsGroup: 1000
  containers:
  - name: jnlp
    resources:
      requests: {cpu: 100m, memory: 256Mi}
      limits: {memory: 768Mi}
  - name: postgres
    image: postgres:16-alpine
    command: [cat]
    tty: true
  - name: redis
    image: redis:7-alpine
    command: [cat]
    tty: true
  - name: api
    image: ${env.IMAGE}
    command: [cat]
    tty: true
    securityContext: {runAsUser: 1000, runAsGroup: 1000}
  - name: node
    image: node:22-bookworm-slim
    command: [cat]
    tty: true
    securityContext: {runAsUser: 1000, runAsGroup: 1000}
    env:
    - {name: HOME, value: /tmp}
"""
                }
            }
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                sh 'mkdir -p reports/e2e'
                // Throwaway platform-admin password for a stack that lives for this stage only.
                withEnv(["E2E_PLATFORM_PASSWORD=${UUID.randomUUID()}"]) {
                    // Datastores on the pod's tmpfs, reached on 127.0.0.1. `set -a; .` loads
                    // .env.example's public dev-only values, as the Lab 05 compose file did.
                    container('postgres') {
                        sh '''
                            set +x  # passwords below: keep them out of the log, even dev-only ones
                            set -a; . server/.env.example; set +a
                            mkdir -p /tmp/pg && chown postgres /tmp/pg
                            printf '%s' "$POSTGRES_PASSWORD" > /tmp/pg/pw && chown postgres /tmp/pg/pw
                            su-exec postgres initdb -D /tmp/pg/data -U postgres --pwfile=/tmp/pg/pw -A scram-sha-256 >/dev/null
                            JENKINS_NODE_COOKIE=dontKillMe su-exec postgres pg_ctl -D /tmp/pg/data -l /tmp/pg/log -w \
                                -o "-c listen_addresses=127.0.0.1 -c max_connections=50" start
                            export PGPASSWORD="$POSTGRES_PASSWORD"
                            psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE pos'
                            # RLS is only real if the app connects as neither superuser nor owner.
                            psql -h 127.0.0.1 -U postgres -d pos -v ON_ERROR_STOP=1 \
                                -c "CREATE ROLE pos_app LOGIN PASSWORD '$POS_APP_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS" \
                                -c 'GRANT CONNECT ON DATABASE pos TO pos_app'
                        '''
                    }
                    container('redis') {
                        sh '''
                            set +x  # passwords below: keep them out of the log, even dev-only ones
                            set -a; . server/.env.example; set +a
                            JENKINS_NODE_COOKIE=dontKillMe redis-server --port 6379 --requirepass "$REDIS_PASSWORD" --save '' --daemonize yes
                            JENKINS_NODE_COOKIE=dontKillMe redis-server --port 6380 --requirepass "$REDIS_PASSWORD" --maxmemory-policy noeviction --daemonize yes
                        '''
                    }
                    container('api') {
                        sh '''
                            set +x  # passwords below: keep them out of the log, even dev-only ones
                            set -a; . server/.env.example; set +a
                            export INSTANCE_ID=api-e2e DB_POOL_SIZE=5 LOG_LEVEL=warn
                            LOG="$WORKSPACE/reports/e2e/api.log"
                            cd /app
                            DATABASE_URL="postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/pos" node dist/db/migrate.js up
                            export DATABASE_URL="postgres://pos_app:$POS_APP_PASSWORD@127.0.0.1:5432/pos"
                            export REDIS_CACHE_URL="redis://:$REDIS_PASSWORD@127.0.0.1:6379"
                            export REDIS_QUEUE_URL="redis://:$REDIS_PASSWORD@127.0.0.1:6380"
                            export PLATFORM_ADMINS="e2e-admin:$E2E_PLATFORM_PASSWORD"
                            JENKINS_NODE_COOKIE=dontKillMe nohup node dist/main.js > "$LOG" 2>&1 &
                            for i in $(seq 1 60); do
                                wget -qO- http://127.0.0.1:3000/health/ready >/dev/null 2>&1 && exit 0
                                sleep 2
                            done
                            tail -40 "$LOG"; exit 1
                        '''
                    }
                    dir('e2e') {
                        sh 'npm ci --no-audit --no-fund'
                        sh 'CI=1 npx playwright test'
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
                    archiveArtifacts artifacts: 'e2e/playwright-report/**, reports/e2e/api.log', allowEmptyArchive: true
                }
            }
        }
        stage('Production') {
            // Only main ships. beforeAgent: other branches do not even get a deploy pod.
            when {
                beforeAgent true
                branch 'main'
            }
            agent {
                kubernetes {
                    cloud 'kind-srisurart'
                    yamlFile 'ci/k8s/deploy-pod.yaml'
                    defaultContainer 'deploy'
                }
            }
            stages {
                stage('Pipeline Health Gate') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        // Success rate of the last HEALTH_BUILDS finished runs, from Prometheus;
                        // below HEALTH_MIN_SUCCESS the deploy is refused (ci/health-gate.mjs).
                        sh 'node ci/health-gate.mjs'
                    }
                }
                stage('Deploy — Production') {
                    steps {
                        withCredentials([file(credentialsId: 'kind-kubeconfig', variable: 'KUBECONFIG')]) {
                            script {
                                env.CURRENT_STAGE = env.STAGE_NAME
                                sh 'mkdir -p reports/k8s && sh deploy/k8s/bootstrap.sh "$IMAGE"'
                                def current = sh(
                                    script: "kubectl -n ${env.K8S_NS} get svc srisurart -o jsonpath='{.spec.selector.color}'",
                                    returnStdout: true
                                ).trim()
                                def next = current == 'blue' ? 'green' : 'blue'
                                // Remembered for post { failure }, which runs outside this script block.
                                env.BG_CURRENT = current
                                env.BG_NEXT = next
                                echo "Service srisurart serves ${current}; deploying ${env.IMAGE} to ${next}"
                                sh "kubectl -n ${env.K8S_NS} get svc srisurart -o yaml | tee reports/k8s/svc-before.yaml"
                                sh "kubectl -n ${env.K8S_NS} set image deployment/srisurart-${next} app=${env.IMAGE}"
                                sh "kubectl -n ${env.K8S_NS} rollout status deployment/srisurart-${next} --timeout=120s"
                                // Smoke test the new colour through its own Service BEFORE traffic moves.
                                def smoke = "smoke-${env.BUILD_NUMBER}-${next}"
                                sh "kubectl -n ${env.K8S_NS} delete pod ${smoke} --ignore-not-found"
                                sh "kubectl -n ${env.K8S_NS} run ${smoke} --restart=Never --image=curlimages/curl:8.16.0 -- curl -sf --max-time 10 http://srisurart-${next}:3000/health/ready"
                                def ok = sh(script: "kubectl -n ${env.K8S_NS} wait --for=jsonpath='{.status.phase}'=Succeeded pod/${smoke} --timeout=60s", returnStatus: true)
                                sh "kubectl -n ${env.K8S_NS} logs ${smoke} || true; kubectl -n ${env.K8S_NS} delete pod ${smoke} --ignore-not-found"
                                if (ok != 0) { error("Smoke test of srisurart-${next} failed") }
                                sh "kubectl -n ${env.K8S_NS} patch svc srisurart -p '{\"spec\":{\"selector\":{\"color\":\"${next}\"}}}'"
                                sh "kubectl -n ${env.K8S_NS} get svc srisurart -o yaml | tee reports/k8s/svc-after.yaml"
                                echo "Switched traffic from ${current} to ${next}"
                            }
                        }
                    }
                    post {
                        always { archiveArtifacts artifacts: 'reports/k8s/*.yaml', allowEmptyArchive: true }
                        failure {
                            // Automatic rollback: traffic back to the colour that was serving, and
                            // the failed colour back to its previous (working) ReplicaSet.
                            withCredentials([file(credentialsId: 'kind-kubeconfig', variable: 'KUBECONFIG')]) {
                                script {
                                    if (env.BG_CURRENT) {
                                        echo "ROLLBACK: deploy to ${env.BG_NEXT} failed; keeping traffic on ${env.BG_CURRENT}"
                                        sh "kubectl -n ${env.K8S_NS} patch svc srisurart -p '{\"spec\":{\"selector\":{\"color\":\"${env.BG_CURRENT}\"}}}'"
                                        sh "kubectl -n ${env.K8S_NS} rollout undo deployment/srisurart-${env.BG_NEXT}"
                                        sh "kubectl -n ${env.K8S_NS} rollout status deployment/srisurart-${env.BG_NEXT} --timeout=120s || true"
                                        sh "kubectl -n ${env.K8S_NS} get svc srisurart -o jsonpath='{.spec.selector}'; echo"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    post {
        // `mail` needs no agent. Jenkins sends through mailpit:1025 (Manage Jenkins → System →
        // E-mail Notification); the inbox is http://127.0.0.1:8025.
        success {
            mail to: env.NOTIFY_TO,
                 subject: "✅ ${env.APP_NAME}: ${env.JOB_NAME} #${env.BUILD_NUMBER} passed (${env.BRANCH_NAME})",
                 body: "Branch: ${env.BRANCH_NAME}\nCommit: ${env.GIT_COMMIT}\nImage: ${env.IMAGE}\nBuild: ${env.BUILD_URL}\n"
        }
        unsuccessful {
            // env.STAGE_NAME is not the failed stage here, so each stage records CURRENT_STAGE.
            mail to: env.NOTIFY_TO,
                 subject: "❌ ${env.APP_NAME}: ${env.JOB_NAME} #${env.BUILD_NUMBER} ${currentBuild.currentResult} at ${env.CURRENT_STAGE} (${env.BRANCH_NAME})",
                 body: "Branch: ${env.BRANCH_NAME}\nResult: ${currentBuild.currentResult}\nStage: ${env.CURRENT_STAGE}\nBuild: ${env.BUILD_URL}console\n"
        }
    }
}
