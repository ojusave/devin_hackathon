variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr_block" {
  description = "The CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "A list of CIDR blocks for public subnets."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "A list of CIDR blocks for private subnets."
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "eks_cluster_name" {
  description = "The name of the EKS cluster."
  type        = string
  default     = "production-eks-cluster"
}

variable "eks_node_group_name" {
  description = "The name of the EKS node group."
  type        = string
  default     = "production-node-group"
}

variable "ec2_instance_type" {
  description = "The instance type for the EC2 instances."
  type        = string
  default     = "t3.medium"
}

variable "ec2_ami_id" {
  description = "The AMI ID for the EC2 instances."
  type        = string
  default     = "ami-0c55b159cbfafe1f0" # Amazon Linux 2 AMI for us-east-1
}

variable "elasticache_cluster_id" {
  description = "The ID of the ElastiCache cluster."
  type        = string
  default     = "production-redis-cluster"
}

variable "elasticache_node_type" {
  description = "The node type for the ElastiCache cluster."
  type        = string
  default     = "cache.t3.small"
}