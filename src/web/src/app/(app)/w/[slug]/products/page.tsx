"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Loader2 } from "lucide-react";
import { useWorkspace } from "@/contexts/workspace-context";
import { getProductDashboard, createProduct } from "@/lib/api";
import type { ProductDashboardItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";
import { IssueStatus } from "@alook/shared";

const ISSUE_STATUS_BADGES: { status: string; label: string }[] = [
  { status: IssueStatus.TODO, label: "Todo" },
  { status: IssueStatus.IN_PROGRESS, label: "In Progress" },
  { status: IssueStatus.REVIEW, label: "Review" },
  { status: IssueStatus.DONE, label: "Done" },
];

export default function ProductsPage() {
  const router = useRouter();
  const { workspaceId, slug } = useWorkspace();

  const [products, setProducts] = useState<ProductDashboardItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProductDashboard(workspaceId);
      setProducts(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setCreating(true);
    try {
      await createProduct(workspaceId, { name: trimmedName, description: description.trim() });
      setDialogOpen(false);
      setName("");
      setDescription("");
      toast.success("Product created");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background/30">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-normal">Products</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              setName("");
              setDescription("");
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            New Product
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar p-4">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3 rounded-xl border border-border/50 bg-card p-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center animate-[fade-up_400ms_ease-out_both]">
            <Package className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No products</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 animate-[fade-up_200ms_ease-out_both] sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Card
                key={p.id}
                size="sm"
                className="cursor-pointer transition-colors duration-200 hover:bg-accent/50"
                onClick={() => router.push(`/w/${slug}/issues?product=${p.id}`)}
              >
                <CardHeader>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <CardTitle className="truncate">{p.name}</CardTitle>
                    <Badge variant={p.status === "active" ? "default" : "outline"} className="shrink-0">
                      {p.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {p.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {ISSUE_STATUS_BADGES.map(({ status, label }) => {
                      const count = p.issue_counts_by_status[status] ?? 0;
                      if (!count) return null;
                      return (
                        <Badge key={status} variant="secondary" className="text-[10px]">
                          {label}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {p.active_agent_count} active agent{p.active_agent_count === 1 ? "" : "s"}
                    </span>
                    <span>{p.last_activity_at ? relativeTime(p.last_activity_at) : "No activity"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Product</DialogTitle>
            <DialogDescription>Group issues under a product.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Name</Label>
              <Input
                id="product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-description">Description</Label>
              <Textarea
                id="product-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
