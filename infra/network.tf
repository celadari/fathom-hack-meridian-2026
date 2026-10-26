# Dual-stack subnet: internal IPv4 (no external IPv4 on the VM: it would be billed ~$3.65/month),
# external IPv6 for outbound traffic (not billed), Private Google Access for Artifact Registry and
# Secret Manager. Everything the server talks to (Soroban RPC, Friendbot, Cloudflare tunnel edge,
# Ubuntu and Cloudflare apt repos) is reachable over IPv6, so no Cloud NAT is needed.
resource "google_compute_network" "fathom" {
  name                    = "fathom"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.this]
}

resource "google_compute_subnetwork" "fathom" {
  name                     = "fathom-${var.region}"
  network                  = google_compute_network.fathom.id
  region                   = var.region
  ip_cidr_range            = "10.10.0.0/24"
  stack_type               = "IPV4_IPV6"
  ipv6_access_type         = "EXTERNAL"
  private_ip_google_access = true
}

# The only inbound rule: SSH through Identity-Aware Proxy (35.235.240.0/20 is IAP's range).
# The demo API is reached through the Cloudflare tunnel, which only makes outbound connections.
resource "google_compute_firewall" "iap_ssh" {
  name          = "fathom-allow-iap-ssh"
  network       = google_compute_network.fathom.id
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["fathom-demo"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
