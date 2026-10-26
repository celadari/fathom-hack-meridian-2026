variable "project_id" {
  description = "Google Cloud project that hosts the demo server."
  type        = string
}

variable "region" {
  description = "Free-tier e2-micro regions: us-west1, us-central1, us-east1."
  type        = string
  default     = "us-central1"
  validation {
    condition     = contains(["us-west1", "us-central1", "us-east1"], var.region)
    error_message = "The Compute Engine free tier only covers us-west1, us-central1 and us-east1."
  }
}

variable "zone" {
  description = "Zone for the VM, inside var.region."
  type        = string
  default     = "us-central1-a"
}

variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the zone, the Pages project and the tunnel."
  type        = string
}

variable "domain" {
  description = "Cloudflare zone, e.g. example.com. The demo API is served at api.<domain>."
  type        = string
}

variable "pages_project_name" {
  description = "Cloudflare Pages project name; the app is served at <name>.pages.dev."
  type        = string
  default     = "fathom"
}

variable "app_hostname" {
  description = "Optional custom domain for the app (e.g. fathom.example.com). Empty: only <name>.pages.dev."
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "demo-server image tag the VM runs (scripts/build-and-push.sh pushes the git SHA and latest)."
  type        = string
  default     = "latest"
}

variable "external_ipv4" {
  description = "Fallback: give the VM an external IPv4 (billed, about $3.65/month). Default false: IPv6 egress only, $0."
  type        = bool
  default     = false
}
