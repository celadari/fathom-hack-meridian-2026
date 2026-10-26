variable "project_id" {
  description = "Google Cloud project that hosts the demo server."
  type        = string
}

variable "billing_account_id" {
  description = "Billing account of the project (for the $5 budget alert), e.g. 012345-6789AB-CDEF01."
  type        = string
}

variable "budget_amount" {
  description = "Monthly budget alert, in the billing account's currency."
  type        = number
  default     = 5
}

variable "enable_tfc" {
  description = "Create the Workload Identity Federation pool and the Terraform service account for HCP Terraform."
  type        = bool
  default     = true
}

variable "tfc_organization" {
  description = "HCP Terraform organization allowed to impersonate the Terraform service account."
  type        = string
  default     = "Hackathon_Meridian_2026"
}

variable "tfc_project" {
  description = "HCP Terraform project of the workspace."
  type        = string
  default     = "Default Project"
}

variable "tfc_workspace" {
  description = "HCP Terraform workspace allowed to impersonate the Terraform service account."
  type        = string
  default     = "fathom-infra"
}
