// Lab 09 - saturation test: queue COUNT runs of srisurart-k8s at once.
// Pipeline job "lab09-load" (script pasted inline). It needs no executor: `build` with
// wait:false only enqueues. Each run gets its own LOAD_ID, otherwise Jenkins merges
// identical queue items into one and there is no backlog to measure.
pipeline {
    agent none
    parameters {
        string(name: 'COUNT', defaultValue: '10', description: 'How many concurrent builds to queue')
    }
    stages {
        stage('Queue builds') {
            steps {
                script {
                    int n = params.COUNT as int
                    for (int i = 1; i <= n; i++) {
                        build job: 'srisurart-k8s', wait: false,
                              parameters: [string(name: 'LOAD_ID', value: "load-${currentBuild.number}-${i}")]
                    }
                    echo "queued ${n} runs of srisurart-k8s"
                }
            }
        }
    }
}
