resource "aws_eks_cluster" "main" {
  name     = var.eks_cluster_name
  role_arn = aws_iam_role.eks_cluster_role.arn

  vpc_config {
    subnet_ids = concat(aws_subnet.public.*.id, aws_subnet.private.*.id)
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
  ]

  tags = {
    Name = "main-eks-cluster"
  }
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = var.eks_node_group_name
  node_role_arn   = aws_iam_role.eks_node_role.arn
  subnet_ids      = aws_subnet.private.*.id

  instance_types = [var.ec2_instance_type]
  
  scaling_config {
    desired_size = 2
    max_size     = 3
    min_size     = 1
  }

  update_config {
    max_unavailable = 1
  }
  
  // Example of specifying resources.
  // Note: For actual memory/cpu limits, you would configure this within your Kubernetes deployments/pods specs.
  // This is a simplified representation.
  // In a real terraform setup, you might use a kubernetes_deployment resource
  // and set resources there.
  launch_template {
    name = "eks-launch-template"
    
    // Instance metadata options
    metadata_options {
      http_tokens = "required"
      http_put_response_hop_limit = 2
    }
  }

  // Example of how you might think about CPU/Memory at this level.
  // The actual enforcement is at the k8s level.
  // For t3.medium, we have 2 vCPUs and 4 GiB memory.
  // We can tag the node group to indicate its intended resource profile.
  tags = {
    Name = "main-node-group"
    "k8s.io/cluster-autoscaler/enabled" = "true"
    "k8s.io/cluster-autoscaler/${var.eks_cluster_name}" = "owned"
    "resource.cpu" = "2"
    "resource.memory_gb" = "4"
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.ec2_container_registry_read_only,
  ]
}