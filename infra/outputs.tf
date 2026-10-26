output "api_url" {
  description = "Demo server, through the Cloudflare tunnel. The app's VITE_DEMO_API is <api_url>/demo."
  value       = "https://api.${var.domain}"
}

output "app_urls" {
  description = "Where the app is served (also the CORS allow-list)."
  value       = split(",", local.allowed_origins)
}

output "pages_project_name" {
  value = cloudflare_pages_project.app.name
}

output "image" {
  description = "Image the VM runs; scripts/build-and-push.sh pushes it."
  value       = local.image
}

output "secret_ids" {
  description = "Secret Manager containers whose values you add by hand (infra/README.md)."
  value       = { for k, s in google_secret_manager_secret.manual : k => s.secret_id }
}

output "ssh_command" {
  description = "SSH through Identity-Aware Proxy (no inbound internet access)."
  value       = "gcloud compute ssh ${google_compute_instance.demo.name} --zone ${var.zone} --project ${var.project_id} --tunnel-through-iap"
}
