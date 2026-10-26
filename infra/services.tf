resource "google_project_service" "this" {
  for_each = toset([
    "compute.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iap.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}
