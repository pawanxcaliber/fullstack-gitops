# Full Stack GitOps Architecture: From Code to Cluster

## 1. High-Level Architectural Design
This project implements a **Hybrid GitOps Architecture** using two physical machines and a cloud intermediary. The goal is to create a "Zero-Trust" deployment where the Production Server (Dep System) pulls changes securely, rather than allowing external push access.

### 🏗️ The Three Pillars

#### The Source (Dev System - A715)
*   **Role:** The "Editor."
*   **Function:** Development environment (VS Code). It pushes code and infrastructure definitions (YAML) to GitLab. It has no direct access to modify the production cluster workloads manually.

#### The Hub (GitLab Cloud)
*   **Role:** The "Single Source of Truth."
*   **Function:** Hosts the Git Repository (Code) and the Container Registry (Artifacts). It acts as the synchronization point between Dev and Ops.

#### The Target (Dep System - A311)
*   **Role:** The "Factory & Data Center."
*   **Function:**
    *   **Builder:** Runs the GitLab Runner to compile code and build Docker images.
    *   **Host:** Runs the Kubernetes (K3s) Cluster.
    *   **Controller:** Runs ArgoCD to sync the cluster state with Git.

---

## 2. Component Design & Setup Commands

### A. The Execution Engine: GitLab Runner on Dep System
**Design Pattern: The Polling Agent**
Instead of opening a firewall port on your router to let GitLab "push" jobs to your laptop, we install the GitLab Runner directly on the Dep System. It initiates outbound connections to GitLab, asking "Do you have work for me?" This bypasses NAT/Firewall issues.

**Architecture Flow:**
`GitLab CI (Cloud) <--- polls --- [Runner (Dep System)] ---> (Builds Docker Image) ---> (Pushes to Registry)`

**Implementation Commands (On Dep System):**
```bash
# 1. Download the Runner binary
sudo curl -L --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64

# 2. Make it executable
sudo chmod +x /usr/local/bin/gitlab-runner

# 3. Create a specialized CI user (Security Best Practice)
sudo useradd --comment 'GitLab Runner' --create-home gitlab-runner --shell /bin/bash

# 4. Install and Run the Service
sudo gitlab-runner install --user=gitlab-runner --working-directory=/home/gitlab-runner
sudo gitlab-runner start

# 5. Register the Runner (Links it to your GitLab Project)
sudo gitlab-runner register --url https://gitlab.com --token <YOUR_TOKEN>
# (Select 'shell' or 'docker' executor during prompt)
```

### B. The Application Stack (Microservices)
**Design Pattern: Containerized Microservices**
The application is split into three decoupled containers.
*   **Frontend:** Nginx serving static HTML/JS. Exposed via NodePort (Access: `http://<IP>:30xxx`).
*   **Backend:** Node.js API. Exposed via ClusterIP (Internal only). Connects to DB via Env Vars.
*   **Database:** PostgreSQL StatefulSet. Uses PVC (Persistent Volume Claim) to store data on the physical disk, ensuring data survives pod restarts.

**CI/Build Commands (Handled by Pipeline):**
These commands are automated in `.gitlab-ci.yml`, but here is what happens under the hood:
```bash
# Backend Build
docker build -t registry.gitlab.com/user/project/backend:v1 ./backend
docker push registry.gitlab.com/user/project/backend:v1

# Frontend Build
docker build -t registry.gitlab.com/user/project/frontend:v1 ./frontend
docker push registry.gitlab.com/user/project/frontend:v1
```

### C. The Deployment Controller: ArgoCD
**Design Pattern: The GitOps Controller (Pull Model)**
ArgoCD lives inside the cluster. It constantly compares the "Desired State" (Git YAMLs) with the "Actual State" (Running Pods).

**Architecture Flow:**
`[ArgoCD Pod] <--- watches --- [GitLab Repo (k8s folder)]`
`[ArgoCD Pod] ---> applies ---> [Kubernetes API]`

**Installation Commands (On Dep System):**
```bash
# 1. Create Namespace
sudo kubectl create namespace argocd

# 2. Install ArgoCD Manifests
sudo kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 3. Access the UI (Port Forwarding)
sudo kubectl port-forward svc/argocd-server -n argocd 8080:443 --address 0.0.0.0

# 4. Get Initial Admin Password
sudo kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

---

## 3. Architecture Comparison: GitOps vs. Traditional DevOps

| Feature | Traditional DevOps ("Push" Model) | GitOps ("Pull" Model) - **YOUR SETUP** |
| :--- | :--- | :--- |
| **Trigger** | CI Server runs `kubectl apply` | Cluster Agent (ArgoCD) detects Git change |
| **Security** | Risky: CI needs Cluster Admin keys. | **Secure:** Cluster has no outside access keys. |
| **Firewall** | Requires opening port 6443 to internet. | **Zero Inbound Ports.** Agent dials out. |
| **Drift** | Unknown manual changes persist. | **Self-Healing:** ArgoCD reverts manual changes. |
| **Rollback** | Complex "Undo" pipeline scripts. | **Simple:** `git revert` (Argo syncs previous commit). |

---

## 4. Master Cheat Sheet: Essential Commands

### 🛠️ Environment Setup (Dep System)

**Fixing Master Node Taint (Allowing Pods to run):**
```bash
sudo kubectl taint nodes --all node-role.kubernetes.io/master-
# OR specific node:
sudo kubectl taint nodes <node-name> hardware=high-performance:NoSchedule-
```

**Fixing DNS (The "Google DNS" Patch):**
```bash
sudo kubectl -n kube-system edit configmap coredns
# Change "forward . /etc/resolv.conf" -> "forward . 8.8.8.8 1.1.1.1"
# Then restart pods:
sudo kubectl -n kube-system delete pod -l k8s-app=kube-dns
```

### 🔍 Debugging & Verification

**Check Pod Status:**
```bash
sudo kubectl get pods -A  # -A means "All Namespaces"
```

**View Application Logs:**
```bash
sudo kubectl logs -l app=backend
sudo kubectl logs -l app=frontend
```

**The "Trojan Horse" Connectivity Test:**
(Used to verify Backend -> DB connection from inside the cluster)
```bash
# 1. Break into the backend container
sudo kubectl exec -it <backend-pod-name> -- sh

# 2. Run the internal test
wget -qO- http://localhost:5000/
# Expected: {"message":"✅ Backend successfully connected..."}
```

**Manual Image Sideloading (When Internet Fails):**
```bash
# 1. Pull via Docker
docker pull postgres:13
# 2. Save to file
docker save postgres:13 -o postgres.tar
# 3. Import to K3s
sudo k3s ctr images import postgres.tar
```
