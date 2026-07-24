pipeline {
  options {
  disableConcurrentBuilds()
  }
  
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ["/busybox/cat"]
    tty: true
    resources:
      requests:
        memory: "1Gi"
        cpu: "500m"
      limits:
        memory: "2Gi"
        cpu: "2"
    volumeMounts:
    - name: harbor-config
      mountPath: /kaniko/.docker
  - name: kubectl
    image: alpine/kubectl:latest
    command: ["cat"]
    tty: true
  volumes:
  - name: harbor-config
    secret:
      secretName: harbor-credentials
      items:
      - key: .dockerconfigjson
        path: config.json
"""
    }
  }

  environment {
    IMAGE = "std-harbor.kopoctc.kr/kopo17/runshoes"
    NS    = "runshoes"
  }

  stages {
    stage('Build & Push') {
      steps {
        container('kaniko') {
          sh """
            /kaniko/executor \
              --context=dir://${WORKSPACE} \
              --dockerfile=${WORKSPACE}/Dockerfile \
              --snapshot-mode=redo \
              --single-snapshot \
              --destination=${IMAGE}:${BUILD_NUMBER} \
              --destination=${IMAGE}:latest
          """
        }
      }
    }

    stage('Deploy') {
      steps {
        container('kubectl') {
          sh """
            kubectl -n ${NS} set image deployment/runshoes \
              runshoes=${IMAGE}:${BUILD_NUMBER} \
              seed-db=${IMAGE}:${BUILD_NUMBER}
            kubectl -n ${NS} rollout status deployment/runshoes --timeout=180s
          """
        }
      }
    }
  }
}