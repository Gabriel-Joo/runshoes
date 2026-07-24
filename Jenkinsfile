pipeline {
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
    volumeMounts:
    - name: harbor-config
      mountPath: /kaniko/.docker
  - name: kubectl
    image: bitnami/kubectl:1.29
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
    stage('Checkout') {
      steps {
        git branch: 'main',
            credentialsId: 'gitlab-token',
            url: 'https://std-gitlab.kopoctc.kr/kopo17/runshoes.git'
      }
    }

    stage('Build & Push') {
      steps {
        container('kaniko') {
          sh """
            /kaniko/executor \
              --context=dir://${WORKSPACE} \
              --dockerfile=${WORKSPACE}/Dockerfile \
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