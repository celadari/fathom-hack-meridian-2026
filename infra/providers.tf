# Credentials: never key files.
#   Local:            gcloud auth application-default login   +   CLOUDFLARE_API_TOKEN in the environment
#   Terraform Cloud:  GCP dynamic credentials (Workload Identity Federation, see bootstrap/)
#                     + CLOUDFLARE_API_TOKEN as a sensitive workspace environment variable
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "cloudflare" {}
