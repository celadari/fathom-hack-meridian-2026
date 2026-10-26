# Secret Manager containers only. Terraform never sees the Stellar keys or the demo token: their
# values are added by hand (infra/README.md), so they never reach Terraform state.
# Three secrets (not one per key) keep the active versions inside the free tier (6).
locals {
  manual_secrets = {
    keys       = "fathom-demo-keys"  # dotenv blob: FATHOM_KEY_* lines from scripts/export-demo-secrets.ts
    demo_token = "fathom-demo-token" # bearer token for the demo buttons
  }
}

resource "google_secret_manager_secret" "manual" {
  for_each  = local.manual_secrets
  secret_id = each.value
  replication {
    auto {}
  }
  labels     = { app = "fathom" }
  depends_on = [google_project_service.this]
}

# The tunnel token is the exception: Terraform creates the tunnel, so it already holds the token.
resource "google_secret_manager_secret" "tunnel_token" {
  secret_id = "fathom-tunnel-token"
  replication {
    auto {}
  }
  labels     = { app = "fathom" }
  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "tunnel_token" {
  secret      = google_secret_manager_secret.tunnel_token.id
  secret_data = data.cloudflare_zero_trust_tunnel_cloudflared_token.api.token
}
