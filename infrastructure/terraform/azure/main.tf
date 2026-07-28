/**
 * PlantPulse — Azure AKS + PostgreSQL + Event Hubs (Kafka-compatible)
 * Target: production cluster in East US
 */

terraform {
  required_version = ">= 1.7"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.95"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.28"
    }
  }

  backend "azurerm" {
    resource_group_name  = "plantpulse-tfstate"
    storage_account_name = "plantpulsetfstate"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

# ─── Resource group ────────────────────────────────────────────────────────────

resource "azurerm_resource_group" "plantpulse" {
  name     = "rg-plantpulse-${var.environment}"
  location = var.location
  tags     = local.tags
}

# ─── AKS Cluster ──────────────────────────────────────────────────────────────

resource "azurerm_kubernetes_cluster" "plantpulse" {
  name                = "aks-plantpulse-${var.environment}"
  location            = azurerm_resource_group.plantpulse.location
  resource_group_name = azurerm_resource_group.plantpulse.name
  dns_prefix          = "plantpulse-${var.environment}"
  kubernetes_version  = var.kubernetes_version

  default_node_pool {
    name                = "system"
    node_count          = 3
    vm_size             = "Standard_D4s_v4"
    os_disk_size_gb     = 128
    type                = "VirtualMachineScaleSets"
    enable_auto_scaling = true
    min_count           = 3
    max_count           = 10
  }

  identity {
    type = "SystemAssigned"
  }

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.plantpulse.id
  }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
  }

  tags = local.tags
}

# ─── Worker node pool ─────────────────────────────────────────────────────────

resource "azurerm_kubernetes_cluster_node_pool" "workers" {
  name                  = "workers"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.plantpulse.id
  vm_size               = "Standard_D8s_v4"
  node_count            = 3
  enable_auto_scaling   = true
  min_count             = 3
  max_count             = 20
  node_labels = {
    "plantpulse/workload" = "telemetry"
  }
  node_taints = []
  tags        = local.tags
}

# ─── Azure Database for PostgreSQL ────────────────────────────────────────────

resource "azurerm_postgresql_flexible_server" "plantpulse" {
  name                   = "psql-plantpulse-${var.environment}"
  resource_group_name    = azurerm_resource_group.plantpulse.name
  location               = azurerm_resource_group.plantpulse.location
  version                = "16"
  administrator_login    = var.postgres_admin
  administrator_password = var.postgres_password
  zone                   = "1"

  storage_mb   = 131072 # 128 GiB
  storage_tier = "P30"
  sku_name     = "GP_Standard_D4s_v3"

  backup_retention_days        = 7
  geo_redundant_backup_enabled = true

  tags = local.tags
}

resource "azurerm_postgresql_flexible_server_database" "plantpulse" {
  name      = "plantpulse"
  server_id = azurerm_postgresql_flexible_server.plantpulse.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

# ─── Event Hubs (Kafka-compatible) ────────────────────────────────────────────

resource "azurerm_eventhub_namespace" "plantpulse" {
  name                = "evhns-plantpulse-${var.environment}"
  location            = azurerm_resource_group.plantpulse.location
  resource_group_name = azurerm_resource_group.plantpulse.name
  sku                 = "Standard"
  capacity            = 4
  kafka_enabled       = true
  tags                = local.tags
}

locals {
  kafka_topics = ["telemetry.raw", "telemetry.valid", "telemetry.dlq", "incidents.detected"]
}

resource "azurerm_eventhub" "topics" {
  for_each            = toset(local.kafka_topics)
  name                = replace(each.key, ".", "-")
  namespace_name      = azurerm_eventhub_namespace.plantpulse.name
  resource_group_name = azurerm_resource_group.plantpulse.name
  partition_count     = 6
  message_retention   = 7
}

# ─── Log Analytics ────────────────────────────────────────────────────────────

resource "azurerm_log_analytics_workspace" "plantpulse" {
  name                = "log-plantpulse-${var.environment}"
  location            = azurerm_resource_group.plantpulse.location
  resource_group_name = azurerm_resource_group.plantpulse.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

# ─── Locals ───────────────────────────────────────────────────────────────────

locals {
  tags = {
    Project     = "plantpulse"
    Environment = var.environment
    ManagedBy   = "terraform"
    Team        = "sre"
  }
}

# ─── Outputs ──────────────────────────────────────────────────────────────────

output "aks_kube_config" {
  value     = azurerm_kubernetes_cluster.plantpulse.kube_config_raw
  sensitive = true
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.plantpulse.fqdn
}

output "eventhubs_connection_string" {
  value     = azurerm_eventhub_namespace.plantpulse.default_primary_connection_string
  sensitive = true
}
