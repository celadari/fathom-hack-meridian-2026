terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.8.1"
    }
  }
}

# Applied once from your laptop with your own credentials (gcloud auth application-default login).
provider "google" {
  project = var.project_id
}
