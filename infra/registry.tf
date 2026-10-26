# demo-server images. scripts/build-and-push.sh builds docker/demo-server.Dockerfile and pushes
# :<git sha> and :latest. Only the newest images are kept, to stay within the 0.5 GB free storage.
resource "google_artifact_registry_repository" "fathom" {
  repository_id = "fathom"
  location      = var.region
  format        = "DOCKER"
  description   = "Fathom demo-server images"

  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }
  cleanup_policies {
    id     = "delete-older"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }

  depends_on = [google_project_service.this]
}
