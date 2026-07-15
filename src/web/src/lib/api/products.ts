import type { Product } from "@alook/shared";
import { apiFetch, wsQuery } from "./client";

export type ProductDashboardItem = Product & {
  issue_counts_by_status: Record<string, number>;
  active_agent_count: number;
  last_activity_at: string | null;
};

export const listProducts = (workspaceId: string, status?: string) => {
  const extra: Record<string, string> = {};
  if (status) extra.status = status;
  return apiFetch<Product[]>(`/api/products${wsQuery(workspaceId, extra)}`);
};

export const getProductDashboard = (workspaceId: string) =>
  apiFetch<ProductDashboardItem[]>(`/api/products/dashboard${wsQuery(workspaceId)}`);

export const createProduct = (workspaceId: string, req: { name: string; description?: string }) =>
  apiFetch<Product>(`/api/products${wsQuery(workspaceId)}`, {
    method: "POST",
    body: JSON.stringify({ name: req.name, description: req.description }),
  });

export const getProduct = (workspaceId: string, productId: string) =>
  apiFetch<Product>(`/api/products/${productId}${wsQuery(workspaceId)}`);

export const updateProduct = (
  workspaceId: string,
  productId: string,
  patch: { name?: string; description?: string; status?: string }
) =>
  apiFetch<Product>(`/api/products/${productId}${wsQuery(workspaceId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
