variable "application_name" {
  description = "Name of the application"
  type        = string
}

variable "image" {
  description = "Docker image. e.g. nginx:v1"
  type        = string
}

variable "hostname" {
  description = "Ingress hostname"
  type        = string
}

variable "certificate_issuer" {
  description = "Certificate cluster issuer name. e.g. staging or production"
  type        = string
}

variable "application_port" {
  description = "Application port"
  type        = number
  default     = 3000
}

variable "replicas" {
  description = "Number of replicas"
  type        = number
  default     = 1
}

variable "secrets" {
  description = "Secret key-value pairs"
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "config" {
  description = "Config key-value pairs"
  type        = map(string)
  default     = {}
}
