data "cloudflare_zone" "this" {
  filter = {
    name = var.domain
  }
}

# The app: a direct-upload Pages project (scripts/deploy-frontend.sh runs wrangler pages deploy).
resource "cloudflare_pages_project" "app" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = "main"
}

resource "cloudflare_pages_domain" "app" {
  count        = var.app_hostname == "" ? 0 : 1
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.app.name
  name         = var.app_hostname
}

resource "cloudflare_dns_record" "app" {
  count   = var.app_hostname == "" ? 0 : 1
  zone_id = data.cloudflare_zone.this.id
  name    = var.app_hostname
  type    = "CNAME"
  content = cloudflare_pages_project.app.subdomain
  proxied = true
  ttl     = 1
}

# The demo API: a named tunnel from the VM (outbound only) to api.<domain>.
resource "random_bytes" "tunnel_secret" {
  length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "api" {
  account_id    = var.cloudflare_account_id
  name          = "fathom-demo"
  config_src    = "cloudflare"
  tunnel_secret = random_bytes.tunnel_secret.base64
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "api" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.api.id
  config = {
    ingress = [
      {
        hostname = "api.${var.domain}"
        service  = "http://127.0.0.1:8787"
      },
      {
        service = "http_status:404"
      },
    ]
  }
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "api" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.api.id
}

resource "cloudflare_dns_record" "api" {
  zone_id = data.cloudflare_zone.this.id
  name    = "api.${var.domain}"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.api.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}
