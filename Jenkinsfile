// 앱·챗봇 이미지 빌드 → Harbor push → 매니페스트(ronanlab-infra apps/runshoes) 태그 갱신 push. 배포는 ArgoCD Sync.
// petmint-rag-chatbot Jenkinsfile 과 같은 모양이다. 다른 점은 이미지가 둘(Dockerfile → runshoes, Dockerfile.chatbot → runshoes-chatbot)이라는 것뿐.
//
// - Job·자격 증명·폴링(2분)은 ronanlab-infra platform/jenkins/values.yaml 의 JCasC 가 만든다
// - 빌드는 BuildKit rootless — Pod 안에 Docker 데몬이 없다. 특권 컨테이너 대신 seccomp·AppArmor 만 푼다
// - Harbor 는 harbor.ronanlab.dev 그대로 부른다. 클러스터 CoreDNS 가 이 이름을 ingress-nginx 내부 Service 로 돌린다(ronanlab-infra platform/coredns)
// - 태그는 커밋 해시 12자리, 두 이미지가 같은 태그. latest 를 쓰지 않는다 — 같은 커밋이면 같은 태그, 태그로 코드를 찾아갈 수 있다
// - ronanlab-infra 는 git/checkout 단계가 아니라 sh 'git clone' 으로 받는다. Jenkins 폴링은 빌드 중 git 단계로 받은 저장소를
//   전부 감시한다 — git 단계로 받으면 태그 push 가 빌드를 다시 부르고, 그 빌드가 또 push 하는 루프가 된다
//
// 2026-10-18 학교 환경(kaniko, std-harbor, std-gitlab gitops, BUILD_NUMBER 태그)에서 바꿨다

pipeline {
  agent {
    kubernetes {
      yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: buildkit
      image: moby/buildkit:v0.33.1-rootless
      command: ["cat"]          # 단계가 exec 로 들어올 때까지 살아 있게(이미지의 busybox sleep 은 infinity 를 모른다)
      tty: true
      env:
        - name: BUILDKITD_FLAGS
          value: --oci-worker-no-process-sandbox
      securityContext:
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile: { type: Unconfined }
        appArmorProfile: { type: Unconfined }
      resources:
        requests: { cpu: 500m, memory: 1536Mi }   # vite build 가 Node 힙 1536Mi 를 쓴다(Dockerfile NODE_OPTIONS)
        # 2026-10-18 Spring 이미지(Vite + Maven 단계가 동시에 돈다) 로컬 실측 최대 2.4GiB — limit 3Gi 안. 넘으면 OOMKilled(exit 137)
        limits: { memory: 3Gi }
      volumeMounts:
        - { name: buildkitd, mountPath: /home/user/.local/share/buildkit }
  volumes:
    - { name: buildkitd, emptyDir: {} }
'''
    }
  }

  options {
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  environment {
    REGISTRY      = 'harbor.ronanlab.dev'
    IMAGE         = 'harbor.ronanlab.dev/runshoes/runshoes'
    CHATBOT_IMAGE = 'harbor.ronanlab.dev/runshoes/runshoes-chatbot'
    INFRA_REPO    = 'git@github.com:Gabriel-Joo/ronanlab-infra.git'
    KUSTOMIZATION = 'apps/runshoes/kustomization.yaml'
  }

  stages {
    stage('태그') {
      steps {
        script {
          env.TAG = env.GIT_COMMIT.take(12)
          currentBuild.description = "${env.IMAGE}:${env.TAG} + runshoes-chatbot"
        }
      }
    }

    stage('빌드·push') {
      steps {
        container('buildkit') {
          withCredentials([usernamePassword(credentialsId: 'harbor-robot-runshoes-jenkins',
                                            usernameVariable: 'HARBOR_USER', passwordVariable: 'HARBOR_PASSWORD')]) {
            // 작은따옴표 — 자격 증명을 Groovy 가 문자열에 끼워 넣지 않고 셸 환경변수로만 받는다.
            // set +x: Jenkins sh 는 -x 로 돈다. 아래 printf 가 펼쳐져 로그에 찍히지 않게 끈다
            // 두 이미지를 한 컨테이너에서 차례로 — buildctl-daemonless.sh 는 부를 때마다 데몬을 새로 띄운다(kaniko 때처럼 컨테이너를 나눌 필요가 없다)
            sh '''
              set +x
              export DOCKER_CONFIG="$WORKSPACE_TMP/docker"
              mkdir -p "$DOCKER_CONFIG"
              AUTH=$(printf '%s:%s' "$HARBOR_USER" "$HARBOR_PASSWORD" | base64 | tr -d '\\n')
              printf '{"auths":{"%s":{"auth":"%s"}}}' "$REGISTRY" "$AUTH" > "$DOCKER_CONFIG/config.json"
              unset AUTH
              build() {  # build <Dockerfile> <이미지>
                echo "push → $2:$TAG ($1)"
                buildctl-daemonless.sh build --progress=plain \
                  --frontend dockerfile.v0 --local context=. --local dockerfile=. --opt filename="$1" \
                  --opt label:org.opencontainers.image.revision="$GIT_COMMIT" \
                  --opt label:org.opencontainers.image.source=https://github.com/Gabriel-Joo/runshoes \
                  --output type=image,name="$2:$TAG",push=true
              }
              build Dockerfile "$IMAGE"
              build Dockerfile.chatbot "$CHATBOT_IMAGE"
            '''
          }
        }
      }
    }

    stage('매니페스트 태그') {
      // jnlp 컨테이너(git·ssh 있음)에서 돈다. deploy key 는 ronanlab-infra 에만 쓸 수 있다(ronanlab-infra scripts/make-deploy-keys.sh)
      steps {
        withCredentials([sshUserPrivateKey(credentialsId: 'ronanlab-infra-deploy-key', keyFileVariable: 'INFRA_KEY')]) {
          sh '''
            set -eu
            # GitHub 호스트 키를 박아 둔다(처음 본 키를 믿지 않는다). https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
            KH="$WORKSPACE_TMP/known_hosts"
            echo 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' > "$KH"
            export GIT_SSH_COMMAND="ssh -i $INFRA_KEY -o IdentitiesOnly=yes -o UserKnownHostsFile=$KH -o StrictHostKeyChecking=yes"
            D="$WORKSPACE_TMP/infra"
            rm -rf "$D"
            git clone -q --depth 1 --branch main "$INFRA_REPO" "$D"
            cd "$D"
            git config user.name 'Jenkins runshoes-app'
            git config user.email 'jenkins@ronanlab.dev'
            for i in 1 2 3; do
              # newTag 줄이 둘(runshoes, runshoes-chatbot) — 같은 sed 가 둘 다 바꾸고, 둘 다 바뀌었는지 센다
              sed -E -i 's/^(    newTag: )"[0-9a-f]{12}"/\\1"'"$TAG"'"/' "$KUSTOMIZATION"
              n=$(grep -c '^    newTag: "'"$TAG"'"' "$KUSTOMIZATION" || true)
              [ "$n" = 2 ] || { echo "newTag 줄이 2개가 아니다($n): $KUSTOMIZATION"; exit 1; }
              if git diff --quiet; then echo "이미 $TAG — 커밋할 것 없음"; exit 0; fi
              git commit -q -am "runshoes: 이미지 태그 $TAG" -m "runshoes $GIT_COMMIT, Jenkins runshoes-app #$BUILD_NUMBER"
              if git push -q origin HEAD:main; then echo "push → $KUSTOMIZATION newTag $TAG"; exit 0; fi
              # 사람이나 다른 Job(petmint-app)이 먼저 push 했다 — 최신 main 위에서 다시 바꾼다
              git fetch -q --depth 1 origin main && git reset -q --hard FETCH_HEAD
            done
            echo "push 3번 실패"; exit 1
          '''
        }
      }
    }
  }

  post {
    always {
      // 자격 증명 파일은 Pod 와 함께 사라지지만, 그 전에 지운다
      sh 'rm -rf "$WORKSPACE_TMP/docker" "$WORKSPACE_TMP/infra" "$WORKSPACE_TMP/known_hosts"'
    }
  }
}
