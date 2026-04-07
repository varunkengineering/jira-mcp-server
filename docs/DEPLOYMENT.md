# Kubernetes Deployment Guide

## Overview

This guide covers deploying the Jira MCP Server on Kubernetes. The server exposes Jira operations as MCP tools over HTTP, consumable by AI assistants like Kiro CLI, Cursor, Claude Desktop, etc.

## Architecture

```
┌──────────────────┐       HTTPS        ┌─────────────────────────────────────┐
│  MCP Client       │ ◄───────────────► │  Kubernetes Cluster                  │
│  (Developer)      │                   │                                      │
│                   │  POST /mcp        │  ┌──────────────────────────┐       │
│  Kiro CLI /       │  (JSON-RPC + SSE) │  │ jira-mcp-server Pod      │       │
│  Cursor /         │                   │  │ (Streamable HTTP :3000)  │       │
│  Claude Desktop   │                   │  └──────────┬───────────────┘       │
└──────────────────┘                   │             │                        │
                                       │  ┌──────────▼───────────────┐       │
                                       │  │ Service (ClusterIP:3000) │       │
                                       │  └──────────┬───────────────┘       │
                                       │             │                        │
                                       │  ┌──────────▼───────────────┐       │
                                       │  │ Ingress (nginx)          │       │
                                       │  │ your-domain.com/jira-mcp │       │
                                       │  └──────────────────────────┘       │
                                       └─────────────────────────────────────┘
```

## Prerequisites

- `kubectl` configured with cluster access
- `helm` v3+
- Docker CLI with access to your container registry
- Jira API token

## Transport Modes

| Mode | Env Value | Use Case |
|------|-----------|----------|
| stdio | `TRANSPORT=stdio` | Local dev (spawned as child process) |
| HTTP | `TRANSPORT=http` | Kubernetes / remote deployment |

In HTTP mode, the server exposes:
- `POST /mcp` — MCP Streamable HTTP endpoint (JSON-RPC over SSE)
- `GET /health` — Health check endpoint

## Deployment Steps

### 1. Build and Push Docker Image

```bash
cd jira-mcp-server

# Build
docker build -t your-registry.com/jira-mcp-server:latest .

# Login to registry
docker login your-registry.com

# Push
docker push your-registry.com/jira-mcp-server:latest
```

### 2. Create Jira Credentials Secret

```bash
kubectl create secret generic jira-mcp-credentials \
  --namespace your-namespace \
  --from-literal=JIRA_HOST="your-instance.atlassian.net" \
  --from-literal=JIRA_EMAIL="your-email@example.com" \
  --from-literal=JIRA_API_TOKEN="your-api-token" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 3. Configure values.yaml

Update `deploy/values.yaml` with your settings:

```yaml
image:
  repository: your-registry.com/jira-mcp-server
  tag: "latest"

imagePullSecrets:
  - name: your-registry-secret

ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: your-domain.com
      paths:
        - path: /jira-mcp(/|$)(.*)
          pathType: ImplementationSpecific

jiraSecret:
  name: jira-mcp-credentials
```

### 4. Deploy with Helm

```bash
# Lint
helm lint deploy/

# Deploy
helm upgrade --install jira-mcp-server deploy/ \
  --namespace your-namespace \
  --set image.repository="your-registry.com/jira-mcp-server" \
  --set image.tag="latest"
```

### 5. Verify Deployment

```bash
# Check pod status
kubectl get pods -n your-namespace -l app.kubernetes.io/name=jira-mcp-server

# Check logs
kubectl logs -n your-namespace -l app.kubernetes.io/name=jira-mcp-server

# Test health endpoint
kubectl port-forward -n your-namespace svc/jira-mcp-server 3001:3000
curl http://localhost:3001/health
# Expected: {"status":"ok"}
```

## Helm Chart Configuration

Key values in `deploy/values.yaml`:

| Key | Default | Description |
|-----|---------|-------------|
| `image.repository` | — | Container image repository |
| `image.tag` | `latest` | Image tag |
| `image.pullPolicy` | `Always` | Image pull policy |
| `service.type` | `ClusterIP` | Service type |
| `service.port` | `3000` | Service port |
| `ingress.enabled` | `true` | Enable ingress |
| `ingress.className` | `nginx` | Ingress class |
| `env.TRANSPORT` | `http` | Transport mode |
| `env.PORT` | `3000` | Server port |
| `jiraSecret.name` | `jira-mcp-credentials` | K8s secret name |
| `autoscaling.enabled` | `false` | Enable HPA |
| `resources.limits.cpu` | `500m` | CPU limit |
| `resources.limits.memory` | `256Mi` | Memory limit |

## Troubleshooting

### Pod not starting
```bash
kubectl describe pod -n your-namespace -l app.kubernetes.io/name=jira-mcp-server
kubectl logs -n your-namespace -l app.kubernetes.io/name=jira-mcp-server
```

### Image pull errors
```bash
# Verify registry secret exists
kubectl get secret your-registry-secret -n your-namespace

# Verify image exists
docker pull your-registry.com/jira-mcp-server:latest
```

### Jira API errors
```bash
# Verify secret
kubectl get secret jira-mcp-credentials -n your-namespace -o jsonpath='{.data.JIRA_HOST}' | base64 -d

# Test from inside the pod
kubectl exec -n your-namespace deploy/jira-mcp-server -- env | grep JIRA
```

### Rollback
```bash
helm rollback jira-mcp-server -n your-namespace
```
