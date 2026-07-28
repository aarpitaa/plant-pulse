/**
 * PlantPulse — GCP GKE + Cloud SQL (PostgreSQL) + Pub/Sub (Kafka bridge)
 * Target: DR / secondary region in us-central1
 */

terraform {
  required_version = ">= 1.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.25"
    }
  }

  backend "gcs" {
    bucket = "plantpulse-tfstate-gcp"
    prefix = "prod/terraform.tfstate"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─── GKE Autopilot cluster ────────────────────────────────────────────────────

resource "google_container_cluster" "plantpulse" {
  name     = "plantpulse-${var.environment}"
  location = var.region

  enable_autopilot = true

  release_channel {
    channel = "REGULAR"
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  ip_allocation_policy {}
}

# ─── Cloud SQL PostgreSQL ─────────────────────────────────────────────────────

resource "google_sql_database_instance" "plantpulse" {
  name             = "plantpulse-${var.environment}"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier = "db-custom-4-15360"

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      backup_retention_settings {
        retained_backups = 7
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.plantpulse.id
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "plantpulse" {
  name     = "plantpulse"
  instance = google_sql_database_instance.plantpulse.name
}

# ─── VPC Network ──────────────────────────────────────────────────────────────

resource "google_compute_network" "plantpulse" {
  name                    = "plantpulse-${var.environment}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "gke" {
  name          = "plantpulse-gke"
  ip_cidr_range = "10.1.0.0/20"
  region        = var.region
  network       = google_compute_network.plantpulse.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.2.0.0/16"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.3.0.0/20"
  }
}

# ─── Outputs ──────────────────────────────────────────────────────────────────

output "cluster_endpoint" {
  value     = google_container_cluster.plantpulse.endpoint
  sensitive = true
}

output "postgres_connection_name" {
  value = google_sql_database_instance.plantpulse.connection_name
}
