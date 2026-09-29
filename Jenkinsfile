// Lab 03 — first declarative pipeline for the srisurart POS server (NestJS, server/).
// Lab 05 — three gates: unit tests + coverage, SonarQube quality gate, Playwright E2E.
// Lab 06 — shift-left security chain BEFORE the build: secrets → SAST → SCA → SBOM → policy.
// Lab 07 — immutable image → Trivy gate → local registry → blue/green on kind, auto-rollback.

// Runs a CLI that ships as an image (gitleaks, semgrep, syft, trivy, opa ...) against this
// workspace. The agent is itself a container: --volumes-from shares its workspace volume with
// the tool container, and -u keeps every report owned by the agent user.
def runTool(String image, String args, String extra = '') {
    sh "docker run --rm --volumes-from \$(hostname) -w \"\$WORKSPACE\" -u \$(id -u):\$(id -g) -e HOME=/tmp ${extra} ${image} ${args}"
}

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
        // Lab 06 security tools, pinned (a floating tag would change the verdict between builds).
        NODE_IMAGE = 'node:22-bookworm-slim'
        GITLEAKS_IMAGE = 'zricethezav/gitleaks:v8.30.1'
        SEMGREP_IMAGE = 'semgrep/semgrep:1.177.0'
        SYFT_IMAGE = 'anchore/syft:v1.52.0'
        COSIGN_IMAGE = 'gcr.io/projectsigstore/cosign:v2.6.1'
        TRIVY_IMAGE = 'aquasec/trivy:0.74.0'
        OPA_IMAGE = 'openpolicyagent/opa:1.21.0'
        SBOM = 'reports/sbom/srisurart-pos-server.cdx.json'
        // Lab 07: the kind cluster's registry, as the Docker daemon (push) and kind (pull) see it.
        REGISTRY = 'localhost:5001'
        K8S_NS = 'srisurart'
    }

    options {
        // A hung install, scan or E2E stack must not hold an executor forever. 30 minutes
        // (Lab 03 had 10): SonarQube + the api image for E2E add ~5, the Lab 06 security
        // chain ~3 more. The Quality Gate stage has its own, tighter 5-minute bound.
        timeout(time: 30, unit: 'MINUTES')
    }

    parameters {
        // Lab 07 demo switch: deploy a deliberately broken image to prove the rollback fires.
        booleanParam(name: 'INJECT_BROKEN_IMAGE', defaultValue: false,
                     description: 'Lab 07: deploy deploy/k8s/broken.Dockerfile (exits at start) instead of the real image')
    }

    stages {
        stage('Secrets Detection') {
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                sh 'rm -rf reports && mkdir -p reports/security reports/sbom'
                // `gitleaks git` walks the full history (the multibranch checkout is a full
                // clone), so a secret committed and later deleted is still caught. Reviewed
                // false positives are allowlisted, with reasons, in .gitleaks.toml.
                runTool(env.GITLEAKS_IMAGE, 'git --config .gitleaks.toml --redact --no-banner --report-format json --report-path reports/security/gitleaks-report.json .')
            }
            post {
                always { archiveArtifacts artifacts: 'reports/security/gitleaks-report.json', allowEmptyArchive: true }
            }
        }
        stage('SAST') {
            stages {
                stage('SAST — ESLint security') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        // eslint-plugin-security lives in security/eslint/ so the app keeps oxlint
                        // and its own dependency tree. Warnings are reported, not blocking.
                        runTool(env.NODE_IMAGE, "sh -c 'cd security/eslint && npm ci --no-audit --no-fund && cd ../../server && ../security/eslint/node_modules/.bin/eslint -c ../security/eslint/eslint.config.js -f ../security/eslint/node_modules/@microsoft/eslint-formatter-sarif/sarif.js -o ../reports/security/eslint-security.sarif src'")
                    }
                }
                stage('SAST — Semgrep') {
                    steps {
                        script { env.CURRENT_STAGE = env.STAGE_NAME }
                        runTool(env.SEMGREP_IMAGE, 'semgrep scan --config p/owasp-top-ten --config p/nodejs --metrics=off --sarif --output reports/security/semgrep.sarif server/src')
                    }
                }
            }
            post {
                always { archiveArtifacts artifacts: 'reports/security/*.sarif', allowEmptyArchive: true }
            }
        }
        stage('SCA — pnpm audit') {
            steps {
                script {
                    env.CURRENT_STAGE = env.STAGE_NAME
                    // pnpm audit exits non-zero on ANY finding, so the exit code is ignored and
                    // the verdict is taken from the JSON: fail on critical, warn below that.
                    runTool(env.NODE_IMAGE, "sh -c 'cd server && corepack pnpm audit --json > ../reports/security/audit.json || true'", '-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0')
                    def counts = sh(
                        script: "docker run --rm --volumes-from \$(hostname) -w \"\$WORKSPACE\" ${env.NODE_IMAGE} node -p \"const v=require('./reports/security/audit.json').metadata.vulnerabilities; [v.critical, v.high, v.moderate, v.low].join(' ')\"",
                        returnStdout: true
                    ).trim().tokenize(' ')
                    def critical = counts[0].toInteger()
                    def high = counts[1].toInteger()
                    def moderate = counts[2].toInteger()
                    if (critical > 0) {
                        // Red stage and red build, but the chain goes on: the SBOM is still
                        // produced and the Policy Gate is what actually stops the pipeline.
                        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                            error("Blocking: ${critical} critical vulnerabilities found")
                        }
                    } else if (high > 0) {
                        unstable("SCA warning: ${high} high vulnerabilities (not blocking)")
                    } else {
                        echo "SCA passed with 0 critical vulnerabilities (warnings allowed: ${moderate} moderate, ${counts[3]} low)"
                    }
                }
            }
            post {
                always { archiveArtifacts artifacts: 'reports/security/audit.json', allowEmptyArchive: true }
            }
        }
        stage('SBOM') {
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                // CycloneDX SBOM of the server, from its lockfile (node_modules left over from an
                // earlier build in this workspace is excluded, or it would describe that build).
                runTool(env.SYFT_IMAGE, "scan dir:server --exclude './node_modules/**' --source-name srisurart-pos-server -q -o cyclonedx-json=${env.SBOM}")
                // Signed with the lab key pair: private key + password from Jenkins credentials
                // (single-quoted sh, so neither is interpolated into the log); the public key is
                // committed as security/cosign.pub and the signature is verified straight away.
                withCredentials([file(credentialsId: 'cosign-key', variable: 'COSIGN_KEY'),
                                 string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')]) {
                    sh 'docker run --rm --volumes-from $(hostname) -w "$WORKSPACE" -u $(id -u):$(id -g) -e HOME=/tmp -e COSIGN_PASSWORD "$COSIGN_IMAGE" sign-blob --yes --key "$COSIGN_KEY" --tlog-upload=false --output-signature "$SBOM.sig" "$SBOM"'
                }
                runTool(env.COSIGN_IMAGE, "verify-blob --key security/cosign.pub --insecure-ignore-tlog=true --signature ${env.SBOM}.sig ${env.SBOM}")
                // Second, independent dependency scan (Trivy's database) over the signed SBOM;
                // its DB is cached on the agent volume between builds.
                runTool(env.TRIVY_IMAGE, "sbom -q --cache-dir /home/jenkins/agent/caches/trivy --format json --output reports/security/trivy-sbom.json ${env.SBOM}")
            }
            post {
                always { archiveArtifacts artifacts: 'reports/sbom/*, reports/security/trivy-sbom.json', allowEmptyArchive: true }
            }
        }
        stage('Policy Gate') {
            steps {
                script {
                    env.CURRENT_STAGE = env.STAGE_NAME
                    runTool(env.OPA_IMAGE, 'test policy/ -v')
                    runTool(env.NODE_IMAGE, 'node policy/build-input.mjs reports/security/audit.json reports/security/trivy-sbom.json reports/security/policy-input.json')
                    // --fail-defined: exit 1 as soon as any deny[] message exists.
                    def denied = sh(
                        script: "docker run --rm --volumes-from \$(hostname) -w \"\$WORKSPACE\" ${env.OPA_IMAGE} eval --fail-defined --format pretty -d policy/security.rego -i reports/security/policy-input.json 'data.srisurart.security.deny[_]'",
                        returnStatus: true
                    )
                    if (denied != 0) {
                        error('Policy Gate: build denied by policy/security.rego (CRITICAL CVE above)')
                    }
                    echo 'Policy Gate passed: policy/security.rego denies nothing'
                }
            }
        }
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
        stage('Build Image') {
            steps {
                script {
                    env.CURRENT_STAGE = env.STAGE_NAME
                    // Immutable tag = the commit, never `latest`: what runs in the cluster can
                    // always be traced back to exactly one commit.
                    def tag = env.GIT_COMMIT.substring(0, 7)
                    env.IMAGE = "${env.REGISTRY}/srisurart-server:${tag}"
                    sh 'docker build -q -t "$IMAGE" server'
                    if (params.INJECT_BROKEN_IMAGE) {
                        env.IMAGE = "${env.REGISTRY}/srisurart-server:${tag}-broken"
                        sh "docker build -q --build-arg BASE=${env.REGISTRY}/srisurart-server:${tag} -t \"\$IMAGE\" -f deploy/k8s/broken.Dockerfile deploy/k8s"
                    }
                    echo "Built ${env.IMAGE}"
                }
            }
        }
        stage('Container Scan') {
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                sh 'mkdir -p reports/image'
                // The image is scanned BEFORE it is pushed, so a vulnerable build never reaches
                // the registry. Trivy reads it from the Docker daemon (socket shared with the
                // agent; --group-add 0 lets the agent's uid use it).
                runTool(env.TRIVY_IMAGE, "image -q --cache-dir /home/jenkins/agent/caches/trivy --severity HIGH,CRITICAL --format sarif --output reports/image/trivy-image.sarif ${env.IMAGE}", '--group-add 0')
                runTool(env.TRIVY_IMAGE, "image -q --cache-dir /home/jenkins/agent/caches/trivy --severity HIGH,CRITICAL --exit-code 1 ${env.IMAGE}", '--group-add 0')
            }
            post {
                always { archiveArtifacts artifacts: 'reports/image/trivy-image.sarif', allowEmptyArchive: true }
            }
        }
        stage('Push Image') {
            steps {
                script { env.CURRENT_STAGE = env.STAGE_NAME }
                sh 'docker push -q "$IMAGE"'
            }
        }
        stage('Blue/Green Deploy') {
            when { not { changeRequest() } }
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
                        // Smoke test the new colour directly, through its own Service, BEFORE any
                        // user traffic moves. `wait` on the pod phase gives a reliable exit code.
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
                    // Automatic rollback: point the Service back at the colour that was serving,
                    // and return the failed colour to its previous (working) ReplicaSet.
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
