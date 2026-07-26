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
  - name: git
    image: alpine/git:latest
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
    TAG   = "${BUILD_NUMBER}"

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

stage('Update GitOps Manifest') {
      steps {
        container('git') {
          withCredentials([usernamePassword(
            credentialsId: 'gitlab-token',
            usernameVariable: 'GIT_USER',
            passwordVariable: 'GIT_TOKEN'
          )]) {
            sh '''
              rm -rf gitops
              git clone https://oauth2:${GIT_TOKEN}@std-gitlab.kopoctc.kr/kopo17/gitops.git
              cd gitops/apps/runshoes
              sed -i "s|newTag:.*|newTag: \\"${TAG}\\"|" kustomization.yaml
              git config user.email "jenkins@kopo17"
              git config user.name "jenkins-ci"
              git add kustomization.yaml
              git commit -m "deploy: runshoes 이미지 :${TAG} [skip ci]"
              git push origin main
            '''
          }
        }
      }
    }
  }
}