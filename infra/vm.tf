locals {
  registry_host = "${var.region}-docker.pkg.dev"
  image         = "${local.registry_host}/${var.project_id}/${google_artifact_registry_repository.fathom.repository_id}/demo-server:${var.image_tag}"
  # CORS: the Pages production URL only (no custom domain).
  allowed_origins = "https://${cloudflare_pages_project.app.subdomain}"
  # Fixed internal IP: the Workers VPC Service targets it through the tunnel.
  vm_internal_ip = "10.10.0.10"
}

data "google_compute_image" "ubuntu" {
  family  = "ubuntu-2404-lts-amd64"
  project = "ubuntu-os-cloud"
}

# Free tier: one e2-micro in us-west1/us-central1/us-east1 and 30 GB of standard persistent disk.
resource "google_compute_instance" "demo" {
  name         = "fathom-demo"
  machine_type = "e2-micro"
  zone         = var.zone
  tags         = ["fathom-demo"]

  boot_disk {
    initialize_params {
      image = data.google_compute_image.ubuntu.self_link
      size  = 30
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.fathom.id
    network_ip = local.vm_internal_ip
    stack_type = "IPV4_IPV6"
    # External IPv6 for outbound traffic (not billed). No external IPv4 unless var.external_ipv4.
    ipv6_access_config {
      network_tier = "PREMIUM"
    }
    dynamic "access_config" {
      for_each = var.external_ipv4 ? [1] : []
      content {
        network_tier = "PREMIUM"
      }
    }
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"] # access is limited by the service account's IAM, not by scopes
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    enable-oslogin = "TRUE"
    startup-script = templatefile("${path.module}/templates/startup.sh.tftpl", {
      project           = var.project_id
      registry_host     = local.registry_host
      image             = local.image
      keys_secret       = google_secret_manager_secret.manual["keys"].secret_id
      demo_token_secret = google_secret_manager_secret.manual["demo_token"].secret_id
      tunnel_secret     = google_secret_manager_secret.tunnel_token.secret_id
      allowed_origins   = local.allowed_origins
      listen_host       = local.vm_internal_ip
      confidential      = var.confidential_deposits
    })
  }

  allow_stopping_for_update = true

  depends_on = [
    google_secret_manager_secret_iam_member.vm_manual,
    google_secret_manager_secret_iam_member.vm_tunnel,
    google_artifact_registry_repository_iam_member.vm_pull,
  ]
}
