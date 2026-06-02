terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
  }

  backend "kubernetes" {
    config_path = "~/.kube/config"
    secret_suffix = var.application_name
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}
