# The VM's service account can only pull demo-server images and read its own three secrets.
resource "google_service_account" "vm" {
  account_id   = "fathom-demo-vm"
  display_name = "Fathom demo server VM"
}

resource "google_secret_manager_secret_iam_member" "vm_manual" {
  for_each  = google_secret_manager_secret.manual
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_secret_manager_secret_iam_member" "vm_tunnel" {
  secret_id = google_secret_manager_secret.tunnel_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_artifact_registry_repository_iam_member" "vm_pull" {
  repository = google_artifact_registry_repository.fathom.id
  location   = var.region
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.vm.email}"
}
