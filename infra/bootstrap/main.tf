data "google_project" "this" {
  project_id = var.project_id
}

resource "google_project_service" "this" {
  for_each = toset([
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "billingbudgets.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------- budget

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account_id
  display_name    = "fathom-monthly"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.budget_amount_usd)
    }
  }

  # Emails the billing account's admins and users at each threshold.
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  depends_on = [google_project_service.this]
}

# ---------------------------------------------------------------- HCP Terraform (Workload Identity Federation)

resource "google_iam_workload_identity_pool" "tfc" {
  count                     = var.enable_tfc ? 1 : 0
  workload_identity_pool_id = "hcp-terraform"
  display_name              = "HCP Terraform"
  depends_on                = [google_project_service.this]
}

resource "google_iam_workload_identity_pool_provider" "tfc" {
  count                              = var.enable_tfc ? 1 : 0
  workload_identity_pool_id          = google_iam_workload_identity_pool.tfc[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "app-terraform-io"
  display_name                       = "app.terraform.io"

  attribute_mapping = {
    "google.subject"                        = "assertion.sub"
    "attribute.aud"                         = "assertion.aud"
    "attribute.terraform_run_phase"         = "assertion.terraform_run_phase"
    "attribute.terraform_project_id"        = "assertion.terraform_project_id"
    "attribute.terraform_project_name"      = "assertion.terraform_project_name"
    "attribute.terraform_workspace_id"      = "assertion.terraform_workspace_id"
    "attribute.terraform_workspace_name"    = "assertion.terraform_workspace_name"
    "attribute.terraform_organization_id"   = "assertion.terraform_organization_id"
    "attribute.terraform_organization_name" = "assertion.terraform_organization_name"
    "attribute.terraform_run_id"            = "assertion.terraform_run_id"
    "attribute.terraform_full_workspace"    = "assertion.terraform_full_workspace"
  }

  # Only this organization / project / workspace can get tokens.
  attribute_condition = "assertion.sub.startsWith(\"organization:${var.tfc_organization}:project:${var.tfc_project}:workspace:${var.tfc_workspace}\")"

  oidc {
    issuer_uri = "https://app.terraform.io"
  }

  lifecycle {
    precondition {
      condition     = var.tfc_organization != ""
      error_message = "Set tfc_organization (or enable_tfc = false)."
    }
  }
}

resource "google_service_account" "terraform" {
  count        = var.enable_tfc ? 1 : 0
  account_id   = "fathom-terraform"
  display_name = "Fathom infra (HCP Terraform runs)"
}

resource "google_service_account_iam_member" "terraform_wif" {
  count              = var.enable_tfc ? 1 : 0
  service_account_id = google_service_account.terraform[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.tfc[0].name}/*"
}

# Secrets without read access: create containers, manage their IAM, add versions (the tunnel token).
# Not secretmanager.versions.access, so Terraform runs cannot read the Stellar keys.
resource "google_project_iam_custom_role" "secrets_manager" {
  count       = var.enable_tfc ? 1 : 0
  role_id     = "fathomSecretsManager"
  title       = "Fathom secrets manager (no value access)"
  description = "Create Secret Manager secrets, manage their IAM and add versions, without reading values."
  permissions = [
    "secretmanager.secrets.create",
    "secretmanager.secrets.delete",
    "secretmanager.secrets.get",
    "secretmanager.secrets.list",
    "secretmanager.secrets.update",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
    "secretmanager.versions.add",
    "secretmanager.versions.get",
    "secretmanager.versions.list",
    "secretmanager.versions.enable",
    "secretmanager.versions.disable",
    "secretmanager.versions.destroy",
  ]
}

# The minimum for infra/: VM, VPC + firewall, VM service account (create + attach), Artifact
# Registry repo + its IAM, the secrets role above, enabling the four APIs. No project IAM admin.
resource "google_project_iam_member" "terraform" {
  for_each = var.enable_tfc ? toset([
    "roles/compute.instanceAdmin.v1",
    "roles/compute.networkAdmin",
    "roles/compute.securityAdmin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountUser",
    "roles/artifactregistry.admin",
    "roles/serviceusage.serviceUsageAdmin",
  ]) : toset([])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.terraform[0].email}"
}

resource "google_project_iam_member" "terraform_secrets" {
  count   = var.enable_tfc ? 1 : 0
  project = var.project_id
  role    = google_project_iam_custom_role.secrets_manager[0].id
  member  = "serviceAccount:${google_service_account.terraform[0].email}"
}
