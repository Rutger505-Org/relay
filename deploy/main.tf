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

# ---------------------------------------------------------------------------
# LiveKit (self-hosted SFU for 1:1 voice calls)
#
# Runs inside the SAME namespace as the app (no separate LiveKit namespace).
# - Signaling (wss) is served on 7880 and exposed through the app's existing
#   Traefik ingress under the /rtc path, so it reuses the app's hostname + TLS
#   cert. The livekit-client SDK connects to wss://<hostname>/rtc.
# - WebRTC media uses a single UDP port (7882) plus a TCP fallback (7881),
#   exposed via a LoadBalancer service so clients reach the node directly.
#   The node's public IP must allow inbound UDP 7882 and TCP 7881.
# - The API key/secret are generated here (per environment) and injected into
#   both LiveKit and the app, so no external secret wiring is required.
# ---------------------------------------------------------------------------

resource "random_id" "livekit_api_key" {
  byte_length = 8
}

resource "random_password" "livekit_api_secret" {
  length  = 40
  special = false
}

locals {
  livekit_api_key    = "API${random_id.livekit_api_key.hex}"
  livekit_api_secret = random_password.livekit_api_secret.result

  # The public wss:// URL clients connect to. Reuses the app hostname; the
  # SDK appends /rtc which the ingress routes to the LiveKit service.
  livekit_url = "wss://${var.hostname}"

  livekit_config_yaml = yamlencode({
    port = 7880
    rtc = {
      tcp_port        = 7881
      udp_port        = 7882
      use_external_ip = true
    }
    keys = {
      (local.livekit_api_key) = local.livekit_api_secret
    }
    logging = {
      level = "info"
    }
  })
}

# LiveKit server config (holds the API secret, so it lives in a Secret).
resource "kubernetes_secret" "livekit" {
  depends_on = [kubernetes_namespace.app]

  metadata {
    name      = "${var.application_name}-livekit-config"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  data = {
    "config.yaml" = local.livekit_config_yaml
  }
}

resource "kubernetes_deployment" "livekit" {
  depends_on = [
    kubernetes_namespace.app,
    kubernetes_secret.livekit,
  ]

  metadata {
    name      = "${var.application_name}-livekit"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  timeouts {
    create = "2m"
    update = "2m"
    delete = "1m"
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "${var.application_name}-livekit"
      }
    }

    template {
      metadata {
        labels = {
          app = "${var.application_name}-livekit"
        }

        # Restart LiveKit whenever its config (incl. keys) changes.
        annotations = {
          "livekit/config-hash" = sha1(local.livekit_config_yaml)
        }
      }

      spec {
        automount_service_account_token = false

        container {
          name  = "livekit"
          image = "livekit/livekit-server:v1.12.0"
          args  = ["--config", "/etc/livekit/config.yaml"]

          resources {
            limits = {
              cpu    = "1000m"
              memory = "512Mi"
            }
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
          }

          port {
            name           = "signaling"
            container_port = 7880
          }
          port {
            name           = "rtc-tcp"
            container_port = 7881
          }
          port {
            name           = "rtc-udp"
            container_port = 7882
            protocol       = "UDP"
          }

          volume_mount {
            name       = "config"
            mount_path = "/etc/livekit"
            read_only  = true
          }
        }

        volume {
          name = "config"
          secret {
            secret_name = kubernetes_secret.livekit.metadata[0].name
          }
        }
      }
    }
  }
}

# ClusterIP service for LiveKit signaling, routed via the app ingress (/rtc).
resource "kubernetes_service" "livekit" {
  depends_on = [kubernetes_namespace.app]

  metadata {
    name      = "${var.application_name}-livekit"
    namespace = kubernetes_namespace.app.metadata[0].name
  }

  spec {
    selector = {
      app = "${var.application_name}-livekit"
    }

    port {
      name        = "signaling"
      port        = 7880
      target_port = 7880
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

# LoadBalancer service exposing WebRTC media on the node (single UDP port +
# TCP fallback). On k3s this binds the ports on the node's IP via servicelb.
resource "kubernetes_service" "livekit_media" {
  depends_on = [kubernetes_namespace.app]

  metadata {
    name      = "${var.application_name}-livekit-media"
    namespace = kubernetes_namespace.app.metadata[0].name
    annotations = {
      "metallb.universe.tf/allow-shared-ip" = "livekit-media"
    }
  }

  spec {
    load_balancer_ip = "192.168.178.231"

    selector = {
      app = "${var.application_name}-livekit"
    }

    port {
      name        = "rtc-tcp"
      port        = 7881
      target_port = 7881
      protocol    = "TCP"
    }
    port {
      name        = "rtc-udp"
      port        = 7882
      target_port = 7882
      protocol    = "UDP"
    }

    type = "LoadBalancer"
  }
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

        # Force a rolling restart of the pod when secrets or config change.
        # Updating only a Secret/ConfigMap value (e.g. AUTH_SECRET) doesn't alter
        # the pod spec, so the Deployment won't roll out and the pod keeps running
        # with the old env. Hashing the values into a template annotation changes
        # the pod template whenever they do, which forces a restart.
        # (timestamp() can't be used here: it differs between plan and apply,
        # which makes the kubernetes provider error with an inconsistent plan.)
        annotations = {
          "deployment/secrets-hash" = sha1(jsonencode(var.secrets))
          "deployment/config-hash"  = sha1(jsonencode(var.config))
        }
      }

      spec {
        automount_service_account_token = false

        init_container {
          name  = "${var.application_name}-migrate-db"
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
              cpu    = "1000m" # 1 CPU core
              memory = "512Mi" # 1GB memory
            }
            requests = {
              cpu    = "250m"  # 0.25 CPU core
              memory = "256Mi" # 512MB memory
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

          # Wire the app to the in-cluster LiveKit server. These take precedence
          # over any DEPLOYMENT_LIVEKIT_* values from the config/secret maps.
          env {
            name  = "LIVEKIT_URL"
            value = local.livekit_url
          }
          env {
            name  = "LIVEKIT_API_KEY"
            value = local.livekit_api_key
          }
          env {
            name  = "LIVEKIT_API_SECRET"
            value = local.livekit_api_secret
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
      app = kubernetes_deployment.app.metadata[0].name
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
    kubernetes_service.livekit,
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
        # LiveKit signaling (wss). The livekit-client SDK connects to
        # wss://<hostname>/rtc; route that to the LiveKit service. Listed first
        # so the more specific prefix is matched before the catch-all "/".
        path {
          path      = "/rtc"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service.livekit.metadata[0].name
              port {
                number = 7880
              }
            }
          }
        }

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
      secretName  = "${var.application_name}-tls"
      duration    = "2160h" # 90d
      renewBefore = "360h"  # 15d
      dnsNames    = [var.hostname]
      issuerRef = {
        name = var.certificate_issuer
        kind = "ClusterIssuer"
      }
    }
  }
}
