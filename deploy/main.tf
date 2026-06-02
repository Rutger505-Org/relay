# Namespace
resource "kubernetes_namespace" "app" {
  metadata {
    name = "${var.application_name}-${terraform.workspace}"
  }
}

# ConfigMap
resource "kubernetes_config_map" "app" {
  depends_on = [kubernetes_namespace.app]

  metadata {
    name      = "${var.application_name}-config"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  data = var.config
}

# Secret
resource "kubernetes_secret" "app" {
  depends_on = [kubernetes_namespace.app]

  metadata {
    name      = "${var.application_name}-secret"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  data = var.secrets
}

# Deployment
resource "kubernetes_deployment" "app" {
  depends_on = [
    kubernetes_namespace.app,
    kubernetes_config_map.app,
    kubernetes_secret.app,
  ]

  metadata {
    name      = "${var.application_name}-deployment"
    namespace = kubernetes_namespace.app.metadata[0].name
  }
  
  timeouts {
    create = "1m"
    update = "1m"
    delete = "1m"
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app = "${var.application_name}-deployment"
      }
    }

    template {
      metadata {
        labels = {
          app = "${var.application_name}-deployment"
        }
      }

      spec {
        automount_service_account_token = false

        init_container {
          name = "${var.application_name}-migrate-db"
          image = var.image
          command = [
            "sh",
            "-c",
            "cd /app && bun db:migrate"
          ]
          
          volume_mount {
            name       = "sqlite-data"
            mount_path = "/app/data/"
            read_only  = false
          }
        }
        
        
        container {
          name  = var.application_name
          image = var.image

          resources {
            limits = {
              cpu    = "1000m"    # 1 CPU core
              memory = "512Mi"   # 1GB memory
            }
            requests = {
              cpu    = "250m"     # 0.25 CPU core
              memory = "256Mi"    # 512MB memory
            }
          }

          port {
            container_port = var.application_port
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.app.metadata[0].name
            }
          }

          env_from {
            secret_ref {
              name = kubernetes_secret.app.metadata[0].name
            }
          }

          volume_mount {
            name       = "sqlite-data"
            mount_path = "/app/data/"
            read_only  = false
          }
        }

        volume {
          name = "sqlite-data"
          persistent_volume_claim {
            # Prevent implicit dependency on the PVC by referencing it. The PVC is only finalized when a reference to it is created.
            claim_name = "${var.application_name}-sqlite-db"
          }
        }
      }
    }
  }
}

# Persistent Volume Claim for SQLite Database
resource "kubernetes_persistent_volume_claim" "sqlite_db" {
  depends_on = [
    kubernetes_namespace.app,
  ]

  metadata {
    name      = "${var.application_name}-sqlite-db"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  spec {
    access_modes = ["ReadWriteOnce"]

    storage_class_name = "local-path"

    resources {
      requests = {
        storage = "100Mi"
      }
    }
  }
}

# Service
resource "kubernetes_service" "app" {
  depends_on = [kubernetes_namespace.app]

  metadata {
    name      = "${var.application_name}-service"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  spec {
    selector = {
      app =  kubernetes_deployment.app.metadata[0].name
    }

    port {
      port        = 80
      target_port = var.application_port
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

# Ingress
resource "kubernetes_ingress_v1" "app" {
  depends_on = [
    kubernetes_namespace.app,
    kubernetes_service.app,
  ]

  metadata {
    name      = "${var.application_name}-ingress"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  spec {
    ingress_class_name = "traefik"

    tls {
      hosts       = [var.hostname]
      secret_name = "${var.application_name}-tls"
    }

    rule {
      host = var.hostname

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service.app.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }
}

# Certificate
resource "kubernetes_manifest" "app" {
  depends_on = [
    kubernetes_namespace.app,
    kubernetes_ingress_v1.app
  ]

  manifest = {
    apiVersion = "cert-manager.io/v1"
    kind       = "Certificate"
    metadata = {
      name      = "${var.application_name}-certificate"
      namespace = kubernetes_namespace.app.metadata[0].name
    }
    spec = {
      secretName   = "${var.application_name}-tls"
      duration     = "2160h" # 90d
      renewBefore  = "360h" # 15d
      dnsNames     = [var.hostname]
      issuerRef = {
        name = var.certificate_issuer
        kind = "ClusterIssuer"
      }
    }
  }
}
