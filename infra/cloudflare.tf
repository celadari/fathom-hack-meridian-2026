# No domain needed. The app is on <project>.pages.dev. The demo API is a Worker on
# fathom-demo-api.<subdomain>.workers.dev that reaches the VM through Cloudflare Tunnel with
# Workers VPC (a VPC Service: no public hostname, no DNS record, no inbound access on the VM).

resource "cloudflare_pages_project" "app" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = "main"
}

resource "random_bytes" "tunnel_secret" {
  length = 32
}

# Remotely managed tunnel run by cloudflared on the VM (outbound QUIC only).
resource "cloudflare_zero_trust_tunnel_cloudflared" "api" {
  account_id    = var.cloudflare_account_id
  name          = "fathom-demo"
  config_src    = "cloudflare"
  tunnel_secret = random_bytes.tunnel_secret.base64
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "api" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.api.id
}

# The demo server as a private service behind the tunnel: the VM's fixed internal IP, port 8787.
resource "cloudflare_connectivity_directory_service" "demo" {
  account_id = var.cloudflare_account_id
  name       = "fathom-demo-server"
  type       = "http"
  http_port  = 8787
  host = {
    ipv4 = local.vm_internal_ip
    network = {
      tunnel_id = cloudflare_zero_trust_tunnel_cloudflared.api.id
    }
  }
}

resource "cloudflare_workers_script" "api" {
  account_id         = var.cloudflare_account_id
  script_name        = "fathom-demo-api"
  main_module        = "worker.js"
  content            = file("${path.module}/templates/worker.js")
  compatibility_date = "2026-10-01"
  bindings = [{
    type       = "vpc_service"
    name       = "DEMO"
    service_id = cloudflare_connectivity_directory_service.demo.service_id
  }]
}

resource "cloudflare_workers_script_subdomain" "api" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.api.script_name
  enabled     = true
}
