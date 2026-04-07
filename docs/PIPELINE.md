# CI/CD Pipeline

## Overview

The project includes a CI/CD pipeline (Bitbucket Pipelines) that automates building, scanning, pushing, and deploying the Jira MCP Server to Kubernetes.

## Pipeline Stages

```
git push origin development
    │
    ▼
Stage 1: 🧱 Build Docker Image
    │     docker build → jira-mcp-server:${COMMIT_SHA}
    ▼
Stage 2: 🔍 Security Scan (optional)
    │     Trivy vulnerability scan on built image
    ▼
Stage 3: 📤 Push to Registry
    │     docker push → container registry
    ▼
Stage 4: 🚀 Deploy to Kubernetes
    │     helm upgrade --install → K8s namespace
    ▼
Notification: Webhook (success/failure)
```

## Stage Details

### Stage 1 — Build Docker Image

- Builds the Docker image from the `Dockerfile`
- Tags with the Git commit SHA for traceability
- Stores the tag for downstream stages

### Stage 2 — Security Scan (Optional)

- Runs [Trivy](https://github.com/aquasecurity/trivy) vulnerability scanner
- Controlled by `ENABLE_TRIVY` environment variable (set to `1` to enable)
- Scans the built Docker image for known CVEs
- Generates a scan report
- Optionally emails the report to a configured recipient

### Stage 3 — Push to Registry

- Authenticates with the container registry
- Pushes the tagged image

### Stage 4 — Deploy to Kubernetes

- Runs `helm lint` to validate the chart
- Deploys using `helm upgrade --install`
- Sets the image tag to the commit SHA
- Sends a webhook notification on success or failure

## Required Pipeline Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `REGISTRY_HOST` | Container registry hostname | Yes |
| `REGISTRY_USER` | Registry username | Yes |
| `REGISTRY_PASSWORD` | Registry password | Yes |
| `WEBHOOK_URL` | Notification webhook URL | Yes |
| `DOCKER_HUB_USERNAME` | Docker Hub username (for base image pulls) | Optional |
| `DOCKER_HUB_PASSWORD` | Docker Hub password | Optional |
| `ENABLE_TRIVY` | Set to `1` to enable Trivy scan | Optional |

## Adapting the Pipeline

The included `bitbucket-pipelines.yml` is designed for Bitbucket Pipelines with self-hosted runners. To adapt for other CI systems:

### GitHub Actions

```yaml
name: Build and Deploy
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -t ${{ secrets.REGISTRY_HOST }}/jira-mcp-server:${{ github.sha }} .
      - name: Push image
        run: |
          echo "${{ secrets.REGISTRY_PASSWORD }}" | docker login ${{ secrets.REGISTRY_HOST }} -u ${{ secrets.REGISTRY_USER }} --password-stdin
          docker push ${{ secrets.REGISTRY_HOST }}/jira-mcp-server:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        run: |
          helm upgrade --install jira-mcp-server deploy/ \
            --namespace your-namespace \
            --set image.repository="${{ secrets.REGISTRY_HOST }}/jira-mcp-server" \
            --set image.tag="${{ github.sha }}"
```

### GitLab CI

```yaml
stages:
  - build
  - deploy

build:
  stage: build
  script:
    - docker build -t $REGISTRY_HOST/jira-mcp-server:$CI_COMMIT_SHA .
    - docker push $REGISTRY_HOST/jira-mcp-server:$CI_COMMIT_SHA

deploy:
  stage: deploy
  script:
    - helm upgrade --install jira-mcp-server deploy/
        --namespace your-namespace
        --set image.repository="$REGISTRY_HOST/jira-mcp-server"
        --set image.tag="$CI_COMMIT_SHA"
```

## Security Scanning

The Trivy scan stage:
1. Pulls the Trivy scanner image from your container registry
2. Scans the built application image
3. Outputs a vulnerability report
4. Fails the pipeline if the scan produces no output (indicating an error)

To enable: Set `ENABLE_TRIVY=1` in your pipeline variables.
