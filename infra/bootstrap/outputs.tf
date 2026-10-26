output "tfc_workspace_env" {
  description = "Environment variables to set on the HCP Terraform workspace (category: env)."
  value = var.enable_tfc ? {
    TFC_GCP_PROVIDER_AUTH             = "true"
    TFC_GCP_RUN_SERVICE_ACCOUNT_EMAIL = google_service_account.terraform[0].email
    TFC_GCP_WORKLOAD_PROVIDER_NAME    = google_iam_workload_identity_pool_provider.tfc[0].name
  } : null
}

output "budget" {
  value = google_billing_budget.monthly.name
}
